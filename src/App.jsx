import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  HardHat, Users, Trophy, Clock, CheckCircle2, XCircle, Play, Pause,
  SkipForward, RotateCcw, Eye, EyeOff, Award, Wifi, WifiOff, Flag,
  ChevronRight, Shield, Zap, Crown, QrCode, LogIn, Volume2, VolumeX,
  Target, Upload, Trash2, MapPin, ImagePlus, X, Percent, Phone, Gem, Ban,
  Pencil, UserMinus, Save, AlertTriangle, ListChecks, Lock
} from "lucide-react";

/* ------------------------------------------------------------------ *
 *  CONSTRUCTION SAFETY LEAGUE (standalone build)
 *  A live, multiplayer safety-quiz game.
 *  Shared state (game/questions/players) lives in Firebase Realtime
 *  Database and is polled every POLL_MS, so this works across an
 *  Admin laptop, a TV tab, and player phones as long as they all load
 *  this same deployed site and share one Firebase project.
 *  Your own "which player am I" id is kept in the browser's
 *  localStorage (see ./storage.js), same as before.
 * ------------------------------------------------------------------ */

import { GAME_KEY, Q_KEY, PLAYER_PREFIX, MY_ID_KEY, POLL_MS } from "./constants";
import { safeGet, safeSet, safeDelete, safeList, getServerTimeOffset } from "./storage";

const COLORS = {
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
};

// Local (per-browser, NOT synced to Firebase) flag that remembers this
// device already unlocked the Admin panel once, so re-opening the admin
// link on the SAME device skips the PIN. Nothing is written anywhere
// shared, so sharing the game/join link never grants anyone else access.
const ADMIN_UNLOCKED_KEY = "csl_admin_unlocked_v1";
const ADMIN_PIN_KEY = "csl_admin_pin_v1";
const GAME_QUESTION_SECONDS = 100;
const GAME_QUESTION_COUNT = 20;
const QUESTION_BANK_SKIP_COUNT = 5;
const HOSTED_APP_URL = "https://logeshkannan-j.github.io/construction-safety-league/";

const SEED_QUESTIONS = [
  { round: "quiz", category: "Work at Height", difficulty: "Easy", question: "A worker is working at height. What is the most important fall protection equipment?", options: ["Gloves", "Full Body Harness", "Safety Goggles", "Face Mask"], correct: 1, timer: 15, points: 100, explanation: "A properly worn and anchored full body harness is the primary defense against a fall from height." },
  { round: "truefalse", category: "Electrical Safety", difficulty: "Easy", question: "A damaged electrical cable can be temporarily repaired using normal tape and used for construction work.", options: ["TRUE", "FALSE"], correct: 1, timer: 10, points: 100, explanation: "Damaged cables must be taken out of service and repaired or replaced by a qualified person — never patched with ordinary tape." },
  { round: "quiz", category: "Lifting Operations", difficulty: "Medium", question: "A crane is lifting materials. A worker enters the area below the suspended load. What should you do?", options: ["Let them pass quickly", "Stop them and keep everyone clear of the load", "Keep lifting", "Take a photo only"], correct: 1, timer: 15, points: 150, explanation: "No one should ever be under a suspended load — stop work and clear the area immediately." },
  { round: "truefalse", category: "Housekeeping", difficulty: "Easy", question: "Good housekeeping helps prevent slips, trips, and falls.", options: ["TRUE", "FALSE"], correct: 0, timer: 10, points: 100, explanation: "Clear, organized work areas remove the trip and slip hazards that cause many site injuries." },
  { round: "quiz", category: "Scaffolding", difficulty: "Medium", question: "Before using a scaffold, what should you check first?", options: ["The paint colour", "That it has a valid inspection tag", "How tall it is", "Nothing, just climb up"], correct: 1, timer: 15, points: 150, explanation: "A current inspection tag confirms the scaffold has been checked and is safe to use." },
  { round: "quiz", category: "PPE", difficulty: "Easy", question: "Which of these is NOT standard PPE on a construction site?", options: ["Safety helmet", "High-visibility vest", "Steel-toe boots", "Flip-flops"], correct: 3, timer: 15, points: 100, explanation: "Open footwear like flip-flops offers no protection and is never acceptable on site." },
  { round: "truefalse", category: "Ladder Safety", difficulty: "Medium", question: "It is safe to stand on the top rung of a ladder to reach higher.", options: ["TRUE", "FALSE"], correct: 1, timer: 10, points: 100, explanation: "Standing on the top rung removes your handhold and balance — always stay below the manufacturer's limit." },
  { round: "quiz", category: "Excavation Safety", difficulty: "Hard", question: "What is the main hazard of an unshored trench deeper than 1.5 metres?", options: ["Noise", "Cave-in / collapse", "Bad smell", "Sunburn"], correct: 1, timer: 20, points: 200, explanation: "Unsupported trenches can collapse suddenly and without warning — shoring or sloping is required." },
  { round: "quiz", category: "Fire Safety", difficulty: "Medium", question: "What should you do first if you discover a small fire on site?", options: ["Ignore it", "Raise the alarm and follow the evacuation plan", "Take a video", "Keep working nearby"], correct: 1, timer: 15, points: 150, explanation: "Raising the alarm first protects everyone else on site, even before attempting to fight a small fire." },
  { round: "truefalse", category: "Permit to Work", difficulty: "Medium", question: "Hot work (welding/cutting) can be started without a permit if it will only take a few minutes.", options: ["TRUE", "FALSE"], correct: 1, timer: 10, points: 100, explanation: "Hot work always requires a permit, regardless of how long the task will take." },
  { round: "quiz", category: "Manual Handling", difficulty: "Easy", question: "When lifting a heavy object from the ground, you should:", options: ["Bend your back and lift", "Bend your knees and keep your back straight", "Twist while lifting", "Lift as fast as possible"], correct: 1, timer: 15, points: 100, explanation: "Bending the knees and keeping the back straight lets your legs take the load, protecting your spine." },
  { round: "quiz", category: "Barricading", difficulty: "Medium", question: "An open floor edge on site should be protected with:", options: ["A warning sign only", "Barricades or guardrails", "Nothing, workers will notice", "Tape on the floor"], correct: 1, timer: 15, points: 150, explanation: "Physical barricades or guardrails are required at open edges — signage alone does not stop a fall." },
];

// 10 additional questions covering more categories.
const EXTRA_QUESTIONS = [
  { round: "quiz", category: "Chemical Safety", difficulty: "Medium", question: "What should you check before using a chemical product on site?", options: ["The colour of the container", "The Safety Data Sheet (SDS)", "How full the container is", "Nothing, just use it"], correct: 1, timer: 15, points: 150, explanation: "The SDS tells you the hazards, required PPE, and safe handling steps before you use any chemical." },
  { round: "truefalse", category: "PPE", difficulty: "Easy", question: "Eye protection is only required when using power tools.", options: ["TRUE", "FALSE"], correct: 1, timer: 10, points: 100, explanation: "Eye protection is also needed around dust, chemical splashes, grinding sparks, and other hazards, not just power tools." },
  { round: "quiz", category: "Confined Space", difficulty: "Hard", question: "Before entering a confined space, what must first be arranged?", options: ["A quick peek inside", "A permit and atmospheric testing", "Just a torch", "Nothing if it's a small space"], correct: 1, timer: 20, points: 200, explanation: "A permit and air testing confirm the space is safe to breathe in and that an entry plan is in place." },
  { round: "quiz", category: "Traffic Management", difficulty: "Medium", question: "Reversing a vehicle on a busy site should always be guided by:", options: ["No one, the driver can see fine", "A trained banksman / spotter", "Another driver in a different vehicle", "Nobody, just use mirrors"], correct: 1, timer: 15, points: 150, explanation: "A trained banksman covers blind spots the driver cannot see and helps prevent struck-by incidents." },
  { round: "truefalse", category: "Noise", difficulty: "Easy", question: "Hearing protection is only needed if the noise is painful to hear.", options: ["TRUE", "FALSE"], correct: 1, timer: 10, points: 100, explanation: "Hearing damage can build up from prolonged exposure to noise well below the level that feels painful." },
  { round: "quiz", category: "First Aid", difficulty: "Easy", question: "What is the first thing you should do when someone is injured on site?", options: ["Move them immediately", "Check the scene is safe, then get help", "Take a photo first", "Keep working nearby"], correct: 1, timer: 15, points: 100, explanation: "Checking the scene is safe protects you from becoming a second casualty before you assist or call for help." },
  { round: "quiz", category: "Lifting Operations", difficulty: "Hard", question: "What must be checked before every crane lift?", options: ["Next week's weather forecast", "The load weight against the crane's rated capacity", "The operator's lunch break", "Nothing, cranes are always safe"], correct: 1, timer: 20, points: 200, explanation: "Exceeding a crane's rated capacity for the load and radius can cause a tip-over or structural failure." },
  { round: "truefalse", category: "Signage", difficulty: "Easy", question: "Warning signs can be ignored if you've worked on the site before.", options: ["TRUE", "FALSE"], correct: 1, timer: 10, points: 100, explanation: "Site conditions change daily — signage must always be followed, regardless of experience." },
  { round: "quiz", category: "Environmental", difficulty: "Medium", question: "A spill of oil on site should be:", options: ["Left to evaporate", "Contained and reported immediately", "Washed into the nearest drain", "Covered with soil only"], correct: 1, timer: 15, points: 150, explanation: "Containing the spill and reporting it quickly limits environmental damage and keeps it out of drains." },
  { round: "quiz", category: "Working Alone", difficulty: "Medium", question: "A lone worker on site should always:", options: ["Turn off their phone to focus", "Have a check-in procedure with a supervisor", "Avoid telling anyone their location", "Skip PPE to move faster"], correct: 1, timer: 15, points: 150, explanation: "A regular check-in procedure means someone will notice quickly if a lone worker doesn't respond." },
];

// A simple, self-drawn construction-site scene (no external image dependency)
// used as the default "Spot the Hazard" round. Coordinates below are % of
// this 100x100 viewBox and line up with the hazard marker positions.
const SEED_HAZARD_SVG = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block">
  <rect x="0" y="0" width="100" height="48" fill="#8FC7DE"/>
  <rect x="0" y="48" width="100" height="52" fill="#B79B6E"/>
  <circle cx="86" cy="10" r="7" fill="#FFE9A8"/>
  <rect x="55" y="18" width="32" height="18" fill="#9AA3AB"/>
  <rect x="55" y="18" width="32" height="3" fill="#7A828A"/>
  <rect x="55" y="18" width="4" height="30" fill="#7A828A"/>
  <rect x="83" y="18" width="4" height="18" fill="#7A828A"/>
  <line x1="60" y1="30" x2="82" y2="30" stroke="#C4CBD1" stroke-width="1.5"/>
  <line x1="65" y1="18" x2="65" y2="30" stroke="#C4CBD1" stroke-width="1.5"/>
  <line x1="75" y1="18" x2="75" y2="30" stroke="#C4CBD1" stroke-width="1.5"/>
  <rect x="10" y="55" width="3" height="34" fill="#6B5433"/>
  <rect x="21" y="58" width="3" height="31" fill="#6B5433"/>
  <line x1="10" y1="60" x2="21" y2="63" stroke="#6B5433" stroke-width="2"/>
  <line x1="10" y1="70" x2="21" y2="73" stroke="#6B5433" stroke-width="2"/>
  <line x1="10" y1="80" x2="21" y2="83" stroke="#6B5433" stroke-width="2"/>
  <circle cx="25" cy="45" r="4.2" fill="#E8B48A"/>
  <rect x="21.3" y="48.5" width="7.4" height="12" rx="2" fill="#FF7A1F"/>
  <line x1="21.5" y1="52" x2="16" y2="60" stroke="#E8B48A" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="28.5" y1="52" x2="33" y2="60" stroke="#E8B48A" stroke-width="2.4" stroke-linecap="round"/>
  <line x1="23.5" y1="60" x2="21" y2="72" stroke="#3B3F45" stroke-width="2.6" stroke-linecap="round"/>
  <line x1="27" y1="60" x2="30" y2="72" stroke="#3B3F45" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M45 66 L50 69 L47 71 L54 76 L49 76 L55 82" fill="none" stroke="#D6362C" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="40" y="64" width="24" height="3" fill="#3B3F45" opacity="0.25"/>
