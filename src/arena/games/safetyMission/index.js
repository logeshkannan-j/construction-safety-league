/* ------------------------------------------------------------------ *
 *  GAME 1 — SAFETY MISSION SIMULATOR
 *
 *  A walk-around 3D construction site where the player is the site
 *  safety officer. Ten real hazards are planted across the site; each
 *  one must be found, classified and corrected before the shift clock
 *  runs out.
 *
 *  Fully playable on desktop (WASD + mouse look + E) and on phones /
 *  tablets (virtual joystick + touch look + INSPECT), because both feed
 *  the same engine input object.
 * ------------------------------------------------------------------ */

import * as THREE from "three";
import { createStage, addDaylight, addSky, createZoom } from "../../engine/gfx.js";
import { createInput } from "../../engine/input.js";
import { createTopView } from "../../engine/topview.js";
import { shot, establishingShot, closingShot } from "../../engine/demoTour.js";
import { createFirstPerson, ladderVolume } from "../../engine/fpsController.js";
import {
  createMaterials, createGeometries, box, cylinder, collider,
  buildGround, buildHoarding, buildBrandBanners, buildBrandedTower, buildConcreteFrame, buildGuardrail, buildScaffold,
  buildLadder, buildTowerCrane, updateHoistRope, buildWorker, buildCone,
  buildBarrier, buildSign, buildFireExtinguisher, buildElectricalPanel,
  buildExcavation, buildMaterialPallet, buildDebris, buildCableRun, buildPuddle,
  buildPPEStation, buildMaterialHoist, buildZoneMarker, buildSiteHut, makeHighlight, poseWorker,
} from "../../engine/kit.js";
import { sfx } from "../../audio.js";
import { HAZARDS, SCORING, categoryOptions, actionOptions } from "./hazards.js";

/* ============================== metadata ============================== */

export const meta = {
  id: "safety-mission",
  controls: "move-look-interact",

  briefing: {
    role:
      "You are the site safety officer on a four-storey residential build. The site manager has " +
      "asked for a full hazard walk before the afternoon shift starts.",
    objectives: [
      "Walk the whole site — ground level, the upper floors and the scaffold.",
      "Find all ten planted hazards. They are real defects, not hidden objects.",
      "Classify each hazard correctly when you report it.",
      "Choose the correct corrective action for each one.",
      "Finish before the shift clock runs out to earn the time bonus.",
    ],
    scoring: [
      { label: "Correct hazard classification", value: "+100" },
      { label: "Correct corrective action", value: "+150" },
      { label: "Wrong answer", value: "-50" },
      { label: "All ten hazards reported", value: "+500" },
      { label: "Mission completed", value: "+300" },
      { label: "Time remaining", value: "+3 / second" },
    ],
    tips: [
      "Hazards sit at head height and at your feet — look up at the scaffold and down at the walkways.",
      "The stair core is in the north-east corner of the building. You need the upper floors.",
      "Classify first, then act. A right action for the wrong reason still loses marks.",
      "Walking off an unprotected edge counts as a fall. In real life that is a fatality.",
      "Trainee difficulty marks each hazard with a beacon until you have reported it.",
    ],
  },

  desktopControls: [
    ["W A S D", "Walk around the site"],
    ["Mouse", "Look around (click once to capture the mouse)"],
    ["Shift", "Run"],
    ["Space", "Jump"],
    ["C", "Crouch"],
    ["V", "First person or over the shoulder"],
    ["E", "Inspect and report the hazard you are standing at"],
    ["Wheel / Z", "Zoom in to look closer across the site"],
    ["T", "Top view — lift off the ground and see the whole site"],
    ["Esc", "Pause the mission"],
  ],
  mobileControls: [
    ["Joystick", "Walk — bottom-left of the screen, full 360° analogue"],
    ["Drag right", "Look around, at the same time as moving"],
    ["INSPECT", "Report the hazard you are standing at"],
    ["TOP VIEW", "See the whole site from the air — drag to swing around it"],
    ["VIEW", "Watch yourself from behind, or look through your own eyes"],
    ["Pinch / ZOOM", "Zoom in to look closer"],
    ["RUN", "Hold to move faster"],
    ["JUMP", "Jump"],
    ["Pause", "Top-right of the HUD"],
  ],
};

/* ============================ world layout ============================ */

const SITE = { width: 92, depth: 72 };
const BUILDING = { x: -10, z: 10, width: 18, depth: 14, floors: 4, floorHeight: 3.4 };
const BASE_MISSION_SECONDS = 420;

/* ============================== the game ============================== */

