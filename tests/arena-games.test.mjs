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
  electrical: "isolate",
  ppe: "full",
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
 *  Zoom — every game, desktop wheel AND phone pinch
 * ================================================================ */

section("Zoom works in all five games");

{
  for (const [path, id] of GAMES) {
    const { instance, record } = await boot(path);
    const input = instance.input;
    runFrames(10);

    // Both the wheel and a pinch arrive through the same channel, so
    // testing addZoom proves the touch path too.
    check(`${id}: the input object accepts a pinch`, typeof input.addZoom === "function");

    const cam = instance.__test?.camera || null;
    // Capture whatever "how close am I" means for this game: a
    // first-person/cab game narrows its FOV, an orbit game pulls in.
    const before = {
      fov: instance.__test?.zoomFov?.() ?? null,
      distance: instance.__test?.camDistance?.() ?? null,
    };

    input.addZoom(-600);        // a firm zoom IN
    runFrames(40);

    const after = {
      fov: instance.__test?.zoomFov?.() ?? null,
      distance: instance.__test?.camDistance?.() ?? null,
    };

    const movedFov = before.fov !== null && after.fov !== null && after.fov < before.fov - 0.5;
    const movedDist = before.distance !== null && after.distance !== null
      && after.distance < before.distance - 0.5;

    check(`${id}: zooming in actually moves the view closer`, movedFov || movedDist,
      `fov ${before.fov}→${after.fov}  distance ${before.distance}→${after.distance}`);

    // Every game must advertise zoom on BOTH control lists, or players
    // on a phone will never discover it.
    const mod = (await import(`${SRC}/games/${path}/index.js`));
    const meta = mod.default || mod;
    const hasDesktopZoom = (meta.desktopControls || []).some(([, d]) => /zoom/i.test(d));
    const hasMobileZoom = (meta.mobileControls || []).some(([k, d]) => /zoom|pinch/i.test(k + d));
    check(`${id}: zoom is documented for desktop`, hasDesktopZoom);
    check(`${id}: zoom is documented for mobile`, hasMobileZoom);

    // And a ZOOM action button exists for thumbs.
    check(`${id}: there is a ZOOM action button`,
      record.buttons.some((b) => /zoom/i.test(b.label)) || /zoom/i.test(JSON.stringify(record.hud.keyHints || [])),
      JSON.stringify(record.buttons.map((b) => b.label)));

    instance.dispose();
  }
}

/* ================================================================ *
 *  The top view — every game, in both directions
 *
 *  The player has to be able to lift off the ground, see the whole
 *  site and the finished towers, swing around them, and come back
 *  down to exactly where they were. Checked by reading the REAL
 *  camera the renderer is handed, not a flag on the game.
 * ================================================================ */

/* ================================================================ *
 *  The built-in mission demo
 *
 *  Each game ships a shot list through its own scene, which the demo
 *  player hands to the site view. Nothing in a playthrough touches it,
 *  so without this section a broken tour would reach the event.
 * ================================================================ */

section("Every mission has a working built-in demo");

{
  const briefs = await import(`${new URL("../src/missionBriefs.js", import.meta.url).href}`);
  const { tourSeconds } = await import(`${SRC}/engine/demoTour.js`);

  for (const [path, id] of GAMES) {
    const { instance } = await boot(path);
    runFrames(10);

    const tour = instance.demoTour || [];
    check(`${id}: the mission exposes its site view to the demo`,
      !!instance.siteView && typeof instance.siteView.playTour === "function");
    check(`${id}: the mission has a shot list`, tour.length >= 4, `${tour.length} shots`);

    // Every shot must be real numbers, or the camera ends up at NaN and
    // the screen goes black with no error.
    const broken = tour.filter((sh) => !sh
      || !Array.isArray(sh.center) || sh.center.length !== 3
      || sh.center.some((v) => !Number.isFinite(v))
      || ![sh.yaw, sh.pitch, sh.distance, sh.seconds].every(Number.isFinite)
      || sh.distance <= 0 || sh.seconds <= 0);
    check(`${id}: every shot is a real camera pose`, broken.length === 0,
      JSON.stringify(broken.slice(0, 2)));

    // A caption index the briefing does not have shows a blank caption.
    // The 3D layer and the briefing text are separate files, so this is
    // the only thing holding them together.
    const steps = briefs.missionBrief(id, "en")?.steps || [];
    const outOfRange = tour
      .map((sh, i) => ({ i, step: sh.step }))
      .filter((e) => !Number.isFinite(e.step) || e.step < 0 || e.step >= steps.length);
    check(`${id}: every shot points at a briefing step that exists`,
      outOfRange.length === 0,
      `${steps.length} steps, bad: ${JSON.stringify(outOfRange)}`);

    // Same in Tamil, because a translation with fewer steps would blank
    // the captions for exactly the audience that needs them.
    const taSteps = briefs.missionBrief(id, "ta")?.steps || [];
    check(`${id}: the Tamil briefing has a caption for every shot`,
      tour.every((sh) => sh.step < taSteps.length),
      `${taSteps.length} Tamil steps vs ${steps.length} English`);

    const runtime = tourSeconds(tour);
    check(`${id}: the demo is long enough to be useful and short enough to watch`,
      runtime >= 25 && runtime <= 90, `${runtime}s`);

    /* ---- now actually fly it ---- */
    const camera = lastRenderer?.lastCamera;
    const fired = [];
    let ended = false;
    const started = instance.siteView.playTour(tour, {
      onStep: (i) => fired.push(i),
      onEnd: () => { ended = true; },
    });
    check(`${id}: the tour starts`, started);

    const seen = [];
    const frames = Math.ceil(runtime * 60) + 180;
    let nan = false;
    for (let f = 0; f < frames; f++) {
      runFrames(1);
      if (camera && !Number.isFinite(camera.position.x + camera.position.y + camera.position.z)) nan = true;
      if (f % 30 === 0 && camera) {
        seen.push([camera.position.x, camera.position.y, camera.position.z]
          .map((v) => Math.round(v)).join(","));
      }
    }

    check(`${id}: the camera never goes to NaN during the tour`, !nan);
    check(`${id}: every shot in the list is reached`, fired.length === tour.length,
      `${fired.length} of ${tour.length}`);
    check(`${id}: the shots are played in order`,
      fired.every((v, i) => v === i), fired.join(","));
    check(`${id}: the camera actually moves through the scene`,
      new Set(seen).size > 8, `${new Set(seen).size} distinct positions`);
    check(`${id}: the tour finishes and hands the camera back`,
      ended && !instance.siteView.touring);

    // Stopping half way must not leave the camera stuck overhead.
    instance.siteView.playTour(tour);
    runFrames(40);
    instance.siteView.stopTour();
    runFrames(90);
    check(`${id}: stopping the demo returns the camera to the game`,
      !instance.siteView.touring && !instance.siteView.active);

    instance.dispose();
  }
}

