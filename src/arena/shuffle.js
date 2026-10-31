/* ------------------------------------------------------------------ *
 *  SHUFFLING ANSWER ORDER
 *
 *  Every set of options in this project is WRITTEN with the correct
 *  answer first, because that is the only sane way to author and
 *  review safety content: a reviewer reading hazards.js should see the
 *  right answer at the top of each list.
 *
 *  That makes shuffling at display time not a nicety but a
 *  requirement. Without it the answer is in slot A every single time —
 *  which is exactly what happened in the escape rooms, where all five
 *  decision points had their correct option first and nothing ever
 *  reordered them. A player works that out inside two rooms, and from
 *  then on the mission teaches nothing.
 *
 *  Shuffled PER PLAY and PER QUESTION, so it is also different for the
 *  person sitting next to you.
 * ------------------------------------------------------------------ */

/** Fisher-Yates, on a copy. */
export function shuffle(list) {
  const out = [...(list || [])];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A shuffled list of indices, e.g. [2, 0, 3, 1].
 *
 * Returning the ORDER rather than the reordered options lets a caller
 * keep scoring against the original index — so the answer is checked
 * against the definition, never against the slot it happened to land
 * in.
 */
export function shuffledOrder(length) {
  return shuffle(Array.from({ length: Math.max(0, length | 0) }, (_, i) => i));
}
