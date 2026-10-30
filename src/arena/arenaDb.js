/* ------------------------------------------------------------------ *
 *  3D SAFETY GAMING ARENA — Realtime Database layer
 *
 *  Reuses the EXISTING Firebase project (the same app instance the quiz
 *  created in storage.js). It never touches the quiz's `game`,
 *  `questions` or `players` paths — everything the Arena owns lives
 *  under a single `arena/` root:
 *
 *    arena/profiles/{playerId}   persistent per-player Arena profile
 *    arena/runs/{playerId}/{id}  immutable record of one finished run
 *    arena/feed/{runId}          small flat copy of every run, so the
 *                                daily / weekly leaderboards and the
 *                                admin reports need exactly one read
 *    arena/config/games/{gameId} admin on/off switch + settings
 *
 *  Writes are shaped so the security rules in rules.json can validate
 *  them server-side (see SECURITY.md).
 * ------------------------------------------------------------------ */

import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getDatabase, ref, get, set, update, push, query,
  orderByChild, limitToLast, runTransaction,
} from "firebase/database";
// Explicit extensions so these modules also load under plain Node
// (used by the logic test harness), not only through Vite's resolver.
import { firebaseConfig } from "../firebaseConfig.js";
import { getServerTimeOffset } from "../storage.js";
import { ACHIEVEMENTS, GAME_IDS, getGame } from "./arenaConstants.js";

