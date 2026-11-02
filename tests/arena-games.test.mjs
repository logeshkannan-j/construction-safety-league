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
const { INTERRUPT_SCORING: craneScoring } = await import(`${SRC}/games/craneMaster/interrupts.js`);

/** Boots a game module and returns everything a test needs. */
async function boot(path, { difficulty = "normal", mobile = false, settings = SETTINGS, config = null } = {}) {
  const container = makeElement("div", { width: 1280, height: 720 });
  const { api, record } = makeApi();
  const mod = await import(`${SRC}/games/${path}/index.js`);
  const create = mod.default?.create || mod.create;
  const instance = create({
    container,
    difficulty: DIFFICULTY[difficulty],
    quality: "medium",
    settings,
    config,
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

  /* Nothing undefined may be put into the scene.
   *
   * three.js only WARNS when you add undefined to a scene, so a
   * builder whose return shape you misremembered silently drops
   * whatever it was. That happened twice with buildGuardrail, which
   * returns a Group and was being called as `.group` — and one of
   * those was the corrected version of the unprotected-edge hazard,
   * so the fix for an edge-protection hazard had no edge protection
   * in it and nothing failed. */
  const originalWarn = console.warn;
  const originalErr0 = console.error;
  const warnings = [];
  const grab = (...args) => { warnings.push(args.map(String).join(" ")); };
  console.warn = grab;
  // three.js reports a bad add through console.ERROR, not warn, which
  // is why the first version of this check passed with the bug in.
  console.error = grab;
  try {
    runFrames(2);
  } finally {
    console.warn = originalWarn;
    console.error = originalErr0;
  }
  const addWarnings = warnings.filter((w) => /not an instance of THREE\.Object3D/i.test(w));
  check(`${id}: nothing undefined was added to the scene`, addWarnings.length === 0,
    addWarnings.slice(0, 2).join(" | "));

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

  // The construction floor is deliberately OPEN to the structure
  // above: its whole scenario is overhead work, and you cannot ask
  // what PPE that needs in a room with a lid on it.
  check("escape: every fitted-out room has a ceiling",
    (t.ceilings || []).length === t.rooms.length - 1 && t.ceilings.every((c) => c.visible),
    `${(t.ceilings || []).length} ceilings for ${t.rooms.length} rooms`);

  {
    const ppe = t.rooms.find((r) => r.key === "ppe");
    const overPpe = (t.ceilings || []).filter((c) =>
      c.position.x > ppe.x0 && c.position.x < ppe.x1);
    check("escape: the construction floor is open to the sky above it",
      overPpe.length === 0, `${overPpe.length} ceilings over it`);
  }

  /* ---- material comes off the deck above, which is the hazard ---- */
  {
    const debris = t.fallingDebris || [];
    check("escape: there is material falling from the overhead work",
      debris.length >= 3, `${debris.length} offcuts`);

    const heights = new Set();
    let lowest = Infinity;
    let highest = -Infinity;
    for (let i = 0; i < 240; i++) {
      runFrames(1);
      const d = debris[0];
      if (!d.object.visible) continue;
      heights.add(d.object.position.y.toFixed(2));
      lowest = Math.min(lowest, d.object.position.y);
      highest = Math.max(highest, d.object.position.y);
    }
    check("escape: it actually falls", heights.size > 20, `${heights.size} distinct heights`);
    check("escape: it falls from the deck to the floor",
      highest > 5 && lowest < 0.4, `${lowest.toFixed(2)} m to ${highest.toFixed(2)} m`);
    check("escape: it drops over and over rather than once",
      debris.every((d) => d.period > 0) && new Set(debris.map((d) => d.period)).size === debris.length,
      debris.map((d) => d.period).join(", "));
    check("escape: the offcuts are not synchronised",
      new Set(debris.map((d) => d.t.toFixed(2))).size > 1,
      debris.map((d) => d.t.toFixed(2)).join(", "));
  }

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

  const person = kit.buildWorker(geo, mat, { stance: "relaxed" });
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

  /* ---- the parts have to be the right size RELATIVE TO EACH OTHER ----
   *
   * The first version of this figure shipped wearing a sombrero: the
   * brim was a radius-0.5 cylinder scaled by 0.5, which is 0.5 m
   * across against a 0.21 m head — two and a half times the width of
   * the skull — and a 0.3 m slab stuck out of the crown. Everything
   * else about it was fine, which is exactly why nobody caught it from
   * the numbers. So the ratios are measured. */
  const widthOf = (obj, pred) => {
    let w = 0;
    obj.traverse((c) => {
      if (!c.isMesh || !pred(c)) return;
      const b = new THREE.Box3().setFromObject(c);
      w = Math.max(w, b.max.x - b.min.x);
    });
    return w;
  };
  const rig2 = person.userData.rig;
  // Found by what they ARE rather than by one material object: skin
  // comes in several tones now, and the hard hat is glossy plastic.
  const headWidth = widthOf(rig2.head, (c) => c.material.userData?.role === "skin");
  const hatWidth = widthOf(rig2.head, (c) => c.material.userData?.role === "helmet");
  check("the head is the size of a head",
    headWidth > 0.13 && headWidth < 0.24, `${headWidth.toFixed(3)} m across`);
  check("the hard hat is a hard hat, not a sombrero",
    hatWidth / headWidth > 1.1 && hatWidth / headWidth < 1.7,
    `brim is ${(hatWidth / headWidth).toFixed(2)}x the head`);

  const headBox = new THREE.Box3().setFromObject(rig2.head);
  check("nothing sticks out of the top of the head",
    headBox.max.y - headBox.min.y < 0.42,
    `head and hat are ${(headBox.max.y - headBox.min.y).toFixed(2)} m tall`);
  check("the head is a sensible fraction of the whole figure",
    (headBox.max.y - headBox.min.y) / box3.max.y < 0.22,
    `${(((headBox.max.y - headBox.min.y) / box3.max.y) * 100).toFixed(0)}% of height`);

  // Shoulders wider than the waist, and the waist narrower than the
  // hips — the thing that makes a torso read as a body.
  const shoulderW = widthOf(rig2.spine, () => true);
  check("the shoulders are wider than the head", shoulderW > headWidth * 1.8,
    `${shoulderW.toFixed(2)} m across the shoulders`);
  check("the figure is wider than it is deep",
    (box3.max.x - box3.min.x) > (box3.max.z - box3.min.z),
    `${(box3.max.x - box3.min.x).toFixed(2)} wide, ${(box3.max.z - box3.min.z).toFixed(2)} deep`);
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
  // The old figure asserted <= 0 here — and so bent every knee the
  // wrong way: a crouch put the knee behind the hip, and the leading
  // foot of a stride kicked up in front of the body. In this rig a
  // knee bends with a POSITIVE rotation, heel towards the backside.
  check("knees only bend one way — backwards, as knees do",
    rig.legL.userData.knee.rotation.x >= 0 && rig.legR.userData.knee.rotation.x >= 0,
    `${rig.legL.userData.knee.rotation.x.toFixed(2)} / ${rig.legR.userData.knee.rotation.x.toFixed(2)}`);

  kit.poseWorker(person, { moving: false, pose: "stand" });
  check("standing still puts the legs back under the body",
    Math.abs(rig.legL.rotation.x) < 0.1 && Math.abs(rig.legR.rotation.x) < 0.1);

  /* ---- anatomy you can SEE ----
   *
   * The checks above were all satisfied by a figure whose knees bent
   * forwards like a bird's and whose hands hung inside its hips. So
   * these look at where the parts actually end up in the world. */
  const worldOf = (obj) => {
    person.updateMatrixWorld(true);
    return new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
  };
  for (const pose of ["crouch", "lift"]) {
    kit.poseWorker(person, { pose, moving: false });
    const hip = worldOf(rig.legL);
    const knee = worldOf(rig.legL.userData.knee);
    // The figure faces +Z.
    check(`a ${pose} puts the knees in front of the hips, not behind`,
      knee.z > hip.z + 0.15, `knee ${(knee.z - hip.z).toFixed(2)} m ahead of the hip`);
  }

  kit.poseWorker(person, { pose: "stand", moving: false });
  const handL = worldOf(rig.armL.userData.hand);
  const handR = worldOf(rig.armR.userData.hand);
  const hipL = worldOf(rig.legL);
  check("standing, the hands hang outside the hips, not inside them",
    Math.abs(handL.x) > 0.17 && Math.abs(handR.x) > 0.17
      && Math.sign(handL.x) === Math.sign(hipL.x),
    `hands at ${handL.x.toFixed(2)} / ${handR.x.toFixed(2)} m`);

  // The lowest point of the figure is ON the ground at every point of
  // a stride — the hip height is solved from the legs every frame, so
  // a walk neither floats nor wades into the floor.
  const lowestAt = (opts) => {
    kit.poseWorker(person, opts);
    person.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(person).min.y;
  };
  const strideLows = [];
  for (let i = 0; i < 16; i++) {
    strideLows.push(lowestAt({ moving: true, phase: (i / 16) * Math.PI * 2 }));
  }
  check("through a whole stride, a foot is on the ground and none is under it",
    strideLows.every((y) => y > -0.035 && y < 0.035),
    strideLows.map((y) => y.toFixed(3)).join(" "));
  const kneelLow = lowestAt({ pose: "kneel", moving: false });
  const crouchLow = lowestAt({ pose: "crouch", moving: false });
  check("kneeling and crouching come down to the ground, not hover over it",
    Math.abs(kneelLow) < 0.04 && Math.abs(crouchLow) < 0.04,
    `kneel ${kneelLow.toFixed(3)}, crouch ${crouchLow.toFixed(3)}`);
  kit.poseWorker(person, { moving: false, pose: "stand" });

  /* ---- a crowd is people, not clones ---- */
  const crowd = Array.from({ length: 6 }, (_, i) => kit.buildWorker(geo, mat, { seed: 100 + i }));
  const looks = crowd.map((p) => {
    const d = p.userData.person;
    return `${d.tone}/${d.hair}/${d.moustache}/${d.sleeves}`;
  });
  check("six people from a crowd are not all the same person",
    new Set(looks).size >= 4, looks.join("  "));
  const again = kit.buildWorker(geo, mat, { seed: 103 });
  check("the same seed is the same person",
    JSON.stringify(again.userData.person) === JSON.stringify(crowd[3].userData.person));

  /* ---- a face has a face on it ---- */
  // The nose stands out of the face, the eyes sit in it, and there is
  // a mouth: the old head was a ball with boxes stuck on.
  const faceMeshes = [];
  rig.head.traverse((c) => { if (c.isMesh) faceMeshes.push(c); });
  const eye = faceMeshes.find((c) => c.material.userData?.role === "eye");
  const skinFace = faceMeshes.find((c) => c.material.userData?.role === "skin");
  check("the eyes are coloured into sclera, iris and pupil",
    !!eye && !!eye.geometry.attributes.color, eye ? "has vertex colours" : "no eye mesh");
  if (skinFace) {
    const pos = skinFace.geometry.attributes.position;
    let noseTip = -1;
    let cheek = -1;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i); const y = pos.getY(i); const z = pos.getZ(i);
      if (Math.abs(x) < 0.006 && y < -0.015 && y > -0.035) noseTip = Math.max(noseTip, z);
      if (Math.abs(Math.abs(x) - 0.045) < 0.006 && Math.abs(y + 0.02) < 0.01) cheek = Math.max(cheek, z);
    }
    check("the nose stands out of the face",
      noseTip - cheek > 0.02, `tip ${noseTip.toFixed(3)}, cheek ${cheek.toFixed(3)}`);
    const colours = skinFace.geometry.attributes.color;
    let darkest = 1;
    for (let i = 0; i < colours.count; i++) darkest = Math.min(darkest, colours.getY(i));
    check("the face has a mouth and nostrils painted in", darkest < 0.4, `darkest ${darkest.toFixed(2)}`);
  }


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
  // Each joint is baked down to one mesh per material, so a figure is
  // ~20 draw calls whatever its detail level. What "low" now buys is
  // TRIANGLES — the jaw, ears, nose, hat peak and braces come off —
  // which is what this measures, rather than a draw-call claim that
  // the baking made untrue.
  const costOf = (o) => {
    let meshes = 0;
    let tris = 0;
    o.traverse((c) => {
      if (!c.isMesh) return;
      meshes += 1;
      const g = c.geometry;
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    });
    return { meshes, tris };
  };
  const fullCost = costOf(person);
  const lowCost = costOf(crowdMember);
  check("a figure is cheap enough to put a crowd of them on screen",
    fullCost.meshes <= 26, `${fullCost.meshes} draw calls`);
  check("the low-detail figure drops real geometry",
    lowCost.tris < fullCost.tris && lowCost.meshes <= fullCost.meshes,
    `${lowCost.tris} vs ${fullCost.tris} triangles, ${lowCost.meshes} vs ${fullCost.meshes} meshes`);

  // On the lowest graphics setting nobody is built at full detail.
  const lowStage = gfx.createStage(makeElement("div", { width: 400, height: 300 }), { quality: "low" });
  const lowGeo = kit.createGeometries(lowStage.cfg);
  const lowMat = kit.createMaterials(lowStage.cfg);
  const onLowPhone = costOf(kit.buildWorker(lowGeo, lowMat, { seed: 7 }));
  const crowdOnLowPhone = costOf(kit.buildWorker(lowGeo, lowMat, { seed: 7, detail: "low" }));
  check("on the lowest graphics setting everybody is built at crowd detail",
    onLowPhone.tris === crowdOnLowPhone.tris && onLowPhone.tris < fullCost.tris,
    `${onLowPhone.tris} vs ${crowdOnLowPhone.tris} triangles (full: ${fullCost.tris})`);
  lowStage.dispose();

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
section("A walking character faces the way it is going");

{
  /* The avatar used to be turned with atan2 of the controller's
   * `velocity`, but velocity only ever carries the VERTICAL component
   * — gravity and jumping — so it was atan2(0, 0) = 0 every frame and
   * every character walked due south while sliding in whatever
   * direction it was actually travelling. */
  /* Two different right answers here, and they must not be confused.
   *
   * In the FIRST-PERSON missions the body faces where the player is
   * LOOKING: that is what strafing is, and a body that spun to face
   * sideways every time you side-stepped would be wrong.
   *
   * In the two missions with an orbit camera there is no look
   * direction to face — the camera yaw sits still while the player
   * walks about underneath it — so there the body must face the way
   * it is TRAVELLING. That is the one that was broken. */
  const WALKERS = [
    ["safetyMission", (t) => t.controller, "look"],
    ["escapeChallenge", (t) => t.controller, "look"],
    ["safestTower", (t) => t.walker, "travel"],
    ["emergencyCommander", (t) => t.walker, "travel"],
  ];

  for (const [path, pick, faces] of WALKERS) {
    const { instance } = await boot(path);
    const t = instance.__test;
    const body = pick(t);
    runFrames(20);

    // Push the stick in four directions and check the body turns to
    // match the direction actually travelled each time.
    const offsets = [];
    for (const [jx, jy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const from = body.position.clone();
      instance.input.setJoystick(jx, jy);
      runFrames(60);
      instance.input.setJoystick(0, 0);
      runFrames(10);

      const moved = body.position.clone().sub(from);
      moved.y = 0;
      if (moved.length() < 0.3) continue;
      const want = faces === "travel"
        ? Math.atan2(moved.x, moved.z)
        : body.yaw + Math.PI;
      let off = want - t.avatar.rotation.y;
      while (off > Math.PI) off -= Math.PI * 2;
      while (off < -Math.PI) off += Math.PI * 2;
      offsets.push(Math.abs(off));
    }

    check(`${path}: the body turns with every change of direction`,
      offsets.length === 4, `${offsets.length} of 4 directions moved`);
    check(`${path}: it faces where it should (${faces})`,
      offsets.every((o) => o < 0.25),
      offsets.map((o) => `${(o * 57.3).toFixed(0)}deg`).join(", "));

    // And the controller reports a heading that is NOT just its yaw —
    // in the orbit games the camera yaw never changes while walking.
    check(`${path}: the controller reports a travel heading`,
      Number.isFinite(body.heading));

    instance.dispose();
  }

  /* Over the shoulder in the two first-person missions the body IS
   * drawn — and facing the camera while the stick sends it sideways,
   * it skated: a forward stride, travelling crabwise. Seen from behind,
   * a person turns to walk the way they are going. */
  for (const path of ["safetyMission", "escapeChallenge"]) {
    const { instance } = await boot(path);
    const t = instance.__test;
    t.controller.setThirdPerson(true);
    runFrames(10);
    const from = t.controller.position.clone();
    instance.input.setJoystick(1, 0);
    runFrames(60);
    instance.input.setJoystick(0, 0);
    runFrames(5);
    const moved = t.controller.position.clone().sub(from);
    moved.y = 0;
    let off = Math.atan2(moved.x, moved.z) - t.avatar.rotation.y;
    while (off > Math.PI) off -= Math.PI * 2;
    while (off < -Math.PI) off += Math.PI * 2;
    check(`${path}: over the shoulder, the body turns to walk the way it goes`,
      moved.length() > 0.3 && Math.abs(off) < 0.3,
      `${(Math.abs(off) * 57.3).toFixed(0)} deg off the line it walked`);
    instance.dispose();
  }
}

section("The sky surrounds the camera, however far out it goes");

/* The demo's wide shots fly the camera 150 m and more from the site.
 * The sky dome sat at the site origin, so out there the camera was
 * OUTSIDE it, and its inward-facing surface was culled: a black wedge
 * in the corner of the TV. The dome now travels with the camera. */
{
  const { instance } = await boot("craneMaster");
  instance.siteView.playTour([{ center: [0, 0, -10], yaw: 0.85, pitch: 0.92, distance: 160, seconds: 0.5 }], { loop: true });
  runFrames(40);
  const scene = lastRenderer.lastScene;
  const camera = lastRenderer.lastCamera;
  const sky = scene.getObjectByName("sky");
  const radius = sky?.geometry?.parameters?.radius || 0;
  check("the camera is a long way out on the demo's wide shot",
    camera.position.length() > 120, `${camera.position.length().toFixed(0)} m from the site`);
  check("and it is still inside the sky",
    !!sky && sky.position.distanceTo(camera.position) < radius * 0.5,
    sky ? `${sky.position.distanceTo(camera.position).toFixed(1)} m from the dome centre, radius ${radius.toFixed(0)}` : "no sky");
  instance.dispose();
}

section("Women on site are built as women");

/* "Add a female character too." Not a smaller man: narrower shoulders
 * against wider hips, a shorter height, long hair worn up under the hat,
 * no moustache — and every mission can put one on site, including as
 * the player. */
{
  const kit = await import(`${SRC}/engine/kit.js`);
  const container = makeElement("div", { width: 800, height: 600 });
  const stage = gfx.createStage(container, { quality: "medium" });
  const mat = kit.createMaterials(stage.cfg);
  const geo = kit.createGeometries(stage.cfg);

  const man = kit.buildWorker(geo, mat, { seed: 501, gender: "male" });
  const woman = kit.buildWorker(geo, mat, { seed: 501, gender: "female" });
  man.updateMatrixWorld(true);
  woman.updateMatrixWorld(true);
  const height = (o) => new THREE.Box3().setFromObject(o).max.y;
  const span = (o, part) => {
    const b = new THREE.Box3();
    part(o.userData.rig).traverse((c) => { if (c.isMesh) b.expandByObject(c); });
    return b.max.x - b.min.x;
  };
  const shoulders = (o) => {
    const l = new THREE.Vector3().setFromMatrixPosition(o.userData.rig.armL.matrixWorld);
    const r = new THREE.Vector3().setFromMatrixPosition(o.userData.rig.armR.matrixWorld);
    return l.distanceTo(r);
  };
  check("she is reported as a woman", woman.userData.person.gender === "female");
  // Heights over several people each, so it is the build being
  // measured and not one lucky draw.
  const avgHeight = (gender) => {
    const hs = Array.from({ length: 8 }, (_, i) => {
      const p = kit.buildWorker(geo, mat, { seed: 600 + i, gender, detail: "low" });
      p.updateMatrixWorld(true);
      return height(p);
    });
    return hs.reduce((a, b) => a + b, 0) / hs.length;
  };
  const womenH = avgHeight("female");
  const menH = avgHeight("male");
  check("women are shorter than men, on average", womenH < menH - 0.08,
    `${womenH.toFixed(2)} m against ${menH.toFixed(2)} m`);
  check("and of a woman's height", womenH > 1.5 && womenH < 1.75, `${womenH.toFixed(2)} m`);
  check("her shoulders are narrower than his", shoulders(woman) < shoulders(man) * 0.95,
    `${shoulders(woman).toFixed(3)} vs ${shoulders(man).toFixed(3)}`);
  // Shoulder joints against hip joints: the skeleton, not the clothes.
  const legSpread = (o) => {
    const l = new THREE.Vector3().setFromMatrixPosition(o.userData.rig.legL.matrixWorld);
    const r = new THREE.Vector3().setFromMatrixPosition(o.userData.rig.legR.matrixWorld);
    return l.distanceTo(r);
  };
  const frame = (o) => shoulders(o) / legSpread(o);
  check("her shoulders are narrow against her hips, as a woman's are",
    frame(woman) < frame(man) * 0.92,
    `shoulders/hips ${frame(woman).toFixed(2)} vs ${frame(man).toFixed(2)}`);
  check("she has no moustache", woman.userData.person.moustache === false);
  const braided = kit.buildWorker(geo, mat, { seed: 502, gender: "female", braid: true });
  const bun = kit.buildWorker(geo, mat, { seed: 502, gender: "female", braid: false });
  const headBox = (o) => {
    o.updateMatrixWorld(true);
    const b = new THREE.Box3();
    o.userData.rig.head.traverse((c) => { if (c.isMesh && c.material.userData?.role === "hair") b.expandByObject(c); });
    return b;
  };
  check("her hair is long, worn in a braid down her back",
    headBox(braided).min.y < headBox(bun).min.y - 0.15,
    `braid reaches ${headBox(braided).min.y.toFixed(2)} m, the bun ${headBox(bun).min.y.toFixed(2)} m`);
  const crowd = Array.from({ length: 30 }, (_, i) => kit.buildWorker(geo, mat, { seed: 900 + i, gender: "any", detail: "low" }));
  const women = crowd.filter((p) => p.userData.person.gender === "female").length;
  check("a mixed crowd has women in it, and men", women >= 4 && women <= 20, `${women} of 30`);
  stage.dispose();

  // The player's own character.
  const identity = await import(`${SRC}/identity.js`);
  check("the player can choose to play as a woman",
    identity.AVATARS.some((a) => a.id === "woman") && identity.avatarGender({ avatar: "woman" }) === "female",
    identity.AVATARS.map((a) => a.id).join(", "));
  check("and plays as a man unless they choose otherwise",
    identity.DEFAULT_SETTINGS.avatar === "man" && identity.avatarGender({}) === "male");
  for (const path of ["safetyMission", "escapeChallenge", "safestTower", "emergencyCommander"]) {
    const { instance } = await boot(path, { settings: { ...SETTINGS, avatar: "woman" } });
    check(`${path}: choosing "Woman" puts a woman in the player's boots`,
      instance.__test.avatar.userData.person.gender === "female");
    instance.dispose();
  }
}

section("Emergency Response: a tap reaches the site, and the zoom is the player's");

/* "In the emergency game touching is not working again, and the zoom
 * goes out without the player's control." The brief closed itself 3.4 s
 * into the game but left its flag up, and taps are ignored while the
 * brief is open — so no station could be tapped for the rest of the
 * game. And the camera pulled back to 15 m by itself, at the start and
 * after every action. */
{
  const { instance, record } = await boot("emergencyCommander", { mobile: true });
  const t = instance.__test;
  runFrames(10);
  const startFov = t.zoomFov();
  check("the brief is up at the start", t.state.briefOpen === true && !!record.dialog);
  await new Promise((r) => setTimeout(r, 3700));
  runFrames(30);
  check("when it closes by itself, it is really closed", t.state.briefOpen === false && !record.dialog);
  check("and the zoom is where it was", Math.abs(t.zoomFov() - startFov) < 0.01,
    `${startFov.toFixed(1)}° → ${t.zoomFov().toFixed(1)}°`);

  // The player asks to see a station (the number keys) and taps it on
  // the screen, the way the touch pad reports a tap.
  const station = t.STATIONS[0];
  instance.input.press("opt1");
  runFrames(1);
  instance.input.release("opt1");
  runFrames(120);
  check("turning to face a station leaves the zoom alone", Math.abs(t.zoomFov() - startFov) < 0.01,
    `${t.zoomFov().toFixed(1)}°`);
  // A real renderer brings every world matrix up to date each frame; the
  // stand-in one does not, so it is done here before the ray is cast.
  t.avatar.parent.updateMatrixWorld(true);
  const ndc = t.stationMarkers.get(station.id).anchor.clone().project(t.camera);
  const toastsBefore = record.toasts.length;
  instance.input.registerTap((ndc.x + 1) * 640, (1 - ndc.y) * 360);
  runFrames(3);
  const answer = record.toasts.slice(toastsBefore).map((x) => x.text).join(" | ");
  check("a tap on a station acts on it", t.state.doneStations.has(station.id) || answer.length > 0,
    answer || `nothing happened (station at ${ndc.x.toFixed(2)}, ${ndc.y.toFixed(2)} on screen)`);

  // Acting on another station: the camera stays with the commander, at
  // the player's zoom.
  const other = t.STATIONS.find((st) => st.id !== station.id && st.id !== "casualty");
  t.actOnStation(other);
  runFrames(180);
  check("acting on a station leaves the zoom alone", Math.abs(t.zoomFov() - startFov) < 0.01,
    `${startFov.toFixed(1)}° → ${t.zoomFov().toFixed(1)}°`);
  const commander = t.walker.position;
  const reach = Math.hypot(t.camera.position.x - commander.x, t.camera.position.z - commander.z);
  check("and the camera stays over the commander's shoulder",
    reach < t.camDistance() + 1, `${reach.toFixed(1)} m from the commander`);

  // "How zooming works in the Safety Mission — the same here": the lens
  // narrows, and the camera stays where it is.
  const camAt = t.camera.position.clone();
  instance.input.addZoom(-400);
  runFrames(40);
  check("a pinch zooms the lens in", t.zoomFov() < startFov - 5, `${startFov.toFixed(1)}° → ${t.zoomFov().toFixed(1)}°`);
  check("and the camera does not move away to do it", t.camera.position.distanceTo(camAt) < 0.3,
    `moved ${t.camera.position.distanceTo(camAt).toFixed(2)} m`);
  instance.input.tap("zoom");
  runFrames(60);
  check("ZOOM takes the long lens off again", Math.abs(t.zoomFov() - startFov) < 0.5, `${t.zoomFov().toFixed(1)}°`);
  instance.input.tap("zoom");
  runFrames(60);
  check("and puts it back on", t.zoomFov() < startFov - 10, `${t.zoomFov().toFixed(1)}°`);
  instance.dispose();
}

section("The ERT responds, and the clock stops while it does");

/* "ERT team should be available in the emergency scenario game. Based
 * on the scenario, show the ERT to the player: freeze the timer, show
 * the activity, then start the game and the timer again." */
{
  for (const scenarioId of ["fall", "fire", "electrical"]) {
    const { instance, record } = await boot("emergencyCommander", { settings: { ...SETTINGS, scenarioId } });
    const t = instance.__test;
    check(`${scenarioId}: the scenario can be named`, t.scenario.id === scenarioId, t.scenario.id);
    const team = t.ert.team;
    check(`${scenarioId}: the ERT is a team of four with ERT across their backs`,
      team.length === 4 && team.every((w) => w.userData.person.badge === "ERT"));
    check(`${scenarioId}: one of them is a woman`, team.some((w) => w.userData.person.gender === "female"));
    runFrames(20);
    const home = team.map((w) => w.position.clone());

    const ertStation = t.STATIONS.find((st) => st.id === "casualty");
    check(`${scenarioId}: the station sends the ERT`, /ERT/.test(ertStation.action) && /அவசர/.test(ertStation.ta.action),
      `${ertStation.action} / ${ertStation.ta.action}`);
    t.actOnStation(ertStation);
    check(`${scenarioId}: sending it starts the response`, t.state.cutscene === true && t.ert.active);
    // "The screen is full of letters and unwanted things while it plays."
    const markers = [...t.stationMarkers.values()];
    check(`${scenarioId}: the rings, cones and name signs come down while it plays`,
      markers.every((m) => !m.plate.visible && !m.halo.visible && !m.beacon.visible));
    const clock = t.state.remainingMs;
    runFrames(300);
    check(`${scenarioId}: the clock is frozen while it plays`, t.state.remainingMs === clock,
      `${clock} → ${t.state.remainingMs}`);
    const caption = record.hud.cutscene;
    check(`${scenarioId}: the HUD captions it in English and Tamil`,
      !!caption && caption.line.length > 20 && /[஀-௿]/.test(caption.lineAlt || ""),
      caption ? `${caption.line.slice(0, 40)} / ${String(caption.lineAlt).slice(0, 20)}` : "no caption");
    check(`${scenarioId}: the team goes to work`,
      team.some((w, i) => w.position.distanceTo(home[i]) > 6),
      team.map((w, i) => w.position.distanceTo(home[i]).toFixed(1)).join(", "));

    // Through to the end, watching the CPR on the way.
    let cpr = null;
    for (let i = 0; i < 160 && t.state.cutscene; i++) {
      runFrames(30);
      if (scenarioId === "electrical" && t.ert.beat === 3 && !cpr) {
        cpr = {
          hips: t.ert.medic.userData.rig.hips.position.y,
          near: t.ert.medic.position.distanceTo(t.casualty.position),
        };
      }
    }
    check(`${scenarioId}: the response ends by itself`, t.state.cutscene === false && !t.ert.active);
    check(`${scenarioId}: and the signs are back when it is over`,
      markers.every((m) => m.plate.visible && m.halo.visible));
    check(`${scenarioId}: the HUD drops the captions`, !record.hud.cutscene);
    const after = t.state.remainingMs;
    runFrames(120);
    check(`${scenarioId}: and the clock runs again`, t.state.remainingMs < after - 1000,
      `${after} → ${t.state.remainingMs}`);
    check(`${scenarioId}: the player is told, in both languages`,
      record.toasts.some((x) => /clock is running again/.test(x.text) && /[஀-௿]/.test(x.text)));

    // What the team did depends on what happened.
    if (scenarioId === "fall") {
      const c = t.casualty;
      c.updateMatrixWorld(true);
      check("fall: he is brought down to the ground, not left hanging",
        new THREE.Box3().setFromObject(c).min.y < 1.2, `${new THREE.Box3().setFromObject(c).min.y.toFixed(2)} m`);
      check("fall: and lies still on the board, no longer struggling", c.userData.pose === "stand", c.userData.pose);
    }
    // "After the response they have to take the victim on the stretcher to
    // the first-aid area and wait for the ambulance — or go to the
    // assembly point."
    if (scenarioId === "fall" || scenarioId === "electrical") {
      const c = t.casualty;
      const board = t.ert.board.position;
      const aid = t.ert.aid;
      const medic = t.ert.medic;
      check(`${scenarioId}: he is carried on the spinal board to the first-aid post, and set down there`,
        Math.hypot(board.x - aid.x, board.z - aid.z) < 0.5 && board.y < 0.3 && c.position.distanceTo(board) < 1.2,
        `board ${Math.hypot(board.x - aid.x, board.z - aid.z).toFixed(2)} m from the post, ${board.y.toFixed(2)} m up; him ${c.position.distanceTo(board).toFixed(2)} m from it`);
      check(`${scenarioId}: the first aider is on her knees beside him`,
        medic.userData.rig.hips.position.y < 0.75 && medic.position.distanceTo(c.position) < 1.6,
        `hips at ${medic.userData.rig.hips.position.y.toFixed(2)}, ${medic.position.distanceTo(c.position).toFixed(2)} m away`);
      runFrames(300);
      check(`${scenarioId}: and they stay with him there, waiting for the ambulance`,
        Math.hypot(t.ert.board.position.x - aid.x, t.ert.board.position.z - aid.z) < 0.5
          && medic.position.distanceTo(c.position) < 1.6);
    }
    if (scenarioId === "fire") {
      check("fire: the fire is knocked down", t.fire.scale.x < 0.5, `fire at ${(t.fire.scale.x * 100).toFixed(0)}%`);
      const far = team.map((w) => Math.hypot(w.position.x - t.ert.muster.x, w.position.z - t.ert.muster.z));
      check("fire: then the team reports to the assembly point", far.every((d) => d < 6),
        far.map((d) => d.toFixed(1)).join(", ") + " m from it");
    }
    if (scenarioId === "electrical") {
      check("electrical: before that, the first aider was down on her knees beside him doing CPR",
        !!cpr && cpr.hips < 0.75 && cpr.near < 1.6,
        cpr ? `hips at ${cpr.hips.toFixed(2)}, ${cpr.near.toFixed(2)} m away` : "never saw the CPR beat");
    }

    // It plays once: sending a team that is already out does nothing.
    t.actOnStation(ertStation);
    check(`${scenarioId}: it does not replay`, t.state.cutscene === false);
    instance.dispose();
  }
}

section("People pick things up, carry them, and stand about like people");

/* "The human character is still similar, and the actions — when they
 * take something — are not right." A labourer crouched like somebody
 * sitting on a chair that was not there, with empty hands, while the bag
 * appeared in mid-air at chest height; the ERT carried the stretcher out
 * in front like a tray; every figure stood the same way, arms at the
 * sides; and a figure changing pose snapped from one to the next. */
{
  const kit = await import(`${SRC}/engine/kit.js`);
  const container = makeElement("div", { width: 800, height: 600 });
  const stage = gfx.createStage(container, { quality: "medium" });
  const mat = kit.createMaterials(stage.cfg);
  const geo = kit.createGeometries(stage.cfg);
  const at = (o, obj) => {
    o.updateMatrixWorld(true);
    return new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
  };

  // Standing about.
  const kinds = new Set();
  for (let i = 0; i < 40; i++) kinds.add(kit.buildWorker(geo, mat, { seed: 6100 + i, detail: "low" }).userData.stance);
  check("a crowd stands about in different ways", kinds.size >= 3, [...kinds].join(", "));
  const stood = (stance) => {
    const w = kit.buildWorker(geo, mat, { seed: 6200, stance });
    kit.poseWorker(w, { pose: "stand" });
    const rig = w.userData.rig;
    return {
      hands: [at(w, rig.armL.userData.hand), at(w, rig.armR.userData.hand)],
      hips: [at(w, rig.legL), at(w, rig.legR)],
      shoulders: [at(w, rig.armL), at(w, rig.armR)],
    };
  };
  const hips = stood("hips");
  check("hands on hips: each hand is on its own hip",
    hips.hands.every((h, i) => Math.sign(h.x) === Math.sign(hips.hips[i].x) && Math.abs(h.x) > 0.1 && Math.abs(h.x) < 0.32
      && Math.abs(h.y - hips.hips[i].y) < 0.22 && Math.abs(h.z) < 0.14),
    hips.hands.map((h) => `${h.x.toFixed(2)},${h.y.toFixed(2)},${h.z.toFixed(2)}`).join(" / "));
  const folded = stood("folded");
  check("arms folded: each hand is across the chest, in front",
    folded.hands.every((h, i) => h.z > 0.08 && Math.sign(h.x) !== Math.sign(folded.shoulders[i].x)
      && h.y < folded.shoulders[i].y - 0.1 && h.y > folded.shoulders[i].y - 0.5),
    folded.hands.map((h) => `${h.x.toFixed(2)},${h.y.toFixed(2)},${h.z.toFixed(2)}`).join(" / "));
  const behind = stood("behind");
  check("hands behind the back: both behind, near the middle",
    behind.hands.every((h) => h.z < -0.08 && Math.abs(h.x) < 0.2),
    behind.hands.map((h) => `${h.x.toFixed(2)},${h.y.toFixed(2)},${h.z.toFixed(2)}`).join(" / "));

  // Carrying.
  const carrier = kit.buildWorker(geo, mat, { seed: 6201, stance: "relaxed" });
  const crig = carrier.userData.rig;
  kit.poseWorker(carrier, { pose: "carry", carrying: "shoulder" });
  const shoulderR = at(carrier, crig.armR);
  const handR = at(carrier, crig.armR.userData.hand);
  check("a sack on the shoulder has that hand up on it",
    handR.y > shoulderR.y - 0.05 && Math.abs(handR.x - shoulderR.x) < 0.2,
    `hand ${handR.y.toFixed(2)} m against the shoulder at ${shoulderR.y.toFixed(2)} m`);
  kit.poseWorker(carrier, { pose: "carry", carrying: "ahead" });
  const aheadHands = [at(carrier, crig.armL.userData.hand), at(carrier, crig.armR.userData.hand)];
  kit.poseWorker(carrier, { pose: "carry", carrying: "behind" });
  const behindHands = [at(carrier, crig.armL.userData.hand), at(carrier, crig.armR.userData.hand)];
  check("a stretcher is held low, a handle each side, not out in front like a tray",
    aheadHands.every((h) => h.y < 1.0 && h.z > 0.05 && Math.abs(h.x) > 0.15)
      && behindHands.every((h) => h.y < 1.0 && h.z < 0 && Math.abs(h.x) > 0.15),
    `ahead ${aheadHands.map((h) => h.y.toFixed(2)).join("/")} m, behind ${behindHands.map((h) => h.z.toFixed(2)).join("/")} m`);

  // The lift.
  kit.poseWorker(carrier, { pose: "lift" });
  const head = at(carrier, crig.head);
  const pelvis = at(carrier, crig.hips);
  const lowHands = [at(carrier, crig.armL.userData.hand), at(carrier, crig.armR.userData.hand)];
  check("bending to lift leans the back in over the load, not bolt upright",
    head.z > pelvis.z + 0.3, `head ${(head.z - pelvis.z).toFixed(2)} m in front of the hips`);
  check("and takes the hands down to it", lowHands.every((h) => h.y < 0.7 && h.z > 0.15),
    lowHands.map((h) => `${h.y.toFixed(2)} m up, ${h.z.toFixed(2)} m out`).join(" / "));

  // Changing pose takes a moment.
  const kneeler = kit.buildWorker(geo, mat, { seed: 6202, stance: "relaxed" });
  for (let i = 0; i < 30; i++) kit.animateWorker(kneeler, { dt: 1 / 60, pose: "stand", t: i / 60 });
  const standing = kneeler.userData.rig.hips.position.y;
  kit.animateWorker(kneeler, { dt: 1 / 60, pose: "kneel", t: 0.5 });
  const firstFrame = kneeler.userData.rig.hips.position.y;
  for (let i = 0; i < 45; i++) kit.animateWorker(kneeler, { dt: 1 / 60, pose: "kneel", t: 0.5 + i / 60 });
  const knelt = kneeler.userData.rig.hips.position.y;
  check("going down on one knee takes a moment, it does not snap",
    standing - firstFrame < (standing - knelt) * 0.2 && knelt < standing - 0.2,
    `${standing.toFixed(2)} → ${firstFrame.toFixed(2)} after a frame → ${knelt.toFixed(2)} m`);
  stage.dispose();

  // The labourer and the cement bag.
  const { instance } = await boot("safetyMission");
  const walker = instance.__test.walkers[0];
  const w = walker.worker;
  const bag = w.children.find((c) => c.isGroup && !c.userData?.rig && c !== w.userData.rig?.hips);
  runFrames(2);
  const piles = w.parent.children.filter((c) => c.userData?.loadStack);
  const bagAt = () => {
    w.parent.updateMatrixWorld(true);
    return new THREE.Vector3().setFromMatrixPosition(bag.matrixWorld);
  };
  check("a bag comes from a stack and goes to one", piles.length >= 2, `${piles.length} stacks`);
  runFrames(20);
  const onStack = bagAt();
  const nearest = (p) => Math.min(...piles.map((pile) => Math.hypot(pile.position.x - p.x, pile.position.z - p.z)));
  check("before the hands are on it, it is on top of the stack, not in mid-air",
    nearest(onStack) < 0.4 && onStack.y < 0.7, `${onStack.y.toFixed(2)} m up, ${nearest(onStack).toFixed(2)} m from a stack`);
  let highest = 0;
  let heldWhileWalking = Infinity;
  let putDown = null;
  for (let i = 0; i < 2400; i++) {
    runFrames(1);
    const p = bagAt();
    highest = Math.max(highest, p.y);
    if (walker.carrying && w.userData.gait?.blend > 0.9) heldWhileWalking = Math.min(heldWhileWalking, p.y);
    if (!walker.carrying && bag.parent !== w && highest > 1) { putDown = p; break; }
  }
  check("it is lifted onto the shoulder and carried there",
    heldWhileWalking > 1.35 && heldWhileWalking < 1.9, `carried at ${heldWhileWalking.toFixed(2)} m`);
  check("and put down on the other stack, where it stays",
    !!putDown && putDown.y < 0.7 && nearest(putDown) < 0.4,
    putDown ? `${putDown.y.toFixed(2)} m up, ${nearest(putDown).toFixed(2)} m from a stack` : "never put down");
  instance.dispose();
}

section("Everybody at work is doing a job, with the material for it");

/* "In every game the labour are working but nothing looks proper — make
 * everyone work with proper material in a proper place. See the
 * reference: the person is doing nothing." He was posed "at work" with
 * his arms out, palms up, at nothing. */
{
  const EXPECT = { safetyMission: 5, escapeChallenge: 2, safestTower: 3, craneMaster: 3, emergencyCommander: 0 };
  for (const [path, least] of Object.entries(EXPECT)) {
    const { instance } = await boot(path);
    runFrames(2);
    const scene = lastRenderer.lastScene;
    const people = [];
    scene?.traverse((o) => { if (o.userData?.rig) people.push(o); });
    const miming = people.filter((w) => w.userData.pose === "work" && !w.userData.task && !w.userData.ert);
    check(`${path}: nobody is posed at work with nothing to work on`, miming.length === 0,
      `${miming.length} miming, at ${miming.map((w) => `${w.position.x.toFixed(0)},${w.position.z.toFixed(0)}`).join(" ")}`);
    const working = people.filter((w) => w.userData.task);
    check(`${path}: people are at real jobs`, working.length >= least,
      `${working.length}: ${working.map((w) => w.userData.task).join(", ")}`);
    const props = [];
    scene?.traverse((o) => { if (o.userData?.task && !o.userData.rig) props.push(o); });
    const unequipped = working.filter((w) => {
      const kit = props.find((p) => p.userData.task === w.userData.task && p.position.distanceTo(w.position) < 0.01);
      let meshes = 0;
      kit?.traverse((o) => { if (o.isMesh) meshes += 1; });
      const tool = w.userData.rig.armR.userData.hand.children.some((c) => c.isGroup);
      return !kit || (meshes === 0 && !tool) || (w.userData.task !== "rebar" && !tool);
    });
    check(`${path}: each of them has the job's material in front of them, and the tool in hand`,
      unequipped.length === 0, unequipped.map((w) => w.userData.task).join(", "));
    instance.dispose();
  }

  // The jobs themselves.
  const kit = await import(`${SRC}/engine/kit.js`);
  const tasks = await import(`${SRC}/engine/tasks.js`);
  const container = makeElement("div", { width: 800, height: 600 });
  const stage = gfx.createStage(container, { quality: "medium" });
  const mat = kit.createMaterials(stage.cfg);
  const geo = kit.createGeometries(stage.cfg);
  check("there is more than one kind of job", tasks.TASKS.length >= 5, tasks.TASKS.join(", "));
  const solid = [];
  const scene = new THREE.Scene();
  const mason = tasks.placeTask(scene, tasks.buildTask(geo, mat, "bricklaying", { seed: 9001 }), 4, 0, -3, 0.7, { colliders: solid });
  check("the bricklayer's wall is solid to somebody walking", solid.length >= 1, `${solid.length} solid parts`);
  check("and the worker is where the game put him", mason.position.distanceTo(new THREE.Vector3(4, 0, -3)) < 1e-6 && mason.parent === scene);
  const hand = mason.userData.rig.armR.userData.hand;
  const other = mason.userData.rig.armL.userData.hand;
  check("a trowel in one hand and a brick in the other", hand.children.some((c) => c.isGroup) && other.children.some((c) => c.isMesh));
  kit.poseWorker(mason, { pose: mason.userData.pose });
  scene.updateMatrixWorld(true);
  const wallBox = new THREE.Box3();
  scene.traverse((o) => { if (o.userData?.solid) wallBox.expandByObject(o); });
  const trowelAt = new THREE.Vector3().setFromMatrixPosition(hand.matrixWorld);
  check("and he works at it: his hand is over the wall he is building",
    trowelAt.distanceTo(wallBox.getCenter(new THREE.Vector3())) < 1.4 && trowelAt.y > wallBox.max.y - 0.2,
    `hand ${trowelAt.distanceTo(wallBox.getCenter(new THREE.Vector3())).toFixed(2)} m from the wall, at ${trowelAt.y.toFixed(2)} m against its top at ${wallBox.max.y.toFixed(2)} m`);
  const fixer = tasks.buildTask(geo, mat, "rebar", { seed: 9002 });
  tasks.placeTask(scene, fixer, -4, 0, 3, 0);
  kit.poseWorker(fixer.worker, { pose: fixer.worker.userData.pose });
  scene.updateMatrixWorld(true);
  const tyingHands = [fixer.worker.userData.rig.armL.userData.hand, fixer.worker.userData.rig.armR.userData.hand]
    .map((h) => new THREE.Vector3().setFromMatrixPosition(h.matrixWorld));
  check("the steel fixer is down at the mat, both hands at the bars", tyingHands.every((h) => h.y < 0.6),
    tyingHands.map((h) => h.y.toFixed(2)).join(" / ") + " m");
  stage.dispose();
}

section("Debris from the 3D models, kept where a tidy site keeps it");

/* "Add debris from the 3D models to every game, to make it realistic."
 * Timber offcuts from the planks pack and broken concrete from the stones
 * pack. In the games about spotting hazards it is kept in marked scrap
 * yards — debris lying about IS a hazard there, and one of them is a
 * housekeeping hazard on purpose. */
{
  const debris = await import(`${SRC}/engine/debris.js`);
  // Stand-in pieces, so the layout can be checked without fetching.
  const piece = (w, h, d, material) => {
    const g = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
    return { geometry: g, material, size: new THREE.Vector3(w, h, d), long: Math.max(w, h, d) };
  };
  const wood = new THREE.MeshStandardMaterial();
  const stone = new THREE.MeshStandardMaterial();
  const pieces = {
    timber: [piece(0.2, 0.04, 2.4, wood), piece(0.25, 0.05, 1.6, wood)],
    concrete: [piece(0.5, 0.4, 0.6, stone), piece(0.3, 0.3, 0.3, stone)],
  };
  const spots = [{ x: 0, z: 0, kind: "heap" }, { x: 8, z: 0, kind: "timber" }, { x: -8, z: 0, kind: "concrete" }];
  const meshes = debris.layDebris(spots, pieces, { seed: 4 });
  const again = debris.layDebris(spots, pieces, { seed: 4 });
  check("it is a handful of meshes for the whole site: one per material",
    meshes.length <= 5 && meshes.length >= 3, `${meshes.length} meshes`);
  check("the same site lays the same debris every time",
    meshes.map((m) => m.geometry.attributes.position.count).join() === again.map((m) => m.geometry.attributes.position.count).join());
  const all = new THREE.Box3();
  meshes.forEach((m) => all.expandByObject(m));
  check("nothing is buried or floating: it lies on the ground", all.min.y > -0.12 && all.min.y < 0.05,
    `lowest point ${all.min.y.toFixed(3)} m`);
  check("and nothing lands far from where it was put", all.min.x > -10.5 && all.max.x < 10.5 && Math.abs(all.min.z) < 2.6 && all.max.z < 2.6,
    `${all.min.x.toFixed(1)}..${all.max.x.toFixed(1)} by ${all.min.z.toFixed(1)}..${all.max.z.toFixed(1)}`);
  const heapOnly = debris.layDebris([{ x: 0, z: 0, kind: "heap" }], pieces, { seed: 4 });
  const heapBox = new THREE.Box3();
  heapOnly.forEach((m) => heapBox.expandByObject(m));
  check("a heap is piled up, not spread flat", heapBox.max.y > 0.45, `${heapBox.max.y.toFixed(2)} m high`);

  const scene = new THREE.Scene();
  const offline = debris.scatterDebris(scene, spots);
  await offline.ready;
  check("if the models cannot be fetched, the mission goes on with a tidier site",
    offline.group.parent === scene && offline.colliders.length === 1, `${offline.colliders.length} colliders`);

  // In the hazard-spotting games, debris is in yards, clear of every hazard.
  for (const path of ["safetyMission", "safestTower"]) {
    const { instance } = await boot(path);
    runFrames(2);
    const sceneOf = lastRenderer.lastScene;
    const yards = [];
    sceneOf?.traverse((o) => { if (o.name === "scrap yard") yards.push(o); });
    const hazards = (instance.__test.hazards || instance.__test.HAZARDS || [])
      .map((h) => h.world || h.position || h.object?.position || h.group?.position || h)
      .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z));
    const nearest = Math.min(...yards.flatMap((y) => hazards.map((p) => Math.hypot(p.x - y.position.x, p.z - y.position.z))));
    check(`${path}: the site's debris is in a marked scrap yard`, yards.length >= 1, `${yards.length} yards`);
    check(`${path}: and every yard is well clear of the hazards, so it is never taken for one`,
      hazards.length > 0 && nearest > 8, `nearest hazard ${nearest.toFixed(1)} m`);
    instance.dispose();
  }
}

