/* ------------------------------------------------------------------ *
 *  3D SAFETY GAMING ARENA — player identity
 *
 *  The existing site has NO Firebase Authentication: a player is
 *  identified by a uuid in this browser's localStorage under
 *  `csl:myplayerid` (see constants.js / App.jsx join()), and their
 *  record lives at `players/{id}` in the Realtime Database.
 *
 *  The Arena deliberately reuses that identity instead of inventing a
 *  second one:
 *
 *   - If this browser has already joined a quiz, the Arena adopts that
 *     exact player id, so the person is ONE player in both systems.
 *   - If not, the Arena mints an id and stores it under its own key.
 *     That key is never overwritten afterwards, so a player who later
 *     joins a quiz keeps their Arena ranking and history. Their name
 *     and team are then adopted from the quiz record.
 *
 *  Nothing here writes to `csl:myplayerid` or to `players/{id}`, so the
 *  quiz's own join flow is completely unaffected.
 * ------------------------------------------------------------------ */

import { MY_ID_KEY, PLAYER_PREFIX } from "../constants.js";
import { safeGet } from "../storage.js";
import { ARENA_NAME_KEY, ARENA_SETTINGS_KEY } from "./arenaConstants.js";

const ARENA_PID_KEY = "csl:arena:pid:v1";

function genId() {
  try { return crypto.randomUUID(); } catch {
    return "arena-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

function localGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function localSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode */ }
}

/**
 * Resolves (and persists) the stable Arena player id for this browser.
 * Safe to call repeatedly — it always returns the same id.
 */
export function resolvePlayerId() {
  const existing = localGet(ARENA_PID_KEY);
  if (existing) return existing;

  // Prefer the quiz identity if this device has already joined a game.
  const quizId = localGet(MY_ID_KEY);
  const id = quizId || genId();
  localSet(ARENA_PID_KEY, id);
  return id;
}

export function getSavedName() {
  return localGet(ARENA_NAME_KEY) || "";
}

export function saveName(name) {
  const clean = String(name || "").trim().slice(0, 32);
  if (clean) localSet(ARENA_NAME_KEY, clean);
  return clean;
}

/**
 * Looks up the player's quiz record (if any) so the Arena can show the
 * same name and team the TV leaderboard shows, instead of asking for a
 * name the player has already given.
 *
 * Returns { name, team, company } or null.
 */
export async function fetchQuizIdentity() {
  const quizId = localGet(MY_ID_KEY);
  if (!quizId) return null;
  try {
    const raw = await safeGet(PLAYER_PREFIX + quizId, true);
    if (!raw) return null;
    const player = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!player || !player.name) return null;
    return {
      name: String(player.name).slice(0, 32),
      team: player.team || null,
      company: player.company || null,
    };
  } catch {
    return null;
  }
}

/**
 * Best-known display identity for the Arena, in priority order:
 *   1. the name on this device's quiz record (most authoritative)
 *   2. a name the player typed into the Arena earlier
 *   3. nothing — the caller should ask
 */
export async function resolveIdentity() {
  const id = resolvePlayerId();
  const fromQuiz = await fetchQuizIdentity();
  if (fromQuiz) {
    // Keep the Arena's own copy in sync so the name survives offline.
    saveName(fromQuiz.name);
    return { id, ...fromQuiz, source: "quiz" };
  }
  const saved = getSavedName();
  if (saved) return { id, name: saved, team: null, company: null, source: "arena" };
  return { id, name: "", team: null, company: null, source: "none" };
}

/* ------------------------- arena local settings ------------------------- */

export const DEFAULT_SETTINGS = {
  quality: "auto",      // 'auto' | 'low' | 'medium' | 'high'
  sound: true,
  volume: 0.7,
  lookSensitivity: 1,
  invertY: false,
};

export function loadSettings() {
  try {
    const raw = localGet(ARENA_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try { localSet(ARENA_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  return settings;
}
