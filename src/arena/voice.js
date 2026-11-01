/* ------------------------------------------------------------------ *
 *  3D SAFETY GAMING ARENA — voices on site
 *
 *  What people shout when something goes wrong: "Help! Help!",
 *  "Emergency! Emergency!", "Fire! Fire!". Spoken by the device's own
 *  voice (Web Speech), so there is nothing to download, and like the
 *  rest of the sound it is made at runtime:
 *
 *    - louder the nearer the player is to whoever is shouting
 *    - one shout at a time, so a crowd does not talk over itself
 *    - in Tamil for a Tamil player when the device has a Tamil voice,
 *      otherwise in English, in an Indian English voice when there is one
 *    - silent when the game's sound is off, at the game's volume
 * ------------------------------------------------------------------ */

import { isSoundEnabled, getVolume } from "./audio.js";

export const SHOUTS = {
  help: { en: "Help! Help!", ta: "உதவி! உதவி!" },
  emergency: { en: "Emergency! Emergency!", ta: "அவசரம்! அவசரம்!" },
  fire: { en: "Fire! Fire!", ta: "தீ! தீ!" },
};

/**
 * @param lang     () => "en" | "ta", the player's language now
 * @param gap      the least time between two shouts, in ms
 * @param enabled  () => false silences this game's voices whatever the
 *                 shared sound setting says — the mission demos play a
 *                 game's world with its sound off
 */
export function createVoices({ lang = () => "en", gap = 2200, enabled = () => true } = {}) {
  const synth = typeof window !== "undefined" ? window.speechSynthesis || null : null;
  const Utterance = typeof window !== "undefined" ? window.SpeechSynthesisUtterance || null : null;
  let voices = [];
  let last = -Infinity;
  const load = () => { voices = synth?.getVoices?.() || []; };
  load();
  synth?.addEventListener?.("voiceschanged", load);
  const find = (test) => voices.find((v) => test(String(v.lang || "").toLowerCase()));

  return {
    /**
     * Somebody `distance` metres from the player shouts `kind`. Returns
     * the words said, or null when nothing was (no voice, sound off, or
     * somebody else is still shouting).
     */
    shout(kind, distance = 10, { now = Date.now(), pitch = 1.25 } = {}) {
      const phrase = SHOUTS[kind];
      // Volume 0 is silence too: iOS ignores an utterance's own volume.
      if (!phrase || !synth || !Utterance || !enabled() || !isSoundEnabled() || getVolume() <= 0) return null;
      if (now - last < gap) return null;
      const tamil = lang() === "ta" ? find((l) => l.startsWith("ta")) : null;
      const voice = tamil || find((l) => l === "en-in" || l === "en_in") || find((l) => l.startsWith("en"));
      const words = tamil ? phrase.ta : phrase.en;
      try {
        const u = new Utterance(words);
        u.lang = tamil ? "ta-IN" : "en-IN";
        if (voice) u.voice = voice;
        u.volume = Math.max(0.15, Math.min(1, 1 - distance / 45)) * getVolume();
        u.rate = 1.15;
        u.pitch = pitch;
        synth.speak(u);
      } catch {
        return null;
      }
      last = now;
      return words;
    },
    /** Quiet, now — on pause, at the end, when the scene changes. */
    stop() {
      try { synth?.cancel(); } catch { /* not supported */ }
    },
    dispose() {
      this.stop();
      synth?.removeEventListener?.("voiceschanged", load);
    },
  };
}

/**
 * The site supervisor on the radio: what the mission is, and in an
 * emergency what to do next — spoken to each player in their own
 * language. Tamil when the player has chosen Tamil and the device has a
 * Tamil voice; otherwise English (an English voice reading Tamil text
 * is not understandable). Calm and level, unlike the shouting on site.
 *
 * `say({ en, ta })` speaks a line; a line the same as the last one is
 * not repeated. `interrupt` stops whatever is being said first — for a
 * new instruction that replaces an old one.
 *
 * @param lang     () => "en" | "ta"
 * @param enabled  () => false keeps it quiet (sound off in this game)
 */
export function createGuide({ lang = () => "en", enabled = () => true } = {}) {
  const synth = typeof window !== "undefined" ? window.speechSynthesis || null : null;
  const Utterance = typeof window !== "undefined" ? window.SpeechSynthesisUtterance || null : null;
  let voices = [];
  let lastLine = "";
  const load = () => { voices = synth?.getVoices?.() || []; };
  load();
  synth?.addEventListener?.("voiceschanged", load);
  const find = (test) => voices.find((v) => test(String(v.lang || "").toLowerCase()));

  return {
    /** The words that were spoken, or null when nothing was. */
    say(line, { interrupt = false } = {}) {
      if (!line || !synth || !Utterance || !enabled() || !isSoundEnabled() || getVolume() <= 0) return null;
      const tamilVoice = lang() === "ta" && line.ta ? find((l) => l.startsWith("ta")) : null;
      const words = String(tamilVoice ? line.ta : line.en || "").trim();
      if (!words || words === lastLine) return null;
      const voice = tamilVoice || find((l) => l === "en-in" || l === "en_in") || find((l) => l.startsWith("en"));
      try {
        if (interrupt) synth.cancel();
        const u = new Utterance(words);
        u.lang = tamilVoice ? "ta-IN" : "en-IN";
        if (voice) u.voice = voice;
        u.volume = getVolume();
        u.rate = 1;
        u.pitch = 1;
        synth.speak(u);
      } catch {
        return null;
      }
      lastLine = words;
      return words;
    },
    /** Lets the same line be said again (a new mission). */
    reset() { lastLine = ""; },
    stop() {
      try { synth?.cancel(); } catch { /* not supported */ }
    },
    dispose() {
      this.stop();
      synth?.removeEventListener?.("voiceschanged", load);
    },
  };
}

/** "MAN DOWN — SCAFFOLD, LEVEL 3" reads better spoken as a sentence. */
export function spoken(text) {
  const t = String(text || "").trim();
  if (!t || t !== t.toUpperCase()) return t;
  return t.charAt(0) + t.slice(1).toLowerCase();
}
