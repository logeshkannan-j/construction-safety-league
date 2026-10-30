# 3D Safety Gaming Arena — implementation notes

This document covers the Gaming Arena and the integrated participant session added to the existing
Construction Safety League quiz: what they are, what changed, the one Firebase step you **must** do
before scores will save, and an honest account of where the security boundary sits.

---

## 0. The participant session: five host-released rounds

A participant enters the game code, submits their details once, and plays five rounds:

```
ROUND n:  3D mission n  →  1 quiz question  →  1 Safety Millionaire question
```

Five rounds x three items = **15 items**, and the five rounds use the five different 3D missions in
order. **There is no second sign-in** — the missions, both question types and the leaderboard all
run against the same participant record and the same game code.

### The host releases each round

The game record carries `releasedRound` (−1 before the event starts). A participant can never run
ahead of it:

| `session.stage` | Meaning |
|---|---|
| `locked` | Waiting for the host to release this round |
| `game3d` | Playing this round's 3D mission |
| `quiz` | On this round's quiz question |
| `millionaire` | On this round's finale question |
| `roundDone` | Round finished; waiting for the host to release the next |
| `done` | All five rounds complete |

`releaseRound()` is the only transition into a round, and it is a no-op unless the host has
actually released it. It also **cannot pull a participant out of a round they have already
started**, so pressing *Release Round 3* does not cut off someone still in Round 2's mission — it
only lets through everyone already sitting on `roundDone`.

Inside a round, pacing is the participant's own, because a 3D mission takes a different amount of
time for everyone.

### How participants play is still an admin choice

`defaultGame()` carries a `sessionMode`:

| Mode | Behaviour |
|---|---|
| `"solo"` (**default for new games**) | The five rounds above, released one at a time. |
| `"live"` | The original host-paced event, unchanged: a flat 10 + 5 paper, you advance the questions and the TV shows the current one to the room. |

Games created before this change have no `sessionMode`, and are treated as `"live"`, so **no
existing game changes behaviour**. Live mode keeps its own 10 + 5 shape via `createLivePaper()`,
which shares this module's draw and shuffle so the two modes cannot drift apart.

### Scores

Three section scores are kept separately on the participant record, and `player.score` is the
combined total:

```js
player.scores = { game3d, quiz, millionaire }
player.score  = game3d + quiz + millionaire     // what the TV race, leaderboard and admin read
```

Keeping `score` as the total is deliberate: the existing TV race, the leaderboard, the team scoring
and the admin participants panel all already read `player.score`, so none of them needed changing.

Each 3D mission is scored out of 12,000 in the Arena, which would swamp ten written questions. In a
session each mission is **normalised to 1,000 points** (`game3dPoints()`), giving a rough balance
of 5,000 from the missions, ~750 from the quiz and 3,000 from the finale.

### Shuffling, and why a refresh is safe

Each participant's paper is drawn **once, when they join**, and stored on their own record as a
compact descriptor — question **ids** plus an option **permutation**:

```js
session.descriptor = {
  v: 2,
  rounds: [{ gameId, quiz: { id, perm }, mq: { id, perm } }, …×5],
}
```

- 5 general questions, drawn **one per topic** across 5 of the 12 topics, so a participant never
  gets two questions on the same subject while other subjects go unasked.
- 5 finale questions, one per tier, always ordered lowest stake first.
- Option order is shuffled per question, and `correct` is remapped so it follows its answer text.
- Because the descriptor is stored, **a refresh rebuilds the identical paper** and resumes in the
  same round at the same stage with the same score. It does not re-shuffle and does not create a
  second participant.
- Because it stores ids rather than text, it costs under 2 KB per player.

`SESSION_VERSION` is **2**. A session written by the old (non-round) build no longer validates, so
such a participant is dealt a fresh paper rather than being resumed into a shape this build cannot
read.

A page refresh also **resumes straight into the session** rather than asking for the game code
again, since that device already proved the code for this game.

### Things that cannot score twice

- **A double tap on an answer**: `answerQuestion` refuses a round that already has an answer for
  that section.
