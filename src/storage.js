import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, set, remove } from "firebase/database";
import { firebaseConfig } from "./firebaseConfig";
import { GAME_KEY, Q_KEY, PLAYER_PREFIX } from "./constants";

// This module gives App.jsx the exact same safeGet/safeSet/safeDelete/safeList
// signatures the Claude-artifact version used against window.storage, so the
// rest of the app didn't need to change. `shared` decides where data goes:
//   shared = true  -> Firebase Realtime Database (visible to every device)
//   shared = false  -> this browser's localStorage (private to this device,
//                       used only to remember "which player am I")

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

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
    return snap.exists() ? snap.val() : null;
  } catch (e) {
    console.error("safeGet failed", key, e);
    return null;
  }
}

export async function safeSet(key, value, shared) {
  if (!shared) {
    try { localStorage.setItem(key, value); return { key, value, shared }; } catch { return null; }
  }
  try {
    await set(ref(db, keyToPath(key)), value);
    return { key, value, shared };
  } catch (e) {
    console.error("safeSet failed", key, e);
    return null;
  }
}

export async function safeDelete(key, shared) {
  if (!shared) {
    try { localStorage.removeItem(key); return { key, deleted: true, shared }; } catch { return null; }
  }
  try {
    await remove(ref(db, keyToPath(key)));
    return { key, deleted: true, shared };
  } catch (e) {
    console.error("safeDelete failed", key, e);
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
      if (!snap.exists()) return [];
      return Object.keys(snap.val()).map((id) => PLAYER_PREFIX + id);
    } catch (e) {
      console.error("safeList failed", prefix, e);
      return [];
    }
  }
  return [];
}

// Firebase publishes the difference between its server clock and this
// browser's clock at .info/serverTimeOffset. Use it for synchronized game
// timing so phones with incorrect device clocks still see the same countdown.
export async function getServerTimeOffset() {
  try {
    const snap = await get(ref(db, ".info/serverTimeOffset"));
    return Number(snap.val()) || 0;
  } catch (e) {
    console.error("getServerTimeOffset failed", e);
    return 0;
  }
}
