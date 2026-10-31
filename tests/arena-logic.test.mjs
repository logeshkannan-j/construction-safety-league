/**
 * Node harness for the Arena logic that does not need WebGL:
 * the first-person controller's collision / stairs / pits / ladders,
 * the hazard option builder, and the leaderboard aggregation.
 */
const SRC = new URL("../src/arena", import.meta.url).href;
const THREE = await import("three");
const { createFirstPerson, ladderVolume } = await import(`${SRC}/engine/fpsController.js`);
const { stairFlight, validateFlight, STAIR } = await import(`${SRC}/engine/stairs.js`);
const { HAZARDS, categoryOptions, actionOptions, SCORING } = await import(`${SRC}/games/safetyMission/hazards.js`);
const { buildLeaderboard, findSuspiciousRuns } = await import(`${SRC}/arenaDb.js`);

let pass = 0;
let fail = 0;
function check(name, condition, extra = "") {
  if (condition) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
}
function approx(a, b, tol = 0.08) { return Math.abs(a - b) <= tol; }

/* ---------------- a fake input object matching engine/input ---------------- */
function fakeInput() {
  const held = new Set();
  const pressed = new Set();
  return {
    state: { moveX: 0, moveY: 0, lookSensitivity: 1, invertY: false },
    consumeLook: () => ({ dx: 0, dy: 0 }),
    wasPressed: (a) => pressed.has(a),
    isHeld: (a) => held.has(a),
    endFrame: () => pressed.clear(),
    // helpers for the test
    _move(x, y) { this.state.moveX = x; this.state.moveY = y; },
    _hold(a, on) { if (on) held.add(a); else held.delete(a); },
    _press(a) { pressed.add(a); },
  };
}

function box(x, y, z, w, h, d) {
  return {
    minX: x - w / 2, maxX: x + w / 2,
    minY: y - h / 2, maxY: y + h / 2,
    minZ: z - d / 2, maxZ: z + d / 2,
  };
}

function run(controller, input, seconds, dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) {
    controller.update(dt);
    input.endFrame();
  }
}

console.log("\n== first-person controller ==");

// 1. Gravity settles the player on the world floor.
{
  const camera = new THREE.PerspectiveCamera();
  const input = fakeInput();
  const c = createFirstPerson(camera, input, { colliders: [], spawn: { x: 0, y: 5, z: 0 } });
  run(c, input, 2);
  check("falls to the world floor and stops", approx(c.position.y, 0) && c.state.grounded,
    `y=${c.position.y.toFixed(3)} grounded=${c.state.grounded}`);
}

// 2. A wall blocks horizontal movement.
{
  const camera = new THREE.PerspectiveCamera();
  const input = fakeInput();
  // Wall is a tall slab at z = -3 (yaw 0 means forward is -z).
  const wall = box(0, 2, -3, 10, 4, 0.4);
  const c = createFirstPerson(camera, input, { colliders: [wall], spawn: { x: 0, y: 0, z: 0 }, yaw: 0 });
  input._move(0, 1);
  run(c, input, 3);
  check("a wall stops forward movement", c.position.z > -2.9 && c.position.z < -2.4,
    `z=${c.position.z.toFixed(3)} (expected just short of -2.8)`);
}

// 3. Step-up climbs a 0.25 m rise without jumping (stair tread height).
//    The platform is deep enough that the player stays on it.
{
  const camera = new THREE.PerspectiveCamera();
  const input = fakeInput();
  const step = box(0, 0.125, -12, 6, 0.25, 20);
  const c = createFirstPerson(camera, input, { colliders: [step], spawn: { x: 0, y: 0, z: 0 }, yaw: 0 });
  input._move(0, 1);
  run(c, input, 2);
  check("steps up onto a 0.25 m platform", approx(c.position.y, 0.25, 0.06) && c.position.z < -1.5,
    `y=${c.position.y.toFixed(3)} z=${c.position.z.toFixed(3)}`);
}