- **Replaying a 3D mission**: `completeGame3d` is idempotent **per round**, and nothing is banked
  until the participant presses *Continue* — so only the attempt they carry forward counts, once.
  A skipped mission banks a zero that cannot later be replaced with a score.
- **A stale poll**: every write stamps an incrementing `revision`, and the 1.4s poll will not
  overwrite local state with an older revision. Without this, an answer could visibly roll back for
  a moment.
- **A re-release**: `releaseRound` returns `changed: false` for a round already played, so an
  admin pressing a release button twice moves nobody.

### Timers

45 seconds per quiz question, 60 for a finale question. A correct answer is worth between 50% and
100% of the question's value depending on how quickly it arrives — the same speed curve the live
event already used. Running out of time records a zero-score answer and shows the explanation,
rather than leaving the participant stuck. **If a participant leaves a question open and comes back
after the clock has expired, that one question is lost** — the clock is the clock, and the
alternative would let a refresh buy more time. The waiting screens between rounds are untimed.

### The site

Every mission is set on **Casagrand Aira**, a 19-floor residential tower. `SITE_NAME` lives in
`arenaConstants.js` (not `kit.js`, so the HUD can use it without pulling three.js into its chunk)
and shows up in four places: the HUD line above the objective in every mission, the hoarding
banners inside the compound, the tower crane's counterweight, and the finished 19-floor tower
itself standing on the skyline of every outdoor scene.

---

## 1. What was added

```
src/questionBank.js        all quiz and finale questions (replaces the old seeded set)
src/session.js             the participant session: draw, shuffle, score, stage machine
src/SoloSession.jsx        the integrated session UI
src/theme.js               palette + control styles, lifted out of App.jsx so both share them

src/arena/
  arenaConstants.js        game registry, difficulties, achievements, rating bands
  arenaDb.js               Realtime Database layer (everything under the `arena/` root)
  identity.js              player identity + local settings
  audio.js                 all sound, synthesised at runtime (no audio files)
  engine/
    gfx.js                 WebGL detection, quality tiers, renderer/scene lifecycle, disposal
    input.js               one input object fed by keyboard, mouse, joystick and touch
    kit.js                 the 3D construction kit every game builds its world from
    stairs.js              stair geometry (DOM-free so it can be unit tested)
    fpsController.js       first-person movement, collision, stairs, ladders, pits
  ui/
    GameShell.jsx          the harness all five games run inside
    Hud.jsx                shared HUD primitives
    Joystick.jsx           the virtual joystick
    TouchLook.jsx          the touch camera pad
    ActionButtons.jsx      action buttons, rockers, the crane control desk
    ResultsScreen.jsx      shared results screen
    ArenaHome.jsx          Gaming Arena entry page
    ArenaLeaderboard.jsx   daily / weekly / all-time, overall and per game
    ArenaAdminPanel.jsx    admin reporting and game on/off switches
    GameCover.jsx          per-game cover art (inline SVG)
    primitives.jsx         small shared UI pieces
  games/
    safetyMission/         Game 1 — Safety Mission Simulator
    craneMaster/           Game 2 — Tower Crane Master
    safestTower/           Game 3 — Build the Safest Tower
    escapeChallenge/       Game 4 — Safety Escape Challenge
    emergencyCommander/    Game 5 — Emergency Response Commander
tests/_harness.mjs          headless DOM + renderer stub for the games
tests/arena-logic.test.mjs  engine, scoring, leaderboards, security rules
tests/arena-games.test.mjs  builds and plays all five 3D games headlessly
tests/session.test.mjs      question bank, shuffling, session flow, participant record
ARENA.md                    this file
```

**One new dependency:** `three@0.169.0`. Nothing else was added. React-Three-Fiber, Drei and Rapier
were deliberately **not** used — the physics these games need (a pendulum load, axis-aligned
collision) is a few hundred lines, and Rapier's WebAssembly payload would have cost phone users
roughly a megabyte for no benefit.

### Changes to existing files

