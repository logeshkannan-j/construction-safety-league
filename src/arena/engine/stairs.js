/* ------------------------------------------------------------------ *
 *  ARENA ENGINE — stair geometry
 *
 *  Kept as its own DOM-free module so the geometry can be unit tested
 *  in plain Node against the real first-person controller. That matters:
 *  an earlier version of this crammed a storey's rise into a 3 m going,
 *  which looked fine but was physically unclimbable — the player's body
 *  could not fit between the top tread and the slab above, so the whole
 *  upper half of the Safety Mission site was unreachable.
 *
 *  Geometry rules this encodes:
 *   - the going is ~1.6x the rise, giving a ~32 degree flight whose
 *     tread rise stays under the controller's step height
 *   - the slab above is voided from the point where a standing player's
 *     head would meet its underside, through to the far edge of the top
 *     tread — no further, so the player always has floor to step onto
 *   - the void is railed on three sides, leaving the top of the flight
 *     as the only opening, so nobody falls down the stairwell
 * ------------------------------------------------------------------ */

export const STAIR = {
  width: 2.4,          // clear width between the rails
  goingRatio: 1.6,     // going = rise * this
  treads: 16,
  treadThickness: 0.16,
  // Head clearance assumed for the void calculation. Matches the
  // controller's standing height plus a little slack.
  headroom: 1.85,
  bodyRadius: 0.34,
};

/**
 * Builds one flight climbing in +x, from `xStart` at height `baseY` up
 * to `baseY + rise`.
 *
 * All coordinates are whatever space you pass in (the kit passes local
 * building coordinates).
 *
 * @returns {{
 *   treads: Array<{x:number,y:number,z:number,w:number,h:number,d:number}>,
 *   voidRect: {x:number,z:number,w:number,d:number},
 *   railRuns: Array<{x:number,z:number,length:number,axis:'x'|'z'}>,
 *   xStart:number, xEnd:number, topY:number, going:number,
 *   entry:{x:number,z:number}, exit:{x:number,z:number}
 * }}
 */
export function stairFlight({
  xStart = 0,
  zCenter = 0,
  baseY = 0,
  rise = 3.4,
  slabThickness = 0.32,
  treads = STAIR.treads,
  width = STAIR.width,
}) {
  const going = rise * STAIR.goingRatio;
  const treadGoing = going / treads;
  const treadRise = rise / treads;
  const xEnd = xStart + going;
  const topY = baseY + rise;

  const steps = [];
  for (let i = 0; i < treads; i++) {
    const top = baseY + treadRise * (i + 1);
    steps.push({
      x: xStart + going * ((i + 0.5) / treads),
      y: top - STAIR.treadThickness / 2,
      z: zCenter,
      w: treadGoing + 0.02,
      h: STAIR.treadThickness,
      d: width,
    });
  }

  // Where does a standing player's head first reach the underside of
  // the slab above? Void from there (minus body radius) to the far edge
  // of the top tread.
  const soffitY = topY - slabThickness;
  let voidFromX = xEnd;
  for (let i = 0; i < treads; i++) {
    const feet = baseY + treadRise * (i + 1);
    if (feet + STAIR.headroom >= soffitY) {
      voidFromX = Math.min(
        voidFromX,
        xStart + going * ((i + 0.5) / treads) - STAIR.bodyRadius - 0.2
      );
      break;
    }
  }
  voidFromX = Math.max(xStart, voidFromX);

  const voidW = Math.max(0.5, xEnd - voidFromX);
  const voidD = width + 0.5;
  const voidRect = {
    x: voidFromX + voidW / 2,
    z: zCenter,
    w: voidW,
    d: voidD,
  };

  // Rails on both long sides and across the bottom-of-flight end. The
  // +x end is intentionally open: that is the top of the flight.
  const railRuns = [
    { x: voidRect.x, z: zCenter - voidD / 2, length: voidW, axis: "x" },
    { x: voidRect.x, z: zCenter + voidD / 2, length: voidW, axis: "x" },
    { x: voidFromX, z: zCenter, length: voidD, axis: "z" },
  ];

  return {
    treads: steps,
    voidRect,
    railRuns,
    xStart,
    xEnd,
    topY,
    going,
    treadRise,
    entry: { x: xStart - 0.8, z: zCenter },
    exit: { x: xEnd + 0.8, z: zCenter },
  };
}

/**
 * Sanity checks used by the test harness and by a dev-time assertion:
 * returns a list of problems, empty when the flight is climbable.
 */
export function validateFlight(flight, stepHeight = 0.45) {
  const problems = [];
  if (flight.treadRise > stepHeight) {
    problems.push(`tread rise ${flight.treadRise.toFixed(3)} exceeds the controller step height ${stepHeight}`);
  }
  const topTread = flight.treads[flight.treads.length - 1];
  if (topTread.x - STAIR.bodyRadius < flight.voidRect.x - flight.voidRect.w / 2) {
    problems.push("the top tread is not fully inside the slab void — the player's body would hit the slab");
  }
  if (flight.voidRect.x + flight.voidRect.w / 2 > flight.xEnd + 0.01) {
    problems.push("the void extends past the top tread — the player would step into a gap");
  }
  if (flight.voidRect.d < STAIR.width) {
    problems.push("the void is narrower than the flight");
  }
  return problems;
}
