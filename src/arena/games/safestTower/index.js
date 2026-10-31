/* ------------------------------------------------------------------ *
 *  GAME 3 — SPOT THE HAZARDS
 *
 *  Ground level only. Five real hazards are sitting around the
 *  Casagrand Aria site compound. The player orbits the compound, taps a
 *  hazard to inspect it, and chooses the control that actually removes
 *  the risk.
 *
 *  The teaching mechanic: every wrong answer is a plausible one — a
 *  sign, some tape, a board laid over the problem. Choosing one costs
 *  points and the hazard stays exactly where it is, because warning
 *  somebody about a hazard is not the same as controlling it.
 *
 *  Answer correctly and the hazard is REBUILT in its corrected form, so
 *  the player sees the fix appear on site.
 * ------------------------------------------------------------------ */

import * as THREE from "three";
import { createStage, addDaylight, addSky, screenRaycast, findTagged } from "../../engine/gfx.js";
import { createInput } from "../../engine/input.js";
import { createTopView } from "../../engine/topview.js";
import { createFirstPerson } from "../../engine/fpsController.js";
import { shot, establishingShot, closingShot } from "../../engine/demoTour.js";
import {
  createMaterials, createGeometries, box, cylinder,
  buildGround, buildHoarding, buildBrandBanners, buildBrandedTower, poseWorker,
  buildTowerCrane, updateHoistRope, buildWorker, buildSign,
  buildMaterialPallet, buildSiteHut, buildBarrier, buildCone,
  buildExcavation, buildGuardrail, buildLadder, buildScaffold,
  buildCableRun, buildPuddle, buildElectricalPanel, buildZoneMarker,
  collider,
} from "../../engine/kit.js";
import { sfx } from "../../audio.js";
import { HAZARDS, HAZARD_COUNT, SCORING } from "./hazards.js";

/* ============================== metadata ============================== */

export const meta = {
  id: "safest-tower",
  controls: "build",

  briefing: {
    role:
      "You are walking the Casagrand Aria site compound before the shift starts. Five things down "
      + "here are wrong. For each one, you decide what actually gets done about it.",
    objectives: [
      "Orbit the compound and tap each flagged hazard to inspect it.",
      "Read what you are actually looking at before you answer.",
      "Choose the control that removes the risk, not the one that warns people about it.",
      "Get it right first time — a second attempt is worth half.",
      "Clear all five before the shift starts.",
    ],
    scoring: [
      { label: "Correct control, first attempt", value: "+1200" },
      { label: "Correct control, second attempt", value: "+600" },
      { label: "Wrong control", value: "-150" },
      { label: "All five hazards cleared", value: "+2000" },
      { label: "First-time accuracy", value: "up to +2000" },
      { label: "Time remaining", value: "+3 / second" },
    ],
    tips: [
      "Signs and tape inform. Rails, cages and isolation protect. Only one of those is a control.",
      "If the answer leaves the hazard exactly where it was, it is not the answer.",
      "A damaged electrical lead is quarantined, never repaired with tape.",
      "Spoil heaped at the crest of a trench is what makes the face collapse.",
      "An escape route is kept clear — it is not re-routed around the obstruction.",
    ],
  },

  desktopControls: [
    ["W A S D", "Walk the compound"],
    ["Mouse drag", "Orbit the compound"],
    ["Wheel / Z", "Zoom in and out"],
    ["T", "Top view — the whole compound and the towers beyond it"],
    ["Click", "Inspect a hazard"],
    ["1 – 4", "Answer the open question"],
    ["Tab", "Jump to the next unsolved hazard"],
    ["Esc", "Pause"],
  ],
  mobileControls: [
    ["Joystick", "Walk the compound — bottom-left of the screen"],
    ["Drag", "Orbit the compound"],
    ["Pinch / ZOOM", "Zoom in on a hazard"],
    ["TOP VIEW", "See the whole compound from the air"],
    ["Tap", "Inspect a hazard"],
    ["Tap an answer", "Choose the control"],
    ["NEXT", "Jump to the next unsolved hazard"],
  ],
};