| File | Change |
|---|---|
| `src/App.jsx` | Added the Arena role and card; added the integrated session branch to `PlayerView`; added the **How participants play** and **3D Gaming Arena** admin panels; added `sessionMode`/`arenaGameId` to `defaultGame()`; replaced the old seeded question arrays with a draw from `questionBank.js`; added revision-stamped player writes and refresh resume; moved the palette to `theme.js`. The live event flow, TV display, hazard rounds and admin controls are otherwise untouched. |
| `src/App.jsx` (removed) | The old `SEED_QUESTIONS`, `EXTRA_QUESTIONS` and `MILLIONAIRE_LADDER` arrays. The ten built-in *Spot the Hazard* scenes were **kept** and are now reachable from a new one-tap admin button, so no content was lost. |
| `src/firebaseConfig.js` | **Bug fix.** `getAnalytics()` was called unguarded at import time. It throws synchronously on any browser where Analytics is unsupported (cookies disabled, private browsing on some platforms, certain in-app webviews) — and because this module is imported by `storage.js`, which is imported by `App.jsx`, that would have taken the whole quiz down, not just analytics. It is now behind `isSupported()` and a `try/catch`. |
| `src/storage.js` | Added `.js` to its two relative imports so the module also resolves under plain Node for the test harness. No behaviour change. |
| `rules.json` | Rewritten — see section 3. The quiz's four paths keep exactly the access they had. |
| `vite.config.js` | Added `manualChunks` so `three`, `firebase` and `react` are separately cacheable chunks. |
| `package.json` | Added `three`, and an `npm test` script. |

The quiz, TV display, player flow, admin panel, scoring, hazard rounds and Safety Millionaire
finale were not touched.

---

## 2. Run it

```bash
npm install          # picks up three@0.169.0
npm run dev          # local dev server
npm test             # 396 tests, no browser needed
npm run build        # production build
git push             # GitHub Actions deploys to Pages automatically
```

The Arena is reachable from the main menu ("3D Gaming Arena") or directly at
`?role=arena`, e.g. `https://logeshkannan-j.github.io/construction-safety-league/?role=arena`.

---

## 3. REQUIRED: publish the new database rules

`rules.json` has been rewritten. **Until you publish it, Arena scores will not save** — the Arena
will show the player a clear message telling them exactly this.

1. Firebase console → your `safety-league` project → **Build → Realtime Database → Rules**.
2. Paste the entire contents of `rules.json`.
3. **Publish**.

No new Firebase project, no new SDK product, no Authentication, no Cloud Functions, no billing
change. The Arena uses the same project and the same Realtime Database the quiz already uses.

### What the old rules were

```json
{ "rules": { ".read": true, ".write": true } }
```

Anyone with the database URL could read or write anything.

### What the new rules do

The quiz keeps working identically — `game`, `questions`, `players/*` and `misc/*` all still allow
read and write, and the database is still world-readable (the TV display and player phones depend
on that). Everything the Arena owns lives under a separate `arena/` root with real validation:

| Path | Enforcement |
|---|---|
| `arena/runs/{playerId}/{runId}` | **Create-only.** `!data.exists()` means a run can never be edited or deleted after it is written. Score must be 0–12000, accuracy 0–100, time 0–2h, `gameId` must be one of the five, `createdAt` must be within ±10 minutes of the *server's* clock, and no unexpected fields are accepted. |
| `arena/feed/{runId}` | Same create-only validation, for the leaderboard feed. |
| `arena/profiles/{playerId}` | Per-game best capped at 12000, total capped at 60000, `runCount` can only increase and only by 1 per write, `id` must match the path, no unexpected fields. |
| `arena/config` | Shape-validated: `enabled` must be a boolean, and only the five known game ids are accepted. |

Three things follow from this that matter:

- **Scores cannot be edited.** Once a run is written it is immutable. There is no path that lets a
  player go back and raise a past score.
- **Duplicate submissions are impossible.** The run id is generated once when a run ends and the
  write is a create to that exact path. A double tap, a network retry or a React re-render cannot
  award points twice — and the client checks for an existing run first and reports it honestly as
  "already saved, no double points".
- **Impossible scores are rejected server-side.** The 12000 ceiling is enforced by Firebase, not by
  the browser.

`npm test` includes checks that the ceiling in `rules.json` still matches the ceiling in
`arenaConstants.js`, and that every game id is allow-listed. If you change a game's scoring, the
tests will tell you to re-publish the rules.

---

## 4. Where the security boundary actually is — read this

