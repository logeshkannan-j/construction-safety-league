/* ------------------------------------------------------------------ *
 *  GAME 4 — SAFETY ESCAPE CHALLENGE
 *
 *  A seven-area escape room inside an unfinished building. Each area
 *  holds one real safety decision; get it right and the door to the
 *  next area unlocks. Get it wrong and you lose score AND clock, and
 *  the game tells you exactly what would have happened to you.
 *
 *  Uses the same first-person controller as the Safety Mission
 *  Simulator, so it plays identically with WASD + mouse or with the
 *  virtual joystick and touch look.
 * ------------------------------------------------------------------ */

import * as THREE from "three";
import { createStage, addIndoorLight, addSky } from "../../engine/gfx.js";
import { createInput } from "../../engine/input.js";
import { createFirstPerson } from "../../engine/fpsController.js";
import {
  createMaterials, createGeometries, box, cylinder, collider,
  buildGround, buildSign, buildFireExtinguisher, buildElectricalPanel,
  buildMaterialPallet, buildDebris, buildCableRun, buildPuddle, buildLadder,
  buildGuardrail, buildScaffold, buildPPEStation, buildWorker, buildCone, buildBarrier,
} from "../../engine/kit.js";
import { sfx } from "../../audio.js";
import { PUZZLES, SCORING, AREA_ORDER } from "./puzzles.js";

/* ============================== metadata ============================== */

export const meta = {
  id: "escape-challenge",
  controls: "move-look-interact",

  briefing: {
    role:
      "You are alone in an unfinished building when the fire alarm sounds. The power has failed, " +
      "smoke is building at ceiling level, and the way out runs through seven areas.",
    objectives: [
      "Work through the building: basement, electrical room, construction floor, stores, plant room, scaffold access, exit lobby.",
      "In each area, find the interactive point and make the right safety decision.",
      "A correct decision unlocks the door to the next area.",
      "A wrong decision costs you score and 25 seconds of a clock you cannot afford.",
      "Reach the final exit before the timer reaches zero.",
    ],
    scoring: [
      { label: "Area solved first time", value: "+250" },
      { label: "Area solved after a mistake", value: "+120" },
      { label: "Wrong decision", value: "-60 and -25s" },
      { label: "Escaped the building", value: "+600" },
      { label: "Time remaining", value: "+3 / second" },
    ],
    tips: [
      "The nearest door is almost never the escape route. The signed one is.",
      "Isolate the circuit you need, not the whole building — emergency lighting runs on it too.",
      "Extinguisher class matters more than extinguisher size.",
      "A red scaffold tag means do not use, even in an evacuation.",
      "Raising the alarm protects everyone still inside. Do it before you leave.",
    ],
  },

  desktopControls: [
    ["W A S D", "Move through the building"],
    ["Mouse", "Look around (click once to capture the mouse)"],
    ["Shift", "Run"],
    ["E", "Interact with the decision point or a door"],
    ["Esc", "Pause"],
  ],
  mobileControls: [
    ["Joystick", "Move — bottom-left of the screen"],
    ["Drag right", "Look around while moving"],
    ["INTERACT", "Use the decision point or open a door"],
    ["RUN", "Hold to move faster"],
    ["Pause", "Top-right of the HUD"],
  ],
};

const BASE_SECONDS = 600;
const WALL_HEIGHT = 3.2;
const WALL_THICK = 0.3;

/* ============================== the rooms ============================== */

// Each area is a rectangle. Doors sit in the +x wall and lead to the
// next area, so the building reads as a route rather than a maze.
const ROOMS = [
  { key: "basement", x0: -6, x1: 10, z0: -6, z1: 6, floor: 0, label: "Basement" },
  { key: "electrical", x0: 12, x1: 26, z0: -5, z1: 5, floor: 0, label: "Electrical room" },
  { key: "ppe", x0: 28, x1: 46, z0: -8, z1: 8, floor: 0, label: "Construction floor" },
  { key: "chemical", x0: 48, x1: 62, z0: -5, z1: 5, floor: 0, label: "Stores" },
  { key: "fire", x0: 64, x1: 78, z0: -5, z1: 5, floor: 0, label: "Plant room" },
  { key: "signage", x0: 80, x1: 98, z0: -8, z1: 8, floor: 0, label: "Scaffold access" },
  { key: "alarm", x0: 100, x1: 114, z0: -5, z1: 5, floor: 0, label: "Exit lobby" },
];

/* ============================== the game ============================== */