</svg>`;

const SEED_HAZARD_QUESTION = {
  round: "hazard",
  category: "Spot the Hazard",
  difficulty: "Medium",
  question: "FIND THE HAZARDS!",
  imageType: "svg",
  imageSvg: SEED_HAZARD_SVG,
  timer: 45,
  wrongPenalty: 0,
  bonusAll: 100,
  explanation: "Look for missing PPE, work-at-height risks, and damaged equipment.",
  hazards: [
    { id: "h1", xPct: 25, yPct: 50, radiusPct: 9, name: "Worker without a hard hat", description: "The worker at ground level has no head protection.", points: 60 },
    { id: "h2", xPct: 78, yPct: 27, radiusPct: 10, name: "Unprotected open edge", description: "The elevated platform has no guardrail at the open edge.", points: 60 },
    { id: "h3", xPct: 50, yPct: 74, radiusPct: 9, name: "Damaged electrical cable", description: "A frayed, exposed cable is lying on the ground.", points: 60 },
    { id: "h4", xPct: 16, yPct: 72, radiusPct: 9, name: "Unsafe ladder angle", description: "The ladder is leaning too steep and is not secured.", points: 60 },
  ],
};
SEED_QUESTIONS.splice(4, 0, SEED_HAZARD_QUESTION);

// A second self-drawn "Spot the Hazard" scene — an excavation / trench site.
const SEED_HAZARD_SVG_2 = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block">
  <rect x="0" y="0" width="100" height="40" fill="#A9D4E8"/>
  <rect x="0" y="40" width="100" height="60" fill="#C2A878"/>
  <rect x="30" y="55" width="40" height="30" fill="#5B4630"/>
  <rect x="30" y="55" width="40" height="4" fill="#8B7355"/>
  <rect x="20" y="50" width="14" height="8" fill="#9C8B6E"/>
  <rect x="66" y="50" width="14" height="8" fill="#9C8B6E"/>
  <circle cx="18" cy="46" r="4" fill="#E8B48A"/>
  <rect x="15" y="49" width="6" height="10" fill="#3B4A5A"/>
  <line x1="15" y1="52" x2="10" y2="58" stroke="#E8B48A" stroke-width="2" stroke-linecap="round"/>
  <line x1="21" y1="52" x2="25" y2="58" stroke="#E8B48A" stroke-width="2" stroke-linecap="round"/>
  <line x1="16.5" y1="59" x2="14" y2="70" stroke="#2A3038" stroke-width="2.2" stroke-linecap="round"/>
  <line x1="19.5" y1="59" x2="22" y2="70" stroke="#2A3038" stroke-width="2.2" stroke-linecap="round"/>
  <rect x="76" y="60" width="10" height="16" fill="#D0432A"/>
  <rect x="70" y="58" width="18" height="20" fill="none" stroke="#5B4630" stroke-width="1.5" opacity="0.6"/>
  <rect x="68" y="72" width="20" height="8" fill="#8B6F47"/>
  <path d="M40 60 L44 63 L41 65 L48 70 L43 70 L49 76" fill="none" stroke="#D6362C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const SEED_HAZARD_QUESTION_2 = {
  round: "hazard",
  category: "Spot the Hazard — Excavation Site",
  difficulty: "Hard",
  question: "FIND THE HAZARDS!",
  imageType: "svg",
  imageSvg: SEED_HAZARD_SVG_2,
  timer: 45,
  wrongPenalty: 0,
  bonusAll: 100,
  explanation: "Look for unguarded trenches, missing hi-vis, blocked emergency equipment, and damaged cables.",
  hazards: [
    { id: "h2a", xPct: 18, yPct: 52, radiusPct: 9, name: "Worker without high-visibility vest", description: "The worker near the trench is not wearing hi-vis clothing.", points: 60 },
    { id: "h2b", xPct: 50, yPct: 58, radiusPct: 10, name: "Unguarded trench edge", description: "The excavation has no barrier or edge protection.", points: 60 },
    { id: "h2c", xPct: 80, yPct: 70, radiusPct: 9, name: "Blocked fire extinguisher", description: "Boxes are stacked in front of the fire extinguisher, blocking access.", points: 60 },
    { id: "h2d", xPct: 44, yPct: 68, radiusPct: 9, name: "Damaged cable near the trench", description: "A frayed cable is lying close to the excavation edge.", points: 60 },
  ],
};

// ---- Small reusable SVG "glyphs" so more Spot the Hazard scenes can be
// composed quickly without hand-drawing a full illustration each time. ----
function svgWorker(cx, cy, { helmet = true, vest = true } = {}) {
  const skin = "#E8B48A";
  const vestColor = vest ? "#FF7A1F" : "#3B4A5A";
  return `
    <circle cx="${cx}" cy="${cy - 6}" r="3.2" fill="${skin}"/>
    ${helmet ? `<path d="M ${cx - 3.4} ${cy - 7.2} a 3.4 3.4 0 0 1 6.8 0 Z" fill="#FFC629"/>` : ""}
    <rect x="${cx - 3}" y="${cy - 3}" width="6" height="9" rx="1.5" fill="${vestColor}"/>
    <line x1="${cx - 3}" y1="${cy - 1}" x2="${cx - 6}" y2="${cy + 4}" stroke="${skin}" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="${cx + 3}" y1="${cy - 1}" x2="${cx + 6}" y2="${cy + 4}" stroke="${skin}" stroke-width="1.8" stroke-linecap="round"/>
    <line x1="${cx - 1.5}" y1="${cy + 6}" x2="${cx - 3}" y2="${cy + 15}" stroke="#2A3038" stroke-width="2" stroke-linecap="round"/>
    <line x1="${cx + 1.5}" y1="${cy + 6}" x2="${cx + 3}" y2="${cy + 15}" stroke="#2A3038" stroke-width="2" stroke-linecap="round"/>
  `;
}
function svgLadder(cx, cy, steep = true) {
  const dx = steep ? 4 : 10;
  return `
    <line x1="${cx - dx}" y1="${cy - 16}" x2="${cx - dx + 2}" y2="${cy + 16}" stroke="#6B5433" stroke-width="1.6"/>
    <line x1="${cx + dx}" y1="${cy - 16}" x2="${cx + dx + 2}" y2="${cy + 16}" stroke="#6B5433" stroke-width="1.6"/>
    <line x1="${cx - dx + 0.5}" y1="${cy - 10}" x2="${cx + dx + 0.5}" y2="${cy - 10}" stroke="#6B5433" stroke-width="1.4"/>
    <line x1="${cx - dx + 1}" y1="${cy - 2}" x2="${cx + dx + 1}" y2="${cy - 2}" stroke="#6B5433" stroke-width="1.4"/>
    <line x1="${cx - dx + 1.5}" y1="${cy + 6}" x2="${cx + dx + 1.5}" y2="${cy + 6}" stroke="#6B5433" stroke-width="1.4"/>
  `;
}
function svgCable(cx, cy) {
  return `<path d="M ${cx - 6} ${cy} L ${cx - 2} ${cy + 3} L ${cx - 4} ${cy + 5} L ${cx + 2} ${cy + 9} L ${cx - 1} ${cy + 9} L ${cx + 5} ${cy + 14}" fill="none" stroke="#D6362C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
}
function svgTrench(cx, cy, w = 24, h = 14) {
  return `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" fill="#5B4630"/><rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="3" fill="#8B7355"/>`;
}
function svgOpenEdge(cx, cy, w = 26) {
  return `<rect x="${cx - w / 2}" y="${cy}" width="${w}" height="4" fill="#9AA3AB"/><rect x="${cx - w / 2}" y="${cy}" width="${w}" height="1.5" fill="#7A828A"/>`;
}
function svgBlockedExtinguisher(cx, cy) {
  return `<rect x="${cx - 2}" y="${cy - 8}" width="4" height="8" fill="#D0432A"/><rect x="${cx - 6}" y="${cy - 2}" width="12" height="6" fill="#8B6F47"/>`;
}
function svgRebar(cx, cy) {
  return `<line x1="${cx - 3}" y1="${cy + 6}" x2="${cx - 3}" y2="${cy - 6}" stroke="#8A8F94" stroke-width="1.4"/><line x1="${cx}" y1="${cy + 6}" x2="${cx}" y2="${cy - 8}" stroke="#8A8F94" stroke-width="1.4"/><line x1="${cx + 3}" y1="${cy + 6}" x2="${cx + 3}" y2="${cy - 5}" stroke="#8A8F94" stroke-width="1.4"/>`;
}
function svgSpill(cx, cy) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="9" ry="4" fill="#3A5A6E" opacity="0.75"/>`;
}
function svgOverheadLine(cx, cy) {
  return `<line x1="${cx - 30}" y1="${cy}" x2="${cx + 30}" y2="${cy - 4}" stroke="#333" stroke-width="1"/><circle cx="${cx - 30}" cy="${cy + 10}" r="1.6" fill="#333"/><circle cx="${cx + 30}" cy="${cy + 6}" r="1.6" fill="#333"/>`;
}
function svgBlockedExit(cx, cy) {
  return `<rect x="${cx - 6}" y="${cy - 14}" width="12" height="18" fill="#4A5560"/><rect x="${cx - 8}" y="${cy}" width="16" height="8" fill="#8B6F47"/>`;
}
function svgUnsafeStack(cx, cy) {
  return `<rect x="${cx - 6}" y="${cy}" width="12" height="6" fill="#8B6F47"/><rect x="${cx - 4}" y="${cy - 6}" width="10" height="6" fill="#A9835A" transform="rotate(6 ${cx} ${cy - 3})"/><rect x="${cx - 2}" y="${cy - 12}" width="8" height="6" fill="#8B6F47" transform="rotate(-8 ${cx} ${cy - 9})"/>`;
}
function sceneBase(sky, ground, extras) {
  return `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block">
  <rect x="0" y="0" width="100" height="42" fill="${sky}"/>
  <rect x="0" y="42" width="100" height="58" fill="${ground}"/>
  ${extras}