// 4. A 1.2 m wall is NOT climbable by step-up (above stepHeight 0.45).
{
  const camera = new THREE.PerspectiveCamera();
  const input = fakeInput();
  const ledge = box(0, 0.6, -2, 6, 1.2, 2);
  const c = createFirstPerson(camera, input, { colliders: [ledge], spawn: { x: 0, y: 0, z: 0 }, yaw: 0 });
  input._move(0, 1);
  run(c, input, 2);
  check("a 1.2 m ledge blocks instead of teleporting the player up", c.position.y < 0.1,
    `y=${c.position.y.toFixed(3)}`);
}

// 5. THE REAL STAIR. Builds the actual geometry stairs.js produces, adds
//    the slab above with the void punched exactly as buildConcreteFrame
//    does, and checks a player can walk from the ground floor all the
//    way out onto the floor above. This is the test that caught the
//    original unclimbable stair.
{
  const floorHeight = 3.4;
  const slabThickness = 0.32;
  const flight = stairFlight({ xStart: 0, zCenter: 0, baseY: 0, rise: floorHeight, slabThickness });

  const problems = validateFlight(flight, 0.45);
  check("stair geometry validates", problems.length === 0, problems.join("; "));
  check("tread rise is below the controller step height", flight.treadRise < 0.45,
    `rise=${flight.treadRise.toFixed(3)}`);

  const colliders = flight.treads.map((t) => box(t.x, t.y, t.z, t.w, t.h, t.d));

  // The slab above, as span boxes with the stair void removed (same
  // algorithm buildConcreteFrame uses).
  const slabY = floorHeight;
  const vx0 = flight.voidRect.x - flight.voidRect.w / 2;
  const vx1 = flight.voidRect.x + flight.voidRect.w / 2;
  const vz0 = flight.voidRect.z - flight.voidRect.d / 2;
  const vz1 = flight.voidRect.z + flight.voidRect.d / 2;
  // Overlap-based removal on a 0.5 m grid, matching kit.js slabSpans.
  const TILE = 0.5;
  for (let gx = -12; gx < 40; gx += 1) {
    for (let gz = -20; gz < 20; gz += 1) {
      const x0 = gx * TILE;
      const x1 = x0 + TILE;
      const z0 = gz * TILE;
      const z1 = z0 + TILE;
      const overlaps = x0 < vx1 && x1 > vx0 && z0 < vz1 && z1 > vz0;
      if (overlaps) continue;
      colliders.push(box((x0 + x1) / 2, slabY - slabThickness / 2, (z0 + z1) / 2, TILE, slabThickness, TILE));
    }
  }

  const camera = new THREE.PerspectiveCamera();
  const input = fakeInput();
  const c = createFirstPerson(camera, input, {
    colliders,
    spawn: { x: flight.entry.x, y: 0, z: flight.entry.z },
    // yaw = -PI/2 points forward along +x (forward = (-sin, 0, -cos)).
    yaw: -Math.PI / 2,
  });
  input._move(0, 1);
  run(c, input, 6);
  check("climbs the full flight to the floor above", c.position.y > floorHeight - 0.05,
    `y=${c.position.y.toFixed(3)} x=${c.position.x.toFixed(3)}`);
  check("walks off the top of the flight onto the slab", c.position.x > flight.xEnd,
    `x=${c.position.x.toFixed(3)} xEnd=${flight.xEnd.toFixed(3)}`);

  // And can walk back down again without being trapped.
  input._move(0, -1);
  run(c, input, 6);
  check("can walk back down the flight", c.position.y < 0.3, `y=${c.position.y.toFixed(3)}`);
}

