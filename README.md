# Construction Safety League — standalone build

This is the same game as the Claude artifact, packaged as a normal React
app you host yourself on **GitHub Pages**. Because GitHub Pages only serves
static files (no server), the multi-device sync that used to run on Claude's
`window.storage` now runs on **Firebase Realtime Database** (free tier),
which any static site can talk to directly from the browser.

- **Shared data** (game state, questions, the player list) → Firebase.
- **"Which player am I on this phone"** → this browser's `localStorage`,
  same as before.

## 1. Create a free Firebase project (~5 minutes)

1. Go to https://console.firebase.google.com and click **Add project**.
   Name it anything (e.g. `safety-league`). You can skip Google Analytics.
2. Once inside the project, in the left sidebar go to **Build → Realtime
   Database → Create Database**. Pick any region. Start it in **test mode**
   (we'll set proper rules in step 4).
3. Still in the left sidebar, click the **gear icon → Project settings**.
   Under "Your apps", click the **</> (web)** icon to register a web app
   (any nickname). It will show you a `firebaseConfig` object.
4. Copy that object into `src/firebaseConfig.js` in this project, replacing
   the placeholder values.

## 2. Set database rules

In the Firebase console, go to **Realtime Database → Rules**, paste in the
contents of `rules.json` from this repo, and click **Publish**.

> ⚠️ Those rules make the database fully public (anyone with your Firebase
> URL can read/write it) — fine for a single internal event where the only
> "secret" is your game's join code, but don't reuse this project for
> anything sensitive. If you want it locked down after the event, just set
> `.write` back to `false` in the console.

## 3. Push this project to GitHub

```bash
cd csl-webapp
git init
git add .
git commit -m "Construction Safety League"
gh repo create your-username/construction-safety-league --public --source=. --push
```

(No `gh` CLI? Create an empty repo on github.com instead, then:)

```bash
git remote add origin https://github.com/your-username/construction-safety-league.git
git branch -M main
git push -u origin main
```

## 4. Turn on GitHub Pages

1. On GitHub, open your repo → **Settings → Pages**.
2. Under "Build and deployment", set **Source** to **GitHub Actions**.
3. Push to `main` (or re-run the workflow from the **Actions** tab). The
   included workflow (`.github/workflows/deploy.yml`) builds the app with
   Vite and publishes it automatically.
4. After it finishes, your site is live at
   `https://your-username.github.io/construction-safety-league/`.

Every future `git push` to `main` redeploys automatically.

## 5. How players enter

The Admin/TV QR code contains the deployed GitHub Pages website URL and opens
the player screen. It does not contain or automatically approve the game
code. Every player must enter the six-digit code shown on the TV, or use the
in-app **Scan QR** button and then press **ENTER GAME**. The code is checked
against the active game in Firebase before the name form is shown.

This means the QR link can be shared safely during an event while the game
code still controls access to the active session.

## 6. Run it

Open the deployed URL on:
- **Your laptop** → pick **Admin control panel** (PIN `1234` — change this
  in `src/App.jsx` before a real event) → **Create Game**.
- **The TV/projector** → same URL → **TV / projector display**.
- **Each player's phone** → same URL → **I'm a player** → scan the QR code
  or type the 6-digit code shown on the TV.

Everyone must open the *same deployed URL* — that's what makes them share
one Firebase database and therefore one game.

## Local development

```bash
npm install
npm run dev
```

This runs the game locally (still talking to your real Firebase project,
so it's genuinely multi-device even in dev — open the printed URL on your
phone too, as long as it's on the same network as... actually no network
requirement at all, since Firebase is the shared backend, not your laptop).

## Question videos

In Admin, use **Add a custom question** and paste a video URL in **Video link**.
YouTube links are embedded automatically; direct HTTPS `.mp4` or `.webm` links
play in the built-in video player. The video appears on both the TV display and
player phone for that question.

## Leaderboard celebration media

In Admin, use **Leaderboard fun media** to paste a public `.gif`, image, YouTube,
MP4, or WebM URL. It appears above the live race leaderboard on the TV display.
Use a short looping celebration GIF for the most playful result. The URL must
be publicly reachable by every browser; private cloud-drive links will not play.

The same panel also has separate slots for **1st place**, **2nd place**,
**3rd place**, and **Last place**. These appear in the right-side Celebration
Zone during the individual leaderboard.

## Notes and limits

- Scoring is client-trusted, same as the original artifact — fine for a fun
  team event, not for anything with real stakes riding on it.
- Firebase's free "Spark" plan comfortably covers a single live event; you'd
  only need to upgrade for very heavy, sustained traffic.
- Hazard-round photos are stored as base64 strings directly in the database.
  Fine for a handful of reasonably sized images; don't upload dozens of
  large, high-resolution photos.
- The admin PIN starts as `1234` for the first unlock. After entering Admin,
   use **Admin security → Reset PIN** to set a 4–8 digit PIN. The replacement
   PIN is stored in that browser's local storage, so reset it on the admin
   device that will run the event.
