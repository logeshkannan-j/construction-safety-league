/* ------------------------------------------------------------------ *
 *  LANGUAGE — one setting, read by everything
 *
 *  The event is run for crews who read Tamil more comfortably than
 *  English, so the questions, the boards and the signs all have to be
 *  available in both. This is the single place that remembers which
 *  one the player chose.
 *
 *  Content is stored ENGLISH-FIRST with a parallel `ta` block:
 *
 *      { title: "...", question: "...", options: [...],
 *        ta: { title: "...", question: "...", options: [...] } }
 *
 *  That shape is additive — anything without a `ta` block simply shows
 *  the English, so a half-translated file is never a broken file, and
 *  a reviewer can read the English version of any item without
 *  hunting through a parallel structure.
 *
 *  TRANSLATION NOTE
 *  ----------------
 *  The Tamil is written to be understood by site crews rather than as
 *  a word-for-word rendering, and terms that are used in English on
 *  Indian sites (helmet, crane, lift, isolator, muster point) are
 *  deliberately left in English. It has NOT been checked by a native
 *  speaker — have someone read it before the event.
 * ------------------------------------------------------------------ */

export const LANGS = [
  { id: "en", label: "English", short: "EN" },
  { id: "ta", label: "தமிழ்", short: "தமி" },
];

export const DEFAULT_LANG = "en";
const STORAGE_KEY = "csl:lang:v1";

let current = DEFAULT_LANG;
const listeners = new Set();

// Remembered per device, so a player who switches once does not have
// to switch again in the next mission.
try {
  const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
  if (saved && LANGS.some((l) => l.id === saved)) current = saved;
} catch { /* private mode, or no storage at all */ }

export function getLang() {
  return current;
}

export function setLang(id) {
  const next = LANGS.some((l) => l.id === id) ? id : DEFAULT_LANG;
  if (next === current) return current;
  current = next;
  try { globalThis.localStorage?.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  listeners.forEach((fn) => { try { fn(next); } catch { /* a listener must not break the rest */ } });
  return current;
}

/** Subscribe to changes. Returns an unsubscribe function. */
export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function otherLang(id = current) {
  return id === "ta" ? "en" : "ta";
}

/**
 * One field of a bilingual record, in the given language.
 *
 * Falls back to English whenever the translation is missing, so a
 * partly translated file still reads.
 */
export function t(record, field, lang = current) {
  if (!record) return "";
  if (lang !== "en") {
    const alt = record[lang];
    if (alt && alt[field] !== undefined && alt[field] !== null && alt[field] !== "") {
      return alt[field];
    }
  }
  return record[field] ?? "";
}

/**
 * The option labels of a bilingual record.
 *
 * Falls back per-list rather than per-item: a half-translated option
 * list would put two languages in one question, which is worse than
 * showing it in English.
 */
export function tOptions(record, lang = current, field = "options") {
  const base = record?.[field] || [];
  if (lang !== "en") {
    const alt = record?.[lang]?.[field];
    if (Array.isArray(alt) && alt.length === base.length) return alt;
  }
  return base;
}

/**
 * Both languages at once, for a sign or a board.
 *
 * Signage on a real multilingual site shows both, because the person
 * who needs it is not going to tap a toggle first.
 */
export function tBoth(record, field) {
  const en = t(record, field, "en");
  const ta = t(record, field, "ta");
  return ta && ta !== en ? [en, ta] : [en];
}