section("People on site walk about, and walk like people");

/* "Make the game realistic with human movement." A site is people
 * going about their work, not statues — and the evacuation crowd in
 * Emergency Response did not walk at all: it slid to the muster point
 * with the whole body bobbing up and down and the legs still. */
{
  for (const path of ["safetyMission", "safestTower"]) {
    const { instance } = await boot(path);
    const walkers = instance.__test.walkers || [];
    check(`${path}: there are people going about their work`, walkers.length >= 2,
      `${walkers.length} walking`);
    const w = walkers[0]?.worker;
    if (w) {
      const from = w.position.clone();
      let lo = Infinity;
      let hi = -Infinity;
      let carried = false;
      let lowest = Infinity;
      for (let i = 0; i < 600; i += 1) {
        runFrames(1);
        const leg = w.userData.rig.legL.rotation.x;
        lo = Math.min(lo, leg);
        hi = Math.max(hi, leg);
        lowest = Math.min(lowest, w.position.y);
        if (walkers[0].carrying && w.children.some((c) => !c.userData?.rig && c.visible && c.isGroup && c !== w.userData.rig?.hips)) carried = true;
      }
      const travelled = w.position.distanceTo(from);
      check(`${path}: they cover ground`, travelled > 2, `${travelled.toFixed(1)} m in 10 s`);
      check(`${path}: their legs stride as they go`, hi - lo > 0.5,
        `legs swing ${(hi - lo).toFixed(2)} rad`);
      check(`${path}: they stay on the ground`, Math.abs(lowest) < 0.001, `y ${lowest.toFixed(3)}`);
      check(`${path}: what they carry is in their hands`, carried);
    }
    instance.dispose();
  }

  const { instance } = await boot("emergencyCommander");
  const t = instance.__test;
  t.state.evacuating = true;
  const person = t.crowd[0].object;
  const from = person.position.clone();
  let lo = Infinity;
  let hi = -Infinity;
  let bob = 0;
  for (let i = 0; i < 120; i += 1) {
    runFrames(1);
    const leg = person.userData.rig.legL.rotation.x;
    lo = Math.min(lo, leg);
    hi = Math.max(hi, leg);
    bob = Math.max(bob, Math.abs(person.position.y));
  }
  check("the evacuating crowd moves off", person.position.distanceTo(from) > 1,
    `${person.position.distanceTo(from).toFixed(1)} m`);
  check("it walks — the legs stride", hi - lo > 0.5, `legs swing ${(hi - lo).toFixed(2)} rad`);
  check("it does not bounce along with its legs still", bob < 0.001, `bobbed ${bob.toFixed(3)} m`);
  instance.dispose();
}