export function create({ container, difficulty, quality, settings, mobile, api }) {
  const stage = createStage(container, { quality, fov: mobile ? 76 : 72 });
  const { scene, camera, cfg } = stage;
  const mat = createMaterials(cfg);
  const geo = createGeometries(cfg);

  const colliders = [];
  const ladders = [];
  const pits = [];
  // Objects that get animated every frame (idle workers, beacons).
  const animated = [];

  /* --------------------------- environment --------------------------- */

  addSky(scene, cfg, { top: "#2B6CA3", bottom: "#C9DFEE", fogColor: "#C2D8E8" });
  const sun = addDaylight(scene, cfg, { intensity: 2.0, shadowRadius: 46 });
  // The excavation is a REAL hole: its footprint is cut out of the
  // ground sheet, so the trench is visible from across the site instead
  // of being hidden under a solid plane.
  const EXC = { x: 18, z: 24, width: 9, depth: 4.5, trenchDepth: 2.2 };
  scene.add(buildGround(mat, 260, {
    holes: [{ x: EXC.x, z: EXC.z, w: EXC.width, d: EXC.depth }],
  }));

  const hoarding = buildHoarding(geo, mat, {
    width: SITE.width, depth: SITE.depth, height: 2.4, gateAt: "north",
  });
  scene.add(hoarding.group);
  scene.add(buildBrandBanners(geo, mat, { width: 92, depth: 72 }));
  // The tower this site is building — Casagrand Aria, 19 floors.
  scene.add(buildBrandedTower(geo, mat, { x: -26, z: -48, rotY: 0.18 }).group);
  colliders.push(...hoarding.colliders);

  /* ---------------------------- building ---------------------------- */

  // Floor 1 carries a genuine hole in the slab — the player can fall
  // through it until they fit a cover, which is the whole point.
  const FLOOR_OPENING = { floor: 1, x: -5, z: 3, w: 1.8, d: 1.8 };

  const frame = buildConcreteFrame(geo, mat, {
    ...BUILDING,
    openings: [FLOOR_OPENING],
  });
  scene.add(frame.group);
  colliders.push(...frame.colliders);

  const floorOpeningWorld = {
    x: BUILDING.x + FLOOR_OPENING.x,
    z: BUILDING.z + FLOOR_OPENING.z,
    y: frame.floors[1].y,
  };

  // Edge protection: most upper edges are railed, but the SOUTH edge of
  // Level 2 is deliberately open — that is where the unclipped operative
  // is working.
  frame.floors.forEach((floor, index) => {
    if (index === 0) return;
    Object.entries(floor.edges).forEach(([side, edge]) => {
      if (index === 2 && side === "south") return; // the open edge
      const rail = buildGuardrail(mat, {
        x: edge.axis === "x" ? edge.x : edge.x + (side === "west" ? 0.12 : -0.12),
        y: floor.y,
        z: edge.axis === "x" ? edge.z + (side === "north" ? 0.12 : -0.12) : edge.z,
        length: edge.length,
        axis: edge.axis,
      });
      scene.add(rail);
    });
  });

  // Brick infill on the two lowest floors so the building reads as a
  // real build rather than a bare frame. A 7 m opening is left on the
  // north face in front of the stair flight, so the way in and the way
  // up are the first things the player sees.
  const INFILL_Z = BUILDING.z - BUILDING.depth / 2 + 0.2;
  const infillFromX = BUILDING.x - 2;
  const infillToX = BUILDING.x + BUILDING.width / 2 - 0.6;
  const infillWidth = infillToX - infillFromX;
  [0, 1].forEach((f) => {
    const y = frame.floors[f].y;
    scene.add(box(geo, mat.brick, infillWidth, BUILDING.floorHeight - 0.4, 0.25,
      infillFromX + infillWidth / 2, y + BUILDING.floorHeight / 2, INFILL_Z));
    colliders.push(collider(infillFromX + infillWidth / 2, y + BUILDING.floorHeight / 2, INFILL_Z,
      infillWidth, BUILDING.floorHeight - 0.4, 0.25));
  });

  // Signage at the entrance and the foot of the stairs.
  const entranceSign = buildSign(geo, mat, { text: "Site entrance stairs ahead", kind: "info", height: 2.2, width: 0.9 });
  entranceSign.position.set(BUILDING.x - 4.5, 0, INFILL_Z - 1.6);
  scene.add(entranceSign);
  if (frame.stairs[0]) {
    const stairSign = buildSign(geo, mat, { text: "Hold the handrail", kind: "mandatory", height: 1.8, width: 0.6 });
    stairSign.position.set(frame.stairs[0].entry.x - 0.6, 0, frame.stairs[0].z + 1.9);
    scene.add(stairSign);
  }

  /* ---------------------------- scaffold ---------------------------- */

  const scaffold = buildScaffold(geo, mat, {
    x: BUILDING.x, y: 0, z: BUILDING.z - BUILDING.depth / 2 - 1.4,
    bays: 4, depth: 1.3, lifts: 4, liftHeight: 2,
    incompleteLift: 3, missingGuardrailLift: 2,
  });
  scene.add(scaffold.group);
  colliders.push(...scaffold.colliders);

  // The scaffold's access ladder, as a climbable volume.
  const scaffoldLadderX = BUILDING.x - scaffold.length / 2 + 0.4;
  const scaffoldLadderZ = BUILDING.z - BUILDING.depth / 2 - 1.4 + 1.3 / 2 - 0.15;
  ladders.push(ladderVolume({
    x: scaffoldLadderX, z: scaffoldLadderZ,
    baseY: 0, topY: scaffold.totalHeight,
    width: 1.3, depth: 1.3,
    exit: { x: scaffoldLadderX + 2, z: scaffoldLadderZ },
  }));

  /* ---------------------------- tower crane ---------------------------- */

  const crane = buildTowerCrane(geo, mat, { x: 24, z: -8, mastHeight: 34, jibLength: 38, counterJib: 13 });
  crane.group.position.set(24, 0, -8);
  scene.add(crane.group);
  colliders.push(collider(24, 0.6, -8, 6, 1.2, 6));

  // Park the suspended load directly over the pedestrian walkway, which
  // is hazard 5.
  const loadOffset = { x: -2, z: 10 };
  const loadRadius = Math.hypot(loadOffset.x, loadOffset.z);
  crane.parts.slew.rotation.y = Math.atan2(-loadOffset.z, loadOffset.x);
  crane.parts.trolley.position.x = loadRadius;
  crane.parts.hook.position.y = -(crane.spec.hookTopY - 4.6);
  updateHoistRope(crane.parts);

  const suspendedLoad = new THREE.Group();
  suspendedLoad.add(box(geo, mat.timberDark, 2.2, 0.16, 1.4, 0, -1.5, 0));
  for (let i = 0; i < 3; i++) {
    suspendedLoad.add(box(geo, mat.brick, 2.0, 0.24, 1.2, 0, -1.3 + i * 0.25, 0));
  }
  // Four slings up to the hook.
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) => {
    suspendedLoad.add(cylinder(geo, mat.steelDark, 0.03, 1.5, sx * 0.9, -0.75, sz * 0.55,
      { rotZ: sx * 0.5, low: true, shadow: false }));
  });
  crane.parts.hook.add(suspendedLoad);

  /* -------------------------- material hoist -------------------------- */

  const hoist = buildMaterialHoist(geo, mat, { height: 13, overloaded: true });
  hoist.position.set(BUILDING.x + BUILDING.width / 2 + 1.1, 0, BUILDING.z);
  scene.add(hoist);
  colliders.push(collider(hoist.position.x, 6.5, hoist.position.z, 1.2, 13, 1.2));

  /* ---------------------------- excavation ---------------------------- */

  const excavation = buildExcavation(geo, mat, {
    width: EXC.width, depth: EXC.depth, trenchDepth: EXC.trenchDepth,
    shored: false, edgeProtection: false,
  });
  excavation.group.position.set(EXC.x, 0, EXC.z);
  scene.add(excavation.group);

  // The trench is a genuine hole: the player can climb down into it and
  // must use the access ladder to get back out. Walking in from the
  // unbarriered edge is a real 2.2 m fall, which is exactly the lesson.
  pits.push({
    minX: EXC.x - EXC.width / 2 + 0.25, maxX: EXC.x + EXC.width / 2 - 0.25,
    minZ: EXC.z - EXC.depth / 2 + 0.25, maxZ: EXC.z + EXC.depth / 2 - 0.25,
    floorY: -EXC.trenchDepth + 0.05,
  });
  // Walls that enclose the trench floor, so the only way out is the
  // ladder. They stop at ground level, so they never block walking in.
  colliders.push(
    collider(EXC.x - EXC.width / 2 + 0.1, -EXC.trenchDepth / 2, EXC.z, 0.3, EXC.trenchDepth + 0.4, EXC.depth),
    collider(EXC.x + EXC.width / 2 - 0.1, -EXC.trenchDepth / 2, EXC.z, 0.3, EXC.trenchDepth + 0.4, EXC.depth),
    collider(EXC.x, -EXC.trenchDepth / 2, EXC.z - EXC.depth / 2 + 0.1, EXC.width, EXC.trenchDepth + 0.4, 0.3),
    collider(EXC.x, -EXC.trenchDepth / 2, EXC.z + EXC.depth / 2 - 0.1, EXC.width, EXC.trenchDepth + 0.4, 0.3)
  );
  // Access ladder inside the trench.
  const trenchLadder = buildLadder(geo, mat, { height: EXC.trenchDepth + 0.5, lean: 0 });
  trenchLadder.position.set(EXC.x - EXC.width / 2 + 1.1, -EXC.trenchDepth + 0.05, EXC.z);
  scene.add(trenchLadder);
  ladders.push(ladderVolume({
    x: EXC.x - EXC.width / 2 + 1.1, z: EXC.z,
    baseY: -EXC.trenchDepth + 0.05, topY: 0.2,
    width: 1.1, depth: 1.4,
    exit: { x: EXC.x - EXC.width / 2 - 1.5, z: EXC.z },
  }));

  // Spoil heaps give the trench a solid edge on one side so the player
  // naturally walks around rather than straight over it.
  colliders.push(collider(EXC.x, 0.4, EXC.z + EXC.depth / 2 + 1.4, EXC.width, 0.9, 1.8));

  /* -------------------------- electrical ---------------------------- */

  const badPanel = buildElectricalPanel(geo, mat, { unsafe: true });
  badPanel.position.set(-32, 0, -6);
  scene.add(badPanel);
  colliders.push(collider(-32, 1.1, -6, 1, 1.9, 0.4));

  const badCable = buildCableRun(geo, mat, { length: 7, damaged: true, onGround: true });
  badCable.position.set(-28, 0, -8);
  badCable.rotation.y = 0.5;
  scene.add(badCable);

  const goodPanel = buildElectricalPanel(geo, mat, { unsafe: false });
  goodPanel.position.set(-32, 0, 2);
  scene.add(goodPanel);
  colliders.push(collider(-32, 1.1, 2, 1, 1.9, 0.4));

  /* -------------------------- housekeeping -------------------------- */

  const debris = buildDebris(geo, mat, { spread: 4.2, count: 20 });
  debris.position.set(-2, 0, -14);
  scene.add(debris);
  const debrisCable = buildCableRun(geo, mat, { length: 6, damaged: false, onGround: true });
  debrisCable.position.set(-2, 0, -13);
  debrisCable.rotation.y = 1.2;
  scene.add(debrisCable);
  scene.add((() => { const p = buildPuddle(geo, mat, { radius: 1.3 }); p.position.set(-4.5, 0, -15.5); return p; })());

  /* ------------------------- blocked emergency exit ------------------------- */

  const exitGate = new THREE.Group();
  exitGate.add(box(geo, mat.steelDark, 0.2, 2.4, 3.6, 0, 1.2, 0));
  exitGate.add(box(geo, mat.green, 0.1, 1.9, 1.5, 0.16, 1.05, 0));
  const exitSign = buildSign(geo, mat, { text: "Emergency exit", kind: "emergency", height: 2.7, width: 1.1, post: false });
  exitSign.rotation.y = Math.PI / 2;
  exitSign.position.set(0.3, 0, 0);
  exitGate.add(exitSign);
  exitGate.position.set(-SITE.width / 2, 0, 18);
  scene.add(exitGate);
  colliders.push(collider(-SITE.width / 2, 1.2, 18, 0.3, 2.4, 3.6));

  // The obstruction: pallets and a bin dumped in front of the gate.
  const exitBlockage = new THREE.Group();
  const blockPallet1 = buildMaterialPallet(geo, mat, { type: "bags", rows: 3 });
  blockPallet1.position.set(1.6, 0, 0.4);
  blockPallet1.rotation.y = 0.3;
  exitBlockage.add(blockPallet1);
  const blockPallet2 = buildMaterialPallet(geo, mat, { type: "block", rows: 2 });
  blockPallet2.position.set(1.4, 0, -1.6);
  exitBlockage.add(blockPallet2);
  exitBlockage.add(box(geo, mat.orange, 1.5, 1.3, 1.1, 2.9, 0.65, 1.3));
  exitBlockage.position.set(-SITE.width / 2 + 1, 0, 18);
  scene.add(exitBlockage);
  // Kept by reference so clearing the route can remove exactly this
  // collider rather than searching the list by coordinates.
  const exitBlockageCollider = collider(-SITE.width / 2 + 2.4, 0.7, 18.4, 2.2, 1.4, 2.4);
  colliders.push(exitBlockageCollider);

  /* ---------------------------- site setup ---------------------------- */

  const ppeStation = buildPPEStation(geo, mat);
  ppeStation.position.set(-7, 0, -30);
  ppeStation.rotation.y = Math.PI;
  scene.add(ppeStation);
  colliders.push(collider(-7, 1.05, -30, 1.8, 2.1, 0.6));

  [[-36, -27, "blue"], [-36, -20, "green"], [-36, -13, "white"]].forEach(([hx, hz, color]) => {
    const hut = buildSiteHut(geo, mat, { color });
    hut.position.set(hx, 0, hz);
    hut.rotation.y = Math.PI / 2;
    scene.add(hut);
    colliders.push(collider(hx, 1.5, hz, 2.9, 3, 6.3));
  });

  // Material laydown area.
  [["block", 14, -24, 0.2], ["rebar", 18, -20, 1.1], ["pipe", 14, -19, 0], ["bags", 19, -25, 0.5], ["steel", 10, -26, 0.8]]
    .forEach(([type, px, pz, rot]) => {
      const pallet = buildMaterialPallet(geo, mat, { type, rows: 3 });
      pallet.position.set(px, 0, pz);
      pallet.rotation.y = rot;
      scene.add(pallet);
      colliders.push(collider(px, 0.4, pz, 2, 0.9, 2));
    });

  // Signage at the gate and around the site.
  [
    [-3, -33, 0, "PPE must be worn", "mandatory"],
    [3, -33, 0, "Site safety induction required", "info"],
    [10, -8, Math.PI / 2, "Crane working overhead", "warning"],
    [16, 19, 0, "Deep excavation keep clear", "warning"],
    [-24, 1, -Math.PI / 2, "Danger 415 volts", "warning"],
    [-20, -2, 0, "No unauthorised access", "prohibition"],
  ].forEach(([sx, sz, rot, text, kind]) => {
    const sign = buildSign(geo, mat, { text, kind });
    sign.position.set(sx, 0, sz);
    sign.rotation.y = rot;
    scene.add(sign);
  });

  // Cones and barriers for site furniture.
  for (let i = 0; i < 14; i++) {
    const cone = buildCone(geo, mat, {});
    const angle = (i / 14) * Math.PI * 2;
    cone.position.set(24 + Math.cos(angle) * 9, 0, -8 + Math.sin(angle) * 9);
    scene.add(cone);
  }
  [[-16, 6, 0], [-16, 14, 0], [6, -4, Math.PI / 2]].forEach(([bx, bz, rot]) => {
    const barrier = buildBarrier(geo, mat, { length: 2.4 });
    barrier.position.set(bx, 0, bz);
    barrier.rotation.y = rot;
    scene.add(barrier);
  });

  // Fire points.
  [[-5, -29], [-30, 6], [12, -16]].forEach(([fx, fz]) => {
    const ext = buildFireExtinguisher(geo, mat, { onStand: true });
    ext.position.set(fx, 0, fz);
    scene.add(ext);
  });

  // An unsecured ladder at a bad angle, as scenery that rewards looking.
  const looseLadder = buildLadder(geo, mat, { height: 4.2, lean: 0.07 });
  looseLadder.position.set(-22, 0, 16);
  looseLadder.rotation.y = 0.4;
  scene.add(looseLadder);

  /* ------------------------------ workers ------------------------------ */

  function placeWorker(opts, x, y, z, rotY) {
    const worker = buildWorker(geo, mat, opts);
    worker.position.set(x, y, z);
    worker.rotation.y = rotY || 0;
    scene.add(worker);
    animated.push({ kind: "worker", object: worker, phase: Math.random() * Math.PI * 2 });
    return worker;
  }

  // Hazard workers.
  const workerNoHelmet = placeWorker(
    { helmet: false, vest: true, pose: "work", skin: "dark" }, -16, 0, -4, 2.2
  );
  // Standing at the unprotected south edge of Level 2 in a harness that
  // is not clipped to anything.
  const HARNESS_WORKER = { x: -7, z: 16.2, anchorX: -10.5, anchorZ: 14 };
  const workerNoHarness = placeWorker(
    { helmet: true, vest: true, harness: true, pose: "reach" },
    HARNESS_WORKER.x, frame.floors[2].y, HARNESS_WORKER.z, 0
  );
  const workerOnScaffold = placeWorker(
    { helmet: true, vest: true, pose: "work", helmetColor: "white" },
    -12, scaffold.platforms[2].y, BUILDING.z - BUILDING.depth / 2 - 1.4, 0
  );
  const workerUnderLoad = placeWorker(
    { helmet: true, vest: true, pose: "stand" }, 22, 0, 2, 1.1
  );

  // Compliant workers, so "missing PPE" is a judgement and not just
  // "the only person on site".
  placeWorker({ helmet: true, vest: true, pose: "work", helmetColor: "blue" }, 6, 0, -18, -1.2);
  placeWorker({ helmet: true, vest: true, pose: "stand", helmetColor: "white", skin: "dark" }, -30, 0, 10, 0.6);
  placeWorker({ helmet: true, vest: true, harness: true, pose: "work" }, -14, frame.floors[1].y, 14, 1.8);
  placeWorker({ helmet: true, vest: true, pose: "stand", helmetColor: "orange" }, 16, 0, 18, -2.4);

  /* ============================== hazards ============================== */

  // Visual resolution for each hazard, run when the player chooses the
  // correct corrective action. This is what makes the site visibly
  // safer as the player works through it.
  const resolvers = {
    "no-helmet": () => {
      const dome = new THREE.Mesh(geo.sphere, mat.yellow);
      dome.scale.set(0.34, 0.26, 0.34);
      dome.position.set(0, 1.93, 0);
      dome.castShadow = true;
      workerNoHelmet.add(dome);
      workerNoHelmet.add(box(geo, mat.yellow, 0.3, 0.04, 0.12, 0, 1.87, 0.17));
    },

    "floor-opening": () => {
      // A load-rated, secured and marked cover, plus a barrier.
      const cover = box(geo, mat.yellow, 2.3, 0.1, 2.3, floorOpeningWorld.x, floorOpeningWorld.y + 0.05, floorOpeningWorld.z);
      scene.add(cover);
      colliders.push(collider(floorOpeningWorld.x, floorOpeningWorld.y + 0.05, floorOpeningWorld.z, 2.3, 0.1, 2.3));
      controller.setColliders(colliders);
      const marker = buildSign(geo, mat, { text: "HOLE do not remove", kind: "warning", height: 1.0, width: 0.7, post: false });
      marker.position.set(floorOpeningWorld.x, floorOpeningWorld.y + 0.12, floorOpeningWorld.z);
      marker.rotation.x = -Math.PI / 2;
      scene.add(marker);
      ["x", "z"].forEach((axis) => {
        [-1, 1].forEach((side) => {
          const rail = buildGuardrail(mat, {
            x: floorOpeningWorld.x + (axis === "z" ? side * 1.3 : 0),
            y: floorOpeningWorld.y,
            z: floorOpeningWorld.z + (axis === "x" ? side * 1.3 : 0),
            length: 2.6, axis,
          });
          scene.add(rail);
        });
      });
    },

    electrical: () => {
      badPanel.visible = false;
      badCable.visible = false;
      const fixed = buildElectricalPanel(geo, mat, { unsafe: false });
      fixed.position.copy(badPanel.position);
      scene.add(fixed);
      // Lock-off padlock and tag on the isolator.
      const tag = buildSign(geo, mat, { text: "Locked off do not operate", kind: "prohibition", height: 1.2, width: 0.45, post: false });
      tag.position.set(badPanel.position.x + 0.35, 1.0, badPanel.position.z + 0.3);
      scene.add(tag);
    },

    "scaffold-platform": () => {
      // Complete the boarding and hang a tag.
      const lift = scaffold.platforms[2];
      const zBase = BUILDING.z - BUILDING.depth / 2 - 1.4;
      const boards = 5;
      const d = 1.3;
      [3, 4].forEach((b) => {
        const bz = zBase - d / 2 + (d * (b + 0.5)) / boards;
        const plank = box(geo, mat.timber, scaffold.length, 0.04, d / boards - 0.02, BUILDING.x, lift.y - 0.02, bz);
        scene.add(plank);
      });
      const tag = buildSign(geo, mat, { text: "Scaffold inspected safe", kind: "emergency", height: 0.6, width: 0.5, post: false });
      tag.position.set(BUILDING.x - scaffold.length / 2 + 0.2, lift.y + 1.1, zBase + 0.7);
      scene.add(tag);
    },

    "unsafe-lift": () => {
      // The load is landed in the laydown area and an exclusion zone is set.
      crane.parts.hook.remove(suspendedLoad);
      suspendedLoad.position.set(13, 1.6, -22);
      suspendedLoad.rotation.y = 0.4;
      scene.add(suspendedLoad);
      crane.parts.hook.position.y = -(crane.spec.hookTopY - 22);
      updateHoistRope(crane.parts);
      const zone = buildZoneMarker(mat, { radius: 6, ok: true });
      zone.position.set(22, 0.04, 2);
      scene.add(zone);
      for (let i = 0; i < 10; i++) {
        const cone = buildCone(geo, mat, {});
        const angle = (i / 10) * Math.PI * 2;
        cone.position.set(22 + Math.cos(angle) * 6, 0, 2 + Math.sin(angle) * 6);
        scene.add(cone);
      }
      const sign = buildSign(geo, mat, { text: "Exclusion zone no entry", kind: "prohibition", height: 1.9, width: 0.8 });
      sign.position.set(22, 0, -4.6);
      scene.add(sign);
      // Move the worker out of the danger zone.
      workerUnderLoad.position.set(16, 0, -3);
      workerUnderLoad.rotation.y = 0.4;
    },

    "no-harness": () => {
      // Guardrail the open edge AND clip the operative on.
      const floorY = frame.floors[2].y;
      const edge = frame.floors[2].edges.south;
      const rail = buildGuardrail(mat, {
        x: edge.x, y: floorY, z: edge.z - 0.14, length: edge.length, axis: "x",
      });
      scene.add(rail);

      // Rated anchor post plus a taut lanyard to the worker's D-ring.
      const anchor = cylinder(geo, mat.steel, 0.07, 1.5, HARNESS_WORKER.anchorX, floorY + 0.75, HARNESS_WORKER.anchorZ);
      scene.add(anchor);
      const dx = HARNESS_WORKER.x - HARNESS_WORKER.anchorX;
      const dz = HARNESS_WORKER.z - HARNESS_WORKER.anchorZ;
      const lanyard = box(geo, mat.orange, Math.hypot(dx, dz), 0.05, 0.05,
        (HARNESS_WORKER.x + HARNESS_WORKER.anchorX) / 2,
        floorY + 1.3,
        (HARNESS_WORKER.z + HARNESS_WORKER.anchorZ) / 2,
        { rotY: -Math.atan2(dz, dx), shadow: false });
      scene.add(lanyard);
    },

    housekeeping: () => {
      debris.visible = false;
      debrisCable.visible = false;
      const tidy = buildMaterialPallet(geo, mat, { type: "block", rows: 2 });
      tidy.position.set(-4, 0, -17.5);
      scene.add(tidy);
      const bin = box(geo, mat.green, 1.5, 1.2, 1.1, 0.5, 0.6, -16.5);
      scene.add(bin);
      const sign = buildSign(geo, mat, { text: "Keep walkway clear", kind: "mandatory", height: 1.8, width: 0.7 });
      sign.position.set(-2, 0, -11.5);
      scene.add(sign);
    },

    "blocked-exit": () => {
      exitBlockage.visible = false;
      const index = colliders.indexOf(exitBlockageCollider);
      if (index >= 0) colliders.splice(index, 1);
      controller.setColliders(colliders);
      const sign = buildSign(geo, mat, { text: "Keep clear escape route", kind: "emergency", height: 1.9, width: 0.9 });
      sign.position.set(-SITE.width / 2 + 3, 0, 18);
      sign.rotation.y = Math.PI / 2;
      scene.add(sign);
      // Hazard-striped keep-clear marking on the ground.
      const marking = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 3.6), mat.hazard);
      marking.rotation.x = -Math.PI / 2;
      marking.position.set(-SITE.width / 2 + 2.5, 0.02, 18);
      scene.add(marking);
    },

    excavation: () => {
      excavation.group.visible = false;
      const fixed = buildExcavation(geo, mat, {
        width: 9, depth: 4.5, trenchDepth: 2.2, shored: true, edgeProtection: true,
      });
      fixed.group.position.copy(excavation.group.position);
      scene.add(fixed.group);
      const ladder = buildLadder(geo, mat, { height: 3, lean: 0 });
      ladder.position.set(14.5, -2.1, 24);
      scene.add(ladder);
      const sign = buildSign(geo, mat, { text: "Excavation shored safe entry", kind: "emergency", height: 1.9, width: 0.9 });
      sign.position.set(18, 0, 20.5);
      scene.add(sign);
    },

    "hoist-overload": () => {
      // Strip the cage back to its rated load and show the SWL plate.
      const cage = hoist.userData.cage;
      const toRemove = cage.children.filter((child) => child.position.y > 0.85);
      toRemove.forEach((child) => cage.remove(child));
      const plate = buildSign(geo, mat, { text: "SWL 500 kg", kind: "info", height: 1.5, width: 0.6, post: false });
      plate.position.set(hoist.position.x + 1.4, 1.6, hoist.position.z + 0.9);
      scene.add(plate);
    },
  };

  // Build the runtime hazard list.
  const hazards = HAZARDS.map((data) => {
    const anchor = new THREE.Object3D();
    anchor.position.set(data.place.x, data.place.y + (data.place.eyeY || 1.3), data.place.z);
    scene.add(anchor);

    // Trainee difficulty gets a beacon above each outstanding hazard.
    let beacon = null;
    if (difficulty.hints) {
      beacon = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.07, 6, 20), mat.highlight);
      ring.rotation.x = -Math.PI / 2;
      beacon.add(ring);
      const column = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26, 0.26, 7, 8, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xffc629, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
      );
      column.position.y = 3.5;
      beacon.add(column);
      beacon.position.set(data.place.x, data.place.y + 0.1, data.place.z);
      scene.add(beacon);
      animated.push({ kind: "beacon", object: beacon, phase: Math.random() * 6 });
    }

    return {
      data,
      anchor,
      beacon,
      position: new THREE.Vector3(data.place.x, data.place.y + (data.place.eyeY || 1.3), data.place.z),
      radius: data.place.radius,
      reported: false,
      identifiedCorrectly: false,
      actedCorrectly: false,
    };
  });

  /* ============================== player ============================== */

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
    ladders,
    pits,
    spawn: { x: 0, y: 0, z: -30 },
    yaw: Math.PI,
    onStep: () => sfx.step(),
    onLand: (fallDistance) => {
      if (fallDistance > 2.6) {
        sfx.thud();
        registerFall(fallDistance);
      }
    },
  });

  /* ----------------------------- the player -----------------------------
   * The person the player IS. Hidden in first person — you would be
   * looking at the inside of your own head — and shown the moment they
   * switch to over-the-shoulder, which is the whole point of having a
   * body. Walks when they walk.
   */
  const avatar = buildWorker(geo, mat, {
    helmet: true, vest: true, boots: true, role: "officer",
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
    if (avatar.visible) {
      poseWorker(avatar, {
        phase: walkPhase,
        moving,
        running: controller.state.running,
        pose: controller.state.crouching ? "crouch" : "stand",
      });
    }
  }

  /* ============================ game state ============================ */

  const missionMs = BASE_MISSION_SECONDS * 1000 * difficulty.timeScale;
  const state = {
    remainingMs: missionMs,
    score: 0,
    reported: 0,
    identifiedCorrect: 0,
    actionCorrect: 0,
    wrongAnswers: 0,
    falls: 0,
    finished: false,
    paused: false,
    dialogOpen: false,
    target: null,
    highlight: null,
    lastPromptId: null,
  };

  function addScore(amount) {
    state.score += amount;
  }

  function registerFall(distance) {
    state.falls += 1;
    addScore(-75);
    api.toast(
      `You fell ${distance.toFixed(1)} m. On a real site that is a fatality.`,
      "bad",
      -75
    );
  }

  /* --------------------------- mobile buttons --------------------------- */

  api.buttons([
    { id: "inspect", label: "INSPECT", action: "interact", mode: "tap", color: "#FFC629", primary: true },
    { id: "run", label: "RUN", action: "run", mode: "hold", color: "#33C481" },
    { id: "jump", label: "JUMP", action: "jump", mode: "tap", color: "#59B7FF" },
    { id: "zoom", label: "ZOOM", action: "zoom", mode: "tap", color: "#9B7CF2" },
    { id: "top", label: "TOP VIEW", action: "topview", mode: "tap", color: "#33C481" },
    { id: "view", label: "VIEW", action: "viewmode", mode: "tap", color: "#59B7FF" },
  ]);

  // Lift off the ground and look at the whole site from the air. Walking
  // is frozen while it is up: in first person there is no avatar to
  // watch, so moving from up here would just be disorientating.
  const siteView = createTopView(camera, {
    scene,
    center: new THREE.Vector3(0, 0, -14),
    distance: 118, minDistance: 50, maxDistance: 200, pitch: 0.80,
  });

  /* ---------------------------- interaction ---------------------------- */

  const lookDir = new THREE.Vector3();
  const toHazard = new THREE.Vector3();

  function findTarget() {
    camera.getWorldDirection(lookDir);
    let best = null;
    let bestScore = -Infinity;

    for (const hazard of hazards) {
      if (hazard.reported) continue;
      toHazard.copy(hazard.position).sub(camera.position);
      const dy = toHazard.y;
      const horizontal = Math.hypot(toHazard.x, toHazard.z);
      // Vertical distance is weighted below 1 so a hazard one floor up
      // can be inspected from a sensible position, but not from the
      // other side of the site.
      const weighted = Math.hypot(horizontal, dy * 0.8);
      if (weighted > hazard.radius) continue;

      toHazard.normalize();
      const facing = toHazard.dot(lookDir);
      if (facing < 0.25) continue;

      // Prefer what the player is most directly looking at, then what
      // is closest.
      const rank = facing * 2 - weighted / hazard.radius;
      if (rank > bestScore) {
        bestScore = rank;
        best = hazard;
      }
    }
    return best;
  }

  function setTarget(hazard) {
    if (state.target === hazard) return;
    state.target = hazard;
    if (state.highlight) {
      scene.remove(state.highlight);
      state.highlight.geometry.dispose();
      state.highlight = null;
    }
    if (hazard) {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 12, 8),
        mat.highlight
      );
      marker.position.copy(hazard.position);
      marker.renderOrder = 3;
      scene.add(marker);
      state.highlight = marker;
    }
  }

  function openIdentifyDialog(hazard) {
    state.dialogOpen = true;
    controller.setFrozen(true);
    sfx.interact();
    const options = categoryOptions(hazard.data);

    api.dialog({
      eyebrow: "HAZARD INSPECTION — STEP 1 OF 2",
      title: "What is the primary hazard here?",
      subtitle: hazard.data.detail,
      tone: "normal",
      options: options.map((o, i) => ({
        id: o.id,
        label: o.label,
        badge: String.fromCharCode(65 + i),
      })),
      footer: `Correct classification +${SCORING.identify} · wrong answer ${SCORING.wrong}`,
      onPick: (id) => {
        const picked = options.find((o) => o.id === id);
        const correct = !!picked?.correct;
        if (correct) {
          hazard.identifiedCorrectly = true;
          state.identifiedCorrect += 1;
          addScore(SCORING.identify);
          api.toast(`Correct: ${hazard.data.category}`, "good", SCORING.identify);
        } else {
          state.wrongAnswers += 1;
          addScore(SCORING.wrong);
          api.toast(`Not quite — this is ${hazard.data.category}`, "bad", SCORING.wrong);
        }
        openActionDialog(hazard);
      },
    });
  }

  function openActionDialog(hazard) {
    const options = actionOptions(hazard.data);
    api.dialog({
      eyebrow: "HAZARD INSPECTION — STEP 2 OF 2",
      title: "What corrective action do you take?",
      subtitle: `${hazard.data.title} — ${hazard.data.category}`,
      tone: "normal",
      options: options.map((o, i) => ({
        id: o.id,
        label: o.label,
        badge: String.fromCharCode(65 + i),
      })),
      footer: `Correct action +${SCORING.action} · wrong answer ${SCORING.wrong}`,
      onPick: (id) => {
        const picked = options.find((o) => o.id === id);
        const correct = !!picked?.correct;
        if (correct) {
          hazard.actedCorrectly = true;
          state.actionCorrect += 1;
          addScore(SCORING.action);
          api.toast("Corrective action applied on site", "good", SCORING.action);
          try { resolvers[hazard.data.id]?.(); } catch (e) { console.error("[arena] resolver failed", hazard.data.id, e); }
        } else {
          state.wrongAnswers += 1;
          addScore(SCORING.wrong);
          api.toast(`Wrong action. The right call: ${hazard.data.action}`, "bad", SCORING.wrong);
        }
        completeHazard(hazard);
      },
    });
  }

  function completeHazard(hazard) {
    hazard.reported = true;
    state.reported += 1;
    if (hazard.beacon) {
      scene.remove(hazard.beacon);
      const index = animated.findIndex((a) => a.object === hazard.beacon);
      if (index >= 0) animated.splice(index, 1);
    }
    setTarget(null);
    api.dialog(null);
    state.dialogOpen = false;
    controller.setFrozen(false);

    if (state.reported >= hazards.length) {
      finish(true);
    } else {
      api.toast(`${hazards.length - state.reported} hazards still outstanding`, "info");
    }
  }

  /* ------------------------------ finishing ------------------------------ */

  function finish(completed) {
    if (state.finished) return;
    state.finished = true;
    controller.setFrozen(true);
    api.dialog(null);

    const total = hazards.length;
    const missed = total - state.reported;
    const remainingSeconds = Math.max(0, Math.floor(state.remainingMs / 1000));
    const allFound = state.reported >= total;

    const identifyPoints = state.identifiedCorrect * SCORING.identify;
    const actionPoints = state.actionCorrect * SCORING.action;
    const penalty = Math.round(state.wrongAnswers * Math.abs(SCORING.wrong) * difficulty.penaltyScale);
    const fallPenalty = state.falls * 75;
    const allBonus = allFound ? SCORING.allHazardsBonus : 0;
    const completionBonus = completed ? SCORING.completionBonus : 0;
    const timeBonus = completed ? remainingSeconds * SCORING.timeBonusPerSecond : 0;

    const raw = identifyPoints + actionPoints + allBonus + completionBonus + timeBonus - penalty - fallPenalty;
    const score = Math.max(0, Math.round(raw * difficulty.scoreScale));

    // Performance = correct decisions out of every decision that was
    // available, so skipped hazards count against the rating.
    const performance = Math.round(((state.identifiedCorrect + state.actionCorrect) / (total * 2)) * 100);

    const lessons = hazards
      .filter((h) => !h.reported || !h.identifiedCorrectly || !h.actedCorrectly)
      .map((h) => h.data.lesson);

    api.finish({
      score,
      completed,
      accuracy: performance,
      performance,
      timeTakenMs: Math.round(missionMs - state.remainingMs),
      stats: {
        hazardsTotal: total,
        hazardsFound: state.reported,
        hazardsMissed: missed,
        allFound,
        identifiedCorrect: state.identifiedCorrect,
        actionCorrect: state.actionCorrect,
        wrongAnswers: state.wrongAnswers,
        falls: state.falls,
      },
      breakdown: [
        { label: "Hazards reported", value: `${state.reported} / ${total}`, tone: allFound ? "good" : "bad" },
        { label: "Correct classifications", value: `${state.identifiedCorrect} / ${total}`, tone: state.identifiedCorrect === total ? "good" : "info" },
        { label: "Correct corrective actions", value: `${state.actionCorrect} / ${total}`, tone: state.actionCorrect === total ? "good" : "info" },
        { label: "Wrong decisions", value: `${state.wrongAnswers}`, tone: state.wrongAnswers ? "bad" : "good" },
        { label: "Hazards missed", value: `${missed}`, tone: missed ? "bad" : "good" },
        ...(state.falls ? [{ label: "Falls from height", value: `${state.falls} (−${fallPenalty})`, tone: "bad" }] : []),
        { label: "Identification points", value: `+${identifyPoints}`, tone: "info" },
        { label: "Corrective action points", value: `+${actionPoints}`, tone: "info" },
        ...(allBonus ? [{ label: "All hazards found bonus", value: `+${allBonus}`, tone: "good" }] : []),
        ...(completionBonus ? [{ label: "Mission completion bonus", value: `+${completionBonus}`, tone: "good" }] : []),
        ...(timeBonus ? [{ label: `Time bonus (${remainingSeconds}s left)`, value: `+${timeBonus}`, tone: "good" }] : []),
        ...(penalty ? [{ label: "Wrong answer penalty", value: `−${penalty}`, tone: "bad" }] : []),
        { label: `Difficulty multiplier (${difficulty.label})`, value: `×${difficulty.scoreScale}`, tone: "info" },
      ],
      lessons,
    });
  }

  /* -------------------------------- loop -------------------------------- */

  let hudAccumulator = 0;

  function pushHud(force = false) {
    const target = state.target;
    api.hud({
      controlScheme: "move-look-interact",
      objective: state.reported >= hazards.length
        ? "All hazards reported — mission complete"
        : `Find and report site hazards (${state.reported}/${hazards.length})`,
      score: Math.max(0, state.score),
      timeMs: state.remainingMs,
      progress: (state.reported / hazards.length) * 100,
      progressLabel: `${state.reported} of ${hazards.length} hazards reported`,
      crosshair: target ? "target" : "idle",
      prompt: target
        ? { text: mobile ? "Tap INSPECT to report this hazard" : "Inspect and report this hazard", key: "E", tone: "normal" }
        : null,
      danger: state.remainingMs < 60000,
      keyHints: mobile ? [] : [
        { key: "WASD", label: "Move" },
        { key: "Shift", label: "Run" },
        { key: "E", label: "Inspect" },
        { key: "Esc", label: "Pause" },
      ],
      tasks: hazards.map((h) => ({
        id: h.data.id,
        label: h.reported
          ? `${h.data.title}${h.identifiedCorrectly && h.actedCorrectly ? "" : " (partly correct)"}`
          : "Hazard outstanding",
        done: h.reported,
      })),
      tasksTitle: "HAZARD REGISTER",
    });
  }

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
      siteView.toggle();
      sfx.click();
    }

    if (!state.dialogOpen && !state.finished && !siteView.active) {
      controller.update(dt);
      if (input.wasPressed("viewmode")) { controller.setThirdPerson(!controller.thirdPerson); sfx.click(); }
      if (input.wasPressed("zoom")) { zoom.toggle(); sfx.click(); }
      setTarget(findTarget());
      if (state.target && input.wasPressed("interact")) {
        openIdentifyDialog(state.target);
      }
    } else {
      controller.syncCamera();
    }

    updateAvatar(dt);

    // Orbit the site from above the player's own position, so coming
    // back down puts them exactly where they left off.
    siteView.setCenter(controller.position.x, 0, controller.position.z - 14);
    siteView.update(dt, input, () => controller.syncCamera());

    // Keep the sun's shadow frustum centred on the player so a 2k
    // shadow map covers the area that is actually visible.
    if (cfg.shadows) {
      sun.position.set(controller.position.x + 42, 68, controller.position.z + 30);
      sun.target.position.set(controller.position.x, 0, controller.position.z);
      sun.target.updateMatrixWorld();
    }

    // Cheap idle life: workers sway, beacons pulse and rotate.
    for (let i = 0; i < animated.length; i++) {
      const item = animated[i];
      item.phase += dt;
      if (item.kind === "worker") {
        item.object.rotation.y += Math.sin(item.phase * 0.7) * dt * 0.12;
      } else if (item.kind === "beacon") {
        item.object.rotation.y += dt * 1.4;
        const scale = 1 + Math.sin(item.phase * 2.4) * 0.14;
        item.object.scale.set(scale, 1, scale);
      }
    }

    if (state.highlight) {
      const pulse = 1 + Math.sin(stage.elapsed * 5) * 0.12;
      state.highlight.scale.setScalar(pulse);
    }

    hudAccumulator += dt;
    if (hudAccumulator > 0.12) {
      hudAccumulator = 0;
      pushHud();
    }

    input.endFrame();
  });

  pushHud(true);

  /* ------------------------------ instance ------------------------------ */

  /* ------------------------------- demo -------------------------------
   * The shot list for this mission's built-in demo. Flies the real
   * site: wide first, then down to eye level at two real hazards and
   * into the excavation, then back up to the view the player gets from
   * TOP VIEW. Positions come from the hazards themselves, so they
   * follow if a hazard moves. */
  const demoTour = [
    establishingShot({ step: 0 }),
    hazards[0] && shot(hazards[0].position, { yaw: 0.9, pitch: 0.28, distance: 15, seconds: 7, step: 1 }),
    hazards[1] && shot(hazards[1].position, { yaw: -0.7, pitch: 0.32, distance: 14, seconds: 7, step: 2 }),
    shot({ x: EXC.x, y: 0, z: EXC.z }, { yaw: 0.35, pitch: 0.50, distance: 22, seconds: 7, step: 3 }),
    hazards[2] && shot(hazards[2].position, { yaw: 1.6, pitch: 0.30, distance: 15, seconds: 6, step: 5 }),
    closingShot({ step: 4 }),
  ].filter(Boolean);

  return {
    input,
    siteView,
    demoTour,

    setPaused(value) {
      state.paused = !!value;
      stage.setPaused(!!value);
      input.setEnabled(!value && !state.dialogOpen);
    },

    dispose() {
      siteView.dispose();
      input.dispose();
      stage.dispose();
    },

    // Test seam used by tests/arena-games.test.mjs to drive a real
    // playthrough headlessly. Nothing in the app reads this.
    __test: {
      state, controller, hazards, scene, colliders, avatar,
      zoomFov: () => camera.fov,
    },
  };
}

export default { ...meta, create };