</svg>`;
}

// Scene 3 — Warehouse Yard
const SEED_HAZARD_QUESTION_3 = {
  round: "hazard", category: "Spot the Hazard — Warehouse Yard", difficulty: "Medium", question: "FIND THE HAZARDS!",
  imageType: "svg",
  imageSvg: sceneBase("#9FD1E0", "#B7A87E", svgWorker(22, 58, { helmet: false, vest: true }) + svgUnsafeStack(55, 74) + svgBlockedExit(82, 62) + svgRebar(40, 80)),
  timer: 45, wrongPenalty: 0, bonusAll: 100,
  explanation: "Look for missing head protection, unstable stacking, a blocked exit, and exposed rebar.",
  hazards: [
    { id: "h3a", xPct: 22, yPct: 55, radiusPct: 9, name: "Worker without a hard hat", description: "No head protection worn near stacked materials.", points: 60 },
    { id: "h3b", xPct: 55, yPct: 70, radiusPct: 9, name: "Unstable material stacking", description: "Crates are stacked unevenly and could topple.", points: 60 },
    { id: "h3c", xPct: 82, yPct: 60, radiusPct: 9, name: "Blocked fire exit", description: "Storage boxes are blocking the emergency exit door.", points: 60 },
    { id: "h3d", xPct: 40, yPct: 76, radiusPct: 9, name: "Exposed rebar without caps", description: "Uncapped rebar sticking up is an impalement hazard.", points: 60 },
  ],
};

// Scene 4 — Rooftop Work
const SEED_HAZARD_QUESTION_4 = {
  round: "hazard", category: "Spot the Hazard — Rooftop Work", difficulty: "Hard", question: "FIND THE HAZARDS!",
  imageType: "svg",
  imageSvg: sceneBase("#8FC7DE", "#C9C2B0", svgOpenEdge(70, 50) + svgLadder(18, 72, true) + svgWorker(45, 66, { helmet: false, vest: true }) + svgOverheadLine(60, 12)),
  timer: 45, wrongPenalty: 0, bonusAll: 100,
  explanation: "Look for the unguarded roof edge, an unsafe ladder angle, missing head protection, and nearby overhead lines.",
  hazards: [
    { id: "h4a", xPct: 70, yPct: 52, radiusPct: 10, name: "Unguarded roof edge", description: "No guardrail along the open edge of the roof.", points: 60 },
    { id: "h4b", xPct: 18, yPct: 70, radiusPct: 9, name: "Unsafe ladder angle", description: "The ladder is too steep and not tied off.", points: 60 },
    { id: "h4c", xPct: 45, yPct: 62, radiusPct: 9, name: "Worker without a hard hat", description: "No head protection on the roof.", points: 60 },
    { id: "h4d", xPct: 60, yPct: 14, radiusPct: 10, name: "Work too close to overhead power lines", description: "Work is happening near live overhead lines without clearance.", points: 60 },
  ],
};

// Scene 5 — Loading Dock
const SEED_HAZARD_QUESTION_5 = {
  round: "hazard", category: "Spot the Hazard — Loading Dock", difficulty: "Medium", question: "FIND THE HAZARDS!",
  imageType: "svg",
  imageSvg: sceneBase("#A9D4E8", "#B0A98F", svgBlockedExtinguisher(20, 66) + svgUnsafeStack(52, 72) + svgSpill(75, 78) + svgWorker(38, 60, { helmet: true, vest: false })),
  timer: 45, wrongPenalty: 0, bonusAll: 100,
  explanation: "Look for blocked emergency equipment, unstable stacking, a slip hazard, and missing hi-vis.",
  hazards: [
    { id: "h5a", xPct: 20, yPct: 62, radiusPct: 9, name: "Blocked fire extinguisher", description: "Boxes are stacked in front of the extinguisher.", points: 60 },
    { id: "h5b", xPct: 52, yPct: 68, radiusPct: 9, name: "Unstable material stacking", description: "Crates are stacked unevenly at the dock.", points: 60 },
    { id: "h5c", xPct: 75, yPct: 78, radiusPct: 9, name: "Spilled liquid — slip hazard", description: "A puddle on the dock floor has not been cleaned up or signed.", points: 60 },
    { id: "h5d", xPct: 38, yPct: 56, radiusPct: 9, name: "Worker without a hi-vis vest", description: "The worker near moving loads has no high-visibility clothing.", points: 60 },
  ],
};

// Scene 6 — Demolition Site
const SEED_HAZARD_QUESTION_6 = {
  round: "hazard", category: "Spot the Hazard — Demolition Site", difficulty: "Hard", question: "FIND THE HAZARDS!",
  imageType: "svg",
  imageSvg: sceneBase("#B7C6CC", "#A99B84", svgRebar(24, 70) + svgTrench(55, 76) + svgCable(78, 62) + svgWorker(42, 58, { helmet: false, vest: true })),
  timer: 45, wrongPenalty: 0, bonusAll: 100,
  explanation: "Look for exposed rebar, an unguarded excavation, damaged cabling, and missing head protection.",
  hazards: [
    { id: "h6a", xPct: 24, yPct: 66, radiusPct: 9, name: "Exposed rebar without caps", description: "Uncapped rebar left standing on the demolition site.", points: 60 },
    { id: "h6b", xPct: 55, yPct: 74, radiusPct: 10, name: "Unguarded excavation", description: "An open pit with no barrier around it.", points: 60 },
    { id: "h6c", xPct: 78, yPct: 66, radiusPct: 9, name: "Damaged electrical cable", description: "A frayed cable is exposed near debris.", points: 60 },
    { id: "h6d", xPct: 42, yPct: 54, radiusPct: 9, name: "Worker without a hard hat", description: "No head protection amid falling-debris risk.", points: 60 },
  ],
};

// Scene 7 — Road Works
const SEED_HAZARD_QUESTION_7 = {
  round: "hazard", category: "Spot the Hazard — Road Works", difficulty: "Medium", question: "FIND THE HAZARDS!",
  imageType: "svg",
  imageSvg: sceneBase("#8FC7DE", "#8C8C8C", svgTrench(35, 68, 22, 12) + svgOpenEdge(65, 60) + svgOverheadLine(50, 12) + svgWorker(20, 58, { helmet: true, vest: false })),
  timer: 45, wrongPenalty: 0, bonusAll: 100,
  explanation: "Look for an unguarded road excavation, missing barriers, overhead line clearance, and missing hi-vis.",
  hazards: [
    { id: "h7a", xPct: 35, yPct: 68, radiusPct: 10, name: "Unguarded road excavation", description: "A trench in the roadway with no barrier or cones.", points: 60 },
    { id: "h7b", xPct: 65, yPct: 62, radiusPct: 9, name: "Missing edge protection", description: "The excavated edge has no barricade to warn traffic and pedestrians.", points: 60 },
    { id: "h7c", xPct: 50, yPct: 14, radiusPct: 10, name: "Work too close to overhead power lines", description: "Equipment is operating without safe clearance from the line.", points: 60 },
    { id: "h7d", xPct: 20, yPct: 56, radiusPct: 9, name: "Worker without a hi-vis vest", description: "No high-visibility clothing worn near live traffic.", points: 60 },
  ],
};

// Scene 8 — Electrical Room
const SEED_HAZARD_QUESTION_8 = {
  round: "hazard", category: "Spot the Hazard — Electrical Room", difficulty: "Hard", question: "FIND THE HAZARDS!",
  imageType: "svg",
  imageSvg: sceneBase("#CFCFCF", "#B8B3A4", svgCable(24, 62) + svgSpill(55, 80) + svgBlockedExtinguisher(80, 64) + svgWorker(42, 58, { helmet: false, vest: true })),
  timer: 45, wrongPenalty: 0, bonusAll: 100,
  explanation: "Look for damaged wiring, liquid near electrical equipment, blocked emergency gear, and missing PPE.",
  hazards: [
    { id: "h8a", xPct: 24, yPct: 58, radiusPct: 9, name: "Damaged electrical cable", description: "A frayed cable is exposed inside the electrical room.", points: 60 },
    { id: "h8b", xPct: 55, yPct: 80, radiusPct: 9, name: "Liquid spill near electrical equipment", description: "A puddle sits close to live electrical equipment — a shock hazard.", points: 60 },
    { id: "h8c", xPct: 80, yPct: 60, radiusPct: 9, name: "Blocked fire extinguisher", description: "Access to the extinguisher is blocked by stored items.", points: 60 },
    { id: "h8d", xPct: 42, yPct: 54, radiusPct: 9, name: "Worker without a hard hat", description: "No head protection while working around overhead risks.", points: 60 },
  ],
};

// Scene 9 — Scaffold Access
const SEED_HAZARD_QUESTION_9 = {
  round: "hazard", category: "Spot the Hazard — Scaffold Access", difficulty: "Medium", question: "FIND THE HAZARDS!",
  imageType: "svg",
  imageSvg: sceneBase("#8FC7DE", "#B79B6E", svgLadder(20, 70, true) + svgOpenEdge(60, 48) + svgWorker(60, 62, { helmet: false, vest: true }) + svgUnsafeStack(82, 76)),
  timer: 45, wrongPenalty: 0, bonusAll: 100,
  explanation: "Look for an unsafe ladder angle, an unguarded platform edge, missing head protection, and unstable storage.",
  hazards: [
    { id: "h9a", xPct: 20, yPct: 68, radiusPct: 9, name: "Unsafe ladder angle", description: "The access ladder is too steep and not secured.", points: 60 },
    { id: "h9b", xPct: 60, yPct: 50, radiusPct: 10, name: "Unguarded scaffold platform edge", description: "The scaffold platform has no guardrail at the open edge.", points: 60 },
    { id: "h9c", xPct: 60, yPct: 58, radiusPct: 9, name: "Worker without a hard hat", description: "No head protection on the scaffold platform.", points: 60 },
    { id: "h9d", xPct: 82, yPct: 74, radiusPct: 9, name: "Unstable material stacking", description: "Materials stacked unevenly at the base of the scaffold.", points: 60 },
  ],
};

// Scene 10 — Site Storage Yard
const SEED_HAZARD_QUESTION_10 = {
  round: "hazard", category: "Spot the Hazard — Site Storage Yard", difficulty: "Medium", question: "FIND THE HAZARDS!",
  imageType: "svg",
  imageSvg: sceneBase("#A9D4E8", "#B7A87E", svgUnsafeStack(24, 70) + svgRebar(52, 78) + svgBlockedExit(80, 60) + svgSpill(40, 60)),
  timer: 45, wrongPenalty: 0, bonusAll: 100,
  explanation: "Look for unstable stacking, exposed rebar, a blocked exit route, and an unmarked spill.",
  hazards: [
    { id: "h10a", xPct: 24, yPct: 66, radiusPct: 9, name: "Unstable material stacking", description: "Stored materials are stacked unevenly and could topple.", points: 60 },
    { id: "h10b", xPct: 52, yPct: 74, radiusPct: 9, name: "Exposed rebar without caps", description: "Uncapped rebar left standing in the storage yard.", points: 60 },
    { id: "h10c", xPct: 80, yPct: 58, radiusPct: 9, name: "Blocked emergency exit route", description: "Stored crates are blocking a walkway used as an exit route.", points: 60 },
    { id: "h10d", xPct: 40, yPct: 56, radiusPct: 9, name: "Unmarked spill", description: "A liquid spill on the ground has no warning sign or cleanup.", points: 60 },
  ],
};

SEED_QUESTIONS.push(...EXTRA_QUESTIONS);
SEED_QUESTIONS.push(
  SEED_HAZARD_QUESTION_2,
  SEED_HAZARD_QUESTION_3,
  SEED_HAZARD_QUESTION_4,
  SEED_HAZARD_QUESTION_5,
  SEED_HAZARD_QUESTION_6,
  SEED_HAZARD_QUESTION_7,
  SEED_HAZARD_QUESTION_8,
  SEED_HAZARD_QUESTION_9,
  SEED_HAZARD_QUESTION_10
);

// ------------------------- Safety Millionaire finale -------------------------
// A tiered, escalating-stakes final round. Each player gets three lifelines
// (usable once each, across the whole ladder, classic-Millionaire style):
// 50:50, Ask the Room (live crowd read from other players' submitted answers),
// and Phone a Friend (a partial hint drawn from the explanation).
const MILLIONAIRE_LADDER = [
  { tier: "Bronze Badge", question: "What colour hard hat is typically worn by site visitors?", options: ["White", "Blue", "Green", "Red"], correct: 1, points: 200 },
  { tier: "Silver Badge", question: "How often should a fire extinguisher be visually inspected on site?", options: ["Once a year", "Monthly", "Only after use", "Never, unless it looks damaged"], correct: 1, points: 400 },
  { tier: "Gold Badge", question: "What is the safe approach distance from an overhead power line for general work (typical minimum)?", options: ["0.5 metres", "3 metres", "10+ metres (per local regulation)", "No distance needed if insulated gloves are worn"], correct: 2, points: 600 },
  { tier: "Platinum Badge", question: "In a confined space entry, what must be done before anyone enters?", options: ["Just prop the door open", "Atmospheric testing and a permit", "Turn on a fan and go in", "Nothing if it's a quick job"], correct: 1, points: 800 },
  { tier: "Diamond Badge", question: "Under a typical hierarchy of controls, which is the MOST effective way to deal with a hazard?", options: ["PPE", "Administrative controls (training, signage)", "Elimination of the hazard", "Engineering controls"], correct: 2, points: 1000 },
  { tier: "Safety Millionaire", question: "A near-miss occurs but causes no injury. What should happen next?", options: ["Nothing, no harm done", "Report and investigate it like an incident", "Only mention it if someone asks", "Fix it quietly yourself"], correct: 1, points: 1500 },
].map((q, i) => ({
  round: "millionaire",
  category: "Safety Millionaire",
  difficulty: "Escalating",
  ladderIndex: i,
  question: q.question,
  options: q.options,
  correct: q.correct,
  timer: 25,
  points: q.points,
  tier: q.tier,
  explanation: "Think about which option best protects people, not just paperwork.",
}));

SEED_QUESTIONS.push(...MILLIONAIRE_LADDER);

/* ---------------------------- helpers ---------------------------- */

function genId() {
  try { return crypto.randomUUID(); } catch { return "id-" + Math.random().toString(36).slice(2) + Date.now(); }
}
function genGameCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
function defaultGame() {
  return {
    gameCode: genGameCode(),
    gameName: "Construction Safety League",
    status: "lobby", // lobby | question | reveal | leaderboard | ended
    qIndex: 0,
    questionStartedAt: null,
    revealed: false,
    soundEnabled: true,
    teamModeEnabled: false,
    teams: ["Civil Team", "MEP Team", "Electrical Team", "Mechanical Team", "Safety Team"],
    teamScoringMode: "total", // 'total' | 'average'
    leaderboardMediaUrl: "",
    leaderboardTop1MediaUrl: "",
    leaderboardTop2MediaUrl: "",
    leaderboardTop3MediaUrl: "",
    leaderboardBottom1MediaUrl: "",
    leaderboardBottom2MediaUrl: "",
    createdAt: Date.now(),
  };
}

// Fisher-Yates shuffle — used to randomize answer-option order so the
// correct answer isn't always sitting in the same slot.
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Shuffles a question's options and remaps `correct` to the new position.
// Hazard rounds have no `options` array (they use tap targets) and are
// left untouched.
function shuffleQuestionOptions(q) {
  if (!q || !q.options || q.round === "hazard") return q;
  const order = shuffleArray(q.options.map((_, i) => i));
  const options = order.map((i) => q.options[i]);
  const correct = order.indexOf(q.correct);
  return { ...q, options, correct };
}

function enforceFixedGameTimer(question) {
  if (!question) return question;
  return question.round === "hazard"
    ? { ...question, timer: Number(question.timer) > 0 ? Number(question.timer) : 45 }
    : { ...question, timer: GAME_QUESTION_SECONDS };
}

function getQuestionDuration(question) {
  return Number(question?.timer) > 0 ? Number(question.timer) : GAME_QUESTION_SECONDS;
}

function buildRandomizedGameQuestions() {
  const mcqPool = SEED_QUESTIONS.filter((q) => q.round !== "hazard" && q.round !== "millionaire");
  const hazardPool = SEED_QUESTIONS.filter((q) => q.round === "hazard");
  const hazardCount = 5;

  const selectedHazard = shuffleArray(hazardPool).slice(0, Math.min(hazardCount, hazardPool.length));
  const remainingSlots = Math.max(0, GAME_QUESTION_COUNT - selectedHazard.length);
  const selectedMCQ = shuffleArray(mcqPool).slice(0, Math.min(remainingSlots, mcqPool.length));
  const chosen = shuffleArray([...selectedMCQ, ...selectedHazard]);

  return chosen.map((question) => {
    const normalized = question && question.options ? shuffleQuestionOptions(question) : question;
    return enforceFixedGameTimer(normalized);
  });
}

function normalizeQuestionSet(questionsList) {
  return (questionsList || []).map((question) => {
    if (!question) return question;
    if (question.options && question.round !== "hazard") return enforceFixedGameTimer(shuffleQuestionOptions(question));
    return enforceFixedGameTimer(question);
  });
}

function computeTeamScores(players, teams, mode) {
  const byTeam = {};
  (teams || []).forEach((t) => { byTeam[t] = []; });
  players.forEach((p) => {
    if (!p.team) return;
    if (!byTeam[p.team]) byTeam[p.team] = [];
    byTeam[p.team].push(p.score || 0);
  });
  return Object.entries(byTeam)
    .map(([name, scores]) => ({
      name,
      count: scores.length,
      score: scores.length === 0 ? 0 : mode === "average" ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : scores.reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => b.score - a.score);
}

/* ============================== APP =============================== */

export default function App() {
  // QR codes open the player view on the hosted site. The game code is
  // still entered on that page and checked against the active game.
  const [role, setRole] = useState(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      if (p.get("role") === "player") return "player";
    } catch {}
    return null;
  });

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.ink, fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      {!role && <RoleSelect onSelect={setRole} />}
      {role === "admin" && <AdminView onExit={() => setRole(null)} />}
      {role === "player" && <PlayerView onExit={() => setRole(null)} />}
      {role === "tv" && <TVView onExit={() => setRole(null)} />}
    </div>
  );
}

/* --------------------------- ROLE SELECT --------------------------- */

function RoleSelect({ onSelect }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", position: "relative", overflow: "hidden", background: `radial-gradient(circle at 15% 15%, ${COLORS.orange}18, transparent 32%), radial-gradient(circle at 85% 80%, ${COLORS.green}14, transparent 34%)` }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: `repeating-linear-gradient(135deg, ${COLORS.yellow}0d 0 18px, transparent 18px 36px)` }} />
      <div style={{ position: "relative", textAlign: "center", marginBottom: 44 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, background: COLORS.yellow, color: "#1A1200", padding: "6px 14px", borderRadius: 4, fontWeight: 800, fontSize: 12, letterSpacing: 1 }}>
          <HardHat size={16} /> SITE SAFETY EVENT
        </div>
        <h1 style={{ fontSize: 44, fontWeight: 900, margin: "18px 0 6px", letterSpacing: -1, lineHeight: 1.05 }}>
          Construction<br />Safety League
        </h1>
        <p style={{ color: COLORS.muted, fontSize: 15, maxWidth: 420, margin: "0 auto", lineHeight: 1.6 }}>
          One room. One live score. Choose your station to get started.
        </p>
      </div>

      <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, width: "100%", maxWidth: 900 }}>
        <RoleCard icon={<Users size={22} />} title="Join as player" sub="Enter the game code, then play on your phone" color={COLORS.green} onClick={() => onSelect("player")} />
        <RoleCard icon={<Trophy size={22} />} title="Show the arena" sub="Project the live questions and racing leaderboard" color={COLORS.yellow} onClick={() => onSelect("tv")} />
        <RoleCard icon={<Shield size={22} />} title="Run the event" sub="Create games, control rounds, and manage players" color={COLORS.orange} onClick={() => onSelect("admin")} />
      </div>
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, marginTop: 28, color: COLORS.muted, fontSize: 12 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.green, boxShadow: `0 0 0 5px ${COLORS.green}22` }} /> LIVE EVENT MODE · Firebase sync enabled</div>
    </div>
  );
}

const RoleCard = React.memo(function RoleCard({ icon, title, sub, color, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative", display: "flex", alignItems: "center", gap: 14, textAlign: "left",
        background: hover ? `linear-gradient(135deg, ${color}18, ${COLORS.surface} 55%)` : COLORS.surface,
        color: COLORS.ink, border: `1px solid ${hover ? color : COLORS.line}`,
        borderRadius: 12, padding: "18px 18px", cursor: "pointer", overflow: "hidden",
        boxShadow: hover ? `0 12px 28px ${color}22` : "0 8px 20px #00000022",
        transform: hover ? "translateY(-4px)" : "translateY(0)", transition: "all .18s ease",
      }}
    >
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 3, background: color }} />
      <div style={{ width: 48, height: 48, borderRadius: 10, background: color + "20", border: `1px solid ${color}66`, color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color, fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 }}>{title === "Join as player" ? "Participant" : title === "Show the arena" ? "Display" : "Host"}</div>
        <div style={{ color: COLORS.ink, fontWeight: 800, fontSize: 16 }}>{title}</div>
        <div style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.35, marginTop: 3 }}>{sub}</div>
      </div>
      <ChevronRight size={19} style={{ marginLeft: "auto", color, flexShrink: 0 }} />
    </button>
  );
});

/* ------------------------------ SHARED HOOK ------------------------------ */

function useGamePoll() {
  const [game, setGame] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [players, setPlayers] = useState([]);
  const [connected, setConnected] = useState(true);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const g = await safeGet(GAME_KEY, true);
    const q = await safeGet(Q_KEY, true);
    const keys = await safeList(PLAYER_PREFIX, true);
    const vals = await Promise.all((keys || []).map((k) => safeGet(k, true)));
    if (!mounted.current) return;
    setConnected(true);
    if (g) { try { setGame(JSON.parse(g)); } catch {} } else { setGame(null); }
    if (q) { try { setQuestions(JSON.parse(q)); } catch {} } else { setQuestions([]); }
    setPlayers(vals.filter(Boolean).map((v) => { try { return JSON.parse(v); } catch { return null; } }).filter(Boolean));
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => { mounted.current = false; clearInterval(id); };
  }, [refresh]);

  return { game, setGame, questions, setQuestions, players, connected, refresh };
}

function ConnBadge({ connected }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: connected ? COLORS.green : COLORS.red }}>
      {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
      {connected ? "Live" : "Reconnecting…"}
    </div>
  );
}

/* -------------------- shared "Spot the Hazard" pieces -------------------- */

// Renders the hazard scene (inline SVG or an uploaded photo) with optional
// markers overlaid, and reports normalized (0-100) tap coordinates.
function HazardImage({ question, markers = [], onTap, aspectRatio = "4 / 3", maxWidth = 480 }) {
  const ref = useRef(null);
  function handleClick(e) {
    if (!onTap || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onTap(Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y)));
  }
  return (
    <div
      ref={ref}
      onClick={handleClick}
      style={{
        position: "relative", width: "100%", maxWidth, aspectRatio, margin: "0 auto",
        borderRadius: 10, overflow: "hidden", background: "#0000", cursor: onTap ? "crosshair" : "default",
        border: `1px solid ${COLORS.line}`,
      }}
    >
      {question.imageType === "raster" && question.imageData && (
        <img src={question.imageData} alt="Site scene" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }} />
      )}
      {question.imageType !== "raster" && question.imageSvg && (
        <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: question.imageSvg }} />
      )}
      {markers.map((m) => (
        <div key={m.key || m.id} style={{
          position: "absolute", left: `${m.xPct}%`, top: `${m.yPct}%`, transform: "translate(-50%, -50%)",
          width: m.size || 26, height: m.size || 26, borderRadius: "50%",
          background: m.color, border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 1px 4px rgba(0,0,0,.4)", pointerEvents: "none", fontSize: 12, fontWeight: 800, color: "#14171A",
        }}>
          {m.label}
        </div>
      ))}
    </div>
  );
}

function hazardDistancePct(ax, ay, bx, by) {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

/* ------------------------------ ADMIN VIEW ------------------------------ */

function AdminView({ onExit }) {
  const [pin, setPin] = useState("");
  const [adminPin, setAdminPin] = useState("1234");
  const [newPin, setNewPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [checkingUnlock, setCheckingUnlock] = useState(true);
  const { game, questions, players, connected, refresh } = useGamePoll();
  const [busy, setBusy] = useState(false);

  // These hooks must live above any early return (including the PIN lock
  // screen below) or React throws "rendered more hooks than previous render"
  // (error #310) the moment the admin unlocks the panel.
  const [hz, setHz] = useState({ category: "Spot the Hazard", timer: 60, image: null, hazards: [], draftName: "", draftDesc: "", draftPoints: 50, pendingPoint: null });
  const [hzBusy, setHzBusy] = useState(false);
  const [questionsRef, setQuestionsRef] = useState(questions);
  useEffect(() => { setQuestionsRef(questions); }, [questions]);
  const [aqBusy, setAqBusy] = useState(false);

  // ---- player management: edit / kick ----
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", team: "", score: 0 });
  const [kickConfirmId, setKickConfirmId] = useState(null);

  // ---- persistent, per-device admin unlock ----
  // Stored in localStorage only (safeSet(..., false)), never synced through
  // Firebase, so re-opening the admin link on THIS device skips the PIN,
  // while sharing the link never unlocks admin for anyone else.
  useEffect(() => {
    (async () => {
      try {
        const savedPin = await safeGet(ADMIN_PIN_KEY, false);
        if (savedPin && /^\d{4,8}$/.test(savedPin)) setAdminPin(savedPin);
        const saved = await safeGet(ADMIN_UNLOCKED_KEY, false);
        if (saved === "1") setUnlocked(true);
      } catch {}
      setCheckingUnlock(false);
    })();
  }, []);

  async function unlockAdmin() {
    if (pin !== adminPin) {
      setPinError("Incorrect PIN. Try again or use Forgot PIN to recover access.");
      return;
    }
    setPinError("");
    setUnlocked(true);
    try { await safeSet(ADMIN_UNLOCKED_KEY, "1", false); } catch {}
  }
  async function lockAdmin() {
    try { await safeDelete(ADMIN_UNLOCKED_KEY, false); } catch {}
    setUnlocked(false);
    setPin("");
  }

  async function resetAdminPin() {
    if (!/^\d{4,8}$/.test(newPin)) return;
    await safeSet(ADMIN_PIN_KEY, newPin, false);
    setAdminPin(newPin);
    setNewPin("");
  }

  async function recoverAdminPin() {
    await safeSet(ADMIN_PIN_KEY, "1234", false);
    await safeDelete(ADMIN_UNLOCKED_KEY, false);
    setAdminPin("1234");
    setPin("");
    setPinError("PIN recovered. Use the default PIN 1234, then change it in Admin security.");
  }

  const sorted = useMemo(() => [...players].sort((a, b) => (b.score || 0) - (a.score || 0)), [players]);
  const teamScores = useMemo(
    () => (game?.teamModeEnabled ? computeTeamScores(players, game.teams, game.teamScoringMode) : []),
    [game?.teamModeEnabled, players, game?.teams, game?.teamScoringMode]
  );

  if (checkingUnlock) {
    return <Centered><p style={{ color: COLORS.muted }}>Loading…</p></Centered>;
  }

  if (!unlocked) {
    return (
      <Centered>
        <Panel title="Admin access" icon={<Shield size={20} color={COLORS.orange} />}>
          <p style={{ color: COLORS.muted, fontSize: 13, marginBottom: 14 }}>Enter your admin PIN to manage the event.</p>
          <input
            value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 8)); setPinError(""); }} type="password" placeholder="Enter PIN" maxLength={8}
            style={inputStyle}
            onKeyDown={(e) => e.key === "Enter" && unlockAdmin()}
          />
          {pinError && <p style={{ color: pinError.startsWith("PIN recovered") ? COLORS.green : COLORS.red, fontSize: 13, margin: "-4px 0 10px", lineHeight: 1.4 }}>{pinError}</p>}
          <button style={btnStyle(COLORS.orange)} onClick={unlockAdmin}>Unlock</button>
          <button style={{ ...linkBtnStyle, color: COLORS.yellow }} onClick={recoverAdminPin}>Forgot PIN? Recover with default PIN</button>
          <button style={linkBtnStyle} onClick={onExit}>← Back</button>
        </Panel>
      </Centered>
    );
  }

  async function createGame() {
    setBusy(true);
    // clear old players
    const keys = await safeList(PLAYER_PREFIX, true);
    await Promise.all((keys || []).map((k) => safeDelete(k, true)));
    const g = defaultGame();
    await safeSet(GAME_KEY, JSON.stringify(g), true);
    // Create a fresh 20-question game set for everyone playing, then shuffle
    // the question order and the answer order inside each question.
    const gameQuestions = buildRandomizedGameQuestions();
    await safeSet(Q_KEY, JSON.stringify(gameQuestions), true);
    await refresh();
    setBusy(false);
  }

  async function patchGame(patch) {
    const base = game || defaultGame();
    const next = { ...base, ...patch };
    await safeSet(GAME_KEY, JSON.stringify(next), true);
    await refresh();
  }

  async function startGame() {
    const offset = await getServerTimeOffset();
    await patchGame({ status: "question", qIndex: 0, questionStartedAt: Date.now() + offset, revealed: false });
  }
  async function revealAnswer() {
    await patchGame({ status: "reveal", revealed: true });
  }
  async function nextQuestion() {
    const nextIdx = (game.qIndex ?? 0) + 1;
    if (nextIdx >= questions.length) {
      await patchGame({ status: "ended" });
    } else {
      const offset = await getServerTimeOffset();
      await patchGame({ status: "question", qIndex: nextIdx, questionStartedAt: Date.now() + offset, revealed: false });
    }
  }
  async function showLeaderboard() { await patchGame({ status: "leaderboard" }); }
  async function backToLobby() { await patchGame({ status: "lobby" }); }
  async function endGame() { await patchGame({ status: "ended" }); }
  async function resetGame() { await createGame(); }

  // ---- player management: edit / kick ----
  function startEditPlayer(p) {
    setKickConfirmId(null);
    setEditingId(p.id);
    setEditForm({ name: p.name || "", team: p.team || "", score: p.score ?? 0 });
  }
  function cancelEditPlayer() {
    setEditingId(null);
  }
  async function saveEditPlayer(id) {
    const orig = players.find((p) => p.id === id);
    if (!orig) { setEditingId(null); return; }
    const updated = {
      ...orig,
      name: editForm.name.trim() || orig.name,
      team: editForm.team || null,
      score: Number.isFinite(Number(editForm.score)) ? Number(editForm.score) : (orig.score || 0),
    };
    await safeSet(PLAYER_PREFIX + id, JSON.stringify(updated), true);
    setEditingId(null);
    await refresh();
  }
  function requestKickPlayer(id) {
    if (kickConfirmId === id) {
      kickPlayer(id);
    } else {
      setEditingId(null);
      setKickConfirmId(id);
    }
  }
  async function kickPlayer(id) {
    await safeDelete(PLAYER_PREFIX + id, true);
    if (editingId === id) setEditingId(null);
    setKickConfirmId(null);
    await refresh();
  }

  // ---- Spot the Hazard builder ----
  function onHazardImageFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = 900;
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        setHz((h) => ({ ...h, image: dataUrl, hazards: [] }));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function onHazardImageTap(x, y) {
    if (!hz.image) return;
    setHz((h) => ({ ...h, pendingPoint: { x, y } }));
  }

  function confirmHazardMarker() {
    if (!hz.pendingPoint || !hz.draftName.trim()) return;
    const marker = { id: genId(), xPct: hz.pendingPoint.x, yPct: hz.pendingPoint.y, radiusPct: 8, name: hz.draftName.trim(), description: hz.draftDesc.trim(), points: Number(hz.draftPoints) || 50 };
    setHz((h) => ({ ...h, hazards: [...h.hazards, marker], pendingPoint: null, draftName: "", draftDesc: "", draftPoints: 50 }));
  }
  function removeHazardMarker(id) {
    setHz((h) => ({ ...h, hazards: h.hazards.filter((m) => m.id !== id) }));
  }

  async function addHazardRoundToGame() {
    if (!hz.image || hz.hazards.length === 0) return;
    setHzBusy(true);
    const newQ = {
      round: "hazard", category: hz.category || "Spot the Hazard", difficulty: "Medium",
      question: "FIND THE HAZARDS!", imageType: "raster", imageData: hz.image,
      timer: Math.max(1, Number(hz.timer) || 45), wrongPenalty: 0, bonusAll: 100,
      explanation: "", hazards: hz.hazards,
    };
    const nextQuestions = [...(questionsRef || []), newQ];
    await safeSet(Q_KEY, JSON.stringify(normalizeQuestionSet(nextQuestions)), true);
    await refresh();
    setHz({ category: "Spot the Hazard", timer: 60, image: null, hazards: [], draftName: "", draftDesc: "", draftPoints: 50, pendingPoint: null });
    setHzBusy(false);
  }

  // ---- Custom question builder (quiz / true-false) ----
  async function addCustomQuestion(q) {
    setAqBusy(true);
    const shuffled = shuffleQuestionOptions(q);
    const current = questionsRef || [];
    // Insert before the Safety Millionaire finale (if present) so the
    // finale always stays the last round played.
    const millionaireIdx = current.findIndex((x) => x.round === "millionaire");
    const insertAt = millionaireIdx === -1 ? current.length : millionaireIdx;
    const next = [...current.slice(0, insertAt), shuffled, ...current.slice(insertAt)];
    await safeSet(Q_KEY, JSON.stringify(normalizeQuestionSet(next)), true);
    await refresh();
    setAqBusy(false);
  }

  // ---- Remove a question (any round type, including hazard rounds) ----
  async function removeQuestionAt(idx) {
    const next = (questionsRef || []).filter((_, i) => i !== idx);
    await safeSet(Q_KEY, JSON.stringify(next), true);
    await refresh();
  }

  const curQ = questions[game?.qIndex ?? 0];
  const answeredCount = curQ ? players.filter((p) => p.answers && p.answers[game.qIndex] !== undefined).length : 0;

  return (
    <div style={{ padding: "20px 20px 60px", maxWidth: 880, margin: "0 auto" }}>
      <TopBar title="Admin Control Panel" onExit={onExit} connected={connected} onLock={lockAdmin} />

      {!game && (
        <Panel title="No active game" icon={<Play size={18} color={COLORS.yellow} />}>
          <p style={{ color: COLORS.muted, fontSize: 14, marginBottom: 14 }}>Create a game to generate a join code and load a fresh 20-question set with randomized order and a 100-second timer for every question.</p>
          <button disabled={busy} style={btnStyle(COLORS.yellow, "#1A1200")} onClick={createGame}>{busy ? "Creating…" : "Create Game"}</button>
        </Panel>
      )}

      {game && (
        <>
          <Panel title="Game status" icon={<Zap size={18} color={COLORS.yellow} />} right={<StatusPill status={game.status} />}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
              <StatCell label="Join code" value={game.gameCode} big />
              <StatCell label="Participants" value={players.length} />
              <StatCell label="Question" value={game.status === "lobby" ? "—" : `${(game.qIndex ?? 0) + 1} / ${questions.length}`} />
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {game.status === "lobby" && <ActionBtn icon={<Play size={15} />} label="Start Game" color={COLORS.green} onClick={startGame} disabled={players.length === 0} />}
              {game.status === "question" && <ActionBtn icon={<Eye size={15} />} label="Reveal Answer" color={COLORS.yellow} dark onClick={revealAnswer} />}
              {(game.status === "reveal" || game.status === "leaderboard") && game.qIndex < questions.length - 1 && <ActionBtn icon={<SkipForward size={15} />} label="Next Question" color={COLORS.orange} onClick={nextQuestion} />}
              {(game.status === "reveal" || game.status === "leaderboard") && game.qIndex >= questions.length - 1 && <ActionBtn icon={<Flag size={15} />} label="End Game" color={COLORS.red} onClick={endGame} />}
              {game.status !== "lobby" && game.status !== "ended" && <ActionBtn icon={<Trophy size={15} />} label="Show Leaderboard" color={COLORS.surfaceRaised} onClick={showLeaderboard} />}
              {game.status !== "lobby" && <ActionBtn icon={<RotateCcw size={15} />} label="Back to Lobby" color={COLORS.surfaceRaised} onClick={backToLobby} />}
              <ActionBtn icon={<RotateCcw size={15} />} label="Reset Game" color={COLORS.red} onClick={resetGame} />
            </div>
          </Panel>

          <Panel title="Leaderboard fun media" icon={<Volume2 size={18} color={COLORS.purple} />}>
            <p style={{ color: COLORS.muted, fontSize: 13, marginBottom: 10 }}>Paste public GIF, image, YouTube, MP4, or WebM links. The group animation appears on the right, and rank-specific media changes with the race.</p>
            <div style={{ display: "grid", gap: 8 }}>
              {[
                ["Group celebration", "leaderboardMediaUrl"],
                ["1st place celebration", "leaderboardTop1MediaUrl"],
                ["2nd place celebration", "leaderboardTop2MediaUrl"],
                ["3rd place celebration", "leaderboardTop3MediaUrl"],
                ["Bottom 1 celebration", "leaderboardBottom1MediaUrl"],
                ["Bottom 2 celebration", "leaderboardBottom2MediaUrl"],
              ].map(([label, key]) => (
                <input key={key} style={{ ...inputStyle, marginBottom: 0 }} type="url" aria-label={label} placeholder={`${label} URL (optional)`} defaultValue={game[key] || ""} onBlur={(e) => patchGame({ [key]: e.target.value.trim() })} />
              ))}
            </div>
          </Panel>

          <Panel title="Admin security" icon={<Lock size={18} color={COLORS.orange} />}>
            <p style={{ color: COLORS.muted, fontSize: 13, marginBottom: 10 }}>Change the PIN used to unlock this admin panel on this device.</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input style={{ ...inputStyle, width: 180, marginBottom: 0 }} inputMode="numeric" maxLength={8} type="password" placeholder="New PIN (4–8 digits)" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 8))} />
              <button disabled={newPin.length < 4} style={{ ...btnStyle(COLORS.orange), width: "auto", padding: "10px 16px" }} onClick={resetAdminPin}>Reset PIN</button>
            </div>
          </Panel>

          {game.status === "question" && curQ && (
            <Panel title={`Live: ${curQ.category}`} icon={curQ.round === "millionaire" ? <Gem size={18} color={COLORS.purple} /> : <Clock size={18} color={COLORS.orange} />}>
              <p style={{ fontSize: 15, marginBottom: 10 }}>{curQ.question}</p>
              {curQ.round === "millionaire" && <p style={{ fontSize: 12, color: COLORS.purple, marginBottom: 6, fontWeight: 700 }}>{curQ.tier} · worth {curQ.points} pts</p>}
              <div style={{ fontSize: 13, color: COLORS.muted }}>{answeredCount} / {players.length} players have answered</div>
            </Panel>
          )}

          {(game.status === "question" || game.status === "reveal") && curQ && (
            <PlayerAnswersPanel curQ={curQ} qIndex={game.qIndex} players={players} />
          )}

          <Panel title="Team competition" icon={<Users size={18} color={COLORS.green} />} right={
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer" }}>
              <input type="checkbox" checked={!!game.teamModeEnabled} onChange={(e) => patchGame({ teamModeEnabled: e.target.checked })} />
              Enabled
            </label>
          }>
            {!game.teamModeEnabled && <p style={{ color: COLORS.muted, fontSize: 13 }}>Off — players compete individually only. Turn this on before the game starts so the join screen asks for a team.</p>}
            {game.teamModeEnabled && (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: COLORS.muted }}>Team score =</span>
                  <select value={game.teamScoringMode} onChange={(e) => patchGame({ teamScoringMode: e.target.value })} style={{ ...inputStyle, width: 200, marginBottom: 0 }}>
                    <option value="total">Total of all team members</option>
                    <option value="average">Average per participant</option>
                  </select>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                  {(game.teams || []).map((t) => (
                    <span key={t} style={{ display: "flex", alignItems: "center", gap: 6, background: COLORS.surfaceRaised, borderRadius: 20, padding: "5px 10px 5px 12px", fontSize: 13 }}>
                      {t}
                      <button onClick={() => patchGame({ teams: game.teams.filter((x) => x !== t) })} style={{ background: "none", border: "none", color: COLORS.red, cursor: "pointer", display: "flex" }}><X size={13} /></button>
                    </span>
                  ))}
                </div>
                <AddTeamForm onAdd={(name) => patchGame({ teams: [...(game.teams || []), name] })} />
              </>
            )}
          </Panel>

          <Panel title="Add a custom question" icon={<Pencil size={18} color={COLORS.green} />}>
            <p style={{ color: COLORS.muted, fontSize: 13, marginBottom: 12 }}>
              Build your own quiz or true/false question. It's inserted right before the Safety Millionaire finale so the finale always stays last, and its answer order gets shuffled automatically just like the seeded questions.
            </p>
            <AddQuestionForm busy={aqBusy} onAdd={addCustomQuestion} />
          </Panel>

          <Panel title="Add a Spot the Hazard round" icon={<Target size={18} color={COLORS.orange} />}>
            <p style={{ color: COLORS.muted, fontSize: 13, marginBottom: 12 }}>Upload a site photo, then click on it to mark each hazard. The round is appended to the end of the question list — 10 default example scenes are already loaded, and the Safety Millionaire finale sits at the very end.</p>

            <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
              <input style={{ ...inputStyle, width: 200, marginBottom: 0 }} placeholder="Round category" value={hz.category} onChange={(e) => setHz({ ...hz, category: e.target.value })} />
              <input style={{ ...inputStyle, width: 120, marginBottom: 0 }} type="number" placeholder="Timer (s)" value={hz.timer} onChange={(e) => setHz({ ...hz, timer: e.target.value })} />
              <label style={{ ...btnStyle(COLORS.surfaceRaised, COLORS.ink), width: "auto", display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", margin: 0 }}>
                <ImagePlus size={15} /> Upload photo
                <input type="file" accept="image/*" onChange={onHazardImageFile} style={{ display: "none" }} />
              </label>
            </div>

            {hz.image && (
              <>
                <p style={{ fontSize: 12, color: COLORS.muted, marginBottom: 8 }}>Click on the image where a hazard is. {hz.hazards.length} hazard(s) marked.</p>
                <HazardImage
                  question={{ imageType: "raster", imageData: hz.image }}
                  markers={[
                    ...hz.hazards.map((m) => ({ key: m.id, xPct: m.xPct, yPct: m.yPct, color: COLORS.green, size: 22, label: "✓" })),
                    ...(hz.pendingPoint ? [{ key: "pending", xPct: hz.pendingPoint.x, yPct: hz.pendingPoint.y, color: COLORS.yellow, size: 22, label: "?" }] : []),
                  ]}
                  onTap={onHazardImageTap}
                  maxWidth={520}
                />

                {hz.pendingPoint && (
                  <div style={{ marginTop: 12, background: COLORS.surfaceRaised, borderRadius: 8, padding: 12 }}>
                    <input style={inputStyle} placeholder="Hazard name (e.g. Missing barricade)" value={hz.draftName} onChange={(e) => setHz({ ...hz, draftName: e.target.value })} />
                    <input style={inputStyle} placeholder="Short description" value={hz.draftDesc} onChange={(e) => setHz({ ...hz, draftDesc: e.target.value })} />
                    <input style={inputStyle} type="number" placeholder="Points" value={hz.draftPoints} onChange={(e) => setHz({ ...hz, draftPoints: e.target.value })} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={btnStyle(COLORS.green)} onClick={confirmHazardMarker}>Add hazard here</button>
                      <button style={btnStyle(COLORS.surfaceRaised, COLORS.ink)} onClick={() => setHz({ ...hz, pendingPoint: null })}>Cancel</button>
                    </div>
                  </div>
                )}

                {hz.hazards.length > 0 && (
                  <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
                    {hz.hazards.map((m) => (
                      <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, background: COLORS.surfaceRaised, borderRadius: 6, padding: "6px 10px", fontSize: 13 }}>
                        <MapPin size={13} color={COLORS.green} />
                        <span style={{ flex: 1 }}>{m.name} <span style={{ color: COLORS.muted }}>· {m.points}pts</span></span>
                        <button onClick={() => removeHazardMarker(m.id)} style={{ background: "none", border: "none", color: COLORS.red, cursor: "pointer" }}><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}

                <button disabled={hzBusy || hz.hazards.length === 0} style={btnStyle(COLORS.orange)} onClick={addHazardRoundToGame}>
                  {hzBusy ? "Adding…" : `Add Hazard Round to Game (${hz.hazards.length} hazards)`}
                </button>
              </>
            )}
          </Panel>

          <ManageQuestionsPanel questions={questionsRef} onRemove={removeQuestionAt} />

          <Panel title="Participants" icon={<Trophy size={18} color={COLORS.yellow} />}>
            {sorted.length === 0 && <p style={{ color: COLORS.muted, fontSize: 14 }}>No participants have joined yet.</p>}
            <p style={{ color: COLORS.muted, fontSize: 12, marginBottom: 10 }}>Fix a wrong join, correct a score, or remove someone who dropped off. Kick needs a second tap to confirm.</p>
            {sorted.map((p, i) => (
              <AdminPlayerRow
                key={p.id}
                rank={i + 1}
                player={p}
                teams={game.teams || []}
                editing={editingId === p.id}
                editForm={editForm}
                setEditForm={setEditForm}
                onStartEdit={() => startEditPlayer(p)}
                onCancelEdit={cancelEditPlayer}
                onSaveEdit={() => saveEditPlayer(p.id)}
                kickConfirming={kickConfirmId === p.id}
                onKick={() => requestKickPlayer(p.id)}
              />
            ))}
            {game.teamModeEnabled && teamScores.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 800, color: COLORS.muted, margin: "14px 0 8px" }}>TEAM LEADERBOARD</div>
                {teamScores.map((t, i) => (
                  <LeaderRow key={t.name} rank={i + 1} name={t.name} sub={`${t.count} player${t.count === 1 ? "" : "s"}`} score={t.score} />
                ))}
              </>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

// Lets the admin delete any question — MCQ, True/False, custom, or a
// hazard round (default or admin-uploaded). Delete needs a second tap
// on the same row to confirm.
function ManageQuestionsPanel({ questions, onRemove }) {
  const [confirmIdx, setConfirmIdx] = useState(null);
  const badge = {
    quiz: [COLORS.green, "MCQ"],
    truefalse: [COLORS.yellow, "T/F"],
    hazard: [COLORS.orange, "HAZARD"],
    millionaire: [COLORS.purple, "FINALE"],
  };

  return (
    <Panel title={`Manage Questions (${questions.length})`} icon={<ListChecks size={18} color={COLORS.orange} />}>
      <p style={{ color: COLORS.muted, fontSize: 12, marginBottom: 10 }}>Remove any question from the game — quiz, true/false, or Spot the Hazard. Tap the trash icon twice to confirm.</p>
      {questions.length === 0 && <p style={{ color: COLORS.muted, fontSize: 13 }}>No questions loaded yet.</p>}
      <div style={{ display: "grid", gap: 6, maxHeight: 360, overflowY: "auto" }}>
        {questions.map((q, i) => {
          const [c, label] = badge[q.round] || [COLORS.muted, (q.round || "?").toUpperCase()];
          const isConfirming = confirmIdx === i;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: COLORS.surfaceRaised, borderRadius: 6, padding: "7px 10px", fontSize: 13 }}>
              <span style={{ fontSize: 10, color: COLORS.muted, width: 22, flexShrink: 0 }}>{i + 1}</span>
              <span style={{ fontSize: 9, fontWeight: 800, color: c, border: `1px solid ${c}`, borderRadius: 4, padding: "2px 5px", flexShrink: 0 }}>{label}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <b>{q.category}</b> — {q.question}
              </span>
              <button
                title={isConfirming ? "Tap again to confirm" : "Delete question"}
                onClick={() => {
                  if (isConfirming) { onRemove(i); setConfirmIdx(null); }
                  else setConfirmIdx(i);
                }}
                style={{
                  background: isConfirming ? COLORS.red : "none", border: `1px solid ${COLORS.red}`, borderRadius: 6,
                  color: isConfirming ? "#fff" : COLORS.red, cursor: "pointer", padding: "5px 8px", fontSize: 11,
                  fontWeight: 700, flexShrink: 0, display: "flex", alignItems: "center", gap: 4,
                }}
              >
                {isConfirming ? <AlertTriangle size={12} /> : <Trash2 size={12} />}
                {isConfirming ? "Confirm?" : ""}
              </button>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// Shows, for the current question, which players answered correctly vs
// incorrectly (and what they picked), so the admin can review live.
function PlayerAnswersPanel({ curQ, qIndex, players }) {
  const rows = players.filter((p) => p.answers && p.answers[qIndex] !== undefined);
  const correctCount = curQ.round === "hazard"
    ? rows.filter((p) => (p.answers[qIndex].found?.length || 0) >= (curQ.hazards?.length || 0)).length
    : rows.filter((p) => p.answers[qIndex].correct).length;

  return (
    <Panel
      title={`Player Answers · Q${qIndex + 1}`}
      icon={<ListChecks size={18} color={COLORS.green} />}
      right={rows.length > 0 && <span style={{ fontSize: 12, color: COLORS.muted }}>{correctCount} / {rows.length} correct</span>}
    >
      {rows.length === 0 && <p style={{ color: COLORS.muted, fontSize: 13 }}>No answers submitted yet for this question.</p>}
      {rows.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {rows.map((p) => {
            const a = p.answers[qIndex];
            if (curQ.round === "hazard") {
              const total = curQ.hazards?.length || 0;
              const found = a.found?.length || 0;
              const allFound = found >= total;
              return (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, background: COLORS.surfaceRaised, borderRadius: 6, padding: "7px 10px", fontSize: 13 }}>
                  {allFound ? <CheckCircle2 size={15} color={COLORS.green} style={{ flexShrink: 0 }} /> : <XCircle size={15} color={COLORS.orange} style={{ flexShrink: 0 }} />}
                  <span style={{ flex: 1, fontWeight: 600 }}>{p.name}</span>
                  <span style={{ color: COLORS.muted }}>{found}/{total} found</span>
                  <span style={{ fontWeight: 800, color: COLORS.yellow, minWidth: 44, textAlign: "right" }}>{(a.score || 0) >= 0 ? "+" : ""}{a.score || 0}</span>
                </div>
              );
            }
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, background: COLORS.surfaceRaised, borderRadius: 6, padding: "7px 10px", fontSize: 13 }}>
                {a.correct ? <CheckCircle2 size={15} color={COLORS.green} style={{ flexShrink: 0 }} /> : <XCircle size={15} color={COLORS.red} style={{ flexShrink: 0 }} />}
                <span style={{ flex: 1, fontWeight: 600 }}>{p.name}</span>
                <span style={{ color: COLORS.muted, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {typeof a.answer === "number" && curQ.options ? curQ.options[a.answer] : "—"}
                </span>
                <span style={{ fontWeight: 800, color: COLORS.yellow, minWidth: 44, textAlign: "right" }}>+{a.points || 0}</span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// Lets the admin author their own quiz or true/false question on the fly.
function AddQuestionForm({ onAdd, busy }) {
  const [round, setRound] = useState("quiz");
  const [category, setCategory] = useState("");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correct, setCorrect] = useState(0);
  const [timer, setTimer] = useState(15);
  const [points, setPoints] = useState(100);
  const [explanation, setExplanation] = useState("");
  const [videoUrl, setVideoUrl] = useState("");

  const isTF = round === "truefalse";
  const effectiveOptions = isTF ? ["TRUE", "FALSE"] : options;
  const canSubmit = category.trim() && question.trim() && (isTF || effectiveOptions.every((o) => o.trim()));

  async function submit() {
    if (!canSubmit) return;
    await onAdd({
      round,
      category: category.trim(),
      difficulty: "Custom",
      question: question.trim(),
      options: effectiveOptions,
      correct,
      timer: GAME_QUESTION_SECONDS,
      points: Number(points) || 100,
      explanation: explanation.trim(),
      videoUrl: videoUrl.trim(),
    });
    setCategory(""); setQuestion(""); setOptions(["", "", "", ""]); setCorrect(0);
    setTimer(15); setPoints(100); setExplanation(""); setVideoUrl("");
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <select style={{ ...inputStyle, marginBottom: 0, width: 190 }} value={round} onChange={(e) => { setRound(e.target.value); setCorrect(0); }}>
          <option value="quiz">Quiz (multiple choice)</option>
          <option value="truefalse">True / False</option>
        </select>
        <input style={{ ...inputStyle, marginBottom: 0, flex: 1, minWidth: 160 }} placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
      </div>
      <input style={inputStyle} placeholder="Question text" value={question} onChange={(e) => setQuestion(e.target.value)} />

      {isTF ? (
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          {["TRUE", "FALSE"].map((opt, i) => (
            <label key={opt} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, background: COLORS.surfaceRaised, padding: "8px 12px", borderRadius: 8, cursor: "pointer", border: `1px solid ${correct === i ? COLORS.green : COLORS.line}` }}>
              <input type="radio" name="tfcorrect" checked={correct === i} onChange={() => setCorrect(i)} /> {opt} is correct
            </label>
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
          {options.map((opt, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="radio" name="qcorrect" checked={correct === i} onChange={() => setCorrect(i)} title="Mark as correct answer" />
              <input style={{ ...inputStyle, marginBottom: 0, flex: 1 }} placeholder={`Option ${String.fromCharCode(65 + i)}`} value={opt} onChange={(e) => { const next = [...options]; next[i] = e.target.value; setOptions(next); }} />
            </div>
          ))}
          <p style={{ fontSize: 11, color: COLORS.muted, margin: 0 }}>Select the radio button next to the correct option.</p>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input style={{ ...inputStyle, marginBottom: 0, width: 110 }} type="number" placeholder="Timer (s)" value={GAME_QUESTION_SECONDS} readOnly />
        <input style={{ ...inputStyle, marginBottom: 0, width: 110 }} type="number" placeholder="Points" value={points} onChange={(e) => setPoints(e.target.value)} />
      </div>
      <input style={inputStyle} placeholder="Explanation (shown on reveal, optional)" value={explanation} onChange={(e) => setExplanation(e.target.value)} />
      <input style={inputStyle} type="url" placeholder="Video link (YouTube or direct MP4, optional)" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />

      <button disabled={busy || !canSubmit} style={btnStyle(COLORS.green)} onClick={submit}>
        {busy ? "Adding…" : "Add Question"}
      </button>
    </div>
  );
}

/* ------------------------------ PLAYER VIEW ------------------------------ */

function PlayerView({ onExit }) {
  const { game, questions, players, connected } = useGamePoll();
  const [me, setMe] = useState(null);
  const [form, setForm] = useState({ name: "", employeeId: "", company: "", team: "" });
  const [scannerOpen, setScannerOpen] = useState(false);
  const [code, setCode] = useState("");
  const [codeVerified, setCodeVerified] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [serverOffset, setServerOffset] = useState(0);

  function handleScanDetected(text) {
    if (!text) return;
    let scannedValue = text.trim();
    try {
      const u = new URL(text);
      scannedValue = u.searchParams.get("join") || "";
    } catch {}
    setCode(scannedValue.replace(/\D/g, "").slice(0, 6));
    setCodeError("");
    setScannerOpen(false);
  }

  function verifyCode() {
    if (!game || code.length !== 6) return;
    if (code === String(game.gameCode)) {
      setCodeVerified(true);
      setCodeError("");
    } else {
      setCodeError("That code does not match the active game.");
    }
  }
  const [joining, setJoining] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let mounted = true;
    const syncClock = async () => {
      const offset = await getServerTimeOffset();
      if (mounted) setServerOffset(offset);
    };
    syncClock();
    const syncId = setInterval(syncClock, 30000);
    return () => { mounted = false; clearInterval(syncId); };
  }, []);

  useEffect(() => {
    if (!codeVerified || !game?.gameCode) return;
    (async () => {
      const savedId = await safeGet(MY_ID_KEY, false);
      if (savedId) {
        const raw = await safeGet(PLAYER_PREFIX + savedId, true);
        if (raw) {
          try {
            const savedPlayer = JSON.parse(raw);
            if (String(savedPlayer.gameCode) === String(game.gameCode)) setMe(savedPlayer);
          } catch {}
        }
      }
    })();
  }, [codeVerified, game?.gameCode]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + serverOffset), 250);
    return () => clearInterval(id);
  }, [serverOffset]);

  // keep `me` fresh from the shared players list
  useEffect(() => {
    if (!me) return;
    const fresh = players.find((p) => p.id === me.id);
    if (fresh) setMe(fresh);
  }, [players]); // eslint-disable-line

  async function join() {
    if (!form.name.trim()) return;
    if (game.teamModeEnabled && !form.team) return;
    setJoining(true);
    const id = genId();
    const player = {
      id, name: form.name.trim(), employeeId: form.employeeId.trim(), company: form.company.trim(),
      team: form.team || null, gameCode: game.gameCode, score: 0, joinedAt: Date.now(), answers: {},
      lifelines: { fifty: false, audience: false, phone: false },
      lifelineData: {},
    };
    await safeSet(PLAYER_PREFIX + id, JSON.stringify(player), true);
    await safeSet(MY_ID_KEY, id, false);
    setMe(player);
    setJoining(false);
  }

  async function submitAnswer(qIndex, optionIndex, question) {
    if (!me || !game) return;
    if (me.answers && me.answers[qIndex] !== undefined) return; // no duplicates
    const currentServerTime = Date.now() + serverOffset;
    const elapsed = (currentServerTime - (game.questionStartedAt || currentServerTime)) / 1000;
    if (elapsed > GAME_QUESTION_SECONDS) return; // late
    const correct = optionIndex === question.correct;
    let points = 0;
    const speedMark = correct ? Math.max(0, Math.round(((GAME_QUESTION_SECONDS - elapsed) / GAME_QUESTION_SECONDS) * 100)) : 0;
    if (correct) {
      points = Math.round((question.points || 100) * (0.5 + speedMark / 200));
    }
    const updated = {
      ...me,
      score: (me.score || 0) + points,
      answers: { ...(me.answers || {}), [qIndex]: { answer: optionIndex, correct, points, speedMark, elapsed: Math.round(elapsed * 10) / 10, submittedAt: currentServerTime } },
    };
    setMe(updated);
    await safeSet(PLAYER_PREFIX + me.id, JSON.stringify(updated), true);
  }

  async function submitHazardTap(qIndex, xPct, yPct, question) {
    if (!me || !game) return;
    const prior = (me.answers && me.answers[qIndex]) || { type: "hazard", found: [], misses: 0, score: 0 };
    if (prior.found.length >= question.hazards.length) return; // already found all
    const currentServerTime = Date.now() + serverOffset;
    const elapsed = (currentServerTime - (game.questionStartedAt || currentServerTime)) / 1000;
    if (elapsed > getQuestionDuration(question)) return; // time's up

    const hit = question.hazards.find(
      (h) => !prior.found.includes(h.id) && hazardDistancePct(xPct, yPct, h.xPct, h.yPct) <= (h.radiusPct || 8)
    );

    let addPoints = 0;
    let nextFound = prior.found;
    let nextMisses = prior.misses || 0;
    if (hit) {
      addPoints = hit.points;
      nextFound = [...prior.found, hit.id];
      if (nextFound.length === question.hazards.length) addPoints += question.bonusAll || 0;
    } else {
      addPoints = -(question.wrongPenalty || 0);
      nextMisses = nextMisses + 1;
    }

    const nextAnswer = { type: "hazard", found: nextFound, misses: nextMisses, score: (prior.score || 0) + addPoints, lastTap: { xPct, yPct, hit: !!hit } };
    const updated = {
      ...me,
      score: (me.score || 0) + addPoints,
      answers: { ...(me.answers || {}), [qIndex]: nextAnswer },
    };
    setMe(updated);
    await safeSet(PLAYER_PREFIX + me.id, JSON.stringify(updated), true);
  }

  async function useLifeline(qIndex, type, question) {
    if (!me) return;
    if (me.lifelines && me.lifelines[type]) return; // already used, once per game
    const nextLifelines = { ...(me.lifelines || {}), [type]: true };
    const nextData = { ...(me.lifelineData || {}) };
    if (type === "fifty") {
      const wrongIdxs = question.options.map((_, i) => i).filter((i) => i !== question.correct);
      const shuffled = [...wrongIdxs].sort(() => Math.random() - 0.5);
      nextData[qIndex] = { ...(nextData[qIndex] || {}), fiftyEliminated: shuffled.slice(0, 2) };
    }
    const updated = { ...me, lifelines: nextLifelines, lifelineData: nextData };
    setMe(updated);
    await safeSet(PLAYER_PREFIX + me.id, JSON.stringify(updated), true);
  }

  const sorted = useMemo(() => [...players].sort((a, b) => (b.score || 0) - (a.score || 0)), [players]);
  const teamScores = useMemo(
    () => (game?.teamModeEnabled ? computeTeamScores(players, game.teams, game.teamScoringMode) : []),
    [game?.teamModeEnabled, players, game?.teams, game?.teamScoringMode]
  );

  if (!game) {
    return <Centered><p style={{ color: COLORS.muted }}>Waiting for the admin to create a game…</p><button style={linkBtnStyle} onClick={onExit}>← Back</button></Centered>;
  }

  if (!me && !codeVerified) {
    return (
      <Centered>
        <Panel title="Enter game code" icon={<LogIn size={20} color={COLORS.green} />}>
          <p style={{ color: COLORS.muted, fontSize: 13, marginBottom: 14 }}>Enter the 6-digit code shown on the TV or scan the event QR.</p>
          <input
            style={inputStyle} value={code} inputMode="numeric" maxLength={6} placeholder="Game code"
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setCodeError(""); }}
            onKeyDown={(e) => e.key === "Enter" && verifyCode()}
          />
          {codeError && <p style={{ color: COLORS.red, fontSize: 13, margin: "-4px 0 10px" }}>{codeError}</p>}
          <button style={btnStyle(COLORS.green)} disabled={code.length !== 6} onClick={verifyCode}>ENTER GAME</button>
          <button style={btnStyle(COLORS.surfaceRaised)} onClick={() => setScannerOpen(true)}><QrCode size={16} /> Scan QR</button>
          <button style={linkBtnStyle} onClick={onExit}>← Back</button>
        </Panel>
        {scannerOpen && <QRScanner onDetected={handleScanDetected} onClose={() => setScannerOpen(false)} />}
      </Centered>
    );
  }

  if (!me) {
    return (
      <Centered>
        <Panel title="Join the game" icon={<LogIn size={20} color={COLORS.green} />}>
          <p style={{ color: COLORS.muted, fontSize: 13, marginBottom: 14 }}>Game code <b style={{ color: COLORS.yellow }}>{game.gameCode}</b></p>
          <input style={inputStyle} placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          {game.teamModeEnabled && (
            <select style={inputStyle} value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })}>
              <option value="">Select your team…</option>
              {(game.teams || []).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          <input style={inputStyle} placeholder="Employee ID (optional)" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} />
          <input style={inputStyle} placeholder="Company (optional)" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          <button disabled={joining || !form.name.trim() || (game.teamModeEnabled && !form.team)} style={btnStyle(COLORS.green)} onClick={join}>{joining ? "Joining…" : "JOIN GAME"}</button>
          <button style={linkBtnStyle} onClick={onExit}>← Back</button>
        </Panel>
        {scannerOpen && <QRScanner onDetected={handleScanDetected} onClose={() => setScannerOpen(false)} />}
      </Centered>
    );
  }

  const rank = sorted.findIndex((p) => p.id === me.id) + 1;
  const curQ = questions[game.qIndex ?? 0];
  const myAnswer = curQ && me.answers ? me.answers[game.qIndex] : undefined;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${COLORS.line}` }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{me.name}</div>
        <ConnBadge connected={connected} />
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}>
        {game.status === "lobby" && (
          <>
            <CheckCircle2 size={48} color={COLORS.green} />
            <h2 style={{ marginTop: 14, fontSize: 20, fontWeight: 800 }}>You have joined!</h2>
            <p style={{ color: COLORS.muted, marginTop: 6 }}>Please wait for the admin to start the game.</p>
          </>
        )}

        {game.status === "question" && curQ && curQ.round === "hazard" && (
          <HazardQuestion
            question={curQ}
            startedAt={game.questionStartedAt}
            now={now}
            myAnswer={myAnswer}
            onTap={(x, y) => submitHazardTap(game.qIndex, x, y, curQ)}
          />
        )}

        {game.status === "question" && curQ && curQ.round === "millionaire" && myAnswer === undefined && (
          <MillionaireQuestion
            question={curQ}
            startedAt={game.questionStartedAt}
            now={now}
            me={me}
            players={players}
            qIndex={game.qIndex}
            onAnswer={(i) => submitAnswer(game.qIndex, i, curQ)}
            onLifeline={(type) => useLifeline(game.qIndex, type, curQ)}
          />
        )}

        {game.status === "question" && curQ && curQ.round !== "hazard" && curQ.round !== "millionaire" && myAnswer === undefined && (
          <QuestionCard question={curQ} startedAt={game.questionStartedAt} now={now} onAnswer={(i) => submitAnswer(game.qIndex, i, curQ)} />
        )}

        {game.status === "question" && curQ && curQ.round !== "hazard" && myAnswer !== undefined && (
          <>
            <CheckCircle2 size={48} color={COLORS.green} />
            <h2 style={{ marginTop: 14, fontSize: 20, fontWeight: 800 }}>ANSWER SUBMITTED</h2>
            <p style={{ color: COLORS.muted, marginTop: 6 }}>Waiting for results…</p>
          </>
        )}

        {game.status === "reveal" && curQ && curQ.round === "hazard" && (
          <HazardResultCard question={curQ} myAnswer={myAnswer} score={me.score || 0} rank={rank} />
        )}

        {game.status === "reveal" && curQ && curQ.round !== "hazard" && (
          <ResultCard question={curQ} myAnswer={myAnswer} score={me.score || 0} rank={rank} />
        )}

        {game.status === "leaderboard" && (
          <div style={{ width: "100%", maxWidth: 380 }}>
            <h3 style={{ textAlign: "center", fontWeight: 800, marginBottom: 12 }}>Leaderboard</h3>
            {sorted.slice(0, 10).map((p, i) => <LeaderRow key={p.id} rank={i + 1} name={p.name} sub={p.team || p.company} score={p.score || 0} highlight={p.id === me.id} />)}
            {game.teamModeEnabled && teamScores.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 800, color: COLORS.muted, margin: "16px 0 8px", textAlign: "center" }}>TEAM LEADERBOARD</div>
                {teamScores.map((t, i) => <LeaderRow key={t.name} rank={i + 1} name={t.name} sub={`${t.count} player${t.count === 1 ? "" : "s"}`} score={t.score} highlight={t.name === me.team} />)}
              </>
            )}
          </div>
        )}

        {game.status === "ended" && (
          <WinnerBlock players={sorted} me={me} rank={rank} teamScores={teamScores} />
        )}
      </div>
    </div>
  );
}