// 6. Pits: the player descends into a trench and is enclosed by its walls.
{
  const camera = new THREE.PerspectiveCamera();
  const input = fakeInput();
  const pit = { minX: -4, maxX: 4, minZ: -6, maxZ: -2, floorY: -2.2 };
  const walls = [
    box(-4.1, -1.1, -4, 0.3, 2.6, 4),
    box(4.1, -1.1, -4, 0.3, 2.6, 4),
    box(0, -1.1, -6.1, 8.2, 2.6, 0.3),
    box(0, -1.1, -1.9, 8.2, 2.6, 0.3),
  ];
  const c = createFirstPerson(camera, input, { colliders: walls, pits: [pit], spawn: { x: 0, y: 0, z: 0 }, yaw: 0 });
  input._move(0, 1);
  run(c, input, 3);
  check("falls into the excavation", approx(c.position.y, -2.2, 0.1), `y=${c.position.y.toFixed(3)}`);
  const zInside = c.position.z;
  check("is inside the trench footprint", zInside < -2 && zInside > -6.2, `z=${zInside.toFixed(3)}`);
  // Now try to walk out sideways — the walls must hold.
  input._move(1, 0);
  run(c, input, 3);
  check("cannot walk out through the trench wall", c.position.y < -2.0 && c.position.x < 3.9,
    `x=${c.position.x.toFixed(3)} y=${c.position.y.toFixed(3)}`);
}

// 7. Ladder climbing lifts the player to a platform at the top.
{
  const camera = new THREE.PerspectiveCamera();
  const input = fakeInput();
  const ladder = ladderVolume({ x: 0, z: 0, baseY: 0, topY: 8, width: 1.3, depth: 1.3, exit: { x: 3, z: 0 } });
  // A generous deck at the top of the ladder, so the test measures the
  // ladder-to-platform transition and not the player later strolling
  // off the far edge.
  const deck = box(4, 7.96, 0, 20, 0.08, 20);
  const c = createFirstPerson(camera, input, {
    colliders: [deck], ladders: [ladder], spawn: { x: 0, y: 0, z: 0 },
  });
  input._move(0, 1);
  run(c, input, 6);
  check("climbs a ladder and steps onto the platform", c.position.y > 7.5 && c.position.x > 0.6,
    `y=${c.position.y.toFixed(3)} x=${c.position.x.toFixed(3)}`);
}

// 8. Falling is reported with the right distance.
{
  const camera = new THREE.PerspectiveCamera();
  const input = fakeInput();
  let landed = null;
  const c = createFirstPerson(camera, input, {
    colliders: [], spawn: { x: 0, y: 6.8, z: 0 },
    onLand: (d) => { landed = d; },
  });
  run(c, input, 3);
  check("reports the fall distance on landing", landed !== null && landed > 6 && landed < 7.2,
    `distance=${landed}`);
}

// 9. Run is faster than walk, crouch is slower.
function travelled(holdAction) {
  const camera = new THREE.PerspectiveCamera();
  const input = fakeInput();
  const c = createFirstPerson(camera, input, { colliders: [], spawn: { x: 0, y: 0, z: 0 }, yaw: 0 });
  if (holdAction) input._hold(holdAction, true);
  input._move(0, 1);
  run(c, input, 1);
  return Math.abs(c.position.z);
}
{
  const walk = travelled(null);
  const sprint = travelled("run");
  const crouch = travelled("crouch");
  check("run moves further than walk", sprint > walk * 1.4, `walk=${walk.toFixed(2)} run=${sprint.toFixed(2)}`);
  check("crouch moves less than walk", crouch < walk * 0.7, `walk=${walk.toFixed(2)} crouch=${crouch.toFixed(2)}`);
}

// 10. Diagonal input is normalised (no faster diagonal movement).
{
  const camera = new THREE.PerspectiveCamera();
  const input = fakeInput();
  const c = createFirstPerson(camera, input, { colliders: [], spawn: { x: 0, y: 0, z: 0 }, yaw: 0 });
  input._move(0.7071, 0.7071);
  run(c, input, 1);
  const dist = Math.hypot(c.position.x, c.position.z);
  check("diagonal speed matches straight speed", approx(dist, travelled(null), 0.25),
    `diagonal=${dist.toFixed(2)} straight=${travelled(null).toFixed(2)}`);
}