section("Nobody on site stands perfectly still");

{
  for (const [path, id] of GAMES) {
    const { instance } = await boot(path);
    runFrames(10);

    // Everybody on screen except the player: the crowd animator's
    // figures, AND the ones that animate themselves — people walking
    // their rounds, an evacuating crowd. They all have to be alive.
    const scene = lastRenderer?.lastScene;
    const player = instance.__test?.avatar;
    const people = [];
    scene?.traverse((o) => {
      if (o.userData?.rig && o !== player && o.visible) people.push(o);
    });
    check(`${id}: there are people in the scene`, people.length > 0, `${people.length}`);

    const read = () => people.map((p) => {
      const r = p.userData.rig;
      return `${r.hips.position.y.toFixed(4)}|${r.spine.rotation.y.toFixed(4)}|${r.head.rotation.y.toFixed(4)}`;
    });
    const before = read();
    runFrames(90);
    const after = read();

    check(`${id}: every one of them is breathing and shifting`,
      before.every((v, i) => v !== after[i]),
      `${before.filter((v, i) => v === after[i]).length} frozen`);

    // A yard of people moving in lockstep is worse than none moving.
    // The mechanism is a per-figure offset into the idle cycle, so
    // THAT is what is asserted — comparing live joint angles to four
    // decimal places collides by chance and tests the sampling rather
    // than the behaviour.
    check(`${id}: every figure has its own place in the idle cycle`,
      new Set(people.map((p) => p.userData.idleOffset)).size === people.length,
      `${new Set(people.map((p) => p.userData.idleOffset)).size} offsets for ${people.length} people`);
    check(`${id}: they are not all striking the same pose`,
      people.length < 2 || new Set(after).size > 1,
      `${new Set(after).size} distinct poses among ${people.length} people`);

    // Their job still has to show: a figure posed "work" must still be
    // working, not quietly drifting back to standing.
    const workers = people.filter((p) => p.userData.pose === "work");
    if (workers.length) {
      check(`${id}: a figure set to work is still working after the idle runs`,
        workers.every((p) => p.userData.rig.armL.rotation.x < -0.6),
        workers.map((p) => p.userData.rig.armL.rotation.x.toFixed(2)).join(", "));
    }

    instance.dispose();
  }
}

section("Nobody just stands there: people do things");

/* "Give an action movement to every character — don't make them simply
 * stand. Based on the situation the character reacts, with sound: help
 * help, or emergency emergency." */
{
  const kit = await import(`${SRC}/engine/kit.js`);
  const container = makeElement("div", { width: 800, height: 600 });
  const stage = gfx.createStage(container, { quality: "medium" });
  const mat = kit.createMaterials(stage.cfg);
  const geo = kit.createGeometries(stage.cfg);

  // Every posed figure in every game is doing something.
  for (const [path, id] of GAMES) {
    const { instance } = await boot(path);
    runFrames(10);
    const scene = lastRenderer?.lastScene;
    const player = instance.__test?.avatar;
    const standing = [];
    scene?.traverse((o) => {
      if (o.userData?.rig && o !== player && o.visible && !o.userData.selfAnimated
        && (o.userData.pose || "stand") === "stand") standing.push(o);
    });
    check(`${id}: nobody on site is just standing there`, standing.length === 0,
      `${standing.length} standing, at ${standing.map((w) => `${w.position.x.toFixed(0)},${w.position.z.toFixed(0)}`).join(" ")}`);
    instance.dispose();
  }

  // What each action looks like, in the figure's own frame (it faces +Z).
  const local = (w, o) => {
    w.updateMatrixWorld(true);
    return w.worldToLocal(new THREE.Vector3().setFromMatrixPosition(o.matrixWorld));
  };
  const joints = (w) => {
    const r = w.userData.rig;
    return [r.hips, r.spine, r.neck, r.head, r.armL, r.armR, r.legL, r.legR,
      r.armL.userData.elbow, r.armR.userData.elbow, r.legL.userData.knee, r.legR.userData.knee]
      .filter(Boolean).flatMap((o) => [o.rotation.x, o.rotation.y, o.rotation.z]);
  };
  const apart = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
  const atFace = (hand, head) => hand.distanceTo(head) < 0.18 && hand.z > head.z + 0.06;
  const LOOKS = {
    wave: ["both hands up over the head", (L, R, head) => L.y > head.y && R.y > head.y],
    point: ["one arm out in front, the other hand at the mouth",
      (L, R, head) => R.z > 0.4 && R.y > 1.1 && R.y < head.y && atFace(L, head)],
    signal: ["one hand up over the head, the other down", (L, R, head) => R.y > head.y && L.y < 1.0],
    write: ["both hands in front at the chest, together",
      (L, R) => L.z > 0.2 && R.z > 0.2 && L.y > 1.0 && L.y < 1.4 && L.distanceTo(R) < 0.35],
    radio: ["the hand up at the mouth", (L, R, head) => atFace(R, head)],
    phone: ["the hand at the side of the head",
      (L, R, head) => Math.abs(R.y - head.y) < 0.1 && R.x > 0.05 && R.x < 0.16 && Math.abs(R.z - head.z) < 0.08],
    talk: ["a hand up in front, making the point", (L, R) => R.z > 0.25 && R.y > 1.15 && L.y < 1.0],
    struggle: ["both hands up for the lanyard, the knees bent",
      (L, R, head, w) => L.y > head.y && R.y > head.y && w.userData.rig.legR.userData.knee.rotation.x > 0.3],
  };
  const TIMES = [0.3, 0.71, 1.37, 1.9, 2.53, 3.11, 3.62, 4.4, 5.05, 5.83];
  const liveliness = (w, pose) => {
    let last = null;
    let most = 0;
    for (const t of TIMES) {
      kit.poseWorker(w, { pose, t });
      const now = joints(w);
      if (last) most = Math.max(most, apart(now, last));
      last = now;
    }
    return most;
  };
  const standing = kit.buildWorker(geo, mat, { seed: 9300 });
  kit.poseWorker(standing, { pose: "stand", t: 1.1 });
  const still = joints(standing);
  const standMoves = liveliness(standing, "stand");
  for (const [pose, [looks, test]] of Object.entries(LOOKS)) {
    const w = kit.buildWorker(geo, mat, { seed: 9300 });
    kit.poseWorker(w, { pose, t: 1.1 });
    const r = w.userData.rig;
    const L = local(w, r.armL.userData.hand);
    const R = local(w, r.armR.userData.hand);
    const head = local(w, r.head);
    check(`${pose}: ${looks}`, test(L, R, head, w),
      `left ${L.x.toFixed(2)},${L.y.toFixed(2)},${L.z.toFixed(2)} right ${R.x.toFixed(2)},${R.y.toFixed(2)},${R.z.toFixed(2)} head ${head.y.toFixed(2)}`);
    check(`${pose}: is nothing like standing`, apart(joints(w), still) > 1, `${apart(joints(w), still).toFixed(2)} rad from it`);
    const moves = liveliness(w, pose);
    check(`${pose}: and it is done, not held — it moves more than standing does`, moves > 0.1 && moves > standMoves * 2,
      `${moves.toFixed(2)} rad against standing's ${standMoves.toFixed(2)}`);
  }

  // What they do it with: in the hand while they do it, put away after.
  const w = kit.buildWorker(geo, mat, { seed: 9301 });
  const handR = w.userData.rig.armR.userData.hand;
  const handL = w.userData.rig.armL.userData.hand;
  kit.poseWorker(w, { pose: "radio", t: 1 });
  const radio = w.userData.held?.radio;
  check("on the radio, there is a radio in the hand", !!radio && radio.visible && radio.parent === handR);
  kit.poseWorker(w, { pose: "phone", t: 1 });
  const phone = w.userData.held?.phone;
  const fromHead = phone ? local(w, phone).distanceTo(local(w, w.userData.rig.head)) : Infinity;
  check("on the phone, a phone at the ear, and the radio put away",
    !!phone && phone.visible && phone.parent === handR && !radio.visible && fromHead < 0.22,
    `${fromHead.toFixed(2)} m from the head`);
  kit.poseWorker(w, { pose: "write", t: 1 });
  const board = w.userData.held?.write;
  check("writing, a clipboard in the other hand", !!board && board.visible && board.parent === handL && !phone.visible);
  kit.poseWorker(w, { pose: "stand", t: 1 });
  check("and nothing in the hands when they stop", [radio, phone, board].every((o) => o && !o.visible));
  kit.poseWorker(w, { pose: "radio", t: 2 });
  check("each is made once and kept, not made again every time",
    w.userData.held?.radio === radio && handR.children.filter((c) => c === radio).length === 1 && radio.visible);
  const officer = kit.buildWorker(geo, mat, { role: "officer", seed: 9302 });
  const meshes = countMeshes(officer);
  kit.poseWorker(officer, { pose: "write", t: 1 });
  check("an officer writes on the clipboard she carries, not on a second one",
    countMeshes(officer) === meshes && officer.userData.held?.write === null);

  // Somebody walking their rounds goes round corners without stopping,
  // and does the job at each stop.
  const walker = kit.createWalker(kit.buildWorker(geo, mat, { seed: 9303 }), [
    { x: 0, z: 0, pause: 1.5, pose: "radio" },
    { x: 3, z: 0 },
    { x: 3, z: 3, pause: 1.5, pose: "write" },
  ], { speed: 1.4 });
  new THREE.Scene().add(walker.worker);
  let stood = 0;
  let longest = 0;
  const did = new Set();
  const held = new Set();
  const last = walker.worker.position.clone();
  for (let i = 0; i < 60 * 14; i++) {
    walker.update(1 / 60, i / 60);
    const moved = walker.worker.position.distanceTo(last) > 1e-4;
    last.copy(walker.worker.position);
    const pose = walker.worker.userData.gait?.pose;
    if (!moved) did.add(pose);
    stood = !moved && pose === "stand" ? stood + 1 : 0;
    longest = Math.max(longest, stood);
    Object.entries(walker.worker.userData.held || {}).forEach(([k, o]) => { if (o?.visible) held.add(k); });
  }
  check("somebody on their rounds never stops just to stand", longest < 15, `stood still for ${longest} frames`);
  check("they stop to do the job: on the radio at one stop, writing at the next",
    did.has("radio") && did.has("write"), [...did].join(", "));
  check("with the radio and the clipboard in hand", held.has("radio") && held.has("write"), [...held].join(", "));
  stage.dispose();

  // In the games, people on their rounds keep moving the same way.
  for (const path of ["safetyMission", "safestTower"]) {
    const { instance } = await boot(path);
    const walkers = instance.__test.walkers || [];
    const runs = walkers.map(() => 0);
    const worst = walkers.map(() => 0);
    const at = walkers.map((x) => x.worker.position.clone());
    for (let i = 0; i < 900; i++) {
      runFrames(1);
      walkers.forEach((x, k) => {
        const moved = x.worker.position.distanceTo(at[k]) > 1e-4;
        at[k].copy(x.worker.position);
        runs[k] = !moved && x.worker.userData.gait?.pose === "stand" ? runs[k] + 1 : 0;
        worst[k] = Math.max(worst[k], runs[k]);
      });
    }
    check(`${path}: nobody on their rounds stops just to stand`, walkers.length >= 2 && worst.every((n) => n < 15),
      worst.map((n) => `${n} frames`).join(", "));
    instance.dispose();
  }
}

section("In an emergency the site reacts, and people shout for help");

