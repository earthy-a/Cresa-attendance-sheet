(() => {
"use strict";

/* ================= data ================= */
const SEED_DATE = "2026-11-22";
const SEED = [
  ["Peter, Emediong Etop", "24/VL/CR/121"],
  ["Enebia Excellent", "24/VL/CR/165"],
  ["Wisdom Wopara", "24/VL/CR/157"],
  ["Inyang Possible Peter", "24/VL/CR/116"],
  ["Ndifreke Michael Peter", "24/VL/CR/184"],
  ["Moses, Oto-Obong Uduak", "24/VL/CR/114"],
  ["Sam, God'swill Godwin", "24/VL/CR/177"],
  ["Agbro Prosper Okiemute", "24/VL/CR/167"],
  ["Abasifreke Eyo Inyang", "24/VL/CR/187"],
  ["Gideon Edet Okon", "24/VL/CR/193"],
  ["Ekarika Comfort Etim", "22/VL/CR/095"]
];

/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const keyOf = reg => reg.toLowerCase().replace(/\//g, "-");
const cleanReg = v => v.replace(/\s+/g, "").toUpperCase();
const REG_RE = /^\d{2}\/[A-Z]{2}\/[A-Z]{2}\/\d{3}$/;
const tokens = n => n.toLowerCase().replace(/['’`.\-]/g, "").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
function sameName(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.length || !B.length) return false;
  const [s, l] = A.length <= B.length ? [A, B] : [B, A];
  return s.length >= Math.min(2, l.length) && s.every(t => l.includes(t));
}
const todayStr = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};
const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—";
const fmtDate = ds => new Date(ds + "T00:00:00").toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" });
const sortName = (a, b) => a.name.localeCompare(b.name);

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ================= storage adapters ================= */
// Both adapters expose: mode, subscribe(cb), addUser, renameUser, setPresent
// cb receives { users: {key:{name,reg}}, attendance: {date:{key:{time}}} }

function localStore() {
  const K = "cre_attendance_v1";
  let data;
  try { data = JSON.parse(localStorage.getItem(K)); } catch { data = null; }
  const save = () => localStorage.setItem(K, JSON.stringify(data));
  if (!data) {
    data = { users: {}, attendance: {} };
    SEED.forEach(([name, reg]) => {
      const k = keyOf(reg);
      data.users[k] = { name, reg };
      (data.attendance[SEED_DATE] = data.attendance[SEED_DATE] || {})[k] = { time: null };
    });
    save();
  }
  let cb = () => {};
  const push = () => cb(JSON.parse(JSON.stringify(data)));
  window.addEventListener("storage", e => {
    if (e.key === K) { try { data = JSON.parse(e.newValue); push(); } catch {} }
  });
  return {
    mode: "local",
    subscribe(fn) { cb = fn; push(); },
    async addUser(u) { data.users[keyOf(u.reg)] = { name: u.name, reg: u.reg }; save(); push(); },
    async renameUser(k, name) { data.users[k].name = name; save(); push(); },
    async setPresent(date, k, on) {
      data.attendance[date] = data.attendance[date] || {};
      if (on) data.attendance[date][k] = { time: new Date().toISOString() };
      else delete data.attendance[date][k];
      save(); push();
    }
  };
}

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = () => rej(new Error("Failed to load " + src));
    document.head.appendChild(s);
  });
}

async function firebaseStore(cfg) {
  const base = "https://www.gstatic.com/firebasejs/10.12.2/";
  await loadScript(base + "firebase-app-compat.js");
  await loadScript(base + "firebase-firestore-compat.js");
  firebase.initializeApp(cfg);
  const db = firebase.firestore();
  let users = {}, attendance = {}, gotUsers = false, gotAtt = false, cb = () => {};
  const push = () => { if (gotUsers && gotAtt) cb({ users, attendance }); };

  async function seedIfEmpty(snap) {
    if (!snap.empty || sessionStorage.getItem("cre_seeded")) return;
    sessionStorage.setItem("cre_seeded", "1");
    const batch = db.batch();
    SEED.forEach(([name, reg]) => {
      const k = keyOf(reg);
      batch.set(db.collection("users").doc(k), { name, reg });
      batch.set(db.collection("attendance").doc(SEED_DATE + "_" + k), { date: SEED_DATE, key: k, time: null });
    });
    await batch.commit();
  }

  return {
    mode: "firebase",
    subscribe(fn) {
      cb = fn;
      db.collection("users").onSnapshot(snap => {
        users = {}; snap.forEach(d => users[d.id] = d.data());
        gotUsers = true; push(); seedIfEmpty(snap).catch(console.error);
      }, err => { console.error(err); toast("Database error — check Firestore rules."); });
      db.collection("attendance").onSnapshot(snap => {
        attendance = {};
        snap.forEach(d => { const v = d.data(); (attendance[v.date] = attendance[v.date] || {})[v.key] = { time: v.time || null }; });
        gotAtt = true; push();
      }, err => console.error(err));
    },
    addUser: u => db.collection("users").doc(keyOf(u.reg)).set({ name: u.name, reg: u.reg }),
    renameUser: (k, name) => db.collection("users").doc(k).update({ name }),
    setPresent(date, k, on) {
      const ref = db.collection("attendance").doc(date + "_" + k);
      return on ? ref.set({ date, key: k, time: new Date().toISOString() }) : ref.delete();
    }
  };
}