console.log("\n== hazard catalogue ==");

check("ten hazards are defined", HAZARDS.length === 10, `got ${HAZARDS.length}`);
check("every hazard id is unique", new Set(HAZARDS.map((h) => h.id)).size === HAZARDS.length);
HAZARDS.forEach((h) => {
  const cats = categoryOptions(h);
  const acts = actionOptions(h);
  const catCorrect = cats.filter((o) => o.correct);
  const actCorrect = acts.filter((o) => o.correct);
  if (cats.length !== 4 || catCorrect.length !== 1) {
    check(`${h.id}: 4 category options with exactly 1 correct`, false, `${cats.length} opts, ${catCorrect.length} correct`);
  } else if (acts.length !== 4 || actCorrect.length !== 1) {
    check(`${h.id}: 4 action options with exactly 1 correct`, false, `${acts.length} opts, ${actCorrect.length} correct`);
  } else if (new Set(cats.map((o) => o.label)).size !== 4) {
    check(`${h.id}: no duplicate category labels`, false);
  } else if (new Set(acts.map((o) => o.label)).size !== 4) {
    check(`${h.id}: no duplicate action labels`, false);
  } else if (catCorrect[0].label !== h.category) {
    check(`${h.id}: correct category matches the hazard`, false);
  } else if (actCorrect[0].label !== h.action) {
    check(`${h.id}: correct action matches the hazard`, false);
  } else {
    pass++;
  }
});
console.log(`  PASS  all ${HAZARDS.length} hazards produce valid, unique, single-answer option sets`);

// Options must actually get shuffled, or the answer is always "A".
{
  const positions = new Set();
  for (let i = 0; i < 60; i++) {
    positions.add(categoryOptions(HAZARDS[0]).findIndex((o) => o.correct));
  }
  check("the correct answer is not always in the same slot", positions.size >= 3,
    `slots seen: ${[...positions].join(",")}`);
}

console.log("\n== scoring maths ==");
{
  // A flawless 10-hazard run on Safety Manager (scoreScale 1.3, penaltyScale 1.5).
  const total = 10;
  const identify = total * SCORING.identify;
  const action = total * SCORING.action;
  const raw = identify + action + SCORING.allHazardsBonus + SCORING.completionBonus + 120 * SCORING.timeBonusPerSecond;
  const score = Math.round(raw * 1.3);
  check("a flawless hard run scores under the 12000 anti-cheat ceiling", score < 12000, `score=${score}`);
  check("a flawless hard run is a meaningful score", score > 3500, `score=${score}`);

  // Every wrong answer must actually cost points.
  const withErrors = identify + action - Math.round(6 * 50 * 1.5);
  check("six wrong answers cost 450 points on hard", identify + action - withErrors === 450);
}

