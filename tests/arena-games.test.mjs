/**
 * Runs each Arena game's REAL world construction and REAL frame loop
 * headlessly, driving it through its actual input object and api, and
 * asserting it plays to a finished result.
 *
 * This is what catches "the 3D game does not work": construction
 * exceptions, NaN transforms, update-loop throws, controls that move
 * nothing, interactions that never trigger, and scoring that never
 * completes.
 */

import {
  installDom, uninstallDom, makeElement, makeRendererStub,
  runFrames, makeApi, DIFFICULTY, SETTINGS,
} from "./_harness.mjs";

const SRC = new URL("../src/arena", import.meta.url).href;

let pass = 0;
let fail = 0;
const failures = [];

function check(name, condition, extra = "") {
  if (condition) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${extra ? `  — ${extra}` : ""}`); }
}

function section(title) {
  console.log(`\n== ${title} ==`);
}

// The correct option id for each escape-room area.
const ESCAPE_CORRECT = {
  basement: "lit",
  electrical: "isolate",
  ppe: "full",
  chemical: "decanted",
  fire: "co2",
  signage: "dontuse",
  alarm: "raise",
};

/* ---------------------------------------------------------------- */

installDom({ width: 1280, height: 720 });

const gfx = await import(`${SRC}/engine/gfx.js`);
let lastRenderer = null;
gfx.__setRendererFactory(() => {
  lastRenderer = makeRendererStub();
  return lastRenderer;
});

const THREE = await import("three");

/** Boots a game module and returns everything a test needs. */
async function boot(path, { difficulty = "normal", mobile = false } = {}) {
  const container = makeElement("div", { width: 1280, height: 720 });
  const { api, record } = makeApi();
  const mod = await import(`${SRC}/games/${path}/index.js`);
  const create = mod.default?.create || mod.create;
  const instance = create({
    container,
    difficulty: DIFFICULTY[difficulty],
    quality: "medium",
    settings: SETTINGS,
    mobile,
    api,
  });
  return { mod, instance, api, record, container, meta: mod.default || mod };
}

/** Walks the scene graph looking for non-finite transforms. */
function findBadTransforms(root) {
  const bad = [];
  root.traverse((object) => {
    const { position, scale, rotation } = object;
    const values = [
      position.x, position.y, position.z,
      scale.x, scale.y, scale.z,
      rotation.x, rotation.y, rotation.z,
    ];
    if (values.some((v) => !Number.isFinite(v))) {
      bad.push(object.name || object.type);
    }
  });
  return bad;
}

function countMeshes(root) {
  let n = 0;
  root.traverse((o) => { if (o.isMesh) n += 1; });
  return n;
}

/* ================================================================ *
 *  Shared checks every game must satisfy
 * ================================================================ */

const GAMES = [
  ["safetyMission", "safety-mission", "Safety Mission Simulator"],
  ["craneMaster", "crane-master", "Tower Crane Master"],
  ["safestTower", "safest-tower", "Build the Safest Tower"],
  ["escapeChallenge", "escape-challenge", "Safety Escape Challenge"],
  ["emergencyCommander", "emergency-commander", "Emergency Response Commander"],
];

const booted = {};

for (const [path, id, title] of GAMES) {
  section(`${title} — construction and loop`);
  let ctx = null;
  try {
    ctx = await boot(path);
    booted[path] = ctx;
    check(`${id}: create() completes without throwing`, true);
  } catch (e) {
    check(`${id}: create() completes without throwing`, false, `${e.message}\n${e.stack?.split("\n").slice(0, 4).join("\n")}`);
    continue;
  }

  const { instance, record, meta } = ctx;

  check(`${id}: module declares the expected id`, meta.id === id, `got "${meta.id}"`);
  check(`${id}: module exposes a briefing`, !!meta.briefing?.objectives?.length);
  check(`${id}: module exposes desktop controls`, (meta.desktopControls || []).length > 0);
  check(`${id}: module exposes mobile controls`, (meta.mobileControls || []).length > 0);
  check(`${id}: instance exposes input, setPaused and dispose`,
    !!instance?.input && typeof instance.setPaused === "function" && typeof instance.dispose === "function");

  // The scene must actually contain a world.
  const stageScene = lastRenderer ? null : null;
  check(`${id}: a renderer was created`, !!lastRenderer);

  // Drive the real loop.
  let loopError = null;
  const originalError = console.error;
  const errors = [];
  console.error = (...args) => { errors.push(args.map(String).join(" ")); };
  try {
    runFrames(120);
  } catch (e) {
    loopError = e;
  } finally {
    console.error = originalError;
  }
  check(`${id}: 120 frames run without throwing`, !loopError,
    loopError ? `${loopError.message}\n${loopError.stack?.split("\n").slice(0, 4).join("\n")}` : "");
  const frameErrors = errors.filter((line) => line.includes("[arena] frame error"));
  check(`${id}: no frame errors logged`, frameErrors.length === 0, frameErrors.slice(0, 2).join(" | "));

  check(`${id}: the renderer is actually rendering`, (lastRenderer?.renderCount || 0) > 100,
    `renderCount=${lastRenderer?.renderCount}`);
  check(`${id}: the HUD receives updates`, record.hudUpdates > 0, `updates=${record.hudUpdates}`);
  check(`${id}: the HUD declares an objective`, typeof record.hud.objective === "string" && record.hud.objective.length > 0,
    JSON.stringify(record.hud.objective));
  check(`${id}: the HUD declares a control scheme`, !!record.hud.controlScheme, record.hud.controlScheme);
  check(`${id}: mobile action buttons are declared`, record.buttons.length > 0);
  check(`${id}: every action button has a label and an action`,
    record.buttons.every((b) => b.label && b.action), JSON.stringify(record.buttons));
}

/* ================================================================ *
 *  Scene content and transform sanity
 * ================================================================ */

section("Scene content");

{
  const kit = await import(`${SRC}/engine/kit.js`);
  const container = makeElement("div", { width: 800, height: 600 });
  const stage = gfx.createStage(container, { quality: "medium", fov: 70 });
  const mat = kit.createMaterials(stage.cfg);
  const geo = kit.createGeometries(stage.cfg);

  gfx.addSky(stage.scene, stage.cfg, {});
  gfx.addDaylight(stage.scene, stage.cfg, {});
  stage.scene.add(kit.buildGround(mat, 240));

  const hoarding = kit.buildHoarding(geo, mat, { width: 90, depth: 70 });
  stage.scene.add(hoarding.group);
  check("hoarding produces colliders", hoarding.colliders.length > 20, `${hoarding.colliders.length}`);

  const frame = kit.buildConcreteFrame(geo, mat, {
    x: 0, z: 0, width: 18, depth: 14, floors: 4, floorHeight: 3.4,
    openings: [{ floor: 1, x: -5, z: 3, w: 1.8, d: 1.8 }],
  });
  stage.scene.add(frame.group);
  check("concrete frame produces floors", frame.floors.length === 4);
  check("concrete frame produces colliders", frame.colliders.length > 50, `${frame.colliders.length}`);
  check("concrete frame reports stairs", frame.stairs.length === 3, `${frame.stairs.length}`);
  check("stair entry is inside the footprint",
    Math.abs(frame.stairs[0].entry.x) <= 9.5 && Math.abs(frame.stairs[0].z) <= 7.5,
    JSON.stringify(frame.stairs[0]));

  const crane = kit.buildTowerCrane(geo, mat, { mastHeight: 34, jibLength: 38 });
  stage.scene.add(crane.group);
  check("crane exposes slew, trolley, hook and rope",
    !!crane.parts.slew && !!crane.parts.trolley && !!crane.parts.hook && !!crane.parts.rope);
  crane.parts.trolley.position.x = 20;
  crane.parts.hook.position.y = -18;
  kit.updateHoistRope(crane.parts);
  check("the hoist rope scales to the hook drop", Math.abs(crane.parts.rope.scale.y - 18) < 0.01,
    `${crane.parts.rope.scale.y}`);

  const scaffold = kit.buildScaffold(geo, mat, { bays: 4, lifts: 4, incompleteLift: 3 });
  stage.scene.add(scaffold.group);
  check("scaffold produces platforms", scaffold.platforms.length === 4);
  check("scaffold marks the incomplete lift", scaffold.platforms[2].incomplete === true);
  check("scaffold platforms all have colliders", scaffold.colliders.length === 4);

  const worker = kit.buildWorker(geo, mat, { helmet: false, vest: true });
  stage.scene.add(worker);
  check("worker records its PPE state", worker.userData.worker.helmet === false);

  stage.scene.add(kit.buildExcavation(geo, mat, {}).group);
  stage.scene.add(kit.buildMaterialHoist(geo, mat, { overloaded: true }));
  stage.scene.add(kit.buildPPEStation(geo, mat));
  stage.scene.add(kit.buildSiteHut(geo, mat, {}));
  stage.scene.add(kit.buildSign(geo, mat, { text: "Danger", kind: "warning" }));
  stage.scene.add(kit.buildSafetyNet(mat, {}));

  const meshes = countMeshes(stage.scene);
  check("the kit builds a substantial world", meshes > 40, `${meshes} meshes`);
  check("mesh count stays mobile-reasonable", meshes < 600, `${meshes} meshes`);

  const bad = findBadTransforms(stage.scene);
  check("no NaN or Infinity in any transform", bad.length === 0, bad.slice(0, 5).join(", "));

  // Disposal must release everything and leave an empty scene.
  stage.dispose();
  check("stage.dispose empties the scene", stage.scene.children.length === 0,
    `${stage.scene.children.length} left`);
}

/* ================================================================ *
 *  Game 1 — full playthrough
 * ================================================================ */

section("Safety Mission Simulator — full playthrough");
{
  const { instance, record } = await boot("safetyMission");
  const input = instance.input;
  const { state, controller, hazards } = instance.__test;

  runFrames(10);
  check("mission starts with a zero score", record.hud.score === 0, `${record.hud.score}`);
  check("mission shows a running timer", record.hud.timeMs > 0);
  check("hazard register lists all 10 hazards", (record.hud.tasks || []).length === 10,
    `${(record.hud.tasks || []).length}`);

  // --- movement ---
  const spawn = controller.position.clone();
  input.setJoystick(0, 1);              // the mobile path: joystick forward
  runFrames(60);
  input.setJoystick(0, 0);
  const movedByJoystick = controller.position.distanceTo(spawn);
  check("joystick moves the player", movedByJoystick > 1.5, `moved ${movedByJoystick.toFixed(2)} m`);

  const afterJoystick = controller.position.clone();
  input.press("run");
  input.setJoystick(0, 1);
  runFrames(60);
  input.setJoystick(0, 0);
  input.release("run");
  const ranDistance = controller.position.distanceTo(afterJoystick);
  check("holding RUN covers more ground than walking", ranDistance > movedByJoystick * 1.3,
    `walk ${movedByJoystick.toFixed(2)} vs run ${ranDistance.toFixed(2)}`);

  // --- look ---
  const yawBefore = controller.yaw;
  input.addLook(240, 0);                // the touch-look path
  runFrames(2);
  check("touch look rotates the camera", Math.abs(controller.yaw - yawBefore) > 0.1,
    `yaw ${yawBefore.toFixed(3)} → ${controller.yaw.toFixed(3)}`);

  // --- collision: the player cannot leave the site ---
  // A panel run, away from the gateway.
  controller.teleport(20, 0, -34, Math.PI);
  input.setJoystick(0, -1);                   // reverse, into the fence
  runFrames(120);
  input.setJoystick(0, 0);
  check("hoarding panels stop the player leaving the site", controller.position.z > -36.5,
    `z=${controller.position.z.toFixed(2)}`);

  // The gateway is visually open but must not be walkable out of.
  controller.teleport(0, 0, -34, Math.PI);
  input.setJoystick(0, -1);
  runFrames(120);
  input.setJoystick(0, 0);
  check("the site gateway is closed off too", controller.position.z > -36.5,
    `z=${controller.position.z.toFixed(2)}`);

  // --- stairs: the player can reach the upper floors ---
  controller.teleport(-18.8, 0, 5.1, -Math.PI / 2);  // foot of the flight
  input.setJoystick(0, 1);
  runFrames(300);
  input.setJoystick(0, 0);
  check("the player can climb to Level 1", controller.position.y > 3.0,
    `y=${controller.position.y.toFixed(2)}`);

  // --- report all ten hazards ---
  let answered = 0;
  for (const hazard of hazards) {
    // Stand at the hazard and look straight at it.
    const p = hazard.position;
    const standY = hazard.data.place.y;
    controller.teleport(p.x, standY, p.z + 1.6, 0);
    controller.state.pitch = 0;
    runFrames(3);

    if (state.target !== hazard) {
      check(`hazard "${hazard.data.id}" becomes targetable when stood at`, false,
        `target=${state.target?.data?.id || "none"}`);
      continue;
    }

    input.press("interact");
    runFrames(2);
    input.release("interact");
    runFrames(2);

    // Step 1 — classification.
    const step1 = record.dialog;
    if (!step1) {
      check(`hazard "${hazard.data.id}" opens the classification dialog`, false);
      continue;
    }
    const correctCategory = step1.options.find((o) => o.id === "correct");
    step1.onPick(correctCategory.id);
    runFrames(2);

    // Step 2 — corrective action.
    const step2 = record.dialog;
    if (!step2) {
      check(`hazard "${hazard.data.id}" opens the action dialog`, false);
      continue;
    }
    const correctAction = step2.options.find((o) => o.id === "correct");
    step2.onPick(correctAction.id);
    runFrames(3);
    answered += 1;
  }

  check("all 10 hazards can be found and reported", answered === 10, `${answered}/10`);
  check("every hazard was classified correctly", state.identifiedCorrect === 10, `${state.identifiedCorrect}`);
  check("every corrective action was correct", state.actionCorrect === 10, `${state.actionCorrect}`);
  check("score accumulated from the reports", state.score > 2000, `${state.score}`);

  // Completing the last hazard must finish the mission.
  runFrames(5);
  const result = record.finished;
  check("reporting every hazard completes the mission", !!result && result.completed === true,
    JSON.stringify(result && { completed: result.completed, score: result.score }));
  if (result) {
    check("a flawless run scores 100% performance", result.performance === 100, `${result.performance}`);
    // The rating label itself is applied by GameShell from `performance`
    // (see handleFinish), so it is asserted in arena-logic.test.mjs
    // rather than here.
    check("the result is under the anti-cheat ceiling", result.score <= 12000, `${result.score}`);
    check("the result reports hazard stats", result.stats?.hazardsFound === 10, JSON.stringify(result.stats));
    check("the result has a performance breakdown", (result.breakdown || []).length > 5);
  }

  instance.dispose();
  check("game 1 disposes without throwing", true);
}

/* ================================================================ *
 *  Game 2 — crane lift
 * ================================================================ */

section("Tower Crane Master — lift a load");
{
  const { instance, record } = await boot("craneMaster");
  const input = instance.input;
  const { state, lifts, hookWorldPosition, loadWorldPosition, safeWorkingLoad, CRANE } = instance.__test;

  runFrames(10);
  // The mission is ONE lift, done properly — not a queue of them.
  check("the lift plan is a single lift", lifts.length === 1, `${lifts.length}`);
  check("the one lift targets a floor of the building, not the ground",
    lifts[0].target.floor !== null && lifts[0].targetY > 1, `floor ${lifts[0].target.floor}`);
  check("the HUD reports crane readouts", (record.hud.readouts || []).length >= 5);
  check("the capacity chart falls as radius grows",
    safeWorkingLoad(10) > safeWorkingLoad(35), `${safeWorkingLoad(10)} vs ${safeWorkingLoad(35)}`);

  // --- the controls actually move the crane ---
  const slewBefore = state.slew;
  input.press("slewRight");
  runFrames(60);
  input.release("slewRight");
  check("SLEW rotates the jib", Math.abs(state.slew - slewBefore) > 0.05,
    `${slewBefore.toFixed(3)} → ${state.slew.toFixed(3)}`);

  const radiusBefore = state.radius;
  input.press("trolleyOut");
  runFrames(60);
  input.release("trolleyOut");
  check("TROLLEY changes the radius", state.radius > radiusBefore + 0.5,
    `${radiusBefore.toFixed(2)} → ${state.radius.toFixed(2)}`);

  const hookBefore = state.hookY;
  input.press("hoistDown");
  runFrames(60);
  input.release("hoistDown");
  check("HOIST lowers the hook", state.hookY < hookBefore - 0.5,
    `${hookBefore.toFixed(2)} → ${state.hookY.toFixed(2)}`);

  // --- emergency stop ---
  input.press("slewRight");
  runFrames(30);
  input.tap("estop");
  runFrames(20);
  input.release("slewRight");
  check("EMERGENCY STOP brakes the slew", Math.abs(state.slewVel) < 0.02, `${state.slewVel}`);
  check("the HUD shows the E-stop state", state.estop === true || record.hud.controlsLocked !== undefined);
  runFrames(150); // let the stop release

  /* --- a competent operator: feather the controls, braking early --- */

  const releaseAll = () => ["slewLeft", "slewRight", "trolleyIn", "trolleyOut", "hoistUp", "hoistDown"]
    .forEach((a) => input.release(a));

  /**
   * Drives one axis to a target with predictive braking — the way an
   * operator eases off before arriving instead of banging the lever.
   */
  function driveAxis({ get, getVel, maxVel, accel, plus, minus, target, tol, wrap = false, frames = 1400 }) {
    for (let i = 0; i < frames; i++) {
      let error = target - get();
      if (wrap) {
        while (error > Math.PI) error -= Math.PI * 2;
        while (error < -Math.PI) error += Math.PI * 2;
      }
      const velocity = getVel();
      const stopDistance = (velocity * velocity) / (2 * accel);
      if (Math.abs(error) <= tol && Math.abs(velocity) < maxVel * 0.02) {
        input.release(plus); input.release(minus);
        return true;
      }
      const shouldDrive = Math.abs(error) > stopDistance + tol * 0.5;
      if (shouldDrive && error > 0) { input.press(plus); input.release(minus); }
      else if (shouldDrive && error < 0) { input.press(minus); input.release(plus); }
      else { input.release(plus); input.release(minus); }
      runFrames(1);
    }
    input.release(plus); input.release(minus);
    return false;
  }

  const slewTo = (angle) => driveAxis({
    get: () => state.slew, getVel: () => state.slewVel,
    maxVel: CRANE.slewRate, accel: CRANE.slewAccel,
    plus: "slewRight", minus: "slewLeft", target: angle, tol: 0.012, wrap: true,
  });
  const trolleyTo = (radius) => driveAxis({
    get: () => state.radius, getVel: () => state.radiusVel,
    maxVel: CRANE.trolleyRate, accel: CRANE.trolleyAccel,
    plus: "trolleyOut", minus: "trolleyIn", target: radius, tol: 0.12,
  });
  const hoistTo = (height) => driveAxis({
    get: () => state.hookY, getVel: () => state.hoistVel,
    maxVel: CRANE.hoistRate, accel: CRANE.hoistAccel,
    plus: "hoistUp", minus: "hoistDown", target: height, tol: 0.12,
  });

  const bearingOf = (x, z) => Math.atan2(-(z - CRANE.z), x - CRANE.x);
  const radiusOf = (x, z) => Math.hypot(x - CRANE.x, z - CRANE.z);

  const lift = lifts[0];

  // --- rig the load ---
  releaseAll();
  slewTo(bearingOf(lift.pick.x, lift.pick.z));
  trolleyTo(radiusOf(lift.pick.x, lift.pick.z));
  const hook = hookWorldPosition();
  const overPick = Math.hypot(hook.x - lift.pick.x, hook.z - lift.pick.z);
  check("the crane can be driven precisely over the pick point", overPick < 2.4,
    `${overPick.toFixed(2)} m off`);

  hoistTo(1.9 + lift.size.y * 0.5);
  input.tap("attachRelease");
  runFrames(4);
  check("the load can be rigged to the hook", state.attached === lift,
    `attached=${state.attached?.id || "none"}`);

  hoistTo(16);
  check("the rigged load lifts clear of the ground", state.hookY > 14, `${state.hookY.toFixed(2)}`);

  // --- the exclusion zones must actually bite on a careless path ---
  const violationsBefore = state.violations;
  slewTo(bearingOf(8, -6));          // straight over the steel fixers
  trolleyTo(10);
  runFrames(40);
  check("swinging a load over an exclusion zone is penalised",
    state.violations > violationsBefore, `${violationsBefore} → ${state.violations}`);

  // --- now travel the planned way: slew the long way round, clear of
  //     every zone, then come back out to the landing radius ---
  const safeRadius = 21.5;
  trolleyTo(safeRadius);
  const targetBearing = bearingOf(lift.target.x, lift.target.z);
  // Step round in the direction that keeps the load outside every zone.
  const stops = [1.0, 1.6, 2.2, 2.8, 3.4, 3.9, targetBearing + Math.PI * 2];
  for (const stop of stops) slewTo(stop);
  slewTo(targetBearing);
  trolleyTo(radiusOf(lift.target.x, lift.target.z));
  hoistTo(lift.targetY + 1.9 + lift.size.y * 0.1);

  // Let the pendulum settle, which the game requires before release.
  releaseAll();
  for (let i = 0; i < 900 && state.swingVel.length() > 0.15; i++) runFrames(1);
  check("the load swing settles when the controls are still",
    state.swingVel.length() < 0.55, `${state.swingVel.length().toFixed(3)} m/s`);

  const load = loadWorldPosition();
  const overTarget = Math.hypot(load.x - lift.target.x, load.z - lift.target.z);
  check("the load can be brought over the target", overTarget < 2.6, `${overTarget.toFixed(2)} m off`);

  const liftsBefore = state.liftsDone;
  input.tap("attachRelease");
  runFrames(4);
  check("the load can be released onto the target", state.liftsDone === liftsBefore + 1,
    `${state.liftsDone}`);
  check("the next lift is queued", state.liftIndex === 1, `${state.liftIndex}`);
  check("landing a load is scored", state.accuracyPoints > 0 || state.steadyPoints > 0,
    `accuracy=${state.accuracyPoints} steady=${state.steadyPoints}`);

  instance.dispose();
  check("game 2 disposes without throwing", true);
}

/* ================================================================ *
 *  Game 3 — build the tower
 * ================================================================ */

section("Build the Safest Tower — full audit");
{
  const { instance, record } = await boot("safestTower");
  const { state, slots, prerequisitesMet, selectSlot, placeSelected, setComponent } = instance.__test;

  runFrames(10);
  check("the build has 17 positions", slots.length === 17, `${slots.length}`);
  check("the palette is published to the HUD", (record.hud.palette?.items || []).length === 13,
    `${(record.hud.palette?.items || []).length}`);
  check("every position has a correct component", slots.every((s) => !!s.def.correct));
  check("at least five positions accept a plausible-but-wrong component",
    slots.filter((s) => s.def.plausible).length >= 5,
    `${slots.filter((s) => s.def.plausible).length}`);
  check("every plausible trap explains itself",
    slots.filter((s) => s.def.plausible).every((s) => !!s.def.plausibleWhy));

  // A wrong component must be refused and cost points.
  const firstSlot = slots[0];
  selectSlot(firstSlot);
  setComponent("extinguisher");               // not what a stair position needs
  placeSelected();
  check("a wrong component is refused", firstSlot.filled === null);
  check("a wrong component costs points", state.score < 0, `${state.score}`);
  check("a wrong component is counted", state.wrong === 1, `${state.wrong}`);

  // Now fill every position correctly, respecting prerequisites.
  let guard = 0;
  while (slots.some((s) => !s.filled) && guard < 100) {
    guard += 1;
    const next = slots.find((s) => !s.filled && prerequisitesMet(s.def))
      || slots.find((s) => !s.filled);
    selectSlot(next);
    setComponent(next.def.correct);
    placeSelected();
    runFrames(1);
  }
  check("every position can be filled", slots.every((s) => s.filled), `${slots.filter((s) => s.filled).length}/${slots.length}`);
  check("all positions are compliant when built correctly",
    slots.every((s) => s.compliant), `${slots.filter((s) => s.compliant).length} compliant`);
  check("prerequisites were satisfiable in order", state.sequenceMisses === 0, `${state.sequenceMisses} out of order`);

  runFrames(5);
  const result = record.finished;
  check("filling every position finishes the build", !!result && result.completed === true);
  if (result) {
    check("a correct build audits at 100% compliance", result.accuracy === 100, `${result.accuracy}%`);
    check("the audit reports no findings beyond the pass note",
      (result.lessons || []).length === 1, JSON.stringify(result.lessons));
    check("the build score is under the ceiling", result.score <= 12000, `${result.score}`);
  }

  instance.dispose();
  check("game 3 disposes without throwing", true);
}

section("Build the Safest Tower — a tower that only looks finished");
{
  const { instance, record } = await boot("safestTower");
  const { slots, prerequisitesMet, selectSlot, placeSelected, setComponent } = instance.__test;
  runFrames(5);

  // Fill every position, choosing the plausible option wherever one
  // exists. The building will look complete and must still fail.
  let guard = 0;
  while (slots.some((s) => !s.filled) && guard < 100) {
    guard += 1;
    const next = slots.find((s) => !s.filled && prerequisitesMet(s.def)) || slots.find((s) => !s.filled);
    selectSlot(next);
    setComponent(next.def.plausible || next.def.correct);
    placeSelected();
    runFrames(1);
  }
  runFrames(5);
  const result = record.finished;
  check("the 'looks finished' build still completes", !!result);
  if (result) {
    check("a tower that only looks finished does NOT score 100%", result.accuracy < 100, `${result.accuracy}%`);
    check("the audit lists what is actually wrong", (result.lessons || []).length > 1,
      `${(result.lessons || []).length} findings`);
    check("the audit counts the questionable items",
      (result.stats?.lookedFinished || 0) > 0, JSON.stringify(result.stats));
  }
  instance.dispose();
}

/* ================================================================ *
 *  Game 4 — escape
 * ================================================================ */

section("Safety Escape Challenge — escape the building");
{
  const { instance, record } = await boot("escapeChallenge");
  const input = instance.input;
  const { state, controller, interactables, doors } = instance.__test;

  runFrames(10);
  check("there are 7 areas to clear", interactables.length === 7, `${interactables.length}`);
  check("there are 7 doors", doors.length === 7, `${doors.length}`);
  check("every door starts locked", doors.every((d) => d.locked));

  // Movement works inside the building.
  const spawn = controller.position.clone();
  input.setJoystick(0, 1);
  runFrames(45);
  input.setJoystick(0, 0);
  check("the player can walk inside the building", controller.position.distanceTo(spawn) > 1,
    `moved ${controller.position.distanceTo(spawn).toFixed(2)} m`);

  // Walk into a wall and confirm it holds.
  controller.teleport(-5, 0, 0, Math.PI / 2);  // facing -x at the west wall
  input.setJoystick(0, 1);
  runFrames(120);
  input.setJoystick(0, 0);
  check("interior walls stop the player", controller.position.x > -6.6,
    `x=${controller.position.x.toFixed(2)}`);

  // Solve every area.
  let solved = 0;
  for (const item of interactables) {
    controller.teleport(item.position.x, 0, item.position.z + 1.4, 0);
    controller.state.pitch = 0;
    runFrames(3);

    if (state.target?.kind !== "puzzle" || state.target.item !== item) {
      check(`area "${item.key}" becomes interactable`, false,
        `target=${state.target?.kind}/${state.target?.item?.key || state.target?.door?.roomKey}`);
      continue;
    }
    input.press("interact");
    runFrames(2);
    input.release("interact");
    runFrames(2);

    const dialog = record.dialog;
    if (!dialog) {
      check(`area "${item.key}" opens its puzzle`, false);
      continue;
    }
    // The dialog carries only ids, so match against the known answers.
    const correct = dialog.options.find((o) => o.id === ESCAPE_CORRECT[item.key]);
    if (!correct) {
      check(`area "${item.key}" offers its correct option`, false,
        JSON.stringify(dialog.options.map((o) => o.id)));
      continue;
    }
    dialog.onPick(correct.id);
    runFrames(3);
    solved += 1;
  }

  check("all 7 areas can be solved", solved === 7, `${solved}/7`);
  check("solving an area unlocks its door", doors.every((d) => !d.locked),
    `${doors.filter((d) => d.locked).length} still locked`);
  check("no wrong decisions were recorded on a perfect run", state.mistakes === 0, `${state.mistakes}`);

  // Use the final door to escape.
  const finalDoor = doors[doors.length - 1];
  controller.teleport(finalDoor.position.x - 1.6, 0, finalDoor.position.z, -Math.PI / 2);
  controller.state.pitch = 0;
  runFrames(3);
  check("the final door becomes usable", state.target?.kind === "door" && state.target.door === finalDoor,
    `target=${state.target?.kind}`);
  input.press("interact");
  runFrames(2);
  input.release("interact");
  runFrames(5);

  const result = record.finished;
  check("using the final door escapes the building", !!result && result.completed === true,
    JSON.stringify(result && { completed: result.completed, escaped: result.stats?.escaped }));
  if (result) {
    check("escaping scores the escape bonus", result.score > 1500, `${result.score}`);
    check("a flawless escape rates 100%", result.performance === 100, `${result.performance}`);
    check("the escape result is under the ceiling", result.score <= 12000, `${result.score}`);
  }

  instance.dispose();
  check("game 4 disposes without throwing", true);
}

/* ================================================================ *
 *  Game 5 — command the incident
 * ================================================================ */

section("Emergency Response Commander — command the incident");
{
  const { instance, record } = await boot("emergencyCommander");
  const { state, scenario, crowd, currentOptions } = instance.__test;

  check("a scenario was selected", !!scenario?.steps?.length, scenario?.id);
  check("the scenario has all 8 response steps", scenario.steps.length === 8, `${scenario.steps.length}`);
  check("every step has exactly one best option",
    scenario.steps.every((s) => s.options.filter((o) => o.correct).length === 1));
  check("every option explains itself", scenario.steps.every((s) => s.options.every((o) => !!o.feedback)));

  // The brief shows first, then the first decision opens on a timer.
  runFrames(5);
  check("the incident brief is shown first", record.dialogs[0]?.eyebrow === "INCIDENT BRIEF");

  // Advance past the brief delay.
  await new Promise((resolve) => setTimeout(resolve, 2700));
  runFrames(5);
  check("the first decision opens after the brief", state.dialogOpen === true);

  const casualtyStart = state.casualty;
  let decided = 0;
  for (let step = 0; step < scenario.steps.length; step++) {
    // Wait for the dialog (there is a 1.4s beat between decisions).
    for (let wait = 0; wait < 40 && !state.dialogOpen; wait++) {
      await new Promise((resolve) => setTimeout(resolve, 60));
      runFrames(4);
    }
    if (!state.dialogOpen) break;
    const options = currentOptions();
    const best = options.find((o) => o.correct);
    if (!best) break;
    record.dialog.onPick(best.id);
    decided += 1;
    runFrames(4);
  }

  check("all 8 steps can be decided", decided === 8, `${decided}/8`);
  check("best decisions were counted", state.best === 8, `${state.best}`);
  check("no decision clocks were missed", state.timeouts === 0, `${state.timeouts}`);
  check("the alarm was raised during the response", state.alarmRaised === true);
  check("the area was isolated", state.isolated === true);
  check("the emergency services were called", state.servicesCalled === true);
  check("the casualty's condition did not fall", state.casualty >= casualtyStart,
    `${casualtyStart} → ${state.casualty}`);

  // The workforce should actually walk to the muster point. They start
  // spread across the site, so this is tens of seconds of walking.
  runFrames(2400);
  const arrived = crowd.filter((p) => p.arrived).length;
  check("the workforce evacuates to the muster point", arrived > crowd.length / 2,
    `${arrived}/${crowd.length} arrived`);

  runFrames(10);
  const result = record.finished;
  check("deciding every step completes the response", !!result && result.completed === true);
  if (result) {
    check("a textbook response saves the casualty", (result.stats?.casualties || 0) === 0,
      JSON.stringify(result.stats));
    check("a textbook response rates highly", result.performance >= 85, `${result.performance}`);
    check("the response score is under the ceiling", result.score <= 12000, `${result.score}`);
  }

  instance.dispose();
  check("game 5 disposes without throwing", true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  - ${f}`));
}
uninstallDom();
process.exit(fail ? 1 : 0);