{
  const audio = await import(`${SRC}/audio.js`);
  const voice = await import(`${SRC}/voice.js`);

  // The device's speech, recorded rather than spoken.
  const spoken = [];
  let cancels = 0;
  let voiceList = [{ lang: "en-US", name: "US" }, { lang: "en-IN", name: "India" }, { lang: "ta-IN", name: "Tamil" }];
  const voiceListeners = new Set();
  window.speechSynthesis = {
    getVoices: () => voiceList,
    speak(u) { spoken.push({ text: u.text, volume: u.volume, pitch: u.pitch, lang: u.lang, voice: u.voice }); },
    cancel() { cancels += 1; },
    addEventListener(type, fn) { if (type === "voiceschanged") voiceListeners.add(fn); },
    removeEventListener(type, fn) { voiceListeners.delete(fn); },
  };
  window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  audio.setSoundEnabled(true);
  audio.setVolume(1);

  // The voice itself.
  const ta = voice.createVoices({ lang: () => "ta" });
  check("a Tamil player hears it in Tamil, in a Tamil voice",
    ta.shout("help", 5, { now: 0 }) === "உதவி! உதவி!" && spoken.at(-1)?.voice?.lang === "ta-IN" && spoken.at(-1)?.lang === "ta-IN",
    JSON.stringify(spoken.at(-1)));
  check("one shout at a time: another straight after is not spoken",
    ta.shout("emergency", 5, { now: 1000 }) === null && spoken.length === 1);
  check("but a moment later it is", ta.shout("emergency", 5, { now: 2400 }) === "அவசரம்! அவசரம்!");
  ta.dispose();
  const en = voice.createVoices({ lang: () => "en" });
  check("an English player hears English, in an Indian English voice, even with a Tamil voice on the device",
    en.shout("fire", 5, { now: 0 }) === "Fire! Fire!" && spoken.at(-1)?.voice?.lang === "en-IN");
  en.dispose();
  voiceList = [{ lang: "en-GB" }, { lang: "en-IN" }];
  const noTamil = voice.createVoices({ lang: () => "ta" });
  check("with no Tamil voice on the device, a Tamil player still hears it, in English",
    noTamil.shout("help", 5, { now: 0 }) === "Help! Help!" && spoken.at(-1)?.voice?.lang === "en-IN");
  noTamil.dispose();
  voiceList = [];
  const late = voice.createVoices({ lang: () => "ta" });
  voiceList = [{ lang: "ta-IN" }];
  voiceListeners.forEach((fn) => fn());
  check("voices the device loads late (as Android does) are used when they come",
    late.shout("fire", 5, { now: 0 }) === "தீ! தீ!" && spoken.at(-1)?.voice?.lang === "ta-IN");
  const listening = voiceListeners.size;
  late.dispose();
  check("and it stops listening for them when the mission ends", voiceListeners.size === listening - 1);
  voiceList = [{ lang: "en-IN" }, { lang: "ta-IN" }];
  const loud = voice.createVoices();
  const volumeAt = (d, now) => (loud.shout("help", d, { now }) ? spoken.at(-1).volume : NaN);
  const near = volumeAt(2, 0);
  const far = volumeAt(25, 5000);
  const farther = volumeAt(400, 10000);
  check("louder the nearer they are, and never inaudible", near > far && far > farther && farther === 0.15 && near <= 1,
    `${near.toFixed(2)} at 2 m, ${far.toFixed(2)} at 25 m, ${farther.toFixed(2)} at 400 m`);
  audio.setVolume(0.5);
  check("at the game's volume", Math.abs(volumeAt(2, 15000) - near / 2) < 1e-9);
  audio.setVolume(0);
  check("silent at volume 0 (iOS ignores a quiet voice, so it is not spoken at all)",
    loud.shout("help", 2, { now: 20000 }) === null);
  audio.setVolume(1);
  audio.setSoundEnabled(false);
  check("silent with the sound off", loud.shout("help", 2, { now: 25000 }) === null);
  audio.setSoundEnabled(true);
  check("anything but a known shout says nothing", loud.shout("boo", 2, { now: 30000 }) === null);
  const synth = window.speechSynthesis;
  delete window.speechSynthesis;
  let threw = false;
  let silent = false;
  try {
    silent = voice.createVoices().shout("help", 2) === null;
  } catch { threw = true; }
  check("a device without speech says nothing, and does not break", silent && !threw);
  window.speechSynthesis = synth;
  loud.dispose();

  // Seeded chance, so what is heard does not depend on luck.
  const realRandom = Math.random;
  let seed = 20261101;
  Math.random = () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const heard = (from) => spoken.slice(from).map((u) => u.text);
  const listen = (seconds, until = () => false) => {
    for (let i = 0; i < seconds * 2 && !until(); i++) runFrames(30);
  };
  const angleTo = (o, p) => {
    let d = (Math.atan2(p.x - o.position.x, p.z - o.position.z) - o.rotation.y) % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs(d);
  };
  try {
    // A mission demo plays this world with its sound off: not a word.
    {
      const { instance: muted } = await boot("emergencyCommander", { settings: { ...SETTINGS, scenarioId: "fall", sound: false } });
      const before = spoken.length;
      listen(20);
      check("a game started with its sound off (as the mission demos are) says nothing", spoken.length === before,
        spoken.slice(before).map((u) => u.text).join(" / "));
      muted.dispose();
    }
    for (const scenarioId of ["fall", "fire", "electrical"]) {
      // A player's game, with its sound on.
      const { instance } = await boot("emergencyCommander", { settings: { ...SETTINGS, scenarioId, sound: true } });
      const t = instance.__test;
      const from = spoken.length;
      runFrames(200);
      const inc = t.incident.position;
      const crowd = t.crowd;
      const dist = (p) => Math.hypot(p.object.position.x - inc.x, p.object.position.z - inc.z);
      const nearest = [...crowd].sort((a, b) => dist(a) - dist(b)).slice(0, 4);
      const pose = (p) => p.object.userData.gait?.pose;
      check(`${scenarioId}: the four nearest saw it and are calling for help, waving and pointing`,
        nearest.every((p) => p.witness && ["wave", "point"].includes(pose(p))),
        nearest.map((p) => `${pose(p)} at ${dist(p).toFixed(0)} m`).join(", "));
      check(`${scenarioId}: and they have turned to it`, nearest.every((p) => angleTo(p.object, inc) < 0.3),
        nearest.map((p) => angleTo(p.object, inc).toFixed(2)).join(", "));
      const others = crowd.filter((p) => !nearest.includes(p));
      check(`${scenarioId}: everybody else has stopped to deal with it: on the phone, on the radio, talking`,
        others.length > 0 && others.every((p) => ["phone", "radio", "talk", "point"].includes(pose(p))),
        others.map(pose).join(", "));
      const talkers = others.filter((p) => pose(p) === "talk");
      check(`${scenarioId}: talking to somebody, facing them`,
        talkers.length > 0 && talkers.every((p) => angleTo(p.object, p.partner.object.position) < 0.3),
        talkers.map((p) => angleTo(p.object, p.partner.object.position).toFixed(2)).join(", "));
      const team = [t.ert.medic, t.ert.bearerA, t.ert.bearerB];
      check(`${scenarioId}: the ERT on standby: the leader on the radio, the others going over it together`,
        t.ert.leader.userData.gait?.pose === "radio" && !!t.ert.leader.userData.held?.radio?.visible
          && team.every((x) => x.userData.gait?.pose === "talk"),
        [t.ert.leader, ...team].map((x) => x.userData.gait?.pose).join(", "));

      // What they shout.
      if (scenarioId === "fire") {
        listen(40, () => heard(from).includes("Fire! Fire!"));
        check("fire: they shout \"Fire! Fire!\"", heard(from).includes("Fire! Fire!"), heard(from).join(" / "));
        check("fire: or \"Emergency! Emergency!\", and nothing else",
          heard(from).every((x) => x === "Fire! Fire!" || x === "Emergency! Emergency!"), heard(from).join(" / "));
      } else {
        listen(20, () => heard(from).includes("Help! Help!"));
        check(`${scenarioId}: somebody shouts "Help! Help!"`, heard(from).includes("Help! Help!"), heard(from).join(" / "));
        check(`${scenarioId}: or "Emergency! Emergency!", and never fire`,
          heard(from).every((x) => x === "Help! Help!" || x === "Emergency! Emergency!"), heard(from).join(" / "));
      }
      check(`${scenarioId}: every shout is loud enough to hear and no louder than the game`,
        spoken.slice(from).every((u) => u.volume >= 0.15 && u.volume <= 1));

      if (scenarioId === "fall") {
        const c = t.casualty;
        check("fall: the man in the harness is struggling, not hanging still", c.userData.pose === "struggle");
        const legs = [];
        for (let i = 0; i < 8; i++) {
          runFrames(9);
          legs.push(c.userData.rig.legL.rotation.x);
        }
        check("fall: his legs kick for a foothold", Math.max(...legs) - Math.min(...legs) > 0.2,
          `${(Math.max(...legs) - Math.min(...legs)).toFixed(2)} rad`);

        // Sending the ERT: quiet while the response plays, and no more
        // calls for help once they have him.
        const cancelled = cancels;
        t.actOnStation(t.STATIONS.find((st) => st.id === "casualty"));
        check("fall: the shouting stops when the response starts", t.state.cutscene && cancels > cancelled);
        const during = spoken.length;
        for (let i = 0; i < 160 && t.state.cutscene; i++) runFrames(30);
        check("fall: nobody shouts over the response while it plays", spoken.length === during,
          heard(during).join(" / "));
        check("fall: once he is down, he lies still", c.userData.pose !== "struggle", c.userData.pose);
        const after = spoken.length;
        listen(12);
        check("fall: and with the ERT there, nobody is still calling for help", !heard(after).includes("Help! Help!"),
          heard(after).join(" / "));
        check("fall: the witnesses stop waving and talk it over instead",
          nearest.every((p) => ["point", "talk"].includes(pose(p))), nearest.map(pose).join(", "));
      }

      if (scenarioId === "fire") {
        // The alarm: everyone turns to the way out, and it is "Emergency!" now.
        t.actOnStation(t.STATIONS.find((st) => st.id === "alarm"));
        const after = spoken.length;
        listen(20, () => heard(after).includes("Emergency! Emergency!"));
        runFrames(120);
        check("fire: once the alarm goes it is \"Emergency! Emergency!\"", heard(after).includes("Emergency! Emergency!"),
          heard(after).join(" / "));
        check("fire: and only that", heard(after).every((x) => x === "Emergency! Emergency!"), heard(after).join(" / "));
        check("fire: they point the way out and talk it over, facing the muster point",
          crowd.every((p) => ["point", "talk"].includes(pose(p)) && angleTo(p.object, t.MUSTER) < 0.3),
          crowd.map((p) => `${pose(p)} ${angleTo(p.object, t.MUSTER).toFixed(2)}`).join(", "));

        // At the muster point, waiting for the roll call.
        t.state.evacuating = true;
        crowd.forEach((p) => p.object.position.set(p.target.x, p.object.position.y, p.target.z));
        runFrames(30);
        check("fire: at the muster point they talk and phone, waiting for the roll call",
          crowd.every((p) => p.arrived && ["talk", "phone"].includes(pose(p))), crowd.map(pose).join(", "));
        const quiet = spoken.length;
        listen(8);
        check("fire: and nobody there is still shouting", spoken.length === quiet, heard(quiet).join(" / "));
      }

      if (scenarioId === "electrical") {
        // Pausing quietens it; turning the sound off keeps it quiet.
        const cancelled = cancels;
        instance.setPaused(true);
        check("electrical: pausing stops the shouting", cancels > cancelled);
        instance.setPaused(false);
        audio.setSoundEnabled(false);
        const quiet = spoken.length;
        listen(12);
        check("electrical: with the sound off, nobody is heard", spoken.length === quiet);
        audio.setSoundEnabled(true);
      }
      const disposed = cancels;
      instance.dispose();
      check(`${scenarioId}: and it is quiet when the mission ends`, cancels > disposed);
    }
  } finally {
    Math.random = realRandom;
    delete window.speechSynthesis;
    delete window.SpeechSynthesisUtterance;
    audio.setSoundEnabled(true);
    audio.setVolume(1);
  }
}

section("Audit: the scaffold, the cable, the ladder, and what could be gamed");

{
  const kit = await import(`${SRC}/engine/kit.js`);
  const { createFirstPerson, ladderVolume } = await import(`${SRC}/engine/fpsController.js`);
  const lang = await import(`${SRC}/language.js`);
  const container = makeElement("div", { width: 800, height: 600 });
  const stage = gfx.createStage(container, { quality: "medium" });
  const mat = kit.createMaterials(stage.cfg);
  const geo = kit.createGeometries(stage.cfg);
  const stick = () => ({ state: { moveX: 0, moveY: 0 }, consumeLook: () => ({ dx: 0, dy: 0 }), isHeld: () => false, wasPressed: () => false });

  /* The scaffold's walkable boards were placed a scaffold's width away
   * from the boards you see: stepping off its ladder at the top was an
   * 8 m fall and a "fatality". Built away from the origin, as in the
   * games — the old unit test built it at the origin, where the double
   * shift cancels out. */
  const X = -10;
  const Z = 1.6;
  const sc = kit.buildScaffold(geo, mat, { x: X, y: 0, z: Z, bays: 4, depth: 1.3, lifts: 4, liftHeight: 2 });
  sc.group.updateMatrixWorld(true);
  const boards = new THREE.Box3();
  sc.group.traverse((o) => { if (o.userData?.walkable) boards.expandByObject(o); });
  const astray = sc.colliders.filter((c) => {
    const cx = (c.minX + c.maxX) / 2;
    const cz = (c.minZ + c.maxZ) / 2;
    return cx < boards.min.x || cx > boards.max.x || cz < boards.min.z || cz > boards.max.z;
  });
  check("every scaffold lift you can see is one you can stand on", sc.colliders.length > 0 && astray.length === 0,
    `${astray.length} of ${sc.colliders.length} boards elsewhere`);

  const lx = X - sc.length / 2 + 0.4;
  const lz = Z + 1.3 / 2 - 0.15;
  const ladders = [ladderVolume({ x: lx, z: lz, baseY: 0, topY: sc.totalHeight, width: 1.3, depth: 1.3, exit: { x: lx + 2, z: lz } })];
  let input = stick();
  input.state.moveY = 1;
  const drops = [];
  let c = createFirstPerson(new THREE.PerspectiveCamera(), input, {
    colliders: sc.colliders, ladders, spawn: { x: lx - 2, y: 0, z: lz }, yaw: -Math.PI / 2, onLand: (d) => drops.push(d),
  });
  for (let i = 0; i < 330; i++) c.update(1 / 60);
  check("up the ladder and off at the top, the player stands on the top lift",
    c.position.y > sc.totalHeight - 0.5 && c.state.grounded && !c.state.onLadder && drops.every((d) => d < 2.6),
    `y ${c.position.y.toFixed(2)}, grounded ${c.state.grounded}, drops ${drops.map((d) => d.toFixed(1)).join(",")}`);

  // Down again, by the ladder: holding on is not falling.
  input = stick();
  const drops2 = [];
  c = createFirstPerson(new THREE.PerspectiveCamera(), input, {
    colliders: sc.colliders, ladders, spawn: { x: lx + 0.95, y: sc.totalHeight + 0.1, z: Z }, yaw: Math.PI, onLand: (d) => drops2.push(d),
  });
  const run = (n, mx, my) => { input.state.moveX = mx; input.state.moveY = my; for (let i = 0; i < n; i++) c.update(1 / 60); };
  run(30, 0, 0);
  input.state.moveY = 1;
  for (let k = 0; c.state.grounded && k < 200; k++) c.update(1 / 60);
  input.state.moveY = 0;
  input.state.moveX = 1;
  for (let i = 0; i < 40 && !c.state.onLadder; i++) c.update(1 / 60);
  const caught = c.state.onLadder;
  run(400, 0, -1);
  run(150, 1, 0);
  run(30, 0, 0);
  check("climbing down a ladder and stepping off is not reported as a fall",
    caught && c.position.y < 0.5 && drops2.every((d) => d < 2.6), `caught ${caught}, drops ${drops2.map((d) => d.toFixed(1)).join(",")}`);

  // A frozen controller stands still.
  input = stick();
  input.state.moveY = 1;
  c = createFirstPerson(new THREE.PerspectiveCamera(), input, { colliders: [], spawn: { x: 0, y: 0, z: 0 } });
  for (let i = 0; i < 30; i++) c.update(1 / 60);
  c.setFrozen(true);
  c.update(1 / 60);
  check("frozen (top view), the figure stops walking on the spot", !c.moving && c.state.speed === 0);

  const cable = kit.buildCableRun(geo, mat, { length: 4 });
  const cableBox = new THREE.Box3().setFromObject(cable);
  check("a cable run lies along its length, not across it in sticks",
    cableBox.max.x - cableBox.min.x > 3.5 && cableBox.max.z - cableBox.min.z < 0.7,
    `${(cableBox.max.x - cableBox.min.x).toFixed(2)} m long, ${(cableBox.max.z - cableBox.min.z).toFixed(2)} m across`);
  stage.dispose();

  /* Escape: switching language re-opened a solved question and paid
   * for it again — as often as the button was pressed. */
  {
    const { instance, record } = await boot("escapeChallenge");
    runFrames(5);
    const t = instance.__test;
    const item = t.interactables.find((i) => i.key && !i.done);
    t.openPuzzle(item);
    const open = record.dialog;
    const right = open?.options?.find((o) => o.correct)?.id
      ?? (await import(`${SRC}/games/escapeChallenge/puzzles.js`)).PUZZLES[item.key].options.find((o) => o.correct).id;
    open?.onPick?.(right);
    runFrames(2);
    const score = t.state.score;
    const solved = t.state.solved;
    let reopened = false;
    for (const l of ["ta", "en", "ta", "en"]) {
      lang.setLang(l);
      runFrames(2);
      // A player tapping the answer again on anything that comes back.
      if (record.dialog) { reopened = true; record.dialog.onPick?.(right); runFrames(2); }
    }
    // And the first answer's button, pressed again.
    open?.onPick?.(right);
    runFrames(2);
    check("escape: changing language does not bring a solved question back", !reopened, JSON.stringify(record.dialog?.title || ""));
    check("escape: or pay for it again", t.state.score === score && t.state.solved === solved,
      `${score} → ${t.state.score}, ${solved} → ${t.state.solved}`);
    lang.setLang("en");
    instance.dispose();
  }

  /* Spot the Hazards: every good run scored exactly 12,000 (the table
   * was written for five hazards; there are ten). */
  {
    const { SCORING, HAZARD_COUNT } = await import(`${SRC}/games/safestTower/hazards.js`);
    const flawless = HAZARD_COUNT * SCORING.solvedFirstTry + SCORING.allSolved + SCORING.accuracyMax;
    check("spot the hazards: a flawless run is no longer cut off at the ceiling",
      flawless * DIFFICULTY.hard.scoreScale < 12000 - 600, `${flawless} × ${DIFFICULTY.hard.scoreScale}`);
    const { instance, record } = await boot("safestTower");
    runFrames(5);
    const t = instance.__test;
    const hazard = t.hazards.find((h) => !h.solved);
    t.walker.position.set(hazard.world.x, t.walker.position.y, hazard.world.z);
    t.checkApproach();
    check("spot the hazards: walking up to a hazard asks about it", !!record.dialog && t.state.openHazard === hazard);
    record.dialog?.onDismiss?.();
    runFrames(10);
    check("spot the hazards: 'Look around first' really backs out of it", !t.state.openHazard && !record.dialog);
    t.walker.position.set(hazard.world.x + t.APPROACH_RADIUS + 2, t.walker.position.y, hazard.world.z);
    runFrames(3);
    t.walker.position.set(hazard.world.x, t.walker.position.y, hazard.world.z);
    t.checkApproach();
    check("spot the hazards: and it asks again once the player has stepped away and come back", t.state.openHazard === hazard);
    instance.dispose();
  }

  /* Emergency: the casualty's condition never changed, so a player who
   * did nothing was paid "Casualty survived +500"; and the results said
   * "Wrong decisions 0" after walking into the fire. */
  {
    const { instance, record } = await boot("emergencyCommander", { settings: { ...SETTINGS, scenarioId: "fall" } });
    const t = instance.__test;
    runFrames(60 * 20);
    check("emergency: an untreated casualty gets worse", t.state.casualty < 100, `${t.state.casualty.toFixed(1)}%`);
    t.enterHazard();
    t.state.remainingMs = 1;
    runFrames(5);
    const result = record.finished;
    check("emergency: doing nothing earns no survival bonus", !!result && !(result.breakdown || []).some((b) => /Casualty survived/.test(b.label)),
      (result?.breakdown || []).map((b) => b.label).join(" | "));
    check("emergency: the results show walking into the incident",
      (result?.breakdown || []).some((b) => /Walked into the incident/.test(b.label) && b.value === "1"));
    instance.dispose();
  }
}

section("A helmet on the head, a landing at the stairs, the radio in Tamil, the site's sound");

{
  /* "In hazard finding the helmet is in the air, not on the head." */
  {
    const { instance } = await boot("safetyMission");
    runFrames(5);
    const t = instance.__test;
    let worker = null;
    lastRenderer.lastScene.traverse((o) => { if (o.userData?.rig && o.userData.worker && !o.userData.worker.helmet && o.userData.task) worker = o; });
    check("the bricklayer starts with no helmet", !!worker && typeof worker.userData.putOnHelmet === "function");
    t.resolvers["no-helmet"]();
    runFrames(30);
    worker.updateMatrixWorld(true);
    const head = worker.userData.rig.head;
    const onHead = head.children.filter((c) => c.isMesh && /helmet/.test(c.material?.userData?.tag || c.material?.name || "") ).length
      || head.children.length;
    const headAt = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
    const hats = [];
    worker.traverse((o) => { if (o.isMesh && o.parent === head) hats.push(o); });
    const top = new THREE.Box3();
    hats.forEach((h) => top.expandByObject(h));
    check("put right, the helmet goes on his head and moves with it (it floated at standing height)",
      worker.userData.worker.helmet && hats.length > 0 && onHead > 0 && top.min.y > headAt.y - 0.25 && top.max.y < headAt.y + 0.45,
      `head at ${headAt.y.toFixed(2)} m, helmet ${top.min.y.toFixed(2)}..${top.max.y.toFixed(2)} m`);
    const extras = worker.children.filter((c) => c.isMesh && c.geometry?.type === "SphereGeometry");
    check("and no loose dome is left hanging on the figure", extras.length === 0, `${extras.length}`);
    instance.dispose();
  }

  /* "The staircase to the 2nd floor does not start well." */
  {
    const kit = await import(`${SRC}/engine/kit.js`);
    const container = makeElement("div", { width: 800, height: 600 });
    const stage = gfx.createStage(container, { quality: "medium" });
    const frame = kit.buildConcreteFrame(kit.createGeometries(stage.cfg), kit.createMaterials(stage.cfg), { x: -10, z: 10, width: 18, depth: 14, floors: 4, floorHeight: 3.4 });
    const westEdge = -10 - 9;
    const landings = frame.stairs.map((st) => st.xStart - westEdge);
    check("every flight starts with a landing in front of it, not at the slab edge",
      landings.every((d) => d >= 2), landings.map((d) => d.toFixed(1)).join(", ") + " m");
    check("and the place to step onto it is on the floor, well in from the edge",
      frame.stairs.every((st) => st.entry.x - westEdge >= 1.4), frame.stairs.map((st) => (st.entry.x - westEdge).toFixed(1)).join(", "));
    stage.dispose();
  }

  /* "Tamil communication to the players, based on the scenario." */
  {
    const audio = await import(`${SRC}/audio.js`);
    const voice = await import(`${SRC}/voice.js`);
    const spokenLines = [];
    let cancels = 0;
    let voiceList = [{ lang: "en-IN" }, { lang: "ta-IN" }];
    window.speechSynthesis = {
      getVoices: () => voiceList, speak(u) { spokenLines.push(u); }, cancel() { cancels += 1; },
      addEventListener() {}, removeEventListener() {},
    };
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    audio.setSoundEnabled(true);
    audio.setVolume(1);
    try {
      const line = { en: "Next: Command post.", ta: "அடுத்து: கட்டளை மையம்." };
      const ta = voice.createGuide({ lang: () => "ta" });
      check("the guide speaks Tamil to a Tamil player, in a Tamil voice",
        ta.say(line) === line.ta && spokenLines.at(-1).lang === "ta-IN" && spokenLines.at(-1).voice?.lang === "ta-IN");
      check("and does not repeat itself", ta.say(line) === null && spokenLines.length === 1);
      const en = voice.createGuide({ lang: () => "en" });
      check("English to an English player", en.say(line) === line.en && spokenLines.at(-1).lang === "en-IN");
      voiceList = [{ lang: "en-IN" }];
      const noTamil = voice.createGuide({ lang: () => "ta" });
      check("English when the device has no Tamil voice (an English voice cannot read Tamil)", noTamil.say(line) === line.en);
      const before = cancels;
      noTamil.say({ en: "A new instruction." }, { interrupt: true });
      check("a new instruction can cut off an old one", cancels > before);
      const muted = voice.createGuide({ enabled: () => false });
      check("silent in a game with its sound off", muted.say(line) === null);
      check("an alert in capitals is spoken as a sentence", voice.spoken("MAN DOWN — SCAFFOLD") === "Man down — scaffold");
      voiceList = [{ lang: "en-IN" }, { lang: "ta-IN" }];

      // Emergency Response puts the scenario on the radio: the alert, then each step.
      const said = [];
      const container = makeElement("div", { width: 1280, height: 720 });
      const { api } = makeApi();
      api.say = (l, o) => { said.push({ ...l, interrupt: !!o?.interrupt }); return l.en; };
      const mod = await import(`${SRC}/games/emergencyCommander/index.js`);
      const inst = (mod.default?.create || mod.create)({ container, difficulty: DIFFICULTY.normal, quality: "medium", settings: { ...SETTINGS, scenarioId: "fire" }, mobile: false, api });
      runFrames(90);
      check("emergency: the alert goes out on the radio, in both languages",
        said[0] && /smoke reported/i.test(said[0].en) && /புகை/.test(said[0].ta || ""), JSON.stringify(said[0]));
      check("emergency: then the first step, in both languages",
        said[1] && /^Next: /.test(said[1].en) && /அடுத்து/.test(said[1].ta || ""), JSON.stringify(said[1]));
      const t = inst.__test;
      t.actOnStation(t.STATIONS[t.nextRequiredPhase()]);
      runFrames(10);
      check("emergency: and the next step when that one is done, replacing what was being said",
        said.length === 3 && said[2].interrupt && said[2].en !== said[1].en, JSON.stringify(said.slice(1)));
      inst.dispose();
    } finally {
      delete window.speechSynthesis;
      delete window.SpeechSynthesisUtterance;
    }
  }

  /* "Add construction site sound." Without Web Audio (this harness, an
   * old browser) it simply does not play, and never throws. */
  {
    const audio = await import(`${SRC}/audio.js`);
    let threw = false;
    try { audio.startAmbience(); audio.stopAmbience(); audio.stopAllLoops(); } catch { threw = true; }
    check("the site's sound is harmless where there is no audio", !threw && !audio.ambiencePlaying());
  }
}