section("The top view works in all five games");

{
  for (const [path, id] of GAMES) {
    const { instance, record } = await boot(path);
    const input = instance.input;
    runFrames(20);

    const camera = lastRenderer?.lastCamera || null;
    const scene = lastRenderer?.lastScene || null;
    check(`${id}: the test can see the real camera`, !!camera);
    if (!camera) { instance.dispose(); continue; }

    const ground = {
      y: camera.position.y,
      far: camera.far,
      fogNear: scene?.fog ? scene.fog.near : null,
      fogFar: scene?.fog ? scene.fog.far : null,
    };

    // --- up ---
    input.press("topview");
    runFrames(90);

    const up = { y: camera.position.y, far: camera.far };
    check(`${id}: the top view actually lifts the camera`, up.y > ground.y + 20,
      `${ground.y.toFixed(1)} m → ${up.y.toFixed(1)} m`);

    // Looking DOWN at the site, not off at the horizon.
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    check(`${id}: the top view looks down at the site`, dir.y < -0.35,
      `camera.y direction ${dir.y.toFixed(2)}`);

    // The far plane has to reach the far side of the site, or the view
    // is a wall of fog with the towers missing.
    check(`${id}: the far plane opens up for the aerial`, up.far >= ground.far,
      `${ground.far} → ${up.far}`);
    check(`${id}: the far plane reaches past the camera height`,
      up.far > up.y * 1.8, `far ${up.far.toFixed(0)} vs height ${up.y.toFixed(0)}`);
    if (scene?.fog) {
      check(`${id}: the fog is pushed back for the aerial`,
        scene.fog.far > ground.fogFar, `${ground.fogFar.toFixed(0)} → ${scene.fog.far.toFixed(0)}`);
    }

    // --- swing around it ---
    const beforeSwing = camera.position.clone();
    input.addLook(260, 0);
    runFrames(30);
    check(`${id}: the aerial can be swung around the site`,
      camera.position.distanceTo(beforeSwing) > 4,
      `moved ${camera.position.distanceTo(beforeSwing).toFixed(1)} m`);

    // Still above the site after swinging, not flung off somewhere.
    check(`${id}: swinging keeps the camera above the site`,
      camera.position.y > ground.y + 20 && Number.isFinite(camera.position.x),
      `y=${camera.position.y.toFixed(1)}`);

    // --- and back down ---
    input.press("topview");
    runFrames(140);

    check(`${id}: leaving the top view returns to ground level`,
      Math.abs(camera.position.y - ground.y) < 6,
      `${up.y.toFixed(1)} m → ${camera.position.y.toFixed(1)} m (was ${ground.y.toFixed(1)})`);
    check(`${id}: the far plane is restored`, Math.abs(camera.far - ground.far) < 0.01,
      `${camera.far} vs ${ground.far}`);
    if (scene?.fog) {
      check(`${id}: the fog is restored`,
        Math.abs(scene.fog.far - ground.fogFar) < 0.01,
        `${scene.fog.far} vs ${ground.fogFar}`);
    }

    // Discoverable: a button for thumbs, a key for desktop, and it has
    // to be written down on BOTH control lists or nobody finds it.
    const hasButton = record.buttons.some((b) => /top view|plan view/i.test(b.label));
    check(`${id}: there is a TOP VIEW action button`, hasButton,
      JSON.stringify(record.buttons.map((b) => b.label)));

    const mod = await import(`${SRC}/games/${path}/index.js`);
    const meta2 = mod.default || mod;

    // The stick is in every mission now, so every mission has to say so
    // on the phone list — it is the primary control on a phone and it
    // is invisible until you touch it.
    check(`${id}: the joystick is documented for mobile`,
      (meta2.mobileControls || []).some(([k, d]) => /joystick/i.test(k + d)),
      JSON.stringify((meta2.mobileControls || []).map(([k]) => k)));

    const rx = /top view|plan view/i;
    check(`${id}: the top view is documented for desktop`,
      (meta2.desktopControls || []).some(([k, d]) => rx.test(k + d)));
    check(`${id}: the top view is documented for mobile`,
      (meta2.mobileControls || []).some(([k, d]) => rx.test(k + d)));

    instance.dispose();
  }
}

