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
 *   - the flight itself is railed on BOTH sides for its whole length,
 *     and those rails carry collision: a stair you can walk off
 *     sideways halfway up is not a stair
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
  // Handrail height above the pitch line, and how thick the balustrade
  // is. 1.0 m is the usual stair-rail height; the site guardrails
  // elsewhere are 1.1 m because they protect a flat edge.
  railHeight: 1.0,
  railThickness: 0.14,
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
    baseY,
    rise,
    topY,
    going,
    treadRise,
    width,
    entry: { x: xStart - 0.8, z: zCenter },
    exit: { x: xEnd + 0.8, z: zCenter },
  };
}

/**
 * The balustrade for one flight: a handrail on each side, running the
 * whole length of the pitch.
 *
 * Returns both the visual parts and the collision runs, because the two
 * are not the same shape. A handrail is a thin sloping tube; making a
 * collider out of it would let the player's feet pass under it and walk
 * off the side of the flight. So the collision is a stepped wall — a few
 * axis-aligned boxes following the pitch, each from the tread it starts
 * on up to rail height — which is what actually keeps a body on the
 * stair.
 *
 * `parts` entries are box descriptors for the kit's merger, in the same
 * local space as the flight. `colliders` entries are plain boxes,
 * already centred, with no rotation.
 */
export function stairRails(flight, { segments = 4, posts = 5 } = {}) {
  const parts = [];
  const colliders = [];
  if (!flight || !flight.going) return { parts, colliders };

  const width = flight.width || STAIR.width;
  const halfW = width / 2;
  const h = STAIR.railHeight;
  const t = STAIR.railThickness;
  const baseY = flight.baseY || 0;
  const rise = flight.rise != null ? flight.rise : flight.topY - baseY;
  const zCenter = flight.treads.length ? flight.treads[0].z : 0;

  // Height of the pitch line at a position along the flight.
  const pitchAt = (x) => baseY + rise * Math.min(1, Math.max(0, (x - flight.xStart) / flight.going));

  const slope = Math.atan2(rise, flight.going);
  const diagonal = Math.hypot(rise, flight.going);

  [-1, 1].forEach((side) => {
    const z = zCenter + side * halfW;

    // Top rail and mid rail, sloping with the flight.
    [h, h * 0.55].forEach((offset) => {
      parts.push({
        w: diagonal, h: 0.07, d: 0.07,
        x: (flight.xStart + flight.xEnd) / 2,
        y: baseY + rise / 2 + offset,
        z,
        rotZ: slope,
      });
    });

    // Newel posts, vertical, standing on the pitch line.
    for (let i = 0; i < posts; i += 1) {
      const px = flight.xStart + (flight.going * i) / (posts - 1);
      parts.push({
        w: 0.08, h: h + 0.04, d: 0.08,
        x: px, y: pitchAt(px) + (h + 0.04) / 2, z,
      });
    }

    // The collision wall: a few boxes stepping up the pitch.
    for (let sgn = 0; sgn < segments; sgn += 1) {
      const x0 = flight.xStart + (flight.going * sgn) / segments;
      const x1 = flight.xStart + (flight.going * (sgn + 1)) / segments;
      const yLow = pitchAt(x0);
      const yHigh = pitchAt(x1) + h;
      colliders.push({
        x: (x0 + x1) / 2, y: (yLow + yHigh) / 2, z,
        w: x1 - x0, h: yHigh - yLow, d: t,
      });
    }
  });

  return { parts, colliders };
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
  // The balustrade must not close the flight up. The clear width is the
  // flight width less half a balustrade on each side.
  const clear = (flight.width || STAIR.width) - STAIR.railThickness;
  if (clear < STAIR.bodyRadius * 2 + 0.4) {
    problems.push(`the handrails leave only ${clear.toFixed(2)} m clear — a body needs ${(STAIR.bodyRadius * 2 + 0.4).toFixed(2)} m`);
  }
  return problems;
}