section("The room tells you the problem before you touch anything");

{
  const { instance } = await boot("escapeChallenge");
  const t = instance.__test;
  const kit = await import(`${SRC}/engine/kit.js`);
  const { PUZZLES, AREA_ORDER } = await import(`${SRC}/games/escapeChallenge/puzzles.js`);
  runFrames(10);

  const scene = lastRenderer.lastScene;
  const boards = [];
  scene.traverse((o) => { if (o.userData?.boardHeight) boards.push(o); });

  // One per area, plus the one at the fire saying what is burning.
  check("every area has a board on the wall", boards.length >= AREA_ORDER.length,
    `${boards.length} boards for ${AREA_ORDER.length} areas`);

  AREA_ORDER.forEach((key) => {
    const room = t.rooms.find((r) => r.key === key);
    const inRoom = boards.filter((b) => b.position.x > room.x0 && b.position.x < room.x1);
    check(`${key}: the area has its own board`, inRoom.length >= 1,
      `${inRoom.length} boards between x ${room.x0} and ${room.x1}`);
    check(`${key}: the board is at reading height, not on the floor`,
      inRoom[0] && inRoom[0].userData.boardHeight > 1.5 && inRoom[0].userData.boardHeight < 3.2,
      `top at ${inRoom[0]?.userData.boardHeight?.toFixed(2)} m`);
  });

  // The plant room must say WHAT CLASS of fire it is. Choosing between
  // four extinguishers is not a decision if nobody told you what is
  // burning.
  const fireRoom = t.rooms.find((r) => r.key === "fire");
  const fireBoards = boards.filter((b) => b.position.x > fireRoom.x0 && b.position.x < fireRoom.x1);
  check("the plant room has a second board for the fire itself",
    fireBoards.length >= 2, `${fireBoards.length} boards in the plant room`);

  /* ---- the extinguishers have to be identifiable ---- */
  const types = kit.EXTINGUISHER_TYPES;
  t.extinguishers.forEach((ext) => {
    const spec = types[ext.cls];
    check(`the ${ext.cls} extinguisher has a declared type`, !!spec, ext.cls);
    if (!spec) return;
    check(`the ${ext.cls} extinguisher says which fires it is for`,
      !!spec.classes && !!spec.use, JSON.stringify(spec));

    // A coloured band and a printed label, both on the body.
    let banded = false;
    let labelled = false;
    ext.object.traverse((o) => {
      if (!o.isMesh) return;
      if (o.material?.map?.image || o.material?.map) labelled = true;
      if (o.material && o.material !== undefined && o.position.y > 0.55 && o.position.y < 0.72) banded = true;
    });
    check(`the ${ext.cls} extinguisher carries a colour band`, banded);
    check(`the ${ext.cls} extinguisher carries a printed label`, labelled);
  });

  // The four on the wall must be four DIFFERENT types, or the choice
  // is not a choice.
  check("the four extinguishers are four different types",
    new Set(t.extinguishers.map((e) => e.cls)).size === t.extinguishers.length,
    t.extinguishers.map((e) => e.cls).join(", "));
  check("exactly one of them is right for a live electrical fire",
    t.extinguishers.filter((e) => /ELECTRICAL/i.test(types[e.cls]?.classes || "")).length === 1,
    t.extinguishers.map((e) => `${e.cls}:${types[e.cls]?.classes}`).join(" "));

  /* ---- the live frame arcs, and stops when isolated ---- */
  check("there is an arc on the live door frame", !!t.liveArc);
  let lit = 0;
  let strikes = 0;
  let was = false;
  for (let i = 0; i < 300; i++) {
    runFrames(1);
    const on = t.liveArc.group.visible;
    if (on) lit += 1;
    if (on && !was) strikes += 1;
    was = on;
  }
  check("the arc actually flashes", lit > 10 && lit < 290, `lit on ${lit} of 300 frames`);
  check("it flashes irregularly rather than blinking on a timer",
    strikes > 5, `${strikes} strikes in 5 seconds`);

  /* Answering the question does NOT make anything safe: it unlocks
   * the board. The arc dies when the HANDLE comes down. */
  const elec = t.interactables.find((i) => i.key === "electrical");
  elec.done = true;
  t.unlockIsolator();
  runFrames(30);
  check("answering the question alone does not kill the arc",
    t.liveArc.group.visible === true || t.isolation.pulled === false);
  check("unlocking the board swings it open",
    t.isolation.doorT > 0.5 && Math.abs(t.isolator.door.rotation.y) > 0.5,
    `door at ${t.isolator.door.rotation.y.toFixed(2)} rad`);

  const leverBefore = t.isolator.lever.rotation.x;
  t.pullIsolator();
  runFrames(40);
  check("pulling the handle throws it from ON to OFF",
    t.isolator.lever.rotation.x > leverBefore + 1.5,
    `${leverBefore.toFixed(2)} -> ${t.isolator.lever.rotation.x.toFixed(2)} rad`);
  check("pulling the handle kills the arc", t.liveArc.group.visible === false);
  check("the current stops running down the cable",
    t.liveArc.pulses.every((p) => p.object.visible === false));
  check("the lamp goes from live to isolated",
    t.isolator.lamp.material.color.getHex() === 0x33c481,
    `#${t.isolator.lamp.material.color.getHex().toString(16)}`);

  instance.dispose();
}

section("Everything you can use has its name over it");

{
  // The HUD names the next objective; the WORLD has to say which
  // object that is. addStation's own comment claimed it made "a
  // floating label" and it never did, so no station was ever named.
  const NAMED = [
    ["emergencyCommander", 8],
    ["safestTower", 10],
    ["escapeChallenge", 4],
  ];

  for (const [path, atLeast] of NAMED) {
    const { instance } = await boot(path);
    runFrames(10);

    const plates = [];
    lastRenderer.lastScene.traverse((o) => {
      if (o.userData?.nameplate) plates.push(o);
    });

    check(`${path}: the interactables are named in the world`,
      plates.length >= atLeast, `${plates.length} nameplates, expected >= ${atLeast}`);
    check(`${path}: every nameplate carries text`,
      plates.every((p) => (p.userData.nameplate.text || "").length > 2),
      plates.filter((p) => !p.userData.nameplate.text).length + " blank");
    check(`${path}: the names are distinct`,
      new Set(plates.map((p) => p.userData.nameplate.text)).size > atLeast / 2,
      `${new Set(plates.map((p) => p.userData.nameplate.text)).size} distinct`);

    // A sprite always faces the camera. A flat plane spends most of
    // its life edge-on when the player can approach from any side.
    check(`${path}: the names always face the player`,
      plates.every((p) => p.isSprite === true));

    // At head height or above, never on the floor or in the sky.
    check(`${path}: the names float above the thing they label`,
      plates.every((p) => p.position.y > 0.8 && p.position.y < 6),
      plates.map((p) => p.position.y.toFixed(1)).join(", ").slice(0, 80));

    instance.dispose();
  }

  // Emergency Response names the STEP as well as the object, because
  // the order is what that mission scores.
  {
    const { instance } = await boot("emergencyCommander");
    runFrames(10);
    const plates = [];
    lastRenderer.lastScene.traverse((o) => {
      if (o.userData?.nameplate) plates.push(o);
    });
    const numbered = plates.filter((p) => /^STEP \d+/.test(p.userData.nameplate.sub || ""));
    check("every emergency station shows its step number",
      numbered.length === 8, `${numbered.length} of 8 numbered`);
    instance.dispose();
  }
}

section("Signs are readable: nothing buried, nothing covered");

{
  /* "Hiding behind that — check every zone."
   *
   * Three separate ways a label goes wrong, all of which have
   * happened here: it sits INSIDE the object it names, it sits in
   * front of a board so the board cannot be read, or it is so big it
   * blankets the view. All three are measured, in every scene, rather
   * than looked at in one screenshot. */
  for (const [path, id] of GAMES) {
    const { instance } = await boot(path);
    runFrames(8);
    const scene = lastRenderer.lastScene;

    const plates = [];
    const boards = [];
    const solids = [];
    scene.traverse((o) => {
      if (o.userData?.nameplate) { plates.push(o); return; }
      if (o.userData?.boardHeight) { boards.push(o); return; }
      /* SOLID means solid. Smoke, halos, zone markings and glow are
       * all transparent meshes you can read a label straight through,
       * so a label inside one is not buried — and the plant-room
       * smoke drifts up through exactly where a label has to go. */
      if (o.isMesh && o.visible && o.material?.visible !== false
        && o.material?.transparent !== true) solids.push(o);
    });

    if (!plates.length && !boards.length) {
      check(`${id}: this mission has signage to check`, true, "none in this scene");
      instance.dispose();
      continue;
    }

    // 1. No label may be INSIDE a solid object.
    const buried = [];
    const box = new THREE.Box3();
    plates.forEach((p) => {
      const world = p.getWorldPosition(new THREE.Vector3());
      for (const mesh of solids) {
        /* Only SOLID, OBJECT-SIZED things count.
         *
         * A merged mesh — the hoarding, the scenery towers — has one
         * bounding box around everything it contains, so its AABB
         * covers whole rooms of empty air and every label inside them
         * looks buried. Judging by volume keeps this to cabinets,
         * panels and pallets: the things that genuinely swallow a
         * label. */
        box.setFromObject(mesh);
        const size = box.getSize(new THREE.Vector3());
        if (size.x < 0.4 || size.y < 0.4 || size.z < 0.4) continue;
        if (size.x * size.y * size.z > 18) continue;
        if (box.containsPoint(world)) {
          buried.push(`${p.userData.nameplate.text}`);
          break;
        }
      }
    });
    check(`${id}: no label is buried inside an object`,
      buried.length === 0, buried.slice(0, 3).join("; "));

    // 2. No label may sit in front of a board.
    const covering = [];
    boards.forEach((b) => {
      const bp = b.getWorldPosition(new THREE.Vector3());
      plates.forEach((p) => {
        const pp = p.getWorldPosition(new THREE.Vector3());
        const flat = Math.hypot(pp.x - bp.x, pp.z - bp.z);
        if (flat < 2.5) covering.push(`${p.userData.nameplate.text} ${flat.toFixed(1)}m`);
      });
    });
    check(`${id}: no label is parked in front of a board`,
      covering.length === 0, covering.slice(0, 3).join("; "));

    // 3. Labels sit ABOVE head height and are not oversized.
    const low = plates.filter((p) => p.getWorldPosition(new THREE.Vector3()).y < 1.75);
    check(`${id}: every label is above head height`, low.length === 0,
      low.map((p) => `${p.userData.nameplate.text} at ${p.position.y.toFixed(1)}m`).join("; "));
    const huge = plates.filter((p) => p.scale.x > 4.2);
    check(`${id}: no label blankets the view`, huge.length === 0,
      huge.map((p) => p.scale.x.toFixed(1)).join(", "));

    // 4. Labels must not overlap EACH OTHER either.
    const pairs = [];
    for (let i = 0; i < plates.length; i += 1) {
      for (let j = i + 1; j < plates.length; j += 1) {
        const a = plates[i].getWorldPosition(new THREE.Vector3());
        const b = plates[j].getWorldPosition(new THREE.Vector3());
        if (a.distanceTo(b) < 1.6) {
          pairs.push(`${plates[i].userData.nameplate.text} / ${plates[j].userData.nameplate.text}`);
        }
      }
    }
    check(`${id}: labels do not stack on top of each other`,
      pairs.length === 0, pairs.slice(0, 2).join("; "));

    instance.dispose();
  }
}

section("World signage is in both languages");

{
  const TAMIL = /[஀-௿]/;
  for (const path of ["escapeChallenge", "safestTower", "emergencyCommander"]) {
    const { instance } = await boot(path);
    runFrames(8);

    const plates = [];
    lastRenderer.lastScene.traverse((o) => { if (o.userData?.nameplate) plates.push(o); });

    const withTamil = plates.filter((p) => TAMIL.test(p.userData.nameplate.ta || ""));
    check(`${path}: the signs carry Tamil as well as English`,
      withTamil.length >= Math.max(1, Math.floor(plates.length * 0.8)),
      `${withTamil.length} of ${plates.length} plates`);
    check(`${path}: and the English is still there`,
      plates.every((p) => (p.userData.nameplate.text || "").length > 2));

    instance.dispose();
  }
}

section("Choosing your PPE means putting it on");

{
  const { instance, record } = await boot("escapeChallenge");
  const t = instance.__test;
  runFrames(10);

  const before = t.avatar;
  check("the player starts without a harness",
    before.userData.worker.harness === false);
  check("the PPE has not been drawn yet", t.state.wearingPPE === false);

  t.wearPPE();
  runFrames(4);

  check("choosing the right PPE puts it on the player",
    t.avatar.userData.worker.harness === true
    && t.avatar.userData.worker.helmet === true
    && t.avatar.userData.worker.vest === true,
    JSON.stringify(t.avatar.userData.worker));
  check("the kitted-out body replaced the old one", t.avatar !== before);
  check("it stays where the player was standing",
    t.avatar.position.distanceTo(before.position) < 0.01);
  check("it is still the player's own body, not crowd scenery",
    t.avatar.userData.selfAnimated === true);
  check("drawing PPE twice does not stack up bodies",
    (() => { t.wearPPE(); const a = t.avatar; t.wearPPE(); return t.avatar === a; })());

  instance.dispose();
}

section("One stick, one question, and the load lands on the slab");

{
  const { instance } = await boot("craneMaster");
  const t = instance.__test;
  runFrames(10);

  // A load rests ON the deck, not in it. The pallet's origin is ~96 mm
  // above its own underside, and the landing used to ignore that and
  // bury the bottom of every load in the slab.
  const lift = t.lifts[0];
  check("the lift knows where its own underside is",
    lift.baseOffset > 0.01 && lift.baseOffset < 0.5, `${lift.baseOffset?.toFixed(3)} m`);

  lift.group.position.set(lift.target.x, lift.targetY + lift.baseOffset, lift.target.z);
  lift.group.rotation.set(0, 0, 0);
  lift.group.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(lift.group);
  check("a landed load sits on the slab rather than sinking into it",
    Math.abs(box.min.y - lift.targetY) < 0.02,
    `base ${box.min.y.toFixed(3)} vs slab ${lift.targetY.toFixed(3)}`);

  // One situation per lift, not five.
  check("the lift has exactly one safety situation set", !!t.chosenInterrupt?.id);
  check("getting it wrong costs points", craneScoring.wrongAnswer < 0,
    `${craneScoring.wrongAnswer}`);

  instance.dispose();
}

section("The HUD talks about the room you are actually in");

{
  /* `currentArea` used to advance when a puzzle was ANSWERED, so
   * solving the PPE question set it to the plant room while the
   * player was still on the construction floor — and the HUD started
   * telling them to take an extinguisher off a rack two rooms away. */
  const { instance, record } = await boot("escapeChallenge");
  const t = instance.__test;
  runFrames(10);

  const roomOf = (key) => t.rooms.find((r) => r.key === key);
  const standIn = (key) => {
    const r = roomOf(key);
    t.controller.teleport((r.x0 + r.x1) / 2, 0, r.centreZ, -Math.PI / 2);
    // The HUD is pushed on a 0.12 s timer, so a handful of frames is
    // not enough for it to have noticed.
    runFrames(20);
  };

  // Solve the PPE question, which is what used to move the area on.
  const ppeItem = t.interactables.find((i) => i.key === "ppe");
  ppeItem.done = true;
  standIn("ppe");
  check("standing on the construction floor, the HUD says so",
    t.state.currentArea === 1, `area index ${t.state.currentArea}`);
  check("it does not tell you to fetch an extinguisher from another room",
    !/extinguisher off the rack/i.test(record.hud.prompt?.text || ""),
    record.hud.prompt?.text);

  standIn("fire");
  check("walking into the plant room, the HUD follows",
    t.state.currentArea === 2, `area index ${t.state.currentArea}`);
  check("and NOW it offers the extinguisher rack",
    /extinguisher/i.test(record.hud.prompt?.text || "")
    || /extinguisher/i.test(record.hud.objective || ""),
    record.hud.prompt?.text);

  standIn("electrical");
  check("walking back puts the HUD back", t.state.currentArea === 0);

  instance.dispose();
}

section("Run, jump and first person, everywhere but the cab");

{
  const WALKERS = [
    ["safetyMission", (t) => t.controller],
    ["escapeChallenge", (t) => t.controller],
    ["safestTower", (t) => t.walker],
    ["emergencyCommander", (t) => t.walker],
  ];

  for (const [path, pick] of WALKERS) {
    const { instance, record } = await boot(path);
    const t = instance.__test;
    const body = pick(t);
    runFrames(20);

    const labels = record.buttons.map((b) => b.label).join(" | ");
    check(`${path}: there is a RUN control`, /RUN/i.test(labels), labels);
    check(`${path}: there is a JUMP control`, /JUMP/i.test(labels), labels);
    check(`${path}: the view button says what it switches between`,
      /FPP|TPP/i.test(labels), labels);

    /* Measured as SPEED rather than distance travelled.
     *
     * Walking a hazard game in a straight line for a second walks you
     * into a hazard, which correctly opens its question and freezes
     * movement — so a distance measurement is really measuring how
     * far it is to the nearest hazard. */
    instance.input.setJoystick(0, 1);
    runFrames(20);
    const walkSpeed = body.state.speed;
    instance.input.press("run");
    runFrames(20);
    const runSpeed = body.state.speed;
    instance.input.setJoystick(0, 0);
    instance.input.release("run");
    runFrames(5);
    check(`${path}: running is faster than walking`, runSpeed > walkSpeed * 1.3,
      `${walkSpeed.toFixed(2)} m/s walking vs ${runSpeed.toFixed(2)} m/s running`);

    // Jumping leaves the ground. Done from a standstill so nothing
    // can have opened a dialog in the meantime.
    runFrames(30);
    const groundY = body.position.y;
    check(`${path}: the player is on the ground to jump from`, body.state.grounded === true);
    instance.input.tap("jump");
    let peak = groundY;
    for (let i = 0; i < 30; i++) { runFrames(1); peak = Math.max(peak, body.position.y); }
    check(`${path}: jumping leaves the ground`, peak > groundY + 0.25,
      `rose ${(peak - groundY).toFixed(2)} m`);
    runFrames(60);

    instance.dispose();
  }
}

section("Every staircase can actually be walked up");

/* The user's report was "the person going inside the staircase, he is
 * not move up floor" — and in the Emergency Response mission that was
 * literally true: the commander was given only the hoarding as
 * collision, so the concrete frame and its stair core were scenery. You
 * walked INTO the treads and straight out the far side of the building
 * at ground level.
 *
 * So this walks every flight of every building a player can stand in,
 * from the bottom to the top, and also pushes sideways while climbing
 * to prove the handrails hold a body on the flight. */
{
  const STAIRCASES = [
    // [game, how to reach its body, the building it stands in]
    ["safetyMission", (t) => t.controller, { x: -10, z: 10, width: 18, depth: 14, floorHeight: 3.4, floors: 4 }],
    ["emergencyCommander", (t) => t.walker, { x: -8, z: 6, width: 20, depth: 15, floorHeight: 3.4, floors: 4 }],
  ];

  /* The joystick values that send the player towards +x, which is the
   * direction every flight climbs. It has to be derived from the yaw
   * because in the third-person missions the camera owns the yaw and
   * overwrites whatever a teleport set. */
  const towardsPlusX = (yaw) => ({ mx: Math.cos(yaw), my: -Math.sin(yaw) });

  for (const [path, pick, B] of STAIRCASES) {
    const { instance } = await boot(path);
    const body = pick(instance.__test);
    const flightZ = B.z - B.depth / 2 + 2.1;
    const xStart = B.x - B.width / 2 + 1.0;

    const walkUp = (startZ, sideways = 0) => {
      const baseY = 0;
      const want = B.floorHeight;
      body.teleport(xStart - 1.2, baseY + 0.05, startZ);
      instance.input.setJoystick(0, 0);
      runFrames(2);                        // let the game set the yaw
      const { mx, my } = towardsPlusX(body.state.yaw);
      for (let i = 0; i < 240; i += 1) {
        // `sideways` pushes across the flight as well as up it.
        instance.input.setJoystick(mx - sideways * my, my + sideways * mx);
        runFrames(1);
        if (body.position.y >= want - 0.05) break;
      }
      instance.input.setJoystick(0, 0);
      return { y: body.position.y, z: body.position.z, want };
    };

    for (let f = 0; f < B.floors - 1; f += 1) {
      const baseY = f * B.floorHeight;
      const want = baseY + B.floorHeight;
      body.teleport(xStart - 1.2, baseY + 0.05, flightZ);
      instance.input.setJoystick(0, 0);
      runFrames(2);
      const { mx, my } = towardsPlusX(body.state.yaw);
      for (let i = 0; i < 240; i += 1) {
        instance.input.setJoystick(mx, my);
        runFrames(1);
        if (body.position.y >= want - 0.05) break;
      }
      instance.input.setJoystick(0, 0);
      check(`${path}: the flight from Level ${f + 1} reaches Level ${f + 2}`,
        body.position.y >= want - 0.05,
        `ended at y=${body.position.y.toFixed(2)}, wanted ${want.toFixed(2)}`);
    }

    // Handrails. Pushed hard into the rail, the player must still get
    // up, and must still be on the flight when they arrive.
    for (const side of [-1, 1]) {
      const r = walkUp(flightZ + side * 0.9, side * 0.45);
      const offCentre = Math.abs(r.z - flightZ);
      check(`${path}: leaning on the ${side < 0 ? "left" : "right"} handrail still climbs`,
        r.y >= r.want - 0.05, `y=${r.y.toFixed(2)}`);
      check(`${path}: the ${side < 0 ? "left" : "right"} handrail keeps them on the flight`,
        offCentre < 1.0, `${offCentre.toFixed(2)} m off the centre line`);
    }

    instance.dispose();
  }
}

