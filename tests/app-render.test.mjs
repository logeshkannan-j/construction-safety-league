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
        body.includes(briefs.missionBrief(id, "en").title) && body.length > 300,
        `${body.length} chars: ${body.slice(0, 90)}`);
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
