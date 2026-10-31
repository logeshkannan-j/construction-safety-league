/* ------------------------------------------------------------------ *
 *  GAME 4 — SAFETY ESCAPE CHALLENGE
 *
 *  A five-area escape route through a newly fitted-out floor. Each area
 *  holds one real safety decision; get it right and the door to the
 *  next area unlocks. Get it wrong and you lose score AND clock, and
 *  the game tells you exactly what would have happened to you.
 *
 *  The interior is deliberately WHITE and brightly lit. The original
 *  near-black scheme looked atmospheric on a desktop monitor and was
 *  unplayable on a phone in daylight.
 *
 *  Uses the same first-person controller as the Safety Mission
 *  Simulator, so it plays identically with WASD + mouse or with the
 *  virtual joystick and touch look.
 * ------------------------------------------------------------------ */

import * as THREE from "three";
import { createStage, addIndoorLight, addSky, createZoom } from "../../engine/gfx.js";
import { createInput } from "../../engine/input.js";
import { createTopView } from "../../engine/topview.js";
import { shot } from "../../engine/demoTour.js";
import { createFirstPerson } from "../../engine/fpsController.js";
import {
  createMaterials, createGeometries, box, cylinder, collider,
  buildGround, buildSign, buildFireExtinguisher, buildElectricalPanel,
  buildMaterialPallet, buildDebris, buildCableRun, buildPuddle, buildLadder,
  buildGuardrail, buildScaffold, buildPPEStation, buildWorker, buildCone, buildBarrier,
  buildZoneMarker, buildAriaMark, buildBrandedTower, poseWorker,
} from "../../engine/kit.js";
import { sfx } from "../../audio.js";
import { PUZZLES, SCORING, AREA_ORDER } from "./puzzles.js";

/* ============================== metadata ============================== */

export const meta = {
  id: "escape-challenge",
  controls: "move-look-interact",

  briefing: {
    role:
      "You are alone in a newly fitted-out floor of Casagrand Aria when the fire alarm sounds. " +
      "The way out runs through five areas, and each one holds a decision.",
    objectives: [
      "Work through the building: electrical room, construction floor, plant room, scaffold access, exit lobby.",
      "In each area, find the interactive point and make the right safety decision.",
      "A correct decision unlocks the door to the next area.",
      "A wrong decision costs you score and 25 seconds of a clock you cannot afford.",
      "In the plant room, pick an extinguisher off the rack, carry it to the fire and discharge it.",
      "Open the final exit, then WALK INTO the marked assembly area outside. The door is not the finish line.",
    ],
    scoring: [
      { label: "Area solved first time", value: "+250" },
      { label: "Area solved after a mistake", value: "+120" },
      { label: "Wrong decision", value: "-60 and -25s" },
      { label: "Escaped the building", value: "+600" },
      { label: "Time remaining", value: "+3 / second" },
    ],
    tips: [
      "Isolate the circuit you need, not the whole building — emergency lighting runs on it too.",
      "Extinguisher class matters more than extinguisher size — and you have to carry it there yourself.",
      "You are not safe when you are outside. You are safe when you are at the muster point.",
      "A red scaffold tag means do not use, even in an evacuation.",
      "Raising the alarm protects everyone still inside. Do it before you leave.",
    ],
  },

  desktopControls: [
    ["W A S D", "Move through the building"],
    ["Mouse", "Look around (click once to capture the mouse)"],
    ["Shift", "Run"],
    ["V", "First person or over the shoulder"],
    ["E", "Interact — decision point, door, extinguisher, or discharge it"],
    ["Wheel / Z", "Zoom in to read a sign or a tag from across the room"],
    ["T", "Plan view — the floor from above, as an escape plan"],
    ["Esc", "Pause"],
  ],
  mobileControls: [
    ["Joystick", "Move — bottom-left of the screen"],
    ["Drag right", "Look around while moving"],
    ["INTERACT", "Use a decision point, door or extinguisher"],
    ["RUN", "Hold to move faster"],
    ["VIEW", "Watch yourself from behind, or look through your own eyes"],
    ["Pinch / ZOOM", "Zoom in to read a sign or a tag"],
    ["PLAN VIEW", "Look down on the floor plan and find your way out"],
    ["Pause", "Top-right of the HUD"],
  ],
};