export function create({ container, difficulty, quality, settings, mobile, api }) {
  const stage = createStage(container, { quality, fov: mobile ? 78 : 74 });
  const { scene, camera, cfg } = stage;
  const mat = createMaterials(cfg);
  const geo = createGeometries(cfg);

  const colliders = [];
  const animated = [];

  /* --------------------------- environment --------------------------- */

  // A dull overcast sky is only visible through the final exit, which
  // makes the way out read as light at the end.
  addSky(scene, cfg, { top: "#2A3A45", bottom: "#6E7F86", fogColor: "#3A464E" });
  addIndoorLight(scene, cfg, { color: 0xffe0b8, intensity: 0.75 });
  scene.add(buildGround(mat, 320));
  if (scene.fog) {
    // Smoke haze: close fog makes the building feel enclosed and raises
    // the pressure without costing a single draw call.
    scene.fog.near = 6;
    scene.fog.far = 42;
    scene.fog.color = new THREE.Color("#39434A");
  }

  /* ----------------------------- geometry ----------------------------- */

  function addWall(x, z, w, d, { material = mat.concrete, height = WALL_HEIGHT, solid = true } = {}) {
    const wall = box(geo, material, w, height, d, x, height / 2, z);
    scene.add(wall);
    if (solid) colliders.push(collider(x, height / 2, z, w, height, d));
    return wall;
  }

  /**
   * Builds one wall run with gaps left for doorways.
   * `gaps` is a list of [from, to] along the run axis.
   */
  function wallWithGaps(axis, fixed, from, to, gaps, options = {}) {
    const sorted = [...gaps].sort((a, b) => a[0] - b[0]);
    let cursor = from;
    sorted.forEach(([gapFrom, gapTo]) => {
      if (gapFrom > cursor) {
        const length = gapFrom - cursor;
        if (axis === "x") addWall(cursor + length / 2, fixed, length, WALL_THICK, options);
        else addWall(fixed, cursor + length / 2, WALL_THICK, length, options);
      }
      cursor = Math.max(cursor, gapTo);
    });
    if (cursor < to) {
      const length = to - cursor;
      if (axis === "x") addWall(cursor + length / 2, fixed, length, WALL_THICK, options);
      else addWall(fixed, cursor + length / 2, WALL_THICK, length, options);
    }
  }

  const DOOR_WIDTH = 1.8;

  const rooms = ROOMS.map((room, index) => {
    const next = ROOMS[index + 1];
    const centreZ = (room.z0 + room.z1) / 2;

    // Floor slab.
    const floorMesh = box(geo, mat.concreteSlab,
      room.x1 - room.x0, 0.3, room.z1 - room.z0,
      (room.x0 + room.x1) / 2, -0.15, centreZ);
    scene.add(floorMesh);

    // Ceiling, so the space feels like a room.
    const ceiling = box(geo, mat.concreteDark,
      room.x1 - room.x0, 0.3, room.z1 - room.z0,
      (room.x0 + room.x1) / 2, WALL_HEIGHT + 0.15, centreZ);
    scene.add(ceiling);

    // North and south walls (full length).
    wallWithGaps("x", room.z0, room.x0, room.x1, []);
    wallWithGaps("x", room.z1, room.x0, room.x1, []);

    // West wall — gap only for the previous room's doorway.
    const westGaps = index === 0 ? [] : [[centreZ - DOOR_WIDTH / 2, centreZ + DOOR_WIDTH / 2]];
    wallWithGaps("z", room.x0, room.z0, room.z1, westGaps);

    // East wall — gap for this room's doorway (or the final exit).
    const eastGaps = [[centreZ - DOOR_WIDTH / 2, centreZ + DOOR_WIDTH / 2]];
    wallWithGaps("z", room.x1, room.z0, room.z1, eastGaps);

    // The link corridor between rooms.
    if (next) {
      const gapStart = room.x1;
      const gapEnd = next.x0;
      if (gapEnd > gapStart) {
        scene.add(box(geo, mat.concreteSlab, gapEnd - gapStart, 0.3, DOOR_WIDTH + 1.2,
          (gapStart + gapEnd) / 2, -0.15, centreZ));
        scene.add(box(geo, mat.concreteDark, gapEnd - gapStart, 0.3, DOOR_WIDTH + 1.2,
          (gapStart + gapEnd) / 2, WALL_HEIGHT + 0.15, centreZ));
        [-1, 1].forEach((side) => {
          addWall((gapStart + gapEnd) / 2, centreZ + side * (DOOR_WIDTH / 2 + 0.6),
            gapEnd - gapStart, WALL_THICK);
        });
      }
    }

    return { ...room, centreZ, doorAt: { x: room.x1, z: centreZ } };
  });

  /* ------------------------------ doors ------------------------------ */

  const doors = rooms.map((room, index) => {
    const isFinal = index === rooms.length - 1;
    const group = new THREE.Group();

    const leaf = box(geo, isFinal ? mat.green : mat.steelDark, WALL_THICK + 0.08, 2.5, DOOR_WIDTH, 0, 1.25, 0);
    group.add(leaf);
    // A small vision panel and a push bar, so it reads as a fire door.
    group.add(box(geo, mat.glass, WALL_THICK + 0.12, 0.6, 0.6, 0, 1.75, 0, { shadow: false }));
    group.add(box(geo, mat.galv, 0.1, 0.08, DOOR_WIDTH * 0.7, 0.22, 1.05, 0, { shadow: false }));

    // Locked indicator.
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xea4f4f })
    );
    lamp.position.set(0.3, 2.1, DOOR_WIDTH / 2 - 0.2);
    group.add(lamp);

    group.position.set(room.doorAt.x, 0, room.doorAt.z);
    scene.add(group);

    const doorCollider = collider(room.doorAt.x, 1.25, room.doorAt.z, WALL_THICK + 0.1, 2.5, DOOR_WIDTH);
    colliders.push(doorCollider);

    // Exit sign above every door, which is also the escape-route clue
    // the basement puzzle asks about.
    const sign = buildSign(geo, mat, {
      text: isFinal ? "Final exit" : "Exit",
      kind: "emergency",
      height: 2.85,
      width: 0.95,
      post: false,
    });
    sign.rotation.y = Math.PI / 2;
    sign.position.set(room.doorAt.x - 0.3, 0, room.doorAt.z);
    scene.add(sign);

    return {
      roomKey: room.key,
      group,
      leaf,
      lamp,
      collider: doorCollider,
      locked: true,
      isFinal,
      position: new THREE.Vector3(room.doorAt.x, 1.2, room.doorAt.z),
      openProgress: 0,
    };
  });

  function doorFor(roomKey) {
    return doors.find((d) => d.roomKey === roomKey);
  }

  function unlockDoor(roomKey) {
    const door = doorFor(roomKey);
    if (!door || !door.locked) return;
    door.locked = false;
    door.lamp.material = new THREE.MeshBasicMaterial({ color: 0x33c481 });
    const index = colliders.indexOf(door.collider);
    if (index >= 0) colliders.splice(index, 1);
    controller.setColliders(colliders);
    sfx.doorOpen();
  }

  /* ========================== area dressing ========================== */

  function roomByKey(key) {
    return rooms.find((r) => r.key === key);
  }

  const interactables = [];

  function addInteractable({ key, position, radius = 2.6, label, onUse }) {
    const marker = new THREE.Mesh(
      new THREE.TorusGeometry(0.75, 0.07, 6, 18),
      new THREE.MeshBasicMaterial({ color: 0xffc629, transparent: true, opacity: 0.75, depthWrite: false })
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(position.x, 0.12, position.z);
    scene.add(marker);
    animated.push({ kind: "ring", object: marker, phase: Math.random() * 6 });

    const item = {
      key,
      label,
      position: new THREE.Vector3(position.x, position.y ?? 1.3, position.z),
      radius,
      marker,
      onUse,
      done: false,
    };
    interactables.push(item);
    return item;
  }

  /* ---- Area 1: basement ---- */
  {
    const room = roomByKey("basement");
    // Two decoy openings: one obstructed, one a dead powered shutter.
    addWall(room.x0 + 4, room.z0 + 0.1, 2.0, 0.34, { material: mat.steelDark, height: 2.6 });
    const drums = buildMaterialPallet(geo, mat, { type: "bags", rows: 3 });
    drums.position.set(room.x0 + 4, 0, room.z0 + 1.1);
    scene.add(drums);
    colliders.push(collider(room.x0 + 4, 0.6, room.z0 + 1.1, 2, 1.4, 1.4));

    const shutter = box(geo, mat.galv, 3.2, 2.8, 0.2, room.x0 + 4, 1.4, room.z1 - 0.1);
    scene.add(shutter);
    for (let i = 0; i < 8; i++) {
      scene.add(box(geo, mat.steelDark, 3.2, 0.06, 0.24, room.x0 + 4, 0.3 + i * 0.33, room.z1 - 0.1, { shadow: false }));
    }
    const shutterSign = buildSign(geo, mat, { text: "Powered shutter no exit", kind: "prohibition", height: 2.4, width: 0.8, post: false });
    shutterSign.position.set(room.x0 + 6.4, 0, room.z1 - 0.26);
    scene.add(shutterSign);

    scene.add((() => { const p = buildPuddle(geo, mat, { radius: 2.0 }); p.position.set(room.x0 + 2.5, 0, 2.6); return p; })());
    const debris = buildDebris(geo, mat, { spread: 3, count: 12 });
    debris.position.set(room.x0 + 7, 0, -3);
    scene.add(debris);
    const cable = buildCableRun(geo, mat, { length: 8, damaged: false, onGround: true });
    cable.position.set(2, 0, 0.5);
    scene.add(cable);

    addInteractable({
      key: "basement",
      position: { x: room.x1 - 3.2, z: room.centreZ },
      label: "Choose your escape route",
    });
  }

  /* ---- Area 2: electrical room ---- */
  {
    const room = roomByKey("electrical");
    const main = buildElectricalPanel(geo, mat, { unsafe: false, height: 2.0 });
    main.position.set(room.x0 + 3, 0, room.z0 + 0.9);
    scene.add(main);
    colliders.push(collider(room.x0 + 3, 1.2, room.z0 + 0.9, 1, 2.2, 0.5));

    const localIsolator = buildElectricalPanel(geo, mat, { unsafe: false, height: 1.2 });
    localIsolator.position.set(room.x1 - 3.4, 0, room.z1 - 0.9);
    scene.add(localIsolator);
    colliders.push(collider(room.x1 - 3.4, 0.9, room.z1 - 0.9, 1, 1.6, 0.5));

    const inverter = box(geo, mat.blue, 1.0, 1.4, 0.5, room.x0 + 7, 1.0, room.z1 - 0.9);
    scene.add(inverter);
    colliders.push(collider(room.x0 + 7, 1.0, room.z1 - 0.9, 1.0, 1.4, 0.5));
    const invSign = buildSign(geo, mat, { text: "Emergency lighting inverter", kind: "info", height: 2.1, width: 0.8, post: false });
    invSign.position.set(room.x0 + 7, 0, room.z1 - 1.2);
    scene.add(invSign);

    const danger = buildSign(geo, mat, { text: "Danger 415 volts", kind: "warning", height: 2.4, width: 0.9, post: false });
    danger.position.set(room.x0 + 3, 0, room.z0 + 0.6);
    danger.rotation.y = Math.PI;
    scene.add(danger);

    addInteractable({
      key: "electrical",
      position: { x: room.x1 - 3.4, z: room.z1 - 2.4 },
      label: "Make the door circuit safe",
    });
  }

  /* ---- Area 3: construction floor ---- */
  {
    const room = roomByKey("ppe");
    const station = buildPPEStation(geo, mat);
    station.position.set(room.x0 + 3.2, 0, room.z0 + 1.0);
    scene.add(station);
    colliders.push(collider(room.x0 + 3.2, 1.05, room.z0 + 1.0, 1.8, 2.1, 0.6));

    // An open leading edge inside the room, guarded, plus a scaffold.
    scene.add(buildGuardrail(mat, { x: room.x1 - 5, y: 0, z: room.z1 - 2.5, length: 8, axis: "x" }));
    const ladder = buildLadder(geo, mat, { height: 3.0, lean: 0.1 });
    ladder.position.set(room.x1 - 2.4, 0, room.z0 + 2.0);
    scene.add(ladder);

    const worker = buildWorker(geo, mat, { helmet: true, vest: true, harness: true, pose: "work" });
    worker.position.set(room.x0 + 8, 0, room.z1 - 3.4);
    worker.rotation.y = 1.2;
    scene.add(worker);
    animated.push({ kind: "worker", object: worker, phase: 1 });

    [[room.x0 + 6, room.z0 + 3], [room.x0 + 11, room.z1 - 5]].forEach(([cx, cz]) => {
      const cone = buildCone(geo, mat, {});
      cone.position.set(cx, 0, cz);
      scene.add(cone);
    });

    const sign = buildSign(geo, mat, { text: "PPE must be worn beyond this point", kind: "mandatory", height: 2.3, width: 1.0, post: false });
    sign.rotation.y = Math.PI / 2;
    sign.position.set(room.x1 - 0.5, 0, room.centreZ + 1.6);
    scene.add(sign);

    addInteractable({
      key: "ppe",
      position: { x: room.x0 + 3.2, z: room.z0 + 2.6 },
      label: "Select your PPE",
    });
  }

  /* ---- Area 4: stores ---- */
  {
    const room = roomByKey("chemical");
    // The unlabelled bottle on a bench — the actual hazard.
    const bench = box(geo, mat.timberDark, 2.4, 0.1, 0.8, room.x0 + 3.4, 0.9, room.z0 + 1.2);
    scene.add(bench);
    [[-1.1], [1.1]].forEach(([ox]) => {
      scene.add(box(geo, mat.timberDark, 0.1, 0.9, 0.7, room.x0 + 3.4 + ox, 0.45, room.z0 + 1.2));
    });
    const bottle = cylinder(geo, mat.white, 0.1, 0.32, room.x0 + 3.4, 1.11, room.z0 + 1.2);
    scene.add(bottle);
    scene.add(cylinder(geo, mat.orange, 0.055, 0.1, room.x0 + 3.4, 1.32, room.z0 + 1.2, { low: true, shadow: false }));

    // Bunded drums.
    scene.add(box(geo, mat.steelDark, 3.0, 0.22, 1.8, room.x1 - 3.2, 0.11, room.z0 + 1.4));
    [0, 1, 2].forEach((i) => {
      scene.add(cylinder(geo, mat.blue, 0.28, 0.9, room.x1 - 4.2 + i * 1.0, 0.67, room.z0 + 1.4));
    });

    // Flammables cabinet.
    const cabinet = box(geo, mat.yellow, 1.1, 1.8, 0.6, room.x0 + 7.5, 0.9, room.z1 - 0.9);
    scene.add(cabinet);
    colliders.push(collider(room.x0 + 7.5, 0.9, room.z1 - 0.9, 1.1, 1.8, 0.6));
    const flamSign = buildSign(geo, mat, { text: "Flammable keep locked", kind: "warning", height: 1.9, width: 0.6, post: false });
    flamSign.position.set(room.x0 + 7.5, 0, room.z1 - 1.22);
    flamSign.rotation.y = Math.PI;
    scene.add(flamSign);

    // Eyewash station.
    const eyewash = box(geo, mat.green, 0.6, 0.5, 0.3, room.x1 - 2.0, 1.4, room.z1 - 0.9);
    scene.add(eyewash);
    const ewSign = buildSign(geo, mat, { text: "Eyewash", kind: "emergency", height: 2.0, width: 0.5, post: false });
    ewSign.position.set(room.x1 - 2.0, 0, room.z1 - 1.12);
    ewSign.rotation.y = Math.PI;
    scene.add(ewSign);

    addInteractable({
      key: "chemical",
      position: { x: room.x0 + 3.4, z: room.z0 + 2.8 },
      label: "Inspect the chemical store",
    });
  }

  /* ---- Area 5: plant room ---- */
  {
    const room = roomByKey("fire");
    // Switchgear on fire, blocking the route.
    const switchgear = box(geo, mat.steelDark, 1.4, 2.2, 0.8, room.x1 - 4.0, 1.1, room.centreZ);
    scene.add(switchgear);
    colliders.push(collider(room.x1 - 4.0, 1.1, room.centreZ, 1.4, 2.2, 0.8));

    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff7a1f, transparent: true, opacity: 0.9, depthWrite: false });
    const flames = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const flame = new THREE.Mesh(geo.cone, flameMat);
      flame.scale.set(0.5 + Math.random() * 0.3, 1.0 + Math.random() * 0.8, 0.5);
      flame.position.set((Math.random() - 0.5) * 1.0, 2.3 + Math.random() * 0.5, (Math.random() - 0.5) * 0.5);
      flames.add(flame);
    }
    flames.position.set(room.x1 - 4.0, 0, room.centreZ);
    scene.add(flames);
    animated.push({ kind: "flames", object: flames, phase: 0 });

    const smoke = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.3, depthWrite: false })
    );
    smoke.position.set(room.x1 - 4.0, 3.0, room.centreZ);
    scene.add(smoke);

    // The four extinguishers on the wall.
    const classes = [
      ["water", mat.red, "Water"],
      ["foam", mat.white, "Foam"],
      ["co2", mat.black, "CO2"],
      ["wet", mat.yellow, "Wet chemical"],
    ];
    classes.forEach(([id, bodyMat, label], i) => {
      const ext = buildFireExtinguisher(geo, mat, { onStand: false, cls: id });
      ext.position.set(room.x0 + 2.4 + i * 1.6, 0.5, room.z0 + 0.8);
      scene.add(ext);
      const tag = buildSign(geo, mat, { text: label, kind: "info", height: 1.6, width: 0.45, post: false });
      tag.position.set(room.x0 + 2.4 + i * 1.6, 0, room.z0 + 0.55);
      tag.rotation.y = Math.PI;
      scene.add(tag);
      scene.add(box(geo, bodyMat, 0.3, 0.1, 0.1, room.x0 + 2.4 + i * 1.6, 1.3, room.z0 + 0.7, { shadow: false }));
    });

    addInteractable({
      key: "fire",
      position: { x: room.x0 + 4.8, z: room.z0 + 2.4 },
      label: "Choose an extinguisher",
      radius: 3.4,
    });
  }

  /* ---- Area 6: scaffold access ---- */
  {
    const room = roomByKey("signage");
    const scaffold = buildScaffold(geo, mat, {
      x: room.x0 + 6, y: 0, z: room.z0 + 2.2,
      bays: 3, depth: 1.3, lifts: 2, liftHeight: 2,
      incompleteLift: 2, missingGuardrailLift: 1,
    });
    scene.add(scaffold.group);
    colliders.push(...scaffold.colliders);

    // The red tag at the foot of the access ladder.
    const tagPost = cylinder(geo, mat.galv, 0.04, 1.4, room.x0 + 2.0, 0.7, room.z0 + 2.6);
    scene.add(tagPost);
    const redTag = buildSign(geo, mat, { text: "DO NOT USE incomplete scaffold", kind: "prohibition", height: 1.3, width: 0.65, post: false });
    redTag.position.set(room.x0 + 2.0, 0, room.z0 + 2.75);
    scene.add(redTag);
    scene.add(box(geo, mat.red, 0.7, 0.5, 0.04, room.x0 + 2.0, 1.3, room.z0 + 2.55, { shadow: false }));

    // The longer ground-level route, signed.
    const routeSign = buildSign(geo, mat, { text: "Ground level route this way", kind: "emergency", height: 2.2, width: 1.0, post: true });
    routeSign.position.set(room.x1 - 5, 0, room.z1 - 2.0);
    scene.add(routeSign);
    for (let i = 0; i < 5; i++) {
      const barrier = buildBarrier(geo, mat, { length: 2.4 });
      barrier.position.set(room.x0 + 4 + i * 2.6, 0, room.z1 - 3.4);
      scene.add(barrier);
    }

    addInteractable({
      key: "signage",
      position: { x: room.x0 + 2.6, z: room.z0 + 4.2 },
      label: "Read the scaffold tag",
      radius: 3.0,
    });
  }

  /* ---- Area 7: exit lobby ---- */
  {
    const room = roomByKey("alarm");
    // Break-glass call point beside the final door.
    const callPoint = box(geo, mat.red, 0.3, 0.3, 0.12, room.x1 - 1.2, 1.4, room.centreZ - 1.4);
    scene.add(callPoint);
    scene.add(box(geo, mat.white, 0.2, 0.2, 0.04, room.x1 - 1.2, 1.4, room.centreZ - 1.46, { shadow: false }));
    const cpSign = buildSign(geo, mat, { text: "Fire alarm call point", kind: "warning", height: 1.9, width: 0.55, post: false });
    cpSign.position.set(room.x1 - 1.3, 0, room.centreZ - 1.5);
    scene.add(cpSign);

    const ext = buildFireExtinguisher(geo, mat, { onStand: true });
    ext.position.set(room.x1 - 1.4, 0, room.centreZ + 1.8);
    scene.add(ext);

    const muster = buildSign(geo, mat, { text: "Muster point across the yard", kind: "emergency", height: 2.4, width: 1.1, post: false });
    muster.rotation.y = Math.PI / 2;
    muster.position.set(room.x1 - 0.5, 0, room.centreZ + 2.6);
    scene.add(muster);

    addInteractable({
      key: "alarm",
      position: { x: room.x1 - 2.6, z: room.centreZ - 1.2 },
      label: "Raise the alarm",
    });
  }

  // Beyond the final door: daylight and the muster point, so the exit
  // is visibly somewhere rather than a wall.
  {
    const last = rooms[rooms.length - 1];
    const yardX = last.x1 + 10;
    scene.add(box(geo, mat.ground, 40, 0.2, 40, yardX + 6, -0.1, last.centreZ));
    const musterSign = buildSign(geo, mat, { text: "Muster point A", kind: "emergency", height: 2.6, width: 1.3 });
    musterSign.position.set(yardX + 4, 0, last.centreZ);
    scene.add(musterSign);
    [[-3, -3], [-3, 3], [3, -3]].forEach(([ox, oz]) => {
      const worker = buildWorker(geo, mat, { helmet: true, vest: true, pose: "stand" });
      worker.position.set(yardX + 6 + ox, 0, last.centreZ + oz);
      worker.rotation.y = Math.random() * 6;
      scene.add(worker);
      animated.push({ kind: "worker", object: worker, phase: Math.random() * 6 });
    });
  }

  /* ============================== player ============================== */

  const firstRoom = rooms[0];
  const input = createInput(container, {
    pointerLock: !mobile,
    onPause: () => api.requestPause(),
  });
  input.setSensitivity(settings.lookSensitivity ?? 1);
  input.setInvertY(!!settings.invertY);

  const controller = createFirstPerson(camera, input, {
    colliders,
    spawn: { x: firstRoom.x0 + 2, y: 0, z: firstRoom.centreZ },
    // Facing +x, down the route.
    yaw: -Math.PI / 2,
    canJump: false,
    onStep: () => sfx.step(),
  });

  api.buttons([
    { id: "interact", label: "USE", action: "interact", mode: "tap", color: "#9B7CF2", primary: true },
    { id: "run", label: "RUN", action: "run", mode: "hold", color: "#33C481" },
  ]);

  /* ============================ game state ============================ */

  const missionMs = BASE_SECONDS * 1000 * difficulty.timeScale;
  const state = {
    remainingMs: missionMs,
    score: 0,
    solved: 0,
    mistakes: 0,
    firstTryCount: 0,
    attempts: {},
    escaped: false,
    finished: false,
    paused: false,
    dialogOpen: false,
    target: null,
    currentArea: 0,
    consequence: null,
    consequenceUntil: 0,
    lessons: [],
  };

  /* ---------------------------- interaction ---------------------------- */

  const lookDir = new THREE.Vector3();
  const toTarget = new THREE.Vector3();

  function findTarget() {
    camera.getWorldDirection(lookDir);
    let best = null;
    let bestRank = -Infinity;

    // Unsolved decision points.
    for (const item of interactables) {
      if (item.done) continue;
      toTarget.copy(item.position).sub(camera.position);
      const distance = toTarget.length();
      if (distance > item.radius) continue;
      toTarget.normalize();
      const facing = toTarget.dot(lookDir);
      if (facing < 0.1) continue;
      const rank = facing * 2 - distance / item.radius;
      if (rank > bestRank) { bestRank = rank; best = { kind: "puzzle", item }; }
    }

    // Doors, so the player can see whether one is locked.
    for (const door of doors) {
      toTarget.copy(door.position).sub(camera.position);
      const distance = toTarget.length();
      if (distance > 3.2) continue;
      toTarget.normalize();
      const facing = toTarget.dot(lookDir);
      if (facing < 0.3) continue;
      const rank = facing * 2 - distance / 3.2;
      if (rank > bestRank) { bestRank = rank; best = { kind: "door", door }; }
    }

    return best;
  }

  function openPuzzle(item) {
    const puzzle = PUZZLES[item.key];
    if (!puzzle) return;
    state.dialogOpen = true;
    controller.setFrozen(true);
    sfx.interact();

    const attempts = state.attempts[item.key] || 0;

    api.dialog({
      eyebrow: puzzle.eyebrow,
      title: puzzle.title,
      subtitle: puzzle.subtitle,
      tone: "normal",
      options: puzzle.options.map((option, i) => ({
        id: option.id,
        label: option.label,
        desc: difficulty.hints || attempts > 0 ? option.desc : undefined,
        badge: String.fromCharCode(65 + i),
      })),
      footer: attempts > 0
        ? `Attempt ${attempts + 1}. A wrong answer costs ${Math.abs(SCORING.wrong)} points and 25 seconds.`
        : `Right first time: +${SCORING.firstTry}. Wrong: ${SCORING.wrong} and -25 seconds.`,
      onPick: (id) => answerPuzzle(item, id),
    });
  }

  function answerPuzzle(item, optionId) {
    const puzzle = PUZZLES[item.key];
    const option = puzzle.options.find((o) => o.id === optionId);
    const attempts = state.attempts[item.key] || 0;

    if (option?.correct) {
      const points = attempts === 0 ? SCORING.firstTry : SCORING.afterMistake;
      state.score += points;
      state.solved += 1;
      if (attempts === 0) state.firstTryCount += 1;
      item.done = true;
      item.marker.visible = false;
      unlockDoor(item.key);
      closeDialog();
      sfx.correct();
      api.toast(`${option.feedback}`, "good", points);
      api.toast(`${puzzle.area} clear — the door is open.`, "info");
      state.currentArea = Math.min(AREA_ORDER.length - 1, AREA_ORDER.indexOf(item.key) + 1);
      return;
    }

    // Wrong answer: score, clock, and an honest consequence.
    state.attempts[item.key] = attempts + 1;
    state.mistakes += 1;
    state.score += SCORING.wrong;
    state.remainingMs = Math.max(0, state.remainingMs - SCORING.wrongTimePenaltyMs);
    state.lessons.push(option?.feedback || "Review this decision.");
    sfx.wrong();
    if (option?.consequence) {
      state.consequence = option.consequence;
      state.consequenceUntil = stage.elapsed + 2.6;
      sfx.alarm();
    }
    api.toast(option?.feedback || "That is not the safe option.", "bad", SCORING.wrong);
    api.toast("25 seconds lost.", "warn");

    if (state.remainingMs <= 0) {
      closeDialog();
      finish(false);
      return;
    }
    // Re-open so the player must actually make the right call.
    openPuzzle(item);
  }

  function closeDialog() {
    api.dialog(null);
    state.dialogOpen = false;
    controller.setFrozen(false);
  }

  function useDoor(door) {
    if (door.locked) {
      sfx.locked();
      const puzzle = PUZZLES[door.roomKey];
      api.toast(
        `This door is secured. ${puzzle ? `Deal with ${puzzle.area.toLowerCase()} first.` : ""}`,
        "warn"
      );
      return;
    }
    if (door.isFinal && !state.escaped) {
      state.escaped = true;
      state.score += SCORING.escaped;
      sfx.missionComplete();
      finish(true);
    }
  }

  /* ------------------------------ finishing ------------------------------ */

  function finish(completed) {
    if (state.finished) return;
    state.finished = true;
    controller.setFrozen(true);
    api.dialog(null);

    const total = AREA_ORDER.length;
    const remainingSeconds = Math.max(0, Math.floor(state.remainingMs / 1000));
    const timeBonus = completed ? remainingSeconds * SCORING.timeBonusPerSecond : 0;
    const penalties = Math.round(state.mistakes * Math.abs(SCORING.wrong) * (difficulty.penaltyScale - 1));
    const raw = state.score + timeBonus - penalties;
    const score = Math.max(0, Math.round(raw * difficulty.scoreScale));

    const areaRatio = state.solved / total;
    const accuracy = Math.round(
      (state.solved + state.mistakes) > 0
        ? (state.solved / (state.solved + state.mistakes)) * 100
        : 0
    );
    const performance = Math.round(100 * areaRatio * (state.solved / Math.max(1, state.solved + state.mistakes)));

    const lessons = state.lessons.length
      ? [...new Set(state.lessons)].slice(0, 6)
      : ["A clean escape — every decision correct first time. That is exactly how an evacuation should go."];
    if (!completed) {
      lessons.unshift("You did not get out in time. In a real evacuation, hesitation and wrong turns are what cost people their lives.");
    }

    api.finish({
      score,
      completed,
      accuracy,
      performance,
      timeTakenMs: Math.round(missionMs - state.remainingMs),
      stats: {
        areas: total,
        areasSolved: state.solved,
        mistakes: state.mistakes,
        firstTime: state.firstTryCount,
        escaped: state.escaped,
      },
      breakdown: [
        { label: "Areas cleared", value: `${state.solved} / ${total}`, tone: state.solved === total ? "good" : "bad" },
        { label: "Right first time", value: `${state.firstTryCount} / ${total}`, tone: state.firstTryCount === total ? "good" : "info" },
        { label: "Wrong decisions", value: `${state.mistakes}`, tone: state.mistakes ? "bad" : "good" },
        { label: "Escaped the building", value: state.escaped ? "Yes" : "No", tone: state.escaped ? "good" : "bad" },
        ...(state.escaped ? [{ label: "Escape bonus", value: `+${SCORING.escaped}`, tone: "good" }] : []),
        ...(timeBonus ? [{ label: `Time bonus (${remainingSeconds}s left)`, value: `+${timeBonus}`, tone: "good" }] : []),
        ...(state.mistakes ? [{ label: "Time lost to wrong decisions", value: `${state.mistakes * 25}s`, tone: "bad" }] : []),
        { label: `Difficulty multiplier (${difficulty.label})`, value: `×${difficulty.scoreScale}`, tone: "info" },
      ],
      lessons,
    });
  }

  /* -------------------------------- HUD -------------------------------- */

  let hudAccumulator = 0;

  function pushHud() {
    const areaKey = AREA_ORDER[state.currentArea];
    const puzzle = PUZZLES[areaKey];
    const target = state.target;
    const urgent = state.remainingMs < 90000;

    let prompt = null;
    if (target?.kind === "puzzle") {
      prompt = { text: mobile ? `Tap USE — ${target.item.label}` : `Press E — ${target.item.label}`, tone: "good", key: "E" };
    } else if (target?.kind === "door") {
      prompt = target.door.locked
        ? { text: "Secured — solve this area first", tone: "bad", key: "E" }
        : { text: target.door.isFinal ? (mobile ? "Tap USE to escape" : "Press E to escape") : "Open", tone: "good", key: "E" };
    }

    api.hud({
      controlScheme: "move-look-interact",
      objective: state.escaped
        ? "You are out"
        : puzzle
          ? `${puzzle.area} — ${state.solved}/${AREA_ORDER.length} areas cleared`
          : "Find the way out",
      score: Math.max(0, state.score),
      timeMs: state.remainingMs,
      progress: (state.solved / AREA_ORDER.length) * 100,
      progressLabel: `${state.solved} of ${AREA_ORDER.length} areas cleared`,
      crosshair: target ? (target.kind === "door" && target.door.locked ? "idle" : "target") : "idle",
      prompt,
      danger: urgent,
      flashDanger: state.consequence !== null && stage.elapsed < state.consequenceUntil,
      keyHints: mobile ? [] : [
        { key: "WASD", label: "Move" },
        { key: "Shift", label: "Run" },
        { key: "E", label: "Use" },
        { key: "Esc", label: "Pause" },
      ],
      tasks: AREA_ORDER.map((key) => ({
        id: key,
        label: PUZZLES[key].area,
        done: interactables.find((i) => i.key === key)?.done || false,
      })),
      tasksTitle: "ROUTE OUT",
    });
  }

  /* -------------------------------- loop -------------------------------- */

  stage.start((dt) => {
    if (state.paused) return;

    if (!state.finished) {
      state.remainingMs -= dt * 1000;
      if (state.remainingMs <= 0) {
        state.remainingMs = 0;
        finish(false);
      }
    }

    if (!state.dialogOpen && !state.finished) {
      controller.update(dt);
      state.target = findTarget();
      if (state.target && input.wasPressed("interact")) {
        if (state.target.kind === "puzzle") openPuzzle(state.target.item);
        else useDoor(state.target.door);
      }
    } else {
      controller.syncCamera();
    }

    if (state.consequence && stage.elapsed > state.consequenceUntil) {
      state.consequence = null;
    }

    // Door leaves swing open once unlocked.
    doors.forEach((door) => {
      const wanted = door.locked ? 0 : 1;
      if (door.openProgress !== wanted) {
        door.openProgress += (wanted - door.openProgress) * Math.min(1, dt * 3);
        door.leaf.rotation.y = -door.openProgress * 1.5;
        door.leaf.position.z = -door.openProgress * 0.75;
      }
    });

    for (let i = 0; i < animated.length; i++) {
      const item = animated[i];
      item.phase += dt;
      if (item.kind === "ring") {
        item.object.rotation.z += dt * 1.6;
        const scale = 1 + Math.sin(item.phase * 2.8) * 0.12;
        item.object.scale.set(scale, scale, 1);
      } else if (item.kind === "flames") {
        item.object.children.forEach((flame, index) => {
          flame.scale.y = 1.0 + Math.sin(item.phase * 7 + index) * 0.35;
          flame.rotation.z = Math.sin(item.phase * 4 + index) * 0.16;
        });
      } else if (item.kind === "worker") {
        item.object.rotation.y += Math.sin(item.phase * 0.8) * dt * 0.1;
      }
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

  return {
    input,

    setPaused(value) {
      state.paused = !!value;
      stage.setPaused(!!value);
      input.setEnabled(!value && !state.dialogOpen);
    },

    dispose() {
      input.dispose();
      stage.dispose();
    },

    // Test seam used by tests/arena-games.test.mjs. Not used by the app.
    __test: { state, controller, interactables, doors, rooms },
  };
}

export default { ...meta, create };
