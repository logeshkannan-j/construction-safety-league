/* ------------------------------------------------------------------ *
 *  ARENA ENGINE — site debris, from the 3D models
 *
 *  Timber offcuts from the planks pack and broken concrete from the
 *  stones pack (public/models-web), laid where a real site collects
 *  them: along the hoarding, at the foot of the building, by the skip.
 *  Each spot is a handful of single pieces at random, never the pack's
 *  own neat line-up:
 *
 *    timber    three to five planks dropped across each other
 *    concrete  broken lumps of concrete, small to fist-sized and larger
 *    heap      a rubble heap — lumps piled up in the middle, timber on
 *              and around it — that a walking player goes round
 *
 *  The two packs are small (1.9 MB together), fetched once per visit,
 *  after the mission has started, and shared by every mission. All the
 *  pieces of one material, over every spot, are merged into one mesh, so
 *  a site's debris is a few draw calls. It is dressing: if the files
 *  cannot be fetched, the mission simply has a tidier site.
 * ------------------------------------------------------------------ */

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { buildZoneMarker, buildSign, buildBarrier, colliderFromMesh } from "./kit.js";

const BASE = `${import.meta.env?.BASE_URL ?? "/"}models-web/`;
let packs = null;

/**
 * Every mesh of a pack as a piece of its own: its whole transform baked
 * in, centred on its own origin and standing on it.
 */
export function piecesOf(root, keep = () => true) {
  root.updateMatrixWorld(true);
  const out = [];
  root.traverse((o) => {
    if (!o.isMesh || !keep(o.name || "")) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    g.computeBoundingBox();
    const b = g.boundingBox;
    const c = b.getCenter(new THREE.Vector3());
    g.translate(-c.x, -b.min.y, -c.z);
    g.computeBoundingBox();
    const size = g.boundingBox.getSize(new THREE.Vector3());
    out.push({ geometry: g, material: o.material, size, long: Math.max(size.x, size.y, size.z) });
  });
  return out;
}

/** The two packs, loaded once and kept: { timber: [...pieces], concrete: [...pieces] }. */
export function loadDebrisPacks() {
  // Only where there is a page to fetch from. Elsewhere (the tests run in
  // Node) three's FileLoader throws on the relative URL after marking it
  // in flight, and every later load of the same file then waits forever.
  const page = typeof window !== "undefined" ? window.location?.protocol : null;
  if (!/^(https?|file):$/.test(page || "")) return Promise.reject(new Error("debris: no page to fetch from"));
  if (!packs) {
    packs = (async () => {
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const loader = new GLTFLoader();
      const [planks, stones] = await Promise.all([
        loader.loadAsync(`${BASE}planks.glb`),
        loader.loadAsync(`${BASE}stones.glb`),
      ]);
      // The plain stones, dusted down to the grey of broken concrete;
      // as they come they are white, and read as garden boulders.
      const concrete = piecesOf(stones.scene, (n) => /no_moss/.test(n));
      const dusted = new Map();
      concrete.forEach((p) => {
        if (!dusted.has(p.material)) {
          const m = p.material.clone();
          m.color.set(0x77716a);
          dusted.set(p.material, m);
        }
        p.material = dusted.get(p.material);
      });
      return {
        // Planks, and the post that lies down; not the one standing up.
        timber: piecesOf(planks.scene, (n) => !/post_01/.test(n)),
        concrete,
      };
    })();
    // A failed fetch can be tried again by the next mission.
    packs.catch(() => { packs = null; });
  }
  return packs;
}

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Lays the pieces for `spots` and returns one merged mesh per material.
 * Pure: give it the pieces and it gives back the meshes, so it can be
 * checked without fetching anything.
 */
let dustMaterial = null;
let brickMaterial = null;