const BASE_SECONDS = 600;
const WALL_HEIGHT = 3.2;
const WALL_THICK = 0.3;

/* ============================== the rooms ============================== */

// Each area is a rectangle. Doors sit in the +x wall and lead to the
// next area, so the building reads as a route rather than a maze.
// Five areas, laid end to end so the building reads as a route out.
// (The old "Basement" and "Stores" rooms were removed — see puzzles.js
// for why. The remaining five are renumbered and shifted up to start
// at the origin.)
const ROOMS = [
  { key: "electrical", x0: -6, x1: 8, z0: -5, z1: 5, floor: 0, label: "Electrical room" },
  { key: "ppe", x0: 10, x1: 28, z0: -8, z1: 8, floor: 0, label: "Construction floor" },
  { key: "fire", x0: 30, x1: 44, z0: -5, z1: 5, floor: 0, label: "Plant room" },
  { key: "signage", x0: 46, x1: 64, z0: -8, z1: 8, floor: 0, label: "Scaffold access" },
  { key: "alarm", x0: 66, x1: 80, z0: -5, z1: 5, floor: 0, label: "Exit lobby" },
];

/* ============================== the game ============================== */

export function create({ container, difficulty, quality, settings, mobile, api }) {
  const stage = createStage(container, { quality, fov: mobile ? 78 : 74 });
  const { scene, camera, cfg } = stage;
  const mat = createMaterials(cfg);
  const geo = createGeometries(cfg);

  const colliders = [];
  const animated = [];
  // The plant-room fire and the extinguishers the player can carry to it.
  const extinguishers = [];
  let fire = null;
  // The marked zone out in the yard that ends the run on contact.
  let finishZone = null;

  /* --------------------------- environment --------------------------- */

  // A bright, white-walled building. The old scheme was near-black with
  // heavy fog, which read as atmospheric on a desktop monitor and as an
  // unplayable dark smear on a phone in daylight — you could not see the
  // walls, let alone the extinguisher rack.
  //
  // White plasterboard, bright daylight through the openings, and only a
  // light haze: everything the player has to find is now legible.
  addSky(scene, cfg, { top: "#BFD6E8", bottom: "#F2F5F7", fogColor: "#E8EDF1" });
  addIndoorLight(scene, cfg, { color: 0xfff6e8, intensity: 1.45 });
  scene.add(buildGround(mat, 320));
  if (scene.fog) {
    // Enough haze to give depth, not enough to hide an exit sign.
    scene.fog.near = 22;
    scene.fog.far = 110;
    scene.fog.color = new THREE.Color("#E8EDF1");
  }

  // A soft fill from above so the white surfaces do not go flat grey in
  // the corners, and a cool bounce from below to keep them clean.
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcdd8e0, 1.05));

  /* ----------------------------- geometry ----------------------------- */

  // Held so the overhead view can hide them and show the floor as an
  // evacuation plan — which is the only way an aerial of an interior
  // shows anything at all.
  const ceilings = [];

  function addWall(x, z, w, d, { material = mat.plaster, height = WALL_HEIGHT, solid = true } = {}) {
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
    const floorMesh = box(geo, mat.screed,
      room.x1 - room.x0, 0.3, room.z1 - room.z0,
      (room.x0 + room.x1) / 2, -0.15, centreZ);
    scene.add(floorMesh);

    // Ceiling, so the space feels like a room.
    const ceiling = box(geo, mat.plasterCeiling,
      room.x1 - room.x0, 0.3, room.z1 - room.z0,
      (room.x0 + room.x1) / 2, WALL_HEIGHT + 0.15, centreZ);
    scene.add(ceiling);
    ceilings.push(ceiling);

    // Skirting, and a strip light down the middle of each room. Both are
    // what stop a white box from reading as an empty white box.
    [room.z0, room.z1].forEach((wz) => {
      scene.add(box(geo, mat.skirting, room.x1 - room.x0, 0.12, 0.06,
        (room.x0 + room.x1) / 2, 0.06, wz + (wz === room.z0 ? 0.18 : -0.18), { shadow: false }));
    });
    const lightRuns = Math.max(1, Math.round((room.x1 - room.x0) / 7));
    for (let i = 0; i < lightRuns; i++) {
      const lx = room.x0 + ((i + 0.5) * (room.x1 - room.x0)) / lightRuns;
      scene.add(box(geo, mat.white, 2.6, 0.08, 0.22, lx, WALL_HEIGHT - 0.08, centreZ, { shadow: false }));
    }

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

    // Exit sign above every door, so the signed route is always the one
    // the player can see from anywhere in the room.
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

  function addInteractable({ key, position, radius = 2.6, label, onUse, manual = false }) {
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
      manual,
      done: false,
    };
    interactables.push(item);
    return item;
  }

  /* ---- Area 1: electrical room ---- */
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

  /* ---- Area 2: construction floor ---- */
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

  /* ---- Area 3: plant room ---- */
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

    // The four extinguishers on the wall. Each one is picked up
    // individually and carried to the fire — the player physically
    // chooses, rather than reading four lines in a dialog.
    const classes = [
      ["water", mat.red, "Water"],
      ["foam", mat.white, "Foam"],
      ["co2", mat.black, "CO2"],
      ["wet", mat.yellow, "Wet chemical"],
    ];
    classes.forEach(([id, bodyMat, label], i) => {
      const ext = buildFireExtinguisher(geo, mat, { onStand: false, cls: id });
      const ex = room.x0 + 2.4 + i * 1.6;
      const ez = room.z0 + 0.8;
      ext.position.set(ex, 0.5, ez);
      scene.add(ext);
      const tag = buildSign(geo, mat, { text: label, kind: "info", height: 1.6, width: 0.45, post: false });
      tag.position.set(ex, 0, room.z0 + 0.55);
      tag.rotation.y = Math.PI;
      scene.add(tag);
      scene.add(box(geo, bodyMat, 0.3, 0.1, 0.1, ex, 1.3, room.z0 + 0.7, { shadow: false }));

      extinguishers.push({
        cls: id, label, object: ext,
        home: new THREE.Vector3(ex, 0.5, ez),
        position: new THREE.Vector3(ex, 1.0, ez + 0.6),
      });
    });

    // The fire itself is the interaction point once something is carried.
    fire = {
      position: new THREE.Vector3(room.x1 - 4.0, 1.4, room.centreZ),
      flames,
      smoke,
      out: false,
      discharging: 0,
    };

    // The plant room is played out, not answered, so this entry exists
    // only to keep the route checklist and the solved count consistent
    // with the other six areas. `manual` keeps findTarget off it.
    addInteractable({
      key: "fire",
      position: { x: room.x1 - 4.0, z: room.centreZ },
      label: "Put the fire out",
      manual: true,
    });
  }

  /* ---- Area 4: scaffold access ---- */
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

  /* ---- Area 5: exit lobby ---- */
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

  // The developer's name on the exit lobby wall, as it would be in the
  // finished building. It is the one point in this mission where the
  // player is standing INSIDE the development, so it is worth saying so.
  {
    const lobby = rooms[rooms.length - 1];
    const wallZ = lobby.z0 + 0.2;

    const plate = new THREE.Mesh(geo.plane, mat.brandPlate);
    plate.scale.set(2.2, 2.2, 1);
    plate.position.set(lobby.x0 + 5.5, 1.9, wallZ);
    scene.add(plate);

    const lobbyMark = buildAriaMark(geo, mat, { size: 1.5, depth: 0.12 });
    lobbyMark.group.position.set(lobby.x0 + 9.4, 1.9, wallZ + 0.1);
    scene.add(lobbyMark.group);
  }

  // Beyond the final door: daylight and the muster point, so the exit
  // is visibly somewhere rather than a wall.
  {
    const last = rooms[rooms.length - 1];
    const yardX = last.x1 + 10;
    // Sat with its top face at exactly y = 0, the same plane as the site
    // ground, which z-fought across the whole yard. Lifted clear.
    scene.add(box(geo, mat.ground, 40, 0.2, 40, yardX + 6, 0.04, last.centreZ));
    const musterSign = buildSign(geo, mat, { text: "Muster point A", kind: "emergency", height: 2.6, width: 1.3 });
    musterSign.position.set(yardX + 4, 0, last.centreZ);
    scene.add(musterSign);

    // The development itself, standing in the yard beyond the muster
    // point. This floor is one of its floors, so getting out of the
    // building is also the moment the player sees what they are
    // building — which is the whole reason this mission is set here.
    const development = buildBrandedTower(geo, mat, { x: 165, z: last.centreZ, rotY: -Math.PI / 2 });
    scene.add(development.group);
    [[-3, -3], [-3, 3], [3, -3]].forEach(([ox, oz]) => {
      const worker = buildWorker(geo, mat, { helmet: true, vest: true, pose: "stand" });
      worker.position.set(yardX + 6 + ox, 0, last.centreZ + oz);
      worker.rotation.y = Math.random() * 6;
      scene.add(worker);
      animated.push({ kind: "worker", object: worker, phase: Math.random() * 6 });
    });

    /* ---- the finish zone ----
     * Reaching safety is walking to the muster point and standing in it,
     * not pressing a key on a door. The zone is marked on the ground,
     * lit, and triggers the moment the player steps inside it.
     */
    const zx = yardX + 6;
    const zz = last.centreZ;
    const half = 3.4;

    const pad = buildZoneMarker(mat, { rect: [half * 2, half * 2], ok: true });
    pad.position.set(zx, 0.04, zz);
    scene.add(pad);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(half, 0.12, 6, 32),
      new THREE.MeshBasicMaterial({ color: 0x33c481, transparent: true, opacity: 0.9, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(zx, 0.08, zz);
    scene.add(ring);

    // Chevrons on the ground leading from the final door into the zone.
    for (let i = 0; i < 6; i++) {
      scene.add(box(geo, mat.green, 0.9, 0.02, 0.26,
        last.x1 + 2 + i * 1.5, 0.012, zz, { shadow: false }));
    }

    const zoneSign = buildSign(geo, mat, { text: "ASSEMBLY AREA", kind: "emergency", height: 3.0, width: 1.5 });
    zoneSign.position.set(zx, 0, zz - half - 0.8);
    scene.add(zoneSign);

    finishZone = { x: zx, z: zz, half, ring };
  }

  /* ============================== player ============================== */

  const firstRoom = rooms[0];
  const input = createInput(container, {
    pointerLock: !mobile,
    onPause: () => api.requestPause(),
    keymap: { KeyZ: "zoom" },
  });
  input.setSensitivity(settings.lookSensitivity ?? 1);
  input.setInvertY(!!settings.invertY);

  // Wheel on desktop, pinch on a phone, Z or the ZOOM button to toggle.
  // A first-person camera narrows its lens rather than pulling back,
  // because pulling back would put the camera inside a wall.
  const zoom = createZoom(camera, input, { baseFov: camera.fov, minFov: 26 });

  const controller = createFirstPerson(camera, input, {
    colliders,
    spawn: { x: firstRoom.x0 + 2, y: 0, z: firstRoom.centreZ },
    // Facing +x, down the route.
    yaw: -Math.PI / 2,
    canJump: false,
    onStep: () => sfx.step(),
  });

  /* ----------------------------- the player -----------------------------
   * The person the player IS. Hidden in first person — you would be
   * looking at the inside of your own head — and shown the moment they
   * switch to over-the-shoulder. Walks when they walk, and carries the
   * extinguisher in front of them when they have one.
   */
  const avatar = buildWorker(geo, mat, {
    helmet: true, vest: true, boots: true, helmetColor: "orange",
  });
  avatar.visible = false;
  scene.add(avatar);
  let walkPhase = 0;

  function updateAvatar(dt) {
    const moving = controller.moving && !controller.state.frozen;
    walkPhase += dt * (controller.state.running ? 11 : 7.4) * (moving ? 1 : 0);
    avatar.position.set(controller.position.x, controller.position.y, controller.position.z);
    // The model faces +Z; the camera looks down -Z rotated by yaw.
    avatar.rotation.y = controller.yaw + Math.PI;
    avatar.visible = controller.thirdPerson;
    if (!avatar.visible) return;
    poseWorker(avatar, {
      phase: walkPhase,
      moving,
      // Both hands up on the extinguisher while carrying one.
      pose: state.carrying ? "work" : "stand",
    });
  }

  api.buttons([
    { id: "interact", label: "USE", action: "interact", mode: "tap", color: "#9B7CF2", primary: true },
    { id: "run", label: "RUN", action: "run", mode: "hold", color: "#33C481" },
    { id: "zoom", label: "ZOOM", action: "zoom", mode: "tap", color: "#59B7FF" },
    { id: "top", label: "PLAN VIEW", action: "topview", mode: "tap", color: "#33C481" },
    { id: "view", label: "VIEW", action: "viewmode", mode: "tap", color: "#59B7FF" },
  ]);

  // The floor seen from above, ceilings removed: a live escape plan of
  // the five areas and the way out. Steep, because the floor is a long
  // run of rooms rather than an open site.
  const planView = createTopView(camera, {
    scene,
    center: new THREE.Vector3(37, 0, 0),
    distance: 82, minDistance: 38, maxDistance: 130,
    pitch: 1.30, minPitch: 0.80, maxPitch: 1.50,
  });

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
    // The plant room is played out rather than answered: pick an
    // extinguisher up, carry it to the fire, discharge it.
    carrying: null,
    fireAttempts: 0,
    doorsOpen: false,
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
      if (item.done || item.manual) continue;
      toTarget.copy(item.position).sub(camera.position);
      const distance = toTarget.length();
      if (distance > item.radius) continue;
      toTarget.normalize();
      const facing = toTarget.dot(lookDir);
      if (facing < 0.1) continue;
      const rank = facing * 2 - distance / item.radius;
      if (rank > bestRank) { bestRank = rank; best = { kind: "puzzle", item }; }
    }

    // Extinguishers on the rack — only worth offering while the fire is
    // alight and the player's hands are empty.
    if (fire && !fire.out && !state.carrying) {
      for (const ext of extinguishers) {
        toTarget.copy(ext.position).sub(camera.position);
        const distance = toTarget.length();
        if (distance > 2.6) continue;
        toTarget.normalize();
        const facing = toTarget.dot(lookDir);
        if (facing < 0.2) continue;
        const rank = facing * 2 - distance / 2.6;
        if (rank > bestRank) { bestRank = rank; best = { kind: "pickup", ext }; }
      }
    }

    // The fire, once something is being carried to it.
    if (fire && !fire.out && state.carrying) {
      toTarget.copy(fire.position).sub(camera.position);
      const distance = toTarget.length();
      if (distance <= 4.2) {
        toTarget.normalize();
        const facing = toTarget.dot(lookDir);
        if (facing > 0.2) {
          const rank = facing * 2 - distance / 4.2 + 1;  // prefer the fire
          if (rank > bestRank) { bestRank = rank; best = { kind: "fire" }; }
        }
      }
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
      // The door is only the way out. Being SAFE is reaching the muster
      // point, so the run finishes when the player stands in the zone.
      state.doorsOpen = true;
      sfx.doorOpen();
      api.toast("You're outside. Get to the assembly area — follow the green markers.", "info");
    }
  }

  /* ------------------------ the plant room fire ------------------------ */

  // Carrying an extinguisher: it rides in front of the camera so the
  // player can see which one they picked up.
  let carriedModel = null;

  function pickUpExtinguisher(ext) {
    if (state.carrying || !fire || fire.out) return;
    state.carrying = ext;
    ext.object.visible = false;

    carriedModel = buildFireExtinguisher(geo, mat, { onStand: false, cls: ext.cls });
    carriedModel.scale.setScalar(0.62);
    // Held low and to the right, the way you actually carry one.
    carriedModel.position.set(0.42, -0.52, -0.85);
    carriedModel.rotation.set(-0.15, 0.35, 0.12);
    carriedModel.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    // The camera must be in the scene graph for its children to render.
    if (!camera.parent) scene.add(camera);
    camera.add(carriedModel);

    sfx.interact();
    api.toast(`${ext.label} extinguisher picked up. Take it to the fire and discharge it.`, "info");
  }

  function dropCarried() {
    if (!state.carrying) return;
    state.carrying.object.visible = true;
    state.carrying = null;
    if (carriedModel) {
      camera.remove(carriedModel);
      carriedModel = null;
    }
  }

  function dischargeAtFire() {
    if (!state.carrying || !fire || fire.out || fire.discharging > 0) return;
    const ext = state.carrying;
    const puzzle = PUZZLES.fire;
    const option = puzzle.options.find((o) => o.id === ext.cls);

    if (option?.correct) {
      fire.discharging = 1;          // the loop runs the knock-down
      sfx.interact();
      api.toast("Discharging — sweep the base of the fire.", "info");
      return;
    }

    // Wrong medium on live electrics: it flares, and it costs.
    state.fireAttempts += 1;
    state.mistakes += 1;
    state.score += SCORING.wrong;
    state.remainingMs = Math.max(0, state.remainingMs - SCORING.wrongTimePenaltyMs);
    state.lessons.push(option?.feedback || "Wrong extinguisher for a live electrical fire.");
    state.consequence = option?.consequence || "The fire flared up.";
    state.consequenceUntil = stage.elapsed + 2.6;
    sfx.wrong();
    sfx.alarm();
    api.toast(option?.feedback || "Wrong medium for this fire.", "bad", SCORING.wrong);
    api.toast("Put it back and get the right one. 25 seconds lost.", "warn");

    // The extinguisher is spent — it goes back on the rack empty, and
    // the player has to walk back and choose again.
    dropCarried();
    if (state.remainingMs <= 0) finish(false);
  }

  function fireIsOut() {
    fire.out = true;
    fire.flames.visible = false;
    fire.smoke.visible = false;
    dropCarried();

    const item = interactables.find((i) => i.key === "fire");
    const points = state.fireAttempts === 0 ? SCORING.firstTry : SCORING.afterMistake;
    state.score += points;
    state.solved += 1;
    if (state.fireAttempts === 0) state.firstTryCount += 1;
    if (item) { item.done = true; if (item.marker) item.marker.visible = false; }
    unlockDoor("fire");
    sfx.correct();
    api.toast("Fire out. CO2 is non-conductive and leaves no residue on electrical gear.", "good", points);
    api.toast("Plant room clear — the door is open.", "info");
    state.currentArea = Math.min(AREA_ORDER.length - 1, AREA_ORDER.indexOf("fire") + 1);
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
    } else if (target?.kind === "pickup") {
      prompt = { text: mobile ? `Tap USE — take the ${target.ext.label} extinguisher` : `Press E — take the ${target.ext.label} extinguisher`, tone: "good", key: "E" };
    } else if (target?.kind === "fire") {
      prompt = { text: mobile ? `Tap USE — discharge the ${state.carrying?.label} extinguisher` : `Press E — discharge the ${state.carrying?.label} extinguisher`, tone: "good", key: "E" };
    } else if (state.carrying && fire && !fire.out) {
      prompt = { text: `Carrying the ${state.carrying.label} extinguisher — get to the fire`, tone: "normal", key: "" };
    } else if (fire && !fire.out && state.currentArea === AREA_ORDER.indexOf("fire")) {
      prompt = { text: "Take an extinguisher off the rack", tone: "normal", key: "" };
    } else if (state.doorsOpen && !state.escaped) {
      prompt = { text: "Walk into the assembly area", tone: "good", key: "" };
    } else if (target?.kind === "door") {
      prompt = target.door.locked
        ? { text: "Secured — solve this area first", tone: "bad", key: "E" }
        : { text: target.door.isFinal ? (mobile ? "Tap USE to open the final exit" : "Press E to open the final exit") : "Open", tone: "good", key: "E" };
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
      carrying: state.carrying ? state.carrying.label : null,
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

    // Zoom eases every frame, including while a dialog is open, so the
    // lens never snaps when control comes back.
    zoom.update(dt);

    if (!state.finished) {
      state.remainingMs -= dt * 1000;
      if (state.remainingMs <= 0) {
        state.remainingMs = 0;
        finish(false);
      }
    }

    if (!state.dialogOpen && !state.finished && input.wasPressed("topview")) {
      planView.toggle();
      sfx.click();
    }

    // Cut the ceilings away for the plan view and put them back on the
    // way down. Done a third of the way up rather than the instant the
    // button is pressed, so the roof is not yanked off over the
    // player's head while the camera is still at eye level.
    const wantCeilings = planView.blend < 0.3;
    if (ceilings.length && ceilings[0].visible !== wantCeilings) {
      ceilings.forEach((c) => { c.visible = wantCeilings; });
    }

    if (!state.dialogOpen && !state.finished && !planView.active) {
      controller.update(dt);
      if (input.wasPressed("viewmode")) { controller.setThirdPerson(!controller.thirdPerson); sfx.click(); }
      if (input.wasPressed("zoom")) { zoom.toggle(); sfx.click(); }
      state.target = findTarget();
      if (state.target && input.wasPressed("interact")) {
        if (state.target.kind === "puzzle") openPuzzle(state.target.item);
        else if (state.target.kind === "pickup") pickUpExtinguisher(state.target.ext);
        else if (state.target.kind === "fire") dischargeAtFire();
        else useDoor(state.target.door);
      }
    } else {
      controller.syncCamera();
    }

    updateAvatar(dt);
    planView.update(dt, input, () => controller.syncCamera());

    if (state.consequence && stage.elapsed > state.consequenceUntil) {
      state.consequence = null;
    }

    /* ---- the fire being knocked down ---- */
    if (fire && !fire.out && fire.discharging > 0) {
      fire.discharging = Math.max(0, fire.discharging - dt / 2.2);
      const left = fire.discharging;
      fire.flames.scale.setScalar(Math.max(0.001, left));
      fire.smoke.scale.setScalar(Math.max(0.001, 0.6 + left * 0.8));
      fire.smoke.material.opacity = 0.3 * left;
      if (carriedModel) {
        // A visible discharge from the horn while the trigger is held.
        carriedModel.rotation.x = -0.35 - Math.sin(stage.elapsed * 30) * 0.03;
      }
      if (left <= 0) fireIsOut();
    }

    /* ---- reaching the assembly area ---- */
    if (finishZone && !state.escaped && !state.finished) {
      const p = controller.position;
      if (Math.abs(p.x - finishZone.x) < finishZone.half
        && Math.abs(p.z - finishZone.z) < finishZone.half) {
        state.escaped = true;
        state.score += SCORING.escaped;
        sfx.missionComplete();
        api.toast("You reached the assembly area.", "good", SCORING.escaped);
        finish(true);
      }
      // Pulse the ring so it reads as live.
      finishZone.ring.scale.setScalar(1 + Math.sin(stage.elapsed * 3) * 0.03);
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

  /* ------------------------------- demo -------------------------------
   * This mission is indoors, so the demo is the PLAN view: the site
   * view hides the ceilings once it is a third of the way up, and the
   * tour then walks the escape route from the first area to the muster
   * point, one room at a time, as a live evacuation plan.
   *
   * It stays steep throughout for that reason. A low shot inside a
   * building with its roof removed looks through the walls. */
  const planShot = (x, z, seconds, step, distance = 34) =>
    shot({ x, y: 0, z }, { yaw: 0, pitch: 1.30, distance, seconds, step });

  const demoTour = [
    // The whole floor first, so the route is legible before the detail.
    planShot((rooms[0].x0 + rooms[rooms.length - 1].x1) / 2, 0, 7, 0, 86),
    ...rooms.map((room, i) => planShot(
      (room.x0 + room.x1) / 2, room.centreZ,
      6, Math.min(i + 1, 3), 30
    )),
    // Out of the building and across to the muster point.
    planShot(rooms[rooms.length - 1].x1 + 16, 0, 7, 3, 42),
    planShot((rooms[0].x0 + rooms[rooms.length - 1].x1) / 2, 0, 7, 4, 90),
  ];

  return {
    input,
    siteView: planView,
    demoTour,

    setPaused(value) {
      state.paused = !!value;
      stage.setPaused(!!value);
      input.setEnabled(!value && !state.dialogOpen);
    },

    dispose() {
      planView.dispose();
      input.dispose();
      stage.dispose();
    },

    // Test seam used by tests/arena-games.test.mjs. Not used by the app.
    __test: {
      zoomFov: () => camera.fov,
      state, controller, interactables, doors, rooms, ceilings, avatar,
      get planBlend() { return planView.blend; },
      get fire() { return fire; },
      get finishZone() { return finishZone; },
      extinguishers,
    },
  };
}

export default { ...meta, create };