/* ----------------------------------------------------------------- *
 *  The escape game is INDOORS, so its overhead view is only useful if
 *  the ceilings come off. Without that it is a view of the top of a
 *  plasterboard lid.
 * ----------------------------------------------------------------- */

{
  const { instance } = await boot("escapeChallenge");
  const t = instance.__test;
  runFrames(20);

  check("escape: the floor has ceilings to begin with",
    (t.ceilings || []).length >= 5 && t.ceilings.every((c) => c.visible),
    `${(t.ceilings || []).length} ceilings`);

  instance.input.press("topview");
  runFrames(90);

  check("escape: the plan view cuts the ceilings away",
    t.ceilings.every((c) => !c.visible));

  instance.input.press("topview");
  runFrames(140);

  check("escape: the ceilings come back on the way down",
    t.ceilings.every((c) => c.visible) && t.planBlend === 0,
    `blend=${t.planBlend}`);

  instance.dispose();
}

/* ================================================================ *
 *  Scene content and transform sanity
 * ================================================================ */

section("An excavation is a visible hole, not a hidden pit");

{
  /* The ground used to be one solid plane across the whole site, so an
   * excavation built below grade was covered like a lid: the player saw
   * flat earth and then fell into a trench that was never drawn. The
   * ground now has the footprint punched out of it. */
  const kit = await import(`${SRC}/engine/kit.js`);
  const container = makeElement("div", { width: 800, height: 600 });
  const stage = gfx.createStage(container, { quality: "medium", fov: 70 });
  const mat = kit.createMaterials(stage.cfg);

  const HOLE = { x: 18, z: 24, w: 9, d: 4.5 };
  const solid = kit.buildGround(mat, 260);
  const holed = kit.buildGround(mat, 260, { holes: [HOLE] });

  /** Fires a ray straight DOWN from high above and reports a ground hit. */
  function hitsGround(groundGroup, x, z) {
    const ray = new THREE.Raycaster(
      new THREE.Vector3(x, 60, z), new THREE.Vector3(0, -1, 0), 0.1, 300);
    groundGroup.updateMatrixWorld(true);
    return ray.intersectObject(groundGroup, true).length > 0;
  }

  check("the old solid ground covers the excavation footprint",
    hitsGround(solid, HOLE.x, HOLE.z),
    "a plain ground sheet should cover everything — baseline for the fix");
  check("ground is still solid away from the excavation",
    hitsGround(holed, 0, 0));
  check("the excavation footprint is genuinely OPEN in the ground",
    !hitsGround(holed, HOLE.x, HOLE.z),
    "the trench is still hidden under the ground sheet");
  check("the open area matches the trench, not the whole site",
    !hitsGround(holed, HOLE.x, HOLE.z)
    && hitsGround(holed, HOLE.x + HOLE.w, HOLE.z)
    && hitsGround(holed, HOLE.x, HOLE.z + HOLE.d));

  // And the real mission must actually punch its own hole.
  const ctx = await boot("safetyMission");
  runFrames(5);
  const scene = ctx.instance.__test?.scene;
  const ground = scene && scene.getObjectByName("ground");
  check("Safety Mission builds its ground with a hole",
    !!ground && ground.geometry.type === "ShapeGeometry",
    ground ? ground.geometry.type : "no ground found");
  if (ground) {
    scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(18, 60, 24), new THREE.Vector3(0, -1, 0), 0.1, 300);
    check("you can see down into the Safety Mission trench",
      ray.intersectObject(ground, true).length === 0,
      "the ground still covers the trench");
  }
  ctx.instance.dispose();
  stage.dispose();
}



/* ================================================================ *
 *  People, and moving them
 *
 *  Every mission is now played by a person you can see and steer.
 *  These check the figure is actually built as a skeleton, that the
 *  walk cycle moves it, and that the joystick does something in all
 *  five games — including the crane, where the stick IS the crane
 *  joystick rather than a pair of legs.
 * ================================================================ */

section("The worker is a person, not a pile of boxes");