/* ================= app state ================= */
const state = { store: null, users: {}, attendance: {}, me: null, date: todayStr(), query: "", ready: false };
const SESSION_KEY = "cre_session";

/* ================= auth ================= */
function showAuthTab(login) {
  $("#tabLogin").classList.toggle("active", login);
  $("#tabSignup").classList.toggle("active", !login);
  $("#loginForm").hidden = !login;
  $("#signupForm").hidden = login;
  setMsg("");
}
function setMsg(text, ok) {
  const m = $("#authMsg"); m.textContent = text; m.classList.toggle("ok", !!ok);
}

function handleLogin(e) {
  e.preventDefault();
  if (!state.ready) return setMsg("Still connecting… try again in a second.");
  const name = $("#loginName").value.trim();
  const reg = cleanReg($("#loginReg").value);
  const user = state.users[keyOf(reg)];
  if (!user) return setMsg("No account with that registration number. Create one first.");
  if (!sameName(name, user.name)) return setMsg("That name doesn't match this registration number.");
  signIn(keyOf(reg));
}

async function handleSignup(e) {
  e.preventDefault();
  if (!state.ready) return setMsg("Still connecting… try again in a second.");
  const name = $("#signupName").value.trim().replace(/\s+/g, " ");
  const reg = cleanReg($("#signupReg").value);
  if (tokens(name).length < 2) return setMsg("Please enter your full name (at least two names).");
  if (!REG_RE.test(reg)) return setMsg("Registration number should look like 24/VL/CR/121.");
  const k = keyOf(reg);
  if (state.users[k]) return setMsg("That registration number already has an account. Log in instead.");
  try {
    await state.store.addUser({ name, reg });
    state.users[k] = { name, reg };
    toast("Account created. Welcome!");
    signIn(k);
  } catch (err) { console.error(err); setMsg("Couldn't save your account. Try again."); }
}

function signIn(k) {
  state.me = k;
  try { localStorage.setItem(SESSION_KEY, k); } catch {}
  $("#loginForm").reset(); $("#signupForm").reset(); setMsg("");
  render();
}
function signOut() {
  state.me = null;
  try { localStorage.removeItem(SESSION_KEY); } catch {}
  render();
}

/* ================= render ================= */
function render() {
  const user = state.me && state.users[state.me];
  if (state.me && state.ready && !user) { state.me = null; }
  $("#authView").hidden = !!user;
  $("#dashView").hidden = !user;
  if (!user) return;

  const first = user.name.includes(",") ? user.name.split(",")[1].trim().split(" ")[0] : user.name.split(" ")[0];
  $("#userName").textContent = user.name;
  $("#userReg").textContent = user.reg;
  $("#avatar").textContent = (first[0] || "?").toUpperCase();
  $("#greeting").textContent = "Hello, " + first + " 👋";

  const isToday = state.date === todayStr();
  const sess = state.attendance[state.date] || {};
  const mine = !!sess[state.me];
  const btn = $("#markBtn");
  btn.disabled = !isToday;
  btn.classList.toggle("on", mine && isToday);
  btn.textContent = !isToday ? "Past session (view only)" : mine ? "Remove my attendance" : "Mark me present";

  const all = Object.entries(state.users).map(([key, u]) => ({ key, ...u })).sort(sortName);
  const presentCount = all.filter(u => sess[u.key]).length;
  $("#statPresent").textContent = presentCount;
  $("#statTotal").textContent = all.length;
  $("#statRate").textContent = all.length ? Math.round(presentCount / all.length * 100) + "%" : "0%";
  $("#sheetDate").textContent = fmtDate(state.date);

  const q = state.query.trim().toLowerCase();
  const list = all.filter(u => !q || u.name.toLowerCase().includes(q) || u.reg.toLowerCase().includes(q));
  $("#rows").innerHTML = list.map((u, i) => {
    const on = sess[u.key];
    return `<tr class="${u.key === state.me ? "me" : ""}" style="animation-delay:${Math.min(i, 20) * 25}ms">
      <td>${all.indexOf(u) + 1}</td>
      <td>${esc(u.name)}${u.key === state.me ? " <span class='muted'>(you)</span>" : ""}</td>
      <td class="reg-c">${esc(u.reg)}</td>
      <td><span class="pill ${on ? "p" : "a"}">${on ? "Present" : "Absent"}</span></td>
      <td class="muted">${on ? fmtTime(on.time) : "—"}</td></tr>`;
  }).join("");
  $("#empty").hidden = list.length > 0;
}