const COMPOUND = { width: 62, depth: 54 };
const BASE_SECONDS = 360;

/* ============================== the game ============================== */

export function create({ container, difficulty, quality, settings, mobile, api }) {
  const stage = createStage(container, { quality, fov: mobile ? 62 : 54 });
  const { scene, camera, cfg } = stage;
  const mat = createMaterials(cfg);
  const geo = createGeometries(cfg);

  /* --------------------------- environment --------------------------- */

  addSky(scene, cfg, { top: "#20556F", bottom: "#CFE0DF", fogColor: "#C6D9DC" });
  const sun = addDaylight(scene, cfg, { intensity: 2.0, shadowRadius: 34 });
  // Punch the excavation hazard's footprint out of the ground sheet,
  // or the trench is invisible under it.
  const excHazard = HAZARDS.find((h) => h.kind === "excavation");
  const groundHoles = excHazard
    ? [{ x: excHazard.at.x, z: excHazard.at.z, w: 9.4, d: 3.8 }]
    : [];
  scene.add(buildGround(mat, 260, { holes: groundHoles }));
  const hoarding = buildHoarding(geo, mat, { ...COMPOUND, height: 2.4, gateAt: "south" });
  scene.add(hoarding.group);
  scene.add(buildBrandBanners(geo, mat, { ...COMPOUND, panel: 7 }));
  scene.add(buildBrandedTower(geo, mat, { x: -14, z: -40, rotY: 0.26 }).group);

  // Site dressing. Nothing here is a hazard — it is the compound the
  // five real problems are sitting in.
  const crane = buildTowerCrane(geo, mat, { x: 24, z: -20, mastHeight: 30, jibLength: 34, counterJib: 11 });
  crane.group.position.set(24, 0, -20);
  crane.parts.slew.rotation.y = 2.1;
  crane.parts.trolley.position.x = 20;
  crane.parts.hook.position.y = -22;
  updateHoistRope(crane.parts);
  scene.add(crane.group);

  const canteen = buildSiteHut(geo, mat, { color: "blue", width: 7, depth: 3 });
  canteen.position.set(19, 0, -8);
  canteen.rotation.y = 0.6;
  scene.add(canteen);

  const office = buildSiteHut(geo, mat, { color: "white" });
  office.position.set(-22, 0, -16);
  scene.add(office);

  const scaffold = buildScaffold(geo, mat, { width: 10, lifts: 2, boarded: true });
  scaffold.group.position.set(4, 0, 19);
  scene.add(scaffold.group);

  // The muster point the blocked escape route leads to.
  const muster = buildSign(geo, mat, { text: "MUSTER POINT", kind: "emergency", height: 2.4, width: 1.1 });
  muster.position.set(-16, 0, -22);
  scene.add(muster);

  const animated = [];
  [[-18, 12, 0.6], [20, 4, 2.2], [11, -18, -1.1]].forEach(([wx, wz, rot]) => {
    const worker = buildWorker(geo, mat, { helmet: true, vest: true, pose: "work" });
    worker.position.set(wx, 0, wz);
    worker.rotation.y = rot;
    scene.add(worker);
    animated.push({ object: worker, phase: Math.random() * 6 });
  });

  /* ============================ the hazards ============================ */

  /**
   * Builds the UNSAFE version of a hazard. Each returns a group placed
   * at the origin; the caller positions it.
   */
  function buildUnsafe(kind) {
    const group = new THREE.Group();
    switch (kind) {
      case "excavation": {
        // Open trench, no edge protection, spoil right at the crest.
        const exc = buildExcavation(geo, mat, {
          width: 9, depth: 3.4, trenchDepth: 2.2,
          shored: false, battered: false, edgeProtection: false,
          water: true, services: true, spoil: false,
        });
        group.add(exc.group);
        // Spoil surcharging the edge — the fault, not scenery.
        for (let i = 0; i < 7; i++) {
          const s = new THREE.Mesh(geo.sphere, mat.ground);
          const t = i / 6;
          s.scale.set(1.3, 0.75, 1.0);
          s.position.set(-4.2 + t * 8.4, 0.3, 2.0);
          s.castShadow = true;
          group.add(s);
        }
        break;
      }
      case "electrical": {
        group.add(buildPuddle(geo, mat, { radius: 1.9 }));
        const run = buildCableRun(geo, mat, { length: 7, damaged: true, onGround: true });
        run.rotation.y = 0.3;
        group.add(run);
        const saw = new THREE.Group();
        saw.add(box(geo, mat.yellow, 0.7, 0.45, 0.4, 0, 0.6, 0));
        saw.add(box(geo, mat.steelDark, 0.8, 0.08, 0.5, 0, 0.36, 0));
        [[-0.3, -0.18], [0.3, -0.18], [-0.3, 0.18], [0.3, 0.18]].forEach(([lx, lz]) => {
          saw.add(box(geo, mat.steelDark, 0.06, 0.36, 0.06, lx, 0.18, lz));
        });
        const blade = new THREE.Mesh(geo.cylLow, mat.galv);
        blade.scale.set(0.7, 0.03, 0.7);
        blade.rotation.z = Math.PI / 2;
        blade.position.set(0.45, 0.62, 0);
        saw.add(blade);
        saw.position.set(3.1, 0, 0.6);
        group.add(saw);
        break;
      }
      case "cylinders": {
        // Lying down, loose, no caps, fuel gas touching the oxidiser.
        [["red", -0.5], ["blue", 0.1], ["red", 0.7], ["blue", 1.3]].forEach(([colour, z], i) => {
          const body = cylinder(geo, colour === "red" ? mat.craneRed : mat.blue, 0.17, 1.35, 0, 0.17, z,
            { rotX: Math.PI / 2 });
          group.add(body);
          group.add(cylinder(geo, mat.steelDark, 0.07, 0.18, 0, 0.17, z + (i % 2 ? -0.78 : 0.78),
            { rotX: Math.PI / 2, low: true }));
        });
        break;
      }
      case "stacking": {
        // Four pallets high, unbanded, leaning, over the escape route.
        for (let i = 0; i < 4; i++) {
          const pallet = buildMaterialPallet(geo, mat, { type: "block", rows: 2 });
          pallet.position.set(i * 0.07, i * 0.72, i * 0.05);
          pallet.rotation.y = i * 0.04;
          pallet.rotation.z = i * 0.015;
          group.add(pallet);
        }
        // The escape route it is sitting on.
        for (let i = -3; i <= 3; i++) {
          group.add(box(geo, mat.green, 0.9, 0.02, 0.5, i * 1.4, 0.011, -2.4, { shadow: false }));
        }
        break;
      }
      case "ladder": {
        // Far too shallow, untied, finishing level with the platform.
        const ladder = buildLadder(geo, mat, { height: 4.6, lean: 0.62 });
        group.add(ladder);
        break;
      }
      default:
        break;
    }
    return group;
  }

  /** Builds the CORRECTED version, which replaces the unsafe one. */
  function buildFixed(kind) {
    const group = new THREE.Group();
    switch (kind) {
      case "excavation": {
        const exc = buildExcavation(geo, mat, {
          width: 9, depth: 3.4, trenchDepth: 2.2,
          shored: true, battered: false, edgeProtection: true,
          water: true, services: true, spoil: true,
        });
        group.add(exc.group);
        break;
      }
      case "electrical": {
        // Water gone, lead gone, a proper 110 V supply on a stand.
        const panel = buildElectricalPanel(geo, mat, { unsafe: false });
        panel.position.set(0.6, 0, 0);
        group.add(panel);
        const run = buildCableRun(geo, mat, { length: 7, damaged: false, onGround: false });
        run.rotation.y = 0.3;
        group.add(run);
        const saw = box(geo, mat.yellow, 0.7, 0.45, 0.4, 3.1, 0.6, 0.6);
        group.add(saw);
        group.add(box(geo, mat.steelDark, 0.8, 0.08, 0.5, 3.1, 0.36, 0.6));
        break;
      }
      case "cylinders": {
        // Upright, chained, capped, in a ventilated cage.
        const cage = new THREE.Group();
        [[-1.1, 0], [1.1, 0], [0, -0.85], [0, 0.85]].forEach(([cx, cz]) => {
          const bars = [];
          for (let i = 0; i < 7; i++) {
            const along = cx === 0 ? 2.2 : 1.7;
            const t = -along / 2 + (i * along) / 6;
            bars.push({
              w: 0.05, h: 1.9, d: 0.05,
              x: cx === 0 ? t : cx, y: 0.95, z: cx === 0 ? cz : t,
            });
          }
          cage.add(mergedBars(bars));
        });
        cage.add(box(geo, mat.galv, 2.3, 0.06, 1.8, 0, 1.92, 0, { shadow: false }));
        group.add(cage);
        [["red", -0.55], ["red", -0.2], ["blue", 0.5], ["blue", 0.85]].forEach(([colour, x]) => {
          group.add(cylinder(geo, colour === "red" ? mat.craneRed : mat.blue, 0.17, 1.35, x, 0.68, 0));
          group.add(cylinder(geo, mat.steelDark, 0.1, 0.16, x, 1.44, 0, { low: true }));
        });
        // The chain across them, and the separation bay divider.
        group.add(box(geo, mat.steel, 1.9, 0.05, 0.05, 0, 0.95, 0.1, { shadow: false }));
        group.add(box(geo, mat.galv, 0.05, 1.9, 1.7, 0.15, 0.95, 0, { shadow: false }));
        const sign = buildSign(geo, mat, { text: "COMPRESSED GAS", kind: "warning", height: 2.3, width: 0.75 });
        sign.position.set(0, 0, 1.3);
        group.add(sign);
        break;
      }
      case "stacking": {
        // One pallet high, banded, set well clear of the route.
        [[-2.6, -0.4], [-1.0, -0.4]].forEach(([px, pz]) => {
          const pallet = buildMaterialPallet(geo, mat, { type: "block", rows: 2 });
          pallet.position.set(px, 0, pz);
          group.add(pallet);
        });
        for (let i = -3; i <= 3; i++) {
          group.add(box(geo, mat.green, 0.9, 0.02, 0.5, i * 1.4, 0.011, -2.4, { shadow: false }));
        }
        // Route kept clear, and marked as such.
        [-3.2, 3.2].forEach((cx) => {
          const cone = buildCone(geo, mat, { height: 0.6 });
          cone.position.set(cx, 0, -2.4);
          group.add(cone);
        });
        break;
      }
      case "ladder": {
        // 1:4 pitch, tied at the stiles, a metre past the landing.
        const ladder = buildLadder(geo, mat, { height: 5.6, lean: 0.25 });
        group.add(ladder);
        // Lashings at the stiles.
        [4.2, 4.5].forEach((ly) => {
          group.add(box(geo, mat.orange, 0.62, 0.07, 0.07, 0.25 * ly * 0.25, ly, 0, { shadow: false }));
        });
        break;
      }
      default:
        break;
    }
    return group;
  }

  // Small helper: the cage bars are many thin boxes, so merge them.
  function mergedBars(parts) {
    const group = new THREE.Group();
    parts.forEach((p) => group.add(box(geo, mat.galv, p.w, p.h, p.d, p.x, p.y, p.z, { shadow: false })));
    return group;
  }

  /* --------------------------- hazard objects --------------------------- */

  const pickTargets = [];

  const hazards = HAZARDS.map((def) => {
    const root = new THREE.Group();
    root.position.set(def.at.x, 0, def.at.z);
    root.rotation.y = def.rotY || 0;
    scene.add(root);

    const unsafe = buildUnsafe(def.kind);
    root.add(unsafe);

    // The flag that makes a hazard findable from across the compound,
    // and the tap target. It is deliberately generous — on a phone the
    // player should not have to hit a cable with their thumb.
    const flag = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 3.4, 3.4),
      new THREE.MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.16, depthWrite: false })
    );
    flag.position.set(0, 1.9, 0);
    flag.userData.hazardId = def.id;
    flag.renderOrder = 2;
    root.add(flag);
    pickTargets.push(flag);

    const outline = new THREE.Mesh(
      new THREE.BoxGeometry(3.45, 3.45, 3.45),
      new THREE.MeshBasicMaterial({ color: 0xff5a1f, wireframe: true, transparent: true, opacity: 0.55 })
    );
    outline.position.copy(flag.position);
    root.add(outline);

    const marker = buildZoneMarker(mat, { radius: 2.4, ok: false });
    marker.position.y = 0.03;
    root.add(marker);

    return {
      def,
      root,
      unsafe,
      flag,
      outline,
      marker,
      fixed: null,
      solved: false,
      attempts: 0,
      world: new THREE.Vector3(def.at.x, 0, def.at.z),
    };
  });

  function hazardById(id) {
    return hazards.find((h) => h.def.id === id) || null;
  }

  /* ============================ game state ============================ */

  const missionMs = BASE_SECONDS * 1000 * difficulty.timeScale;
  const state = {
    remainingMs: missionMs,
    score: 0,
    openHazard: null,     // the hazard whose question is on screen
    solved: 0,
    firstTime: 0,
    wrong: 0,
    finished: false,
    paused: false,
  };

  /* ------------------------------- input ------------------------------- */

  const input = createInput(container, {
    pointerLock: false,
    onPause: () => api.requestPause(),
    keymap: {
      Escape: "pause",
      Tab: "next",
      Digit1: "answer1", Digit2: "answer2", Digit3: "answer3", Digit4: "answer4",
      KeyZ: "zoom",
    },
  });
  input.setSensitivity(settings.lookSensitivity ?? 1);

  /* ------------------------------ camera ------------------------------ */

  const cam = {
    yaw: 0.9,
    pitch: -0.55,
    distance: 40,
    target: new THREE.Vector3(0, 2, 0),
    desired: new THREE.Vector3(0, 2, 0),
  };

  // Lift off the compound and look at the whole site, including the
  // finished Casagrand Aria towers beyond the hoarding.
  const siteView = createTopView(camera, {
    scene,
    center: new THREE.Vector3(0, 0, -16),
    distance: 96, minDistance: 44, maxDistance: 170, pitch: 0.80,
  });

  /* ----------------------------- the player -----------------------------
   * You walk the compound rather than hovering over it. The movement
   * solver does collision, ground and step-up; the orbit camera above
   * keeps the look and the zoom, so this is used purely to walk a body
   * around (ownsCamera / ownsLook both off).
   */
  const walker = createFirstPerson(camera, input, {
    colliders: hoarding.colliders,
    spawn: { x: 0, y: 0, z: COMPOUND.depth / 2 - 6 },
    yaw: 0,
    canJump: false,
    ownsCamera: false,
    ownsLook: false,
    walkSpeed: 3.6,
    runSpeed: 6.2,
    onStep: () => sfx.step(),
  });

  const avatar = buildWorker(geo, mat, {
    helmet: true, vest: true, boots: true, helmetColor: "orange",
  });
  scene.add(avatar);
  let walkPhase = 0;

  function updateWalker(dt) {
    if (state.finished || state.openHazard) {
      // Standing still while reading a hazard card.
      poseWorker(avatar, { phase: walkPhase, moving: false, pose: "stand" });
      return;
    }
    // Forward on the joystick means away from the camera, so the
    // character is steered by the yaw the orbit camera is using.
    walker.setYaw(cam.yaw);
    walker.update(dt);

    const v = walker.velocity;
    const moving = walker.moving;
    walkPhase += dt * (walker.state.running ? 11 : 7.4) * (moving ? 1 : 0);
    avatar.position.set(walker.position.x, walker.position.y, walker.position.z);
    // Face the way they are actually travelling, not the way the
    // camera happens to be pointing.
    if (moving) avatar.rotation.y = Math.atan2(v.x, v.z);
    poseWorker(avatar, { phase: walkPhase, moving, pose: "stand" });
  }

  function focusOn(position, { height = 2 } = {}) {
    cam.desired.set(position.x, position.y + height, position.z);
  }

  function updateCamera(dt) {
    // With nothing open, the camera rides with the player.
    if (!state.openHazard && !state.finished) {
      cam.desired.set(walker.position.x, walker.position.y + 1.5, walker.position.z);
    }
    const look = input.consumeLook();
    cam.yaw -= look.dx * 0.004;
    cam.pitch -= look.dy * 0.003;
    cam.pitch = Math.max(-1.25, Math.min(0.1, cam.pitch));
    const wheel = input.consumeWheel();
    if (wheel) cam.distance = Math.max(10, Math.min(68, cam.distance + wheel * 0.03));

    cam.target.lerp(cam.desired, Math.min(1, dt * 3));
    const horizontal = Math.cos(cam.pitch) * cam.distance;
    camera.position.set(
      cam.target.x + Math.sin(cam.yaw) * horizontal,
      cam.target.y - Math.sin(cam.pitch) * cam.distance,
      cam.target.z + Math.cos(cam.yaw) * horizontal
    );
    camera.lookAt(cam.target);
  }

  /* --------------------------- inspect / answer --------------------------- */

  function inspect(hazard) {
    if (!hazard || hazard.solved || state.finished) return;
    state.openHazard = hazard;
    focusOn(hazard.world, { height: 2.2 });
    // Zoom in so the player can actually see what they are judging.
    cam.distance = Math.min(cam.distance, 18);
    sfx.interact();
    showQuestion(hazard);
  }

  function showQuestion(hazard) {
    const def = hazard.def;
    api.dialog({
      eyebrow: `GROUND LEVEL — HAZARD ${HAZARDS.indexOf(def) + 1} OF ${HAZARD_COUNT}`,
      title: def.title,
      subtitle: `${def.brief}\n\n${def.question}`,
      tone: "danger",
      options: def.options.map((text, index) => ({
        id: String(index),
        label: text,
        badge: String.fromCharCode(65 + index),
      })),
      footer: hazard.attempts > 0
        ? "Second attempt — worth half."
        : "Right first time is worth double. Take a proper look before you answer.",
      dismissable: true,
      dismissLabel: "Look around first",
      onDismiss: () => { api.dialog(null); state.openHazard = null; pushHud(); },
      onPick: (id) => answer(hazard, Number(id)),
    });
  }

  function answer(hazard, index) {
    if (hazard.solved || state.finished) return;
    const def = hazard.def;
    hazard.attempts += 1;
    api.dialog(null);

    if (index !== def.correct) {
      state.wrong += 1;
      state.score += SCORING.wrongAnswer;
      sfx.wrong();
      api.toast(
        "That warns people about the hazard. It does not control it.",
        "bad",
        SCORING.wrongAnswer
      );
      // The hazard stays exactly where it was — that is the point.
      state.openHazard = null;
      pushHud();
      return;
    }

    // Correct: rebuild the hazard in its fixed form.
    const firstTry = hazard.attempts === 1;
    hazard.solved = true;
    state.solved += 1;
    if (firstTry) state.firstTime += 1;
    const award = firstTry ? SCORING.solvedFirstTry : SCORING.solvedAfterMiss;
    state.score += award;

    hazard.root.remove(hazard.unsafe);
    hazard.fixed = buildFixed(def.kind);
    hazard.root.add(hazard.fixed);
    hazard.flag.visible = false;
    hazard.outline.visible = false;
    hazard.marker.visible = false;

    sfx.correct();
    api.toast(def.toast, "good", award);
    state.openHazard = null;
    pushHud();

    if (hazards.every((h) => h.solved)) finish(true);
  }

  function nextUnsolved() {
    const next = hazards.find((h) => !h.solved);
    if (!next) return;
    focusOn(next.world, { height: 2.2 });
    sfx.click();
    api.toast(`Next: ${next.def.title}`, "info");
  }

  function handleTap() {
    if (state.openHazard) return;   // the dialog owns the input
    const hit = screenRaycast(camera, input.state.ndc, pickTargets, 300);
    if (!hit) return;
    const tagged = findTagged(hit.object, "hazardId");
    const hazard = tagged ? hazardById(tagged.userData.hazardId) : null;
    if (hazard) inspect(hazard);
  }

  /* ------------------------------- debrief ------------------------------- */

  function finish(completed) {
    if (state.finished) return;
    state.finished = true;
    api.dialog(null);

    const remainingSeconds = Math.max(0, Math.floor(state.remainingMs / 1000));
    const accuracy = Math.round((state.firstTime / HAZARD_COUNT) * 100);

    const completionBonus = completed ? SCORING.allSolved : 0;
    const accuracyBonus = Math.round((accuracy / 100) * SCORING.accuracyMax);
    const timeBonus = completed ? remainingSeconds * SCORING.timeBonusPerSecond : 0;
    const raw = state.score + completionBonus + accuracyBonus + timeBonus;
    const score = Math.max(0, Math.min(12000, Math.round(raw * difficulty.scoreScale)));

    const lessons = [];
    hazards.forEach((hazard) => {
      if (!hazard.solved) {
        lessons.push(`${hazard.def.title} — never controlled. ${hazard.def.why}`);
      } else if (hazard.attempts > 1) {
        lessons.push(`${hazard.def.title} — got there on attempt ${hazard.attempts}. ${hazard.def.why}`);
      }
    });
    if (!lessons.length) {
      lessons.push(
        "Every hazard controlled first time. You chose the control that removes the risk each time, "
        + "not the sign that tells somebody it is there."
      );
    }

    api.finish({
      completed,
      score,
      accuracy,
      performance: accuracy,
      timeTakenMs: missionMs - state.remainingMs,
      lessons,
      stats: {
        hazardsCleared: state.solved,
        hazardsTotal: HAZARD_COUNT,
        firstTime: state.firstTime,
        wrongAnswers: state.wrong,
        timeBonus,
      },
    });
  }

  /* --------------------------------- HUD --------------------------------- */

  let hudAccumulator = 0;

  function pushHud() {
    api.hud({
      controlScheme: "build",
      objective: state.finished
        ? "Walk-round complete"
        : `Find and control the hazards (${state.solved}/${HAZARD_COUNT})`,
      score: Math.max(0, state.score),
      timeMs: state.remainingMs,
      progress: (state.solved / HAZARD_COUNT) * 100,
      progressLabel: `${state.solved} of ${HAZARD_COUNT} hazards controlled`,
      danger: state.remainingMs < 60000,
      readoutsTitle: "WALK-ROUND",
      readouts: [
        { label: "CLEARED", value: `${state.solved}/${HAZARD_COUNT}`, tone: "good" },
        { label: "FIRST TIME", value: `${state.firstTime}` },
        { label: "WRONG CALLS", value: `${state.wrong}`, tone: state.wrong ? "warn" : undefined },
      ],
      prompt: state.openHazard
        ? { text: "Choose the control that removes the risk", tone: "good", key: "1-4" }
        : { text: "Tap a flagged hazard to inspect it", tone: "normal", key: "Click" },
      tasks: hazards.map((hazard) => ({
        id: hazard.def.id,
        label: hazard.def.title,
        done: hazard.solved,
      })),
      tasksTitle: "HAZARDS",
      keyHints: mobile ? [] : [
        { key: "Drag", label: "Orbit" },
        { key: "Click", label: "Inspect" },
        { key: "1-4", label: "Answer" },
        { key: "Tab", label: "Next hazard" },
        { key: "T", label: "Top view" },
      ],
    });

    api.buttons([
      { id: "next", label: "NEXT", action: "next", mode: "tap", color: "#FFC629", primary: true },
      { id: "zoom", label: "ZOOM", action: "zoom", mode: "tap", color: "#59B7FF" },
      { id: "top", label: "TOP VIEW", action: "topview", mode: "tap", color: "#9B7CF2" },
    ]);
  }

  /* -------------------------------- loop -------------------------------- */

  focusOn(hazards[0].world, { height: 2.2 });

  stage.start((dt) => {
    if (state.paused) return;

    if (!state.finished) {
      state.remainingMs -= dt * 1000;
      if (state.remainingMs <= 0) {
        state.remainingMs = 0;
        finish(false);
      }
    }

    updateWalker(dt);

    if (!state.finished) {
      if (input.wasPressed("tap")) handleTap();
      if (input.wasPressed("next")) nextUnsolved();
      if (input.wasPressed("zoom")) {
        cam.distance = cam.distance > 24 ? 13 : 40;
        sfx.click();
      }
      if (input.wasPressed("topview")) { siteView.toggle(); sfx.click(); }
      if (state.openHazard) {
        [1, 2, 3, 4].forEach((n) => {
          if (input.wasPressed(`answer${n}`)) answer(state.openHazard, n - 1);
        });
      }
    }

    // Pulse the unsolved flags so they read as "look at me".
    const pulse = 1 + Math.sin(stage.elapsed * 3) * 0.05;
    hazards.forEach((hazard) => {
      if (hazard.solved) return;
      hazard.flag.scale.setScalar(pulse);
      hazard.outline.scale.setScalar(pulse);
    });

    siteView.update(dt, input, () => updateCamera(dt));

    if (cfg.shadows) {
      sun.position.set(cam.target.x + 36, 62, cam.target.z + 28);
      sun.target.position.set(cam.target.x, 0, cam.target.z);
      sun.target.updateMatrixWorld();
    }

    for (let i = 0; i < animated.length; i++) {
      animated[i].phase += dt;
      animated[i].object.rotation.y += Math.sin(animated[i].phase * 0.9) * dt * 0.1;
    }

    hudAccumulator += dt;
    if (hudAccumulator > 0.12) {
      hudAccumulator = 0;
      pushHud();
    }

    input.endFrame();
  });

  pushHud();

  /* ------------------------------ instance ------------------------------ */

  /* ------------------------------- demo -------------------------------
   * All five hazards in turn, from a low angle so each one is readable,
   * then the whole compound from above. */
  const demoTour = [
    establishingShot({ distance: 96, step: 0 }),
    ...hazards.slice(0, 5).map((h, i) => shot(h.world, {
      yaw: 0.5 + i * 1.15,
      pitch: 0.34,
      distance: 13,
      seconds: 6,
      step: Math.min(i + 1, 4),
    })),
    closingShot({ distance: 100, step: 5 }),
  ];

  return {
    input,
    siteView,
    demoTour,

    setPaused(value) {
      state.paused = !!value;
      stage.setPaused(!!value);
      input.setEnabled(!value);
    },

    dispose() {
      siteView.dispose();
      input.dispose();
      stage.dispose();
    },

    // Test seam used by tests/arena-games.test.mjs. Not used by the app.
    __test: {
      camDistance: () => cam.distance,
      state, hazards, hazardById, inspect, answer, nextUnsolved,
      walker, avatar,
      HAZARD_COUNT,
    },
  };
}

export default { ...meta, create };
