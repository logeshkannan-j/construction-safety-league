/* ------------------------------------------------------------------ *
 *  3D SAFETY GAMING ARENA — shared constants
 *
 *  Deliberately reuses the quiz's COLORS palette (see App.jsx) so the
 *  Arena looks like part of the same product, and keeps every Realtime
 *  Database path for the Arena under a single `arena/` root so it can
 *  never collide with the existing `game` / `questions` / `players`
 *  paths the quiz owns.
 * ------------------------------------------------------------------ */

// Mirrors COLORS in App.jsx. Kept as its own object so the Arena never
// has to import from the 2,600-line quiz file (and so the quiz stays
// editable without breaking games).
export const C = {
  bg: "#14171A",
  surface: "#1C2126",
  surfaceRaised: "#242A31",
  line: "#333B43",
  yellow: "#FFC629",
  orange: "#FF5A1F",
  green: "#33C481",
  red: "#EA4F4F",
  ink: "#F3F1EA",
  muted: "#909AA3",
  purple: "#9B7CF2",
  blue: "#59B7FF",
};

/* ---------------------------- difficulty ---------------------------- */

export const DIFFICULTIES = [
  {
    id: "easy",
    label: "Trainee",
    desc: "Generous timers, hazard hints on, forgiving scoring",
    color: C.green,
    // Multipliers/flags consumed by each game's config.
    timeScale: 1.45,
    scoreScale: 0.85,
    hints: true,
    penaltyScale: 0.5,
  },
  {
    id: "normal",
    label: "Site Officer",
    desc: "Realistic timers and full scoring",
    color: C.yellow,
    timeScale: 1,
    scoreScale: 1,
    hints: false,
    penaltyScale: 1,
  },
  {
    id: "hard",
    label: "Safety Manager",
    desc: "Tight timers, no hints, heavy penalties for mistakes",
    color: C.red,
    timeScale: 0.72,
    scoreScale: 1.3,
    hints: false,
    penaltyScale: 1.5,
  },
];

export function getDifficulty(id) {
  return DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[1];
}

/* ------------------------- the five games -------------------------- */

// `maxScore` is an ANTI-CHEAT CEILING, not a target: it sits
// comfortably above what a flawless run on Safety Manager difficulty
// can score, and both this file and the Realtime Database security
// rules in rules.json reject any submission above it. The performance
// RATING a player sees is computed from in-game performance instead
// (see `performance` on a run result), so it is not affected by this
// number. If you raise a game's scoring, raise this and re-publish
// rules.json.
/* ---------------------------- the site ---------------------------- */

// Every mission is set on this development. Kept here (not in kit.js)
// so the HUD and the briefing screens can show it without pulling
// three.js into their chunk.
export const SITE_NAME = "CASAGRAND ARIA";
export const SITE_SUBTITLE = "19 FLOORS · RESIDENTIAL TOWER";

export const GAMES = [
  {
    id: "safety-mission",
    title: "Safety Mission Simulator",
    tagline: "Walk the site. Find what's wrong. Fix it.",
    description:
      "You are the site safety officer. Patrol a live multi-storey construction site on foot, inspect hazards, classify them correctly and choose the right corrective action before the shift ends.",
    accent: C.orange,
    icon: "hardhat",
    minutes: "6–10 min",
    skills: ["Hazard identification", "Risk classification", "Corrective action"],
    controls: "move-look-interact",
    maxScore: 12000,
  },
  {
    id: "crane-master",
    title: "Tower Crane Master",
    tagline: "Slew, trolley, hoist — without swinging a load over anyone.",
    description:
      "Take the cab of a tower crane and move one bundle from the marked pick-up board to the marked landing board. The lift is the easy part: five things go wrong AROUND the load while it is in the air — bad rigging, a man under it, an open landing area, a swing you cannot control, and a radio call telling you to cut the corner. Each one stops the crane dead until you deal with it.",
    accent: C.yellow,
    icon: "crane",
    minutes: "5–9 min",
    skills: ["Lifting operations", "Exclusion zones", "Load control"],
    controls: "crane",
    maxScore: 12000,
  },
  {
    id: "safest-tower",
    title: "Spot the Hazards",
    tagline: "A sign is not a control.",
    description:
      "Walk the ground-level site compound before the shift starts. Ten things down here are wrong — an open riser, an unguarded edge, a live lead in water, loose cylinders, a blocked fire exit and more. Walk up to each one and choose the control that actually removes the risk, not the one that just warns people it is there.",
    accent: C.green,
    icon: "tower",
    minutes: "5–9 min",
    skills: ["Hazard recognition", "Hierarchy of control", "Corrective action"],
    controls: "build",
    maxScore: 12000,
  },
  {
    id: "escape-challenge",
    title: "Safety Escape Challenge",
    tagline: "Five areas. One safe way out.",
    description:
      "The alarm has gone off on a newly fitted-out floor. Five areas stand between you and the way out, and each door is locked. Deal with the safety problem in an area and a key is cut for it — then you have to find that key, pick it up, carry it to the door and unlock it yourself. Put a real fire out with your own hands on the way, and reach the assembly area before the clock kills the run.",
    accent: C.purple,
    icon: "escape",
    minutes: "6–11 min",
    skills: ["Isolation", "Fire classes", "Evacuation", "PPE selection"],
    controls: "move-look-interact",
    maxScore: 12000,
  },
  {
    id: "emergency-commander",
    title: "Emergency Response Commander",
    tagline: "Something has gone wrong. You're in charge.",
    description:
      "An incident unfolds live on your site. There is no list of options — the eight steps of a real response are eight objects you have to find and use: the call point, the intake panel, the muster marker, the cones, the first-aid post, the radio, the gate. Order matters, the clock runs, and walking into the incident yourself is always available and always wrong.",
    accent: C.red,
    icon: "emergency",
    minutes: "5–10 min",
    skills: ["Incident command", "Hierarchy of response", "Evacuation control"],
    controls: "command",
    maxScore: 12000,
  },
];