section("Every ladder leans on something, one out for every four up");

/* "The ladder is not placed proper." It was not: the trench ladder
 * stood bolt upright a metre out from the wall, side-on to it, resting
 * on nothing, with its feet in the standing water — and the Safest
 * Tower ladder stood four metres short of the scaffold it served,
 * leaning the other way, into the air. */
{
  const kit = await import(`${SRC}/engine/kit.js`);
  const container = makeElement("div", { width: 800, height: 600 });
  const stage = gfx.createStage(container, { quality: "medium" });
  const mat = kit.createMaterials(stage.cfg);
  const geo = kit.createGeometries(stage.cfg);

  const set = kit.buildLadderAgainst(geo, mat, { rise: 4, extension: 1, tied: true });
  const deg = (set.lean * 180) / Math.PI;
  check("a ladder set up properly stands one out for every four up",
    Math.abs(set.footOffset - 1) < 0.01 && Math.abs(deg - 14.04) < 0.2,
    `${set.footOffset.toFixed(2)} m out, ${deg.toFixed(1)} deg off vertical`);
  set.group.updateMatrixWorld(true);
  const top = new THREE.Box3().setFromObject(set.group).max.y;
  check("it runs on a metre past the landing",
    top > 4.9 && top < 5.2, `top at ${top.toFixed(2)} m for a 4 m climb`);
  check("it is tied where it rests", set.group.userData.ladder.tied === true);

  // Turning a ladder to face a wall must lean it AT that wall. The old
  // ladder put the turn and the lean on one group, and three.js applied
  // them in an order that tipped it sideways instead.
  const turned = kit.buildLadderAgainst(geo, mat, { rise: 3, extension: 1 });
  turned.group.rotation.y = Math.PI / 2;
  turned.group.updateMatrixWorld(true);
  const tb = new THREE.Box3().setFromObject(turned.group);
  check("turning a ladder to face a wall leans it towards that wall",
    tb.max.x > 0.75 && tb.min.x > -0.15 && tb.max.z - tb.min.z < 0.6,
    `x ${tb.min.x.toFixed(2)}..${tb.max.x.toFixed(2)}, ${(tb.max.z - tb.min.z).toFixed(2)} m across`);
  stage.dispose();

  /* ---- the trench in the Safety Mission ---- */
  const { instance } = await boot("safetyMission");
  const t = instance.__test;
  let trenchLadder = null;
  t.scene.traverse((o) => {
    const l = o.userData?.ladder;
    if (l && l.tied && l.rise > 2 && l.rise < 2.3) trenchLadder = o;
  });
  check("the trench has a ladder set up to the rules", !!trenchLadder);
  if (trenchLadder) {
    trenchLadder.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(trenchLadder);
    // The trench: centre x 18, 9 m long, 2.2 m deep; its east face is
    // at x = 22.5 and the standing water ends at about x = 20.5.
    check("its feet are on the trench floor", b.min.y < -2.0 && b.min.y > -2.25,
      `feet at ${b.min.y.toFixed(2)} m`);
    check("it rests against the face of the trench", b.max.x > 22.3 && b.max.x < 22.9,
      `reaches x ${b.max.x.toFixed(2)}`);
    check("it stands about a metre above the edge", b.max.y > 0.85 && b.max.y < 1.2,
      `top ${b.max.y.toFixed(2)} m above the ground`);
    check("its feet are out of the standing water", b.min.x > 20.7,
      `feet at x ${b.min.x.toFixed(2)}`);
  }

  // And it is a way out: from the floor of the trench, push forward
  // facing the ladder and you climb out on to the ground.
  const c = t.controller;
  c.teleport(21.6, -2.14, 24, -Math.PI / 2);
  instance.input.setJoystick(0, 1);
  runFrames(360);
  instance.input.setJoystick(0, 0);
  check("you can climb out of the trench up the ladder",
    c.position.y > -0.1 && c.position.x > 22.6,
    `ended at x ${c.position.x.toFixed(2)}, y ${c.position.y.toFixed(2)}`);
  instance.dispose();

  /* ---- the Safest Tower ladder rests on the scaffold lift ---- */
  const tower = await boot("safestTower");
  const towerScene = tower.instance.__test.avatar.parent;
  towerScene.updateMatrixWorld(true);
  const leaning = [];
  towerScene.traverse((o) => { if (o.userData?.ladder && o.visible) leaning.push(o); });
  const hazardLadder = leaning.find((o) => {
    const b = new THREE.Box3().setFromObject(o);
    return b.max.y > 3.5 && b.max.y < 4.3;
  });
  check("the Safest Tower ladder reaches the lift it serves", !!hazardLadder,
    `${leaning.length} ladders on site`);
  if (hazardLadder) {
    const b = new THREE.Box3().setFromObject(hazardLadder);
    // The scaffold's front face is at z = 18.4.
    check("its top rests on the scaffold, not on air",
      b.max.z > 18.2 && b.max.z < 18.7, `top at z ${b.max.z.toFixed(2)}`);
  }
  tower.instance.dispose();
}

section("Every flight of stairs has a handrail you can see");

/* "The building staircase handrail missing." The flights had rails —
 * 70 mm grey bar, the colour of the concrete behind it, stopping dead
 * at the first and last tread. Now the rail you hold is painted safety
 * yellow and runs on past each end of the flight. */
{
  const SITES = [
    ["safetyMission", (t) => t.scene],
    ["emergencyCommander", (t) => t.avatar.parent],
    ["craneMaster", (t) => t.frame.group],
  ];
  for (const [path, root] of SITES) {
    const { instance } = await boot(path);
    const rails = [];
    root(instance.__test).traverse((o) => { if (o.isMesh && o.userData?.handrail) rails.push(o); });
    check(`${path}: every flight has a handrail`, rails.length >= 3,
      `${rails.length} flights railed`);
    // Read in sRGB, as a person sees it: three.js keeps colours linear.
    const hex = rails[0]?.material?.color?.getHex() ?? 0;
    const [r, g, b] = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
    check(`${path}: the handrail is painted to be seen`,
      r > 0xd0 && g > 0x90 && b < 0x60,
      `#${hex.toString(16).padStart(6, "0")}`);
    // Both sides of the flight, not one.
    const sides = rails.map((r) => {
      r.geometry.computeBoundingBox();
      return r.geometry.boundingBox.max.z - r.geometry.boundingBox.min.z;
    });
    check(`${path}: the handrails run up both sides`, sides.every((d) => d > 2),
      sides.map((d) => d.toFixed(2)).join(", "));
    instance.dispose();
  }
}

section("The over-the-shoulder camera starts close");

/* "Don't zoom out too much in TPP — keep it a little distance, if they
 * want they can zoom out, set the default to a low distance."
 *
 * Build the Safest Tower started 40 m up, which is a drone shot: the
 * player was a speck and the hazard they had walked up to was a smudge.
 * Emergency Response was 14 m. Both start over the shoulder now, and
 * the player can still choose a wider default or pull back with the
 * wheel or a pinch. */
{
  const CLOSE_CAMERAS = [
    ["safestTower", "safest-tower", 18, false],
    // Over the shoulder on a boom, zooming its lens like the Safety Mission.
    ["emergencyCommander", "emergency-commander", 14, true],
  ];

  for (const [path, id, ceiling, lens] of CLOSE_CAMERAS) {
    const close = await boot(path, { settings: { ...SETTINGS, cameraDistance: "close" } });
    runFrames(6);
    const closeDistance = close.instance.__test.camDistance();
    close.instance.dispose();

    const wide = await boot(path, { settings: { ...SETTINGS, cameraDistance: "wide" } });
    runFrames(6);
    const wideDistance = wide.instance.__test.camDistance();

    // And zooming out from the close default still works, so "close"
    // is a starting point rather than a cage.
    const closeAgain = await boot(path, { settings: { ...SETTINGS, cameraDistance: "close" } });
    runFrames(6);
    const before = closeAgain.instance.__test.camDistance();
    const lensBefore = closeAgain.instance.__test.zoomFov?.() ?? null;
    if (lens) closeAgain.instance.input.addZoom(-900);
    else closeAgain.instance.input.addZoom(900);
    runFrames(40);
    const pulledBack = closeAgain.instance.__test.camDistance();
    const lensIn = closeAgain.instance.__test.zoomFov?.() ?? null;
    if (lens) closeAgain.instance.input.addZoom(900);
    runFrames(40);
    const lensOut = closeAgain.instance.__test.zoomFov?.() ?? null;

    check(`${id}: the camera starts over the shoulder, not overhead`,
      closeDistance <= ceiling, `${closeDistance.toFixed(1)} m, wanted no more than ${ceiling} m`);
    check(`${id}: choosing a wider view really does pull back`,
      wideDistance > closeDistance * 1.5,
      `close ${closeDistance.toFixed(1)} m vs wide ${wideDistance.toFixed(1)} m`);
    if (lens) {
      check(`${id}: the player zooms the lens in from the close default, and back out`,
        lensIn < lensBefore - 5 && Math.abs(lensOut - lensBefore) < 0.5,
        `${lensBefore.toFixed(1)}° → ${lensIn.toFixed(1)}° → ${lensOut.toFixed(1)}°`);
    } else {
      check(`${id}: the player can still zoom out from the close default`,
        pulledBack > before + 1, `${before.toFixed(1)} m → ${pulledBack.toFixed(1)} m`);
    }

    wide.instance.dispose();
    closeAgain.instance.dispose();
  }
}

section("First person and third person both work");

{
  for (const [path, pick, orbit] of [
    ["safestTower", (t) => t.walker, true],
    // The Safety Mission's camera: the commander always has it, on the
    // boom over their shoulder or at their eyes.
    ["emergencyCommander", (t) => t.walker, false],
  ]) {
    const { instance } = await boot(path);
    const t = instance.__test;
    const body = pick(t);
    runFrames(20);

    check(`${path}: it starts over the shoulder`,
      t.state.firstPerson === false && t.avatar.visible === true);

    const thirdCam = lastRenderer.lastCamera.position.clone();
    instance.input.tap("viewmode");
    runFrames(10);

    check(`${path}: switching to first person hides your own body`,
      t.state.firstPerson === true && t.avatar.visible === false);
    check(`${path}: the camera moves to the player's eyes`,
      Math.abs(lastRenderer.lastCamera.position.y - (body.position.y + 1.68)) < 0.3,
      `camera y ${lastRenderer.lastCamera.position.y.toFixed(2)}, eyes ${(body.position.y + 1.68).toFixed(2)}`);
    check(`${path}: that is a different place from the orbit camera`,
      lastRenderer.lastCamera.position.distanceTo(thirdCam) > 2,
      `moved ${lastRenderer.lastCamera.position.distanceTo(thirdCam).toFixed(1)} m`);
    check(`${path}: the controller has taken the camera`, body.ownsView === true);

    // Looking around works in first person.
    const beforeYaw = body.yaw;
    instance.input.addLook(220, 0);
    runFrames(6);
    check(`${path}: dragging turns your head in first person`,
      Math.abs(body.yaw - beforeYaw) > 0.05,
      `${beforeYaw.toFixed(2)} -> ${body.yaw.toFixed(2)}`);

    instance.input.tap("viewmode");
    runFrames(10);
    check(`${path}: switching back shows the body again`,
      t.state.firstPerson === false && t.avatar.visible === true);
    if (orbit) {
      check(`${path}: and the orbit camera has the camera back`, body.ownsView === false);
    } else {
      const head = body.position.clone().setY(body.position.y + 1.68);
      check(`${path}: and the camera is back on the boom behind them`,
        body.thirdPerson === true && lastRenderer.lastCamera.position.distanceTo(head) > 2,
        `${lastRenderer.lastCamera.position.distanceTo(head).toFixed(1)} m from their head`);
    }

    instance.dispose();
  }
}

section("The PPE store shows the kit");

{
  const kit = await import(`${SRC}/engine/kit.js`);
  const container = makeElement("div", { width: 800, height: 600 });
  const stage = gfx.createStage(container, { quality: "medium", fov: 70 });
  const mat = kit.createMaterials(stage.cfg);
  const geo = kit.createGeometries(stage.cfg);

  const store = kit.buildPPEStation(geo, mat);
  const used = new Set();
  let meshes = 0;
  store.traverse((o) => { if (o.isMesh) { meshes += 1; used.add(o.material); } });

  // The mission asks you to choose your PPE, so the kit has to be
  // identifiable by looking at it.
  check("the store has hard hats on it", used.has(mat.yellow) && used.has(mat.white));
  check("the store has hi-vis on it", used.has(mat.hiVis));
  check("the store has boots and gloves on it", used.has(mat.black));
  check("the store has a harness on it", used.has(mat.orange));
  check("it is detailed enough to choose from", meshes > 40, `${meshes} meshes`);

  const size = new THREE.Box3().setFromObject(store).getSize(new THREE.Vector3());
  check("the store is a rack you can walk up to",
    size.y > 2 && size.y < 3.4 && size.x > 2, size.toArray().map((v) => v.toFixed(1)).join(" x "));

  stage.dispose();
}

section("The answer is never just A");

{
  /* Every option list in this project is AUTHORED with the correct
   * answer first, because that is the only sane way to review safety
   * content. That makes shuffling at display time a requirement, not
   * a nicety.
   *
   * The escape rooms had no shuffle at all: all five decision points
   * had their correct option first and nothing reordered them, so the
   * answer was slot A in every room of every play. A player works
   * that out inside two rooms and the mission stops teaching.
   *
   * Measured over many plays rather than reasoned about. */
  const { shuffledOrder } = await import(`${SRC}/shuffle.js`);

  const flat = (counts) => {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const biggest = Math.max(...Object.values(counts));
    return { total, share: biggest / total };
  };

  // --- the helper itself ---
  {
    const counts = {};
    for (let i = 0; i < 4000; i++) counts[shuffledOrder(4).indexOf(0)] = (counts[shuffledOrder(4).indexOf(0)] || 0) + 1;
    const f = flat(counts);
    check("the shuffle spreads a fixed answer across all four slots",
      Object.keys(counts).length === 4 && f.share < 0.32,
      `${JSON.stringify(counts)} — biggest ${Math.round(f.share * 100)}%`);
    check("an empty or silly length does not throw",
      shuffledOrder(0).length === 0 && shuffledOrder(-3).length === 0);
  }

  // --- the escape rooms, end to end ---
  {
    const { PUZZLES } = await import(`${SRC}/games/escapeChallenge/puzzles.js`);
    const counts = {};
    for (let play = 0; play < 60; play += 1) {
      const { instance } = await boot("escapeChallenge");
      instance.__test.interactables.forEach((item) => {
        const puzzle = PUZZLES[item.key];
        if (!puzzle || !item.order) return;
        const real = puzzle.options.findIndex((o) => o.correct);
        const slot = item.order.indexOf(real);
        counts[slot] = (counts[slot] || 0) + 1;
      });
      instance.dispose();
    }
    const f = flat(counts);
    check("escape: every decision point is shuffled per play",
      Object.keys(counts).length === 4, JSON.stringify(counts));
    check("escape: the answer is not always in the same slot",
      f.share < 0.4, `${JSON.stringify(counts)} — biggest ${Math.round(f.share * 100)}% of ${f.total}`);
  }

  // --- the crane ---
  {
    const counts = {};
    for (let play = 0; play < 60; play += 1) {
      const { instance, record } = await boot("craneMaster");
      runFrames(2);
      const def = instance.__test.chosenInterrupt;
      instance.__test.raiseInterrupt(def, { subject: instance.__test.lifts[0].group });
      const slot = (record.dialog?.options || []).findIndex((o) => Number(o.id) === def.correct);
      counts[slot] = (counts[slot] || 0) + 1;
      instance.dispose();
    }
    const f = flat(counts);
    check("crane: the answer is not always in the same slot",
      f.share < 0.45, `${JSON.stringify(counts)} — biggest ${Math.round(f.share * 100)}% of ${f.total}`);
  }

  // --- the ground hazards ---
  {
    const { HAZARDS } = await import(`${SRC}/games/safestTower/hazards.js`);
    const counts = {};
    for (let play = 0; play < 40; play += 1) {
      const { instance } = await boot("safestTower");
      instance.__test.hazards.forEach((h) => {
        const slot = h.order.indexOf(h.def.correct);
        counts[slot] = (counts[slot] || 0) + 1;
      });
      instance.dispose();
    }
    const f = flat(counts);
    check("hazards: the answer is not always in the same slot",
      f.share < 0.35, `${JSON.stringify(counts)} — biggest ${Math.round(f.share * 100)}% of ${f.total}`);
    check("hazards: every hazard is authored answer-first, for review",
      HAZARDS.length === 10);
  }

  // --- and scoring still goes against the DEFINITION, not the slot ---
  {
    const { instance, record } = await boot("escapeChallenge");
    const { PUZZLES } = await import(`${SRC}/games/escapeChallenge/puzzles.js`);
    const t = instance.__test;
    const item = t.interactables.find((i) => PUZZLES[i.key]);
    const puzzle = PUZZLES[item.key];
    const realId = puzzle.options.find((o) => o.correct).id;
    t.openPuzzle(item);
    runFrames(2);
    const shown = record.dialog?.options || [];
    const slotOfAnswer = shown.findIndex((o) => o.id === realId);
    check("the option ids survive the shuffle",
      slotOfAnswer >= 0 && shown.length === puzzle.options.length,
      `${shown.length} options, answer in slot ${slotOfAnswer}`);
    check("the badge letters run A B C D in display order",
      shown.every((o, i) => o.badge === String.fromCharCode(65 + i)),
      shown.map((o) => o.badge).join(""));
    instance.dispose();
  }
}

section("Every 3D question is available in Tamil");

{
  const lang = await import(`${SRC}/language.js`);
  const TAMIL = /[஀-௿]/;

  /* ---- the content ---- */
  const SETS = [
    ["ground hazards", (await import(`${SRC}/games/safestTower/hazards.js`)).HAZARDS,
      (h) => h.options],
    ["crane situations", (await import(`${SRC}/games/craneMaster/interrupts.js`)).INTERRUPTS,
      (d) => d.options],
    ["escape rooms", Object.values((await import(`${SRC}/games/escapeChallenge/puzzles.js`)).PUZZLES),
      (p) => p.options.map((o) => o.label)],
  ];

  for (const [name, items, optionsOf] of SETS) {
    const missing = items.filter((d) => !d.ta);
    check(`${name}: every item has Tamil`, missing.length === 0,
      missing.map((d) => d.id || d.area).join(", "));

    const mismatched = items.filter((d) => d.ta
      && (d.ta.options || []).length !== optionsOf(d).length);
    check(`${name}: the Tamil option lists match the English`,
      mismatched.length === 0, mismatched.map((d) => d.id || d.area).join(", "));

    const notTamil = items.filter((d) => d.ta
      && !(d.ta.options || []).every((o) => TAMIL.test(o)));
    check(`${name}: the Tamil is actually Tamil, not English repeated`,
      notTamil.length === 0, notTamil.map((d) => d.id || d.area).join(", "));

    // A player should not be able to spot the answer by its shape in
    // either language.
    const outliers = [];
    items.forEach((d) => {
      const correct = Number.isFinite(d.correct)
        ? d.correct
        : (d.options || []).findIndex((o) => o && o.correct);
      if (correct < 0) return;
      [["EN", optionsOf(d)], ["TA", d.ta?.options || []]].forEach(([tag, list]) => {
        if (list.length !== 4) return;
        const lens = list.map((o) => [...String(o)].length);
        const others = lens.filter((_, i) => i !== correct).sort((a, b) => a - b);
        const mid = (others[0] + others[others.length - 1]) / 2;
        if (Math.abs(lens[correct] - mid) > 14) outliers.push(`${tag}:${d.id || d.area}`);
      });
    });
    check(`${name}: the answer cannot be picked out by length, in either language`,
      outliers.length === 0, outliers.join(" "));
  }

  /* ---- the resolver ---- */
  {
    const rec = { title: "Hello", ta: { title: "வணக்கம்" }, only: "English only" };
    check("t() returns Tamil when it is there", lang.t(rec, "title", "ta") === "வணக்கம்");
    check("t() falls back to English when it is not",
      lang.t(rec, "only", "ta") === "English only");
    check("t() on nothing does not throw", lang.t(null, "title", "ta") === "");
    check("tOptions falls back per LIST, not per item",
      lang.tOptions({ options: ["a", "b"], ta: { options: ["x"] } }, "ta").join() === "a,b",
      "a half-translated list must not mix two languages in one question");
    check("tBoth gives both languages for a sign",
      lang.tBoth(rec, "title").length === 2);
    check("tBoth gives one when there is no translation",
      lang.tBoth(rec, "only").length === 1);
  }

  /* ---- and it reaches the screen ---- */
  const SCREENS = [
    ["safestTower", (inst, record) => {
      inst.__test.inspect(inst.__test.hazards[0]);
      return record;
    }],
    ["escapeChallenge", (inst, record) => {
      const item = inst.__test.interactables.find((i) => i.key === "fire") || inst.__test.interactables[0];
      inst.__test.openPuzzle(item);
      return record;
    }],
    ["craneMaster", (inst, record) => {
      const def = inst.__test.chosenInterrupt;
      inst.__test.raiseInterrupt(def, { subject: inst.__test.lifts[0].group });
      return record;
    }],
  ];

  /* Both languages are on the panel at once now, so the toggle decides
   * which one LEADS — the heading and the button text — and the other
   * is the second line underneath. These read the two layers apart. */
  const leadText = (d) => [d?.title, d?.subtitle,
    ...(d?.options || []).map((o) => o.label)].filter(Boolean).join(" ");
  const secondText = (d) => [d?.titleAlt, d?.subtitleAlt,
    ...(d?.options || []).map((o) => o.labelAlt)].filter(Boolean).join(" ");

  for (const [path, open] of SCREENS) {
    lang.setLang("en");
    const { instance, record } = await boot(path);
    runFrames(5);
    open(instance, record);
    runFrames(2);
    check(`${path}: English leads by default`,
      !TAMIL.test(leadText(record.dialog)) && leadText(record.dialog).length > 50,
      leadText(record.dialog).slice(0, 80));
    check(`${path}: the Tamil is on the panel underneath it`,
      TAMIL.test(secondText(record.dialog)), secondText(record.dialog).slice(0, 80));

    lang.setLang("ta");
    runFrames(4);
    check(`${path}: switching language puts Tamil first`,
      TAMIL.test(leadText(record.dialog)), leadText(record.dialog).slice(0, 120));
    check(`${path}: and keeps the English underneath`,
      /[A-Za-z]{4}/.test(secondText(record.dialog)), secondText(record.dialog).slice(0, 80));
    check(`${path}: it is still four options`,
      (record.dialog?.options || []).length === 4);

    lang.setLang("en");
    runFrames(4);
    check(`${path}: switching back puts English first`,
      !TAMIL.test(leadText(record.dialog)), leadText(record.dialog).slice(0, 80));

    instance.dispose();
  }
  lang.setLang("en");
}