The brief asked for scores that players cannot tamper with. Here is the honest position.

**What is enforced:** value ranges, field shapes, run immutability, duplicate prevention,
server-clock timestamps, and a 12000 ceiling — all server-side, in the database rules.

**What is not enforced: *identity*.** The existing site has no Firebase Authentication. A player is
identified by a uuid in their own browser's `localStorage` (`csl:myplayerid`), and the admin by a
PIN also held in `localStorage`. Realtime Database rules can only check `auth.uid`, and there is no
`auth.uid` here. So the rules can verify *that a submission is well-formed and plausible*, but they
cannot verify *who sent it*. Someone willing to open developer tools could write a valid-looking
run under their own id, or flip a game's `enabled` flag.

This is not a regression — it is exactly the exposure the quiz already has today (anyone can
already write to `game` and reset a live event). The Arena does not make it worse, and it adds
validation the quiz does not have.

**I did not add authentication**, because you asked me not to create a second authentication system
and because adding it would change how the existing quiz identifies players. If you do want
tamper-proof identity later, there are two clean options:

### Option A — Firebase Anonymous Auth (free, ~30 lines)

Anonymous Auth is not a login: no UI, no accounts to manage, no change for the player. It gives
every browser a stable server-issued `auth.uid`, which the rules can then key on.

1. Firebase console → **Authentication → Sign-in method → Anonymous → Enable**.
2. In `src/arena/identity.js`, call `signInAnonymously(getAuth(app))` and use `user.uid` as the
   player id instead of the `localStorage` uuid.
3. Tighten the rules so a player can only write their own data, and only an allow-listed admin can
   change the config:

```json
"arena": {
  "runs":     { "$playerId": { ".write": "auth != null && auth.uid === $playerId" } },
  "profiles": { "$playerId": { ".write": "auth != null && auth.uid === $playerId" } },
  "config":   { ".write": "auth != null && root.child('admins').child(auth.uid).val() === true" }
}
```

4. Add your own uid under `admins/{yourUid}: true` once, by hand, in the console.

Keep the existing `.validate` rules alongside these — identity and value validation are
complementary, not alternatives. Note that the existing `localStorage` ids would not carry over, so
either run a one-off migration or accept that the Arena leaderboard restarts.

### Option B — Cloud Functions (requires the Blaze plan)

Move score submission behind an HTTPS callable function that recomputes the score from the run's
telemetry and writes it with the Admin SDK, with `arena/runs` set to `".write": false` for clients.
This is the only approach that stops a player submitting a *plausible but untrue* score. It needs
the pay-as-you-go Blaze plan; your README says you are on the free Spark plan, which is why it is
not the default here.

---

## 5. Data model

Everything additive, under one root. **No migration is needed and no existing record changes
shape.**

```
arena/
  profiles/{playerId}    { id, name, team, company, totalScore, runCount,
                           gamesCompleted, bestScores{gameId:score},
                           achievements{id:timestamp}, createdAt, updatedAt, lastPlayedAt }
  runs/{playerId}/{runId} { runId, playerId, playerName, gameId, gameName, difficulty,
                            score, completed, accuracy, timeTakenMs, rating, stats, createdAt }
  feed/{runId}            small flat copy of every run, for leaderboards and admin reports
  config/games/{gameId}   { enabled }
```

**Why `totalScore` is the sum of personal bests, not of all runs:** otherwise grinding the easiest
game repeatedly would out-rank someone who completed all five well.

**Why there is a `feed`:** daily and weekly leaderboards plus every admin report are computed from
exactly two reads — all profiles, and the capped run feed. Switching leaderboard tabs costs nothing.

### Player identity and the quiz

The Arena deliberately reuses the quiz's identity rather than inventing a second one:

- If this browser has already joined a quiz, the Arena adopts that **exact** player id, so the
  person is one player in both systems, and their quiz name and team appear in the Arena.
- If not, the Arena mints an id under its own key (`csl:arena:pid:v1`) and never overwrites it, so a
  player who later joins a quiz keeps their Arena history and ranking.
- Nothing in the Arena ever writes to `csl:myplayerid` or to `players/{id}`, so the quiz's join flow
  is untouched.

