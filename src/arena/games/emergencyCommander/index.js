/* ------------------------------------------------------------------ *
 *  GAME 5 — EMERGENCY RESPONSE COMMANDER
 *
 *  An ACTIVITY, not a quiz. There is no list of options anywhere in
 *  this game. The eight steps of a site emergency response are eight
 *  real objects on the site, and the player has to FIND each one and
 *  act on it:
 *
 *      the command post · the break-glass call point · the intake panel
 *      the muster marker · the cone stack · the first-aid post
 *      the site radio · the vehicle gate
 *
 *  Order matters, because the order is what saves people. Acting out of
 *  sequence still helps but costs scene control.
 *
 *  The incident itself is clickable too, and acting on it is always
 *  wrong — the game has to offer the chance to walk into the hazard, or
 *  refusing to walk into it is not a decision.
 *
 *  Every action moves three live meters (the casualty's condition,
 *  scene control, people accounted for) and the 3D scene reacts: the
 *  siren sounds, the fire drops back when the supply is isolated, the
 *  workforce walks to the muster point, cones appear around the
 *  incident, the ambulance arrives at the gate.
 * ------------------------------------------------------------------ */

import * as THREE from "three";
import { createStage, addDaylight, addSky, screenRaycast, findTagged } from "../../engine/gfx.js";
import { createInput } from "../../engine/input.js";
import { createTopView } from "../../engine/topview.js";
import { createFirstPerson } from "../../engine/fpsController.js";
import { shot, establishingShot, closingShot } from "../../engine/demoTour.js";
import {
  createMaterials, createGeometries, box, cylinder,
  buildGround, buildHoarding, buildBrandBanners, buildBrandedTower, buildConcreteFrame, buildGuardrail, buildScaffold,
  buildTowerCrane, updateHoistRope, buildWorker, buildCone, buildSign,
  buildFireExtinguisher, buildElectricalPanel, buildMaterialPallet,
  buildSiteHut, buildBarrier, buildZoneMarker, buildCableRun, buildPuddle, poseWorker,
} from "../../engine/kit.js";
import { sfx } from "../../audio.js";
import { PHASES, SCORING, pickScenario } from "./scenarios.js";
import {
  STATIONS, STATION_COUNT, STATION_SCORING, HAZARD_ENTRY, stationById,
} from "./stations.js";

/* ============================== metadata ============================== */

export const meta = {
  id: "emergency-commander",
  controls: "command",

  briefing: {
    role:
      "You are the site emergency response team leader. Nobody is going to offer you a list of " +
      "options — you have to look around the site, find what you need, and use it.",
    objectives: [
      "Find and act on the eight things that make up a response. They are real objects on the site.",
      "Take command first, from somewhere you can see the incident and are not in it.",
      "Then: the call point, the intake panel, the muster marker, the cones, the first-aid post, the radio, the gate.",
      "Order matters. Out of order still helps, but you lose control of the scene.",
      "Watch the three meters: casualty condition, scene control, and people accounted for.",
      "Do NOT go into the incident yourself. You can — the game lets you — and it is always wrong.",
    ],
    scoring: [
      { label: "Right action, right order", value: "+320" },
      { label: "Right action, out of order", value: "+120 and -10 control" },
      { label: "Walking into the hazard", value: "-400" },
      { label: "All eight actions taken", value: "+600" },
      { label: "Casualty survives", value: "+500" },
      { label: "Scene brought under control", value: "+300" },
    ],
    tips: [
      "Look for the beacons. Every station you still need has one above it.",
      "A commander who enters the hazard stops being a commander.",
      "Raise the alarm before you do anything clever. It is the only thing that moves everybody at once.",
      "Isolate from outside the hazard. Never send a person in to make it safe.",
      "Call the emergency services with what you know now, and update them later.",
      "Press 1 to 8 to swing the camera to each station if you cannot find one.",
    ],
  },

  desktopControls: [
    ["Click", "Act on whatever you clicked — a station, or the hazard"],
    ["1 – 8", "Swing the camera to a station you cannot find"],
    ["W A S D", "Walk the site — you are a person standing on it, not a camera"],
    ["Mouse drag", "Look around the site"],
    ["Wheel / Z", "Zoom in on the scene"],
    ["T", "Top view — stand off and see where everyone is"],
    ["B", "Re-read the incident brief"],
    ["Esc", "Pause"],
  ],
  mobileControls: [
    ["Tap", "Act on a station — the beacons show which are left"],
    ["Joystick", "Walk the site — bottom-left of the screen"],
    ["Drag", "Look around the site"],
    ["Pinch / ZOOM", "Zoom in"],
    ["TOP VIEW", "Stand off and see the whole site from the air"],
    ["BRIEF", "Re-read the incident brief"],
    ["Pause", "Top-right of the HUD"],
  ],
};