function QuestionCard({ question, startedAt, now, onAnswer }) {
  const remaining = Math.max(0, GAME_QUESTION_SECONDS - Math.floor((now - startedAt) / 1000));
  const isTF = question.round === "truefalse";
  const [picked, setPicked] = useState(null);
  const optionColors = [COLORS.orange, COLORS.green, COLORS.yellow, "#5B8DEF"];

  return (
    <div style={{ width: "100%", maxWidth: 420 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: COLORS.muted, fontWeight: 700 }}>{question.category}</span>
        <TimerBadge remaining={remaining} total={GAME_QUESTION_SECONDS} />
      </div>
      <p style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.35, marginBottom: 18 }}>{question.question}</p>
      {question.videoUrl && <VideoEmbed url={question.videoUrl} />}
      <div style={{ display: "grid", gridTemplateColumns: isTF ? "1fr 1fr" : "1fr 1fr", gap: 10 }}>
        {question.options.map((opt, i) => (
          <button
            key={i}
            disabled={remaining === 0 || picked !== null}
            onClick={() => { setPicked(i); onAnswer(i); }}
            style={{
              padding: isTF ? "28px 10px" : "22px 10px", borderRadius: 10, border: "none",
              background: optionColors[i % optionColors.length], color: "#14171A",
              fontWeight: 800, fontSize: isTF ? 18 : 15, cursor: remaining === 0 ? "not-allowed" : "pointer",
              opacity: remaining === 0 ? 0.5 : 1, gridColumn: isTF ? "span 1" : undefined,
              minHeight: 64,
            }}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function VideoEmbed({ url }) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(parsed.protocol)) return null;
  const youtubeId = parsed.hostname.includes("youtu.be")
    ? parsed.pathname.slice(1)
    : parsed.hostname.includes("youtube.com") ? parsed.searchParams.get("v") : null;
  if (youtubeId) {
    return <iframe title="Question video" src={`https://www.youtube.com/embed/${encodeURIComponent(youtubeId)}`} style={{ width: "100%", aspectRatio: "16 / 9", border: 0, borderRadius: 8, marginBottom: 16 }} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />;
  }
  return <video controls preload="metadata" src={url} style={{ width: "100%", maxHeight: 280, borderRadius: 8, marginBottom: 16, background: "#000" }}>Your browser cannot play this video.</video>;
}

function MillionaireQuestion({ question, startedAt, now, me, players, qIndex, onAnswer, onLifeline }) {
  const remaining = Math.max(0, GAME_QUESTION_SECONDS - Math.floor((now - startedAt) / 1000));
  const [picked, setPicked] = useState(null);
  const [showAudience, setShowAudience] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const eliminated = (me.lifelineData && me.lifelineData[qIndex] && me.lifelineData[qIndex].fiftyEliminated) || [];
  const optionColors = [COLORS.orange, COLORS.green, COLORS.yellow, "#5B8DEF"];

  const otherAnswers = players
    .filter((p) => p.id !== me.id && p.answers && p.answers[qIndex] && p.answers[qIndex].answer !== undefined)
    .map((p) => p.answers[qIndex].answer);
  const audienceDist = question.options.map((_, i) => otherAnswers.filter((a) => a === i).length);
  const audienceTotal = Math.max(1, otherAnswers.length);

  return (
    <div style={{ width: "100%", maxWidth: 440 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, color: COLORS.purple }}>
          <Gem size={14} /> {question.tier?.toUpperCase()}
        </span>
        <TimerBadge remaining={remaining} total={GAME_QUESTION_SECONDS} />
      </div>
      <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 12 }}>Worth {question.points} points</div>
      {question.videoUrl && <VideoEmbed url={question.videoUrl} />}
      <p style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.35, marginBottom: 16 }}>{question.question}</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <LifelineButton icon={<Percent size={14} />} label="50:50" used={me.lifelines?.fifty} onClick={() => onLifeline("fifty")} />
        <LifelineButton icon={<Users size={14} />} label="Ask the Room" used={me.lifelines?.audience} onClick={() => { onLifeline("audience"); setShowAudience(true); }} />
        <LifelineButton icon={<Phone size={14} />} label="Hint" used={me.lifelines?.phone} onClick={() => { onLifeline("phone"); setShowHint(true); }} />
      </div>

      {showAudience && (
        <div style={{ background: COLORS.surfaceRaised, borderRadius: 8, padding: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 6 }}>HOW OTHERS ARE VOTING SO FAR ({otherAnswers.length} answered)</div>
          {question.options.map((opt, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, fontSize: 12 }}>
              <span style={{ width: 18 }}>{String.fromCharCode(65 + i)}</span>
              <div style={{ flex: 1, height: 8, background: "#00000033", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${(audienceDist[i] / audienceTotal) * 100}%`, height: "100%", background: COLORS.purple }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {showHint && (
        <div style={{ background: COLORS.surfaceRaised, borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 13, color: COLORS.muted }}>
          💡 {question.explanation}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {question.options.map((opt, i) => {
          const isOut = eliminated.includes(i);
          return (
            <button
              key={i}
              disabled={remaining === 0 || picked !== null || isOut}
              onClick={() => { setPicked(i); onAnswer(i); }}
              style={{
                padding: "20px 10px", borderRadius: 10, border: "none",
                background: isOut ? COLORS.surfaceRaised : optionColors[i % optionColors.length],
                color: isOut ? COLORS.muted : "#14171A",
                fontWeight: 800, fontSize: 14, cursor: (remaining === 0 || isOut) ? "not-allowed" : "pointer",
                opacity: (remaining === 0 && !isOut) ? 0.5 : 1, minHeight: 60,
                textDecoration: isOut ? "line-through" : "none",
              }}
            >
              {isOut ? "" : opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const LifelineButton = React.memo(function LifelineButton({ icon, label, used, onClick }) {
  return (
    <button
      disabled={used}
      onClick={onClick}
      style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        padding: "8px 4px", borderRadius: 8, border: `1px solid ${used ? COLORS.line : COLORS.purple}`,
        background: used ? COLORS.surfaceRaised : COLORS.purple + "22", color: used ? COLORS.muted : COLORS.purple,
        fontSize: 10, fontWeight: 700, cursor: used ? "not-allowed" : "pointer", opacity: used ? 0.5 : 1,
      }}
    >
      {used ? <Ban size={14} /> : icon}
      {label}
    </button>
  );
});

function HazardQuestion({ question, startedAt, now, myAnswer, onTap }) {
  const duration = getQuestionDuration(question);
  const remaining = Math.max(0, duration - Math.floor((now - startedAt) / 1000));
  const found = myAnswer?.found || [];
  const [flash, setFlash] = useState(null); // {x,y,hit}
  const allFound = found.length >= question.hazards.length;

  function handleTap(x, y) {
    if (remaining === 0 || allFound) return;
    onTap(x, y);
    setFlash({ x, y, key: Date.now() });
    setTimeout(() => setFlash(null), 500);
  }

  const markers = found.map((id) => {
    const h = question.hazards.find((hh) => hh.id === id);
    return h ? { key: id, xPct: h.xPct, yPct: h.yPct, color: COLORS.green, size: 24, label: "✓" } : null;
  }).filter(Boolean);
  if (flash) markers.push({ key: "flash-" + flash.key, xPct: flash.x, yPct: flash.y, color: flash.hit ? COLORS.green : COLORS.red, size: 18, label: "" });

  return (
    <div style={{ width: "100%", maxWidth: 460 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 800, color: COLORS.orange }}><Target size={14} /> FIND THE HAZARDS!</span>
        <TimerBadge remaining={remaining} total={duration} />
      </div>
      <p style={{ fontSize: 13, color: COLORS.muted, marginBottom: 10 }}>Tap the screen wherever you spot a safety hazard. Found {found.length} / {question.hazards.length}.</p>
      <HazardImage question={question} markers={markers} onTap={remaining > 0 && !allFound ? handleTap : undefined} />
      {allFound && <p style={{ textAlign: "center", color: COLORS.green, fontWeight: 800, marginTop: 12 }}>All hazards found! Waiting for results…</p>}
    </div>
  );
}

function HazardResultCard({ question, myAnswer, score, rank }) {
  const found = myAnswer?.found || [];
  const allMarkers = question.hazards.map((h) => ({
    key: h.id, xPct: h.xPct, yPct: h.yPct,
    color: found.includes(h.id) ? COLORS.green : COLORS.red,
    size: 24, label: found.includes(h.id) ? "✓" : "✗",
  }));
  return (
    <div style={{ textAlign: "center", width: "100%", maxWidth: 460 }}>
      <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 10 }}>{found.length} / {question.hazards.length} hazards found</h2>
      <HazardImage question={question} markers={allMarkers} />
      <div style={{ textAlign: "left", marginTop: 14, display: "grid", gap: 6 }}>
        {question.hazards.map((h) => (
          <div key={h.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
            {found.includes(h.id) ? <CheckCircle2 size={15} color={COLORS.green} style={{ flexShrink: 0, marginTop: 1 }} /> : <XCircle size={15} color={COLORS.red} style={{ flexShrink: 0, marginTop: 1 }} />}
            <span><b>{h.name}</b> — <span style={{ color: COLORS.muted }}>{h.description}</span></span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 18 }}>
        <StatCell label="Round score" value={"+" + Math.max(0, myAnswer?.score || 0)} />
        <StatCell label="Total score" value={score} />
        <StatCell label="Rank" value={"#" + rank} />
      </div>
    </div>
  );
}

function TimerBadge({ remaining, total }) {
  const urgent = remaining <= 3;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 900, fontSize: 15, color: urgent ? COLORS.red : COLORS.yellow }}>
      <Clock size={14} /> {remaining}s
    </div>
  );
}

function ResultCard({ question, myAnswer, score, rank }) {
  const answered = myAnswer !== undefined;
  const correct = answered && myAnswer.correct;
  return (
    <div style={{ textAlign: "center", width: "100%", maxWidth: 360 }}>
      {correct ? <CheckCircle2 size={52} color={COLORS.green} /> : <XCircle size={52} color={COLORS.red} />}
      <h2 style={{ marginTop: 12, fontSize: 22, fontWeight: 900, color: correct ? COLORS.green : COLORS.red }}>
        {answered ? (correct ? "CORRECT!" : "INCORRECT") : "NO ANSWER"}
      </h2>
      <p style={{ color: COLORS.muted, marginTop: 6, fontSize: 14 }}>
        Correct answer: <b style={{ color: COLORS.ink }}>{question.options[question.correct]}</b>
      </p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 18 }}>
        <StatCell label="Points earned" value={"+" + (answered ? myAnswer.points : 0)} />
        {answered && <StatCell label="Speed mark" value={`${myAnswer.speedMark || 0}/100`} />}
        <StatCell label="Total score" value={score} />
        <StatCell label="Rank" value={"#" + rank} />
      </div>
    </div>
  );
}

function WinnerBlock({ players, me, rank, teamScores = [] }) {
  const podium = players.slice(0, 3);
  return (
    <div style={{ textAlign: "center", width: "100%", maxWidth: 380 }}>
      <Crown size={44} color={COLORS.yellow} />
      <h2 style={{ fontSize: 22, fontWeight: 900, margin: "10px 0 4px" }}>GAME OVER</h2>
      {podium[0] && <p style={{ color: COLORS.muted, marginBottom: 18 }}>Safety Champion: <b style={{ color: COLORS.yellow }}>{podium[0].name}</b></p>}
      <div style={{ marginBottom: 18 }}>
        {podium.map((p, i) => <LeaderRow key={p.id} rank={i + 1} name={p.name} sub={p.team || p.company} score={p.score || 0} highlight={p.id === me.id} />)}
      </div>
      <p style={{ fontSize: 14 }}>You finished <b>#{rank}</b> with <b>{me.score || 0}</b> points.</p>
      {teamScores.length > 0 && teamScores[0].count > 0 && (
        <p style={{ fontSize: 14, marginTop: 10, color: COLORS.muted }}>Best team: <b style={{ color: COLORS.yellow }}>{teamScores[0].name}</b> ({teamScores[0].score} pts)</p>
      )}
    </div>
  );
}

/* -------------------------------- TV VIEW -------------------------------- */

function TVView({ onExit }) {
  const { game, questions, players, connected } = useGamePoll();
  const [now, setNow] = useState(Date.now());
  const [serverOffset, setServerOffset] = useState(0);
  useEffect(() => {
    let mounted = true;
    const syncClock = async () => {
      const offset = await getServerTimeOffset();
      if (mounted) setServerOffset(offset);
    };
    syncClock();
    const syncId = setInterval(syncClock, 30000);
    const tickId = setInterval(() => setNow(Date.now() + serverOffset), 250);
    return () => { mounted = false; clearInterval(syncId); clearInterval(tickId); };
  }, [serverOffset]);

  const sorted = useMemo(() => [...players].sort((a, b) => (b.score || 0) - (a.score || 0)), [players]);
  const teamScores = useMemo(
    () => (game?.teamModeEnabled ? computeTeamScores(players, game.teams, game.teamScoringMode) : []),
    [game?.teamModeEnabled, players, game?.teams, game?.teamScoringMode]
  );

  if (!game) {
    return (
      <Centered>
        <p style={{ color: COLORS.muted }}>No active game. Ask the admin to create one.</p>
        <button style={linkBtnStyle} onClick={onExit}>← Back</button>
      </Centered>
    );
  }

  const curQ = questions[game.qIndex ?? 0];
  const millionaireQs = questions.filter((q) => q.round === "millionaire");

  return (
    <div style={{ minHeight: "100vh", padding: "26px 40px", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <HardHat size={26} color={COLORS.yellow} />
          <span style={{ fontWeight: 900, fontSize: 20, letterSpacing: -0.5 }}>CONSTRUCTION SAFETY LEAGUE</span>
        </div>
        <ConnBadge connected={connected} />
      </div>

      {game.status === "lobby" && <LobbyDisplay game={game} players={players} />}
      {game.status === "question" && curQ && curQ.round === "millionaire" && <MillionaireDisplay q={curQ} qIndex={game.qIndex} total={questions.length} startedAt={game.questionStartedAt} now={now} players={players} ladder={millionaireQs} />}
      {game.status === "question" && curQ && curQ.round !== "millionaire" && <QuestionDisplay q={curQ} qIndex={game.qIndex} total={questions.length} startedAt={game.questionStartedAt} now={now} players={players} />}
      {game.status === "reveal" && curQ && <RevealDisplay q={curQ} qIndex={game.qIndex} total={questions.length} players={players} />}
      {game.status === "leaderboard" && <LeaderboardDisplay players={sorted} teamScores={teamScores} mediaUrl={game.leaderboardMediaUrl} mediaSettings={game} />}
      {game.status === "ended" && <WinnerDisplay players={sorted} teamScores={teamScores} />}
    </div>
  );
}

function LobbyDisplay({ game, players }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: COLORS.yellow, color: "#1A1200", padding: "8px 18px", borderRadius: 6, fontWeight: 800 }}>
        <QrCode size={18} /> SCAN TO JOIN
      </div>
      <QRBlock value={game.gameCode} />
      <div style={{ fontSize: 15, color: COLORS.muted }}>OR ENTER GAME CODE</div>
      <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: 6, color: COLORS.yellow }}>{game.gameCode}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 10 }}>{players.length} {players.length === 1 ? "PLAYER" : "PLAYERS"} JOINED</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxWidth: 700, justifyContent: "center" }}>
        {players.slice(-24).map((p) => (
          <span key={p.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 20, padding: "5px 12px", fontSize: 13 }}>{p.name}</span>
        ))}
      </div>
    </div>
  );
}

function QRBlock({ value }) {
  const ref = useRef(null);
  const joinUrl = useMemo(() => {
    const u = new URL(HOSTED_APP_URL);
    u.searchParams.set("role", "player");
    return u.toString();
  }, [value]);
  useEffect(() => {
    let cancelled = false;
    const draw = () => {
      if (cancelled || !ref.current || !window.QRCode) return;
      ref.current.innerHTML = "";
      try {
        // eslint-disable-next-line no-new
        new window.QRCode(ref.current, { text: joinUrl, width: 180, height: 180, colorDark: "#14171A", colorLight: "#FFC629" });
      } catch {}
    };
    if (window.QRCode) { draw(); return; }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
    script.onload = draw;
    document.body.appendChild(script);
    return () => { cancelled = true; };
  }, [value]);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div ref={ref} style={{ width: 180, height: 180, background: COLORS.yellow, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }} />
      <div style={{ display: "flex", gap: 8 }}>
        <button style={{ padding: "6px 10px", borderRadius: 8, border: "none", background: COLORS.surfaceRaised, color: COLORS.ink, cursor: "pointer" }} onClick={() => { try { navigator.clipboard.writeText(joinUrl); } catch {} }}>
          Copy join link
        </button>
        <a style={{ padding: "6px 10px", borderRadius: 8, textDecoration: "none", background: COLORS.green, color: "#08110a" }} href={joinUrl} target="_blank" rel="noreferrer">Open</a>
      </div>
    </div>
  );
}

function QRScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const detectorRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    let stream = null;
    (async () => {
      try {
        if (!('BarcodeDetector' in window) && !window.jsQR) {
          await new Promise((resolve) => {
            const s = document.createElement('script');
            s.src = 'https://unpkg.com/jsqr/dist/jsQR.js';
            s.onload = resolve;
            document.body.appendChild(s);
          });
        }
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!mounted) return;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try { await videoRef.current.play(); } catch {}
        }
        if ('BarcodeDetector' in window) {
          try { detectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch {}
        }

        const tick = async () => {
          if (!mounted) return;
          try {
            const v = videoRef.current;
            if (!v || v.readyState < 2) { requestAnimationFrame(tick); return; }
            const w = v.videoWidth, h = v.videoHeight;
            const c = canvasRef.current;
            if (!c) { requestAnimationFrame(tick); return; }
            c.width = w; c.height = h;
            const ctx = c.getContext('2d');
            ctx.drawImage(v, 0, 0, w, h);
            if (detectorRef.current) {
              try {
                const bitmap = await createImageBitmap(c);
                const results = await detectorRef.current.detect(bitmap);
                if (results && results.length) { onDetected(results[0].rawValue); return; }
              } catch {}
            } else if (window.jsQR) {
              try {
                const img = ctx.getImageData(0, 0, w, h);
                const code = window.jsQR(img.data, img.width, img.height);
                if (code && code.data) { onDetected(code.data); return; }
              } catch {}
            }
          } catch {}
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      } catch (e) {
        console.error('QRScanner error', e);
        onClose();
      }
    })();
    return () => { mounted = false; try { if (stream) stream.getTracks().forEach((t) => t.stop()); } catch {} };
  }, [onDetected, onClose]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 520, aspectRatio: '3/4', position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
        <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} playsInline muted />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <button onClick={onClose} style={{ position: 'absolute', right: 12, top: 12, padding: '8px 10px', borderRadius: 8, border: 'none', background: COLORS.surfaceRaised, color: COLORS.ink, cursor: 'pointer' }}>Close</button>
        <div style={{ position: 'absolute', left: 12, top: 12, color: COLORS.muted, fontSize: 13 }}>Point camera at the QR code</div>
      </div>
    </div>
  );
}

function QuestionDisplay({ q, qIndex, total, startedAt, now, players }) {
  const duration = getQuestionDuration(q);
  const remaining = Math.max(0, duration - Math.floor((now - startedAt) / 1000));
  const pct = total ? Math.round(((qIndex + 1) / total) * 100) : 0;

  if (q.round === "hazard") {
    const foundAll = players.filter((p) => p.answers && p.answers[qIndex] && p.answers[qIndex].found?.length >= q.hazards.length).length;
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: COLORS.muted, marginBottom: 6 }}>
          <span>{q.category.toUpperCase()} · QUESTION {qIndex + 1} / {total}</span>
          <span>{foundAll} / {players.length} FOUND ALL HAZARDS</span>
        </div>
        <div style={{ height: 5, background: COLORS.surface, borderRadius: 3, marginBottom: 24 }}>
          <div style={{ width: pct + "%", height: "100%", background: COLORS.yellow, borderRadius: 3, transition: "width .3s" }} />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22 }}>
          <div style={{ fontSize: remaining <= 3 ? 96 : 60, fontWeight: 900, color: remaining <= 3 ? COLORS.red : COLORS.yellow }}>{remaining}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 30, fontWeight: 900 }}><Target color={COLORS.orange} /> FIND THE HAZARDS!</div>
          <HazardImage question={q} maxWidth={640} />
          <p style={{ color: COLORS.muted, fontSize: 15 }}>Players are tapping their phones to spot {q.hazards.length} hazards in this scene.</p>
        </div>
      </div>
    );
  }

  const answered = players.filter((p) => p.answers && p.answers[qIndex] !== undefined).length;
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: COLORS.muted, marginBottom: 6 }}>
        <span>{q.category.toUpperCase()} · QUESTION {qIndex + 1} / {total}</span>
        <span>{answered} / {players.length} ANSWERED</span>
      </div>
      <div style={{ height: 5, background: COLORS.surface, borderRadius: 3, marginBottom: 24 }}>
        <div style={{ width: pct + "%", height: "100%", background: COLORS.yellow, borderRadius: 3, transition: "width .3s" }} />
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 26 }}>
        <div style={{ fontSize: remaining <= 3 ? 96 : 72, fontWeight: 900, color: remaining <= 3 ? COLORS.red : COLORS.yellow, transition: "font-size .2s" }}>{remaining}</div>
        <p style={{ fontSize: 32, fontWeight: 800, textAlign: "center", maxWidth: 900, lineHeight: 1.3 }}>{q.question}</p>
        {q.videoUrl && <div style={{ width: "100%", maxWidth: 560 }}><VideoEmbed url={q.videoUrl} /></div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, width: "100%", maxWidth: 800 }}>
          {q.options.map((opt, i) => (
            <div key={i} style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: "18px 22px", fontSize: 20, fontWeight: 700 }}>
              <span style={{ color: COLORS.yellow, marginRight: 10 }}>{q.round === "truefalse" ? "" : String.fromCharCode(65 + i) + "."}</span>{opt}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MillionaireDisplay({ q, qIndex, total, startedAt, now, players, ladder }) {
  const remaining = Math.max(0, GAME_QUESTION_SECONDS - Math.floor((now - startedAt) / 1000));
  const answered = players.filter((p) => p.answers && p.answers[qIndex] !== undefined).length;
  return (
    <div style={{ flex: 1, display: "flex", gap: 30 }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: COLORS.purple, fontWeight: 800, marginBottom: 14 }}>
          <Gem size={16} /> SAFETY MILLIONAIRE FINALE · {answered} / {players.length} ANSWERED
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 26 }}>
          <div style={{ fontSize: remaining <= 3 ? 96 : 72, fontWeight: 900, color: remaining <= 3 ? COLORS.red : COLORS.purple }}>{remaining}</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.muted }}>{q.tier} · {q.points} POINTS</div>
          <p style={{ fontSize: 30, fontWeight: 800, textAlign: "center", maxWidth: 800, lineHeight: 1.3 }}>{q.question}</p>
          {q.videoUrl && <div style={{ width: "100%", maxWidth: 560 }}><VideoEmbed url={q.videoUrl} /></div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, width: "100%", maxWidth: 760 }}>
            {q.options.map((opt, i) => (
              <div key={i} style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: "16px 20px", fontSize: 18, fontWeight: 700 }}>
                <span style={{ color: COLORS.purple, marginRight: 10 }}>{String.fromCharCode(65 + i)}.</span>{opt}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ width: 220, display: "flex", flexDirection: "column-reverse", gap: 6, justifyContent: "center" }}>
        {ladder.map((lq, i) => {
          const isCurrent = lq.ladderIndex === q.ladderIndex;
          return (
            <div key={i} style={{
              padding: "8px 12px", borderRadius: 6, textAlign: "right",
              background: isCurrent ? COLORS.purple : COLORS.surface,
              color: isCurrent ? "#14171A" : COLORS.muted,
              border: `1px solid ${isCurrent ? COLORS.purple : COLORS.line}`,
              fontWeight: isCurrent ? 900 : 600, fontSize: 13,
            }}>
              {lq.points} · {lq.tier}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RevealDisplay({ q, qIndex, total, players }) {
  if (q.round === "hazard") {
    const markers = q.hazards.map((h) => {
      const foundBy = players.filter((p) => p.answers && p.answers[qIndex] && p.answers[qIndex].found?.includes(h.id)).length;
      const pctFound = players.length ? Math.round((foundBy / players.length) * 100) : 0;
      return { ...h, key: h.id, xPct: h.xPct, yPct: h.yPct, color: COLORS.green, size: 26, label: String(pctFound) + "%" };
    });
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
        <div style={{ fontSize: 13, color: COLORS.muted }}>QUESTION {qIndex + 1} / {total} · HAZARDS REVEALED</div>
        <HazardImage question={q} markers={markers} maxWidth={640} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, width: "100%", maxWidth: 700 }}>
          {q.hazards.map((h) => (
            <div key={h.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{h.name}</div>
              <div style={{ fontSize: 12, color: COLORS.muted }}>{h.description}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  const dist = q.options.map((_, i) => players.filter((p) => p.answers && p.answers[qIndex] && p.answers[qIndex].answer === i).length);
  const maxD = Math.max(1, ...dist);
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24 }}>
      <div style={{ fontSize: 13, color: COLORS.muted }}>QUESTION {qIndex + 1} / {total} · ANSWER REVEALED{q.round === "millionaire" ? ` · ${q.tier}` : ""}</div>
      <p style={{ fontSize: 28, fontWeight: 800, textAlign: "center", maxWidth: 900 }}>{q.question}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, width: "100%", maxWidth: 800 }}>
        {q.options.map((opt, i) => {
          const isCorrect = i === q.correct;
          return (
            <div key={i} style={{ background: isCorrect ? COLORS.green + "26" : COLORS.surface, border: `2px solid ${isCorrect ? COLORS.green : COLORS.line}`, borderRadius: 10, padding: "16px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                <span>{isCorrect && <CheckCircle2 size={16} style={{ marginRight: 6, verticalAlign: -2 }} color={COLORS.green} />}{opt}</span>
                <span style={{ color: COLORS.muted, fontWeight: 600, fontSize: 14 }}>{dist[i]}</span>
              </div>
              <div style={{ height: 6, background: "#00000055", borderRadius: 3 }}>
                <div style={{ width: `${(dist[i] / maxD) * 100}%`, height: "100%", background: isCorrect ? COLORS.green : COLORS.orange, borderRadius: 3 }} />
              </div>
            </div>
          );
        })}
      </div>
      {q.explanation && <p style={{ color: COLORS.muted, fontSize: 15, maxWidth: 700, textAlign: "center" }}>{q.explanation}</p>}
    </div>
  );
}

function LeaderboardMedia({ url }) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(parsed.protocol)) return null;
  const isImage = /\.(gif|png|jpe?g|webp)(?:$|[?#])/i.test(parsed.pathname);
  if (isImage) {
    return <img src={parsed.toString()} alt="Leaderboard celebration" style={{ display: "block", width: "min(100%, 420px)", maxHeight: 180, objectFit: "cover", borderRadius: 10, margin: "0 auto 18px", border: `1px solid ${COLORS.yellow}66` }} />;
  }
  return <div style={{ width: "min(100%, 560px)", margin: "0 auto 18px" }}><VideoEmbed url={parsed.toString()} /></div>;
}

function MediaSlot({ label, url }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ color: COLORS.muted, fontSize: 10, fontWeight: 800, marginBottom: 5 }}>{label}</div>
      <LeaderboardMedia url={url} />
    </div>
  );
}

function LeaderboardDisplay({ players, teamScores = [], mediaUrl, mediaSettings = {} }) {
  const [tab, setTab] = useState("individual");
  const previousRanksRef = useRef(new Map());
  const [rankMoves, setRankMoves] = useState({});
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const showTabs = teamScores.length > 0;
  const raceEntries = tab === "team" ? teamScores : players;
  const maxScore = Math.max(1, ...raceEntries.map((entry) => entry.score || 0));
  const leaderScore = raceEntries[0]?.score || 0;
  const laneColors = ["#FFC629", "#C7CCD1", "#D98B54", "#33C481", "#59B7FF", "#F477B8", "#A98BFF", "#FF7A1F", "#79D36B", "#F0A35B", "#5ED6C5", "#EC6B6B"];
  const getEntryMedia = (index) => {
    if (tab !== "individual") return "";
    if (index === 0) return mediaSettings.leaderboardTop1MediaUrl || "";
    if (index === 1) return mediaSettings.leaderboardTop2MediaUrl || "";
    if (index === 2) return mediaSettings.leaderboardTop3MediaUrl || "";
    if (index === raceEntries.length - 1) return mediaSettings.leaderboardBottom1MediaUrl || "";
    if (index === raceEntries.length - 2) return mediaSettings.leaderboardBottom2MediaUrl || "";
    return "";
  };
  const mediaIndexes = raceEntries.map((_, index) => index).filter((index) => getEntryMedia(index));

  useEffect(() => {
    setSpotlightIndex(0);
    if (mediaIndexes.length < 2) return undefined;
    const timer = setInterval(() => setSpotlightIndex((current) => (current + 1) % mediaIndexes.length), 10000);
    return () => clearInterval(timer);
  }, [raceEntries.length, tab, mediaSettings.leaderboardTop1MediaUrl, mediaSettings.leaderboardTop2MediaUrl, mediaSettings.leaderboardTop3MediaUrl, mediaSettings.leaderboardBottom1MediaUrl, mediaSettings.leaderboardBottom2MediaUrl]);
  const activeMediaIndex = mediaIndexes[spotlightIndex];

  useEffect(() => {
    const nextMoves = {};
    raceEntries.forEach((entry, index) => {
      const key = entry.id || entry.name;
      const previousRank = previousRanksRef.current.get(key);
      if (previousRank && previousRank !== index + 1) nextMoves[key] = previousRank - (index + 1);
      previousRanksRef.current.set(key, index + 1);
    });
    if (Object.keys(nextMoves).length) {
      setRankMoves(nextMoves);
      const timeout = setTimeout(() => setRankMoves({}), 2400);
      return () => clearTimeout(timeout);
    }
  }, [raceEntries]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "4vh 0" }}>
      <style>{`@keyframes cslRacePulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } } @keyframes cslRaceShimmer { from { background-position: 0 0; } to { background-position: 32px 0; } } @keyframes cslRaceGlow { 0%,100% { box-shadow: 0 0 0 0 #FFC62900; } 50% { box-shadow: 0 0 18px 3px #FFC62955; } } @keyframes cslLaneBob { 0%,100% { transform: translateX(0); } 50% { transform: translateX(5px); } } @keyframes cslRankUp { 0% { transform: translateY(10px); opacity: .2; } 100% { transform: translateY(0); opacity: 1; } } @media (max-width: 700px) { .csl-race-layout { display: block !important; } .csl-race-row { grid-template-columns: 32px minmax(80px, 1fr) 64px !important; } .csl-race-track { grid-column: 2 / 4; } .csl-race-media { grid-column: 2 / 4; width: 100%; } .csl-race-layout aside { margin-top: 14px; width: auto !important; } }`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <Trophy size={30} color={COLORS.yellow} style={{ animation: "cslRacePulse 1.8s ease-in-out infinite" }} />
        <span style={{ fontSize: 30, fontWeight: 900 }}>{tab === "team" ? "TEAM RACE" : "LIVE RACE"}</span>
      </div>
      <div style={{ color: COLORS.muted, fontSize: 13, marginBottom: showTabs ? 14 : 24 }}>Every point moves you closer to the finish line</div>
      {mediaUrl && <div style={{ width: "100%", maxWidth: 420, marginBottom: 16 }}><MediaSlot label="Group celebration" url={mediaUrl} /></div>}
      <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: 900, marginBottom: 18 }}>
        <StatCell label="Racers" value={raceEntries.length} />
        <StatCell label="Leader score" value={leaderScore} />
        <StatCell label="Finish target" value={maxScore} />
      </div>
      {showTabs && (
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {["individual", "team"].map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "6px 16px", borderRadius: 20, border: `1px solid ${tab === t ? COLORS.yellow : COLORS.line}`,
              background: tab === t ? COLORS.yellow + "22" : "transparent", color: tab === t ? COLORS.yellow : COLORS.muted,
              fontWeight: 700, fontSize: 13, cursor: "pointer", textTransform: "capitalize",
            }}>{t}</button>
          ))}
        </div>
      )}
      <div className="csl-race-layout" style={{ display: "flex", alignItems: "flex-start", gap: 20, width: "100%", maxWidth: 1180 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {raceEntries.map((entry, i) => {
          const score = entry.score || 0;
          const laneColor = laneColors[i % laneColors.length];
          const isWinner = tab === "individual" && i === 0;
          const isPodium = tab === "individual" && i < 3;
          const rankMove = rankMoves[entry.id || entry.name] || 0;
          const gap = Math.max(0, leaderScore - score);
          const rowMedia = getEntryMedia(i);
          const isSpotlight = activeMediaIndex === i;
          const label = tab === "team" ? entry.name : entry.name;
          const sub = tab === "team" ? `${entry.count} player${entry.count === 1 ? "" : "s"}` : (entry.team || entry.company || "Racing");
          return (
            <div className={`csl-race-row${rowMedia && isSpotlight ? " csl-race-row-with-media" : ""}`} key={entry.id || entry.name} style={{ display: "grid", gridTemplateColumns: rowMedia && isSpotlight ? "36px minmax(90px, 180px) 1fr 150px 64px" : "36px minmax(90px, 180px) 1fr 64px", alignItems: "center", gap: 8, padding: "10px 10px", background: isWinner ? COLORS.yellow + "1f" : COLORS.surface, border: `1px solid ${isSpotlight ? laneColor : isPodium ? laneColor : COLORS.line}`, borderRadius: 10, marginBottom: rowMedia && isSpotlight ? 18 : 8, animation: isWinner ? "cslRaceGlow 1.8s ease-in-out infinite" : "none" }}>
              <div style={{ textAlign: "center", fontWeight: 900, fontSize: 18, color: laneColor }}>{isPodium ? ["🏆", "🥈", "🥉"][i] : i + 1}{rankMove > 0 && <span style={{ display: "block", color: COLORS.green, fontSize: 10, animation: "cslRankUp .4s ease-out" }}>▲{rankMove}</span>}{rankMove < 0 && <span style={{ display: "block", color: COLORS.red, fontSize: 10, animation: "cslRankUp .4s ease-out" }}>▼{Math.abs(rankMove)}</span>}</div>
              <div style={{ minWidth: 0 }}><div style={{ fontWeight: 800, fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isPodium ? laneColor : COLORS.ink }}>{label}</div><div style={{ fontSize: 11, color: COLORS.muted }}>{sub}</div></div>
              <div className="csl-race-track" style={{ height: 24, background: "#00000055", borderRadius: 5, overflow: "visible", position: "relative", borderRight: "4px dashed #FFFFFF55" }}><div style={{ width: `${Math.max(4, (score / maxScore) * 100)}%`, height: "100%", background: isWinner ? `repeating-linear-gradient(135deg, ${laneColor} 0 10px, #FFE37A 10px 20px)` : `linear-gradient(90deg, ${laneColor}, ${laneColors[(i + 3) % laneColors.length]})`, backgroundSize: isWinner ? "28px 28px" : "auto", animation: isWinner ? "cslRaceShimmer .8s linear infinite" : `cslLaneBob ${1.1 + (i % 4) * .25}s ease-in-out infinite`, transition: "width .7s ease-out", position: "relative" }}><Zap size={16} fill={laneColor} color="#14171A" style={{ position: "absolute", right: -8, top: 4, filter: `drop-shadow(0 0 4px ${laneColor})` }} /></div><span style={{ position: "absolute", right: 4, top: 29, fontSize: 9, color: COLORS.muted }}>{gap === 0 ? "AT THE FINISH" : `${gap} behind`}</span></div>
              {rowMedia && isSpotlight && <div className="csl-race-media"><MediaSlot label="Now celebrating" url={rowMedia} /></div>}
              <div style={{ textAlign: "right", fontWeight: 900, fontSize: 19, color: laneColor }}>{score}<span style={{ display: "block", fontSize: 10, color: COLORS.muted, fontWeight: 600 }}>PTS</span></div>
            </div>
          );
        })}
        {tab === "individual" && players.length === 0 && <p style={{ color: COLORS.muted, textAlign: "center" }}>No scores yet.</p>}
      </div>
      </div>
    </div>
  );
}