{
  const kit = await import(`${SRC}/engine/kit.js`);
  const container = makeElement("div", { width: 800, height: 600 });
  const stage = gfx.createStage(container, { quality: "medium", fov: 70 });
  const mat = kit.createMaterials(stage.cfg);
  const geo = kit.createGeometries(stage.cfg);

  const person = kit.buildWorker(geo, mat, {});
  const rig = person.userData.rig;

  check("the figure has a skeleton, not just meshes",
    !!rig && ["hips", "spine", "neck", "head", "legL", "legR", "armL", "armR"]
      .every((j) => !!rig[j]),
    Object.keys(rig || {}).join(", "));
  check("the legs have knees and the arms have elbows",
    !!rig.legL.userData.knee && !!rig.legR.userData.knee
    && !!rig.armL.userData.elbow && !!rig.armR.userData.elbow);

  // The PPE flags are what three games inspect to score a hazard.
  check("the PPE state survives the rebuild",
    person.userData.worker.helmet === true && person.userData.worker.vest === true);
  const bare = kit.buildWorker(geo, mat, { helmet: false, vest: false });
  check("a worker with no PPE still reports it",
    bare.userData.worker.helmet === false && bare.userData.worker.vest === false);

  const box3 = new THREE.Box3().setFromObject(person);
  check("the figure is a believable height", box3.max.y > 1.7 && box3.max.y < 2.0,
    `${box3.max.y.toFixed(2)} m`);
  check("the figure is a believable width",
    (box3.max.x - box3.min.x) > 0.4 && (box3.max.x - box3.min.x) < 0.8,
    `${(box3.max.x - box3.min.x).toFixed(2)} m`);
  check("the figure stands on the ground, not in it",
    Math.abs(box3.min.y) < 0.05, `feet at ${box3.min.y.toFixed(3)}`);

  /* ---- the walk ---- */
  const standing = rig.legL.rotation.x;
  kit.poseWorker(person, { phase: Math.PI / 2, moving: true });
  const strideA = { l: rig.legL.rotation.x, r: rig.legR.rotation.x, arm: rig.armL.rotation.x };
  kit.poseWorker(person, { phase: (Math.PI * 3) / 2, moving: true });
  const strideB = { l: rig.legL.rotation.x, r: rig.legR.rotation.x, arm: rig.armL.rotation.x };

  check("walking moves the legs", Math.abs(strideA.l - standing) > 0.3,
    `${standing.toFixed(2)} → ${strideA.l.toFixed(2)}`);
  check("the legs swing in opposition", strideA.l * strideA.r < 0,
    `${strideA.l.toFixed(2)} / ${strideA.r.toFixed(2)}`);
  check("the opposite arm swings with each leg", strideA.l * strideA.arm < 0,
    `leg ${strideA.l.toFixed(2)} arm ${strideA.arm.toFixed(2)}`);
  check("the stride reverses over the cycle", strideA.l * strideB.l < 0,
    `${strideA.l.toFixed(2)} → ${strideB.l.toFixed(2)}`);
  check("knees only bend one way",
    rig.legL.userData.knee.rotation.x <= 0 && rig.legR.userData.knee.rotation.x <= 0,
    `${rig.legL.userData.knee.rotation.x.toFixed(2)} / ${rig.legR.userData.knee.rotation.x.toFixed(2)}`);

  kit.poseWorker(person, { moving: false, pose: "stand" });
  check("standing still puts the legs back under the body",
    Math.abs(rig.legL.rotation.x) < 0.1 && Math.abs(rig.legR.rotation.x) < 0.1);

  /* ---- the safety officer must be tellable from the crew ---- */
  const officer = kit.buildWorker(geo, mat, { role: "officer" });
  const crew = kit.buildWorker(geo, mat, {});
  const matsOf = (o) => { const set = new Set(); o.traverse((c) => { if (c.isMesh) set.add(c.material); }); return set; };
  const officerMats = matsOf(officer);
  const crewMats = matsOf(crew);
  check("the safety officer is visually distinct from the crew",
    [...officerMats].filter((m) => !crewMats.has(m)).length >= 2,
    `${[...officerMats].filter((m) => !crewMats.has(m)).length} materials differ`);
  check("the officer carries a clipboard", !!officer.userData.rig.armL.userData.board);
  check("the role is recorded on the figure",
    officer.userData.role === "officer" && crew.userData.role === "worker");

  /* ---- running is not just a fast walk ---- */
  kit.poseWorker(person, { phase: Math.PI / 2, moving: true, running: false });
  const walkStride = rig.legL.rotation.x;
  const walkLean = rig.spine.rotation.x;
  kit.poseWorker(person, { phase: Math.PI / 2, moving: true, running: true });
  check("running opens the stride", Math.abs(rig.legL.rotation.x) > Math.abs(walkStride) * 1.3,
    `${walkStride.toFixed(2)} → ${rig.legL.rotation.x.toFixed(2)}`);
  check("running leans the body into it", rig.spine.rotation.x > walkLean + 0.1,
    `${walkLean.toFixed(2)} → ${rig.spine.rotation.x.toFixed(2)}`);
  check("running bends the arms up", rig.armL.userData.elbow.rotation.x < -1,
    `${rig.armL.userData.elbow.rotation.x.toFixed(2)}`);

  /* ---- carrying keeps both hands on the load while walking ---- */
  kit.poseWorker(person, { phase: 0.4, moving: true, carrying: true });
  const carryL = rig.armL.rotation.x;
  kit.poseWorker(person, { phase: 2.4, moving: true, carrying: true });
  check("carrying holds the arms still while the legs walk",
    Math.abs(rig.armL.rotation.x - carryL) < 0.01 && Math.abs(rig.legL.rotation.x) > 0.1,
    `arms ${carryL.toFixed(2)}, legs ${rig.legL.rotation.x.toFixed(2)}`);

  // Every pose the games ask for must do something, or a figure meant
  // to be kneeling in a trench is just standing in it.
  const poses = ["stand", "work", "reach", "crouch", "kneel", "carry", "lift", "climb"];
  const hipHeights = poses.map((pose) => {
    kit.poseWorker(person, { pose, moving: false, phase: 1 });
    return `${pose}:${rig.hips.position.y.toFixed(2)}:${rig.armL.rotation.x.toFixed(2)}:${rig.legL.rotation.x.toFixed(2)}`;
  });
  check("every pose the games use is distinct",
    new Set(hipHeights).size === poses.length, hipHeights.join(" "));

  // The cheap variant for crowds must still be a working skeleton.
  const crowdMember = kit.buildWorker(geo, mat, { detail: "low" });
  check("the low-detail figure still has a full skeleton",
    !!crowdMember.userData.rig?.legL?.userData?.knee);
  const countMeshesIn = (o) => { let n = 0; o.traverse((c) => { if (c.isMesh) n++; }); return n; };
  check("the low-detail figure is meaningfully cheaper",
    countMeshesIn(crowdMember) < countMeshesIn(person) * 0.75,
    `${countMeshesIn(crowdMember)} vs ${countMeshesIn(person)} meshes`);

  check("poseWorker ignores something that is not a worker",
    (() => { try { kit.poseWorker(null, {}); kit.poseWorker({}, {}); return true; } catch { return false; } })());

  stage.dispose();
}

