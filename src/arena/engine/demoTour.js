/* ------------------------------------------------------------------ *
 *  DEMO TOUR — the shot list for a mission's built-in demo.
 *
 *  Each of the five games returns a `demoTour` from create(): a list of
 *  camera shots through its OWN scene, built from the same coordinates
 *  the game itself uses. The demo player then hands the list to the
 *  mission's site view, which already owns the camera cleanly while it
 *  is engaged — so one tour implementation drives all five games
 *  without touching any of their camera controllers again.
 *
 *  Because the shots are derived from live scene data rather than
 *  written out as fixed numbers, moving a hazard moves the shot that
 *  looks at it. There is nothing to keep in sync by hand.
 *
 *  A shot's `step` is an INDEX into that mission's briefing steps (see
 *  src/missionBriefs.js), not a string. The game says "this shot
 *  illustrates step 3"; the player looks up step 3 in whichever
 *  language the viewer has chosen. That is what keeps the captions
 *  translated and identical to the voice-over without the 3D layer
 *  having to know that English and Tamil exist.
 * ------------------------------------------------------------------ */

/**
 * One shot.
 *
 * @param center   what to look at — a THREE.Vector3, {x,y,z}, or [x,y,z]
 * @param yaw      compass angle to view it from, radians (0 = from +Z)
 * @param pitch    angle above the horizon, radians. ~0.3 is a low,
 *                 almost-standing shot; ~1.0 is nearly overhead.
 * @param distance metres from the subject
 * @param seconds  how long the shot lasts, flying and held together
 * @param step     which briefing step this shot illustrates
 */
export function shot(center, {
  yaw = 0.6, pitch = 0.55, distance = 30, seconds = 6, step = null,
} = {}) {
  const c = Array.isArray(center)
    ? { x: center[0], y: center[1] || 0, z: center[2] }
    : (center || { x: 0, y: 0, z: 0 });
  return {
    center: [Number(c.x) || 0, Number(c.y) || 0, Number(c.z) || 0],
    yaw, pitch, distance, seconds, step,
  };
}

/**
 * The opening shot every mission uses: high and wide, looking north
 * across the site so the finished Casagrand Aria towers are in frame
 * behind the work. It establishes where you are before anything else.
 */
export function establishingShot({ distance = 110, seconds = 7, step = null } = {}) {
  return shot({ x: 0, y: 0, z: -10 }, { yaw: 0, pitch: 0.70, distance, seconds, step });
}

/**
 * The closing shot: a slow, high orbit of the whole site.
 */
export function closingShot({ distance = 120, seconds = 7, step = null } = {}) {
  return shot({ x: 0, y: 0, z: -10 }, { yaw: 0.85, pitch: 0.92, distance, seconds, step });
}

/** Total running time of a tour, in seconds. */
export function tourSeconds(tour) {
  return (tour || []).reduce((t, s) => t + (Number(s?.seconds) || 0), 0);
}