function WinnerDisplay({ players, teamScores = [] }) {
  const [gold, silver, bronze] = players;
  const bestTeam = teamScores.find((t) => t.count > 0);
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
      <style>{`@keyframes cslWinnerPulse { 0%,100% { transform: scale(1); filter: drop-shadow(0 0 0 #FFC62900); } 50% { transform: scale(1.08); filter: drop-shadow(0 0 18px #FFC62999); } }`}</style>
      <Crown size={54} color={COLORS.yellow} />
      <div style={{ fontSize: 16, letterSpacing: 2, color: COLORS.muted }}>SAFETY CHAMPION</div>
      {gold && <div style={{ fontSize: 44, fontWeight: 900, color: COLORS.yellow, animation: "cslWinnerPulse 1.7s ease-in-out infinite" }}>{gold.name}</div>}
      {gold && <div style={{ fontSize: 20, color: COLORS.muted }}>{gold.score || 0} points</div>}
      <div style={{ display: "flex", gap: 20, marginTop: 24 }}>
        {silver && <PodiumCard label="2nd" p={silver} color="#C7CCD1" />}
        {bronze && <PodiumCard label="3rd" p={bronze} color="#D08A54" />}
      </div>
      {bestTeam && (
        <div style={{ marginTop: 20, textAlign: "center" }}>
          <div style={{ fontSize: 13, letterSpacing: 2, color: COLORS.muted, marginBottom: 6 }}>BEST TEAM</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: COLORS.green }}>{bestTeam.name}</div>
          <div style={{ fontSize: 14, color: COLORS.muted }}>{bestTeam.score} points</div>
        </div>
      )}
    </div>
  );
}
function PodiumCard({ label, p, color }) {
  return (
    <div style={{ background: `${color}18`, border: `1px solid ${color}`, borderRadius: 10, padding: "16px 22px", textAlign: "center", minWidth: 120 }}>
      <div style={{ fontSize: 12, color, fontWeight: 800, marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{p.name}</div>
      <div style={{ fontSize: 13, color: COLORS.muted }}>{p.score || 0} pts</div>
    </div>
  );
}

/* ------------------------------ small pieces ------------------------------ */

function AddTeamForm({ onAdd }) {
  const [name, setName] = useState("");
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <input style={{ ...inputStyle, marginBottom: 0 }} placeholder="New team name" value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) { onAdd(name.trim()); setName(""); } }} />
      <button style={{ ...btnStyle(COLORS.green), width: "auto", padding: "10px 16px", marginTop: 0 }}
        onClick={() => { if (name.trim()) { onAdd(name.trim()); setName(""); } }}>Add</button>
    </div>
  );
}