The quiz's `createGame()` deletes all player records by design, so there was no persistent quiz
leaderboard to extend — the Arena's profiles are the persistent layer, linked by the same id.

---

## 6. Mobile and performance

- **Virtual joystick** — a real analogue stick: the knob tracks the finger, output is a normalised
  360° vector with a rescaled dead zone, and it springs back on release. Uses pointer capture, so
  dragging outside the base keeps control.
- **Touch look** — the play area is a camera pad feeding the same look channel the desktop mouse
  uses, with its own pointer id so moving and looking work simultaneously.
- **Action buttons** — drive the same *named actions* the keyboard drives, so no game has separate
  "mobile logic". Each game declares only the buttons it needs.
- **Page gestures** — `touch-action: none`, `overscroll-behavior: none` and `preventDefault` on
  touchmove stop pull-to-refresh, rubber-banding and double-tap zoom during play.
- **Quality tiers** — Low / Medium / High, auto-detected from cores, device memory and screen
  pixels, overridable in Settings. Low disables shadows and caps the pixel ratio at 1. Phones
  default to Medium at most; High is opt-in.
- **Safe areas** — the HUD respects `env(safe-area-inset-*)`, so controls clear notches and home
  indicators.
- **Landscape** — a rotate prompt appears in portrait on phones, with a "play anyway" option.
- **Memory** — `disposeScene()` releases every geometry, material and texture on unmount, and the
  WebGL context is explicitly lost. Without this, replaying games repeatedly leaks GPU memory until
  a mobile browser kills the context and shows a black screen.
- **Bundle** — `three` is its own 493 KB (124 KB gzipped) chunk, loaded only when the Arena opens.
  Each game is a further separate chunk of 20–49 KB. **A player who only opens the quiz, the TV
  display or the admin panel downloads none of it.**
- **WebGL** — detected before anything is created; unsupported devices get a clear explanation and a
  way back, and the quiz is unaffected.

---

## 7. Testing

`npm test` runs 413 assertions with no browser required, across four suites.

### `tests/arena-games.test.mjs` — the 3D games, actually played (212 assertions)

This suite boots each game's **real** world and runs its **real** frame loop headlessly, by
injecting a renderer stub through a test seam in `engine/gfx.js` and stubbing the small amount of
DOM the Arena touches (`tests/_harness.mjs`). It then drives each game through its own input object
and api, exactly as a player or a phone would:

- all five games construct, run 120 frames with no exception and no frame error, render, publish a
  HUD with an objective and a control scheme, and declare valid action buttons
- the kit builds a world of the expected size with no NaN or Infinity in any transform, and
  `stage.dispose()` empties the scene
- **Safety Mission**: joystick movement, RUN covering more ground than walking, touch-look rotating
  the camera, the hoarding *and* the gateway both stopping the player leaving the site, climbing the
  stairs to Level 1, then **finding, classifying and correcting all ten hazards** and completing the
  mission at 100%
- **Tower Crane Master**: the plan being a **single** lift to a floor of the building, slew, trolley
  and hoist each moving the crane, emergency stop braking it, the capacity chart falling with radius,
  **swinging a load over an exclusion zone being penalised**, the pendulum settling when the controls
  are still, and that one lift rigged, travelled, landed and released onto the target
- **Spot the Hazards**: five ground-level hazards each with four options and one correct control; a
  plausible-but-wrong answer leaving the hazard exactly where it was and costing points; the correct
  control **rebuilding the hazard in its fixed form**; and a second run answering every hazard with a
  plausible option, proving nothing gets controlled and the walk-round does not finish itself
- **Safety Escape Challenge**: walking inside the building, interior walls holding, six areas solved
  by decision, then the plant room **played out** — picking the water extinguisher off the rack,
  carrying it to the fire, discharging it, the fire *not* going out and the mistake being counted;
  then the CO2 one, a sustained knock-down rather than an instant fix, and the fire going out. The
  final door is opened and deliberately does **not** end the run; standing short of the assembly area
  does nothing; walking into it finishes the escape
- **Emergency Response Commander**: the brief, the **observation beat** opening each step with the
  scene rather than the question, the question opening only afterwards, all eight decision steps, the
  alarm/isolation/services flags, the workforce actually walking to the muster point, and a textbook
  response saving the casualty