// Reuse the app the quiz already initialised instead of creating a
// second one. getApps() is empty only if the Arena is somehow loaded
// before storage.js, which the guard below handles safely.
function app() {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

let _db = null;
function db() {
  if (!_db) _db = getDatabase(app());
  return _db;
}

const ARENA = "arena";
const FEED_READ_LIMIT = 2000;

/* --------------------------- server clock --------------------------- */

// The security rules reject a run whose createdAt is wildly out of step
// with the server's clock — which is the right check, but it would also
// reject an honest player whose phone clock is simply wrong. So every
// timestamp the Arena writes is corrected by Firebase's published
// server-time offset, exactly as the quiz already does for its question
// timers (see getServerTimeOffset in storage.js).
let clockOffset = 0;
let clockSyncedAt = 0;

async function serverNow() {
  if (Date.now() - clockSyncedAt > 60000) {
    try {
      clockOffset = await getServerTimeOffset();
      clockSyncedAt = Date.now();
    } catch {
      clockOffset = 0;
    }
  }
  return Date.now() + clockOffset;
}

/* ----------------------------- profiles ----------------------------- */

export function emptyProfile(playerId, name) {
  return {
    id: playerId,
    name: name || "Player",
    team: null,
    company: null,
    totalScore: 0,
    runCount: 0,
    gamesCompleted: 0,
    bestScores: {},
    achievements: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastPlayedAt: 0,
  };
}

export async function fetchProfile(playerId) {
  if (!playerId) return null;
  try {
    const snap = await get(ref(db(), `${ARENA}/profiles/${playerId}`));
    return snap.exists() ? snap.val() : null;
  } catch (e) {
    console.error("[arena] fetchProfile failed", e);
    return null;
  }
}

export async function fetchAllProfiles() {
  try {
    const snap = await get(ref(db(), `${ARENA}/profiles`));
    if (!snap.exists()) return [];
    return Object.values(snap.val()).filter((p) => p && p.id);
  } catch (e) {
    console.error("[arena] fetchAllProfiles failed", e);
    return [];
  }
}

// Creates the profile on first visit, or refreshes the display name if
// the player has since joined a quiz under a different name. Never
// overwrites score data.
export async function ensureProfile(playerId, { name, team, company } = {}) {
  if (!playerId) return null;
  const path = `${ARENA}/profiles/${playerId}`;
  try {
    const result = await runTransaction(ref(db(), path), (current) => {
      if (!current) {
        return { ...emptyProfile(playerId, name), team: team || null, company: company || null };
      }
      const next = { ...current };
      if (name && name !== current.name) next.name = name;
      if (team !== undefined && team !== current.team) next.team = team || null;
      if (company !== undefined && company !== current.company) next.company = company || null;
      next.updatedAt = Date.now();
      return next;
    });
    return result.snapshot.val();
  } catch (e) {
    console.error("[arena] ensureProfile failed", e);
    return null;
  }
}

/* ------------------------------- runs ------------------------------- */

/**
 * Submits one finished run.
 *
 * Duplicate-proof by construction: the caller generates `runId` ONCE
 * when the run ends and the write is a `set` to a path that must not
 * already exist, so a double tap on "Submit", a retry after a flaky
 * network, or a React re-render can never award points twice.
 *
 * Returns { ok, runId, profile, newAchievements, reason }.
 */
export async function submitRun(playerId, run) {
  if (!playerId || !run || !run.runId) {
    return { ok: false, reason: "invalid-run" };
  }
  const game = getGame(run.gameId);
  if (!game) return { ok: false, reason: "unknown-game" };

  // Client-side sanity clamp. The authoritative version of this check
  // lives in rules.json so a tampered client cannot bypass it.
  const score = Math.max(0, Math.min(Math.round(Number(run.score) || 0), game.maxScore));
  const stampedAt = await serverNow();
  const record = {
    runId: String(run.runId),
    playerId,
    playerName: String(run.playerName || "Player").slice(0, 40),
    gameId: run.gameId,
    gameName: game.title,
    difficulty: String(run.difficulty || "normal"),
    score,
    completed: !!run.completed,
    accuracy: Math.max(0, Math.min(100, Math.round(Number(run.accuracy) || 0))),
    timeTakenMs: Math.max(0, Math.round(Number(run.timeTakenMs) || 0)),
    rating: String(run.rating || ""),
    stats: sanitizeStats(run.stats),
    createdAt: stampedAt,
  };

  const runPath = `${ARENA}/runs/${playerId}/${record.runId}`;
  try {
    const existing = await get(ref(db(), runPath));
    if (existing.exists()) {
      // Already banked — hand back the profile unchanged.
      const profile = await fetchProfile(playerId);
      return { ok: true, runId: record.runId, profile, newAchievements: [], duplicate: true };
    }
    await set(ref(db(), runPath), record);
  } catch (e) {
    console.error("[arena] run write failed", e);
    // A PERMISSION_DENIED here almost always means rules.json has not
    // been published to the Realtime Database yet, so say so rather than
    // leaving the player staring at a generic failure.
    const denied = String(e?.code || e?.message || "").toUpperCase().includes("PERMISSION");
    return {
      ok: false,
      reason: denied ? "permission-denied" : "write-failed",
      message: denied
        ? "The database rejected the write. Publish rules.json in the Firebase console (Realtime Database → Rules)."
        : "The score could not be written. Check your connection.",
    };
  }

  // Flat feed copy for leaderboards + admin reports (small on purpose).
  try {
    await set(ref(db(), `${ARENA}/feed/${record.runId}`), {
      runId: record.runId,
      playerId,
      playerName: record.playerName,
      gameId: record.gameId,
      difficulty: record.difficulty,
      score: record.score,
      completed: record.completed,
      accuracy: record.accuracy,
      timeTakenMs: record.timeTakenMs,
      createdAt: record.createdAt,
    });
  } catch (e) {
    // Non-fatal: the run itself is banked, only the feed copy failed.
    console.error("[arena] feed write failed", e);
  }

  const { profile, newAchievements } = await applyRunToProfile(playerId, record);
  return { ok: true, runId: record.runId, profile, newAchievements };
}

function sanitizeStats(stats) {
  if (!stats || typeof stats !== "object") return {};
  const out = {};
  Object.entries(stats).forEach(([k, v]) => {
    if (!/^[A-Za-z0-9_]{1,32}$/.test(k)) return;
    if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.round(v * 100) / 100;
    else if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") out[k] = v.slice(0, 80);
  });
  return out;
}

// Folds a finished run into the player's persistent profile inside one
// transaction, so two devices finishing at once cannot clobber each
// other's totals.
async function applyRunToProfile(playerId, record) {
  const path = `${ARENA}/profiles/${playerId}`;
  let newAchievements = [];
  try {
    const result = await runTransaction(ref(db(), path), (current) => {
      const base = current || emptyProfile(playerId, record.playerName);
      const bestScores = { ...(base.bestScores || {}) };
      const previousBest = Number(bestScores[record.gameId]) || 0;
      if (record.score > previousBest) bestScores[record.gameId] = record.score;

      const next = {
        ...base,
        id: playerId,
        name: record.playerName || base.name,
        bestScores,
        // totalScore is the sum of PERSONAL BESTS, not of every run, so
        // grinding the same easy game cannot inflate a ranking.
        totalScore: GAME_IDS.reduce((sum, id) => sum + (Number(bestScores[id]) || 0), 0),
        runCount: (Number(base.runCount) || 0) + 1,
        gamesCompleted: GAME_IDS.filter((id) => (Number(bestScores[id]) || 0) > 0).length,
        lastPlayedAt: record.createdAt,
        updatedAt: record.createdAt,
      };

      const earned = { ...(base.achievements || {}) };
      newAchievements = [];
      ACHIEVEMENTS.forEach((a) => {
        if (earned[a.id]) return;
        let pass = false;
        try { pass = !!a.test({ profile: next, run: record }); } catch { pass = false; }
        if (pass) {
          earned[a.id] = record.createdAt;
          newAchievements.push(a);
        }
      });
      next.achievements = earned;
      return next;
    });
    return { profile: result.snapshot.val(), newAchievements };
  } catch (e) {
    console.error("[arena] applyRunToProfile failed", e);
    return { profile: null, newAchievements: [] };
  }
}

export async function fetchPlayerRuns(playerId, limit = 50) {
  if (!playerId) return [];
  try {
    const snap = await get(query(ref(db(), `${ARENA}/runs/${playerId}`), orderByChild("createdAt"), limitToLast(limit)));
    if (!snap.exists()) return [];
    return Object.values(snap.val()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch (e) {
    console.error("[arena] fetchPlayerRuns failed", e);
    return [];
  }
}

/* ---------------------------- leaderboards ---------------------------- */

export async function fetchFeed(limit = FEED_READ_LIMIT) {
  try {
    const snap = await get(query(ref(db(), `${ARENA}/feed`), orderByChild("createdAt"), limitToLast(limit)));
    if (!snap.exists()) return [];
    return Object.values(snap.val()).filter(Boolean);
  } catch (e) {
    console.error("[arena] fetchFeed failed", e);
    return [];
  }
}

export const PERIODS = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  alltime: Infinity,
};

/**
 * Builds a leaderboard entirely from already-fetched data, so switching
 * tabs costs zero reads.
 *
 * period: 'daily' | 'weekly' | 'alltime'
 * gameId: a specific game id, or 'overall'
 */
export function buildLeaderboard({ profiles = [], feed = [], period = "alltime", gameId = "overall" }) {
  const window = PERIODS[period] ?? Infinity;

  // All-time overall can be read straight off the profile aggregates.
  if (period === "alltime" && gameId === "overall") {
    return profiles
      .map((p) => ({
        playerId: p.id,
        name: p.name || "Player",
        team: p.team || null,
        score: Number(p.totalScore) || 0,
        best: Math.max(0, ...Object.values(p.bestScores || { x: 0 }).map(Number)),
        gamesCompleted: Number(p.gamesCompleted) || 0,
        runs: Number(p.runCount) || 0,
        avg: p.runCount ? Math.round((Number(p.totalScore) || 0) / p.runCount) : 0,
      }))
      .filter((r) => r.runs > 0)
      .sort((a, b) => b.score - a.score || b.gamesCompleted - a.gamesCompleted)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }

  if (period === "alltime" && gameId !== "overall") {
    return profiles
      .map((p) => ({
        playerId: p.id,
        name: p.name || "Player",
        team: p.team || null,
        score: Number((p.bestScores || {})[gameId]) || 0,
        best: Number((p.bestScores || {})[gameId]) || 0,
        gamesCompleted: Number(p.gamesCompleted) || 0,
        runs: Number(p.runCount) || 0,
        avg: 0,
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }

  // Time-boxed boards are aggregated from the run feed.
  const cutoff = Date.now() - window;
  const rows = new Map();
  feed.forEach((f) => {
    if (!f || (f.createdAt || 0) < cutoff) return;
    if (gameId !== "overall" && f.gameId !== gameId) return;
    const key = f.playerId;
    if (!key) return;
    const row = rows.get(key) || {
      playerId: key, name: f.playerName || "Player", team: null,
      score: 0, best: 0, gamesCompleted: 0, runs: 0, games: new Set(), total: 0,
    };
    row.name = f.playerName || row.name;
    row.runs += 1;
    row.total += Number(f.score) || 0;
    row.best = Math.max(row.best, Number(f.score) || 0);
    row.games.add(f.gameId);
    // A period board ranks on best-per-game within the window.
    row.bestPerGame = row.bestPerGame || {};
    const g = f.gameId;
    row.bestPerGame[g] = Math.max(Number(row.bestPerGame[g]) || 0, Number(f.score) || 0);
    rows.set(key, row);
  });

  return [...rows.values()]
    .map((r) => ({
      playerId: r.playerId,
      name: r.name,
      team: r.team,
      score: Object.values(r.bestPerGame || {}).reduce((a, b) => a + b, 0),
      best: r.best,
      gamesCompleted: r.games.size,
      runs: r.runs,
      avg: r.runs ? Math.round(r.total / r.runs) : 0,
    }))
    .sort((a, b) => b.score - a.score || b.gamesCompleted - a.gamesCompleted)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/* ------------------------------- config ------------------------------- */

export function defaultArenaConfig() {
  const games = {};
  GAME_IDS.forEach((id) => { games[id] = { enabled: true }; });
  return { games, updatedAt: Date.now() };
}

export async function fetchArenaConfig() {
  try {
    const snap = await get(ref(db(), `${ARENA}/config`));
    if (!snap.exists()) return defaultArenaConfig();
    const value = snap.val() || {};
    const base = defaultArenaConfig();
    return {
      ...base,
      ...value,
      games: { ...base.games, ...(value.games || {}) },
    };
  } catch (e) {
    console.error("[arena] fetchArenaConfig failed", e);
    return defaultArenaConfig();
  }
}

export async function setGameEnabled(gameId, enabled) {
  if (!GAME_IDS.includes(gameId)) return false;
  try {
    await update(ref(db(), `${ARENA}/config/games/${gameId}`), { enabled: !!enabled });
    await update(ref(db(), `${ARENA}/config`), { updatedAt: Date.now() });
    return true;
  } catch (e) {
    console.error("[arena] setGameEnabled failed", e);
    return false;
  }
}

/* ------------------------- admin: integrity ------------------------- */

/**
 * Flags runs that a real player could not plausibly have produced.
 * Pure function over the feed so the admin panel can show it without
 * extra reads.
 */
export function findSuspiciousRuns(feed = []) {
  const flagged = [];
  const byPlayer = new Map();
  feed.forEach((f) => {
    if (!f) return;
    const list = byPlayer.get(f.playerId) || [];
    list.push(f);
    byPlayer.set(f.playerId, list);
  });

  feed.forEach((f) => {
    const game = getGame(f.gameId);
    const reasons = [];
    if (!game) reasons.push("Unknown game id");
    else if ((f.score || 0) > game.maxScore) reasons.push(`Score ${f.score} exceeds the ${game.maxScore} ceiling`);
    // Nobody finishes a 3D mission in under 20 seconds.
    if ((f.score || 0) > 500 && (f.timeTakenMs || 0) < 20000) reasons.push("High score in an impossibly short time");
    if ((f.accuracy || 0) > 100) reasons.push("Accuracy above 100%");
    if (reasons.length) flagged.push({ ...f, reasons });
  });

  // Burst detection: more than 8 submissions inside two minutes.
  byPlayer.forEach((runs, playerId) => {
    const sorted = [...runs].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    for (let i = 0; i + 8 < sorted.length; i++) {
      if ((sorted[i + 8].createdAt || 0) - (sorted[i].createdAt || 0) < 120000) {
        if (!flagged.some((x) => x.playerId === playerId && x.reasons?.includes("Submission burst"))) {
          flagged.push({ ...sorted[i + 8], reasons: ["Submission burst"] });
        }
        break;
      }
    }
  });

  return flagged.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