function TopBar({ title, onExit, connected, onLock }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
      <div>
        <div style={{ fontSize: 12, color: COLORS.muted }}>CONSTRUCTION SAFETY LEAGUE</div>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>{title}</h1>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <ConnBadge connected={connected} />
        {onLock && (
          <button
            title="Lock admin on this device (you'll need the PIN again next time)"
            onClick={onLock}
            style={{ ...linkBtnStyle, margin: 0, display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}
          >
            <Lock size={13} /> Lock
          </button>
        )}
        <button style={linkBtnStyle} onClick={onExit}>Exit</button>
      </div>
    </div>
  );
}

function Panel({ title, icon, right, children }) {
  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 18, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: 15 }}>{icon}{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Centered({ children }) {
  return <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 10 }}>{children}</div>;
}

const StatCell = React.memo(function StatCell({ label, value, big }) {
  return (
    <div style={{ background: COLORS.surfaceRaised, borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
      <div style={{ fontSize: big ? 22 : 18, fontWeight: 900, color: COLORS.yellow }}>{value}</div>
      <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>{label}</div>
    </div>
  );
});

const AdminPlayerRow = React.memo(function AdminPlayerRow({ rank, player, teams, editing, editForm, setEditForm, onStartEdit, onCancelEdit, onSaveEdit, kickConfirming, onKick }) {
  if (editing) {
    return (
      <div style={{ background: COLORS.surfaceRaised, border: `1px solid ${COLORS.yellow}`, borderRadius: 8, padding: 10, marginBottom: 6 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            style={{ ...inputStyle, marginBottom: 0 }}
            placeholder="Name"
            value={editForm.name}
            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
          />
          <input
            style={{ ...inputStyle, width: 100, marginBottom: 0 }}
            type="number"
            placeholder="Score"
            value={editForm.score}
            onChange={(e) => setEditForm({ ...editForm, score: e.target.value })}
          />
        </div>
        {teams.length > 0 && (
          <select
            style={{ ...inputStyle, marginBottom: 8 }}
            value={editForm.team}
            onChange={(e) => setEditForm({ ...editForm, team: e.target.value })}
          >
            <option value="">No team</option>
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...btnStyle(COLORS.green), width: "auto", padding: "8px 14px", margin: 0, display: "flex", alignItems: "center", gap: 6 }} onClick={onSaveEdit}>
            <Save size={14} /> Save
          </button>
          <button style={{ ...btnStyle(COLORS.surfaceRaised, COLORS.ink), width: "auto", padding: "8px 14px", margin: 0 }} onClick={onCancelEdit}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 8, marginBottom: 4 }}>
      <div style={{ width: 22, fontWeight: 800, color: rank === 1 ? COLORS.yellow : COLORS.muted, fontSize: 14 }}>{rank}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{player.name}</div>
        {(player.team || player.company) && <div style={{ fontSize: 11, color: COLORS.muted }}>{player.team || player.company}</div>}
      </div>
      <div style={{ fontWeight: 800, color: COLORS.yellow, fontSize: 14, minWidth: 40, textAlign: "right" }}>{player.score || 0}</div>
      <button
        title="Edit player"
        onClick={onStartEdit}
        style={{ background: "none", border: `1px solid ${COLORS.line}`, borderRadius: 6, color: COLORS.muted, cursor: "pointer", padding: 6, display: "flex" }}
      >
        <Pencil size={13} />
      </button>
      <button
        title={kickConfirming ? "Tap again to confirm" : "Kick player"}
        onClick={onKick}
        style={{
          background: kickConfirming ? COLORS.red : "none",
          border: `1px solid ${COLORS.red}`, borderRadius: 6,
          color: kickConfirming ? "#fff" : COLORS.red, cursor: "pointer",
          padding: "6px 8px", display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700,
        }}
      >
        {kickConfirming ? <AlertTriangle size={13} /> : <UserMinus size={13} />}
        {kickConfirming ? "Confirm?" : ""}
      </button>
    </div>
  );
});

const LeaderRow = React.memo(function LeaderRow({ rank, name, sub, score, highlight }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", background: highlight ? COLORS.yellow + "1f" : "transparent", borderRadius: 8, marginBottom: 4 }}>
      <div style={{ width: 22, fontWeight: 800, color: rank === 1 ? COLORS.yellow : COLORS.muted, fontSize: 14 }}>{rank}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{name}</div>
        {sub && <div style={{ fontSize: 11, color: COLORS.muted }}>{sub}</div>}
      </div>
      <div style={{ fontWeight: 800, color: COLORS.yellow, fontSize: 14 }}>{score}</div>
    </div>
  );
});

function StatusPill({ status }) {
  const map = {
    lobby: [COLORS.muted, "LOBBY"], question: [COLORS.green, "LIVE"], reveal: [COLORS.yellow, "REVEALED"],
    leaderboard: [COLORS.orange, "LEADERBOARD"], ended: [COLORS.red, "ENDED"],
  };
  const [c, label] = map[status] || [COLORS.muted, status];
  return <span style={{ fontSize: 11, fontWeight: 800, color: c, border: `1px solid ${c}`, borderRadius: 20, padding: "3px 10px" }}>{label}</span>;
}

const ActionBtn = React.memo(function ActionBtn({ icon, label, color, dark, onClick, disabled }) {
  return (
    <button disabled={disabled} onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 8, border: "none",
      background: color, color: dark ? "#14171A" : color === COLORS.surfaceRaised ? COLORS.ink : "#14171A",
      fontWeight: 700, fontSize: 13, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1,
    }}>
      {icon}{label}
    </button>
  );
});

const inputStyle = {
  width: "100%", padding: "12px 14px", marginBottom: 10, borderRadius: 8,
  border: `1px solid ${COLORS.line}`, background: COLORS.surfaceRaised, color: COLORS.ink, fontSize: 15, outline: "none",
  boxSizing: "border-box",
};
function btnStyle(bg, fg = "#14171A") {
  return { width: "100%", padding: "13px 14px", borderRadius: 8, border: "none", background: bg, color: fg, fontWeight: 800, fontSize: 15, cursor: "pointer", marginTop: 4 };
}
const linkBtnStyle = { background: "none", border: "none", color: COLORS.muted, fontSize: 13, cursor: "pointer", marginTop: 12, textDecoration: "underline" };