### `tests/session.test.mjs` — questions, rounds and sessions (106 assertions)

- the bank: 24 + 8 questions, unique ids, 4 options each, valid answer indexes, no duplicate
  options, an explanation on every question, and **all twelve required topics covered with at least
  two questions each**
- the round structure: five rounds, one quiz and one finale question each, 15 items; every round
  naming a **real** Arena game; five *different* missions; every Arena game used by exactly one
  round; and a display name and blurb for each
- the draw: five rounds with no repeated question, 5 **different** topics, the finale ascending by
  tier, and a descriptor small enough to store per player
- variety: 40 draws produce many different papers, and the correct answer appears in **every**
  option slot across draws
- remapping: 300 shuffles never move the correct answer away from its text; a malformed permutation
  falls back safely
- refresh safety: a JSON round-trip rebuilds the identical paper; a session from an older version, a
  session missing a round, and a session naming an unknown mission are all rejected rather than
  half-used
- scoring: full value instantly, half value at the buzzer, zero for wrong, elapsed time clamped, and
  a 3D mission normalised and capped to its per-round allowance
- **host-released rounds**: an unreleased round does not open; releasing round 1 opens it; a later
  release **cannot pull a participant out of the round they are in**; finishing a round returns them
  to waiting; and they stay there until the *next* round is released
- the full flow: five rounds of mission → quiz → finale → combined total, with the three section
  scores tracked separately
- duplicate protection: replaying a mission does not bank twice, a double tap never scores a question
  twice, and a skipped mission cannot later be scored
- **the participant record end to end**: joining captures their details and ties them to the game
  code, a mid-round refresh keeps the id, score, paper and round position, a refresh does not re-open
  a finished round, and `player.score` ends as the combined total the leaderboard reads
- live event mode: a live paper is still 10 + 5, still shuffled in place, still never moves the
  correct answer away from its text, and still deals a different paper per game

### `tests/app-render.test.mjs` — the app actually mounts (22 assertions)

Mounts the **real** React app in jsdom with effects running, clicks through to the admin panel and
waits for the live Firebase record to arrive. A blank screen is invisible to every other suite
here — `npm run build` compiles a broken component perfectly happily, and the 3D suites never mount
React at all.

- the menu renders and offers Join as player, Run the event and the TV display, and **no longer
  offers a separate 3D Gaming Arena tile**
- clicking through to admin renders the panel, its game status, the session-mode chooser and the
  Arena section — with **zero React errors**, specifically no hook-order violation
- a static scan proving no component in `App.jsx` or `SoloSession.jsx` calls a hook after an early
  return, with the detector itself tested against a known-bad, a known-good and a
  `return`-inside-a-callback sample so it cannot silently stop working

### `tests/arena-logic.test.mjs` — engine and backend (73 assertions)

- the first-person controller: gravity, wall collision, step-up onto a tread, refusing to climb a
  1.2 m ledge, a full 3.4 m stair flight up *and* back down, falling into an excavation and being
  unable to climb out through its walls, ladder-to-platform transition, fall-distance reporting,
  run/walk/crouch speeds, and diagonal normalisation
- the stair geometry validator, and the per-scene texture lifecycle
- leaderboard aggregation across daily / weekly / all-time and overall / per-game
- the anti-cheat detector
- `rules.json` consistency with the game config, and that the quiz's paths are still writable
- the React StrictMode mount-flag deadlock, both as a lifecycle simulation and as a scan of `src/`
  that fails if any component ever again clears a mount flag without re-arming it

### Bugs these tests caught

Eight of these tests exist because they found real faults:

1. **Tower Crane Master was unfinishable.** The hook's lower limit was computed from the slab just
   *below* the load's current height, so a load travelling at height could only ever descend to the
   floor immediately beneath it — **every delivery to Level 1 or Level 2 was impossible**. Fixed by
   computing the landing height from the lift's target floor when over the landing zone.
2. **The same lift was then blocked by collision**, because every slab was treated as a solid
   full-footprint box, so the slab *above* the target floor stopped the descent. Slabs at and above
   the target floor are now the void the material is landed through when over the landing zone.
