/* ------------------------------------------------------------------ *
 *  GAME 5 — EMERGENCY RESPONSE COMMANDER
 *
 *  You are the emergency response team leader. An incident unfolds on a
 *  live site and you command the response through the eight steps of a
 *  real site emergency: identify, assess, raise the alarm, isolate,
 *  respond, evacuate, call the emergency services, close out.
 *
 *  Every decision is on its own clock, and every choice moves three
 *  live meters — the casualty's condition, your control of the scene,
 *  and how much of the workforce is accounted for. The 3D scene reacts:
 *  the fire grows, workers stream to the muster point, the ambulance
 *  arrives at the gate you nominated.
 *
 *  The game never rewards an untrained rescue.
 * ------------------------------------------------------------------ */

import * as THREE from "three";
import { createStage, addDaylight, addSky } from "../../engine/gfx.js";
import { createInput } from "../../engine/input.js";
import {
  createMaterials, createGeometries, box, cylinder,
  buildGround, buildHoarding, buildBrandBanners, buildBrandedTower, buildConcreteFrame, buildGuardrail, buildScaffold,
  buildTowerCrane, updateHoistRope, buildWorker, buildCone, buildSign,
  buildFireExtinguisher, buildElectricalPanel, buildMaterialPallet,
  buildSiteHut, buildBarrier, buildZoneMarker, buildCableRun, buildPuddle,
} from "../../engine/kit.js";
import { sfx } from "../../audio.js";
import { PHASES, SCORING, pickScenario } from "./scenarios.js";

/* ============================== metadata ============================== */

export const meta = {
  id: "emergency-commander",
  controls: "command",

  briefing: {
    role:
      "You are the site emergency response team leader. When the alert comes in, every decision is " +
      "yours — and every one of them is on the clock.",
    objectives: [
      "Work the eight steps in order: identify, assess, alarm, isolate, respond, evacuate, call, close out.",
      "Each step opens by taking you to the scene. Watch what is happening — the question is about what you were just shown.",
      "The decision clock only starts once the question opens, so the look is free. Let it expire and the decision is made for you, badly.",
      "Watch the three meters: casualty condition, scene control, and evacuation accounted for.",
      "Keep the casualty alive and the scene under control.",
      "Never commit untrained people into the hazard. That is always the wrong answer.",
    ],
    scoring: [
      { label: "Best decision", value: "+250" },
      { label: "Acceptable but not best", value: "+120" },
      { label: "Wrong decision", value: "-120 to -150" },
      { label: "Decision clock expired", value: "-150" },
      { label: "Casualty survives", value: "+500" },
      { label: "Scene brought under control", value: "+300" },
    ],
    tips: [
      "A commander who enters the hazard stops being a commander.",
      "Raise the alarm before you do anything clever. It is the only thing that moves everybody at once.",
      "Call the emergency services with what you know now, and update them later. Never delay the call to improve it.",
      "Isolate from outside the hazard. Never send a person in to make it safe.",
      "Preserve the scene. The investigation is how the next person does not get hurt.",
      "Use the observation beat. Drag to look around and wheel to zoom before the question opens.",
    ],
  },

  desktopControls: [
    ["Click", "Choose a decision option"],
    ["1 – 4", "Choose option A to D"],
    ["Mouse drag", "Look around the incident"],
    ["Wheel", "Zoom in on the scene"],
    ["Esc", "Pause"],
  ],
  mobileControls: [
    ["Tap", "Choose a decision option"],
    ["Drag", "Look around the incident"],
    ["BRIEF", "Re-read the incident brief"],
    ["Pause", "Top-right of the HUD"],
  ],
};

const BUILDING = { x: -8, z: 6, width: 20, depth: 15, floors: 4, floorHeight: 3.4 };
const MUSTER = { x: 30, z: 26 };
const GATE = { x: 34, z: -28 };

/**
 * How long the camera holds on the scene before the question opens.
 * The decision clock does not start until this has elapsed, so this is
 * free time to actually look at what is happening.
 */
const OBSERVE_MS = 5000;

/**
 * Decision windows were tight enough that players were answering on
 * instinct rather than on what they could see. Every step's own limit
 * is multiplied by this.
 */
const DECISION_TIME_MULTIPLIER = 1.6;

/* ============================== the game ============================== */

