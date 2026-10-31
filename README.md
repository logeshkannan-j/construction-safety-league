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

> ⚠️ **Publish these rules, and re-publish them if you had an older set.**
>
> **If the app shows "The database is refusing this app", this is the fix.** Firebase
> databases started in **test mode** only grant access until a fixed date, then lock
> everything: every read and write fails with *Permission denied*, so the admin panel
> shows "No active game", the TV shows nothing and nobody can join. Your data is
> untouched — it is just invisible until the rules are replaced. Paste `rules.json`
> here, press **Publish**, and reload the page.
>
> `rules.json` was also rewritten when the 3D Gaming Arena was added. The quiz paths
> (`game`, `questions`, `players`, `misc`) keep exactly the access they had, but the
> Arena's own paths are now validated, and **Arena scores will not save until the new
> rules are published.**

> The database is still world-readable, and the quiz paths are still
> world-writable — fine for an internal event where the only "secret" is the
> join code, but don't reuse this project for anything sensitive. See
> [ARENA.md](ARENA.md) section 4 for exactly where the security boundary sits
> and a step-by-step way to tighten it with Firebase Anonymous Auth.

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

## One event, one plan

A participant enters the game code, submits their details **once**, and plays five
rounds. Each round is a 3D mission, then three quiz questions, then one Safety
Millionaire question:

```
ROUND 1   a 3D mission  →  3 × quiz  →  1 × millionaire
ROUND 2   a 3D mission  →  3 × quiz  →  1 × millionaire
ROUND 3   a 3D mission  →  3 × quiz  →  1 × millionaire
ROUND 4   a 3D mission  →  3 × quiz  →  1 × millionaire
ROUND 5   a 3D mission  →  3 × quiz  →  1 × millionaire
                          ──────────────────────────
               5 missions + 15 quiz + 5 finale = 25 items
```

**The 3D missions and the questions are ONE list.** In Admin → **Event plan** you see
every row of it — a `3D` row, then its quiz rows, then its finale row — and you can
drag to reorder, edit any question, delete rows, or press **Reshuffle** to deal a new
plan. A `3D` row starts a new round, so moving one re-rounds the event.

Everybody plays that same list. The only thing that differs per participant is the
order of the four options inside each question, which is dealt when they join and
survives a refresh.

**You choose how many quiz questions a round holds** — 1, 2, 3 or 4 — in Admin →
**The event plan**; press *Reshuffle* to deal a plan in that shape.

**Everybody plays all five missions, but not in the same order.** The missions are
dealt to each participant in their own sequence, so Round 3 is the crane for one
person and the escape for the person next to them.

**The host releases each round.** Nobody can start until Admin presses *Start Round 1*,
and nobody runs ahead: finishing a round puts a participant back on a waiting screen
until the host releases the next one. Inside a round everyone works at their own
speed, because a 3D mission takes a different amount of time for everyone.

- The twenty written questions come from a construction-safety bank covering working
  at height, scaffolding, electrical, PPE, excavation, lifting, crane and hoist,
  fire, housekeeping, confined space, emergency response and material handling.
- Each participant gets their **own** shuffled paper — their own mission order, a
  different topic each round, their own question at each finale tier, and the answer
  options shuffled too. Across 300 participants that is 111 different mission orders,
  300 different quiz papers and 237 different finale papers.
- The finale still climbs Bronze → Diamond, because escalating stakes is the point of
  the format. The **questions** at each tier vary instead.
- Closing the page and coming back resumes the **same** round with the **same**
  questions and the **same** score. No duplicate participants, no re-shuffle.
- The 3D missions, the quiz and the finale are scored separately and combined into
  one total, which is what the TV race and the leaderboard show. Each mission is
  normalised to 1,000 points so the 3D half cannot swamp the written half.

There is no "live event mode" and no "integrated session" any more — there was never a
good reason for the 3D missions to live somewhere the admin could not see them. One
event, one plan, host-released rounds.

Admin → **Game status** shows the round timeline, how many people are in the 3D
mission / on the quiz / on the finale, and how many are waiting on you.

## The five 3D missions

Every mission is set on the **Casagrand Aria** site — a 19-floor residential tower,
which stands on the skyline of each outdoor scene, on the hoarding banners and on
the tower crane's counterweight.

- **Safety Mission Simulator** — patrol the site on foot, find ten real hazards,
  classify them and choose the corrective action.
- **Tower Crane Master** — one lift, done properly: rig a steel bundle, slew,
  trolley and hoist it up onto the building against a capacity chart, exclusion
  zones and the wind.
- **Spot the Hazards** — a ground-level walk-round of the compound. Five real
  hazards; for each one, choose the control that removes the risk rather than the
  sign that warns people about it.
- **Safety Escape Challenge** — work out of a bright, white-walled fitted-out floor
  through five areas. Pick an extinguisher off the rack, carry it to the fire and
  discharge it; then open the final exit and walk into the marked assembly area to
  finish.
- **Emergency Response Commander** — an activity, not a quiz. The eight steps of a
  real response are eight objects you have to find on the site and use: the
  break-glass call point, the intake panel, the muster marker, the cone stack, the
  first-aid post, the radio, the vehicle gate. Order matters. The incident itself is
  clickable, and walking into it is always wrong.

They work on phones with a real virtual joystick and touch camera, on tablets, and
on desktop with WASD and the mouse. **Every mission zooms** — the mouse wheel or a
two-finger pinch, plus a ZOOM button for thumbs. The walking missions narrow the
lens; the overhead missions pull the camera in.

Scores feed a persistent Arena leaderboard (daily, weekly, all-time, overall and
per game) under the same player identity the quiz uses, and the admin panel has a
**3D Gaming Arena** section for switching missions on and off and reviewing
participation, scores and anything that looks tampered with.

**Before Arena scores will save you must re-publish `rules.json`** — see step 2
above. Full implementation notes, the data model, the security position and a
device testing checklist are in **[ARENA.md](ARENA.md)**.

## Local development

```bash
npm install
npm run dev
npm test     # 900 tests: the 3D games, the question bank, rounds, scoring,
             # rules, and that the app actually renders
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
**3rd place**, **Bottom 1**, and **Bottom 2**. The assigned media appears in
the matching player's row and rotates to the next assigned player every 10
seconds. The layout stacks cleanly on mobile screens.

## Notes and limits

- Quiz scoring is still client-trusted, same as the original — fine for a fun team
  event, not for anything with real stakes riding on it. The 3D Arena scores ARE
  validated server-side by the database rules; see ARENA.md section 4 for exactly
  where the boundary sits.
- Firebase's free "Spark" plan comfortably covers a single live event; you'd
  only need to upgrade for very heavy, sustained traffic.
- Hazard-round photos are stored as base64 strings directly in the database.
  Fine for a handful of reasonably sized images; don't upload dozens of
  large, high-resolution photos.
- The admin PIN starts as `1234` for the first unlock. After entering Admin,
   use **Admin security → Reset PIN** to set a 4–8 digit PIN. The replacement
   PIN is stored in that browser's local storage, so reset it on the admin
   device that will run the event.