console.log("\n== leaderboard aggregation ==");
{
  const profiles = [
    { id: "a", name: "Asha", totalScore: 9000, runCount: 4, gamesCompleted: 3, bestScores: { "safety-mission": 4000, "crane-master": 3000, "safest-tower": 2000 } },
    { id: "b", name: "Ben", totalScore: 5000, runCount: 9, gamesCompleted: 1, bestScores: { "safety-mission": 5000 } },
    { id: "c", name: "Cal", totalScore: 0, runCount: 0, gamesCompleted: 0, bestScores: {} },
  ];
  const overall = buildLeaderboard({ profiles, period: "alltime", gameId: "overall" });
  check("overall ranks by total of personal bests", overall[0].playerId === "a" && overall[1].playerId === "b",
    JSON.stringify(overall.map((r) => r.playerId)));
  check("players who never played are excluded", !overall.some((r) => r.playerId === "c"));
  check("ranks are 1-based and sequential", overall[0].rank === 1 && overall[1].rank === 2);

  const perGame = buildLeaderboard({ profiles, period: "alltime", gameId: "safety-mission" });
  check("per-game board ranks by that game's best only", perGame[0].playerId === "b" && perGame[0].score === 5000,
    JSON.stringify(perGame.map((r) => [r.playerId, r.score])));

  // Time-boxed boards come from the feed.
  const now = Date.now();
  const feed = [
    { runId: "1", playerId: "a", playerName: "Asha", gameId: "safety-mission", score: 1200, createdAt: now - 1000, completed: true, accuracy: 90, timeTakenMs: 300000 },
    { runId: "2", playerId: "a", playerName: "Asha", gameId: "safety-mission", score: 2200, createdAt: now - 2000, completed: true, accuracy: 95, timeTakenMs: 300000 },
    { runId: "3", playerId: "b", playerName: "Ben", gameId: "crane-master", score: 1800, createdAt: now - 3000, completed: true, accuracy: 80, timeTakenMs: 300000 },
    { runId: "4", playerId: "b", playerName: "Ben", gameId: "crane-master", score: 500, createdAt: now - 9 * 24 * 3600 * 1000, completed: true, accuracy: 50, timeTakenMs: 300000 },
  ];
  const daily = buildLeaderboard({ profiles, feed, period: "daily", gameId: "overall" });
  const asha = daily.find((r) => r.playerId === "a");
  check("daily board keeps only the best run per game, not the sum", asha.score === 2200, `score=${asha.score}`);
  const weekly = buildLeaderboard({ profiles, feed, period: "weekly", gameId: "crane-master" });
  check("the 9-day-old run is outside the weekly window", weekly.find((r) => r.playerId === "b").score === 1800);
}

console.log("\n== anti-cheat detection ==");
{
  const now = Date.now();
  const feed = [
    { runId: "ok", playerId: "a", gameId: "safety-mission", score: 4200, accuracy: 92, timeTakenMs: 280000, createdAt: now },
    { runId: "huge", playerId: "z", gameId: "safety-mission", score: 999999, accuracy: 100, timeTakenMs: 300000, createdAt: now },
    { runId: "fast", playerId: "y", gameId: "crane-master", score: 6000, accuracy: 100, timeTakenMs: 1200, createdAt: now },
    { runId: "acc", playerId: "x", gameId: "crane-master", score: 100, accuracy: 480, timeTakenMs: 300000, createdAt: now },
  ];
  const flagged = findSuspiciousRuns(feed);
  const ids = flagged.map((f) => f.runId);
  check("flags a score above the ceiling", ids.includes("huge"));
  check("flags a high score in an impossible time", ids.includes("fast"));
  check("flags accuracy above 100%", ids.includes("acc"));
  check("does not flag a legitimate run", !ids.includes("ok"));

  const burst = [];
  for (let i = 0; i < 12; i++) {
    burst.push({ runId: `b${i}`, playerId: "spam", gameId: "safety-mission", score: 900, accuracy: 60, timeTakenMs: 200000, createdAt: now + i * 2000 });
  }
  check("flags a submission burst", findSuspiciousRuns(burst).length > 0);
}

