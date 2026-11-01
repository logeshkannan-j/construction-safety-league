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
 * @param lang  () => "en" | "ta", the player's language now
 * @param gap   the least time between two shouts, in ms
 */
export function createVoices({ lang = () => "en", gap = 2200 } = {}) {
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
      if (!phrase || !synth || !Utterance || !isSoundEnabled() || getVolume() <= 0) return null;
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
