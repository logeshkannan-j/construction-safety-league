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
]);
const denied = settled === "denied"
  || visibleText().includes("The database is refusing this app");

if (denied) {
  console.log("  NOTE  the live database is denying access — asserting the warning is shown");
  check("a denied database is reported, not silently shown as empty",
    visibleText().includes("Permission denied"));
  check("the warning says how to fix it",
    visibleText().includes("rules.json") && visibleText().includes("Publish"));
  check("the warning reassures that the data is intact",
    visibleText().includes("your data is still there"));
} else {
  check("the live game record loads from Firebase", settled === "game",
    "still showing: " + visibleText().slice(0, 160));
}

text = visibleText();
check("the admin panel is not blank", text.length > 50, `${text.length} chars`);
check("the admin panel renders its title", text.includes("Admin Control Panel"), text.slice(0, 160));
if (!denied) {
  check("the admin panel renders Game status", text.includes("Game status"));
  check("the admin panel renders the session mode chooser", text.includes("How participants play"));
  check("the admin panel renders the Arena section", text.includes("3D Gaming Arena"));
}
check("NO React errors after unlocking admin", reactErrors.length === 0,
  reactErrors.slice(0, 2).join(" | "));

// This is the exact failure mode that shipped: a hook below an early
// return only blows up on the SECOND render, once the PIN is accepted.
check("no hook-order violation in the admin panel",
  !reactErrors.some((e) => /Rendered (more|fewer) hooks/.test(e)),
  reactErrors.find((e) => /Rendered (more|fewer) hooks/.test(e)) || "");

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