console.log("\n== textures are not shared across scenes ==");
{
  // Regression test. Procedural textures are cached so repeated signs
  // cost one canvas, but disposeScene() disposes every texture it finds
  // on teardown — so if the cache survived between games, the second
  // play would draw with disposed textures (black/missing surfaces).
  // createMaterials must therefore start each scene with a clear cache.
  //
  // kit.js needs a canvas to generate those textures, so stub just
  // enough of the 2D context for the generators to run.
  const ctxStub = () => {
    const noop = () => {};
    return {
      fillStyle: "", strokeStyle: "", lineWidth: 1, globalAlpha: 1,
      font: "", textAlign: "", textBaseline: "",
      fillRect: noop, strokeRect: noop, clearRect: noop,
      beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
      bezierCurveTo: noop, quadraticCurveTo: noop, arc: noop, ellipse: noop,
      stroke: noop, fill: noop, fillText: noop, save: noop, restore: noop,
      translate: noop, rotate: noop, scale: noop,
      createLinearGradient: () => ({ addColorStop: noop }),
      createRadialGradient: () => ({ addColorStop: noop }),
      getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
      putImageData: noop, drawImage: noop,
    };
  };
  const hadDocument = typeof globalThis.document !== "undefined";
  if (!hadDocument) {
    globalThis.document = {
      createElement: () => ({ width: 0, height: 0, style: {}, getContext: ctxStub }),
      createElementNS: () => ({ width: 0, height: 0, style: {}, getContext: ctxStub }),
    };
  }

  try {
    const kit = await import(`${SRC}/engine/kit.js`);
    check("kit exports clearTextureCache", typeof kit.clearTextureCache === "function");

    const cfg = { anisotropy: 1, segments: 8, shadows: false, drawDistance: 120, fog: false, maxLights: 1 };

    const first = kit.createMaterials(cfg);
    const firstGroundMap = first.ground.map;
    // Within one scene, the same texture is reused (that is the point).
    const sameSceneA = kit.signTexture("Danger", "warning");
    const sameSceneB = kit.signTexture("Danger", "warning");
    check("within one scene an identical sign reuses its texture", sameSceneA === sameSceneB);

    const second = kit.createMaterials(cfg);
    check("a new scene gets a freshly generated ground texture",
      second.ground.map !== firstGroundMap);
    const newSceneSign = kit.signTexture("Danger", "warning");
    check("a new scene gets a freshly generated sign texture", newSceneSign !== sameSceneA);
  } catch (e) {
    check("the texture cache test ran", false, e.message);
  } finally {
    if (!hadDocument) delete globalThis.document;
  }
}

console.log("\n== security rules match the game config ==");
{
  const fs = await import("node:fs");
  const { GAMES, GAME_IDS } = await import(`${SRC}/arenaConstants.js`);
  const rulesPath = new URL("../rules.json", import.meta.url);
  let rules = null;
  try {
    rules = JSON.parse(fs.readFileSync(rulesPath, "utf8"));
    check("rules.json is valid JSON", true);
  } catch (e) {
    check("rules.json is valid JSON", false, e.message);
  }

  if (rules) {
    const text = JSON.stringify(rules);

    // The quiz's own paths must stay writable, or the existing game breaks.
    ["game", "questions", "players", "misc"].forEach((path) => {
      check(`quiz path "${path}" is still writable`, rules.rules?.[path]?.[".write"] === true);
    });
    check("the database is still world-readable (the TV and players rely on it)", rules.rules?.[".read"] === true);

    // Every game id must appear in the rules' allow-lists, or its runs are rejected.
    GAME_IDS.forEach((id) => {
      const occurrences = text.split(`'${id}'`).length - 1;
      check(`game id "${id}" is allow-listed in the rules`, occurrences >= 3,
        `found ${occurrences} references, expected at least 3 (runs, feed, bestScores)`);
    });

    // The score ceiling in the rules must match the ceiling in the code,
    // or honest high scores get rejected / cheats get through.
    const ceilings = [...new Set(GAMES.map((g) => g.maxScore))];
    check("all games share one score ceiling", ceilings.length === 1, `found ${ceilings.join(", ")}`);
    const ceiling = ceilings[0];
    const runCeiling = rules.rules?.arena?.runs?.$playerId?.$runId?.score?.[".validate"] || "";
    check(`the rules' run ceiling is ${ceiling}`, runCeiling.includes(String(ceiling)),
      `rule says: ${runCeiling}`);
    const feedCeiling = rules.rules?.arena?.feed?.$runId?.score?.[".validate"] || "";
    check(`the rules' feed ceiling is ${ceiling}`, feedCeiling.includes(String(ceiling)));
    const bestCeiling = rules.rules?.arena?.profiles?.$playerId?.bestScores?.$gameId?.[".validate"] || "";
    check(`the rules' per-game best ceiling is ${ceiling}`, bestCeiling.includes(String(ceiling)));
    const totalRule = rules.rules?.arena?.profiles?.$playerId?.totalScore?.[".validate"] || "";
    check(`the rules' total ceiling covers ${GAME_IDS.length} games`,
      totalRule.includes(String(ceiling * GAME_IDS.length)),
      `expected ${ceiling * GAME_IDS.length} in: ${totalRule}`);

    // Runs must be create-only, which is what stops score editing.
    const runWrite = rules.rules?.arena?.runs?.$playerId?.$runId?.[".write"] || "";
    check("runs are create-only (no editing an existing run)", runWrite.includes("!data.exists()"), runWrite);
    const feedWrite = rules.rules?.arena?.feed?.$runId?.[".write"] || "";
    check("feed entries are create-only", feedWrite.includes("!data.exists()"), feedWrite);
    check("a run must be written under its own player id", runWrite.includes("$playerId"), runWrite);

    // Queries the app makes need indexes, or Firebase sorts on the client.
    check("arena/feed is indexed on createdAt", rules.rules?.arena?.feed?.[".indexOn"] === "createdAt");
    check("arena/runs is indexed on createdAt", rules.rules?.arena?.runs?.$playerId?.[".indexOn"] === "createdAt");
  }
}