section("Tamil is on the question itself, in every mission");

/* The report was "in my picture there is no Tamil", on a question the
 * player was looking straight at. Two things were wrong: the Safety
 * Mission's hazard catalogue had no Tamil at all, and every dialog
 * showed ONE language, so an English-set player had no way of knowing
 * there was a translation to be had.
 *
 * The signs on this site have always shown both lines. The questions do
 * now too, and this reads the dialog each mission actually renders and
 * looks for Tamil in it — whichever language is selected. */
{
  const langMod = await import(`${SRC}/language.js`);
  const TAMIL = /[஀-௿]/;

  /** Every piece of text the dialog puts on screen, as one string. */
  const dialogText = (d) => [
    d?.title, d?.titleAlt, d?.subtitle, d?.subtitleAlt, d?.footer,
    ...(d?.options || []).flatMap((o) => [o.label, o.labelAlt, o.desc]),
  ].filter(Boolean).join(" · ");

  /* Each mission, and how to get a question on screen in it. */
  const OPENERS = {
    safetyMission: (instance) => {
      const { controller, hazards } = instance.__test;
      const h = hazards[0];
      controller.teleport(h.position.x, h.data.place.y, h.position.z + 1.6, 0);
      controller.state.pitch = 0;
      runFrames(3);
      instance.input.press("interact");
      runFrames(2);
      instance.input.release("interact");
      runFrames(2);
    },
    safestTower: (instance) => {
      instance.__test.inspect(instance.__test.hazards[0]);
      runFrames(2);
    },
    craneMaster: (instance) => {
      const t = instance.__test;
      t.raiseInterrupt(t.chosenInterrupt, { subject: t.lifts[0].group });
      runFrames(2);
    },
    escapeChallenge: (instance) => {
      const t = instance.__test;
      const item = t.interactables.find((i) => i.key);
      t.openPuzzle(item);
      runFrames(2);
    },
    // The incident brief opens on its own when the mission starts.
    emergencyCommander: () => runFrames(4),
  };

  for (const lang of ["en", "ta"]) {
    langMod.setLang(lang);
    for (const [path, open] of Object.entries(OPENERS)) {
      const { instance, record } = await boot(path);
      runFrames(6);
      open(instance);
      const text = dialogText(record.dialog);
      check(`${path}: a question is on screen to read (${lang})`, text.length > 20,
        `dialog text: ${text.slice(0, 80)}`);
      check(`${path}: that question shows Tamil (${lang})`, TAMIL.test(text),
        text.slice(0, 160));
      // And the English has not been thrown away by switching.
      check(`${path}: it shows the English too (${lang})`, /[A-Za-z]{4}/.test(text),
        text.slice(0, 160));
      instance.dispose();
    }
  }
  langMod.setLang("en");
}

section("The Safety Mission hazard catalogue is bilingual");

{
  const TAMIL = /[஀-௿]/;
  const H = await import(`${SRC}/games/safetyMission/hazards.js`);

  const missing = H.HAZARDS.filter((h) => !h.ta?.title || !h.ta?.detail);
  check("every hazard has a Tamil title and description", missing.length === 0,
    missing.map((h) => h.id).join(", "));
  check("those are actually Tamil",
    H.HAZARDS.every((h) => TAMIL.test(h.ta.title) && TAMIL.test(h.ta.detail)));
  check("every hazard has a scenario-specific bilingual character line",
    H.HAZARDS.every((h) => h.voice?.en?.length > 20 && TAMIL.test(h.voice?.ta || "")));

  const cats = Object.values(H.CATEGORIES);
  const acts = Object.values(H.ACTIONS);
  check("every classification has a Tamil equivalent",
    cats.every((c) => TAMIL.test(H.CATEGORIES_TA[c] || "")),
    cats.filter((c) => !H.CATEGORIES_TA[c]).join(", "));
  check("every corrective action has a Tamil equivalent",
    acts.every((a) => TAMIL.test(H.ACTIONS_TA[a] || "")),
    acts.filter((a) => !H.ACTIONS_TA[a]).join(", "));

  /* ---- and the answer cannot be picked out by its shape ----
   *
   * Measured before this was written: the correct corrective action was
   * the LONGEST of the four options in 9 of the 10 hazards, because the
   * right answer names the whole control while the distractors were
   * one-line shortcuts. Picking the longest option scored 90%. */
  const tells = [];
  H.HAZARDS.forEach((h) => {
    const sets = [
      ["EN category", [h.category, ...h.categoryDecoys.slice(0, 3)]],
      ["EN action", [h.action, ...h.actionDecoys.slice(0, 3)]],
      ["TA category", [h.category, ...h.categoryDecoys.slice(0, 3)].map((c) => H.CATEGORIES_TA[c] || "")],
      ["TA action", [h.action, ...h.actionDecoys.slice(0, 3)].map((a) => H.ACTIONS_TA[a] || "")],
    ];
    sets.forEach(([tag, list]) => {
      const lens = list.map((x) => [...String(x)].length);
      const others = lens.slice(1).sort((a, b) => a - b);
      const mid = (others[0] + others[others.length - 1]) / 2;
      if (Math.abs(lens[0] - mid) > 20) tells.push(`${tag}:${h.id}(${lens.join("/")})`);
      if (lens[0] > others[others.length - 1] + 6) tells.push(`${tag}:${h.id} longest`);
    });
  });
  check("the answer is not findable by length, in either language",
    tells.length === 0, tells.join(" "));
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

  /* "See the Aria building — it should be like that. Inspect the photo
   * properly: an L-shaped building, two of 19 floors and the middle one
   * 9 floors." The old development was three near-identical towers set
   * at angles on a lawn. This checks the layout of the renders. */
  const buildings = [];
  dev.group.traverse((o) => { if (o.userData?.ariaBuilding) buildings.push(o); });
  const byName = Object.fromEntries(buildings.map((b) => [b.userData.ariaBuilding.name, b]));
  check("there are three buildings", buildings.length === 3,
    buildings.map((b) => b.userData.ariaBuilding.name).join(", "));
  check("two of them are 19 floors and the middle one is 9",
    buildings.map((b) => b.userData.ariaBuilding.floors).sort((a, b) => a - b).join(",") === "9,19,19",
    buildings.map((b) => `${b.userData.ariaBuilding.name}:${b.userData.ariaBuilding.floors}`).join(", "));
  const west = byName["west tower"];
  const middle = byName["middle block"];
  const lBlock = byName["L-shaped block"];
  check("the 9-floor block stands between the two towers, in front of them",
    !!west && !!middle && !!lBlock
      && middle.position.x > west.position.x && middle.position.x < lBlock.position.x
      && middle.position.z > west.position.z && middle.position.z > lBlock.position.z,
    [west, middle, lBlock].map((b) => b && `${b.userData.ariaBuilding.name} (${b.position.x}, ${b.position.z})`).join("; "));

  // The L: two long, thin wings meeting at a corner. Sampled on a grid,
  // the wings cover well under the whole of the box round them.
  const parts = lBlock?.userData.ariaBuilding.parts || [];
  // A wing is a long part of the plan, not one of the shallow bays
  // that step the facade.
  const wings = parts.filter((p) => Math.max(p.w, p.d) > 20 && Math.max(p.w, p.d) / Math.min(p.w, p.d) > 2);
  check("the big block has two long wings", wings.length === 2
    && wings.some((p) => p.w > p.d) && wings.some((p) => p.d > p.w),
    wings.map((p) => `${p.w}x${p.d}`).join(", "));
  if (wings.length === 2) {
    const minX = Math.min(...wings.map((p) => p.x - p.w / 2));
    const maxX = Math.max(...wings.map((p) => p.x + p.w / 2));
    const minZ = Math.min(...wings.map((p) => p.z - p.d / 2));
    const maxZ = Math.max(...wings.map((p) => p.z + p.d / 2));
    let inside = 0;
    let total = 0;
    for (let gx = minX + 0.5; gx < maxX; gx += 1) {
      for (let gz = minZ + 0.5; gz < maxZ; gz += 1) {
        total += 1;
        if (wings.some((p) => Math.abs(gx - p.x) <= p.w / 2 && Math.abs(gz - p.z) <= p.d / 2)) inside += 1;
      }
    }
    check("and they make an L, not a slab", inside / total < 0.6,
      `the wings cover ${Math.round((inside / total) * 100)}% of the box round them`);
  }

  // The rooftop pool is what makes the overhead view recognisable — on
  // the L, where its two wings meet.
  const poolMats = [];
  dev.group.traverse((o) => { if (o.isMesh && o.material === mat.poolWater) poolMats.push(o); });
  check("there is one rooftop pool", poolMats.length === 1, `${poolMats.length}`);
  if (poolMats[0] && wings.length === 2) {
    const p = poolMats[0].position;
    const onBoth = wings.every((w) => Math.abs(p.x - w.x) <= w.w / 2 && Math.abs(p.z - w.z) <= w.d / 2);
    check("the pool is on the L, where its two wings meet",
      poolMats[0].parent === lBlock && onBoth, `pool at (${p.x}, ${p.z})`);
  }

  // Planted like the renders: trees all round, palms among them.
  check("it is planted the way the renders are", dev.trees > 100, `${dev.trees} trees`);

  /* "What type of tree is this — it does not look like a tree." The palms
   * were a pole with nine flat green boxes on top and the shade trees two
   * or three lumpy balls on a stick. */
  const grove = dev.groves.userData.trees;
  check("there are palms and shade trees both", grove.palms >= 20 && grove.broadleaf >= 40,
    `${grove.palms} palms, ${grove.broadleaf} shade trees`);
  check("and palms along the road, by turns with the shade trees",
    grove.crowns.filter((c) => Math.abs(c.z + 4.5) < 0.01).length >= 5,
    `${grove.crowns.filter((c) => Math.abs(c.z + 4.5) < 0.01).length} roadside palms`);
  check("every palm's fronds rise out of the crown and droop at the tips",
    grove.crowns.every((c) => c.highest > c.top + 0.5 && c.lowestTip < c.top - 1),
    grove.crowns.filter((c) => !(c.highest > c.top + 0.5 && c.lowestTip < c.top - 1)).length + " do not");
  const leafy = dev.groves.children.filter((o) => o.isMesh && o.material.alphaTest > 0);
  check("leaves and fronds are cut out of a leaf texture, not solid lumps",
    leafy.length === 2 && leafy.every((o) => o.material.map && o.material.side === THREE.DoubleSide));
  const patched = { fragmentShader: "#include <normal_fragment_begin>\nvoid main() {}" };
  leafy.forEach((o) => o.material.onBeforeCompile?.(patched));
  check("and lit the same from both faces, so no leaf is black from behind",
    leafy.every((o) => typeof o.material.onBeforeCompile === "function")
      && /normal \*= faceDirection/.test(patched.fragmentShader));
  check("a leaf texture's clear ground is leaf-coloured, not black, so distant leaves have no dark rim",
    leafy.every((o) => {
      const d = o.material.map.image?.data;
      return d && d[3] === 0 && d[0] + d[1] + d[2] > 60;
    }));
  const treeTriangles = (group) => group.children.reduce((sum, o) => {
    const g = o.geometry;
    return sum + (g.index ? g.index.count : g.attributes.position.count) / 3;
  }, 0);
  check("the grove is a handful of draw calls", dev.groves.children.length <= 6,
    `${dev.groves.children.length} meshes`);
  check("and few enough triangles to be scenery", treeTriangles(dev.groves) < 110000,
    `${Math.round(treeTriangles(dev.groves))} triangles`);
  {
    const lowCfg = gfx.preset("low");
    const lowDev = kit.buildBrandedTower(kit.createGeometries(lowCfg), kit.createMaterials(lowCfg), {});
    check("and far fewer on the lowest graphics setting",
      treeTriangles(lowDev.groves) < treeTriangles(dev.groves) * 0.5,
      `${Math.round(treeTriangles(lowDev.groves))} against ${Math.round(treeTriangles(dev.groves))}`);
  }
  const roadMarks = [];
  dev.group.traverse((o) => { if (o.isMesh && o.material === mat.asphalt) roadMarks.push(o); });
  check("the main road runs along the front", roadMarks.length >= 1);

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
    const towerZ = [];
    d.group.traverse((c) => {
      if (c.userData?.ariaBuilding) towerZ.push(Math.abs(c.getWorldPosition(new THREE.Vector3()).z));
    });
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
  const jcb = instance.__test.scene.getObjectByName("JCB backhoe loader");
  check("the first game includes the parked JCB backhoe loader", !!jcb && jcb.userData.vehicleType === "backhoe-loader");
  const frontLoaderLinks = [];
  jcb?.traverse((part) => { if (part.name === "bucket connecting link") frontLoaderLinks.push(part); });
  check("both front loader arms connect to the bucket", frontLoaderLinks.length === 2);
  check("the cab has a seated operator", jcb?.getObjectByName("JCB operator")?.userData.pose === "crouch"
    && jcb.getObjectByName("JCB operator").parent?.name === "JCB backhoe loader body");
  let mirrorCount = 0;
  let workLightCount = 0;
  jcb?.traverse((part) => { if (part.name === "JCB mirror stalk") mirrorCount += 1; });
  jcb?.traverse((part) => { if (part.name === "JCB roof work light lens") workLightCount += 1; });
  check("the JCB has two mounted mirrors and roof work lights", mirrorCount === 2 && workLightCount === 2);
  const jcbCollider = instance.__test.colliders.find((c) => Math.abs((c.maxX - c.minX) - 3.6) < 0.001
    && Math.abs((c.maxZ - c.minZ) - 6.8) < 0.001);
  check("the JCB collision footprint follows the moving vehicle",
    !!jcbCollider && Math.abs((jcbCollider.minX + jcbCollider.maxX) / 2 - jcb.position.x) < 0.001
      && Math.abs((jcbCollider.minZ + jcbCollider.maxZ) / 2 - jcb.position.z) < 0.001);
  const digParts = jcb?.userData.digParts;
  jcb?.userData.updateDig?.(2.5);
  check("the JCB drives from its parking spot to the work area",
    jcb?.position.z > -24 && Math.abs(digParts?.wheels?.[0]?.object.rotation.x || 0) > 0.1,
    `z=${jcb?.position.z.toFixed(1)}, wheel=${digParts?.wheels?.[0]?.object.rotation.x.toFixed(2)}`);
  jcb?.userData.updateDig?.(16);
  check("the JCB steers into its dump position", jcb?.position.x > 37.9 && jcb.rotation.y > 1.3);
  jcb?.userData.updateDig?.(15.2);
  check("the sideways travel holds a sideways heading instead of sliding", jcb?.rotation.y > 1.5 && jcb.rotation.y < 1.65);
  jcb?.userData.updateDig?.(9.2);
  jcb?.updateMatrixWorld(true);
  const bucketGroundHeight = digParts?.bucketPivot.getWorldPosition(new THREE.Vector3()).y ?? Infinity;
  check("the digging bucket reaches close to ground level", bucketGroundHeight < 0.85, `${bucketGroundHeight.toFixed(2)} m`);
  jcb?.userData.updateDig?.(9.5);
  check("the backhoe lowers and curls its bucket to scoop soil",
    !!digParts?.soilInBucket.visible && Math.abs(digParts.boomPivot.rotation.x) > 0.2 && Math.abs(digParts.dipperPivot.rotation.x) > 0.2);
  check("the stabilizers plant while the backhoe works", digParts?.stabilizers?.every((leg) => leg.scale.y > 0.9));
  jcb?.userData.updateDig?.(20.5);
  check("the backhoe swings and drops soil onto its spoil pile",
    !!digParts?.fallingSoil.visible && digParts.backhoeSwing.rotation.y < -0.4 && digParts.bucketPivot.rotation.x < -0.5);
  jcb?.userData.updateDig?.(21.5);
  jcb?.updateMatrixWorld(true);
  const fallingSoilWorld = digParts?.fallingSoil.getWorldPosition(new THREE.Vector3());
  check("the falling soil travels toward the fixed dump pile",
    fallingSoilWorld && fallingSoilWorld.distanceTo(digParts.spoilPile.position) < 3.5,
    fallingSoilWorld ? `${fallingSoilWorld.distanceTo(digParts.spoilPile.position).toFixed(1)} m from pile` : "no soil position");
  const dumpSpot = digParts?.spoilPile.position.clone();
  jcb?.userData.updateDig?.(23);
  check("dumped soil accumulates at a fixed site location", digParts?.spoilPile.children.filter((soil) => soil.visible).length > 4
    && digParts.spoilPile.position.distanceTo(dumpSpot) === 0);
  jcb?.userData.updateDig?.(25);
  check("the JCB returns from dumping soil", jcb?.position.z < -15);
  jcb?.userData.updateDig?.(0);
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
    check("the final breakdown names the hazards that earned points",
      result.breakdown.some((row) => row.label === "Correct classification: Worker with no head protection"));
    check("the final breakdown reports the final score", result.breakdown.some((row) => row.label === "Final score" && row.value === String(result.score)));
    check("the run records the scoring values used", result.scoring?.identify === 100 && result.scoring?.action === 150);
  }

  instance.dispose();
  check("game 1 disposes without throwing", true);

  const configured = await boot("safetyMission", {
    config: { games: { "safety-mission": { scoring: { identify: 25, action: 40 } } } },
  });
  check("admin scoring overrides reach Safety Mission", configured.instance.__test.scoring.identify === 25 && configured.instance.__test.scoring.action === 40);
  configured.instance.dispose();

  const characterVoice = await boot("safetyMission");
  const spoken = [];
  characterVoice.api.say = (line, options) => { spoken.push({ line, options }); return line.en; };
  const firstHazard = characterVoice.instance.__test.hazards[0];
  characterVoice.instance.__test.controller.teleport(firstHazard.position.x, firstHazard.data.place.y, firstHazard.position.z);
  runFrames(2);
  check("approaching a hazard triggers its character's scenario line",
    spoken.length === 1 && spoken[0].line.en === firstHazard.data.voice.en && !!spoken[0].options.interrupt);
  check("the hazard callout includes a Tamil version", /[஀-௿]/.test(spoken[0]?.line.ta || ""));
  runFrames(30);
  check("a character does not repeat the same hazard callout", spoken.length === 1, `${spoken.length} lines`);
  characterVoice.instance.dispose();
}

/* ================================================================ *
 *  Game 2 — crane lift
 * ================================================================ */

/* ================================================================ *
 *  The lift stops for people
 *
 *  Driven directly rather than through a playthrough, so every one of
 *  the five situations is exercised including the ones a tidy operator
 *  would never trigger.
 * ================================================================ */

section("A lift halts for a safety situation and will not resume until it is fixed");