const BUILDING = { x: -8, z: 6, width: 20, depth: 15, floors: 4, floorHeight: 3.4 };
const MUSTER = { x: 30, z: 26 };
const GATE = { x: 34, z: -28 };

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
  scene.add(buildBrandedTower(geo, mat, { x: 30, z: -52, rotY: -0.15 }).group);

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

  /* ======================= the command stations ======================= *
   *
   * Eight real objects the player has to FIND and act on. These are the
   * game — there is no list of options anywhere in it.
   * ==================================================================== */

  const stationMarkers = new Map();
  const pickTargets = [];
  const cordonCones = [];

  /** A clickable station: the object, a halo and a floating label. */
  function addStation(station, object, anchor, { accent = 0xffc629 } = {}) {
    scene.add(object);

    const halo = new THREE.Mesh(
      new THREE.CylinderGeometry(1.9, 1.9, 0.08, 20),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.3, depthWrite: false })
    );
    halo.position.set(anchor.x, 0.06, anchor.z);
    scene.add(halo);

    // A generous invisible box is the actual tap target — on a phone
    // nobody can hit a call point with a thumb.
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 4.2, 3.2),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.position.set(anchor.x, 2.1, anchor.z);
    hit.userData.stationId = station.id;
    scene.add(hit);
    pickTargets.push(hit);

    const beacon = new THREE.Mesh(
      new THREE.ConeGeometry(0.42, 1.1, 8),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.9, depthWrite: false })
    );
    beacon.rotation.x = Math.PI;
    beacon.position.set(anchor.x, 4.6, anchor.z);
    scene.add(beacon);

    stationMarkers.set(station.id, {
      station, object, halo, beacon, hit,
      anchor: new THREE.Vector3(anchor.x, 1, anchor.z),
    });
  }

  function markStationDone(id) {
    const m = stationMarkers.get(id);
    if (!m) return;
    m.halo.material.color.setHex(0x33c481);
    m.halo.material.opacity = 0.18;
    m.beacon.visible = false;
  }

  // --- 0. command post: a board and a radio mast, well clear of it all ---
  const COMMAND = { x: -26, z: 24 };
  {
    const post = new THREE.Group();
    post.add(box(geo, mat.white, 2.4, 1.6, 0.14, 0, 1.5, 0));
    post.add(box(geo, mat.orange, 2.4, 0.3, 0.17, 0, 2.15, 0));
    [-1.0, 1.0].forEach((ox) => post.add(cylinder(geo, mat.galv, 0.06, 1.5, ox, 0.75, 0)));
    post.add(box(geo, mat.steelDark, 1.2, 0.08, 0.8, 0, 0.9, 0.5));
    post.position.set(COMMAND.x, 0, COMMAND.z);
    addStation(STATIONS[0], post, COMMAND, { accent: 0x59b7ff });
  }

  // --- 1. break-glass call point, on the end of the office hut ---
  const CALLPOINT = { x: -30, z: -4 };
  {
    const cp = new THREE.Group();
    cp.add(box(geo, mat.red, 0.46, 0.46, 0.16, 0, 1.45, 0));
    cp.add(box(geo, mat.white, 0.3, 0.3, 0.03, 0, 1.45, 0.1, { shadow: false }));
    cp.add(cylinder(geo, mat.galv, 0.05, 1.45, 0, 0.72, 0, { low: true }));
    const sign = buildSign(geo, mat, { text: "Fire alarm call point", kind: "warning", height: 2.1, width: 0.6, post: false });
    sign.position.set(0, 0, 0.1);
    cp.add(sign);
    cp.position.set(CALLPOINT.x, 0, CALLPOINT.z);
    addStation(STATIONS[1], cp, CALLPOINT, { accent: 0xea4f4f });
  }

  // --- 2. site intake / isolation panel, by the compound gate ---
  const INTAKE = { x: -30, z: 10 };
  {
    const panel = buildElectricalPanel(geo, mat, { unsafe: false, height: 1.9 });
    panel.position.set(INTAKE.x, 0, INTAKE.z);
    addStation(STATIONS[2], panel, INTAKE, { accent: 0xffc629 });
  }

  // --- 3. the muster point (the marker already exists) ---
  {
    const flag = new THREE.Group();
    flag.add(cylinder(geo, mat.galv, 0.06, 3.2, 0, 1.6, 0));
    flag.add(box(geo, mat.green, 1.1, 0.7, 0.04, 0.55, 2.9, 0, { shadow: false }));
    flag.position.set(MUSTER.x, 0, MUSTER.z + 4);
    addStation(STATIONS[3], flag, { x: MUSTER.x, z: MUSTER.z + 4 }, { accent: 0x33c481 });
  }

  // --- 4. the cordon: a stack of cones you deploy around the incident ---
  const CONE_STACK = { x: -20, z: -2 };
  {
    const stack = new THREE.Group();
    [0, 1, 2, 3].forEach((i) => {
      const cone = buildCone(geo, mat, { height: 0.6 });
      cone.position.set(0, i * 0.14, 0);
      stack.add(cone);
    });
    stack.position.set(CONE_STACK.x, 0, CONE_STACK.z);
    addStation(STATIONS[4], stack, CONE_STACK, { accent: 0xff5a1f });

    // The deployed cordon, hidden until the player places it.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const cone = buildCone(geo, mat, { height: 0.6 });
      cone.visible = false;
      cordonCones.push({ cone, angle: a });
      scene.add(cone);
    }
  }

  function revealCordon() {
    const r = 7.5;
    cordonCones.forEach(({ cone, angle }) => {
      cone.position.set(
        incident.position.x + Math.cos(angle) * r,
        0,
        incident.position.z + Math.sin(angle) * r
      );
      cone.visible = true;
    });
  }

  // --- 5. first-aid post ---
  const FIRSTAID = { x: -26, z: 16 };
  {
    const fa = new THREE.Group();
    fa.add(box(geo, mat.white, 1.4, 1.8, 1.0, 0, 0.9, 0));
    fa.add(box(geo, mat.green, 0.9, 0.22, 0.04, 0, 1.35, 0.52, { shadow: false }));
    fa.add(box(geo, mat.green, 0.22, 0.9, 0.04, 0, 1.35, 0.52, { shadow: false }));
    fa.position.set(FIRSTAID.x, 0, FIRSTAID.z);
    addStation(STATIONS[5], fa, FIRSTAID, { accent: 0x33c481 });
  }

  // --- 6. the site radio at the command post ---
  const RADIO = { x: -22, z: 24 };
  {
    const r = new THREE.Group();
    r.add(box(geo, mat.steelDark, 0.8, 0.6, 0.6, 0, 0.9, 0));
    r.add(cylinder(geo, mat.galv, 0.03, 2.4, 0.3, 2.1, 0, { low: true, shadow: false }));
    r.add(box(geo, mat.yellow, 0.5, 0.18, 0.04, 0, 1.05, 0.31, { shadow: false }));
    r.position.set(RADIO.x, 0, RADIO.z);
    addStation(STATIONS[6], r, RADIO, { accent: 0x9b7cf2 });
  }

  // --- 7. the emergency vehicle gate ---
  addStation(STATIONS[7], new THREE.Group(), { x: GATE.x, z: GATE.z + 3 }, { accent: 0x59b7ff });

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
      // Sixteen of them, and the commander never stands next to any of
      // them. Full detail here costs ~200 draw calls for eyelashes
      // nobody can see from the command post.
      detail: "low",
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
    gateManned: false,
    finished: false,
    paused: false,
    disposed: false,
    briefOpen: false,
    // Which command stations have been acted on, and how well.
    doneStations: new Set(),
    stepIndex: 0,
    best: 0,
    outOfSequence: 0,
    hazardEntries: 0,
    consequence: null,
    consequenceUntil: 0,
    lessons: [],
    fireIntensity: 1,
  };

  /* ---- the trap: the incident itself is clickable ----
   * The decision NOT to walk into the hazard is the central lesson, so
   * the game has to make walking into it genuinely available.
   */
  {
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(9, 8, 9),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.position.set(incident.position.x, incident.position.y + 3, incident.position.z);
    hit.userData.hazardEntry = true;
    scene.add(hit);
    pickTargets.push(hit);
  }

  /* ------------------------------- input ------------------------------- */

  const input = createInput(container, {
    pointerLock: false,
    onPause: () => api.requestPause(),
    keymap: {
      Escape: "pause",
      Digit1: "opt1", Digit2: "opt2", Digit3: "opt3", Digit4: "opt4",
      KeyB: "brief",
      KeyZ: "zoom",
    },
  });
  input.setSensitivity(settings.lookSensitivity ?? 1);

  api.buttons([
    { id: "brief", label: "BRIEF", action: "brief", mode: "tap", color: "#59B7FF", primary: true },
    { id: "zoom", label: "ZOOM", action: "zoom", mode: "tap", color: "#9B7CF2" },
    { id: "top", label: "TOP VIEW", action: "topview", mode: "tap", color: "#33C481" },
  ]);

  /* ------------------------------ camera ------------------------------ */

  // Stand off the whole incident. Commanding a site is much easier when
  // you can see where everyone is, so this one earns its keep.
  const siteView = createTopView(camera, {
    scene,
    center: new THREE.Vector3(0, 0, -14),
    distance: 118, minDistance: 52, maxDistance: 200, pitch: 0.82,
  });

  const cam = {
    yaw: 2.4,
    pitch: -0.34,
    distance: scenario.scene === "fall" ? 24 : 26,
    target: incident.position.clone(),
    desired: incident.position.clone(),
  };

  /* --------------------------- the commander ---------------------------
   * The commander is a person standing on the site, not a floating
   * point of view. They walk with the joystick; the orbit camera above
   * keeps the look and the zoom, so this is used purely as a movement
   * solver (ownsCamera / ownsLook both off).
   *
   * It matters for this mission in particular: "take command from a
   * position of safety" means something once you can walk into the
   * wrong place.
   */
  const commander = createFirstPerson(camera, input, {
    colliders: hoarding.colliders,
    spawn: { x: incident.position.x + 10, y: 0, z: incident.position.z + 14 },
    yaw: 0,
    canJump: false,
    ownsCamera: false,
    ownsLook: false,
    walkSpeed: 3.6,
    runSpeed: 6.2,
    onStep: () => sfx.step(),
  });

  const avatar = buildWorker(geo, mat, {
    helmet: true, vest: true, boots: true, role: "officer",
  });
  scene.add(avatar);
  let walkPhase = 0;

  function updateCommander(dt) {
    if (state.finished) {
      poseWorker(avatar, { phase: walkPhase, moving: false, pose: "stand" });
      return;
    }
    commander.setYaw(cam.yaw);
    commander.update(dt);

    const moving = commander.moving;
    walkPhase += dt * (commander.state.running ? 11 : 7.4) * (moving ? 1 : 0);
    avatar.position.set(commander.position.x, commander.position.y, commander.position.z);
    if (moving) avatar.rotation.y = Math.atan2(commander.velocity.x, commander.velocity.z);
    poseWorker(avatar, {
      phase: walkPhase, moving, running: commander.state.running, pose: "stand",
    });
  }

  function updateCamera(dt) {
    // Unless the camera has been sent to observe a station, it rides
    // with the commander.
    if (!cam.observeDistance && !state.finished) {
      cam.desired.set(commander.position.x, commander.position.y + 1.2, commander.position.z);
    }
    const look = input.consumeLook();
    cam.yaw -= look.dx * 0.004;
    cam.pitch -= look.dy * 0.003;
    cam.pitch = Math.max(-1.1, Math.min(0.2, cam.pitch));
    const wheel = input.consumeWheel();
    if (wheel) cam.distance = Math.max(10, Math.min(70, cam.distance + wheel * 0.03));

    // After acting on a station the camera eases in on it, so the
    // player sees the consequence of what they just did.
    if (cam.observeDistance) {
      cam.distance += (cam.observeDistance - cam.distance) * Math.min(1, dt * 1.1);
      if (Math.abs(cam.distance - cam.observeDistance) < 0.4) cam.observeDistance = 0;
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

  /** Swings the camera to whatever was just acted on. */
  function frameForStation(station) {
    const marker = stationMarkers.get(station?.id);
    if (!marker) return;
    cam.desired.copy(marker.anchor);
    cam.observeDistance = 15;
  }

  /* -------------------------- the station activity -------------------------- */

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

  /* ===================== the activity: command stations =====================
   *
   * The response is COMMANDED BY DOING. Each ICS step is a real object
   * on the site that the player finds and acts on — the call point, the
   * intake panel, the muster marker, the cones, the first-aid post, the
   * radio, the gate. Nothing is chosen from a list.
   *
   * The incident itself is clickable too, and acting on it is always
   * wrong: the game has to offer the chance to walk into the hazard, or
   * refusing to is not a decision.
   * ======================================================================= */

  function applyEffects(effects) {
    if (!effects) return;
    state.casualty = clampMeter(state.casualty + (effects.casualty || 0));
    state.control = clampMeter(state.control + (effects.control || 0));
    state.evacuation = clampMeter(state.evacuation + (effects.evacuation || 0));
  }

  function nextRequiredPhase() {
    for (const s of STATIONS) {
      if (!state.doneStations.has(s.id)) return s.phase;
    }
    return STATION_COUNT;
  }

  function actOnStation(station) {
    if (state.finished || !station) return;
    if (state.doneStations.has(station.id)) {
      api.toast(`${station.label} — already done.`, "info");
      return;
    }

    const required = nextRequiredPhase();
    const inSequence = station.phase === required;

    state.doneStations.add(station.id);
    state.stepIndex = state.doneStations.size;
    applyEffects(station.effects);

    if (inSequence) {
      state.best += 1;
      state.score += STATION_SCORING.inSequence;
      sfx.correct();
      api.toast(station.done, "good", STATION_SCORING.inSequence);
    } else {
      state.outOfSequence += 1;
      state.score += STATION_SCORING.outOfSequence;
      // Doing the right thing late still helps, but control suffers.
      state.control = clampMeter(state.control - 10);
      sfx.click();
      api.toast(`${station.done} — but out of order.`, "warn", STATION_SCORING.outOfSequence);
      state.lessons.push(
        `${station.label}: done out of sequence. ${station.lesson}`
      );
    }

    // The scene reacts to what was actually done.
    if (station.id === "alarm") {
      state.alarmRaised = true;
      sfx.siren();
    }
    if (station.id === "isolate") {
      state.isolated = true;
      state.fireIntensity = Math.min(state.fireIntensity, 1.4);
    }
    if (station.id === "evacuate") {
      state.evacuating = true;
      sfx.radio();
    }
    if (station.id === "cordon") {
      revealCordon();
    }
    if (station.id === "services") {
      state.servicesCalled = true;
      ambulance.visible = true;
      sfx.ambulance();
    }
    if (station.id === "meet") {
      state.gateManned = true;
    }

    markStationDone(station.id);
    frameForStation(station);
    pushHud();

    if (state.doneStations.size >= STATION_COUNT) {
      later(() => { if (!state.finished) finish(true); }, 1600);
    }
  }

  function enterHazard() {
    if (state.finished) return;
    state.hazardEntries += 1;
    state.score += STATION_SCORING.hazardEntry;
    applyEffects(HAZARD_ENTRY.effects);
    state.consequence = "You are inside the incident.";
    state.consequenceUntil = stage.elapsed + 2.6;
    state.lessons.push(HAZARD_ENTRY.feedback);
    sfx.wrong();
    sfx.alarm();
    api.toast(HAZARD_ENTRY.feedback, "bad", STATION_SCORING.hazardEntry);
    pushHud();
  }

  /** Clicking something that is not a station at all. */
  function wrongTarget(label) {
    if (state.finished) return;
    state.score += STATION_SCORING.wrongTarget;
    sfx.locked();
    api.toast(`${label} is not part of the response right now.`, "warn", STATION_SCORING.wrongTarget);
  }


  function showBrief() {
    // The brief can be re-read at any time, including mid-decision — but
    // the decision clock keeps running, so reading it costs you time.
    const interrupting = false;
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
        api.dialog(null);
      },
    });
  }

  /* ------------------------------ finishing ------------------------------ */

  function finish(completed) {
    if (state.finished) return;
    state.finished = true;
    api.dialog(null);

    const total = STATION_COUNT;
    const remainingSeconds = Math.max(0, Math.floor(state.remainingMs / 1000));
    const casualtySurvived = state.casualty >= 35;
    const controlled = state.control >= 60;

    const survivalBonus = casualtySurvived ? STATION_SCORING.casualtySurvived : 0;
    const controlBonus = controlled ? STATION_SCORING.siteControlled : 0;
    const completionBonus = completed ? STATION_SCORING.allStations : 0;
    const timeBonus = completed ? remainingSeconds * STATION_SCORING.timeBonusPerSecond : 0;

    const raw = state.score + survivalBonus + controlBonus + completionBonus + timeBonus;
    const score = Math.max(0, Math.round(raw * difficulty.scoreScale));

    // Performance weights the actions most heavily, then the outcome.
    // Walking into the hazard is subtracted directly: it is the one
    // thing a commander must never do.
    const actionScore = total
      ? Math.max(0, (state.best + state.outOfSequence * 0.4 - state.hazardEntries) / total)
      : 0;
    const decisionScore = actionScore;
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
    const nextPhase = nextRequiredPhase();
    const nextStation = STATIONS[nextPhase] || null;
    api.hud({
      controlScheme: "command",
      objective: state.finished
        ? "Incident closed out"
        : nextStation
          ? `${PHASES[nextStation.phase] || "Respond"} — ${nextStation.prompt}`
          : scenario.title,
      score: Math.max(0, state.score),
      timeMs: state.remainingMs,
      progress: (state.doneStations.size / STATION_COUNT) * 100,
      progressLabel: `${state.doneStations.size} of ${STATION_COUNT} actions taken`,
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
      tasks: STATIONS.map((s) => ({
        id: s.id,
        label: `${s.action} — ${s.label}`,
        done: state.doneStations.has(s.id),
      })),
      prompt: state.finished
        ? null
        : {
            text: nextStation
              ? `Find the ${nextStation.label} and ${nextStation.action.toLowerCase()}`
              : "Hand over to the emergency services",
            tone: "good",
            key: mobile ? "Tap" : "Click",
          },
      tasksTitle: "THE RESPONSE",
      crosshair: "idle",
      keyHints: mobile ? [] : [
        { key: "Click", label: "Act on it" },
        { key: "1-8", label: "Find station" },
        { key: "Drag", label: "Look" },
        { key: "Z", label: "Zoom" },
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
    if (state.finished) return;
    api.dialog(null);
    frameForStation(STATIONS[0]);
    api.toast("Take command. Find the command post and work the response.", "warn");
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

    hudAccumulator += dt;
    if (hudAccumulator > 0.14) {
      hudAccumulator = 0;
      pushHud();
    }

    /* ----- acting on the world ----- */
    if (!state.finished && !state.briefOpen && input.wasPressed("tap")) {
      const hit = screenRaycast(camera, input.state.ndc, pickTargets, 400);
      if (hit) {
        const asStation = findTagged(hit.object, "stationId");
        const asHazard = findTagged(hit.object, "hazardEntry");
        if (asStation) actOnStation(stationById(asStation.userData.stationId));
        else if (asHazard) enterHazard();
      }
    }

    // Number keys jump the camera to a station, for desktop players who
    // would rather not hunt for the cone stack.
    for (let i = 0; i < 8; i++) {
      if (input.wasPressed(`opt${i + 1}`) && STATIONS[i]) {
        frameForStation(STATIONS[i]);
        api.toast(`${STATIONS[i].label} — ${STATIONS[i].prompt}`, "info");
      }
    }

    if (input.wasPressed("brief")) showBrief();
    if (input.wasPressed("topview")) { siteView.toggle(); sfx.click(); }

    // ZOOM snaps between a wide view of the whole site and a close look
    // at whatever the current step is about. Wheel and pinch still give
    // fine control; this is the one-tap version for a phone.
    if (input.wasPressed("zoom")) {
      const close = cam.observeDistance || 14;
      cam.distance = cam.distance > close + 6 ? close : 36;
      sfx.click();
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

    updateCommander(dt);
    siteView.update(dt, input, () => updateCamera(dt));

    if (cfg.shadows) {
      sun.position.set(cam.target.x + 40, 60, cam.target.z + 30);
      sun.target.position.set(cam.target.x, 0, cam.target.z);
      sun.target.updateMatrixWorld();
    }

    input.endFrame();
  });

  pushHud();

  /* ------------------------------ instance ------------------------------ */

  /* ------------------------------- demo -------------------------------
   * The response in the order it has to happen: the incident seen from
   * a safe standoff, then the muster point and the gate the services
   * arrive through, then the whole site from above — which is the view
   * a commander actually needs. */
  const demoTour = [
    establishingShot({ distance: 120, step: 0 }),
    shot(incident.position, { yaw: 2.3, pitch: 0.36, distance: 26, seconds: 7, step: 1 }),
    shot({ x: MUSTER.x, y: 0, z: MUSTER.z }, { yaw: -0.5, pitch: 0.42, distance: 24, seconds: 7, step: 2 }),
    shot({ x: GATE.x, y: 0, z: GATE.z }, { yaw: 1.2, pitch: 0.40, distance: 24, seconds: 6, step: 2 }),
    shot(incident.position, { yaw: 0.6, pitch: 0.30, distance: 19, seconds: 6, step: 4 }),
    closingShot({ distance: 125, step: 5 }),
  ];

  return {
    input,
    siteView,
    demoTour,

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
      siteView.dispose();
      input.dispose();
      stage.dispose();
    },

    // Test seam used by tests/arena-games.test.mjs. Not used by the app.
    __test: {
      walker: commander, avatar,
      camDistance: () => cam.distance,
      state, scenario, crowd,
      STATIONS, STATION_COUNT,
      actOnStation, enterHazard, nextRequiredPhase,
      stationMarkers,
    },
  };
}

export default { ...meta, create };