section("Every mission is driven by a joystick");

{
  // What "the stick did something" means per mission: the walking
  // games move a body, the crane moves the crane.
  const PROBES = {
    "safetyMission": (t) => t.controller.position.clone(),
    "escapeChallenge": (t) => t.controller.position.clone(),
    "safestTower": (t) => t.walker.position.clone(),
    "emergencyCommander": (t) => t.walker.position.clone(),
    "craneMaster": (t) => ({ slew: t.state.slew, radius: t.state.radius }),
  };

  for (const [path, id] of GAMES) {
    const { instance } = await boot(path);
    const t = instance.__test;
    runFrames(20);

    const before = PROBES[path](t);
    instance.input.setJoystick(0.9, 0.9);
    runFrames(70);
    instance.input.setJoystick(0, 0);
    const after = PROBES[path](t);

    if (path === "craneMaster") {
      check(`${id}: the joystick slews the jib`,
        Math.abs(after.slew - before.slew) > 0.01,
        `${before.slew.toFixed(3)} → ${after.slew.toFixed(3)}`);
      check(`${id}: the joystick runs the trolley`,
        Math.abs(after.radius - before.radius) > 0.05,
        `radius ${before.radius.toFixed(2)} → ${after.radius.toFixed(2)}`);
    } else {
      const moved = before.distanceTo(after);
      check(`${id}: the joystick walks the player`, moved > 1,
        `moved ${moved.toFixed(2)} m`);
      check(`${id}: the player stays on the ground`, Math.abs(after.y) < 2,
        `y = ${after.y.toFixed(2)}`);
      check(`${id}: the player never reaches NaN`,
        Number.isFinite(after.x + after.y + after.z));
    }

    instance.dispose();
  }
}

section("You can see the person you are playing");

{
  for (const path of ["safetyMission", "escapeChallenge", "safestTower", "emergencyCommander"]) {
    const { instance } = await boot(path);
    const t = instance.__test;
    runFrames(20);

    check(`${path}: there is an avatar in the scene`, !!t.avatar?.userData?.rig);

    // In the two orbit games the avatar is always on screen; in the two
    // first-person games it appears when you look over your shoulder.
    const controller = t.controller;
    if (controller) {
      check(`${path}: the avatar is hidden in first person`, t.avatar.visible === false);
      const eye = lastRenderer.lastCamera.position.clone();
      controller.setThirdPerson(true);
      runFrames(10);
      check(`${path}: switching view shows the body`, t.avatar.visible === true);
      check(`${path}: the camera pulls back off the player`,
        lastRenderer.lastCamera.position.distanceTo(eye) > 0.8,
        `moved ${lastRenderer.lastCamera.position.distanceTo(eye).toFixed(2)} m`);
      check(`${path}: the avatar stands where the player is`,
        t.avatar.position.distanceTo(controller.position) < 0.01);
      controller.setThirdPerson(false);
      runFrames(10);
      check(`${path}: switching back hides the body again`, t.avatar.visible === false);
    } else {
      check(`${path}: the avatar is on screen`, t.avatar.visible === true);
      check(`${path}: the avatar stands where the walker is`,
        t.avatar.position.distanceTo(t.walker.position) < 0.01);
    }

    // And it must walk rather than slide. The first-person games only
    // pose the body while it is actually on screen — there is no point
    // animating something nobody can see — so look at it first.
    if (controller) controller.setThirdPerson(true);
    runFrames(5);
    const legBefore = t.avatar.userData.rig.legL.rotation.x;
    instance.input.setJoystick(0, 1);
    runFrames(40);
    instance.input.setJoystick(0, 0);
    check(`${path}: the avatar's legs move as it walks`,
      Math.abs(t.avatar.userData.rig.legL.rotation.x - legBefore) > 0.05,
      `${legBefore.toFixed(3)} → ${t.avatar.userData.rig.legL.rotation.x.toFixed(3)}`);

    instance.dispose();
  }
}
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
 *  The Casagrand Aria development
 *
 *  It is scenery, so no playthrough touches it — which means without
 *  this section a broken development would never fail a test. It has
 *  to be VISIBLE (inside the far plane, clear of the fog, not hidden
 *  behind the hoarding) in every game, or the branding is pointless.
 * ================================================================ */

section("The Casagrand Aria development is visible in every mission");

