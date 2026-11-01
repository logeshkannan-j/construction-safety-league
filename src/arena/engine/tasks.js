/* ------------------------------------------------------------------ *
 *  ARENA ENGINE — people at work, with the work in front of them
 *
 *  A worker posed "at work" with nothing in their hands is a mime: arms
 *  out, palms up, at nothing. Every job here comes with what it needs —
 *  the tool in the hand and the work in front of them, at the height it
 *  is worked at — so a site reads as a site:
 *
 *    bricklaying   a wall going up a course at a time, trowel in hand,
 *                  the mortar pan and a stack of bricks alongside
 *    rebar         a mat of bars on its spacer blocks, crouched over it
 *                  tying, the next bundle of bars beside it
 *    carpentry     a plank across two trestles, hammer in hand, the
 *                  offcuts on the ground
 *    drilling      a drill held up at the slab overhead
 *    plastering    trowel at the wall in front, a bucket of mortar by
 *                  the feet
 *    formwork      crouched over a sheet of plywood on its bearers, nailing
 *
 *  The worker stays where the game put it — a child of the scene, at the
 *  same position — so nothing that finds, poses or moves a worker has to
 *  change; the props are placed alongside it, in its own frame.
 * ------------------------------------------------------------------ */

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { box, cylinder, brickWall, buildWorker, colliderFromMesh } from "./kit.js";

let brickRed = null;
const bricks = () => brickRed || (brickRed = new THREE.MeshLambertMaterial({ color: 0xa8613f }));

/* ---- tools, made to sit in a right fist: the grip runs across the palm
 * along the hand's own Z, about 7 cm down from the wrist ---- */

function trowel(geo, mat) {
  const g = new THREE.Group();
  g.add(box(geo, mat.timberDark, 0.026, 0.026, 0.11, 0, -0.075, 0.02, { shadow: false }));
  g.add(box(geo, mat.steelDark, 0.012, 0.012, 0.07, 0, -0.08, 0.1, { shadow: false }));
  g.add(box(geo, mat.steel, 0.11, 0.006, 0.17, 0, -0.085, 0.22, { shadow: false }));
  return g;
}

function hammer(geo, mat) {
  const g = new THREE.Group();
  g.add(box(geo, mat.timber, 0.026, 0.03, 0.3, 0, -0.075, 0.08, { shadow: false }));
  g.add(box(geo, mat.steelDark, 0.12, 0.04, 0.04, 0, -0.075, 0.23, { shadow: false }));
  return g;
}

function drill(geo, mat) {
  const g = new THREE.Group();
  // The body runs on past the fingers, so held up it points at the slab.
  g.add(box(geo, mat.yellow, 0.07, 0.2, 0.09, 0, -0.16, 0.04));
  g.add(box(geo, mat.black, 0.065, 0.05, 0.1, 0, -0.045, 0.05, { shadow: false }));
  g.add(cylinder(geo, mat.steel, 0.006, 0.14, 0, -0.33, 0.04, { low: true, shadow: false }));
  return g;
}