export const GAME_IDS = GAMES.map((g) => g.id);

export function getGame(id) {
  return GAMES.find((g) => g.id === id) || null;
}

/* --------------------------- achievements --------------------------- */

// `test` receives ({ profile, run }) where `run` is the run that just
// finished (may be null when re-evaluating an existing profile).
export const ACHIEVEMENTS = [
  {
    id: "safety-rookie",
    name: "Safety Rookie",
    desc: "Complete your first Arena mission",
    color: C.green,
    test: ({ profile }) => (profile.runCount || 0) >= 1,
  },
  {
    id: "hazard-hunter",
    name: "Hazard Hunter",
    desc: "Find every hazard in a Safety Mission run",
    color: C.orange,
    test: ({ run }) => run && run.gameId === "safety-mission" && run.stats?.allFound === true,
  },
  {
    id: "crane-master",
    name: "Crane Master",
    desc: "Complete Tower Crane Master with no safety violations",
    color: C.yellow,
    test: ({ run }) => run && run.gameId === "crane-master" && run.completed && (run.stats?.violations || 0) === 0,
  },
  {
    id: "compliance-officer",
    name: "Compliance Officer",
    desc: "Score 100% compliance in Build the Safest Tower",
    color: C.blue,
    test: ({ run }) => run && run.gameId === "safest-tower" && (run.accuracy || 0) >= 100,
  },
  {
    id: "escape-artist",
    name: "Escape Artist",
    desc: "Escape the building with zero wrong decisions",
    color: C.purple,
    test: ({ run }) => run && run.gameId === "escape-challenge" && run.completed && (run.stats?.mistakes || 0) === 0,
  },
  {
    id: "emergency-hero",
    name: "Emergency Hero",
    desc: "Command an emergency with no casualties lost",
    color: C.red,
    test: ({ run }) => run && run.gameId === "emergency-commander" && run.completed && (run.stats?.casualties || 0) === 0,
  },
  {
    id: "safety-expert",
    name: "Safety Expert",
    desc: "Complete a mission on Safety Manager difficulty",
    color: C.yellow,
    test: ({ run }) => run && run.completed && run.difficulty === "hard",
  },
  {
    id: "flawless",
    name: "Flawless Run",
    desc: "Finish any mission at 100% accuracy",
    color: C.green,
    test: ({ run }) => run && (run.accuracy || 0) >= 100,
  },
  {
    id: "construction-champion",
    name: "Construction Champion",
    desc: "Complete all five Arena games",
    color: C.orange,
    test: ({ profile }) => GAME_IDS.every((id) => (profile.bestScores || {})[id] > 0),
  },
];

/* ------------------------- performance rating ------------------------- */

// Shared 6-band rating used by every results screen so a "GOLD" means
// the same thing in all five games.
export const RATING_BANDS = [
  { min: 95, label: "PLATINUM", sub: "Exemplary safety leadership", color: "#D9E6F2" },
  { min: 85, label: "GOLD", sub: "Strong, consistent safety judgement", color: C.yellow },
  { min: 70, label: "SILVER", sub: "Competent — a few gaps to close", color: "#C7CCD1" },
  { min: 55, label: "BRONZE", sub: "Passing, but review the misses", color: "#D08A54" },
  { min: 35, label: "NEEDS WORK", sub: "Re-read the briefing and try again", color: C.orange },
  { min: 0, label: "UNSAFE", sub: "This run would not pass a real audit", color: C.red },
];

export function ratingFor(percent) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  return RATING_BANDS.find((b) => p >= b.min) || RATING_BANDS[RATING_BANDS.length - 1];
}

/* ---------------------------- graphics ---------------------------- */

export const QUALITY_LEVELS = [
  { id: "low", label: "Low", desc: "No shadows, lowest resolution — only if the game stutters" },
  { id: "medium", label: "Medium", desc: "Soft shadows, balanced resolution" },
  { id: "high", label: "High", desc: "Full shadows and resolution — the default on every device" },
];

/* -------------------------- local storage -------------------------- */

export const ARENA_SETTINGS_KEY = "csl:arena:settings:v1";
export const ARENA_NAME_KEY = "csl:arena:name:v1";
