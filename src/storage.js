import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, set, remove, onValue } from "firebase/database";
// Explicit extensions so this module also resolves under plain Node,
// which the Arena's logic test harness runs under.
import { firebaseConfig } from "./firebaseConfig.js";
import { GAME_KEY, Q_KEY, PLAYER_PREFIX } from "./constants.js";

// This module gives App.jsx the exact same safeGet/safeSet/safeDelete/safeList
// signatures the Claude-artifact version used against window.storage, so the
// rest of the app didn't need to change. `shared` decides where data goes:
//   shared = true  -> Firebase Realtime Database (visible to every device)
//   shared = false  -> this browser's localStorage (private to this device,
//                       used only to remember "which player am I")

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

/* ----------------------- database health ----------------------- *
 *
 * Every helper below catches its own errors and returns null, which is
 * what keeps the UI from crashing when the network drops. The cost is
 * that a database which is REFUSING us looks exactly like a database
 * with no data in it — the admin panel just says "No active game".
 *
 * That is how an expired set of Firebase rules presents: everything is
 * silently empty and nothing explains why. So the last failure is
 * recorded here and surfaced in the UI.
 * ---------------------------------------------------------------- */

let lastError = null;

function noteFailure(operation, key, error) {
  const message = String(error?.message || error || "");
  const denied = /permission[_ ]denied/i.test(message) || error?.code === "PERMISSION_DENIED";
  lastError = {
    operation,
    key,
    denied,
    message,
    at: Date.now(),
  };
  console.error(`${operation} failed`, key, error);
}

function noteSuccess() {
  lastError = null;
}

/**
 * The last shared-storage failure, or null if the most recent shared
 * operation succeeded. `denied` is true when the database rules rejected
 * us, which is a configuration problem rather than a connectivity one.
 */
export function getDbError() {
  return lastError;
}

// The app only ever uses three shared keys/prefixes, so we map them to fixed,
// human-readable Firebase paths instead of trying to support arbitrary keys.
function keyToPath(key) {
  if (key === GAME_KEY) return "game";
  if (key === Q_KEY) return "questions";
  if (key.startsWith(PLAYER_PREFIX)) return "players/" + key.slice(PLAYER_PREFIX.length);
  // Fallback for any future key: sanitize characters Firebase paths disallow.
  return "misc/" + key.replace(/[.#$\[\]/]/g, "_");
}

export async function safeGet(key, shared) {
  if (!shared) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  try {
    const snap = await get(ref(db, keyToPath(key)));
    noteSuccess();
    return snap.exists() ? snap.val() : null;
  } catch (e) {
    noteFailure("safeGet", key, e);
    return null;
  }
}

export async function safeSet(key, value, shared) {
  if (!shared) {
    try { localStorage.setItem(key, value); return { key, value, shared }; } catch { return null; }
  }
  try {
    await set(ref(db, keyToPath(key)), value);
    noteSuccess();
    return { key, value, shared };
  } catch (e) {
    noteFailure("safeSet", key, e);
    return null;
  }
}

export async function safeDelete(key, shared) {
  if (!shared) {
    try { localStorage.removeItem(key); return { key, deleted: true, shared }; } catch { return null; }
  }
  try {
    await remove(ref(db, keyToPath(key)));
    noteSuccess();
    return { key, deleted: true, shared };
  } catch (e) {
    noteFailure("safeDelete", key, e);
    return null;
  }
}

export async function safeList(prefix, shared) {
  if (!shared) {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) keys.push(k);
      }
      return keys;
    } catch {
      return [];
    }
  }
  // The only prefix this app ever lists is PLAYER_PREFIX.
  if (prefix === PLAYER_PREFIX) {
    try {
      const snap = await get(ref(db, "players"));
      noteSuccess();
      if (!snap.exists()) return [];
      return Object.keys(snap.val()).map((id) => PLAYER_PREFIX + id);
    } catch (e) {
      noteFailure("safeList", prefix, e);
      return [];
    }
  }
  return [];
}

// Firebase publishes the difference between its server clock and this
// browser's clock at .info/serverTimeOffset. Use it for synchronized game
// timing so phones with incorrect device clocks still see the same countdown.
//
// `.info/*` is a client-local namespace, NOT a stored path: get() rejects it
// with "Invalid token in path", so this used to fail every single call and
// silently return 0 from the catch. onValue is the supported way to read it.
// The value is cached because it never meaningfully changes within a session.
let _offset = null;
let _offsetPending = null;

export function getServerTimeOffset() {
  if (_offset !== null) return Promise.resolve(_offset);
  if (_offsetPending) return _offsetPending;

  _offsetPending = new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      _offset = value;
      _offsetPending = null;
      try { unsubscribe(); } catch { /* already gone */ }
      resolve(value);
    };
    // Never let a slow or blocked connection hold up a caller: an offset of
    // 0 (trust this device's clock) is the correct fallback.
    const timer = setTimeout(() => finish(0), 5000);
    let unsubscribe = () => {};
    try {
      unsubscribe = onValue(
        ref(db, ".info/serverTimeOffset"),
        (snap) => { clearTimeout(timer); finish(Number(snap.val()) || 0); },
        (e) => { clearTimeout(timer); console.error("getServerTimeOffset failed", e); finish(0); }
      );
    } catch (e) {
      clearTimeout(timer);
      console.error("getServerTimeOffset failed", e);
      finish(0);
    }
  });

  return _offsetPending;
}