/** Many thin boxes as one mesh: a mat of bars costs one draw call. */
function merged(parts, material) {
  const geoms = parts.map(([w, h, d, x, y, z]) => new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  const mesh = new THREE.Mesh(mergeGeometries(geoms, false), material);
  geoms.forEach((g) => g.dispose());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/* ---- the jobs ---- */

const JOBS = {
  bricklaying(geo, mat, props) {
    // Eleven courses up, the twelfth going on at one end.
    const wall = brickWall(1.8, 0.825, 0.23);
    wall.position.set(0, 0.4125, 0.56);
    wall.userData.solid = true;
    props.add(wall);
    for (let i = 0; i < 3; i++) props.add(box(geo, bricks(), 0.225, 0.065, 0.105, 0.31 + i * 0.235, 0.86, 0.5));
    props.add(box(geo, mat.screed, 0.5, 0.012, 0.11, 0.55, 0.832, 0.62, { shadow: false }));
    // The mortar pan, and a stack of bricks to hand.
    props.add(cylinder(geo, mat.steelDark, 0.3, 0.1, -0.78, 0.05, 0.22));
    props.add(cylinder(geo, mat.screed, 0.27, 0.02, -0.78, 0.1, 0.22, { shadow: false }));
    const stack = brickWall(0.5, 0.33, 0.36);
    stack.position.set(0.98, 0.165, 0.12);
    stack.userData.solid = true;
    props.add(stack);
    // The next brick, in the other hand.
    const brick = box(geo, bricks(), 0.105, 0.065, 0.225, 0, -0.1, 0.03, { shadow: false });
    return { pose: "work", tool: trowel(geo, mat), other: brick };
  },

  rebar(geo, mat, props) {
    // A mat of bars both ways at 160 mm, sitting on spacer blocks.
    const bars = [];
    for (let i = 0; i <= 10; i++) {
      const t = -0.8 + i * 0.16;
      bars.push([1.62, 0.016, 0.016, 0, 0.075, 0.85 + t]);
      bars.push([0.016, 0.016, 1.62, t, 0.091, 0.85]);
    }
    props.add(merged(bars, mat.rebar));
    props.add(merged([[-0.7, 0.85 - 0.7], [0.7, 0.85 - 0.7], [-0.7, 0.85 + 0.7], [0.7, 0.85 + 0.7]]
      .map(([x, z]) => [0.07, 0.065, 0.07, x, 0.033, z]), mat.concrete));
    // The next bundle, alongside.
    props.add(merged(Array.from({ length: 7 }, (_, i) => [0.018, 0.018, 2.4, 1.15 + (i % 4) * 0.022, 0.012 + Math.floor(i / 4) * 0.02, 0.4]), mat.rebar));
    return { pose: "tie", tool: null };
  },

  carpentry(geo, mat, props) {
    // Two trestles at working height and a plank across them.
    [-0.62, 0.62].forEach((x) => {
      props.add(box(geo, mat.timberDark, 0.09, 0.07, 0.5, x, 0.8, 0.62));
      [-1, 1].forEach((side) => {
        props.add(box(geo, mat.timberDark, 0.045, 0.82, 0.045, x, 0.4, 0.62 + side * 0.17, { rotX: side * 0.2 }));
      });
    });
    const plank = box(geo, mat.timber, 1.9, 0.05, 0.24, 0, 0.86, 0.62);
    plank.userData.solid = true;
    props.add(plank);
    // The offcuts, where they fell.
    [[-0.9, 0.05, 1.2, 0.4], [0.3, 0.05, 1.35, 2.1], [0.95, 0.05, 1.05, 1.1]].forEach(([x, y, z, r]) => {
      props.add(box(geo, mat.timber, 0.42, 0.04, 0.2, x, y - 0.03, z, { rotY: r }));
    });
    return { pose: "work", tool: hammer(geo, mat) };
  },

  drilling(geo, mat) {
    return { pose: "reach", tool: drill(geo, mat) };
  },

  plastering(geo, mat, props) {
    props.add(cylinder(geo, mat.black, 0.16, 0.28, -0.48, 0.14, 0.18));
    props.add(cylinder(geo, mat.screed, 0.145, 0.02, -0.48, 0.27, 0.18, { shadow: false }));
    return { pose: "work", tool: trowel(geo, mat) };
  },

  formwork(geo, mat, props) {
    // A sheet of ply on its bearers, being nailed down.
    [-0.45, 0.45].forEach((x) => props.add(box(geo, mat.timber, 0.075, 0.1, 0.75, x, 0.05, 0.6)));
    props.add(box(geo, mat.plywood, 1.22, 0.018, 0.61, 0, 0.109, 0.6));
    props.add(box(geo, mat.plywood, 1.22, 0.018, 0.61, 1.0, 0.009, 0.3, { rotY: 0.2 }));
    return { pose: "tie", tool: hammer(geo, mat) };
  },
};

/** The jobs there are, for anybody choosing one. */
export const TASKS = Object.keys(JOBS);

/**
 * A worker doing `kind` of job, and the job: { worker, props, kind }.
 * `workerOpts` go to buildWorker (PPE, colours, gender...); the pose is
 * the job's own.
 */
export function buildTask(geo, mat, kind, workerOpts = {}) {
  const job = JOBS[kind];
  if (!job) throw new Error(`No such task: ${kind}`);
  const props = new THREE.Group();
  props.name = `task:${kind}`;
  const { pose, tool, other = null } = job(geo, mat, props);
  const worker = buildWorker(geo, mat, { ...workerOpts, pose });
  if (tool) worker.userData.rig.armR.userData.hand.add(tool);
  if (other) worker.userData.rig.armL.userData.hand.add(other);
  worker.userData.task = kind;
  props.userData.task = kind;
  return { worker, props, kind };
}

/**
 * Puts a task on site: the worker at (x, y, z) facing rotY, exactly as a
 * game placed its workers before, and the props with it. Anything solid
 * among the props (a wall, a plank on its trestles) goes into
 * `colliders` when a walking game passes its list. Returns the worker.
 */
export function placeTask(scene, task, x, y, z, rotY = 0, { colliders = null } = {}) {
  const { worker, props } = task;
  worker.position.set(x, y, z);
  worker.rotation.y = rotY;
  props.position.set(x, y, z);
  props.rotation.y = rotY;
  scene.add(worker);
  scene.add(props);
  if (colliders) {
    props.updateMatrixWorld(true);
    props.traverse((o) => { if (o.userData.solid) colliders.push(colliderFromMesh(o)); });
  }
  return worker;
}
