/* ------------------------------------------------------------------ *
 *  GAME 2 — TOWER CRANE MASTER
 *
 *  A real tower crane simulator. Slew, trolley and hoist all drive the
 *  actual 3D crane, and the load is a damped pendulum driven by the
 *  hook's acceleration — so snatching the controls makes the load
 *  swing, exactly as it does on site, and you have to let it settle
 *  before you can land it.
 *
 *  Enforced the way a real lift is: a load-radius capacity chart,
 *  barriered exclusion zones you must not swing over, structural
 *  collision, wind limits with an emergency stop, and a swing limit at
 *  the point of landing.
 * ------------------------------------------------------------------ */

import * as THREE from "three";
import { createStage, addDaylight, addSky } from "../../engine/gfx.js";
import { createInput } from "../../engine/input.js";
import {
  createMaterials, createGeometries, box, cylinder,
  buildGround, buildHoarding, buildBrandBanners, buildBrandedTower, buildConcreteFrame, buildGuardrail,
  buildTowerCrane, updateHoistRope, buildWorker, buildCone, buildSign,
  buildMaterialPallet, buildZoneMarker, buildSiteHut, buildBarrier,
} from "../../engine/kit.js";
import { sfx, setMotor, stopAllLoops } from "../../audio.js";

/* ============================== metadata ============================== */

export const meta = {
  id: "crane-master",
  controls: "crane",

  briefing: {
    role:
      "You are the appointed tower crane operator. One lift is planned: a bundle of structural " +
      "steel from the stockpile up onto the building. The slinger has rigged it and the site is " +
      "live below you.",
    objectives: [
      "Hoist down, position the hook over the load and ATTACH it.",
      "Lift to a safe travel height before you slew — never drag a load across the site.",
      "Keep the load outside every barriered exclusion zone. People work under you.",
      "Watch the capacity readout: safe working load falls as the radius grows.",
      "Let the swing settle, then land the load inside the target and RELEASE.",
      "If the wind alarm sounds, hit EMERGENCY STOP and wait for it to pass.",
    ],
    scoring: [
      { label: "Lift completed", value: "+400" },
      { label: "Placement accuracy", value: "up to +200" },
      { label: "Landed with the load steady", value: "up to +100" },
      { label: "Safety violation", value: "-150" },
      { label: "Overload event", value: "-200" },
      { label: "Lift plan completed", value: "+400" },
    ],
    tips: [
      "Ease the controls on and off. Snatching them is what makes a load swing.",
      "Hoisting in and slewing at the same time is how loads hit scaffolds. Do one, then the other.",
      "Safe working load = the moment limit divided by the radius. Long radius, light load.",
      "A load that is still swinging will not land in the target — wait for it.",
      "Emergency stop kills all three motions at once. Use it the moment anything looks wrong.",
    ],
  },

  desktopControls: [
    ["A / D", "Slew the jib left and right"],
    ["W / S", "Run the trolley out and in"],
    ["Q / E", "Hoist up and down"],
    ["Arrows", "Same as A/D/W/S if you prefer"],
    ["Space", "Attach the load / release the load"],
    ["X", "EMERGENCY STOP — kills all motion"],
    ["C", "Switch between cab view and site view"],
    ["Mouse drag", "Orbit the camera · wheel to zoom"],
    ["Esc", "Pause"],
  ],
  mobileControls: [
    ["SLEW ◀ ▶", "Hold to swing the jib"],
    ["TROLLEY", "Hold IN / OUT to run the trolley"],
    ["HOIST ▲ ▼", "Hold to raise or lower the hook"],
    ["ATTACH", "Hook on, and release when you have landed"],
    ["E-STOP", "Stops everything immediately"],
    ["VIEW", "Cab view or site view"],
    ["Drag screen", "Orbit the camera"],
  ],
};

/* ============================ crane spec ============================ */

const CRANE = {
  x: 0, z: 0,
  mastHeight: 36,
  jibLength: 44,
  counterJib: 14,
  minRadius: 5,
  maxRadius: 41,
  slewRate: 0.17,        // rad/s at full speed
  slewAccel: 0.5,        // rad/s^2 — the crane has real inertia
  trolleyRate: 1.9,      // m/s
  trolleyAccel: 3.0,
  hoistRate: 1.7,        // m/s
  hoistAccel: 4.0,
  momentLimit: 78,       // tonne-metres
  maxLoad: 6.0,          // tonnes
  minHookHeight: 0.9,
  travelHeight: 9,       // the height above which slewing is considered safe
};

const BUILDING = { x: -12, z: 11, width: 18, depth: 14, floors: 4, floorHeight: 3.4 };

/* ============================== the lifts ============================== */

/**
 * ONE lift. The mission is to take a single load off the stockpile and
 * land it on the building above — pick, rig, slew, trolley, hoist, land.
 *
 * Difficulty raises the floor it has to go to and adds the wind event,
 * rather than adding more loads: doing one lift properly is the skill,
 * and repeating it four times only added length.
 */
function buildLiftPlan(difficulty) {
  const floor = difficulty.id === "easy" ? 1 : difficulty.id === "hard" ? 3 : 2;
  return [
    {
      id: "steel",
      label: "Structural steel bundle",
      mass: 2.5,
      palletType: "steel",
      size: { x: 3.2, y: 0.9, z: 1.2 },
      pick: { x: 17, z: -13 },
      target: { x: -9, z: 13, floor },
      note: `Take the steel bundle from the stockpile and land it on Level ${floor + 1}. `
        + "The banksman has cleared the slab and the lift plan is agreed.",
      windEvent: difficulty.id === "hard",
    },
  ];
}

const SCORING = {
  liftComplete: 400,
  accuracyMax: 200,
  steadyMax: 100,
  violation: -150,
  overload: -200,
  allLifts: 400,
  timeBonusPerSecond: 2,
};