async function toggleMine() {
  const on = !(state.attendance[state.date] || {})[state.me];
  try {
    await state.store.setPresent(state.date, state.me, on);
    toast(on ? "You're marked present ✅" : "Attendance removed");
  } catch (err) { console.error(err); toast("Couldn't save. Check your connection."); }
}

function exportCSV() {
  const sess = state.attendance[state.date] || {};
  const rows = Object.entries(state.users).map(([key, u]) => ({ key, ...u })).sort(sortName);
  const lines = [["S/N", "Name", "Reg No", "Status", "Time"]].concat(rows.map((u, i) =>
    [i + 1, u.name, u.reg, sess[u.key] ? "Present" : "Absent", sess[u.key] ? fmtTime(sess[u.key].time) : ""]));
  const csv = lines.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "attendance-" + state.date + ".csv";
  a.click(); URL.revokeObjectURL(a.href);
}

/* ================= background animation ================= */
function startBackground() {
  const c = $("#bg"), ctx = c.getContext("2d");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let w, h, pts = [], mouse = { x: -999, y: -999 };
  const glyphs = ["{ }", "</>", "01", "=>", "()", "[]", "&&", "fn", "#"];
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = c.width = innerWidth * dpr; h = c.height = innerHeight * dpr;
    c.style.width = innerWidth + "px"; c.style.height = innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    w = innerWidth; h = innerHeight;
    const n = Math.round(Math.min(90, w * h / 16000));
    pts = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35,
      g: Math.random() < .22 ? glyphs[Math.floor(Math.random() * glyphs.length)] : null
    }));
  }
  addEventListener("resize", resize);
  addEventListener("pointermove", e => { mouse.x = e.clientX; mouse.y = e.clientY; });
  resize();
  (function tick() {
    ctx.clearRect(0, 0, w, h);
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      const dx = p.x - mouse.x, dy = p.y - mouse.y, d = Math.hypot(dx, dy);
      if (d < 120) { p.x += dx / d * 1.2; p.y += dy / d * 1.2; }
      if (p.g) {
        ctx.font = "12px JetBrains Mono, monospace";
        ctx.fillStyle = "rgba(163,230,53,.35)"; ctx.fillText(p.g, p.x, p.y);
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.6, 0, 7);
        ctx.fillStyle = "rgba(34,211,238,.7)"; ctx.fill();
      }
    }
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < 130) {
        ctx.strokeStyle = `rgba(139,92,246,${(1 - d / 130) * .35})`;
        ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    requestAnimationFrame(tick);
  })();
}

/* ================= boot ================= */
async function boot() {
  startBackground();

  $("#tabLogin").onclick = () => showAuthTab(true);
  $("#tabSignup").onclick = () => showAuthTab(false);
  $("#loginForm").addEventListener("submit", handleLogin);
  $("#signupForm").addEventListener("submit", handleSignup);
  document.querySelectorAll("input.reg").forEach(i => i.addEventListener("input", () => {
    const pos = i.selectionStart; i.value = i.value.toUpperCase(); i.setSelectionRange(pos, pos);
  }));
  $("#logoutBtn").onclick = signOut;
  $("#markBtn").onclick = toggleMine;
  $("#exportBtn").onclick = exportCSV;
  $("#printBtn").onclick = () => print();
  $("#search").addEventListener("input", e => { state.query = e.target.value; render(); });
  const di = $("#dateInput");
  di.value = state.date; di.max = todayStr();
  di.addEventListener("change", () => { state.date = di.value || todayStr(); render(); });

  $("#editBtn").onclick = () => { $("#editName").value = state.users[state.me].name; $("#editDlg").showModal(); };
  $("#editForm").addEventListener("submit", async e => {
    const action = e.submitter && e.submitter.value;
    if (action !== "save") return;
    const name = $("#editName").value.trim().replace(/\s+/g, " ");
    if (tokens(name).length < 2) { e.preventDefault(); toast("Enter your full name."); return; }
    try { await state.store.renameUser(state.me, name); toast("Details updated ✏️"); }
    catch (err) { console.error(err); toast("Couldn't update. Try again."); }
  });

  // pick storage
  const cfg = window.FIREBASE_CONFIG;
  const configured = cfg && cfg.apiKey && !/^PASTE/.test(cfg.apiKey);
  try {
    state.store = configured ? await firebaseStore(cfg) : localStore();
  } catch (err) {
    console.error(err);
    state.store = localStore();
  }
  if (state.store.mode === "local") {
    const b = $("#modeBanner");
    b.hidden = false;
    b.textContent = "Demo mode: data is saved only on this device. Connect Firebase in config.js to share the sheet with everyone.";
  }
  state.store.subscribe(data => {
    state.users = data.users || {};
    state.attendance = data.attendance || {};
    if (!state.ready) {
      state.ready = true;
      let saved = null;
      try { saved = localStorage.getItem(SESSION_KEY); } catch {}
      if (saved && state.users[saved]) state.me = saved;
    }
    render();
  });
}

boot();
})();
