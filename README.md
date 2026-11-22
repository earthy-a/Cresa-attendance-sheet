# CRE Attendance Portal

Attendance site for the **Software Development Unit, Department of Computer & Robotics Education**.

- Create an account or log in with **full name + registration number** (e.g. `24/VL/CR/121`)
- Mark yourself present for today, remove it later, edit your name anytime
- Live attendance sheet with search, **CSV export** and **print**
- Pre-loaded with the 11 students who gave their names on 22 Nov 2026
- Animated, modern UI (pure HTML/CSS/JS, no build step)

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page structure |
| `style.css` | Styling and animations |
| `app.js` | Logic (login, sheet, storage) |
| `config.js` | Firebase settings (optional, see below) |

## 1. Put it on GitHub Pages

1. Create a new repository on GitHub (e.g. `cre-attendance`), set to **Public**.
2. Upload all files from this folder to the repo root (**Add file → Upload files**).
3. Go to **Settings → Pages**. Under *Build and deployment* choose **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
4. After about a minute your site is live at `https://YOUR-USERNAME.github.io/cre-attendance/`.

To change the site later, edit the files on GitHub (pencil icon) and commit; the site updates automatically.

## 2. Make attendance shared (so everyone sees the same sheet)

GitHub Pages only hosts static files, so without this step the site runs in **demo mode** and data is saved only in each person's own browser. For a shared sheet, use a free Firebase database:

1. Go to <https://console.firebase.google.com> → **Add project** (skip Analytics).
2. In the project: **Build → Firestore Database → Create database** (production mode, pick any region).
3. Open the **Rules** tab and paste this, then **Publish**:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{db}/documents {
       match /{document=**} { allow read, write: if true; }
     }
   }
   ```
4. **Project settings (gear icon) → General → Your apps → Web (`</>`)**, register an app, and copy the `firebaseConfig` values.
5. Paste them into `config.js`, commit, and wait for GitHub Pages to redeploy.

The first person to open the site seeds the 11 starting students automatically.

## Good to know

- Login checks name + reg number only (no password), which keeps it simple. The rules above also let anyone with the link edit the data, so share the link only within your class. If you later need stricter control, add Firebase Authentication and tighten the rules.
- Only **today's** session can be marked. Use the date picker to view past sessions.