export function layDebris(spots, pieces, { seed = 3, y = 0 } = {}) {
  const rand = seeded(seed);
  dustMaterial = dustMaterial || new THREE.MeshLambertMaterial({ color: 0x9a8f7c });
  brickMaterial = brickMaterial || new THREE.MeshLambertMaterial({ color: 0xa0583b });
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const byMaterial = new Map();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const lay = (piece, x, height, z, length, { tilt = 0.12, yaw = rand() * Math.PI * 2 } = {}) => {
    const s = length / piece.long;
    e.set((rand() - 0.5) * tilt, yaw, (rand() - 0.5) * tilt, "YXZ");
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(x, y + height, z), q, new THREE.Vector3(s, s, s));
    const g = piece.geometry.clone().applyMatrix4(m);
    // Tipped over, a corner can go under: settle it on the ground, a few
    // centimetres in at most, like something that has lain there a while.
    g.computeBoundingBox();
    const under = y - 0.03 - g.boundingBox.min.y;
    if (under > 0) g.translate(0, under, 0);
    if (!byMaterial.has(piece.material)) byMaterial.set(piece.material, []);
    byMaterial.get(piece.material).push(g);
    return piece.size.y * s;
  };
  const add = (material, g) => {
    if (!byMaterial.has(material)) byMaterial.set(material, []);
    byMaterial.get(material).push(g);
  };
  // A patch of dust and grit under a spot, ragged at the edge, so it sits
  // in the ground rather than on it.
  const dust = (x, z, radius) => {
    const g = new THREE.CircleGeometry(radius, 14);
    const p = g.attributes.position;
    for (let i = 1; i < p.count; i++) {
      const k = 0.75 + rand() * 0.4;
      p.setXY(i, p.getX(i) * k, p.getY(i) * k);
    }
    g.rotateX(-Math.PI / 2);
    g.translate(x, y + 0.012, z);
    add(dustMaterial, g);
  };
  // Broken bricks.
  const bat = (x, height, z) => {
    const g = new THREE.BoxGeometry(0.09 + rand() * 0.12, 0.065, 0.1);
    e.set((rand() - 0.5) * 0.9, rand() * Math.PI * 2, (rand() - 0.5) * 0.9, "YXZ");
    g.applyQuaternion(q.setFromEuler(e));
    g.translate(x, y + height + 0.03, z);
    add(brickMaterial, g);
  };

  spots.forEach((spot) => {
    const { x, z, kind = "concrete", size = 1 } = spot;
    if (kind === "timber" && pieces.timber?.length) {
      // Dropped across each other, each a little higher than the last.
      let top = 0;
      const n = 3 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2;
        const r = rand() * 0.45 * size;
        top += lay(pick(pieces.timber), x + Math.cos(a) * r, top * 0.6, z + Math.sin(a) * r, (1.2 + rand() * 1.4) * size, { tilt: 0.08 }) * 0.9;
      }
    } else if (kind === "heap" && pieces.concrete?.length) {
      // Piled up in the middle and spread at the edges: lumps of
      // concrete, broken brick, and timber thrown on top.
      dust(x, z, 1.7 * size);
      const n = 22 + Math.floor(rand() * 8);
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * 1.3 * size;
        const rise = Math.max(0, 0.6 * size * (1 - r / (1.35 * size)));
        lay(pick(pieces.concrete), x + Math.cos(a) * r, rise * (0.5 + rand() * 0.45) - 0.03, z + Math.sin(a) * r,
          (0.16 + rand() * 0.32) * size, { tilt: 1.2 });
      }
      for (let i = 0; i < 12; i++) {
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * 1.4 * size;
        bat(x + Math.cos(a) * r, Math.max(0, 0.5 * size * (1 - r / (1.4 * size))) * rand(), z + Math.sin(a) * r);
      }
      if (pieces.timber?.length) {
        for (let i = 0; i < 3; i++) {
          const a = rand() * Math.PI * 2;
          lay(pick(pieces.timber), x + Math.cos(a) * 0.5 * size, 0.35 * size * rand(), z + Math.sin(a) * 0.5 * size,
            (1.1 + rand()) * size, { tilt: 0.5 });
        }
      }
    } else if (pieces.concrete?.length) {
      dust(x, z, 1.05 * size);
      for (let i = 0; i < 4; i++) bat(x + (rand() - 0.5) * 1.4 * size, 0, z + (rand() - 0.5) * 1.4 * size);
      const n = 4 + Math.floor(rand() * 5);
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2;
        const r = rand() * 0.9 * size;
        lay(pick(pieces.concrete), x + Math.cos(a) * r, -0.02, z + Math.sin(a) * r, (0.14 + rand() * 0.38) * size, { tilt: 1.2 });
      }
    }
  });

  const meshes = [];
  byMaterial.forEach((geoms, material) => {
    const merged = mergeGeometries(geoms, false);
    geoms.forEach((g) => g.dispose());
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    meshes.push(mesh);
  });
  return meshes;
}