/* ============================== the game ============================== */

export function create({ container, difficulty, quality, settings, mobile, api }) {
  const stage = createStage(container, { quality, fov: mobile ? 66 : 58 });
  const { scene, camera, cfg } = stage;
  const mat = createMaterials(cfg);
  const geo = createGeometries(cfg);

  /* --------------------------- environment --------------------------- */

  addSky(scene, cfg, { top: "#27618F", bottom: "#D3E2EC", fogColor: "#C8DAE6" });
  const sun = addDaylight(scene, cfg, { intensity: 2.05, shadowRadius: 58 });
  scene.add(buildGround(mat, 300));

  const hoarding = buildHoarding(geo, mat, { width: 96, depth: 86, height: 2.4, gateAt: "south" });
  scene.add(hoarding.group);
  scene.add(buildBrandBanners(geo, mat, { width: 96, depth: 86 }));
  scene.add(buildBrandedTower(geo, mat, { x: 34, z: -112, rotY: -0.22 }).group);

  // The structure we are feeding.
  const frame = buildConcreteFrame(geo, mat, { ...BUILDING });
  scene.add(frame.group);
  frame.floors.forEach((floor, index) => {
    if (index === 0) return;
    Object.values(floor.edges).forEach((edge) => {
      scene.add(buildGuardrail(mat, {
        x: edge.x, y: floor.y, z: edge.z, length: edge.length, axis: edge.axis,
      }));
    });
  });

  // Obstacles the load must not hit. Boxes, checked against the load.
  const obstacles = [];
  frame.floors.forEach((floor) => {
    obstacles.push({
      minX: BUILDING.x - BUILDING.width / 2, maxX: BUILDING.x + BUILDING.width / 2,
      minY: floor.y - 0.4, maxY: floor.y + 0.5,
      minZ: BUILDING.z - BUILDING.depth / 2, maxZ: BUILDING.z + BUILDING.depth / 2,
      label: `the Level ${floor.index} slab`,
      isSlab: true,
      floorY: floor.y,
    });
  });

  [[34, -26, "blue"], [34, -19, "white"]].forEach(([hx, hz, color]) => {
    const hut = buildSiteHut(geo, mat, { color });
    hut.position.set(hx, 0, hz);
    scene.add(hut);
    obstacles.push({
      minX: hx - 3.2, maxX: hx + 3.2, minY: 0, maxY: 3.1,
      minZ: hz - 1.6, maxZ: hz + 1.6, label: "the site cabins",
    });
  });

  /* ------------------------------ crane ------------------------------ */

  const crane = buildTowerCrane(geo, mat, {
    x: CRANE.x, z: CRANE.z,
    mastHeight: CRANE.mastHeight, jibLength: CRANE.jibLength, counterJib: CRANE.counterJib,
  });
  crane.group.position.set(CRANE.x, 0, CRANE.z);
  scene.add(crane.group);

  // The mast is an obstacle too — swinging a load into your own tower
  // is a classic incident.
  obstacles.push({
    minX: CRANE.x - 1.6, maxX: CRANE.x + 1.6, minY: 0, maxY: CRANE.mastHeight,
    minZ: CRANE.z - 1.6, maxZ: CRANE.z + 1.6, label: "the crane mast",
  });

  const hookTopY = CRANE.mastHeight + 1.2 + 0.78;

  /* -------------------------- exclusion zones -------------------------- */

  const EXCLUSION_ZONES = [
    { x: 8, z: -6, r: 6.5, label: "the steel fixers' work area" },
    { x: -2, z: 22, r: 6.0, label: "the pedestrian walkway" },
    { x: 24, z: -2, r: 5.5, label: "the rebar bending yard" },
  ];

  EXCLUSION_ZONES.forEach((zone) => {
    const marker = buildZoneMarker(mat, { radius: zone.r });
    marker.position.set(zone.x, 0.04, zone.z);
    scene.add(marker);
    const cones = 12;
    for (let i = 0; i < cones; i++) {
      const angle = (i / cones) * Math.PI * 2;
      const cone = buildCone(geo, mat, {});
      cone.position.set(zone.x + Math.cos(angle) * zone.r, 0, zone.z + Math.sin(angle) * zone.r);
      scene.add(cone);
    }
    const barrier = buildBarrier(geo, mat, { length: 2.6, color: "red" });
    barrier.position.set(zone.x, 0, zone.z - zone.r);
    scene.add(barrier);
    const sign = buildSign(geo, mat, { text: "No entry lifting zone", kind: "prohibition", height: 1.9, width: 0.8 });
    sign.position.set(zone.x + zone.r * 0.7, 0, zone.z + zone.r * 0.7);
    scene.add(sign);
  });

  // Workers inside the zones, so the stakes are visible, plus some
  // elsewhere on site.
  const animated = [];
  function placeWorker(opts, x, z, rotY, y = 0) {
    const worker = buildWorker(geo, mat, opts);
    worker.position.set(x, y, z);
    worker.rotation.y = rotY;
    scene.add(worker);
    animated.push({ object: worker, phase: Math.random() * 6 });
    return worker;
  }
  placeWorker({ helmet: true, vest: true, pose: "work" }, 7, -5, 1.2);
  placeWorker({ helmet: true, vest: true, pose: "work", skin: "dark" }, 10, -8, -0.7);
  placeWorker({ helmet: true, vest: true, pose: "stand", helmetColor: "white" }, -1, 21, 2.4);
  placeWorker({ helmet: true, vest: true, pose: "work", helmetColor: "blue" }, 25, -1, 0.3);
  placeWorker({ helmet: true, vest: true, harness: true, pose: "stand" }, -9, 15, Math.PI, frame.floors[2].y);

  /* ------------------------------- loads ------------------------------- */

  const plan = buildLiftPlan(difficulty);

  function buildLoadMesh(lift) {
    const group = new THREE.Group();
    if (lift.palletType === "skip") {
      group.add(box(geo, mat.yellow, 1.8, 1.9, 1.8, 0, 0.95, 0));
      group.add(box(geo, mat.steelDark, 2.0, 0.2, 2.0, 0, 1.95, 0));
      group.add(box(geo, mat.concreteDark, 1.6, 0.3, 1.6, 0, 1.75, 0));
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) => {
        group.add(cylinder(geo, mat.steelDark, 0.03, 1.6, sx * 0.7, 2.75, sz * 0.7, { rotZ: sx * 0.42, low: true, shadow: false }));
      });
    } else {
      const pallet = buildMaterialPallet(geo, mat, { type: lift.palletType, rows: 3 });
      group.add(pallet);
      const top = lift.size.y;
      const hx = lift.size.x / 2 - 0.2;
      const hz = lift.size.z / 2 - 0.2;

      // Four-leg chain sling gathered into a masterlink, with shackles
      // at the lifting points — what the slinger actually rigged.
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) => {
        group.add(cylinder(geo, mat.steelDark, 0.028, 1.9, sx * hx, top + 0.95, sz * hz,
          { rotZ: sx * 0.38, low: true, shadow: false }));
        // Shackle and softener at the corner.
        group.add(cylinder(geo, mat.galv, 0.05, 0.14, sx * hx, top + 0.08, sz * hz, { low: true, shadow: false }));
        group.add(box(geo, mat.orange, 0.3, 0.1, 0.3, sx * hx, top + 0.02, sz * hz, { shadow: false }));
      });
      // Masterlink the hook takes.
      const link = new THREE.Mesh(geo.torus, mat.galv);
      link.scale.set(0.42, 0.42, 0.42);
      link.rotation.x = Math.PI / 2;
      link.position.y = top + 1.95;
      group.add(link);

      // Banding straps around the bundle, and a tag line trailing off
      // the end — that is how a steel bundle is controlled on the way up.
      [-0.35, 0.35].forEach((off) => {
        group.add(box(geo, mat.steel, lift.size.x * 0.92, 0.05, 0.08, 0, top * 0.6, off, { shadow: false }));
      });
      for (let i = 0; i < 5; i++) {
        group.add(cylinder(geo, mat.white, 0.016, 0.5,
          hx + 0.1 + i * 0.26, Math.max(0.03, top * 0.5 - i * 0.12), hz + 0.05 + i * 0.1,
          { rotZ: 1.1, low: true, shadow: false }));
      }
    }
    return group;
  }

  const lifts = plan.map((lift) => {
    const group = buildLoadMesh(lift);
    group.position.set(lift.pick.x, 0, lift.pick.z);
    scene.add(group);

    // Target pad on the ground or on a slab.
    const targetY = lift.target.floor === null ? 0 : frame.floors[lift.target.floor].y;
    const pad = buildZoneMarker(mat, { radius: 2.6, ok: true });
    pad.position.set(lift.target.x, targetY + 0.05, lift.target.z);
    pad.visible = false;
    scene.add(pad);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.6, 0.1, 6, 28),
      new THREE.MeshBasicMaterial({ color: 0x33c481, transparent: true, opacity: 0.85, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(lift.target.x, targetY + 0.08, lift.target.z);
    ring.visible = false;
    scene.add(ring);

    const pickRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.2, 0.09, 6, 24),
      new THREE.MeshBasicMaterial({ color: 0xffc629, transparent: true, opacity: 0.8, depthWrite: false })
    );
    pickRing.rotation.x = -Math.PI / 2;
    pickRing.position.set(lift.pick.x, 0.08, lift.pick.z);
    pickRing.visible = false;
    scene.add(pickRing);

    return {
      ...lift,
      group, pad, ring, pickRing,
      targetY,
      state: "waiting", // waiting | attached | landed
      radiusPick: Math.hypot(lift.pick.x - CRANE.x, lift.pick.z - CRANE.z),
      radiusTarget: Math.hypot(lift.target.x - CRANE.x, lift.target.z - CRANE.z),
    };
  });

  /* ============================ crane state ============================ */

  const state = {
    slew: Math.atan2(-(lifts[0].pick.z - CRANE.z), lifts[0].pick.x - CRANE.x) - 0.5,
    slewVel: 0,
    radius: 18,
    radiusVel: 0,
    hookY: hookTopY - 14,
    hoistVel: 0,
    estop: false,
    estopTimer: 0,

    // Pendulum: load offset from the plumb line under the hook.
    swing: new THREE.Vector2(0, 0),
    swingVel: new THREE.Vector2(0, 0),

    attached: null,
    liftIndex: 0,
    liftsDone: 0,
    score: 0,
    violations: 0,
    overloads: 0,
    accuracyPoints: 0,
    steadyPoints: 0,

    wind: 0.15,
    windAlarm: false,
    windAlarmTimer: 0,
    windPhase: Math.random() * 10,

    cabView: false,
    finished: false,
    paused: false,
    remainingMs: 300000 * difficulty.timeScale,

    lastViolationAt: -10,
    lastOverloadAt: -10,
    lastHookPos: new THREE.Vector3(),
    hookVel: new THREE.Vector3(),
    hookAccel: new THREE.Vector3(),
    message: "",
    messageUntil: 0,
  };

  /* ------------------------------- input ------------------------------- */

  const input = createInput(container, {
    pointerLock: false,
    onPause: () => api.requestPause(),
    keymap: {
      KeyA: "slewLeft", ArrowLeft: "slewLeft",
      KeyD: "slewRight", ArrowRight: "slewRight",
      KeyW: "trolleyOut", ArrowUp: "trolleyOut",
      KeyS: "trolleyIn", ArrowDown: "trolleyIn",
      KeyQ: "hoistUp",
      KeyE: "hoistDown",
      Space: "attachRelease",
      KeyX: "estop",
      KeyC: "camera",
      Escape: "pause",
    },
  });
  input.setSensitivity(settings.lookSensitivity ?? 1);

  api.buttons([
    { id: "attach", label: "ATTACH", action: "attachRelease", mode: "tap", color: "#FFC629", primary: true },
    { id: "estop", label: "E-STOP", action: "estop", mode: "tap", color: "#EA4F4F" },
    { id: "camera", label: "VIEW", action: "camera", mode: "tap", color: "#59B7FF" },
  ]);

  /* ------------------------------ camera ------------------------------ */

  const cam = {
    yaw: state.slew + Math.PI * 0.75,
    pitch: -0.42,
    distance: 46,
    target: new THREE.Vector3(0, 10, 0),
  };

  function updateCamera(dt) {
    const look = input.consumeLook();
    cam.yaw -= look.dx * 0.004;
    cam.pitch -= look.dy * 0.003;
    cam.pitch = Math.max(-1.25, Math.min(0.35, cam.pitch));
    const wheel = input.consumeWheel();
    if (wheel) cam.distance = Math.max(14, Math.min(90, cam.distance + wheel * 0.03));

    // Follow whatever matters right now: the load if we have one, the
    // hook if we do not.
    const focus = state.attached ? loadWorldPosition(_focus) : hookWorldPosition(_focus);
    cam.target.lerp(focus, Math.min(1, dt * 3.4));

    if (state.cabView) {
      // Operator's eye: at the cab, looking along the jib and down.
      const cabOffset = new THREE.Vector3(2.4, CRANE.mastHeight + 2.4, 0);
      const cos = Math.cos(state.slew);
      const sin = Math.sin(state.slew);
      camera.position.set(
        CRANE.x + cabOffset.x * cos,
        cabOffset.y,
        CRANE.z - cabOffset.x * sin
      );
      camera.lookAt(cam.target);
      // Let the player tilt a little from the cab without losing the load.
      camera.rotateX(Math.max(-0.5, Math.min(0.5, cam.pitch + 0.42)) * 0.4);
    } else {
      const horizontal = Math.cos(cam.pitch) * cam.distance;
      camera.position.set(
        cam.target.x + Math.sin(cam.yaw) * horizontal,
        cam.target.y - Math.sin(cam.pitch) * cam.distance,
        cam.target.z + Math.cos(cam.yaw) * horizontal
      );
      camera.lookAt(cam.target);
    }
  }

  /* --------------------------- crane kinematics --------------------------- */

  const _focus = new THREE.Vector3();
  const _hook = new THREE.Vector3();

  function hookWorldPosition(out = _hook) {
    // The jib extends along the slew group's +x axis.
    out.set(
      CRANE.x + Math.cos(state.slew) * state.radius,
      state.hookY,
      CRANE.z - Math.sin(state.slew) * state.radius
    );
    return out;
  }

  function loadWorldPosition(out = new THREE.Vector3()) {
    const hook = hookWorldPosition(_hook);
    const lift = state.attached;
    const drop = lift ? ropeLengthFor(lift) : 0;
    out.set(hook.x + state.swing.x, hook.y - drop, hook.z + state.swing.y);
    return out;
  }

  function ropeLengthFor(lift) {
    // The distance from the hook block down to the load's own origin.
    return 1.9 + (lift?.size.y || 1) * 0.1;
  }

  function safeWorkingLoad(radius) {
    return Math.min(CRANE.maxLoad, CRANE.momentLimit / Math.max(CRANE.minRadius, radius));
  }

  function applyMotion(dt) {
    if (state.estop) {
      // Emergency stop brakes everything hard.
      state.slewVel *= Math.max(0, 1 - dt * 8);
      state.radiusVel *= Math.max(0, 1 - dt * 8);
      state.hoistVel *= Math.max(0, 1 - dt * 8);
      state.estopTimer -= dt;
      if (state.estopTimer <= 0) state.estop = false;
    } else {
      const slewInput = (input.isHeld("slewRight") ? 1 : 0) - (input.isHeld("slewLeft") ? 1 : 0);
      const trolleyInput = (input.isHeld("trolleyOut") ? 1 : 0) - (input.isHeld("trolleyIn") ? 1 : 0);
      const hoistInput = (input.isHeld("hoistUp") ? 1 : 0) - (input.isHeld("hoistDown") ? 1 : 0);

      // Ramped acceleration, so the controls have the weight of a real
      // crane and a sudden input produces swing rather than teleporting.
      state.slewVel = ramp(state.slewVel, slewInput * CRANE.slewRate, CRANE.slewAccel * dt);
      state.radiusVel = ramp(state.radiusVel, trolleyInput * CRANE.trolleyRate, CRANE.trolleyAccel * dt);
      state.hoistVel = ramp(state.hoistVel, hoistInput * CRANE.hoistRate, CRANE.hoistAccel * dt);
    }

    state.slew += state.slewVel * dt;
    state.radius = clamp(state.radius + state.radiusVel * dt, CRANE.minRadius, CRANE.maxRadius);
    if (state.radius === CRANE.minRadius || state.radius === CRANE.maxRadius) state.radiusVel = 0;

    const lift = state.attached;
    const minHook = lift
      ? landingHeightForLoad() + ropeLengthFor(lift) + 0.05
      : CRANE.minHookHeight;
    const maxHook = hookTopY - 1.4;
    const nextHook = clamp(state.hookY + state.hoistVel * dt, minHook, maxHook);
    if (nextHook === minHook || nextHook === maxHook) state.hoistVel = 0;
    state.hookY = nextHook;

    // Motor sound follows what is actually moving.
    setMotor("slew", Math.abs(state.slewVel) / CRANE.slewRate * 0.9, 58);
    setMotor("trolley", Math.abs(state.radiusVel) / CRANE.trolleyRate * 0.8, 86);
    setMotor("hoist", Math.abs(state.hoistVel) / CRANE.hoistRate * 0.9, 70);

    // Push the state into the actual 3D crane.
    crane.parts.slew.rotation.y = state.slew;
    crane.parts.trolley.position.x = state.radius;
    crane.parts.hook.position.y = -(hookTopY - state.hookY);
    updateHoistRope(crane.parts);
  }

  // Horizontal tolerance for "the load is over its landing zone".
  const LANDING_APPROACH = 4.5;

  /**
   * How low the load may be lowered at its current position.
   *
   * This has to be reasoned about carefully, and an earlier version got
   * it badly wrong: it took the highest slab within 0.6 m ABOVE the
   * load, which meant a load travelling at height treated the slab just
   * beneath it as the floor, clamped there, and could never be lowered
   * any further. Every delivery to Level 1 or Level 2 was impossible.
   *
   * The rule now:
   *  - over the landing zone, you may lower onto the lift's target
   *    floor (this is the approach a real lift plan describes: get over
   *    the landing area, then lower);
   *  - anywhere else over the building, a slab is an obstruction you
   *    cannot lower through;
   *  - clear of the building, the ground is the limit.
   */
  function landingHeightForLoad() {
    const lift = state.attached;
    if (!lift) return 0;
    const load = loadWorldPosition(_focus);

    if (Math.hypot(load.x - lift.target.x, load.z - lift.target.z) < LANDING_APPROACH) {
      return lift.targetY;
    }

    const overBuilding =
      Math.abs(load.x - BUILDING.x) < BUILDING.width / 2 &&
      Math.abs(load.z - BUILDING.z) < BUILDING.depth / 2;
    if (!overBuilding) return 0;

    let obstruction = 0;
    frame.floors.forEach((floor) => {
      if (floor.y <= load.y + 0.05 && floor.y > obstruction) obstruction = floor.y;
    });
    return obstruction;
  }

  /* --------------------------- pendulum physics --------------------------- */

  function updateSwing(dt) {
    const lift = state.attached;
    if (!lift) {
      state.swing.multiplyScalar(Math.max(0, 1 - dt * 6));
      state.swingVel.multiplyScalar(Math.max(0, 1 - dt * 6));
      return;
    }
    const ropeLength = Math.max(1.2, ropeLengthFor(lift));

    // Hook acceleration in world space, measured numerically.
    const hook = hookWorldPosition(_hook).clone();
    const vel = hook.clone().sub(state.lastHookPos).divideScalar(Math.max(1e-4, dt));
    state.hookAccel.copy(vel).sub(state.hookVel).divideScalar(Math.max(1e-4, dt));
    state.hookVel.copy(vel);
    state.lastHookPos.copy(hook);

    // Pendulum in the small-angle regime: the restoring term pulls the
    // load back under the hook, the hook's own acceleration drives it,
    // damping bleeds energy, and the wind pushes sideways.
    const gravityTerm = -(9.81 / ropeLength);
    const damping = 0.9;
    const windForce = state.wind * 1.15;

    const ax = gravityTerm * state.swing.x - damping * state.swingVel.x - state.hookAccel.x + windForce;
    const az = gravityTerm * state.swing.y - damping * state.swingVel.y - state.hookAccel.z + windForce * 0.35;

    state.swingVel.x += ax * dt;
    state.swingVel.y += az * dt;
    state.swing.x += state.swingVel.x * dt;
    state.swing.y += state.swingVel.y * dt;

    // Physical limit: the load cannot swing past the rope length.
    const maxSwing = ropeLength * 0.72;
    const magnitude = state.swing.length();
    if (magnitude > maxSwing) {
      state.swing.multiplyScalar(maxSwing / magnitude);
      state.swingVel.multiplyScalar(0.4);
    }

    // Move the actual load mesh.
    const load = loadWorldPosition(_focus);
    lift.group.position.copy(load);
    // Tilt the load into the swing, which is what you see on site.
    lift.group.rotation.z = -state.swing.x * 0.1;
    lift.group.rotation.x = state.swing.y * 0.1;
  }

  function swingSpeed() {
    return state.swingVel.length();
  }

  /* ----------------------------- rule checks ----------------------------- */

  function violation(reason, points = SCORING.violation) {
    if (stage.elapsed - state.lastViolationAt < 2.5) return;
    state.lastViolationAt = stage.elapsed;
    state.violations += 1;
    state.score += points;
    sfx.alarm();
    api.toast(reason, "bad", points);
  }

  function checkRules(dt) {
    const lift = state.attached;
    if (!lift) return;
    const load = loadWorldPosition(_focus);

    // --- capacity chart ---
    const swl = safeWorkingLoad(state.radius);
    if (lift.mass > swl) {
      if (stage.elapsed - state.lastOverloadAt > 3) {
        state.lastOverloadAt = stage.elapsed;
        state.overloads += 1;
        state.score += SCORING.overload;
        sfx.alarm();
        api.toast(
          `OVERLOAD — ${lift.mass.toFixed(1)} t at ${state.radius.toFixed(0)} m exceeds the ${swl.toFixed(1)} t limit. Trolley in.`,
          "bad",
          SCORING.overload
        );
      }
    }

    // --- exclusion zones ---
    if (load.y > 1.2) {
      for (const zone of EXCLUSION_ZONES) {
        if (Math.hypot(load.x - zone.x, load.z - zone.z) < zone.r) {
          violation(`Load swung over ${zone.label} — people are working there.`);
          break;
        }
      }
    }

    // --- structural collision ---
    const half = { x: lift.size.x / 2 + 0.2, y: lift.size.y / 2 + 0.2, z: lift.size.z / 2 + 0.2 };
    // Directly over the landing zone, the slabs at and above the target
    // floor are the void the material is landed through — otherwise the
    // slab above would block every delivery to a lower floor, which is
    // precisely the bug this guard replaces. Away from the landing zone
    // every slab is solid and hitting one is a violation.
    const overLanding = Math.hypot(load.x - lift.target.x, load.z - lift.target.z) < LANDING_APPROACH;
    for (const obstacle of obstacles) {
      if (overLanding && obstacle.isSlab && obstacle.floorY >= lift.targetY - 0.3) continue;
      if (load.x + half.x > obstacle.minX && load.x - half.x < obstacle.maxX &&
          load.y + half.y > obstacle.minY && load.y - half.y < obstacle.maxY &&
          load.z + half.z > obstacle.minZ && load.z - half.z < obstacle.maxZ) {
        violation(`The load struck ${obstacle.label}.`);
        // Stop descending and kill the swing energy so the player can
        // recover rather than grinding through the structure.
        state.hoistVel = Math.max(0, state.hoistVel);
        state.swingVel.multiplyScalar(0.25);
        sfx.thud();
        break;
      }
    }

    // --- dragging a load across the site ---
    if (Math.abs(state.slewVel) > CRANE.slewRate * 0.3 && load.y < 2.2) {
      violation("Slewing with the load at ground level — lift to a safe travel height first.");
    }

    // --- wind ---
    if (state.windAlarm) {
      state.windAlarmTimer += dt;
      const needsStop = state.windAlarmTimer > 6;
      if (needsStop && !state.estop) {
        violation("Wind alarm ignored — all lifting must stop until the gust passes.");
        state.windAlarmTimer = 0;
      }
    }
  }

  function updateWind(dt) {
    state.windPhase += dt;
    const current = plan[state.liftIndex];
    const gusty = current?.windEvent || difficulty.id === "hard";
    const base = gusty ? 0.55 : 0.18;
    state.wind = base + Math.sin(state.windPhase * 0.42) * (gusty ? 0.5 : 0.12) + Math.sin(state.windPhase * 1.7) * 0.06;
    const wasAlarm = state.windAlarm;
    state.windAlarm = state.wind > 0.9;
    if (state.windAlarm && !wasAlarm) {
      state.windAlarmTimer = 0;
      sfx.warning();
      api.toast("WIND ALARM — gusts above the lifting limit. Emergency stop.", "warn");
    }
    if (!state.windAlarm && wasAlarm) {
      api.toast("Wind back within limits. You may resume.", "info");
    }
  }

  /* -------------------------- attach and release -------------------------- */

  const ATTACH_RADIUS = 2.4;
  const ATTACH_HEIGHT = 1.4;
  const RELEASE_RADIUS = 2.6;
  const RELEASE_HEIGHT = 1.4;
  const STEADY_LIMIT = 0.55;

  function currentLift() {
    return lifts[state.liftIndex] || null;
  }

  function tryAttachRelease() {
    const lift = currentLift();
    if (!lift) return;

    if (!state.attached) {
      const hook = hookWorldPosition(_hook);
      const horizontal = Math.hypot(hook.x - lift.group.position.x, hook.z - lift.group.position.z);
      const needHookY = ropeLengthFor(lift) + lift.size.y * 0.5;
      const vertical = Math.abs(hook.y - (lift.group.position.y + needHookY));
      if (horizontal > ATTACH_RADIUS) {
        api.toast(`Hook is ${horizontal.toFixed(1)} m from the load — get it overhead first.`, "warn");
        sfx.locked();
        return;
      }
      if (vertical > ATTACH_HEIGHT) {
        api.toast("Hoist the hook down to the slinging height.", "warn");
        sfx.locked();
        return;
      }
      // Hooked on. Snap the load under the hook and start from rest.
      state.attached = lift;
      lift.state = "attached";
      state.swing.set(0, 0);
      state.swingVel.set(0, 0);
      state.hookY = lift.group.position.y + needHookY;
      state.lastHookPos.copy(hookWorldPosition(_hook));
      state.hookVel.set(0, 0, 0);
      state.hookAccel.set(0, 0, 0);
      lift.pickRing.visible = false;
      lift.ring.visible = true;
      lift.pad.visible = true;
      sfx.pickup();
      api.toast(`${lift.label} rigged — ${lift.mass.toFixed(1)} t. Lift and travel.`, "good");
      return;
    }

    // --- releasing ---
    const load = loadWorldPosition(_focus);
    const horizontal = Math.hypot(load.x - lift.target.x, load.z - lift.target.z);
    const vertical = Math.abs(load.y - (lift.targetY + lift.size.y * 0.1));

    if (horizontal > RELEASE_RADIUS) {
      api.toast(`Not over the target — ${horizontal.toFixed(1)} m out.`, "warn");
      sfx.locked();
      return;
    }
    if (vertical > RELEASE_HEIGHT) {
      api.toast("Land the load before you release. Hoist down.", "warn");
      sfx.locked();
      return;
    }
    const speed = swingSpeed();
    if (speed > STEADY_LIMIT) {
      violation("Released a swinging load — it could have landed on anyone.");
      sfx.locked();
      return;
    }

    // Good landing. Score it.
    const accuracy = Math.max(0, 1 - horizontal / RELEASE_RADIUS);
    const steady = Math.max(0, 1 - speed / STEADY_LIMIT);
    const accuracyPoints = Math.round(accuracy * SCORING.accuracyMax);
    const steadyPoints = Math.round(steady * SCORING.steadyMax);
    state.accuracyPoints += accuracyPoints;
    state.steadyPoints += steadyPoints;
    state.score += SCORING.liftComplete + accuracyPoints + steadyPoints;
    state.liftsDone += 1;

    lift.state = "landed";
    lift.group.position.set(lift.target.x, lift.targetY, lift.target.z);
    lift.group.rotation.set(0, 0, 0);
    lift.ring.visible = false;
    lift.pad.visible = false;
    state.attached = null;
    state.swing.set(0, 0);
    state.swingVel.set(0, 0);
    sfx.drop();
    sfx.correct();
    api.toast(
      `${lift.label} landed. Accuracy +${accuracyPoints}, steady +${steadyPoints}.`,
      "good",
      SCORING.liftComplete
    );

    state.liftIndex += 1;
    if (state.liftIndex >= lifts.length) {
      finish(true);
    } else {
      const next = currentLift();
      next.pickRing.visible = true;
      api.toast(`Next lift: ${next.label}. ${next.note}`, "info", undefined);
    }
  }

  /* ------------------------------ finishing ------------------------------ */

  function finish(completed) {
    if (state.finished) return;
    state.finished = true;
    stopAllLoops();

    const remainingSeconds = Math.max(0, Math.floor(state.remainingMs / 1000));
    const allDone = state.liftsDone >= lifts.length;
    const allBonus = allDone ? SCORING.allLifts : 0;
    const timeBonus = completed ? remainingSeconds * SCORING.timeBonusPerSecond : 0;
    const raw = state.score + allBonus + timeBonus;
    const score = Math.max(0, Math.round(raw * difficulty.scoreScale));

    const liftRatio = lifts.length ? state.liftsDone / lifts.length : 0;
    const penaltyFactor = Math.max(0, 1 - (state.violations * 0.11 + state.overloads * 0.14));
    const performance = Math.round(100 * liftRatio * penaltyFactor);

    const lessons = [];
    if (state.overloads) lessons.push("Safe working load falls as the radius increases. Check the capacity chart before running the trolley out, not after the alarm.");
    if (state.violations) lessons.push("A load must never travel over people. Establish the exclusion zone, use a banksman, and plan the travel path before you lift.");
    if (state.liftsDone < lifts.length) lessons.push("An unfinished lift leaves a suspended load on site. Plan the whole operation, including where the load will be landed, before hoisting.");
    if (!lessons.length) lessons.push("Clean operation. Keep easing the controls — smooth input is what keeps a load under control.");

    api.finish({
      score,
      completed,
      accuracy: performance,
      performance,
      timeTakenMs: Math.round(300000 * difficulty.timeScale - state.remainingMs),
      stats: {
        lifts: lifts.length,
        liftsCompleted: state.liftsDone,
        violations: state.violations,
        overloads: state.overloads,
      },
      breakdown: [
        { label: "Lifts completed", value: `${state.liftsDone} / ${lifts.length}`, tone: allDone ? "good" : "bad" },
        { label: "Placement accuracy points", value: `+${state.accuracyPoints}`, tone: "info" },
        { label: "Load control points", value: `+${state.steadyPoints}`, tone: "info" },
        { label: "Safety violations", value: `${state.violations}`, tone: state.violations ? "bad" : "good" },
        { label: "Overload events", value: `${state.overloads}`, tone: state.overloads ? "bad" : "good" },
        ...(allBonus ? [{ label: "All lifts completed", value: `+${allBonus}`, tone: "good" }] : []),
        ...(timeBonus ? [{ label: `Time bonus (${remainingSeconds}s left)`, value: `+${timeBonus}`, tone: "good" }] : []),
        { label: `Difficulty multiplier (${difficulty.label})`, value: `×${difficulty.scoreScale}`, tone: "info" },
      ],
      lessons,
    });
  }

  /* -------------------------------- HUD -------------------------------- */

  let hudAccumulator = 0;

  function pushHud() {
    const lift = currentLift();
    const swl = safeWorkingLoad(state.radius);
    const load = state.attached ? loadWorldPosition(_focus) : null;
    const overloaded = state.attached && state.attached.mass > swl;
    const distanceToTarget = state.attached && load
      ? Math.hypot(load.x - state.attached.target.x, load.z - state.attached.target.z)
      : null;

    let objective;
    if (state.finished) objective = "Lift plan complete";
    else if (!lift) objective = "Lift plan complete";
    else if (!state.attached) objective = `Hook on: ${lift.label} at ${lift.radiusPick.toFixed(0)} m radius`;
    else if (lift.target.floor === null) objective = `Land ${lift.label} on the ground target`;
    else objective = `Land ${lift.label} on Level ${lift.target.floor}`;

    api.hud({
      controlScheme: "crane",
      objective,
      score: Math.max(0, state.score),
      timeMs: state.remainingMs,
      progress: (state.liftsDone / lifts.length) * 100,
      progressLabel: `${state.liftsDone} of ${lifts.length} lifts landed`,
      danger: state.windAlarm || overloaded,
      flashDanger: state.windAlarm,
      controlsLocked: state.estop,
      readoutsTitle: "CRANE",
      readouts: [
        { label: "RADIUS", value: `${state.radius.toFixed(1)} m` },
        { label: "HOOK", value: `${state.hookY.toFixed(1)} m` },
        { label: "SWL", value: `${swl.toFixed(1)} t`, tone: overloaded ? "bad" : "good" },
        { label: "LOAD", value: state.attached ? `${state.attached.mass.toFixed(1)} t` : "—", tone: overloaded ? "bad" : undefined },
        { label: "SWING", value: `${swingSpeed().toFixed(2)} m/s`, tone: swingSpeed() > STEADY_LIMIT ? "warn" : "good" },
        { label: "WIND", value: `${(state.wind * 22).toFixed(0)} km/h`, tone: state.windAlarm ? "bad" : state.wind > 0.7 ? "warn" : "good" },
        ...(distanceToTarget !== null ? [{
          label: "TO TARGET",
          value: `${distanceToTarget.toFixed(1)} m`,
          tone: distanceToTarget < RELEASE_RADIUS ? "good" : undefined,
        }] : []),
        ...(state.estop ? [{ label: "STATUS", value: "E-STOP", tone: "bad" }] : []),
      ],
      craneReadouts: {
        slew: `${((state.slew * 180) / Math.PI).toFixed(0)}°`,
        radius: `${state.radius.toFixed(0)}m`,
        height: `${state.hookY.toFixed(0)}m`,
      },
      prompt: promptText(),
      keyHints: mobile ? [] : [
        { key: "A/D", label: "Slew" },
        { key: "W/S", label: "Trolley" },
        { key: "Q/E", label: "Hoist" },
        { key: "Space", label: state.attached ? "Release" : "Attach" },
        { key: "X", label: "E-Stop" },
        { key: "C", label: "View" },
      ],
      tasks: lifts.map((l) => ({
        id: l.id,
        label: `${l.label} (${l.mass.toFixed(1)} t)`,
        done: l.state === "landed",
      })),
      tasksTitle: "LIFT PLAN",
    });

    // Keep the on-screen button label honest about what it will do.
    api.buttons([
      {
        id: "attach",
        label: state.attached ? "RELEASE" : "ATTACH",
        action: "attachRelease",
        mode: "tap",
        color: state.attached ? "#33C481" : "#FFC629",
        primary: true,
      },
      { id: "estop", label: "E-STOP", action: "estop", mode: "tap", color: "#EA4F4F" },
      { id: "camera", label: state.cabView ? "SITE" : "CAB", action: "camera", mode: "tap", color: "#59B7FF" },
    ]);
  }

  function promptText() {
    if (state.estop) return { text: "EMERGENCY STOP engaged — brakes releasing", tone: "bad" };
    if (state.windAlarm) return { text: "Wind above the limit — EMERGENCY STOP now", tone: "bad" };
    const lift = currentLift();
    if (!lift) return null;
    if (!state.attached) {
      const hook = hookWorldPosition(_hook);
      const horizontal = Math.hypot(hook.x - lift.group.position.x, hook.z - lift.group.position.z);
      if (horizontal <= ATTACH_RADIUS) {
        return { text: mobile ? "Tap ATTACH to hook on" : "Press Space to hook on", tone: "good", key: "Space" };
      }
      return null;
    }
    const load = loadWorldPosition(_focus);
    const horizontal = Math.hypot(load.x - lift.target.x, load.z - lift.target.z);
    if (horizontal <= RELEASE_RADIUS) {
      if (swingSpeed() > STEADY_LIMIT) return { text: "Over the target — wait for the swing to settle", tone: "warn" };
      return { text: mobile ? "Lower it, then tap RELEASE" : "Lower it, then press Space to release", tone: "good", key: "Space" };
    }
    return null;
  }

  /* -------------------------------- loop -------------------------------- */

  // Show the first pick ring.
  if (lifts[0]) lifts[0].pickRing.visible = true;
  state.lastHookPos.copy(hookWorldPosition(_hook));

  stage.start((dt) => {
    if (state.paused) return;

    if (!state.finished) {
      state.remainingMs -= dt * 1000;
      if (state.remainingMs <= 0) {
        state.remainingMs = 0;
        finish(false);
      }
    }

    if (!state.finished) {
      if (input.wasPressed("estop")) {
        state.estop = true;
        state.estopTimer = 1.6;
        sfx.warning();
        api.toast("EMERGENCY STOP — all motion braked.", "warn");
      }
      if (input.wasPressed("camera")) {
        state.cabView = !state.cabView;
        sfx.click();
      }
      if (input.wasPressed("attachRelease")) tryAttachRelease();

      updateWind(dt);
      applyMotion(dt);
      updateSwing(dt);
      checkRules(dt);
    } else {
      stopAllLoops();
    }

    updateCamera(dt);

    if (cfg.shadows) {
      const focus = cam.target;
      sun.position.set(focus.x + 48, 78, focus.z + 34);
      sun.target.position.set(focus.x, 0, focus.z);
      sun.target.updateMatrixWorld();
    }

    for (let i = 0; i < animated.length; i++) {
      const item = animated[i];
      item.phase += dt;
      item.object.rotation.y += Math.sin(item.phase * 0.8) * dt * 0.1;
    }

    hudAccumulator += dt;
    if (hudAccumulator > 0.1) {
      hudAccumulator = 0;
      pushHud();
    }

    input.endFrame();
  });

  pushHud();

  /* ------------------------------ instance ------------------------------ */

  return {
    input,

    setPaused(value) {
      state.paused = !!value;
      stage.setPaused(!!value);
      input.setEnabled(!value);
      if (value) stopAllLoops();
    },

    dispose() {
      stopAllLoops();
      input.dispose();
      stage.dispose();
    },

    // Test seam used by tests/arena-games.test.mjs. Not used by the app.
    __test: { state, lifts, hookWorldPosition, loadWorldPosition, safeWorkingLoad, CRANE },
  };
}

/* ------------------------------ helpers ------------------------------ */

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Moves `current` toward `target` by at most `maxDelta`. */
function ramp(current, target, maxDelta) {
  const difference = target - current;
  if (Math.abs(difference) <= maxDelta) return target;
  return current + Math.sign(difference) * maxDelta;
}

export default { ...meta, create };
