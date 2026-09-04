// Keep these in sync with storage.js — it maps each of these exact keys
// to a specific Firebase Realtime Database path.
export const GAME_KEY = "csl:game:v1";
export const Q_KEY = "csl:questions:v1";
export const PLAYER_PREFIX = "csl:player:v1:";
export const MY_ID_KEY = "csl:myplayerid";

// How often each connected device re-fetches shared state, in ms.
// Lower = snappier, but more Firebase reads. 1400ms is plenty for a quiz.
export const POLL_MS = 1400;