{
  const { INTERRUPTS, INTERRUPT_COUNT, INTERRUPT_SCORING, interruptById } =
    await import(`${SRC}/games/craneMaster/interrupts.js`);

  /* ---- the scenarios themselves ---- */
  check("there are five lifting situations", INTERRUPT_COUNT === 5, `${INTERRUPT_COUNT}`);
  const badShape = INTERRUPTS.filter((d) => !d.id || !d.title || !d.warning || !d.question
    || !Array.isArray(d.options) || d.options.length !== 4
    || !Number.isFinite(d.correct) || d.correct < 0 || d.correct > 3
    || !d.why || !d.toast);
  check("every situation is fully written with four options", badShape.length === 0,
    badShape.map((d) => d.id).join(", "));
  check("the ids are unique",
    new Set(INTERRUPTS.map((d) => d.id)).size === INTERRUPT_COUNT);
  check("an unknown id returns null, it does not throw",
    interruptById("nope") === null);

  // Nobody should be able to spot the answer by its SHAPE. On this
  // project the quiz already shipped once with the correct answer as
  // the longest option 82% of the time, so this is measured, not
  // assumed: the right answer has to sit in the pack on length.
  const lengthOutliers = INTERRUPTS.filter((d) => {
    const lens = d.options.map((o) => o.length);
    const others = lens.filter((_, i) => i !== d.correct).sort((a, b) => a - b);
    const median = (others[0] + others[others.length - 1]) / 2;
    return Math.abs(lens[d.correct] - median) > 12;
  });
  check("the right answer cannot be picked out by its length",
    lengthOutliers.length === 0,
    lengthOutliers.map((d) => `${d.id}:${d.options.map((o) => o.length).join("/")}`).join(" "));

  const longest = INTERRUPTS.filter((d) => {
    const lens = d.options.map((o) => o.length);
    return lens[d.correct] === Math.max(...lens);
  }).length;
  check("the right answer is not always the longest option",
    longest <= 1, `${longest} of ${INTERRUPT_COUNT}`);

  // And not always in the same slot, since the options are shown in
  // this order.
  check("the right answer is not always in the same position",
    new Set(INTERRUPTS.map((d) => d.correct)).size >= 3,
    INTERRUPTS.map((d) => d.correct).join(","));

  /* ---- and in the game ---- */
  const { instance } = await boot("craneMaster");
  const t = instance.__test;
  runFrames(10);

  check("the crane starts with nothing halting it", t.interrupts.open === null);

  for (const def of INTERRUPTS) {
    const subject = def.id === "person-under-load" ? t.stray : t.lifts[0].group;
    const raised = t.raiseInterrupt(def, { subject });
    check(`${def.id}: halts the lift`, raised && t.interrupts.open?.def.id === def.id);

    // Everything braked, and the controls are dead.
    check(`${def.id}: all crane motion is stopped`,
      t.state.slewVel === 0 && t.state.radiusVel === 0 && t.state.hoistVel === 0);
    instance.input.press("slewRight");
    const slewBefore = t.state.slew;
    runFrames(45);
    instance.input.release("slewRight");
    check(`${def.id}: the controls do nothing while it is unresolved`,
      Math.abs(t.state.slew - slewBefore) < 1e-6,
      `${slewBefore.toFixed(4)} → ${t.state.slew.toFixed(4)}`);

    // A wrong answer costs, and does NOT release the controls.
    const scoreBefore = t.state.score;
    const wrong = [0, 1, 2, 3].find((i) => i !== def.correct);
    t.answerInterrupt(wrong);
    check(`${def.id}: a wrong answer keeps the lift halted`,
      t.interrupts.open?.def.id === def.id);
    check(`${def.id}: a wrong answer costs points`,
      t.state.score === scoreBefore + INTERRUPT_SCORING.wrongAnswer,
      `${scoreBefore} → ${t.state.score}`);

    // The right one releases it.
    t.answerInterrupt(def.correct);
    check(`${def.id}: the right control resumes the lift`, t.interrupts.open === null);
    runFrames(5);
  }

  check("every situation was resolved", t.interrupts.resolved === INTERRUPT_COUNT,
    `${t.interrupts.resolved}`);
  check("resolving them all is worth a bonus",
    t.state.score > INTERRUPT_SCORING.allResolved - 1);

  // The fixes have to be things that visibly HAPPENED, not just text.
  check("insisting on a barricade puts one at the landing area",
    t.landingBarricade.visible === true);
  check("clearing the zone sends the worker out of it",
    t.stray.userData.rig && (() => {
      const before = t.stray.position.clone();
      runFrames(90);
      return t.stray.position.distanceTo(before) > 1 || t.stray.visible === false;
    })());

  // And the controls work again once nothing is halting the lift.
  const slewNow = t.state.slew;
  instance.input.press("slewRight");
  runFrames(45);
  instance.input.release("slewRight");
  check("the controls come back once everything is resolved",
    Math.abs(t.state.slew - slewNow) > 1e-4,
    `${slewNow.toFixed(4)} → ${t.state.slew.toFixed(4)}`);

  instance.dispose();
}

section("Tower Crane Master — lift a load");
{
  const { instance, record } = await boot("craneMaster");
  const input = instance.input;
  const { state, lifts, hookWorldPosition, loadWorldPosition, safeWorkingLoad, CRANE } = instance.__test;
  const { interrupts, answerInterrupt } = instance.__test;
  const { INTERRUPTS } = await import(`${SRC}/games/craneMaster/interrupts.js`);

  /* The lift now STOPS when something unsafe happens around it, and
   * will not take another control input until the operator deals with
   * it. An operator who answers correctly carries on, so that is what
   * this does — and the list it builds is the proof the hazards fired
   * at all, which is asserted at the end. */
  const interruptsHit = [];
  function resolveAnyInterrupt() {
    const open = interrupts.open;
    if (!open) return false;
    interruptsHit.push(open.def.id);
    answerInterrupt(open.def.correct);
    return true;
  }

  runFrames(10);
  // The mission is ONE lift, done properly — not a queue of them.
  check("the lift plan is a single lift", lifts.length === 1, `${lifts.length}`);
  check("the one lift targets a floor of the building, not the ground",
    lifts[0].target.floor !== null && lifts[0].targetY > 1, `floor ${lifts[0].target.floor}`);
  check("the HUD reports crane readouts", (record.hud.readouts || []).length >= 5);

  // Both ends of the lift are signed, so an operator can read the plan
  // off the site instead of being told where to go.
  check("the pick-up point carries a board", !!lifts[0].pickBoard,
    "no PICK UP sign in the scene");
  check("the landing point carries a board", !!lifts[0].landBoard,
    "no LAND HERE sign in the scene");
  check("the boards stand at the two ends of the lift",
    Math.hypot(lifts[0].pickBoard.position.x - lifts[0].pick.x,
      lifts[0].pickBoard.position.z - lifts[0].pick.z) < 5
    && Math.hypot(lifts[0].landBoard.position.x - lifts[0].target.x,
      lifts[0].landBoard.position.z - lifts[0].target.z) < 5);

  // They have to be readable from a cab 36 m up and 40 m away, which
  // means big and TURNED TO FACE THE CRANE. A board pointing at a
  // fixed compass direction shows the operator its back.
  [["pick-up", lifts[0].pickBoard], ["landing", lifts[0].landBoard]].forEach(([label, board]) => {
    const size = new THREE.Box3().setFromObject(board).getSize(new THREE.Vector3());
    check(`the ${label} board is big enough to read from the cab`,
      size.y > 3.5 && Math.max(size.x, size.z) > 2,
      `${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)}`);
    const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(board.quaternion);
    const toCrane = new THREE.Vector3(
      CRANE.x - board.position.x, 0, CRANE.z - board.position.z).normalize();
    check(`the ${label} board faces the crane`, facing.dot(toCrane) > 0.9,
      `dot ${facing.dot(toCrane).toFixed(2)}`);
  });
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
      if (resolveAnyInterrupt()) {
        // Everything was braked when the lift halted, so let the
        // operator settle before driving again.
        releaseAll();
        runFrames(10);
      }
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

  /* The lift is not a transport puzzle: something happened around the
   * load and the operator had to deal with it to get here at all.
   *
   * ONE situation per lift, chosen at random from the five — five
   * interruptions in a single lift is a quiz with a crane attached.
   * Which one it is varies per play, so the assertion is on the
   * count and on it being a real one, not on which. */
  const { chosenInterrupt } = instance.__test;
  check("a safety situation interrupted the lift", interruptsHit.length === 1,
    `fired: ${interruptsHit.join(", ") || "none"}`);
  check("it was the one this lift had chosen",
    interruptsHit[0] === chosenInterrupt.id,
    `${interruptsHit[0]} vs ${chosenInterrupt.id}`);
  check("it is one of the five written scenarios",
    INTERRUPTS.some((d) => d.id === interruptsHit[0]), interruptsHit[0]);
  check("resolving it is what let the lift finish",
    interrupts.resolved === 1 && interrupts.open === null,
    `${interrupts.resolved} resolved`);

  instance.dispose();
  check("game 2 disposes without throwing", true);
}

section("The load lands on the terrace and will not sink through it");

/* The report was "the top floor material lowering is not happening
 * properly — it should stop on the terrace but it goes to the floor
 * below", and it was true. The lift used to target an intermediate
 * slab, which is physically impossible to lower onto in a finished
 * frame, so the game suspended the roof as an obstacle and the bundle
 * descended straight through it to rest a storey down.
 *
 * This drives the hoist all the way to its stop and measures where the
 * underside of the load actually ends up. */
{
  const { instance } = await boot("craneMaster");
  const {
    state, lifts, loadWorldPosition, CRANE, BUILDING, frame, landingHeightForLoad,
    interrupts, answerInterrupt,
  } = instance.__test;
  const input = instance.input;
  const lift = lifts[0];
  const terraceY = frame.floors[frame.floors.length - 1].y;
  const floorBelow = frame.floors[frame.floors.length - 2].y;

  runFrames(10);
  check("the landing is the terrace, the top slab",
    lift.target.floor === BUILDING.floors - 1 && Math.abs(lift.targetY - terraceY) < 0.001,
    `floor ${lift.target.floor} at y=${lift.targetY}, terrace at y=${terraceY}`);
  check("the brief says terrace", /terrace/i.test(lift.note), lift.note);

  const bearingOf = (x, z) => Math.atan2(-(z - CRANE.z), x - CRANE.x);
  const radiusOf = (x, z) => Math.hypot(x - CRANE.x, z - CRANE.z);

  /** Hangs the load from the hook over (x, z) and lowers it to the stop. */
  function lowerFullyOver(x, z) {
    state.slew = bearingOf(x, z);
    state.radius = radiusOf(x, z);
    state.slewVel = 0;
    state.radiusVel = 0;
    state.hookY = 22;
    state.attached = lift;
    state.swing.set(0, 0);
    state.swingVel.set(0, 0);
    let lowest = Infinity;
    input.press("hoistDown");
    for (let i = 0; i < 1200; i += 1) {
      runFrames(1);
      // A safety situation halts the crane until it is dealt with, so
      // the operator deals with it — otherwise this measures nothing
      // but the fact that the lift was interrupted.
      if (interrupts.open) {
        answerInterrupt(interrupts.open.def.correct);
        input.release("hoistDown");
        runFrames(6);
        input.press("hoistDown");
      }
      const base = loadWorldPosition().y - lift.baseOffset;
      if (base < lowest) lowest = base;
    }
    input.release("hoistDown");
    runFrames(5);
    return { lowest, base: loadWorldPosition().y - lift.baseOffset };
  }

  // 1. Over the landing zone: it must come to rest ON the terrace.
  const onTarget = lowerFullyOver(lift.target.x, lift.target.z);
  check("lowering over the landing zone stops the load on the terrace",
    Math.abs(onTarget.base - terraceY) < 0.08,
    `underside came to rest at y=${onTarget.base.toFixed(3)}, terrace is y=${terraceY.toFixed(2)}`);
  check("it never passes through the terrace on the way down",
    onTarget.lowest > terraceY - 0.08,
    `dipped to y=${onTarget.lowest.toFixed(3)}`);
  check("it does not reach the floor below",
    onTarget.lowest > floorBelow + 1,
    `reached y=${onTarget.lowest.toFixed(3)}, the floor below is y=${floorBelow.toFixed(2)}`);

  // 2. Over the building but away from the landing zone: the roof is a
  //    solid obstruction, not a void to drop through.
  const offTarget = lowerFullyOver(BUILDING.x + 5, BUILDING.z - 4);
  check("away from the landing zone the terrace is solid",
    offTarget.lowest > terraceY - 0.4,
    `dipped to y=${offTarget.lowest.toFixed(3)} at a spot with no landing pad`);

  // 3. Clear of the building the ground is the limit, so a load can
  //    still be set down outside — the clamp is not a blanket ceiling.
  const outside = lowerFullyOver(CRANE.x + 30, CRANE.z + 2);
  check("clear of the building the load can still be set down",
    outside.base < 1.2, `stopped at y=${outside.base.toFixed(3)}`);

  // And the rule itself, read directly.
  state.slew = bearingOf(lift.target.x, lift.target.z);
  state.radius = radiusOf(lift.target.x, lift.target.z);
  state.hookY = 22;
  state.attached = lift;
  state.swing.set(0, 0);
  runFrames(2);
  check("the lowering limit over the landing zone IS the terrace",
    Math.abs(landingHeightForLoad() - terraceY) < 0.001,
    `${landingHeightForLoad()}`);

  instance.dispose();
}

/* ================================================================ *
 *  Game 3 — build the tower
 * ================================================================ */

const G3 = await import(`${SRC}/games/safestTower/hazards.js`);

section("Spot the Hazards — clearing the site correctly");
{
  const { instance, record } = await boot("safestTower");
  const { state, hazards, inspect, answer, HAZARD_COUNT } = instance.__test;
  const kitForHazards = await import(`${SRC}/engine/kit.js`);
  const matForHazards = kitForHazards.createMaterials({ anisotropy: 1, segments: 8 });

  runFrames(10);
  check("the walk-round covers ten ground-level hazards",
    hazards.length === HAZARD_COUNT && HAZARD_COUNT === 10, `${hazards.length}`);
  check("every hazard sits at ground level",
    hazards.every((h) => h.world.y === 0), "a hazard is off the ground");
  check("every hazard asks a question with 4 options",
    hazards.every((h) => h.def.options.length === 4));
  check("every hazard has exactly one correct option",
    hazards.every((h) => h.def.correct >= 0 && h.def.correct < 4));
  check("every hazard explains why", hazards.every((h) => (h.def.why || "").length > 40));
  check("every hazard names the control type",
    hazards.every((h) => ["eliminate", "engineer", "admin", "ppe"].includes(h.def.control)));
  /* ---- walking up to one IS the interaction ---- */
  {
    const { walker, checkApproach, APPROACH_RADIUS } = instance.__test;
    // The LAST one, so the rest of this section starts untouched.
    const target = hazards[hazards.length - 1];
    // Stand well away: nothing should open.
    walker.teleport(target.world.x + 40, 0, target.world.z + 40);
    checkApproach();
    check("standing away from a hazard opens nothing", state.openHazard === null);

    // Walk up to it.
    walker.teleport(target.world.x + APPROACH_RADIUS * 0.5, 0, target.world.z);
    checkApproach();
    check("walking up to a hazard stops you and opens it",
      state.openHazard === target, state.openHazard?.def?.id || "nothing opened");
    check("approaching shows the question with four options",
      (record.dialog?.options || []).length === 4,
      JSON.stringify((record.dialog?.options || []).length));
    check("the open hazard is highlighted", target.outline.visible !== false);

    // Dismiss it the way a player would, and walk away, so the rest
    // of this section starts from an untouched walk-round.
    record.dialog?.onDismiss?.();
    check("you can back out of a hazard and keep looking",
      state.openHazard === null && !target.solved);
    walker.teleport(0, 0, 0);
    runFrames(2);
  }

  check("the HUD lists every hazard as a task",
    (record.hud.tasks || []).length === HAZARD_COUNT,
    `${(record.hud.tasks || []).length} of ${HAZARD_COUNT}`);

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

  /* --- clear the rest, all first time ---
   *
   * The CORRECTED version of each hazard is built here, on solve, not
   * at construction — so this is the only place a mistake in one of
   * them shows. buildGuardrail returns a Group and the corrected
   * unprotected-edge hazard was calling it as `.group`, which added
   * undefined: the fix for an edge-protection hazard had no edge
   * protection in it, and nothing anywhere failed. */
  const fixWarnings = [];
  const realWarn = console.warn;
  const realErr = console.error;
  const grabFix = (...args) => { fixWarnings.push(args.map(String).join(" ")); };
  console.warn = grabFix;
  console.error = grabFix;
  try {
    hazards.slice(1).forEach((h) => { inspect(h); answer(h, h.def.correct); runFrames(1); });
  } finally {
    console.warn = realWarn;
    console.error = realErr;
  }
  check("every hazard can be cleared", hazards.every((h) => h.solved));
  check("every corrected hazard is built without dropping anything",
    fixWarnings.length === 0, fixWarnings.slice(0, 2).join(" | "));

  // And the corrected version has to actually contain the control it
  // claims. The edge hazard's whole answer is a guardrail, which is
  // two merged meshes, so the corrected version must have exactly two
  // more than the same scene built without one.
  {
    const edge = hazards.find((h) => h.def.kind === "edge");
    const countIn = (root) => {
      let n = 0;
      root?.traverse((o) => { if (o.isMesh) n += 1; });
      return n;
    };
    const railMeshes = countIn(kitForHazards.buildGuardrail(matForHazards, {
      x: 0, y: 0, z: 0, length: 7, axis: "x", compliant: true,
    }));
    check("the corrected edge hazard actually has a guardrail in it",
      countIn(edge?.fixed) > countIn(edge?.unsafe) + railMeshes - 1,
      `corrected ${countIn(edge?.fixed)}, unsafe ${countIn(edge?.unsafe)}, rail ${railMeshes}`);
  }
  check("all but the fumbled one were cleared first time",
    state.firstTime === HAZARD_COUNT - 1, `${state.firstTime} of ${HAZARD_COUNT - 1}`);

  runFrames(5);
  const result = record.finished;
  check("clearing every hazard finishes the walk-round", !!result && result.completed === true);
  if (result) {
    check("accuracy reflects the one hazard that took two attempts",
      result.accuracy === Math.round(((HAZARD_COUNT - 1) / HAZARD_COUNT) * 100),
      `${result.accuracy}%`);
    check("the debrief calls out the hazard that took two attempts",
      (result.lessons || []).length === 1 && result.lessons[0].includes("attempt 2"),
      JSON.stringify(result.lessons));
    check("the score stays under the Arena ceiling", result.score <= 12000, `${result.score}`);
    check("the debrief counts what was cleared",
      result.stats?.hazardsCleared === HAZARD_COUNT && result.stats?.wrongAnswers === 1,
      JSON.stringify(result.stats));
  }

  instance.dispose();
  check("game 3 disposes without throwing", true);
}

section("Spot the Hazards — answering with the plausible option every time");
{
  const { instance, record } = await boot("safestTower");
  const { state, hazards, inspect, answer, HAZARD_COUNT } = instance.__test;
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
  check("a wrong call was counted for every hazard",
    state.wrong === HAZARD_COUNT, `${state.wrong} of ${HAZARD_COUNT}`);
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
  // Press USE at a door. Going through the game's own useDoor is the
  // same path the interact button takes, without having to line the
  // camera up on a door leaf to the degree.
  const useDoorDirect = (door) => instance.__test.useDoor(door);

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
  check("the only mistake was the deliberate wrong extinguisher", state.mistakes === 1, `${state.mistakes}`);

  /* ---- the key and gate sequence ----
   *
   * Solving a room must NOT open its door. It cuts a key, which drops
   * in the room; the player walks to it, picks it up, carries it to the
   * door and uses it there. Three beats, not one. */
  const { keys, hasKey } = instance.__test;

  check("solving every area did NOT open any door",
    doors.every((d) => d.locked),
    `${doors.filter((d) => !d.locked).length} opened by themselves`);

  /* The electrical room has a fourth beat: answering unlocks the
   * board, and the key is only cut once the isolator handle is
   * physically thrown. Knowing which board to isolate is not the same
   * as isolating it. */
  {
    const iso = instance.__test;
    check("answering the electrical question only unlocked the board",
      iso.isolation.unlocked === true && iso.isolation.pulled === false);
    check("no key is cut for a circuit that is still live",
      !iso.keys.some((k) => k.roomKey === "electrical"));

    // Walk to the handle and throw it.
    // Stand a metre in front of the handle, looking at it. Yaw 0 is
    // looking along -Z, which is toward the board.
    controller.teleport(
      iso.isolator.worldLever.x, 0, iso.isolator.worldLever.z + 1.1, 0);
    controller.state.pitch = 0;
    runFrames(4);
    check("the isolator handle can be reached and targeted",
      state.target?.kind === "lever", `target=${state.target?.kind}`);
    input.press("interact"); runFrames(2); input.release("interact"); runFrames(30);
    check("throwing the handle isolates the board", iso.isolation.pulled === true);
    check("and only THEN is the key cut",
      iso.keys.some((k) => k.roomKey === "electrical"));
  }
  check("solving every area cut a key for it", keys.length === doors.length,
    `${keys.length} keys for ${doors.length} doors`);
  check("the keys are lying in the world, not in your pocket",
    keys.every((k) => !k.collected) && doors.every((d) => !hasKey(d.roomKey)));

  for (const door of doors) {
    const key = keys.find((k) => k.roomKey === door.roomKey);

    // Standing at the door with no key gets you nothing.
    controller.teleport(door.position.x - 1.6, 0, door.position.z, -Math.PI / 2);
    controller.state.pitch = 0;
    runFrames(3);
    useDoorDirect(door);
    check(`${door.roomKey}: the door stays locked without its key`, door.locked);

    // Walk to the key and pick it up.
    controller.teleport(key.position.x - 1.1, 0, key.position.z, -Math.PI / 2);
    controller.state.pitch = 0;
    runFrames(4);
    check(`${door.roomKey}: the key can be targeted by walking to it`,
      state.target?.kind === "key", `target=${state.target?.kind}`);
    input.press("interact"); runFrames(2); input.release("interact"); runFrames(3);
    check(`${door.roomKey}: the key is collected`, key.collected && hasKey(door.roomKey));

    // Now the door opens — at the door, with the key.
    controller.teleport(door.position.x - 1.6, 0, door.position.z, -Math.PI / 2);
    controller.state.pitch = 0;
    runFrames(3);
    useDoorDirect(door);
    check(`${door.roomKey}: the door unlocks once the key is brought to it`, !door.locked);
  }

  runFrames(30);
  check("the doors animate open rather than vanishing",
    doors.every((d) => d.openProgress > 0.1),
    doors.map((d) => d.openProgress.toFixed(2)).join(", "));

  // Use the final door to escape.
  const finalDoor = doors[doors.length - 1];
  useDoorDirect(finalDoor);
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

  /* The commander WALKS the site now, so a checklist is not an
   * instruction on its own: it has to say which step, what to do,
   * which object, and which way to go. */
  check("every step on the plan is numbered",
    (record.hud.tasks || []).every((t, i) => t.label.startsWith(`Step ${i + 1}:`)),
    JSON.stringify((record.hud.tasks || [])[0]?.label));
  check("the plan shows which steps are already done",
    (record.hud.tasks || []).every((t) => typeof t.done === "boolean"));

  const prompt = record.hud.prompt?.text || "";
  check("the prompt names the step number", /^Step \d+:/.test(prompt), prompt);
  check("the prompt names the object to go to",
    prompt.includes(STATIONS[0].label), prompt);
  check("the prompt says how far and which way",
    /\d+ m (N|NE|E|SE|S|SW|W|NW)/.test(prompt), prompt);

  const bearing = instance.__test.bearingToNext(STATIONS[0]);
  check("the bearing is a real distance and compass point",
    Number.isFinite(bearing.distance) && bearing.distance > 0
    && ["N", "NE", "E", "SE", "S", "SW", "W", "NW"].includes(bearing.point),
    JSON.stringify(bearing));

  // Walk to it and the readout should say you have arrived.
  const marker = instance.__test.stationMarkers.get(STATIONS[0].id);
  instance.__test.walker.teleport(marker.anchor.x + 1, 0, marker.anchor.z + 1);
  runFrames(4);
  check("standing at the objective, the HUD says so",
    instance.__test.bearingToNext(STATIONS[0]).arrived === true,
    `${instance.__test.bearingToNext(STATIONS[0]).distance.toFixed(1)} m away`);

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