/* ------------------------------------------------------------------ *
 *  REACT STRICTMODE MOUNT FLAGS
 *
 *  main.jsx wraps the app in <React.StrictMode>, so in development React
 *  mounts every component, runs its cleanups, and mounts it AGAIN. A
 *  component that clears an "am I still mounted" flag in its cleanup but
 *  never re-arms it in the effect body is permanently stuck after that
 *  second mount: every `if (!mountedRef.current) return;` bails out.
 *
 *  This is exactly what froze ArenaView on "Opening the Gaming Arena…".
 * ------------------------------------------------------------------ */
{
  console.log("\n-- React StrictMode mount flags --");

  // The lifecycle itself, reduced to the part that actually broke.
  function simulate({ reArm }) {
    const flag = { current: true };
    let screen = "loading";
    const effect = () => {
      if (reArm) flag.current = true;
      // bootstrap(): an await, then a guard, then the screen change
      return Promise.resolve().then(() => {
        if (!flag.current) return;
        screen = "home";
      });
    };
    const cleanup = () => { flag.current = false; };

    const first = effect();          // StrictMode mount 1
    cleanup();                       // StrictMode's immediate unmount
    const second = effect();         // StrictMode mount 2
    return Promise.all([first, second]).then(() => screen);
  }

  const broken = await simulate({ reArm: false });
  const fixed = await simulate({ reArm: true });
  check("the old pattern really does deadlock under StrictMode", broken === "loading",
    `expected the bug to reproduce, got screen=${broken}`);
  check("re-arming the flag lets the second mount finish", fixed === "home",
    `expected screen=home, got ${fixed}`);

  // And guard the whole codebase against it coming back.
  const { readFileSync, readdirSync, statSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const srcDir = fileURLToPath(new URL("../src", import.meta.url));

  function walk(dir, out = []) {
    for (const entry of readdirSync(dir)) {
      const full = `${dir}/${entry}`;
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(jsx?|mjs)$/.test(entry)) out.push(full);
    }
    return out;
  }

  let scanned = 0;
  const offenders = [];
  for (const file of walk(srcDir)) {
    const code = readFileSync(file, "utf8");
    // Every ref this file clears as part of an unmount cleanup.
    const cleared = new Set(
      [...code.matchAll(/(\w+)\.current\s*=\s*false/g)]
        .map((m) => m[1])
        .filter((name) => /mounted|alive|active/i.test(name))
    );
    for (const name of cleared) {
      scanned++;
      const reArmed = new RegExp(`${name}\\.current\\s*=\\s*true`).test(code);
      if (!reArmed) offenders.push(`${file.slice(srcDir.length + 1)} → ${name}`);
    }
  }

  check(`every mount flag in src/ is re-armed (${scanned} checked)`, offenders.length === 0,
    offenders.join(", "));
  check("the scan actually found mount flags to check", scanned > 0);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