3. **The stair flight was unclimbable** — the player's body could not fit between the top tread and
   the slab above, which made the upper half of the Safety Mission site unreachable.
4. **The slab void was quantised to a 1 m grid** by a centre test, leaving a sliver of concrete
   exactly where a climbing player needed head clearance.
5. **Textures were shared across scenes** while `disposeScene` disposes them, so the second play of
   any game would have rendered with disposed textures.
6. **The Arena never opened in `npm run dev`.** `main.jsx` wraps the app in `<React.StrictMode>`,
   which mounts, unmounts and re-mounts every component. `ArenaView` cleared its `mountedRef` in the
   cleanup but never re-armed it, so the second mount's `bootstrap()` bailed out at its first guard
   and the Arena sat on "Opening the Gaming Arena…" forever. Invisible to the production build and
   to every headless test, because neither double-invokes effects.
7. **The server clock was never actually read.** `.info/serverTimeOffset` is a client-local path that
   `get()` rejects with "Invalid token in path", so `getServerTimeOffset()` failed on every call and
   silently returned `0` from its catch. That is not cosmetic: the Arena stamps each run's
   `createdAt` with it and `rules.json` validates `createdAt` against the server clock, so a player
   with a skewed phone clock would have had their score **rejected by the rules**. Now read once via
   `onValue` and cached, with a 5 s fallback to `0`.

8. **The admin panel went completely blank.** `AdminView`'s `soloStats` `useMemo` sat *below* the
   PIN-lock early return, so the unlocked render ran one more hook than the locked render had.
   React rejects that outright and tears down the whole tree. It only fires on the **second**
   render — the moment the PIN is accepted — which is why the build passed, all three other suites
   passed, and it still reached the user. `tests/app-render.test.mjs` exists because of this one.

Two smaller ones: the player could walk out of the site through the open gateway, and
`stageStartedAt || now` broke on a timestamp of `0`.

### What the tests cannot cover

There is no browser in the environment this was built in, so **rendering, touch input and real
device performance have still not been observed**. The simulations are now driven end to end
headlessly, which is far stronger evidence than before — but the following need a real device, and
I am not claiming otherwise:

- [ ] Each mission renders correctly and the frame rate is acceptable on your target phones
- [ ] Joystick, touch look and action buttons on Android Chrome
- [ ] Joystick, touch look and action buttons on iPhone Safari (check the safe-area insets)
- [ ] Pointer lock and mouse look on desktop
- [ ] **Casagrand Aira is legible** — the HUD line, the hoarding banners, the crane counterweight
      and the 19-floor tower on the skyline, at phone size as well as desktop
- [ ] **Sound** in Emergency Response: the opening siren, the radio cue, the decision pips, the
      last-five-seconds countdown and the ambulance (phones need a tap to unlock audio at all)
- [ ] All five rounds end to end on a phone, with the combined score arriving on the TV leaderboard
- [ ] **The admin round controls with more than one participant in the room** — releasing a round
      moves everybody who is waiting, and does not cut off anyone still inside the previous one
- [ ] The admin session-mode switch and the mission on/off switches taking effect
- [ ] The existing live event mode, TV display and admin panel still behaving exactly as before

---

## 8. Known limitations

- **Identity is not authenticated** — section 4 above.
- **The admin game switches are world-writable**, like the quiz's own controls. Section 4, Option A
  fixes both together.
- **Score validation is range-based, not recomputed.** The rules reject impossible scores but cannot
  prove a plausible one was earned. Only Option B (Cloud Functions) can.
- **The run feed read is capped** at the most recent 2000 runs. Past that, daily and weekly
  leaderboards stay correct but a very long all-time history would need pagination.
- **Rendering is untested.** The simulations are driven end to end headlessly, but nothing has
  verified what the games actually *look* like, or how they perform on a real phone GPU. Section 7
  has the device checklist.
- **A question left open past its timer is lost.** Resuming a session restarts nothing: the clock is
  the clock. The alternative would let a refresh buy more time.
- **In a session, "Ask the Room" only sees participants who have already answered that exact
  question.** Early in an event that will often be nobody, and it says so.