/**
 * Debris at `spots` ([{ x, z, kind, size }]) in `scene`. Returns at once
 * with { group, colliders, ready }: the colliders — one box per heap,
 * the only spot too big to step over — are known from the spots, so a
 * walking game can have them from the start; the pieces arrive when the
 * packs do, and `ready` resolves when they are in.
 */
export function scatterDebris(scene, spots, { seed = 3, y = 0 } = {}) {
  const group = new THREE.Group();
  group.name = "debris";
  scene.add(group);
  const colliders = spots.filter((s) => s.kind === "heap").map((s) => {
    const r = 1.3 * (s.size || 1);
    return { minX: s.x - r, maxX: s.x + r, minY: y, maxY: y + 0.8 * (s.size || 1), minZ: s.z - r, maxZ: s.z + r };
  });
  const ready = loadDebrisPacks()
    .then((pieces) => {
      if (!group.parent) return group;
      layDebris(spots, pieces, { seed, y }).forEach((mesh) => group.add(mesh));
      return group;
    })
    .catch(() => group);
  return { group, colliders, ready };
}

/**
 * A marked scrap yard: where a well-run site keeps its debris — marked
 * out, barriered along the front with a gap for a barrow, and signed — so
 * a heap of rubble reads as waste in its proper place rather than as a
 * hazard to report. A rubble heap, a timber pile and broken concrete go
 * inside. The front faces the way `rotY` turns local +Z. Returns at once
 * with { group, colliders, ready }; the colliders are the barriers and
 * the heap.
 */
export function debrisYard(scene, geo, mat, { x, z, rotY = 0, width = 7, depth = 5, seed = 5, y = 0 } = {}) {
  const yard = new THREE.Group();
  yard.name = "scrap yard";
  yard.position.set(x, y, z);
  yard.rotation.y = rotY;
  yard.add(buildZoneMarker(mat, { rect: [width, depth], ok: true }));
  const front = depth / 2;
  const barriers = [-width / 2 + 1.1, width / 2 - 1.1].map((bx) => {
    const b = buildBarrier(geo, mat, { length: 2 });
    b.position.set(bx, 0, front);
    yard.add(b);
    return b;
  });
  const sign = buildSign(geo, mat, { text: "SCRAP YARD", kind: "info", height: 1.55, width: 1.0 });
  sign.position.set(0, 0, front + 0.35);
  yard.add(sign);
  scene.add(yard);

  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  const spots = [
    { x: -width * 0.2, z: -depth * 0.1, kind: "heap", size: 0.9 },
    { x: width * 0.27, z: -depth * 0.2, kind: "timber" },
    { x: width * 0.22, z: depth * 0.18, kind: "concrete", size: 0.8 },
  ].map((p) => ({ ...p, x: x + p.x * c + p.z * s, z: z - p.x * s + p.z * c }));
  const debris = scatterDebris(scene, spots, { seed, y });
  yard.updateMatrixWorld(true);
  const colliders = [...debris.colliders, ...barriers.map((b) => colliderFromMesh(b))];
  return { group: yard, debris: debris.group, colliders, ready: debris.ready };
}

