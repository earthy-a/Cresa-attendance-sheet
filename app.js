(() => {
"use strict";

/* ================= data ================= */
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
const sortName = (a, b) => a.name.localeCompare(b.name);

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

/* ================= storage adapters ================= */
// Both adapters expose: mode, subscribe(cb), addUser, renameUser
// cb receives { users: {key:{name,reg}} }

function localStore() {
  const K = "cre_students_v1";
  let data;
  try { data = JSON.parse(localStorage.getItem(K)); } catch { data = null; }
  const save = () => localStorage.setItem(K, JSON.stringify(data));
  if (!data) {
    data = { users: {} };
    SEED.forEach(([name, reg]) => { data.users[keyOf(reg)] = { name, reg }; });
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
    async renameUser(k, name) { data.users[k].name = name; save(); push(); }
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
  let cb = () => {};

  async function seedIfEmpty(snap) {
    if (!snap.empty || sessionStorage.getItem("cre_seeded")) return;
    sessionStorage.setItem("cre_seeded", "1");
    const batch = db.batch();
    SEED.forEach(([name, reg]) => batch.set(db.collection("users").doc(keyOf(reg)), { name, reg }));
    await batch.commit();
  }

  return {
    mode: "firebase",
    subscribe(fn) {
      cb = fn;
      db.collection("users").onSnapshot(snap => {
        const users = {}; snap.forEach(d => users[d.id] = d.data());
        cb({ users }); seedIfEmpty(snap).catch(console.error);
      }, err => { console.error(err); toast("Database error — check Firestore rules."); });
    },
    addUser: u => db.collection("users").doc(keyOf(u.reg)).set({ name: u.name, reg: u.reg }),
    renameUser: (k, name) => db.collection("users").doc(k).update({ name })
  };
}

/* ================= app state ================= */
const state = { store: null, users: {}, me: null, query: "", ready: false };
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

  $("#userName").textContent = user.name;
  $("#userReg").textContent = user.reg;
  $("#avatar").textContent = (user.name.replace(/[^A-Za-z]/g, "")[0] || "?").toUpperCase();

  const all = Object.entries(state.users).map(([key, u]) => ({ key, ...u })).sort(sortName);
  $("#countLine").textContent = all.length + (all.length === 1 ? " student" : " students");

  const q = state.query.trim().toLowerCase();
  const list = all.filter(u => !q || u.name.toLowerCase().includes(q) || u.reg.toLowerCase().includes(q));
  $("#rows").innerHTML = list.map((u, i) =>
    `<tr class="${u.key === state.me ? "me" : ""}" style="animation-delay:${Math.min(i, 20) * 25}ms">
      <td>${esc(u.name)}${u.key === state.me ? " <span class='muted'>(you)</span>" : ""}</td>
      <td class="reg-c">${esc(u.reg)}</td></tr>`).join("");
  $("#empty").hidden = list.length > 0;
}

function exportCSV() {
  const rows = Object.values(state.users).sort(sortName);
  const lines = [["Name", "Reg No"]].concat(rows.map(u => [u.name, u.reg]));
  const csv = lines.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "students.csv";
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
    c.width = innerWidth * dpr; c.height = innerHeight * dpr;
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
  $("#exportBtn").onclick = exportCSV;
  $("#printBtn").onclick = () => print();
  $("#search").addEventListener("input", e => { state.query = e.target.value; render(); });

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
    b.textContent = "Demo mode: data is saved only on this device. Connect Firebase in config.js to share the list with everyone.";
  }
  state.store.subscribe(data => {
    state.users = data.users || {};
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
