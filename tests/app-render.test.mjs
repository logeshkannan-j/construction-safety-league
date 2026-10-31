/**
 * Mounts the REAL React app in jsdom, with effects running, and clicks
 * through to each role.
 *
 * This exists because a blank screen is invisible to every other kind of
 * test here: `npm run build` compiles a broken component happily, and the
 * headless 3D suites never mount React at all. The specific fault it was
 * written for: a `useMemo` placed BELOW AdminView's PIN-lock early
 * return, so the unlocked render ran one more hook than the locked one.
 * React rejects that outright and unmounts the whole tree — the admin
 * panel went completely blank the moment the PIN was accepted.
 *
 * It talks to the real Firebase project read-only (the same reads the app
 * does on load) and writes nothing.
 */

import { JSDOM } from "jsdom";
import { createServer } from "vite";

let pass = 0;
let fail = 0;
const failures = [];
function check(name, condition, extra = "") {
  if (condition) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${extra ? `  — ${extra}` : ""}`); }
}
function section(t) { console.log(`\n== ${t} ==`); }

/* ------------------------------ the DOM ------------------------------ */

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: "http://localhost:5173/construction-safety-league/",
  pretendToBeVisual: true,
});

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
globalThis.Event = dom.window.Event;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.localStorage = dom.window.localStorage;
globalThis.matchMedia = () => ({
  matches: false, addEventListener() {}, removeEventListener() {},
  addListener() {}, removeListener() {},
});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/* --------------------------- error capture --------------------------- */

const reactErrors = [];
const otherErrors = [];
const origError = console.error;
console.error = (...args) => {
  const text = args
    .map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a)))
    .join(" ");
  // `act(...)` warnings are an artefact of driving React from a script.
  if (text.includes("not wrapped in act")) return;
  // Hook-order violations, render crashes and the like.
  if (/Rendered (more|fewer) hooks|Minified React error|Cannot read|is not a function|is not defined|Maximum update depth/.test(text)) {
    reactErrors.push(text);
  } else {
    otherErrors.push(text);
  }
};
dom.window.addEventListener("error", (e) => reactErrors.push(`window.error: ${e.message}`));

/* ----------------------------- the app ----------------------------- */

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
const React = (await import("react")).default;
const ReactDOMClient = await import("react-dom/client");

// Skip the PIN screen the way a returning admin device does.
dom.window.localStorage.setItem("csl_admin_unlocked_v1", "1");

const { default: App } = await server.ssrLoadModule("/src/App.jsx");
const rootEl = document.getElementById("root");
const root = ReactDOMClient.createRoot(rootEl);

function visibleText() {
  const clone = rootEl.cloneNode(true);
  [...clone.querySelectorAll("style")].forEach((s) => s.remove());
  return (clone.textContent || "").replace(/\s+/g, " ").trim();
}
const settle = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Waits for the UI to actually show something, rather than sleeping a
 * fixed amount and hoping the Firebase poll landed in time. A fixed
 * sleep made this suite fail intermittently depending on network speed.
 */
async function waitForText(needle, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (visibleText().includes(needle)) return true;
    await settle(250);
  }
  return false;
}
function clickByText(needle) {
  const btn = [...document.querySelectorAll("button")]
    .find((b) => (b.textContent || "").includes(needle));
  if (btn) btn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  return !!btn;
}

/* ------------------------------ the menu ------------------------------ */

section("The role menu");

root.render(React.createElement(App));
await settle(500);

let text = visibleText();
check("the app mounts and renders something", rootEl.childElementCount > 0 && text.length > 0,
  `${text.length} chars`);
check("the menu offers Join as player", text.includes("Join as player"));
check("the menu offers Run the event", text.includes("Run the event"));
check("the menu offers the TV display", text.includes("Show the arena"));
// The standalone Arena tile was deliberately removed.
check("the separate 3D Gaming Arena tile is gone", !text.includes("3D Gaming Arena"),
  "the standalone Arena tile is still on the menu");
check("no React errors rendering the menu", reactErrors.length === 0, reactErrors[0]);

/* ----------------------------- the admin ----------------------------- */

section("The admin panel");

const clicked = clickByText("Run the event");
check("the Run the event card is clickable", clicked);

// Wait for the admin panel, then for the Firebase poll to deliver the
// live game record (until it does, the panel correctly shows
// "No active game" and none of the game panels exist yet).
const reachedAdmin = await waitForText("Admin Control Panel");
check("the admin panel appears after clicking through", reachedAdmin, visibleText().slice(0, 160));

// The database may be refusing us (expired Firebase rules). That must be
// SAID, not silently rendered as an empty panel — which is exactly how it
// used to present, and is indistinguishable from "no game yet".
//
// Wait for EITHER outcome before deciding which one happened: the banner
// and the game record both arrive on the first poll, so checking too
// early sees neither.
const settled = await Promise.race([
  waitForText("Game status").then((ok) => (ok ? "game" : null)),
  waitForText("The database is refusing this app").then((ok) => (ok ? "denied" : null)),
  waitForText("No active game").then((ok) => (ok ? "nogame" : null)),
]);
const denied = settled === "denied"
  || visibleText().includes("The database is refusing this app");

/* Three legitimate states, and only one of them is a failure.
 *
 * This suite reads the LIVE event database, so what it finds depends
 * on what the host has done: a game may be running, the rules may be
 * refusing us, or there may simply be no game right now because the
 * last one was reset. "No game yet" is a normal state of the product
 * and the panel says so correctly — failing the build for it means a
 * red suite every time the host clears down between rehearsals.
 */
const noGame = !denied
  && (settled === "nogame" || visibleText().includes("No active game"));

if (denied) {
  console.log("  NOTE  the live database is denying access — asserting the warning is shown");
  check("a denied database is reported, not silently shown as empty",
    visibleText().includes("Permission denied"));
  check("the warning says how to fix it",
    visibleText().includes("rules.json") && visibleText().includes("Publish"));
  check("the warning reassures that the data is intact",
    visibleText().includes("your data is still there"));
} else if (noGame) {
  console.log("  NOTE  there is no active game in the live database — asserting the empty state");
  check("an empty database offers to create a game, rather than looking broken",
    visibleText().includes("Create a game"), visibleText().slice(0, 160));
  check("the empty state explains what a participant will get",
    /five rounds/i.test(visibleText()));
} else {
  check("the live game record loads from Firebase", settled === "game",
    "still showing: " + visibleText().slice(0, 160));
}

text = visibleText();
check("the admin panel is not blank", text.length > 50, `${text.length} chars`);
check("the admin panel renders its title", text.includes("Admin Control Panel"), text.slice(0, 160));
if (!denied && !noGame) {
  check("the admin panel renders Game status", text.includes("Game status"));
  check("the admin panel renders the event plan panel", text.includes("The event plan"));
  check("the admin panel renders the Arena section", text.includes("3D Gaming Arena"));

  // The host supplies the demo videos and puts the briefing on the TV,
  // so both controls have to actually be on the panel.
  check("the admin panel offers the mission demo videos",
    text.includes("Mission demo videos"));
  // Placeholders are attributes, not text nodes, so read the DOM.
  const videoSlots = [...document.querySelectorAll("input[type=url]")]
    .map((i) => i.getAttribute("placeholder") || "");
  check("the admin panel offers a demo video slot per language",
    videoSlots.some((v) => v.includes("English demo video"))
    && videoSlots.some((v) => v.includes("தமிழ் demo video")),
    videoSlots.slice(0, 4).join(" | "));
  check("the admin can watch each mission's built-in demo",
    (text.match(/Watch the demo/g) || []).length === 5,
    `${(text.match(/Watch the demo/g) || []).length} of 5`);
  check("the admin can put a mission briefing on the TV",
    /Show Round \d demo on TV/.test(text), text.slice(0, 200));
}
check("NO React errors after unlocking admin", reactErrors.length === 0,
  reactErrors.slice(0, 2).join(" | "));

if (!denied && !noGame) {
  /* ---- one unit, not two ----
   *
   * The 3D missions and the questions used to be separate things: a
   * question list the admin could see, and a 3D session they could not.
   * That split is why "I see 15 questions and no 3D" happened. There is
   * now ONE plan, and the missions are rows in it.
   */
  check("the admin sees a single event plan", text.includes("Event plan"), text.slice(0, 200));
  check("the plan is described as the whole event",
    text.includes("This is the whole event"), "the one-unit explanation is missing");
  check("the plan counts missions AND questions together",
    /\d+ rounds · \d+ missions · \d+ quiz · \d+ finale/.test(text),
    "no combined plan summary found");
  check("the admin can deal a fresh plan themselves",
    text.includes("Reshuffle"), "no reshuffle control found");
  check("the two-mode chooser is gone",
    !text.includes("Integrated session") && !text.includes("Live event (host-paced)"),
    "a mode chooser is still on screen");

  // And if the host has not released a round, say so loudly — an
  // integrated session does nothing at all until they do.
  if (text.includes("Round") && text.includes("Not started")) {
    check("an unstarted session tells the host to start Round 1",
      text.includes("Nothing has started yet") && text.includes("Start Round 1"),
      "no start-round prompt");
  }
}

// This is the exact failure mode that shipped: a hook below an early
// return only blows up on the SECOND render, once the PIN is accepted.
check("no hook-order violation in the admin panel",
  !reactErrors.some((e) => /Rendered (more|fewer) hooks/.test(e)),
  reactErrors.find((e) => /Rendered (more|fewer) hooks/.test(e)) || "");

/* ------------------------ the participant path ------------------------ */

section("A participant can reach the join form");

{
  // The admin path alone missed a ReferenceError on JOIN, because the
  // test never went down the player route. It does now.
  // A fresh root: re-rendering the existing one keeps App's role state,
  // so it would still be sitting in the admin panel.
  root.unmount();
  await settle(200);
  rootEl.innerHTML = "";
  const playerRoot = ReactDOMClient.createRoot(rootEl);
  playerRoot.render(React.createElement(App));
  await settle(600);
  clickByText("Join as player");
  // With no game in the database a player is correctly told to wait,
  // so either screen is a pass — what must never happen is a blank
  // page or a React error, which is what the next check is for.
  const reachedCode = await Promise.race([
    waitForText("Enter game code", 15000).then((ok) => (ok ? "form" : null)),
    waitForText("Waiting for the admin", 15000).then((ok) => (ok ? "waiting" : null)),
  ]);
  check("the player route renders either the code form or the waiting screen",
    reachedCode === "form" || reachedCode === "waiting",
    visibleText().slice(0, 160));
  check("no React errors on the player route", reactErrors.length === 0,
    reactErrors.slice(0, 2).join(" | "));

  // The join handler itself is what threw. Exercise it directly against
  // the real module rather than typing a live game code into Firebase.
  const sessionMod = await server.ssrLoadModule("/src/session.js");
  const plan = sessionMod.buildEventPlan();
  let threw = null;
  let run = null;
  try {
    run = sessionMod.createRun(plan, { now: Date.now() });
  } catch (e) {
    threw = e;
  }
  check("creating a participant run does not throw", !threw, threw?.message);
  check("a new run is valid against the plan", sessionMod.isRunValid(plan, run));
  check("a new run starts locked on the first item",
    run?.stage === "locked" && run?.itemIndex === 0);
}

/* ------------------- every stage of a participant run ------------------- */

section("Every session stage renders");

{
  /* A blank page reached admin TWICE before this existed. The cause both
   * times was a stale identifier used only on one branch — `round?.gameId`
   * after the variable was removed in a refactor. The build stays green,
   * the engine tests stay green, and the participant sees nothing.
   *
   * So: render SoloSession at EVERY stage and require real content. */
  const sessionMod = await server.ssrLoadModule("/src/session.js");
  const { default: SoloSession } = await server.ssrLoadModule("/src/SoloSession.jsx");

  const plan = sessionMod.buildEventPlan();
  const game = { gameCode: "123456", releasedRound: 4, status: "question" };

  /** Builds a run parked exactly on the wanted stage. */
  function runAt(stage) {
    let run = sessionMod.createRun(plan, { now: 0 });
    if (stage === "locked") return run;
    let t = 0;
    const tick = () => (t += 500);
    let guard = 0;
    while (run.stage !== stage && run.stage !== "done" && guard++ < 200) {
      if (run.stage === "locked" || run.stage === "roundDone") {
        const r = sessionMod.releaseRun(plan, run, {
          releasedRound: sessionMod.runRoundIndex(plan, run), now: tick(),
        });
        if (!r.changed) break;
        run = r.run;
        continue;
      }
      const item = sessionMod.currentItem(plan, run);
      if (!item) break;
      if (item.round === "game3d") {
        run = sessionMod.completeItemGame(plan, run,
          { score: 9000, maxScore: 12000, completed: true }, { now: tick() }).run;
      } else {
        run = sessionMod.answerItem(plan, run, { pickedIndex: item.correct, now: tick() }).run;
      }
      run = sessionMod.advanceRun(plan, run, { now: tick() });
    }
    return run;
  }

  const stageRoot = ReactDOMClient.createRoot(rootEl);
  const before = reactErrors.length;

  for (const stage of ["locked", "game3d", "quiz", "millionaire", "roundDone", "done"]) {
    const run = runAt(stage);
    const me = {
      id: "p1", name: "Test", score: 0,
      scores: { game3d: 0, quiz: 0, millionaire: 0 },
      session: run,
    };
    stageRoot.render(React.createElement(SoloSession, {
      me, game, plan, players: [me], connected: true, serverOffset: 0,
      // A no-op: this test is about RENDERING each stage, not advancing.
      onPersist: () => {}, onExit: () => {},
    }));
    await settle(450);

    const body = visibleText();
    check(`stage "${stage}" reaches that stage`, run.stage === stage, `got ${run.stage}`);
    check(`stage "${stage}" renders something, not a blank page`,
      rootEl.childElementCount > 0 && body.length > 8,   // blank vs not-blank is the bar; the 3D stage may show its Suspense fallback
      `${body.length} chars: ${body.slice(0, 80)}`);
  }

  check("no React errors across every session stage",
    reactErrors.length === before,
    reactErrors.slice(before, before + 2).join(" | "));

  stageRoot.unmount();
}

/* ------------------- the mission demo / instructions ------------------- */

section("The mission briefing renders in both languages");

{
  const briefs = await server.ssrLoadModule("/src/missionBriefs.js");
  const { default: MissionDemo } = await server.ssrLoadModule("/src/MissionDemo.jsx");
  const { ROUND_GAMES } = await server.ssrLoadModule("/src/session.js");

  /* ---- the content itself ---- */

  check("every mission in the event plan has a briefing",
    ROUND_GAMES.every((id) => !!briefs.MISSION_BRIEFS[id]),
    ROUND_GAMES.filter((id) => !briefs.MISSION_BRIEFS[id]).join(", "));

  briefs.LANGUAGES.forEach((lang) => {
    const missing = [];
    ROUND_GAMES.forEach((id) => {
      const b = briefs.missionBrief(id, lang.id);
      if (!b || !b.title || !b.oneLiner || !b.goal) missing.push(`${id}:fields`);
      if (!b?.steps?.length) missing.push(`${id}:steps`);
      if (!b?.scoring?.length) missing.push(`${id}:scoring`);
    });
    check(`every mission is fully written in ${lang.label}`, missing.length === 0,
      missing.join(", "));

    const rules = briefs.eventRules(lang.id);
    check(`the rules and regulations exist in ${lang.label}`,
      !!rules?.title && (rules.items || []).length >= 5, `${rules?.items?.length} items`);
  });

  // A missing translation that silently falls back to English is worse
  // than no Tamil at all, because nobody notices.
  const untranslated = ROUND_GAMES.filter((id) => {
    const en = briefs.missionBrief(id, "en");
    const ta = briefs.missionBrief(id, "ta");
    return en.goal === ta.goal || en.title === ta.title;
  });
  check("the Tamil is actually translated, not the English repeated",
    untranslated.length === 0, untranslated.join(", "));

  check("the English rules are not the Tamil rules",
    briefs.eventRules("en").items[0] !== briefs.eventRules("ta").items[0]);

  // The voice-over reads the text on screen, so it has to have some.
  ROUND_GAMES.forEach((id) => {
    briefs.LANGUAGES.forEach((lang) => {
      const spoken = briefs.briefSpeech(id, lang.id);
      check(`${id} has a voice-over script in ${lang.short}`, spoken.length > 200,
        `${spoken.length} chars`);
    });
  });

  check("an unknown mission id does not throw",
    briefs.missionBrief("nope") === null && briefs.briefSpeech("nope") === "");

  /* ---- the screen ---- */

  const demoRoot = ReactDOMClient.createRoot(rootEl);
  const before = reactErrors.length;
  const emptyGame = { missionVideos: briefs.emptyMissionVideos() };

  for (const id of ROUND_GAMES) {
    for (const size of ["tv", "compact"]) {
      demoRoot.render(React.createElement(MissionDemo, {
        gameId: id, game: emptyGame, size, lang: "en", roundLabel: "ROUND 1 OF 5",
      }));
      // Wait for THIS mission's title rather than a fixed delay — the
      // briefing lazy-loads a 3D demo now, so a short sleep can still
      // be showing the previous mission when the check runs.
      const want = briefs.missionBrief(id, "en").title;
      for (let i = 0; i < 40 && !visibleText().includes(want); i++) await settle(60);
      const body = visibleText();
      check(`${id} briefing renders at size "${size}"`,
        body.includes(briefs.missionBrief(id, "en").title) && body.length > 200,
        `${body.length} chars: ${body.slice(0, 90)}`);

      /* It has to FIT. A briefing that runs to three panels and a
       * rules list does not fit a phone in landscape, so nobody reads
       * it and the demo video scrolls off the top. The rules are the
       * same every round, so they collapse behind a button. */
      check(`${id} briefing at "${size}" is short enough for one screen`,
        body.length < 900, `${body.length} chars`);
      check(`${id} briefing at "${size}" keeps the rules out of the way`,
        !body.includes("One phone, one player"),
        "the full rules list is expanded by default");
      check(`${id} briefing at "${size}" still offers the rules`,
        /rules and regulations/i.test(body), body.slice(-120));
    }
  }

  // Tamil must actually reach the screen, not just the data file.
  demoRoot.render(React.createElement(MissionDemo, {
    gameId: ROUND_GAMES[0], game: emptyGame, size: "tv", lang: "ta",
  }));
  await settle(150);
  const tamil = visibleText();
  check("the briefing renders in Tamil",
    tamil.includes(briefs.missionBrief(ROUND_GAMES[0], "ta").title),
    tamil.slice(0, 120));
  check("the Tamil screen is not showing the English text",
    !tamil.includes(briefs.missionBrief(ROUND_GAMES[0], "en").goal));

  // With no video the screen must SAY so rather than show a dead frame.
  demoRoot.render(React.createElement(MissionDemo, {
    gameId: ROUND_GAMES[0], game: emptyGame, size: "tv", lang: "en",
  }));
  await settle(150);
  // With no host video, the BUILT-IN 3D demo takes that slot. jsdom has
  // no WebGL, so what must be asserted here is that it degrades to a
  // readable message instead of an exception or an empty black box —
  // which is exactly what an old laptop at the venue would get.
  check("with no video the built-in demo takes the slot, not a dead frame",
    !rootEl.querySelector("video") && !rootEl.querySelector("iframe"));
  // Wait for the lazy chunk, so this cannot pass on the Suspense
  // placeholder and quietly stop testing the real fallback.
  for (let i = 0; i < 40 && visibleText().includes("Loading the 3D demo"); i++) await settle(100);
  check("without WebGL the demo says so rather than failing silently",
    visibleText().includes("cannot show 3D"),
    visibleText().slice(0, 220));
  check("the written briefing is shown whether or not the 3D demo runs",
    visibleText().includes(briefs.missionBrief(ROUND_GAMES[0], "en").goal));

  // And with one, it plays it.
  const withVideo = {
    missionVideos: {
      ...briefs.emptyMissionVideos(),
      [ROUND_GAMES[0]]: { en: "https://example.com/demo.mp4", ta: "" },
    },
  };
  demoRoot.render(React.createElement(MissionDemo, {
    gameId: ROUND_GAMES[0], game: withVideo, size: "tv", lang: "en",
  }));
  await settle(150);
  check("a pasted MP4 link becomes a video player",
    !!rootEl.querySelector("video"));
  check("the briefing is still shown underneath the video",
    visibleText().includes(briefs.missionBrief(ROUND_GAMES[0], "en").goal));

  // A Tamil viewer with only an English video still gets a video rather
  // than nothing, because one video is better than none.
  demoRoot.render(React.createElement(MissionDemo, {
    gameId: ROUND_GAMES[0], game: withVideo, size: "tv", lang: "ta",
  }));
  await settle(150);
  check("a missing Tamil video falls back to the English one",
    !!rootEl.querySelector("video"));

  // A hostile or broken URL must not become an embed.
  const badVideo = {
    missionVideos: {
      ...briefs.emptyMissionVideos(),
      [ROUND_GAMES[0]]: { en: "javascript:alert(1)", ta: "" },
    },
  };
  demoRoot.render(React.createElement(MissionDemo, {
    gameId: ROUND_GAMES[0], game: badVideo, size: "tv", lang: "en",
  }));
  await settle(150);
  check("a non-http video link is refused, not embedded",
    !rootEl.querySelector("video") && !rootEl.querySelector("iframe"));

  check("no React errors rendering any briefing",
    reactErrors.length === before, reactErrors.slice(before, before + 2).join(" | "));

  demoRoot.unmount();
}


/* ------------------- panels that fit the screen ------------------- */

section("A decision always fits the screen it is on");

{
  const { Overlay } = await server.ssrLoadModule("/src/arena/ui/primitives.jsx");
  const { DecisionDialog } = await server.ssrLoadModule("/src/arena/ui/GameShell.jsx");

  const fitRoot = ReactDOMClient.createRoot(rootEl);
  const before = reactErrors.length;

  /* ---- the overlay ----
   *
   * This is the bug the electrical-room screenshot showed. A flex item
   * centred with `align-items: center` that is TALLER than its
   * container overflows equally both ways, and the part above the top
   * cannot be scrolled to — the scrollbar will not go there. Auto
   * margins centre when there is room and collapse when there is not,
   * so the panel pins to the top and the whole thing scrolls. */
  fitRoot.render(React.createElement(Overlay, {},
    React.createElement("div", { id: "tall", style: { height: 4000 } }, "tall")));
  await settle(120);

  const overlay = rootEl.firstElementChild;
  check("the overlay scrolls", overlay?.style.overflowY === "auto", overlay?.style.overflowY);
  check("the overlay does NOT centre with align-items",
    overlay?.style.alignItems === "flex-start",
    `align-items: ${overlay?.style.alignItems}`);
  const wrapper = overlay?.firstElementChild;
  check("it centres with an auto margin instead, which stays scrollable",
    /auto/.test(wrapper?.style.margin || ""), `margin: ${wrapper?.style.margin}`);
  check("the centring wrapper cannot be squashed",
    wrapper?.style.flexShrink === "0", wrapper?.style.flexShrink);

  /* ---- the dialog itself ---- */
  const picked = [];
  const dialog = {
    eyebrow: "AREA 1 OF 5 — ELECTRICAL ROOM",
    title: "The door ahead is powered and the frame is live. How do you make it safe?",
    subtitle: "There is a distribution board, a local isolator for the door circuit, "
      + "and an emergency lighting inverter.",
    tone: "danger",
    options: [
      { id: "0", label: "Lock off the local isolator for the door circuit and prove it dead", badge: "A" },
      { id: "1", label: "Switch the whole distribution board off at the main switch", badge: "B" },
      { id: "2", label: "Pull the fuse for the door circuit and put it in your pocket", badge: "C" },
      { id: "3", label: "Tape over the frame and tell everyone not to touch it", badge: "D" },
    ],
    footer: "Right first time is worth double.",
    onPick: (id) => picked.push(id),
  };

  for (const mobile of [false, true]) {
    fitRoot.render(React.createElement(DecisionDialog, { dialog, mobile, accent: "#FFC629" }));
    await settle(120);

    // root > overlay > centring wrapper > panel
    const panel = rootEl.firstElementChild?.firstElementChild?.firstElementChild;
    check(`${mobile ? "phone" : "desktop"}: the panel is capped to the screen`,
      panel?.style.maxHeight === "100%", `max-height: ${panel?.style.maxHeight}`);
    check(`${mobile ? "phone" : "desktop"}: the panel is a column so it can scroll inside`,
      panel?.style.display === "flex" && panel?.style.flexDirection === "column",
      `${panel?.style.display} / ${panel?.style.flexDirection}`);

    // The question has to stay put while the ANSWERS scroll, so there
    // must be exactly one scrolling region inside the panel.
    const scrollers = [...(panel?.children || [])]
      .filter((c) => c.style.overflowY === "auto");
    check(`${mobile ? "phone" : "desktop"}: the answers are in a scrolling region`,
      scrollers.length === 1, `${scrollers.length} scrolling regions`);
    check(`${mobile ? "phone" : "desktop"}: that region can actually shrink`,
      scrollers[0]?.style.minHeight === "0px" || scrollers[0]?.style.minHeight === "0",
      `min-height: ${scrollers[0]?.style.minHeight}`);
    check(`${mobile ? "phone" : "desktop"}: the question is outside the scrolling region`,
      !!scrollers[0]
      && rootEl.textContent.includes("ELECTRICAL ROOM")
      && !scrollers[0].textContent.includes("ELECTRICAL ROOM"),
      "the question should stay put while the answers scroll");

    // And every answer is present and clickable.
    const answers = [...rootEl.querySelectorAll("button")]
      .filter((b) => /Lock off|Switch the whole|Pull the fuse|Tape over/.test(b.textContent || ""));
    check(`${mobile ? "phone" : "desktop"}: all four answers are on the page`,
      answers.length === 4, `${answers.length} answers`);
    check(`${mobile ? "phone" : "desktop"}: the answers are inside the scrolling region`,
      answers.every((a) => scrollers[0]?.contains(a)));
  }

  // Clicking one reports the REAL option id, not its slot.
  const answerB = [...rootEl.querySelectorAll("button")]
    .find((b) => (b.textContent || "").includes("Switch the whole"));
  answerB?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await settle(60);
  check("picking an answer reports its id", picked.includes("1"), JSON.stringify(picked));

  check("no React errors laying out a decision",
    reactErrors.length === before, reactErrors.slice(before, before + 2).join(" | "));

  fitRoot.unmount();
}

/* --------------------- a crash is never a blank page --------------------- */

section("A render error shows itself");

{
  /* Three separate blank pages reached the user on this project. Each
   * time the screen said nothing and the cause had to be reproduced
   * off-device. The boundary turns a throw into a readable report. */
  const { default: ErrorBoundary } = await server.ssrLoadModule("/src/ErrorBoundary.jsx");

  function Exploding() {
    throw new ReferenceError("round is not defined");
  }

  const boundaryRoot = ReactDOMClient.createRoot(rootEl);
  const before = reactErrors.length;
  boundaryRoot.render(React.createElement(ErrorBoundary, null, React.createElement(Exploding)));
  await settle(400);

  const body = visibleText();
  check("a thrown render does NOT leave a blank page",
    rootEl.childElementCount > 0 && body.length > 8, `${body.length} chars`);
  check("the screen says something broke",
    /something broke|failed to load/i.test(body), body.slice(0, 120));
  check("the actual error message is on screen",
    body.includes("round is not defined"), body.slice(0, 200));
  check("it reassures the participant their score is safe",
    /score and your answers are safe/i.test(body));
  check("it offers a way to recover",
    [...rootEl.querySelectorAll("button")].some((b) => /reload/i.test(b.textContent)));

  // The boundary logs the throw too, so the console still has the stack.
  check("the error is still logged for the console",
    reactErrors.length > before);

  boundaryRoot.unmount();
}


/* ------------------------- the on-screen stick ------------------------- */

section("The stick says what it drives, and comes in three kinds");

/* "Why am I getting a joystick in the tower crane — I said don't mix
 * them, use a proper joystick. Add a control for what type of joystick
 * they want."
 *
 * A crane cab has no walk stick. The same component drives the walk in
 * four missions and the crane's slew and trolley in the fifth, and it
 * was labelled MOVE in both. It now says what it drives, marks what
 * each direction does, and comes in three kinds the player picks. */
{
  const { default: Joystick, JOYSTICK_STYLES } =
    await server.ssrLoadModule("/src/arena/ui/Joystick.jsx");
  const { controlLayoutFor } = await server.ssrLoadModule("/src/arena/ui/GameShell.jsx");

  /* ---- one kind of control per machine ----
   *
   * The cab had a stick for slew and trolley AND a rocker desk for
   * hoist, pinned to the same corner, so the stick covered the desk. */
  const cab = (touch, joystickStyle) => controlLayoutFor({ scheme: "crane", touch, joystickStyle });

  check("the cab never shows a stick and a rocker desk at once",
    [["fixed", true], ["floating", true], ["dpad", true], ["fixed", false], ["dpad", false]]
      .every(([style, touch]) => !(cab(touch, style).stick && cab(touch, style).desk)),
    JSON.stringify([cab(true, "fixed"), cab(true, "dpad"), cab(false, "fixed")]));
  check("on a phone the cab is driven by the stick",
    cab(true, "fixed").stick && !cab(true, "fixed").desk);
  check("and the hoist moves to the buttons when the stick has the other two axes",
    cab(true, "fixed").hoistButtons === true);
  check("choosing buttons gives the full three-rocker desk instead",
    cab(true, "dpad").desk && !cab(true, "dpad").stick && !cab(true, "dpad").hoistButtons);
  check("on a desktop the cab is always the desk",
    cab(false, "fixed").desk && !cab(false, "fixed").stick);
  check("the hoist is always reachable somehow",
    [["fixed", true], ["floating", true], ["dpad", true], ["fixed", false]]
      .every(([style, touch]) => cab(touch, style).desk || cab(touch, style).hoistButtons));

  // The walking missions are unaffected: a stick, and no crane desk.
  const walk = controlLayoutFor({ scheme: "walk", touch: true, joystickStyle: "fixed" });
  check("a walking mission still just has its stick",
    walk.stick && !walk.desk && !walk.hoistButtons);
  check("a mission with no controls gets none",
    controlLayoutFor({ scheme: "none", touch: true }).stick === false);

  const { DEFAULT_SETTINGS, CAMERA_DISTANCES, cameraScale } =
    await server.ssrLoadModule("/src/arena/identity.js");

  check("there are three kinds of control to choose from",
    JOYSTICK_STYLES.length === 3
    && new Set(JOYSTICK_STYLES.map((j) => j.id)).size === 3,
    JOYSTICK_STYLES.map((j) => j.id).join(", "));
  check("every one of them is named and explained",
    JOYSTICK_STYLES.every((j) => j.label && j.desc));
  check("the default is one of them",
    JOYSTICK_STYLES.some((j) => j.id === DEFAULT_SETTINGS.joystickStyle),
    DEFAULT_SETTINGS.joystickStyle);
  check("the camera starts at the closest setting",
    DEFAULT_SETTINGS.cameraDistance === CAMERA_DISTANCES[0].id
    && cameraScale({ cameraDistance: DEFAULT_SETTINGS.cameraDistance }) === 1,
    DEFAULT_SETTINGS.cameraDistance);
  check("the wider settings really are wider",
    CAMERA_DISTANCES.every((d, i) => i === 0 || d.scale > CAMERA_DISTANCES[i - 1].scale),
    CAMERA_DISTANCES.map((d) => `${d.id}:${d.scale}`).join(" "));

  /* A stand-in for the engine's input object: all the stick does is
   * write a vector into it. */
  function fakeInput() {
    const calls = [];
    return { calls, setJoystick: (x, y) => calls.push({ x, y }), addZoom() {} };
  }

  const probe = document.createElement("div");
  document.body.appendChild(probe);
  const probeRoot = ReactDOMClient.createRoot(probe);
  const probeText = () => (probe.textContent || "").replace(/\s+/g, " ").trim();
  const errorsBefore = reactErrors.length;

  /* ---- the walking missions ---- */
  probeRoot.render(React.createElement(Joystick, { input: fakeInput(), label: "MOVE" }));
  await settle(200);
  check("the walking stick is labelled MOVE", probeText().includes("MOVE"), probeText());

  /* ---- the crane cab ---- */
  probeRoot.render(React.createElement(Joystick, {
    input: fakeInput(),
    label: "SLEW · TROLLEY",
    axisHints: { up: "OUT", down: "IN", left: "SLEW", right: "SLEW" },
  }));
  await settle(200);
  let t = probeText();
  check("the crane's stick is not labelled MOVE", !/\bMOVE\b/.test(t), t);
  check("it says it slews and trolleys", /SLEW/.test(t) && /TROLLEY/.test(t), t);
  // Read the hints off the elements rather than the run-together text:
  // the four sit at the four edges of the base with nothing between them.
  const hintTexts = [...probe.querySelectorAll("div")]
    .map((d) => (d.textContent || "").trim())
    .filter((x) => x.length > 0 && x.length < 12);
  check("each direction is marked",
    hintTexts.includes("OUT") && hintTexts.includes("IN"), hintTexts.join(" | "));

  /* ---- every kind actually drives the input ---- */
  function press(el, type, extra = {}) {
    const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 1, clientX: 0, clientY: 0, button: 0, ...extra });
    el.dispatchEvent(event);
  }

  for (const style of JOYSTICK_STYLES.map((j) => j.id)) {
    const input = fakeInput();
    probeRoot.render(React.createElement(Joystick, { input, style, label: "MOVE" }));
    await settle(200);

    if (style === "dpad") {
      const up = [...probe.querySelectorAll("button")]
        .find((b) => (b.getAttribute("aria-label") || "").startsWith("up"));
      check("the four-button control has an up button", !!up,
        [...probe.querySelectorAll("button")].map((b) => b.getAttribute("aria-label")).join(", "));
      if (up) {
        press(up, "pointerdown");
        await settle(60);
        const last = input.calls[input.calls.length - 1];
        check("pressing up on the four-button control drives forward",
          !!last && last.y > 0.9 && Math.abs(last.x) < 0.001, JSON.stringify(last));
        press(up, "pointerup");
        await settle(60);
        const released = input.calls[input.calls.length - 1];
        check("letting go stops the player",
          !!released && released.x === 0 && released.y === 0, JSON.stringify(released));
      }
    } else {
      const pad = probe.firstElementChild;
      // jsdom reports every box as 0x0, so the geometry is supplied.
      pad.getBoundingClientRect = () => ({ left: 0, top: 0, width: 132, height: 132, right: 132, bottom: 132 });
      pad.setPointerCapture = () => {};
      pad.releasePointerCapture = () => {};
      press(pad, "pointerdown", { clientX: 66, clientY: 66 });
      press(pad, "pointermove", { clientX: 66, clientY: 10 });
      await settle(60);
      const last = input.calls[input.calls.length - 1];
      check(`the ${style} stick drives forward when pushed up`,
        !!last && last.y > 0.3, `${style}: ${JSON.stringify(last)}`);
      press(pad, "pointerup", { clientX: 66, clientY: 10 });
      await settle(60);
      const released = input.calls[input.calls.length - 1];
      check(`the ${style} stick springs back to nothing on release`,
        !!released && released.x === 0 && released.y === 0, JSON.stringify(released));
    }
  }

  check("no React errors rendering any of the controls",
    reactErrors.length === errorsBefore, reactErrors.slice(errorsBefore).join(" | "));

  probeRoot.unmount();
  probe.remove();
}

/* --------------------- no free variables anywhere --------------------- */

section("Every identifier a component uses is one it actually has");

/* This is the scan for the fault that reached a player mid-quiz:
 *
 *     function QuestionReveal({ question, result, ... }) {
 *       ...{tOptions(question, lang)[question.correct]}...
 *
 * `lang` is a piece of state in the PARENT. Inside this component it is
 * a free variable. Nothing catches that — `vite build` compiles it, the
 * headless 3D suites never mount React, and the screen itself only
 * renders once somebody has answered a question. So the first time it
 * was seen was on a phone, in a live session, as "Can't find variable:
 * lang" over a dead page.
 *
 * Babel's scope analysis already knows the answer: anything referenced
 * and never bound shows up in the program scope's `globals`. */
{
  const { parse } = await import("@babel/parser");
  const traverseModule = await import("@babel/traverse");
  const traverse = traverseModule.default?.default || traverseModule.default;
  const { readdirSync, statSync, readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");

  /* The browser and Node names a module is allowed to reach for. Kept
   * explicit rather than pulled from a globals package, because the
   * point of the list is to be read. */
  const AMBIENT = new Set([
    "window", "document", "console", "setTimeout", "clearTimeout", "setInterval",
    "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "fetch",
    "localStorage", "sessionStorage", "navigator", "location", "history", "URL",
    "URLSearchParams", "Date", "Math", "JSON", "Object", "Array", "String",
    "Number", "Boolean", "Promise", "Map", "Set", "WeakMap", "WeakSet", "Error",
    "RegExp", "Symbol", "Infinity", "NaN", "undefined", "globalThis", "process",
    "performance", "FileReader", "Blob", "Image", "Audio", "AudioContext",
    "webkitAudioContext", "MouseEvent", "KeyboardEvent", "Event", "CustomEvent",
    "ResizeObserver", "IntersectionObserver", "MutationObserver", "TextEncoder",
    "TextDecoder", "structuredClone", "queueMicrotask", "alert", "confirm",
    "prompt", "getComputedStyle", "matchMedia", "crypto", "btoa", "atob",
    "HTMLElement", "Element", "Node", "Float32Array", "Uint8Array", "Uint16Array",
    "Uint32Array", "Int32Array", "ArrayBuffer", "DataView", "Intl", "parseInt",
    "parseFloat", "isNaN", "isFinite", "encodeURIComponent", "decodeURIComponent",
    "AbortController", "Response", "Request", "Headers", "FormData", "DOMParser",
    "XMLHttpRequest", "speechSynthesis", "SpeechSynthesisUtterance",
    "BarcodeDetector", "ImageData", "OffscreenCanvas", "createImageBitmap",
    "Function", "Proxy", "Reflect", "BigInt", "module", "require", "exports",
  ]);

  function freeVariables(code) {
    const ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "optionalChaining", "nullishCoalescingOperator", "classProperties"],
    });
    const found = [];
    traverse(ast, {
      Program(p) {
        Object.entries(p.scope.globals).forEach(([name, node]) => {
          if (AMBIENT.has(name)) return;
          found.push(`${name} (line ${node.loc?.start?.line})`);
        });
      },
    });
    return found;
  }

  /* ---- prove the scan works before trusting what it says ---- */
  const BAD = `
    import React from "react";
    function Parent() {
      const [lang] = React.useState("en");
      return <Child value={1} />;
    }
    function Child({ value }) {
      return <span>{value} {lang}</span>;
    }
  `;
  const GOOD = BAD.replace("<Child value={1} />", "<Child value={1} lang={lang} />")
    .replace("function Child({ value })", "function Child({ value, lang })");

  check("the scan flags a variable read from another component's scope",
    freeVariables(BAD).some((f) => f.startsWith("lang")), JSON.stringify(freeVariables(BAD)));
  check("the scan accepts the same code with it passed as a prop",
    freeVariables(GOOD).length === 0, JSON.stringify(freeVariables(GOOD)));

  /* ---- and now every source file ---- */
  function sources(dir, out = []) {
    for (const entry of readdirSync(dir)) {
      const full = `${dir}/${entry}`;
      if (statSync(full).isDirectory()) sources(full, out);
      else if (/\.(js|jsx)$/.test(entry)) out.push(full);
    }
    return out;
  }

  const files = sources(fileURLToPath(new URL("../src", import.meta.url)).split("\\").join("/"));
  check("the scan found the source tree", files.length > 20, `${files.length} files`);

  const offenders = [];
  for (const file of files) {
    let free = [];
    try {
      free = freeVariables(readFileSync(file, "utf8"));
    } catch (e) {
      offenders.push(`${file}: could not be parsed — ${e.message}`);
      continue;
    }
    if (free.length) offenders.push(`${file.split("/src/")[1]}: ${free.join(", ")}`);
  }
  check(`no file uses a name it never binds (${files.length} files)`,
    offenders.length === 0, offenders.slice(0, 4).join(" | "));
}

/* ---------------------- hooks above early returns ---------------------- */

section("Hooks never sit below an early return");

{
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");

  // A known-bad sample, so a scan that silently stops working is caught
  // rather than quietly passing forever.
  const SAMPLE_BAD = [
    "function Broken() {",
    "  const [a, setA] = useState(0);",
    "  if (!a) {",
    "    return <p>locked</p>;",
    "  }",
    "  const b = useMemo(() => a * 2, [a]);",
    "  return <p>{b}</p>;",
    "}",
  ].join("\n");

  const SAMPLE_GOOD = [
    "function Fine() {",
    "  const [a, setA] = useState(0);",
    "  const b = useMemo(() => a * 2, [a]);",
    "  if (!a) {",
    "    return <p>locked</p>;",
    "  }",
    "  return <p>{b}</p>;",
    "}",
  ].join("\n");

  // A `return` inside a multi-line hook callback must NOT be mistaken
  // for an early return, or every real finding gets lost in noise.
  const SAMPLE_NESTED_RETURN = [
    "function AlsoFine() {",
    "  const a = useMemo(() => {",
    "    return 1;",
    "  }, []);",
    "  const [b, setB] = useState(a);",
    "  return <p>{b}</p>;",
    "}",
  ].join("\n");

  const src = read("../src/App.jsx");

  /**
   * Extracts a function's body by matching braces from its opening `{`.
   * Splitting on regex boundaries instead gave false positives, because
   * `const X = React.memo(function X(...))` is not a line-start
   * declaration and one component's body swallowed the next.
   */
  function bodyAt(text, from) {
    const open = text.indexOf("{", from);
    if (open < 0) return "";
    let depth = 0;
    for (let i = open; i < text.length; i++) {
      const ch = text[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) return text.slice(open, i + 1);
      }
    }
    return text.slice(open);
  }

  /**
   * Any capitalised function is a candidate component — this catches
   * `function AdminView(`, `export default function App(` and
   * `React.memo(function RoleCard(` alike, and ignores plain data.
   * Returns the offending lines.
   */
  function scan(text) {
    const offenders = [];
    const found = [...text.matchAll(/function ([A-Z]\w*)\s*\(/g)];
    found.forEach((m) => {
      // Track brace depth so we only look at the component's OWN
      // statements. Depth 1 is the function body; anything deeper is a
      // nested callback, whose `return` is irrelevant and whose hooks
      // are not this component's.
      //
      // Indentation alone is not enough in either direction: real early
      // returns sit inside an `if` block (deeper than the body), and a
      // `return` inside a multi-line useMemo callback must NOT count.
      // `guard[d]` records whether the block at depth d was opened by a
      // control-flow statement (`if` / `else`). A `return` only counts
      // as an early return when it is either directly in the body
      // (depth 1) or inside such a guard — which is exactly how real
      // early returns are written, and which correctly ignores a
      // `return` inside a multi-line useMemo callback.
      let depth = 0;
      const guard = [false];
      let sawEarlyReturn = false;

      for (const line of bodyAt(text, m.index).split("\n")) {
        const depthAtLineStart = depth;
        const opensGuard = /^\s*(?:\}\s*else\b|if\s*\(|else\b)/.test(line);
        for (const ch of line) {
          if (ch === "{") { depth++; guard[depth] = opensGuard; }
          else if (ch === "}") depth--;
        }

        const inGuard = depthAtLineStart >= 1 && guard[depthAtLineStart];
        if ((depthAtLineStart === 1 || inGuard) && /^\s*return[ (;]/.test(line)) {
          sawEarlyReturn = true;
        }
        if (sawEarlyReturn && depthAtLineStart === 1
          && /^\s*(?:const|let)?\s*.*\buse(?:State|Effect|Memo|Callback|Ref|LayoutEffect)\s*\(/.test(line)) {
          offenders.push(`${m[1]}: ${line.trim().slice(0, 70)}`);
        }
      }
    });
    return { offenders, scanned: found.length };
  }

  // Prove the detector works before trusting what it says about the app.
  check("the detector flags a hook below an early return",
    scan(SAMPLE_BAD).offenders.length === 1, JSON.stringify(scan(SAMPLE_BAD).offenders));
  check("the detector accepts the same component written correctly",
    scan(SAMPLE_GOOD).offenders.length === 0, JSON.stringify(scan(SAMPLE_GOOD).offenders));
  check("the detector ignores a return inside a hook callback",
    scan(SAMPLE_NESTED_RETURN).offenders.length === 0,
    JSON.stringify(scan(SAMPLE_NESTED_RETURN).offenders));

  const { offenders, scanned } = scan(src);

  check(`the scan found components to check`, scanned > 20, `${scanned}`);
  check(`App.jsx: no hook after a top-level return (${scanned} components)`,
    offenders.length === 0, offenders.slice(0, 3).join(" | "));

  // SoloSession has the same shape: several early returns for the
  // waiting / mission / result screens, with hooks above them.
  const solo = scan(read("../src/SoloSession.jsx"));
  check(`SoloSession.jsx: no hook after a top-level return (${solo.scanned} components)`,
    solo.offenders.length === 0, solo.offenders.slice(0, 3).join(" | "));
}

section("Joining needs a name and an employee number");

{
  const { validateJoinDetails } = await server.ssrLoadModule("/src/App.jsx");
  const game = { gameCode: "123456" };
  const existing = [{ id: "a", name: "Ravi", employeeId: "EMP-1001", gameCode: "123456" }];

  check("a name on its own is not enough",
    validateJoinDetails({ name: "Suresh" }, { game, players: [] }).includes("employee number"),
    validateJoinDetails({ name: "Suresh" }, { game, players: [] }));
  check("an employee number on its own is not enough",
    validateJoinDetails({ employeeId: "EMP-2002" }, { game, players: [] }).includes("name"));
  check("whitespace does not pass for a name",
    validateJoinDetails({ name: "   ", employeeId: "EMP-2002" }, { game, players: [] }) !== "");
  check("whitespace does not pass for an employee number",
    validateJoinDetails({ name: "Suresh", employeeId: "  " }, { game, players: [] }) !== "");
  check("both together are accepted",
    validateJoinDetails({ name: "Suresh", employeeId: "EMP-2002" }, { game, players: [] }) === "",
    validateJoinDetails({ name: "Suresh", employeeId: "EMP-2002" }, { game, players: [] }));

  /* One employee number, one record. A second record for the same person
   * is a second score and a second place on the leaderboard. */
  const dup = validateJoinDetails({ name: "Someone else", employeeId: "EMP-1001" },
    { game, players: existing });
  check("an employee number that has already joined is refused",
    dup.includes("already joined") && dup.includes("Ravi"), dup);
  check("the refusal is case-insensitive",
    validateJoinDetails({ name: "x", employeeId: "emp-1001" }, { game, players: existing }) !== "");
  check("the same number in a DIFFERENT game is fine",
    validateJoinDetails({ name: "x", employeeId: "EMP-1001" },
      { game: { gameCode: "999999" }, players: existing }) === "");
  check("team mode still asks for a team",
    validateJoinDetails({ name: "x", employeeId: "EMP-3003" },
      { game: { gameCode: "123456", teamModeEnabled: true }, players: [] }).includes("team"));
}

section("The TV shows the live session and the final result");

/* Releasing a round used to leave the TV with nothing to project: the
 * game status goes to "question", and the TV tried to render plan row 0
 * — a 3D mission — as a multiple-choice question. These render the two
 * new displays with a room part-way through Round 2. */
{
  const { LiveSessionDisplay, SessionResultsDisplay, tvScreenFor } =
    await server.ssrLoadModule("/src/App.jsx");

  /* ---- which screen the TV picks ----
   *
   * This is the part that was broken: once a round is open there is no
   * one question to show, so "question" has to mean "show the room". */
  check("with no game the TV shows nothing",
    tvScreenFor(null) === "none");
  check("before Round 1 the TV shows the join code",
    tvScreenFor({ status: "lobby", releasedRound: -1 }) === "lobby");
  check("releasing a round puts the live board up",
    tvScreenFor({ status: "question", releasedRound: 0 }) === "live",
    tvScreenFor({ status: "question", releasedRound: 0 }));
  check("it stays up for every later round",
    tvScreenFor({ status: "question", releasedRound: 4 }) === "live");
  check("the host can still put the briefing up mid-event",
    tvScreenFor({ status: "demo", releasedRound: 2 }) === "demo");
  check("the host can still put the race up mid-event",
    tvScreenFor({ status: "leaderboard", releasedRound: 2 }) === "leaderboard");
  check("the host can still put the join code back up",
    tvScreenFor({ status: "lobby", releasedRound: 2 }) === "lobby");
  check("ending the event shows the results",
    tvScreenFor({ status: "ended", releasedRound: 4 }) === "results");
  /* The old lock-step mode is still reachable for a game that never
   * released a round, so a legacy record does not lose its display. */
  check("a game with no round released still uses the old question screen",
    tvScreenFor({ status: "question", releasedRound: -1 }) === "question");
  check("and its reveal screen",
    tvScreenFor({ status: "reveal", releasedRound: -1 }) === "reveal");

  const { buildEventPlan, createRun, STAGES } = await server.ssrLoadModule("/src/session.js");

  const plan = buildEventPlan({});
  // Row indexes for the start of each stage type in round 2.
  const round2 = plan.findIndex((item) => item.roundIndex === 1);

  const runAt = (itemIndex, stage) => ({
    ...createRun(plan, { now: 0 }),
    itemIndex,
    stage,
    answers: Object.fromEntries(
      Array.from({ length: Math.max(0, itemIndex - 2) }, (_, i) => [i, { points: 100, correct: true }])),
    games: { 0: { points: 700, completed: true } },
    rounds: { 0: { elapsedMs: 240000, bonus: 180 } },
  });

  const people = [
    { id: "p1", name: "Ravi Kumar", employeeId: "EMP-1001", company: "Casagrand",
      gameCode: "123456", score: 2400, playingMs: 240000,
      session: runAt(round2, STAGES.GAME3D) },
    { id: "p2", name: "Suresh Babu", employeeId: "EMP-1002",
      gameCode: "123456", score: 2100, playingMs: 262000,
      session: runAt(round2 + 1, STAGES.QUIZ) },
    { id: "p3", name: "Meena R", employeeId: "EMP-1003",
      gameCode: "123456", score: 1800, playingMs: 300000,
      session: runAt(round2 + 4, STAGES.MILLIONAIRE) },
    { id: "p4", name: "Arun P", employeeId: "EMP-1004",
      gameCode: "123456", score: 1500, playingMs: 210000,
      session: { ...runAt(round2, STAGES.ROUND_DONE) } },
    // Somebody who has joined but whose session has not been dealt yet:
    // the TV must not throw on them.
    { id: "p5", name: "No Session", employeeId: "EMP-1005", gameCode: "123456", score: 0 },
  ];

  const probe = document.createElement("div");
  document.body.appendChild(probe);
  const probeRoot = ReactDOMClient.createRoot(probe);
  const probeText = () => (probe.textContent || "").replace(/\s+/g, " ").trim();
  /* Counted from HERE. An earlier section deliberately throws inside an
   * error boundary to prove a crash is never a blank page, so the error
   * list is not empty by the time this runs. */
  const errorsBefore = reactErrors.length;

  // ---- the live board ----
  probeRoot.render(React.createElement(LiveSessionDisplay, {
    game: { gameCode: "123456", status: "question", releasedRound: 1 },
    players: people,
    plan,
    releasedRound: 1,
  }));
  await settle(300);
  let t = probeText();

  check("the live board renders", t.length > 40, `${t.length} chars: ${t.slice(0, 100)}`);
  check("it says which round is open", /ROUND 2 OF 5/.test(t), t.slice(0, 120));
  check("it names everybody in the room",
    people.every((p) => t.includes(p.name)),
    people.filter((p) => !t.includes(p.name)).map((p) => p.name).join(", "));
  check("it shows employee numbers, so a name on the screen is a person",
    t.includes("EMP-1001") && t.includes("EMP-1005"));
  check("it says what the player in the spotlight is actually doing",
    /NOW PLAYING/.test(t) && /3D MISSION|QUIZ QUESTION|FINALE QUESTION/.test(t), t.slice(0, 200));
  /* Which mission falls in round 2 is shuffled per participant, so the
   * assertion is that SOME mission is named, not which. */
  const { ROUND_MISSION_NAMES } = await server.ssrLoadModule("/src/session.js");
  check("it names the 3D mission somebody is in",
    Object.values(ROUND_MISSION_NAMES).some((name) => t.includes(name)),
    t.slice(0, 240));
  check("it counts who is playing and who has finished",
    /3 playing/.test(t), t.slice(0, 200));
  check("it shows the live scores", t.includes("2400") && t.includes("1500"));
  check("it shows the join code so latecomers can still get in",
    t.includes("123456"));
  check("a participant with no session yet does not break it",
    t.includes("No Session") && /Waiting to start/.test(t), t.slice(0, 200));
  check("no React errors rendering the live board",
    reactErrors.length === errorsBefore,
    reactErrors.slice(errorsBefore).join(" | "));

  // ---- the final result ----
  const finished = people.map((p) => ({
    ...p,
    session: p.session ? { ...p.session, stage: STAGES.DONE, itemIndex: plan.length - 1 } : undefined,
  }));
  probeRoot.render(React.createElement(SessionResultsDisplay, {
    players: [...finished].sort((a, b) => (b.score || 0) - (a.score || 0)),
    plan,
  }));
  await settle(300);
  t = probeText();

  check("the final results render", /FINAL RESULTS/.test(t), t.slice(0, 120));
  check("the podium names a winner", /WINNER/.test(t) && t.includes("Ravi Kumar"), t.slice(0, 200));
  check("second and third are named too", /SECOND/.test(t) && /THIRD/.test(t));
  check("every participant is on the sheet",
    finished.every((p) => t.includes(p.name)),
    finished.filter((p) => !t.includes(p.name)).map((p) => p.name).join(", "));
  check("the sheet carries employee numbers",
    finished.filter((p) => p.employeeId).every((p) => t.includes(p.employeeId)));
  check("the score is broken down, not just a total",
    /MISSIONS/.test(t) && /QUIZ/.test(t) && /FINALE/.test(t) && /SPEED/.test(t) && /TOTAL/.test(t),
    t.slice(0, 240));
  check("playing time is shown, which is what breaks a tie", /\d+m \d\ds/.test(t), t.slice(0, 240));
  check("no React errors rendering the results",
    reactErrors.length === errorsBefore,
    reactErrors.slice(errorsBefore).join(" | "));

  probeRoot.unmount();
  probe.remove();
}

/* ------------------------------- report ------------------------------- */

console.error = origError;
await server.close();

if (otherErrors.length) {
  console.log(`\nNon-fatal errors logged by the app (${otherErrors.length}):`);
  otherErrors.slice(0, 4).forEach((e) => console.log(`  - ${e.slice(0, 160)}`));
  console.log("  (an arena/feed index error here just means rules.json has not been published yet)");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  - ${f}`));
}
process.exit(fail ? 1 : 0);