{
  const kit = await import(`${SRC}/engine/kit.js`);
  const container = makeElement("div", { width: 800, height: 600 });
  const stage = gfx.createStage(container, { quality: "medium", fov: 70 });
  const mat = kit.createMaterials(stage.cfg);
  const geo = kit.createGeometries(stage.cfg);

  const dev = kit.buildBrandedTower(geo, mat, { x: 0, z: -48 });
  const box = new THREE.Box3().setFromObject(dev.group);

  check("the development reports 19 floors", dev.floors === 19, `${dev.floors}`);
  check("it stands about 68 m tall", box.max.y > 60 && box.max.y < 80, `${box.max.y.toFixed(1)} m`);
  check("the ARIA mark is real geometry, not a texture", !!dev.ariaRing);

  // Three towers: each is a group with a shaft, fins, bands and a roof.
  const towers = dev.group.children[0].children.filter((c) => c.isGroup && c.children.length > 8);
  check("there are three towers", towers.length === 3, `${towers.length}`);
  check("the towers are stepped, not in a row",
    new Set(towers.map((t) => Math.round(t.position.z))).size === 3,
    towers.map((t) => t.position.z).join(", "));

  // The rooftop pool is what makes the overhead view recognisable.
  const poolMats = [];
  dev.group.traverse((o) => { if (o.isMesh && o.material === mat.poolWater) poolMats.push(o); });
  check("one tower has the rooftop pool", poolMats.length === 1, `${poolMats.length}`);

  // The sports courts from the aerial render.
  const courts = [];
  dev.group.traverse((o) => {
    if (o.isMesh && (o.material === mat.courtBlue || o.material === mat.courtRed)) courts.push(o);
  });
  check("both sports courts are laid out", courts.length === 2, `${courts.length}`);

  check("it stays cheap enough to be scenery", countMeshes(dev.group) < 90,
    `${countMeshes(dev.group)} meshes`);
  const devBad = findBadTransforms(dev.group);
  check("no NaN or Infinity anywhere in the development", devBad.length === 0,
    devBad.slice(0, 3).join(", "));

  // --- the part that actually matters: can the player SEE it? ---
  // Mirrors gfx.js: fog runs from drawDistance*0.35 to *0.85.
  const PLACEMENTS = [
    { id: "safety-mission", z: -48, hoardBack: -36 },
    { id: "crane-master", z: -56, hoardBack: -43 },
    { id: "safest-tower", z: -40, hoardBack: -27 },
    { id: "emergency-commander", z: -52, hoardBack: -40 },
  ];
  const FAR = { low: 200, medium: 300, high: 400 };

  PLACEMENTS.forEach((p) => {
    const d = kit.buildBrandedTower(geo, mat, { x: 0, z: p.z });
    const bb = new THREE.Box3().setFromObject(d.group);

    check(`${p.id}: the development clears the hoarding`, bb.max.z < p.hoardBack,
      `front edge ${bb.max.z.toFixed(0)} vs hoarding ${p.hoardBack}`);

    // Real world distances — the towers hang off an offset site group,
    // so their local .position.z is NOT their distance from the player.
    d.group.updateWorldMatrix(true, true);
    const towerZ = d.group.children[0].children
      .filter((c) => c.isGroup && c.children.length > 8)
      .map((c) => Math.abs(c.getWorldPosition(new THREE.Vector3()).z));
    const furthest = Math.max(...towerZ);
    const nearest = Math.min(...towerZ);

    Object.entries(FAR).forEach(([quality, far]) => {
      check(`${p.id}: nothing is clipped by the ${quality} far plane`,
        Math.abs(bb.min.z) < far, `${Math.abs(bb.min.z).toFixed(0)} vs far ${far}`);

      // Fog is wanted here — it gives the development aerial perspective.
      // What is not wanted is fog ERASING it, which is what happened when
      // the development sat out at z = -104.
      const fogAt = (dist) => Math.max(0, Math.min(1,
        (dist - far * 0.35) / (far * 0.85 - far * 0.35)));
      check(`${p.id}: the near tower is barely fogged on ${quality}`,
        fogAt(nearest) < 0.25, `${Math.round(fogAt(nearest) * 100)}% at ${nearest.toFixed(0)} m`);
      check(`${p.id}: the far tower still reads on ${quality}`,
        fogAt(furthest) < 0.5, `${Math.round(fogAt(furthest) * 100)}% at ${furthest.toFixed(0)} m`);
    });
  });

  stage.dispose();
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

const G3 = await import(`${SRC}/games/safestTower/hazards.js`);

section("Spot the Hazards — clearing the site correctly");
{
  const { instance, record } = await boot("safestTower");
  const { state, hazards, inspect, answer, HAZARD_COUNT } = instance.__test;

  runFrames(10);
  check("the walk-round has exactly 5 ground-level hazards",
    hazards.length === 5 && HAZARD_COUNT === 5, `${hazards.length}`);
  check("every hazard sits at ground level",
    hazards.every((h) => h.world.y === 0), "a hazard is off the ground");
  check("every hazard asks a question with 4 options",
    hazards.every((h) => h.def.options.length === 4));
  check("every hazard has exactly one correct option",
    hazards.every((h) => h.def.correct >= 0 && h.def.correct < 4));
  check("every hazard explains why", hazards.every((h) => (h.def.why || "").length > 40));
  check("every hazard names the control type",
    hazards.every((h) => ["eliminate", "engineer", "admin", "ppe"].includes(h.def.control)));
  check("the HUD lists the five hazards as tasks",
    (record.hud.tasks || []).length === 5, `${(record.hud.tasks || []).length}`);

  // --- a plausible-but-wrong answer must be refused and cost points ---
  const first = hazards[0];
  inspect(first);
  check("inspecting a hazard opens its question", !!record.dialog && record.dialog.title === first.def.title);
  const wrongIndex = [0, 1, 2, 3].find((i) => i !== first.def.correct);
  answer(first, wrongIndex);
  check("a wrong control does not solve the hazard", first.solved === false);
  check("a wrong control costs points", state.score < 0, `${state.score}`);
  check("the hazard object is still the unsafe one", first.fixed === null);
  check("the hazard is still flagged on site", first.flag.visible === true);

  // --- the correct answer rebuilds the hazard in its fixed form ---
  answer(first, first.def.correct);
  check("the correct control solves the hazard", first.solved === true);
  check("the fix is actually built on site", !!first.fixed);
  check("a solved hazard stops being flagged", first.flag.visible === false);
  check("a second attempt is worth less than first time",
    state.score === G3.SCORING.wrongAnswer + G3.SCORING.solvedAfterMiss, `${state.score}`);

  // --- clear the rest, all first time ---
  hazards.slice(1).forEach((h) => { inspect(h); answer(h, h.def.correct); runFrames(1); });
  check("every hazard can be cleared", hazards.every((h) => h.solved));
  check("four of five were cleared first time", state.firstTime === 4, `${state.firstTime}`);

  runFrames(5);
  const result = record.finished;
  check("clearing every hazard finishes the walk-round", !!result && result.completed === true);
  if (result) {
    check("accuracy reflects the one hazard that took two attempts",
      result.accuracy === 80, `${result.accuracy}%`);
    check("the debrief calls out the hazard that took two attempts",
      (result.lessons || []).length === 1 && result.lessons[0].includes("attempt 2"),
      JSON.stringify(result.lessons));
    check("the score stays under the Arena ceiling", result.score <= 12000, `${result.score}`);
    check("the debrief counts what was cleared",
      result.stats?.hazardsCleared === 5 && result.stats?.wrongAnswers === 1,
      JSON.stringify(result.stats));
  }

  instance.dispose();
  check("game 3 disposes without throwing", true);
}

section("Spot the Hazards — answering with the plausible option every time");
{
  const { instance, record } = await boot("safestTower");
  const { state, hazards, inspect, answer } = instance.__test;
  runFrames(5);

  // Pick a wrong-but-plausible control for every hazard. Nothing is
  // fixed, and the site must still be exactly as hazardous as it was.
  hazards.forEach((h) => {
    inspect(h);
    answer(h, [0, 1, 2, 3].find((i) => i !== h.def.correct));
    runFrames(1);
  });
  check("no hazard is controlled by a plausible answer", hazards.every((h) => !h.solved));
  check("every hazard is still flagged", hazards.every((h) => h.flag.visible));
  check("five wrong calls were counted", state.wrong === 5, `${state.wrong}`);
  check("the walk-round has not finished itself", !record.finished);

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
  check("there are 5 areas to clear", interactables.length === 5, `${interactables.length}`);
  check("there are 5 doors", doors.length === 5, `${doors.length}`);
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

  // Solve every area. The plant room is played out rather than
  // answered, so it is driven separately below.
  let solved = 0;
  for (const item of interactables) {
    if (item.manual) continue;
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

  check("four areas are solved by decision", solved === 4, `${solved}/4`);

  /* ---- the plant room is played out: carry an extinguisher to the fire ---- */
  {
    const { fire, extinguishers } = instance.__test;
    check("the plant room has a live fire", !!fire && fire.out === false);
    check("four extinguishers are on the rack", extinguishers.length === 4, `${extinguishers.length}`);
    check("the player starts empty handed", state.carrying === null);

    // Take the WRONG one first: water on live electrical gear.
    const water = extinguishers.find((e) => e.cls === "water");
    controller.teleport(water.position.x, 0, water.position.z + 1.2, 0);
    controller.state.pitch = 0;
    runFrames(3);
    check("an extinguisher on the rack can be picked up",
      state.target?.kind === "pickup", `target=${state.target?.kind}`);
    input.press("interact"); runFrames(2); input.release("interact"); runFrames(2);
    check("picking one up puts it in the player's hands", state.carrying?.cls === "water");

    // Carry it to the fire and discharge it.
    controller.teleport(fire.position.x - 2.2, 0, fire.position.z, -Math.PI / 2);
    controller.state.pitch = 0;
    runFrames(3);
    check("the fire can be discharged at once something is carried",
      state.target?.kind === "fire", `target=${state.target?.kind}`);
    input.press("interact"); runFrames(2); input.release("interact"); runFrames(4);
    check("water on live electrics does NOT put the fire out", fire.out === false);
    check("the wrong medium costs a mistake", state.mistakes === 1, `${state.mistakes}`);
    check("the spent extinguisher leaves the player's hands", state.carrying === null);

    // Now the right one.
    const co2 = extinguishers.find((e) => e.cls === "co2");
    controller.teleport(co2.position.x, 0, co2.position.z + 1.2, 0);
    controller.state.pitch = 0;
    runFrames(3);
    input.press("interact"); runFrames(2); input.release("interact"); runFrames(2);
    check("the CO2 extinguisher can be picked up", state.carrying?.cls === "co2");

    controller.teleport(fire.position.x - 2.2, 0, fire.position.z, -Math.PI / 2);
    controller.state.pitch = 0;
    runFrames(3);
    input.press("interact"); runFrames(2); input.release("interact");
    check("discharging starts a knock-down rather than finishing instantly",
      fire.discharging > 0 && fire.out === false);
    runFrames(180);
    check("sustained discharge puts the fire out", fire.out === true);
    check("the flames are gone from the scene", fire.flames.visible === false);
    check("putting the fire out clears the plant room", state.solved === 5, `${state.solved}`);
  }

  check("all 5 areas end up cleared", state.solved === 5, `${state.solved}/5`);
  check("solving an area unlocks its door", doors.every((d) => !d.locked),
    `${doors.filter((d) => d.locked).length} still locked`);
  check("the only mistake was the deliberate wrong extinguisher", state.mistakes === 1, `${state.mistakes}`);

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

  // Opening the final door is NOT the end — reaching the muster point is.
  check("opening the final door does not end the run on its own", !record.finished);
  check("the final door is reported open", state.doorsOpen === true);

  const { finishZone } = instance.__test;
  check("there is a marked finish zone in the yard", !!finishZone);

  // Standing outside it changes nothing.
  controller.teleport(finishZone.x - finishZone.half - 4, 0, finishZone.z, -Math.PI / 2);
  runFrames(5);
  check("standing short of the assembly area does not finish", !record.finished);

  // Walking into it does.
  controller.teleport(finishZone.x, 0, finishZone.z, -Math.PI / 2);
  runFrames(5);

  const result = record.finished;
  check("walking into the assembly area finishes the escape", !!result && result.completed === true,
    JSON.stringify(result && { completed: result.completed, escaped: result.stats?.escaped }));
  if (result) {
    check("escaping scores the escape bonus", result.score > 1500, `${result.score}`);
    // 5 areas cleared, 1 mistake -> 100 * (5/5) * (5/6).
    check("the rating reflects the one wrong extinguisher, not a perfect run",
      result.performance === Math.round(100 * (5 / 6)), `${result.performance}`);
    check("the rating is below a perfect run", result.performance < 100, `${result.performance}`);
    check("the escape result is under the ceiling", result.score <= 12000, `${result.score}`);
  }

  instance.dispose();
  check("game 4 disposes without throwing", true);
}

/* ================================================================ *
 *  Game 5 — command the incident
 * ================================================================ */

section("Emergency Response Commander — an activity, not a menu");
{
  const { instance, record } = await boot("emergencyCommander");
  const {
    state, scenario, crowd, STATIONS, STATION_COUNT,
    actOnStation, enterHazard, nextRequiredPhase, stationMarkers,
  } = instance.__test;

  runFrames(5);

  check("a scenario was selected", !!scenario, scenario?.id);
  check("the response is eight stations", STATION_COUNT === 8, `${STATION_COUNT}`);
  check("every station is a real object in the world",
    STATIONS.every((s) => stationMarkers.has(s.id)),
    STATIONS.filter((s) => !stationMarkers.has(s.id)).map((s) => s.id).join(","));
  check("every station names the action it performs",
    STATIONS.every((s) => s.action && s.label && s.prompt && s.lesson));

  // THE defining property of this rewrite: nothing is chosen from a list.
  check("no decision dialog with options is ever opened",
    (record.dialogs || []).every((d) => !(d.options || []).length),
    JSON.stringify((record.dialogs || []).map((d) => (d.options || []).length)));

  check("the HUD lists the eight actions as tasks",
    (record.hud.tasks || []).length === 8, `${(record.hud.tasks || []).length}`);
  check("the HUD tells the player what to find next",
    /find the/i.test(record.hud.prompt?.text || ""), record.hud.prompt?.text);

  // --- walking into the hazard is available, and always wrong ---
  const controlBefore = state.control;
  enterHazard();
  runFrames(2);
  check("the player CAN walk into the hazard", state.hazardEntries === 1);
  check("walking into the hazard costs heavily", state.score < 0, `${state.score}`);
  check("walking into the hazard costs scene control", state.control < controlBefore,
    `${controlBefore} -> ${state.control}`);
  check("it does not count as completing anything", state.doneStations.size === 0);

  // --- acting out of order works, but costs control ---
  const outOfOrder = STATIONS[5];
  check("the next required station is the first one", nextRequiredPhase() === 0);
  const ctrl2 = state.control;
  actOnStation(outOfOrder);
  runFrames(2);
  check("an out-of-order action still gets done", state.doneStations.has(outOfOrder.id));
  check("an out-of-order action is counted as such", state.outOfSequence === 1);
  check("an out-of-order action costs control", state.control < ctrl2 + outOfOrder.effects.control,
    `${ctrl2} -> ${state.control}`);

  // --- now work the rest in sequence ---
  for (const s of STATIONS) {
    if (state.doneStations.has(s.id)) continue;
    const before = state.doneStations.size;
    actOnStation(s);
    runFrames(2);
    check(`"${s.action}" is performed by acting on the ${s.label}`,
      state.doneStations.size === before + 1 && state.doneStations.has(s.id));
  }

  check("all eight actions were taken", state.doneStations.size === STATION_COUNT);
  check("seven of the eight were in sequence", state.best === 7, `${state.best}`);

  // --- the world actually reacted to what was done ---
  check("raising the alarm set the alarm flag", state.alarmRaised === true);
  check("isolating set the isolation flag", state.isolated === true);
  check("ordering the evacuation started it", state.evacuating === true);
  check("calling 999 dispatched the ambulance", state.servicesCalled === true);
  check("manning the gate was recorded", state.gateManned === true);

  // The workforce physically walks to the muster point.
  runFrames(2400);
  const arrived = crowd.filter((p) => p.arrived).length;
  check("the workforce evacuates to the muster point", arrived > crowd.length / 2,
    `${arrived}/${crowd.length} arrived`);

  // The close-out fires on a real 1.6s beat so the player sees the
  // scene settle, so this needs real time, not just frames.
  await new Promise((r) => setTimeout(r, 2200));
  runFrames(30);

  const result = record.finished;
  check("taking every action completes the response", !!result && result.completed === true);
  if (result) {
    check("the debrief calls out walking into the hazard",
      (result.lessons || []).some((l) => /commander/i.test(l)),
      JSON.stringify(result.lessons));
    check("the rating is not perfect after a hazard entry", result.performance < 100,
      `${result.performance}`);
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