export function create({ container, difficulty, quality, settings, mobile, api }) {
  const stage = createStage(container, { quality, fov: mobile ? 64 : 56 });
  const { scene, camera, cfg } = stage;
  const mat = createMaterials(cfg);
  const geo = createGeometries(cfg);

  const scenario = pickScenario();

  /* --------------------------- environment --------------------------- */

  // An overcast, late-afternoon site: the light itself says something
  // has gone wrong.
  addSky(scene, cfg, { top: "#2B3C4A", bottom: "#A8906F", fogColor: "#8E8775" });
  const sun = addDaylight(scene, cfg, { intensity: 1.55, shadowRadius: 50 });
  scene.add(buildGround(mat, 260));
  const hoarding = buildHoarding(geo, mat, { width: 92, depth: 80, height: 2.4, gateAt: "north" });
  scene.add(hoarding.group);
  scene.add(buildBrandBanners(geo, mat, { width: 92, depth: 80 }));
  scene.add(buildBrandedTower(geo, mat, { x: 30, z: -106, rotY: -0.15 }).group);

  const frame = buildConcreteFrame(geo, mat, { ...BUILDING });
  scene.add(frame.group);
  frame.floors.forEach((floor, index) => {
    if (index === 0) return;
    Object.values(floor.edges).forEach((edge) => {
      scene.add(buildGuardrail(mat, { x: edge.x, y: floor.y, z: edge.z, length: edge.length, axis: edge.axis }));
    });
  });

  const scaffold = buildScaffold(geo, mat, {
    x: BUILDING.x, y: 0, z: BUILDING.z - BUILDING.depth / 2 - 1.4,
    bays: 5, depth: 1.3, lifts: 4, liftHeight: 2.2,
    missingGuardrailLift: scenario.scene === "fall" ? 3 : -1,
  });
  scene.add(scaffold.group);

  const crane = buildTowerCrane(geo, mat, { x: 20, z: -6, mastHeight: 32, jibLength: 36, counterJib: 12 });
  crane.group.position.set(20, 0, -6);
  crane.parts.slew.rotation.y = 1.4;
  crane.parts.trolley.position.x = 18;
  crane.parts.hook.position.y = -24;
  updateHoistRope(crane.parts);
  scene.add(crane.group);

  [[-32, -22, "blue"], [-32, -15, "white"], [-32, -8, "green"]].forEach(([hx, hz, color]) => {
    const hut = buildSiteHut(geo, mat, { color });
    hut.position.set(hx, 0, hz);
    hut.rotation.y = Math.PI / 2;
    scene.add(hut);
  });

  [["block", 14, 22], ["bags", 20, 18], ["pipe", 8, 26]].forEach(([type, px, pz]) => {
    const pallet = buildMaterialPallet(geo, mat, { type, rows: 3 });
    pallet.position.set(px, 0, pz);
    pallet.rotation.y = Math.random();
    scene.add(pallet);
  });

  // The muster point and the gate the ambulance will use.
  const musterZone = buildZoneMarker(mat, { radius: 7, ok: true });
  musterZone.position.set(MUSTER.x, 0.04, MUSTER.z);
  scene.add(musterZone);
  const musterSign = buildSign(geo, mat, { text: "Muster point A", kind: "emergency", height: 2.6, width: 1.3 });
  musterSign.position.set(MUSTER.x, 0, MUSTER.z - 7);
  scene.add(musterSign);

  const gateSign = buildSign(geo, mat, { text: "Emergency vehicle access", kind: "info", height: 2.4, width: 1.2 });
  gateSign.position.set(GATE.x, 0, GATE.z + 3);
  scene.add(gateSign);

  /* ------------------------- the incident scene ------------------------- */

  const incident = { position: new THREE.Vector3(), objects: new THREE.Group() };
  scene.add(incident.objects);

  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff7a1f, transparent: true, opacity: 0.92, depthWrite: false });
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0x20201e, transparent: true, opacity: 0.26, depthWrite: false });
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95, depthWrite: false });

  const fireGroup = new THREE.Group();
  const smokeGroup = new THREE.Group();
  const sparkGroup = new THREE.Group();
  let casualty = null;

  if (scenario.scene === "fire") {
    incident.position.set(BUILDING.x + BUILDING.width / 2 + 3, 0, BUILDING.z - 3);

    // Plant room lean-to against the building.
    incident.objects.add(box(geo, mat.galv, 6, 3, 5, incident.position.x, 1.5, incident.position.z));
    incident.objects.add(box(geo, mat.steelDark, 1.4, 2.3, 0.2, incident.position.x - 2.9, 1.15, incident.position.z + 1.5));

    // The LPG cylinder store that makes this serious.
    for (let i = 0; i < 6; i++) {
      const cyl = cylinder(geo, mat.red, 0.3, 1.3, incident.position.x + 6 + (i % 3) * 0.75, 0.65, incident.position.z + Math.floor(i / 3) * 0.8);
      incident.objects.add(cyl);
    }
    incident.objects.add(buildSign(geo, mat, { text: "LPG highly flammable", kind: "warning", height: 2.0, width: 0.9 }));
    incident.objects.children[incident.objects.children.length - 1].position.set(incident.position.x + 7.5, 0, incident.position.z - 1.6);

    for (let i = 0; i < 7; i++) {
      const flame = new THREE.Mesh(geo.cone, flameMat);
      flame.scale.set(0.7 + Math.random() * 0.5, 1.6 + Math.random(), 0.7);
      flame.position.set((Math.random() - 0.5) * 4, 3.2 + Math.random() * 0.8, (Math.random() - 0.5) * 3.4);
      fireGroup.add(flame);
    }
    fireGroup.position.copy(incident.position);
    incident.objects.add(fireGroup);

    for (let i = 0; i < 6; i++) {
      const puff = new THREE.Mesh(geo.sphere, smokeMat);
      puff.scale.setScalar(2.4 + Math.random() * 2.2);
      puff.position.set((Math.random() - 0.5) * 5, 5.5 + i * 2.1, (Math.random() - 0.5) * 4);
      smokeGroup.add(puff);
    }
    smokeGroup.position.copy(incident.position);
    incident.objects.add(smokeGroup);
  }

  if (scenario.scene === "fall") {
    const liftY = scaffold.platforms[2]?.y ?? 6.6;
    incident.position.set(BUILDING.x + 4, liftY, BUILDING.z - BUILDING.depth / 2 - 1.4);

    // The casualty hanging in his harness below the lift.
    casualty = buildWorker(geo, mat, { helmet: true, vest: true, harness: true, pose: "stand" });
    casualty.position.set(incident.position.x, incident.position.y - 2.4, incident.position.z - 1.4);
    casualty.rotation.z = 0.22;
    incident.objects.add(casualty);

    // The lanyard back up to the anchor.
    const anchorY = incident.position.y + 0.9;
    const dropLength = anchorY - (incident.position.y - 2.4 + 1.3);
    incident.objects.add(cylinder(geo, mat.orange, 0.035, dropLength,
      incident.position.x, anchorY - dropLength / 2, incident.position.z - 1.1,
      { low: true, shadow: false }));

    // Dropped tools below, which is why the area needs a cordon.
    [[0.8, -0.6], [-0.7, 0.4], [0.2, 1.1]].forEach(([ox, oz]) => {
      incident.objects.add(box(geo, mat.steelDark, 0.4, 0.1, 0.12,
        incident.position.x + ox, 0.06, incident.position.z - 1.4 + oz, { rotY: Math.random() * 3 }));
    });

    const cordon = buildZoneMarker(mat, { radius: 4.5 });
    cordon.position.set(incident.position.x, 0.04, incident.position.z - 1.4);
    incident.objects.add(cordon);
  }

  if (scenario.scene === "electrical") {
    incident.position.set(BUILDING.x + 3, frame.floors[1].y, BUILDING.z + 2);

    casualty = buildWorker(geo, mat, { helmet: true, vest: true, pose: "crouch" });
    casualty.position.set(incident.position.x, incident.position.y, incident.position.z);
    casualty.rotation.x = -Math.PI / 2.1;
    casualty.rotation.y = 0.6;
    incident.objects.add(casualty);

    const cable = buildCableRun(geo, mat, { length: 5, damaged: true, onGround: true });
    cable.position.set(incident.position.x + 1.2, incident.position.y, incident.position.z + 0.6);
    cable.rotation.y = 0.5;
    incident.objects.add(cable);

    const wet = buildPuddle(geo, mat, { radius: 2.2 });
    wet.position.set(incident.position.x, incident.position.y + 0.02, incident.position.z);
    incident.objects.add(wet);

    for (let i = 0; i < 5; i++) {
      const spark = new THREE.Mesh(geo.sphere, sparkMat);
      spark.scale.setScalar(0.07 + Math.random() * 0.06);
      spark.position.set(
        incident.position.x + 1.2 + (Math.random() - 0.5) * 0.6,
        incident.position.y + 0.2 + Math.random() * 0.5,
        incident.position.z + 0.6 + (Math.random() - 0.5) * 0.6
      );
      sparkGroup.add(spark);
    }
    incident.objects.add(sparkGroup);

    const panel = buildElectricalPanel(geo, mat, { unsafe: false, height: 1.6 });
    panel.position.set(incident.position.x + 7, incident.position.y, incident.position.z - 2);
    incident.objects.add(panel);

    // Two colleagues about to do the wrong thing.
    [[-1.8, 0.8], [-2.4, -0.6]].forEach(([ox, oz]) => {
      const mate = buildWorker(geo, mat, { helmet: true, vest: true, pose: "reach" });
      mate.position.set(incident.position.x + ox, incident.position.y, incident.position.z + oz);
      mate.rotation.y = -1.2;
      incident.objects.add(mate);
    });
  }

  /* --------------------------- the workforce --------------------------- */

  // Workers who will walk to the muster point once the alarm is raised.
  const crowd = [];
  for (let i = 0; i < 16; i++) {
    const worker = buildWorker(geo, mat, {
      helmet: true,
      vest: true,
      pose: "stand",
      helmetColor: ["yellow", "white", "blue", "orange"][i % 4],
      skin: i % 3 === 0 ? "dark" : "skin",
    });
    const startX = -26 + Math.random() * 44;
    const startZ = -18 + Math.random() * 40;
    worker.position.set(startX, 0, startZ);
    worker.rotation.y = Math.random() * 6;
    scene.add(worker);
    const angle = (i / 16) * Math.PI * 2;
    crowd.push({
      object: worker,
      target: new THREE.Vector3(
        MUSTER.x + Math.cos(angle) * (2 + Math.random() * 4),
        0,
        MUSTER.z + Math.sin(angle) * (2 + Math.random() * 4)
      ),
      speed: 1.6 + Math.random() * 0.9,
      phase: Math.random() * 6,
      arrived: false,
    });
  }

  // The ambulance, which drives in through the nominated gate once the
  // emergency services have been called properly.
  const ambulance = new THREE.Group();
  ambulance.add(box(geo, mat.white, 5.2, 2.1, 2.2, 0, 1.3, 0));
  ambulance.add(box(geo, mat.white, 1.9, 1.5, 2.1, -3.2, 1.0, 0));
  ambulance.add(box(geo, mat.glass, 0.12, 0.9, 1.9, -4.1, 1.4, 0, { shadow: false }));
  ambulance.add(box(geo, mat.green, 5.2, 0.5, 2.24, 0, 1.1, 0, { shadow: false }));
  [[-2.6, 1.1], [-2.6, -1.1], [1.8, 1.1], [1.8, -1.1]].forEach(([wx, wz]) => {
    ambulance.add(cylinder(geo, mat.black, 0.45, 0.3, wx, 0.45, wz, { rotX: Math.PI / 2, low: true }));
  });
  const beaconA = new THREE.Mesh(geo.sphere, new THREE.MeshBasicMaterial({ color: 0x59b7ff }));
  beaconA.scale.setScalar(0.22);
  beaconA.position.set(-1.4, 2.5, 0.7);
  ambulance.add(beaconA);
  const beaconB = new THREE.Mesh(geo.sphere, new THREE.MeshBasicMaterial({ color: 0x59b7ff }));
  beaconB.scale.setScalar(0.22);
  beaconB.position.set(-1.4, 2.5, -0.7);
  ambulance.add(beaconB);
  ambulance.position.set(GATE.x, 0, GATE.z - 26);
  ambulance.visible = false;
  scene.add(ambulance);

  // Cordon cones that appear when the player isolates the area.
  const cordonGroup = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    const cone = buildCone(geo, mat, {});
    cone.position.set(
      incident.position.x + Math.cos(angle) * 9,
      0,
      incident.position.z + Math.sin(angle) * 9
    );
    cordonGroup.add(cone);
  }
  for (let i = 0; i < 4; i++) {
    const barrier = buildBarrier(geo, mat, { length: 2.6, color: "red" });
    const angle = (i / 4) * Math.PI * 2 + 0.4;
    barrier.position.set(
      incident.position.x + Math.cos(angle) * 9,
      0,
      incident.position.z + Math.sin(angle) * 9
    );
    barrier.rotation.y = -angle;
    cordonGroup.add(barrier);
  }
  cordonGroup.visible = false;
  scene.add(cordonGroup);

  // Fire point near the incident, for the fire scenario.
  const firePoint = buildFireExtinguisher(geo, mat, { onStand: true });
  firePoint.position.set(incident.position.x - 6, 0, incident.position.z + 4);
  scene.add(firePoint);

  /* ============================ game state ============================ */

  const missionMs = 420000 * difficulty.timeScale;
  const state = {
    remainingMs: missionMs,
    score: 0,
    stepIndex: 0,
    decisions: [],
    best: 0,
    acceptable: 0,
    wrong: 0,
    timeouts: 0,
    casualty: 100,
    control: 40,
    evacuation: 0,
    alarmRaised: false,
    isolated: false,
    evacuating: false,
    servicesCalled: false,
    finished: false,
    paused: false,
    disposed: false,
    dialogOpen: false,
    briefOpen: false,
    decisionEndsAt: 0,
    decisionLength: 0,
    // The "look at the scene" beat that runs before each question.
    observing: false,
    observeEndsAt: 0,
    lastCountdownBeep: 0,
    consequence: null,
    consequenceUntil: 0,
    lessons: [],
    fireIntensity: 1,
  };

  /* ------------------------------- input ------------------------------- */

  const input = createInput(container, {
    pointerLock: false,
    onPause: () => api.requestPause(),
    keymap: {
      Escape: "pause",
      Digit1: "opt1", Digit2: "opt2", Digit3: "opt3", Digit4: "opt4",
      KeyB: "brief",
    },
  });
  input.setSensitivity(settings.lookSensitivity ?? 1);

  api.buttons([
    { id: "brief", label: "BRIEF", action: "brief", mode: "tap", color: "#59B7FF", primary: true },
  ]);

  /* ------------------------------ camera ------------------------------ */

  const cam = {
    yaw: 2.4,
    pitch: -0.34,
    distance: scenario.scene === "fall" ? 24 : 26,
    target: incident.position.clone(),
    desired: incident.position.clone(),
  };

  function updateCamera(dt) {
    const look = input.consumeLook();
    cam.yaw -= look.dx * 0.004;
    cam.pitch -= look.dy * 0.003;
    cam.pitch = Math.max(-1.1, Math.min(0.2, cam.pitch));
    const wheel = input.consumeWheel();
    if (wheel) cam.distance = Math.max(10, Math.min(70, cam.distance + wheel * 0.03));

    // While observing, ease the camera in towards the subject. The
    // player can still drag and wheel — this only moves the baseline.
    if (state.observing && cam.observeDistance) {
      cam.distance += (cam.observeDistance - cam.distance) * Math.min(1, dt * 1.4);
    }

    cam.target.lerp(cam.desired, Math.min(1, dt * 2.2));
    const horizontal = Math.cos(cam.pitch) * cam.distance;
    camera.position.set(
      cam.target.x + Math.sin(cam.yaw) * horizontal,
      cam.target.y + 3 - Math.sin(cam.pitch) * cam.distance,
      cam.target.z + Math.cos(cam.yaw) * horizontal
    );
    camera.lookAt(cam.target);
  }

  // The camera moves to whatever the current step is about, and then
  // pushes IN while the player is observing it, so the thing they are
  // about to be asked about is unmistakably on screen.
  function frameForPhase(phase) {
    if (phase === 2 || phase === 5) {
      cam.desired.set(MUSTER.x, 1, MUSTER.z);
      cam.distance = 34;
      cam.observeDistance = 19;
    } else if (phase === 6) {
      cam.desired.set(GATE.x, 1, GATE.z);
      cam.distance = 30;
      cam.observeDistance = 17;
    } else {
      cam.desired.copy(incident.position);
      cam.distance = scenario.scene === "fall" ? 22 : 24;
      cam.observeDistance = scenario.scene === "fall" ? 11 : 12;
    }
  }

  /* ---------------------------- the step machine ---------------------------- */

  let currentStep = null;
  let currentOptions = [];
  // Pending beats between decisions. Tracked so dispose() can cancel
  // them — otherwise leaving the game mid-incident would fire a dialog
  // into a torn-down shell.
  const pendingTimers = new Set();

  function later(fn, ms) {
    const id = setTimeout(() => {
      pendingTimers.delete(id);
      if (!state.disposed) fn();
    }, ms);
    pendingTimers.add(id);
    return id;
  }

  function clearPendingTimers() {
    pendingTimers.forEach(clearTimeout);
    pendingTimers.clear();
  }

  function clampMeter(value) {
    return Math.max(0, Math.min(100, value));
  }

  /**
   * Every step now runs in two beats:
   *
   *   1. OBSERVE — the camera flies in and zooms onto whatever the step
   *      is about, with a short "look at the scene" countdown and no
   *      question on screen. You are supposed to see the incident.
   *   2. DECIDE — the question opens, based on what you were just shown.
   *
   * The decision clock does not start until beat 2, so the observation
   * time is genuinely free.
   */
  function openStep() {
    if (state.finished) return;
    const step = scenario.steps[state.stepIndex];
    if (!step) {
      finish(true);
      return;
    }
    currentStep = step;
    currentOptions = step.options;
    frameForPhase(step.phase);

    // Beat 1: observe.
    state.observing = true;
    state.dialogOpen = false;
    state.briefOpen = false;
    state.observeEndsAt = stage.elapsed * 1000 + OBSERVE_MS;
    sfx.radio();
    api.toast(step.title, "warn");
    if (step.subtitle) api.toast(step.subtitle, "info");

    later(() => {
      if (state.finished || state.disposed) return;
      beginDecision();
    }, OBSERVE_MS);
  }

  function beginDecision() {
    if (!currentStep || state.finished) return;
    state.observing = false;

    const limit = currentStep.timeLimitMs * DECISION_TIME_MULTIPLIER * difficulty.timeScale;
    state.decisionLength = limit;
    state.decisionEndsAt = stage.elapsed * 1000 + limit;
    state.dialogOpen = true;
    state.lastCountdownBeep = 0;
    sfx.decisionOpen();
    renderDialog();
  }

  function renderDialog() {
    if (!currentStep) return;
    const remaining = Math.max(0, state.decisionEndsAt - stage.elapsed * 1000);
    api.dialog({
      eyebrow: `STEP ${currentStep.phase + 1} OF 8 — ${PHASES[currentStep.phase].toUpperCase()}`,
      title: currentStep.title,
      subtitle: currentStep.subtitle,
      tone: "danger",
      timerMs: remaining,
      timerPercent: (remaining / Math.max(1, state.decisionLength)) * 100,
      options: currentOptions.map((option, i) => ({
        id: option.id,
        label: option.label,
        desc: difficulty.hints ? option.desc : undefined,
        badge: String.fromCharCode(65 + i),
      })),
      footer: `Decision clock running. Casualty ${Math.round(state.casualty)}% · Control ${Math.round(state.control)}%`,
      onPick: (id) => resolveStep(id),
    });
  }

  function applyEffects(effects) {
    if (!effects) return;
    state.casualty = clampMeter(state.casualty + (effects.casualty || 0));
    state.control = clampMeter(state.control + (effects.control || 0));
    state.evacuation = clampMeter(state.evacuation + (effects.evacuation || 0));
  }

  function resolveStep(optionId) {
    if (!currentStep) return;
    const option = currentOptions.find((o) => o.id === optionId) || null;
    const phase = currentStep.phase;

    if (!option) {
      // Timed out: the worst available option is what happens by default.
      const worst = [...currentOptions].sort((a, b) => (a.points || 0) - (b.points || 0))[0];
      state.timeouts += 1;
      state.score += SCORING.timeout;
      applyEffects(worst?.effects);
      state.lessons.push(`Step ${phase + 1}: no decision was made in time. In an emergency, a slow decision is a decision.`);
      sfx.wrong();
      api.toast("Decision clock expired — the situation decided for you.", "bad", SCORING.timeout);
      advance(phase, false);
      return;
    }

    state.score += option.points || 0;
    applyEffects(option.effects);
    state.decisions.push({ phase, optionId, correct: !!option.correct, points: option.points || 0 });

    if (option.correct) {
      state.best += 1;
      sfx.correct();
      api.toast(option.feedback, "good", option.points);
    } else if ((option.points || 0) > 0) {
      state.acceptable += 1;
      sfx.click();
      api.toast(option.feedback, "warn", option.points);
      state.lessons.push(option.feedback);
    } else {
      state.wrong += 1;
      sfx.wrong();
      api.toast(option.feedback, "bad", option.points);
      state.lessons.push(option.feedback);
      if (option.consequence) {
        state.consequence = option.consequence;
        state.consequenceUntil = stage.elapsed + 3;
        sfx.alarm();
      }
    }

    advance(phase, !!option.correct);
  }

  // Phase side effects on the 3D scene.
  function advance(phase, wasCorrect) {
    if (phase === 2) {
      state.alarmRaised = true;
      state.evacuating = true;
      sfx.alarm();
    }
    if (phase === 3 && wasCorrect) {
      state.isolated = true;
      cordonGroup.visible = true;
    }
    if (phase === 4 && wasCorrect && scenario.scene === "fire") {
      // A defensive strategy stops the fire growing out of control.
      state.fireIntensity = Math.min(state.fireIntensity, 1.5);
    }
    if (phase === 6 && wasCorrect) {
      state.servicesCalled = true;
      ambulance.visible = true;
      // You hear it before you see it come through the gate.
      sfx.ambulance();
    }

    state.stepIndex += 1;
    state.dialogOpen = false;
    api.dialog(null);

    if (state.stepIndex >= scenario.steps.length) {
      finish(true);
      return;
    }
    // A short beat between decisions so the player sees the scene react.
    later(() => {
      if (!state.finished) openStep();
    }, 1400);
  }

  function showBrief() {
    // The brief can be re-read at any time, including mid-decision — but
    // the decision clock keeps running, so reading it costs you time.
    const interrupting = state.dialogOpen && currentStep;
    // Stops the decision dialog's periodic timer re-render from
    // immediately painting over the brief.
    state.briefOpen = true;
    api.dialog({
      eyebrow: "INCIDENT BRIEF",
      title: scenario.title,
      subtitle: scenario.brief,
      tone: "danger",
      options: [],
      dismissable: true,
      dismissLabel: interrupting ? "Back to the decision — the clock is running" : "Back to the incident",
      footer: `Alert: ${scenario.alert}`,
      onDismiss: () => {
        state.briefOpen = false;
        if (interrupting && !state.finished) renderDialog();
        else api.dialog(null);
      },
    });
  }

  /* ------------------------------ finishing ------------------------------ */

  function finish(completed) {
    if (state.finished) return;
    state.finished = true;
    api.dialog(null);

    const total = scenario.steps.length;
    const remainingSeconds = Math.max(0, Math.floor(state.remainingMs / 1000));
    const casualtySurvived = state.casualty >= 35;
    const controlled = state.control >= 60;

    const survivalBonus = casualtySurvived ? SCORING.casualtySurvived : 0;
    const controlBonus = controlled ? SCORING.siteControlled : 0;
    const completionBonus = completed ? SCORING.completion : 0;
    const timeBonus = completed ? remainingSeconds * SCORING.timeBonusPerSecond : 0;

    const raw = state.score + survivalBonus + controlBonus + completionBonus + timeBonus;
    const score = Math.max(0, Math.round(raw * difficulty.scoreScale));

    // Performance weights the decisions most heavily, then the outcome.
    const decisionScore = total ? (state.best + state.acceptable * 0.5) / total : 0;
    const performance = Math.round(
      decisionScore * 60 + (state.casualty / 100) * 25 + (state.control / 100) * 15
    );

    const lessons = state.lessons.length
      ? [...new Set(state.lessons)].slice(0, 6)
      : ["Textbook command. Every step taken in the right order, with nobody committed into the hazard."];
    if (!casualtySurvived) {
      lessons.unshift("The casualty did not survive this response. Re-read the briefing on isolation before treatment — that sequence is what decides these outcomes.");
    }

    api.finish({
      score,
      completed,
      accuracy: Math.round(decisionScore * 100),
      performance,
      timeTakenMs: Math.round(missionMs - state.remainingMs),
      stats: {
        scenario: scenario.id,
        steps: total,
        bestDecisions: state.best,
        acceptable: state.acceptable,
        wrongDecisions: state.wrong,
        timeouts: state.timeouts,
        casualties: casualtySurvived ? 0 : 1,
        casualtyCondition: Math.round(state.casualty),
        sceneControl: Math.round(state.control),
        accountedFor: Math.round(state.evacuation),
      },
      breakdown: [
        { label: "Scenario", value: scenario.title, tone: "info" },
        { label: "Best decisions", value: `${state.best} / ${total}`, tone: state.best === total ? "good" : "info" },
        { label: "Acceptable decisions", value: `${state.acceptable}`, tone: "info" },
        { label: "Wrong decisions", value: `${state.wrong}`, tone: state.wrong ? "bad" : "good" },
        { label: "Decision clocks missed", value: `${state.timeouts}`, tone: state.timeouts ? "bad" : "good" },
        { label: "Casualty condition", value: `${Math.round(state.casualty)}%`, tone: casualtySurvived ? "good" : "bad" },
        { label: "Scene control", value: `${Math.round(state.control)}%`, tone: controlled ? "good" : "bad" },
        { label: "Workforce accounted for", value: `${Math.round(state.evacuation)}%`, tone: state.evacuation >= 80 ? "good" : "info" },
        ...(survivalBonus ? [{ label: "Casualty survived", value: `+${survivalBonus}`, tone: "good" }] : []),
        ...(controlBonus ? [{ label: "Scene under control", value: `+${controlBonus}`, tone: "good" }] : []),
        ...(completionBonus ? [{ label: "Response completed", value: `+${completionBonus}`, tone: "good" }] : []),
        ...(timeBonus ? [{ label: `Time bonus (${remainingSeconds}s left)`, value: `+${timeBonus}`, tone: "good" }] : []),
        { label: `Difficulty multiplier (${difficulty.label})`, value: `×${difficulty.scoreScale}`, tone: "info" },
      ],
      lessons,
    });
  }

  /* -------------------------------- HUD -------------------------------- */

  let hudAccumulator = 0;

  function pushHud() {
    const step = scenario.steps[state.stepIndex];
    api.hud({
      controlScheme: "command",
      objective: state.finished
        ? "Incident closed out"
        : state.observing && step
          ? `LOOK AT THE SCENE — ${PHASES[step.phase]}`
          : step
            ? `${PHASES[step.phase]} — step ${step.phase + 1} of 8`
            : scenario.title,
      score: Math.max(0, state.score),
      timeMs: state.remainingMs,
      progress: (state.stepIndex / scenario.steps.length) * 100,
      progressLabel: `${state.stepIndex} of ${scenario.steps.length} steps decided`,
      danger: true,
      flashDanger: state.consequence !== null && stage.elapsed < state.consequenceUntil,
      readoutsTitle: "INCIDENT",
      readouts: [
        { label: "ALERT", value: scenario.id.toUpperCase(), tone: "bad" },
        { label: "ALARM", value: state.alarmRaised ? "RAISED" : "NOT RAISED", tone: state.alarmRaised ? "good" : "bad" },
        { label: "AREA", value: state.isolated ? "ISOLATED" : "OPEN", tone: state.isolated ? "good" : "warn" },
        { label: "SERVICES", value: state.servicesCalled ? "EN ROUTE" : "NOT CALLED", tone: state.servicesCalled ? "good" : "warn" },
      ],
      meters: [
        { label: "CASUALTY", value: state.casualty, color: "#EA4F4F", warnBelow: 35 },
        { label: "SCENE CONTROL", value: state.control, color: "#FFC629", warnBelow: 30 },
        { label: "ACCOUNTED FOR", value: state.evacuation, color: "#33C481", warnBelow: 20 },
      ],
      tasks: PHASES.map((label, index) => ({
        id: label,
        label,
        done: index < state.stepIndex,
      })),
      prompt: state.observing
        ? {
            text: `Watch what is happening — the question opens in ${Math.max(0, Math.ceil((state.observeEndsAt - stage.elapsed * 1000) / 1000))}s`,
            tone: "normal",
            key: "",
          }
        : null,
      tasksTitle: "RESPONSE STEPS",
      keyHints: mobile ? [] : [
        { key: "1-4", label: "Decide" },
        { key: "Drag", label: "Look" },
        { key: "B", label: "Brief" },
        { key: "Esc", label: "Pause" },
      ],
    });
  }

  /* -------------------------------- loop -------------------------------- */

  // Show the brief, then start the clock on the first decision. The
  // brief stays dismissable from the BRIEF button at any time.
  // The incident announces itself: the site evacuation siren runs under
  // the brief, so the player hears the emergency before they read it.
  sfx.siren();
  showBrief();
  later(() => {
    if (!state.finished) { api.dialog(null); openStep(); }
  }, 3400);

  stage.start((dt) => {
    if (state.paused) return;

    if (!state.finished) {
      state.remainingMs -= dt * 1000;
      if (state.remainingMs <= 0) {
        state.remainingMs = 0;
        finish(false);
      }
    }

    // Decision clock.
    if (state.dialogOpen && currentStep && !state.finished) {
      const remaining = state.decisionEndsAt - stage.elapsed * 1000;
      // An audible countdown over the last five seconds, so the clock is
      // something you hear rather than something you have to watch.
      if (remaining > 0 && remaining <= 5000) {
        const second = Math.ceil(remaining / 1000);
        if (second !== state.lastCountdownBeep) {
          state.lastCountdownBeep = second;
          sfx.countdown();
        }
      }
      if (remaining <= 0) {
        resolveStep(null);
      } else if (!state.briefOpen) {
        // Re-render the dialog a few times a second so the timer bar moves.
        hudAccumulator += dt;
        if (hudAccumulator > 0.2) {
          hudAccumulator = 0;
          renderDialog();
          pushHud();
        }
      }
    } else {
      hudAccumulator += dt;
      if (hudAccumulator > 0.14) {
        hudAccumulator = 0;
        pushHud();
      }
    }

    // Keyboard shortcuts for the options.
    if (state.dialogOpen && currentStep) {
      for (let i = 0; i < 4; i++) {
        if (input.wasPressed(`opt${i + 1}`) && currentOptions[i]) {
          resolveStep(currentOptions[i].id);
          break;
        }
      }
    } else if (input.wasPressed("brief")) {
      showBrief();
    }

    if (state.consequence && stage.elapsed > state.consequenceUntil) state.consequence = null;

    /* ----- the scene reacts ----- */

    // Fire grows until the player commits to a defensive strategy.
    if (scenario.scene === "fire" && !state.finished) {
      if (state.stepIndex < 5) state.fireIntensity += dt * 0.055;
      fireGroup.children.forEach((flame, index) => {
        flame.scale.y = (1.6 + Math.sin(stage.elapsed * 7 + index) * 0.4) * state.fireIntensity;
        flame.scale.x = (0.8 + Math.sin(stage.elapsed * 5 + index) * 0.15) * Math.min(1.8, state.fireIntensity);
        flame.rotation.z = Math.sin(stage.elapsed * 4 + index) * 0.2;
      });
      smokeGroup.children.forEach((puff, index) => {
        puff.position.y += dt * 0.9;
        puff.position.x += dt * 1.3;
        if (puff.position.y > 22) {
          puff.position.y = 5;
          puff.position.x = (Math.random() - 0.5) * 5;
        }
        puff.scale.setScalar((2.4 + (puff.position.y - 5) * 0.22) * Math.min(1.6, state.fireIntensity));
        puff.rotation.y += dt * 0.3 * (index % 2 ? 1 : -1);
      });
    }

    // Sparks arc at the damaged cable until the supply is isolated.
    if (scenario.scene === "electrical") {
      const live = state.stepIndex < 4;
      sparkGroup.visible = live && Math.sin(stage.elapsed * 22) > 0.1;
      sparkGroup.children.forEach((spark, index) => {
        spark.position.y = incident.position.y + 0.2 + ((stage.elapsed * 3 + index) % 1) * 0.6;
      });
    }

    // The casualty's condition shows on the model.
    if (casualty && scenario.scene === "fall") {
      casualty.rotation.z = 0.22 + Math.sin(stage.elapsed * 1.4) * 0.05 * (state.casualty / 100);
    }

    // Workers walk to the muster point once the alarm has been raised.
    if (state.evacuating) {
      let arrived = 0;
      crowd.forEach((person) => {
        if (person.arrived) { arrived += 1; return; }
        const object = person.object;
        const dx = person.target.x - object.position.x;
        const dz = person.target.z - object.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 0.5) {
          person.arrived = true;
          arrived += 1;
          object.rotation.y = Math.atan2(MUSTER.x - object.position.x, MUSTER.z - object.position.z) + Math.PI;
          return;
        }
        object.position.x += (dx / distance) * person.speed * dt;
        object.position.z += (dz / distance) * person.speed * dt;
        object.rotation.y = Math.atan2(dx, dz);
        // A simple walk bob so they read as moving people.
        person.phase += dt * 7;
        object.position.y = Math.abs(Math.sin(person.phase)) * 0.05;
      });
      // The meter follows the actual crowd, so the number on screen is
      // the truth about the scene rather than a decoration.
      const walked = Math.round((arrived / crowd.length) * 100);
      state.evacuation = clampMeter(Math.max(state.evacuation, walked));
    }

    // Ambulance drives in to the gate, beacons flashing.
    if (ambulance.visible) {
      const targetX = GATE.x;
      const targetZ = GATE.z + 4;
      const dz = targetZ - ambulance.position.z;
      if (Math.abs(dz) > 0.4) {
        ambulance.position.z += Math.sign(dz) * Math.min(Math.abs(dz), 9 * dt);
      }
      const flash = Math.sin(stage.elapsed * 9) > 0;
      beaconA.visible = flash;
      beaconB.visible = !flash;
    }

    updateCamera(dt);

    if (cfg.shadows) {
      sun.position.set(cam.target.x + 40, 60, cam.target.z + 30);
      sun.target.position.set(cam.target.x, 0, cam.target.z);
      sun.target.updateMatrixWorld();
    }

    input.endFrame();
  });

  pushHud();

  /* ------------------------------ instance ------------------------------ */

  return {
    input,

    setPaused(value) {
      state.paused = !!value;
      // The decision clock is measured against stage.elapsed, which the
      // stage stops accumulating while paused — so pausing freezes the
      // decision timer automatically and no adjustment is needed here.
      stage.setPaused(!!value);
      input.setEnabled(!value);
    },

    dispose() {
      state.disposed = true;
      clearPendingTimers();
      input.dispose();
      stage.dispose();
    },

    // Test seam used by tests/arena-games.test.mjs. Not used by the app.
    __test: {
      state, scenario, crowd,
      currentStep: () => currentStep,
      currentOptions: () => currentOptions,
      // Lets the headless test skip the 5-second observation beat
      // rather than sleeping through eight of them.
      beginDecision,
      OBSERVE_MS,
    },
  };
}

export default { ...meta, create };
