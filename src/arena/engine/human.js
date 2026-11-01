/* ------------------------------------------------------------------ *
 *  ARENA ENGINE — people
 *
 *  Every person in all five missions is built here: the player's own
 *  avatar, the crew, the safety officers and the casualties.
 *
 *  The figure it replaces was tapered tubes with a ball for a head and
 *  boxes stuck on for a nose, a mouth and the hands. It read as a toy,
 *  and its walk was anatomically backwards — the knees bent forwards
 *  like a bird's, a crouch put the knee behind the hip, and the hands
 *  hung inside the hips. So this is a different method, not a tidy-up:
 *
 *    the head   is SCULPTED: a signed-distance field of skull, jaw,
 *               cheekbones, brow, nose, lips and chin, smoothly
 *               blended, with every vertex found by casting a ray out
 *               from the centre of the skull to that surface. The eyes
 *               sit in sockets and have an iris and a pupil.
 *    the body   is LOFTED: each section is a stack of superellipse
 *               rings — pelvis, waist, ribcage, chest, the slope of
 *               the trapezius — so a torso is one continuous shape,
 *               not cylinders on top of each other.
 *    clothing   follows the body: a shirt (long or short sleeved),
 *               trousers, a belt, safety boots or chappals.
 *    PPE        is the real kit: a hard hat with a peak and a ridge, a
 *               sleeveless hi-vis vest with reflective tape and
 *               shoulder straps that lie ON the shoulders, and a full
 *               body harness with leg loops and a back D-ring.
 *    variety    comes from a seed: skin tone, hair, moustache, shirt,
 *               trousers, sleeves, gloves, build and height. A crowd of
 *               identical people looks wrong before you can say why.
 *    women      are built as women, not as smaller men: narrower
 *               shoulders, a waist, a bust and wider hips; a softer jaw,
 *               fuller lips, finer brows; long hair worn in a braid or a
 *               bun under the hard hat; ear studs, a nose stud and a
 *               bindi on some; and a tunic over the trousers.
 *
 *  The skeleton is the one the games already drive — hips, spine,
 *  neck, head, legs with knees, arms with elbows and hands — plus an
 *  ankle in each leg, so a foot can roll from heel to toe.
 *
 *  The walk is rebuilt from gait data, not sine waves: heel strike,
 *  loading response, mid-stance, toe-off and swing, with the pelvis
 *  rising, dropping, swaying and turning against the shoulders. The
 *  cycle is advanced by DISTANCE travelled, so the feet do not slide.
 *
 *  Draw calls stay where they were: each joint is baked down to one
 *  mesh per material, so a person is about two dozen draw calls.
 *
 *  Joint sign conventions in this rig (the model faces +Z):
 *    hip flexion (thigh forward)      leg.rotation.x   NEGATIVE
 *    knee flexion (heel back)         knee.rotation.x  POSITIVE
 *    ankle plantarflexion (toe down)  ankle.rotation.x POSITIVE
 *    shoulder flexion (arm forward)   arm.rotation.x   NEGATIVE
 *    elbow flexion (hand up)          elbow.rotation.x NEGATIVE
 *    leaning forward                  spine.rotation.x POSITIVE
 *    arm out to the side              rotation.z AWAY from the body
 * ------------------------------------------------------------------ */

import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/* ============================ small maths ============================ */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const spow = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);

/** A small deterministic generator, so a seed always gives the same person. */
function rng(seed) {
  let s = (Math.floor(seed) * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/* ========================= geometry building ========================= */

/**
 * Raw arrays to an indexed geometry with smooth normals.
 *
 * Seams are welded first, so a loop of vertices that starts and ends in
 * the same place shades as one surface rather than showing a crease.
 * A zero UV set is added because every part is later merged with the
 * kit's boxes and spheres, and a merge fails outright if the attribute
 * sets differ.
 */
function toGeometry({ positions, indices, colors = null }) {
  let g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (colors) g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g = mergeVertices(g, 1e-5);
  g.computeVertexNormals();
  const n = g.attributes.position.count;
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}

/**
 * Stitches rows of vertices into a closed surface.
 *
 * `rows` run from the BOTTOM of the shape to the TOP, each a loop of
 * `seg` points going round from the front (+Z) towards +X. That order
 * is what makes every face point outwards. A row can be a single point,
 * which closes the surface there (the crown of a head, a fingertip).
 */
function stitch(rows, { capBottom = false, capTop = false } = {}) {
  const pos = [];
  const idx = [];
  const starts = [];
  rows.forEach((row) => {
    starts.push(pos.length / 3);
    row.forEach((p) => pos.push(p[0], p[1], p[2]));
  });
  for (let i = 0; i < rows.length - 1; i++) {
    const a0 = starts[i];
    const b0 = starts[i + 1];
    const na = rows[i].length;
    const nb = rows[i + 1].length;
    if (na === nb) {
      for (let j = 0; j < na; j++) {
        const a = a0 + j;
        const b = a0 + ((j + 1) % na);
        const c = b0 + j;
        const d = b0 + ((j + 1) % nb);
        idx.push(a, b, c, b, d, c);
      }
    } else if (nb === 1) {
      for (let j = 0; j < na; j++) idx.push(a0 + j, a0 + ((j + 1) % na), b0);
    } else if (na === 1) {
      for (let j = 0; j < nb; j++) idx.push(a0, b0 + ((j + 1) % nb), b0 + j);
    }
  }
  const capAt = (rowIndex, up) => {
    const row = rows[rowIndex];
    if (row.length < 3) return;
    const s = starts[rowIndex];
    const c = [0, 0, 0];
    row.forEach((p) => { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; });
    const ci = pos.length / 3;
    pos.push(c[0] / row.length, c[1] / row.length, c[2] / row.length);
    for (let j = 0; j < row.length; j++) {
      const a = s + j;
      const b = s + ((j + 1) % row.length);
      if (up) idx.push(ci, a, b);
      else idx.push(ci, b, a);
    }
  };
  if (capBottom) capAt(0, false);
  if (capTop) capAt(rows.length - 1, true);
  return { positions: pos, indices: idx };
}

/** The point on a superellipse ring at angle `a` (0 = front, +Z). */
function ringPoint(r, a) {
  const n = r.n || 2;
  const s = Math.sin(a);
  const c = Math.cos(a);
  return [
    (r.cx || 0) + r.rx * spow(s, 2 / n),
    r.y,
    (r.cz || 0) + r.rz * spow(c, 2 / n),
  ];
}

/**
 * A body section lofted through superellipse rings.
 *
 * ring: { y, rx, rz, cx = 0, cz = 0, n = 2 }. `n` above 2 squares the
 * section off — a ribcage is nearer a rounded box than an ellipse.
 * Rings may be given in either order; they are sorted bottom to top.
 * A ring with no radius is a single point, which rounds the end off.
 */
function loftArrays(rings, { seg = 16, capBottom = true, capTop = true } = {}) {
  const sorted = [...rings].sort((a, b) => a.y - b.y);
  const rows = sorted.map((r) => {
    if (r.rx <= 0.0005 && r.rz <= 0.0005) return [[r.cx || 0, r.y, r.cz || 0]];
    const row = [];
    for (let j = 0; j < seg; j++) row.push(ringPoint(r, (j / seg) * TAU));
    return row;
  });
  return stitch(rows, { capBottom, capTop });
}

/** Interpolates the ring of a loft at a height, or null outside it. */
function ringAt(rings, y) {
  const sorted = [...rings].sort((a, b) => a.y - b.y);
  if (y < sorted[0].y || y > sorted[sorted.length - 1].y) return null;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (y >= a.y && y <= b.y) {
      const t = (y - a.y) / Math.max(1e-6, b.y - a.y);
      return {
        y,
        rx: lerp(a.rx, b.rx, t), rz: lerp(a.rz, b.rz, t),
        cx: lerp(a.cx || 0, b.cx || 0, t), cz: lerp(a.cz || 0, b.cz || 0, t),
        n: lerp(a.n || 2, b.n || 2, t),
      };
    }
  }
  return null;
}

/** The same body grown outwards by `by` metres, for clothes worn over it. */
function inflate(rings, by, { from = -Infinity, to = Infinity } = {}) {
  return rings
    .filter((r) => r.y >= from && r.y <= to)
    .map((r) => ({ ...r, rx: r.rx + by, rz: r.rz + by }));
}

/**
 * Where a vertical plane at `x` meets a loft, front or back, at height
 * `y`. Used to lay straps ON a body instead of floating them near it.
 */
function surfaceZ(rings, x, y, side = 1) {
  const r = ringAt(rings, y);
  if (!r) return null;
  const ax = Math.abs(x - (r.cx || 0));
  if (ax >= r.rx) return null;
  const n = r.n || 2;
  const k = Math.pow(1 - Math.pow(ax / r.rx, n), 1 / n);
  return (r.cz || 0) + side * r.rz * k;
}

/**
 * A path over a body in the vertical plane at `x`: up the front from
 * `yFront`, over the top, and down the back to `yBack`. Found by
 * casting rays out from a point inside the body, so it hugs whatever
 * shape the loft has — a strap that floats a few centimetres off a
 * shoulder is exactly what makes a figure look assembled.
 */
function pathOverBody(rings, x, { yFront, yBack, center = [0.42, 0], lift = 0.004, steps = 26 }) {
  const inside = (y, z) => {
    const front = surfaceZ(rings, x, y, 1);
    const back = surfaceZ(rings, x, y, -1);
    return front !== null && z <= front && z >= back;
  };
  const [cy, cz] = center;
  const hit = (a) => {
    const dy = Math.sin(a);
    const dz = Math.cos(a);
    let t = 0;
    while (t < 0.5 && inside(cy + dy * t, cz + dz * t)) t += 0.004;
    let lo = Math.max(0, t - 0.004);
    let hi = t;
    for (let i = 0; i < 14; i++) {
      const m = (lo + hi) / 2;
      if (inside(cy + dy * m, cz + dz * m)) lo = m; else hi = m;
    }
    return [cy + dy * (lo + lift), cz + dz * (lo + lift)];
  };
  // The angles at which the ray reaches the two ends of the strap.
  const startA = Math.asin(clamp((yFront - cy) / 0.2, -1, 1)) * 0.6;
  const endA = Math.PI - Math.asin(clamp((yBack - cy) / 0.2, -1, 1)) * 0.6;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const [y, z] = hit(lerp(startA, endA, i / steps));
    pts.push([x, y, z]);
  }
  // Run straight down the front and back to the requested heights.
  const first = pts[0];
  const last = pts[pts.length - 1];
  const down = [];
  for (let y = first[1] - 0.03; y > yFront; y -= 0.03) {
    const z = surfaceZ(rings, x, y, 1);
    if (z !== null) down.push([x, y, z + lift]);
  }
  const up = [];
  for (let y = last[1] - 0.03; y > yBack; y -= 0.03) {
    const z = surfaceZ(rings, x, y, -1);
    if (z !== null) up.push([x, y, z - lift]);
  }
  return [...down.reverse(), ...pts, ...up];
}

/**
 * A deformed ellipsoid: latitude rows from the bottom pole to the top.
 * `deform(p)` may move each point; latFrom/latTo limit the latitude
 * range (0 = top pole, PI = bottom pole) for a dome or a cup.
 */
function shellArrays(rx, ry, rz, {
  seg = 16, rows = 10, n = 2, deform = null, center = [0, 0, 0],
  latFrom = 0, latTo = Math.PI, capBottom = false, capTop = false,
} = {}) {
  const out = [];
  for (let i = rows; i >= 0; i--) {
    const lat = lerp(latFrom, latTo, i / rows);
    const sl = Math.sin(lat);
    const cl = Math.cos(lat);
    if (sl < 1e-4) {
      let p = [center[0], center[1] + ry * Math.sign(cl), center[2]];
      if (deform) p = deform(p);
      out.push([p]);
      continue;
    }
    const row = [];
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * TAU;
      let p = [
        center[0] + rx * spow(sl, 2 / n) * spow(Math.sin(a), 2 / n),
        center[1] + ry * spow(cl, 2 / n),
        center[2] + rz * spow(sl, 2 / n) * spow(Math.cos(a), 2 / n),
      ];
      if (deform) p = deform(p);
      row.push(p);
    }
    out.push(row);
  }
  return stitch(out, { capBottom, capTop });
}

/**
 * A tube swept along a polyline, with a radius at each point — a
 * finger, a lanyard. `side` is the vector the tube's frame is built
 * against and must not be parallel to the path.
 */
function tubeArrays(points, radii, { seg = 8, side = [0, 0, 1], flat = 1, capStart = true, capEnd = true } = {}) {
  const P = points.map((p) => new THREE.Vector3(...p));
  const S = new THREE.Vector3(...side).normalize();
  const radius = (i) => (Array.isArray(radii) ? radii[i] : radii);
  const rows = [];
  for (let i = 0; i < P.length; i++) {
    const prev = P[Math.max(0, i - 1)];
    const next = P[Math.min(P.length - 1, i + 1)];
    const t = next.clone().sub(prev).normalize();
    const u = new THREE.Vector3().crossVectors(t, S).normalize();
    const v = new THREE.Vector3().crossVectors(u, t).normalize();
    const r = radius(i);
    const row = [];
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * TAU;
      const q = P[i].clone()
        .addScaledVector(v, Math.cos(a) * r)
        .addScaledVector(u, Math.sin(a) * r * flat);
      row.push([q.x, q.y, q.z]);
    }
    rows.push(row);
  }
  // Close each end with a point a little beyond it, so a fingertip is
  // rounded rather than cut off square.
  if (capStart) {
    const t = P[1].clone().sub(P[0]).normalize();
    const tip = P[0].clone().addScaledVector(t, -radius(0) * 0.8);
    rows.unshift([[tip.x, tip.y, tip.z]]);
  }
  if (capEnd) {
    const k = P.length - 1;
    const t = P[k].clone().sub(P[k - 1]).normalize();
    const tip = P[k].clone().addScaledVector(t, radius(k) * 0.8);
    rows.push([[tip.x, tip.y, tip.z]]);
  }
  return stitch(rows);
}

/**
 * A flat strap swept along a path: webbing, a vest's shoulder strap,
 * reflective tape. `across` is the direction of the strap's width.
 */
function strapArrays(points, { width = 0.05, thick = 0.006, across = [1, 0, 0], bank = 0 } = {}) {
  const A0 = new THREE.Vector3(...across).normalize();
  const P = points.map((p) => new THREE.Vector3(...p));
  const rows = [];
  for (let i = 0; i < P.length; i++) {
    const prev = P[Math.max(0, i - 1)];
    const next = P[Math.min(P.length - 1, i + 1)];
    const t = next.clone().sub(prev).normalize();
    // Where the strap lies across the top of a shoulder it tips with
    // the slope, outer edge down, so it lies ON the shoulder; up the
    // front and back, where the body is upright, it stays flat.
    const n0 = new THREE.Vector3().crossVectors(A0, t).normalize();
    const A = A0.clone().add(new THREE.Vector3(0, bank * Math.max(0, n0.y), 0)).normalize();
    const n = new THREE.Vector3().crossVectors(A, t).normalize();
    const w = A.clone().multiplyScalar(width / 2);
    const h = n.clone().multiplyScalar(thick / 2);
    const c = P[i];
    rows.push([
      [c.x + h.x + w.x, c.y + h.y + w.y, c.z + h.z + w.z],
      [c.x - h.x + w.x, c.y - h.y + w.y, c.z - h.z + w.z],
      [c.x - h.x - w.x, c.y - h.y - w.y, c.z - h.z - w.z],
      [c.x + h.x - w.x, c.y + h.y - w.y, c.z + h.z - w.z],
    ]);
  }
  return stitch(rows, { capBottom: true, capTop: true });
}

/** Mirror arrays across x = 0, flipping the winding so faces still point out. */
function mirrorX({ positions, indices, colors = null }) {
  const p = positions.slice();
  for (let i = 0; i < p.length; i += 3) p[i] = -p[i];
  const idx = indices.slice();
  for (let i = 0; i < idx.length; i += 3) {
    const t = idx[i + 1];
    idx[i + 1] = idx[i + 2];
    idx[i + 2] = t;
  }
  return { positions: p, indices: idx, colors };
}

/** Concatenates several array sets into one, with their colours if any have them. */
function joinArrays(list) {
  const parts = list.filter(Boolean);
  const coloured = parts.some((a) => a.colors);
  const positions = [];
  const indices = [];
  const colors = coloured ? [] : null;
  parts.forEach(({ positions: p, indices: ix, colors: c }) => {
    const base = positions.length / 3;
    for (let i = 0; i < p.length; i++) positions.push(p[i]);
    for (let i = 0; i < ix.length; i++) indices.push(ix[i] + base);
    if (coloured) {
      if (c) for (let i = 0; i < c.length; i++) colors.push(c[i]);
      else for (let i = 0; i < p.length; i++) colors.push(1);
    }
  });
  return { positions, indices, colors };
}

/** Gives every vertex of a set of arrays one colour. */
function paint(arrays, rgb) {
  const colors = [];
  for (let i = 0; i < arrays.positions.length; i += 3) colors.push(rgb[0], rgb[1], rgb[2]);
  return { ...arrays, colors };
}

/** Moves (and optionally rotates about x then y then z) a set of arrays. */
function placeArrays(arrays, { at = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...at),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])),
    new THREE.Vector3(...scale)
  );
  const v = new THREE.Vector3();
  const p = arrays.positions.slice();
  for (let i = 0; i < p.length; i += 3) {
    v.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(m);
    p[i] = v.x; p[i + 1] = v.y; p[i + 2] = v.z;
  }
  let indices = arrays.indices;
  // A negative scale turns the faces inside out.
  if (scale[0] * scale[1] * scale[2] < 0) {
    indices = indices.slice();
    for (let i = 0; i < indices.length; i += 3) {
      const t = indices[i + 1];
      indices[i + 1] = indices[i + 2];
      indices[i + 2] = t;
    }
  }
  return { positions: p, indices, colors: arrays.colors || null };
}

/**
 * An open grid of rows (bottom to top), each running round the body in
 * the same direction as a loft ring, stitched into a sheet.
 */
function sheetArrays(rows) {
  const pos = [];
  const idx = [];
  const n = rows[0].length;
  rows.forEach((row) => row.forEach((p) => pos.push(p[0], p[1], p[2])));
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  return { positions: pos, indices: idx };
}

/**
 * A hi-vis vest laid over a torso: two front panels with a V-neck
 * between them, and a back panel, all cut away under the arms. It is
 * built in (angle round the body, height) so the neckline and the
 * armholes come out as smooth curves rather than the edge of a ring —
 * a vest that stops in a straight line at the armpits, with braces
 * over the shoulders, is what made the old one look like dungarees.
 */
function vestArrays(rings, { rows = 18, cols = 10 } = {}) {
  const Y0 = 0.13;
  const Y1 = 0.525;
  const neck = (y) => 0.44 * smooth(0.33, Y1, y);
  const arm = (y) => lerp(Math.PI / 2, 0.98, smooth(0.39, Y1, y));
  const panel = (from, to, n) => {
    const out = [];
    for (let i = 0; i <= rows; i++) {
      const y = lerp(Y0, Y1, i / rows);
      const ring = ringAt(rings, y);
      const a0 = from(y);
      const a1 = to(y);
      const row = [];
      for (let j = 0; j <= n; j++) row.push(ringPoint(ring, lerp(a0, a1, j / n)));
      out.push(row);
    }
    return sheetArrays(out);
  };
  return joinArrays([
    panel(neck, arm, cols),
    panel((y) => -arm(y), (y) => -neck(y), cols),
    panel((y) => Math.PI - arm(y), (y) => Math.PI + arm(y), cols * 2),
  ]);
}

/* ============================ the head ============================ */

function sdEllipsoid(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = (x - cx) / rx;
  const py = (y - cy) / ry;
  const pz = (z - cz) / rz;
  const k0 = Math.sqrt(px * px + py * py + pz * pz);
  const k1 = Math.sqrt((px / rx) ** 2 + (py / ry) ** 2 + (pz / rz) ** 2);
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}

function sdCapsule(x, y, z, ax, ay, az, bx, by, bz, r) {
  const pax = x - ax; const pay = y - ay; const paz = z - az;
  const bax = bx - ax; const bay = by - ay; const baz = bz - az;
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - r;
}

const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const smax = (a, b, k) => -smin(-a, -b, k);

/**
 * The head, as a distance field, in head-local metres: origin at the
 * centre of the skull, +Y up, +Z out of the face.
 *
 * Proportions are an adult man's: 15 cm across the cheekbones, 20 cm
 * front to back, 23 cm chin to crown. `shape` varies the jaw, the nose
 * and the cheeks a little so a crowd is not cloned.
 */
function headField(shape) {
  const { jaw = 1, nose = 1, cheek = 1, brow = 1, lips = 1 } = shape;
  return (x0, y, z) => {
    const x = Math.abs(x0);
    // Cranium.
    let d = sdEllipsoid(x, y, z, 0, 0.02, -0.012, 0.0745, 0.099, 0.1);
    // Face mass, and the jaw: wide at its angle, narrowing to the chin.
    d = smin(d, sdEllipsoid(x, y, z, 0, -0.036, 0.026, 0.06 * jaw, 0.072, 0.07), 0.022);
    d = smin(d, sdEllipsoid(x, y, z, 0, -0.05, -0.004, 0.063 * jaw, 0.05, 0.068), 0.022);
    d = smin(d, sdEllipsoid(x, y, z, 0.044 * jaw, -0.06, 0.006, 0.017, 0.019, 0.028), 0.02);
    // Cheekbones.
    d = smin(d, sdEllipsoid(x, y, z, 0.044, -0.012, 0.06, 0.021 * cheek, 0.019, 0.02), 0.02);
    // Brow ridge, which puts the eyes in shadow.
    d = smin(d, sdEllipsoid(x, y, z, 0, 0.034, 0.077, 0.062, 0.017 * brow, 0.019), 0.018);
    // Chin: forward and square, blended in rather than hung below.
    d = smin(d, sdEllipsoid(x, y, z, 0, -0.09, 0.077, 0.021, 0.017, 0.017), 0.02);
    // Eye sockets, carved in under the brow.
    d = smax(d, -sdEllipsoid(x, y, z, 0.031, 0.009, 0.093, 0.0165, 0.0105, 0.0105), 0.012);
    // Nose: a bridge from between the eyes, a tip well out from the
    // face, and the wings either side of the nostrils.
    // Only the root of the nose is in the field. The nose itself has an
    // underside, which no ray from inside the skull can reach, so it is
    // its own mesh (noseArrays) set into the face.
    d = smin(d, sdCapsule(x, y, z, 0, 0.014, 0.088, 0, -0.024, 0.097, 0.0065), 0.012);
    // The muzzle, the lips on it, and the line between them.
    d = smin(d, sdEllipsoid(x, y, z, 0, -0.056, 0.086, 0.03, 0.024, 0.0175), 0.012);
    d = smin(d, sdEllipsoid(x, y, z, 0, -0.0508, 0.0985, 0.0205, 0.0058 * lips, 0.0072 + 0.0012 * (lips - 1)), 0.005);
    d = smin(d, sdEllipsoid(x, y, z, 0, -0.0625, 0.0972, 0.019, 0.0068 * lips, 0.0074 + 0.0014 * (lips - 1)), 0.005);
    d = smax(d, -sdEllipsoid(x, y, z, 0, -0.0568, 0.1045, 0.0195, 0.0011, 0.0068), 0.0016);
    return d;
  };
}

/** Distance along a ray from `o` in direction `d` to the field's surface. */
function castToSurface(field, o, d, offset = 0) {
  const f = (t) => field(o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t) - offset;
  let t = 0;
  const step = 0.0025;
  while (t < 0.3 && f(t) < 0) t += step;
  let lo = Math.max(0, t - step);
  let hi = t;
  for (let i = 0; i < 16; i++) {
    const m = (lo + hi) / 2;
    if (f(m) < 0) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

/**
 * Rays out from the skull. Longitude is bunched towards the face, so
 * the nose and lips get the vertices and the back of the head, which
 * is a smooth curve under a hard hat, does not.
 */
function headRays(seg, rows) {
  const out = [];
  // Rows bunch up just below the equator, where the nose and the mouth
  // are, and spread out over the crown and under the jaw.
  const C = 0.56;
  const A = 0.5;
  const latAt = (v) => Math.PI * (v - (A * (Math.sin(TAU * (v - C)) - Math.sin(-TAU * C))) / TAU);
  for (let i = rows; i >= 0; i--) {
    const lat = latAt(i / rows);
    const row = [];
    if (i === 0 || i === rows) {
      out.push([[0, Math.cos(lat), 0]]);
      continue;
    }
    for (let j = 0; j < seg; j++) {
      const u = j / seg;
      const lon = (u - (0.42 * Math.sin(TAU * u)) / TAU) * TAU;
      row.push([Math.sin(lat) * Math.sin(lon), Math.cos(lat), Math.sin(lat) * Math.cos(lon)]);
    }
    out.push(row);
  }
  return out;
}

const RAY_ORIGIN = [0, -0.012, 0.004];

function headArrays(shape, seg, rows) {
  const field = headField(shape);
  const surface = headRays(seg, rows).map((row) => row.map((d) => {
    const t = castToSurface(field, RAY_ORIGIN, d);
    return [RAY_ORIGIN[0] + d[0] * t, RAY_ORIGIN[1] + d[1] * t, RAY_ORIGIN[2] + d[2] * t];
  }));
  const arrays = stitch(surface);
  return { ...arrays, colors: faceColors(arrays.positions, shape) };
}

/*
 * Colour multipliers painted onto the face: the lips darker and
 * warmer than the skin, the line of the mouth and the nostrils dark,
 * a little shade round the eyes. The material supplies the skin tone;
 * these only shift it, so one sculpt serves every complexion.
 */
function faceColors(positions, { female = false, bindi = false } = {}) {
  const out = [];
  const g = (dx, sx, dy, sy) => Math.exp(-((dx / sx) ** 2) - ((dy / sy) ** 2));
  const lipTint = female ? [0.86, 0.5, 0.54] : [0.86, 0.6, 0.62];
  for (let i = 0; i < positions.length; i += 3) {
    const x = Math.abs(positions[i]);
    const y = positions[i + 1];
    const z = positions[i + 2];
    const front = smooth(0.07, 0.092, z);
    let r = 1;
    let gg = 1;
    let b = 1;
    const lips = Math.max(g(x, 0.022, y + 0.0508, 0.0062), g(x, 0.02, y + 0.0625, 0.0074)) * front;
    r = lerp(r, lipTint[0], lips); gg = lerp(gg, lipTint[1], lips); b = lerp(b, lipTint[2], lips);
    const line = g(x, 0.0205, y + 0.0568, 0.0018) * front;
    r = lerp(r, 0.3, line); gg = lerp(gg, 0.24, line); b = lerp(b, 0.24, line);
    const socket = g(x - 0.031, 0.02, y - 0.012, 0.014) * front;
    r *= 1 - 0.12 * socket; gg *= 1 - 0.14 * socket; b *= 1 - 0.12 * socket;
    if (bindi) {
      const dot = g(x, 0.0042, y - 0.044, 0.0042) * front;
      r = lerp(r, 0.62, dot); gg = lerp(gg, 0.05, dot); b = lerp(b, 0.08, dot);
    }
    out.push(r, gg, b);
  }
  return out;
}

/**
 * Where the hair grows, as a height on the skull by compass angle round
 * it: high over the forehead, down to a sideburn in front of the ear,
 * up and over the ear, and down to the nape at the back.
 */
const HAIRLINE = [
  [0, 0.087], [0.5, 0.083], [0.85, 0.06], [1.12, 0.004], [1.3, 0.002],
  [1.42, 0.036], [1.78, 0.03], [2.1, -0.02], [2.55, -0.046], [Math.PI, -0.052],
];

function hairlineAt(angle) {
  const a = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));
  for (let i = 0; i < HAIRLINE.length - 1; i++) {
    const [a0, y0] = HAIRLINE[i];
    const [a1, y1] = HAIRLINE[i + 1];
    if (a >= a0 && a <= a1) return lerp(y0, y1, (a - a0) / (a1 - a0));
  }
  return HAIRLINE[HAIRLINE.length - 1][1];
}

/**
 * A short, close haircut: a shell over the skull that ends exactly on
 * the hairline. Each column of the shell runs from the crown down to
 * where the hairline is at that angle, so the edge is a clean curve
 * rather than the stair-step you get from cutting triangles out of a
 * sphere. It thins to nothing at the edge, so it grows out of the skin.
 */
function hairArrays(shape, seg, rows, { volume = 0.006 } = {}) {
  const field = headField(shape);
  const lonAt = (j) => {
    const u = j / seg;
    return (u - (0.42 * Math.sin(TAU * u)) / TAU) * TAU;
  };
  const point = (lat, lon, extra) => {
    const d = [Math.sin(lat) * Math.sin(lon), Math.cos(lat), Math.sin(lat) * Math.cos(lon)];
    const t = castToSurface(field, RAY_ORIGIN, d, extra);
    return [RAY_ORIGIN[0] + d[0] * t, RAY_ORIGIN[1] + d[1] * t, RAY_ORIGIN[2] + d[2] * t];
  };
  // The latitude at which each column meets the hairline.
  const edge = [];
  for (let j = 0; j < seg; j++) {
    const lon = lonAt(j);
    const line = hairlineAt(lon);
    let lo = 0.05;
    let hi = Math.PI - 0.2;
    for (let k = 0; k < 18; k++) {
      const mid = (lo + hi) / 2;
      if (point(mid, lon, 0)[1] > line) lo = mid; else hi = mid;
    }
    edge.push(lo);
  }
  const out = [];
  for (let i = rows; i >= 1; i--) {
    const f = i / rows;
    const fade = smooth(1, 0.8, f);
    const row = [];
    for (let j = 0; j < seg; j++) {
      const extra = 0.0008 + (0.0032 + volume * (1 - f)) * fade;
      row.push(point(edge[j] * f, lonAt(j), extra));
    }
    out.push(row);
  }
  out.push([point(0, 0, 0.0032 + volume)]);
  return stitch(out);
}

/**
 * The nose: lofted from the bridge between the eyes down to the tip,
 * the wings either side and the underside with the nostrils in it.
 * Its back half is buried in the face, so it grows out of it.
 */
function noseArrays(scale = 1) {
  const k = scale;
  const rings = [
    { y: -0.0372, rx: 0.0005, rz: 0.0005, cz: 0.1 },
    { y: -0.0362, rx: 0.0125 * k, rz: 0.0062 * k, cz: 0.1012, n: 2.2 },
    { y: -0.0338, rx: 0.0172 * k, rz: 0.0098 * k, cz: 0.1018, n: 2.3 },
    { y: -0.0298, rx: 0.0168 * k, rz: 0.0122 * k, cz: 0.1028, n: 2.2 },
    { y: -0.0248, rx: 0.0118 * k, rz: 0.0128 * k, cz: 0.1032, n: 2.1 },
    { y: -0.0185, rx: 0.0094 * k, rz: 0.0114 * k, cz: 0.1012, n: 2.1 },
    { y: -0.008, rx: 0.0077 * k, rz: 0.0098 * k, cz: 0.0978, n: 2.1 },
    { y: 0.004, rx: 0.0068 * k, rz: 0.0084 * k, cz: 0.0942, n: 2.1 },
    { y: 0.0135, rx: 0.0066, rz: 0.0068, cz: 0.0905, n: 2.1 },
    { y: 0.0205, rx: 0.0005, rz: 0.0005, cz: 0.0885 },
  ];
  const arrays = loftArrays(rings, { seg: 16, capBottom: false, capTop: false });
  // Nostrils: two dark ovals on the underside; the rest a touch warmer
  // than the face, as the tip of a nose is.
  const colors = [];
  for (let i = 0; i < arrays.positions.length; i += 3) {
    const x = Math.abs(arrays.positions[i]);
    const y = arrays.positions[i + 1];
    const z = arrays.positions[i + 2];
    const under = smooth(-0.0335, -0.0365, y);
    const hole = Math.exp(-(((x - 0.0078) / 0.0045) ** 2) - (((z - 0.1015) / 0.0045) ** 2)) * under;
    const tip = Math.exp(-(((y + 0.026) / 0.008) ** 2)) * smooth(0.104, 0.114, z);
    colors.push(lerp(1 + 0.03 * tip, 0.28, hole), lerp(1 - 0.03 * tip, 0.22, hole), lerp(1 - 0.03 * tip, 0.22, hole));
  }
  return { ...arrays, colors };
}

/** An eyeball whose pole looks forward, coloured into sclera, iris and pupil. */
function eyeArrays(radius, { iris = [0.2, 0.12, 0.07] } = {}) {
  const g = new THREE.SphereGeometry(radius, 12, 10);
  g.rotateX(Math.PI / 2);
  const p = g.attributes.position;
  const colors = [];
  for (let i = 0; i < p.count; i++) {
    const zc = p.getZ(i) / radius;
    const angle = Math.acos(clamp(zc, -1, 1));
    let c;
    if (angle < 0.2) c = [0.03, 0.025, 0.02];
    else if (angle < 0.5) c = iris;
    else c = [0.88, 0.85, 0.79];
    colors.push(...c);
  }
  const out = {
    positions: Array.from(p.array),
    indices: Array.from(g.index.array),
    colors,
  };
  g.dispose();
  return out;
}

/* ============================= hands ============================= */

/**
 * A relaxed hand hanging from the wrist, fingers slightly curled, for
 * the arm on the +X side (palm towards -X). Mirror it for the other.
 *
 * `mitten` is the cheap version for crowds: a palm and a finger block.
 */
function handArrays({ mitten = false } = {}) {
  const parts = [];
  // Palm: flattened across the hand, deeper front to back.
  parts.push(shellArrays(0.0155, 0.043, 0.039, {
    seg: 12, rows: 8, n: 2.4, center: [0, -0.048, 0.002],
  }));
  if (mitten) {
    parts.push(shellArrays(0.013, 0.036, 0.035, {
      seg: 10, rows: 6, n: 2.2, center: [-0.006, -0.1, 0.002],
    }));
  } else {
    // Four fingers, index at the front, each curling in towards the palm.
    const fingers = [
      { z: 0.026, len: 0.083, r: 0.0082 },
      { z: 0.0085, len: 0.091, r: 0.0085 },
      { z: -0.0085, len: 0.086, r: 0.0081 },
      { z: -0.024, len: 0.07, r: 0.0072 },
    ];
    fingers.forEach((f) => {
      const pts = [];
      const radii = [];
      let x = -0.001;
      let y = -0.084;
      let angle = 0.08;
      const seg = f.len / 3;
      pts.push([x, y + 0.012, f.z]);
      radii.push(f.r * 1.05);
      for (let k = 0; k < 3; k++) {
        angle += 0.24 + k * 0.1;
        x -= Math.sin(angle) * seg;
        y -= Math.cos(angle) * seg;
        pts.push([x, y, f.z * (1 - k * 0.04)]);
        radii.push(f.r * (1 - k * 0.12));
      }
      parts.push(tubeArrays(pts, radii, { seg: 7, side: [0, 0, 1], capStart: false }));
    });
  }
  // Thumb: off the front edge of the palm, across towards the index.
  parts.push(tubeArrays(
    [[-0.004, -0.022, 0.03], [-0.014, -0.045, 0.043], [-0.02, -0.068, 0.045], [-0.023, -0.085, 0.04]],
    [0.0105, 0.0095, 0.0085, 0.0075],
    { seg: 7, side: [1, 0, 0] }
  ));
  return joinArrays(parts);
}

/* ============================= feet ============================= */

/**
 * A safety boot, in ankle-local space (origin at the ankle joint, sole
 * at y = -0.09). A box toe, a heel, a flat sole, and a shaft that runs
 * up under the trouser hem.
 */
function bootArrays({ low = false } = {}) {
  const seg = low ? 12 : 18;
  const foot = shellArrays(0.054, 0.046, 0.146, {
    seg, rows: low ? 8 : 12, n: 2.6, center: [0, -0.052, 0.062],
    deform: ([x, y, z]) => {
      // A flat sole, and a toe that drops away towards the front.
      let ny = Math.max(y, -0.09);
      const toe = smooth(0.06, 0.205, z);
      if (ny > -0.06) ny = -0.06 + (ny + 0.06) * (1 - toe * 0.62);
      // Slightly wider across the ball of the foot than at the heel.
      const nx = x * (1 + 0.1 * smooth(-0.05, 0.12, z) - 0.12 * smooth(0.15, 0.21, z));
      return [nx, ny, z];
    },
  });
  const shaft = loftArrays([
    { y: -0.07, rx: 0.046, rz: 0.06, cz: 0.0 },
    { y: -0.02, rx: 0.045, rz: 0.054, cz: -0.004 },
    { y: 0.03, rx: 0.044, rz: 0.05, cz: -0.006 },
    { y: 0.075, rx: 0.045, rz: 0.05, cz: -0.006 },
  ], { seg, capBottom: false, capTop: true });
  return joinArrays([foot, shaft]);
}

/** A bare foot, for a worker in chappals. Skin; the sole is separate. */
function bareFootArrays() {
  const foot = shellArrays(0.043, 0.032, 0.122, {
    seg: 14, rows: 9, n: 2.2, center: [0, -0.058, 0.06],
    deform: ([x, y, z]) => {
      let ny = Math.max(y, -0.082);
      const toe = smooth(0.05, 0.18, z);
      if (ny > -0.06) ny = -0.06 + (ny + 0.06) * (1 - toe * 0.7);
      return [x * (1 + 0.12 * smooth(-0.04, 0.12, z)), ny, z];
    },
  });
  const ankle = loftArrays([
    { y: -0.06, rx: 0.034, rz: 0.04 },
    { y: 0.0, rx: 0.033, rz: 0.038 },
    { y: 0.07, rx: 0.036, rz: 0.04 },
  ], { seg: 12, capBottom: false, capTop: true });
  return joinArrays([foot, ankle]);
}

/* ============================ hard hat ============================ */

/**
 * A cap-style hard hat in head-local space: a shell with a peak at the
 * front, a narrow rim round the sides and back, and three ribs over
 * the crown. It sits ON the head: the rim is above the brow and the
 * shell clears the skull by a suspension's depth.
 */
function hardHatArrays({ low = false } = {}) {
  const seg = low ? 16 : 28;
  const RIM_Y = 0.05;
  // Three ribs run front to back over the crown. They are raised out
  // of the shell itself rather than stuck on, so they follow its curve
  // and fade into it at the front and the back.
  const ribs = (x, y, z) => {
    const up = smooth(RIM_Y + 0.03, RIM_Y + 0.075, y);
    const along = smooth(-0.125, -0.07, z) * (1 - smooth(0.07, 0.12, z));
    const centre = Math.exp(-((x / 0.012) ** 2));
    const sides = 0.5 * Math.exp(-(((Math.abs(x) - 0.036) / 0.009) ** 2));
    return 0.006 * up * along * (centre + sides);
  };
  const shell = shellArrays(0.099, 0.104, 0.123, {
    seg, rows: low ? 7 : 12, n: 2.35, center: [0, RIM_Y, -0.008],
    latFrom: 0, latTo: Math.PI / 2, capBottom: true,
    deform: ([x, y, z]) => {
      const lift = ribs(x, y, z);
      const len = Math.hypot(x, y - RIM_Y, z + 0.008) || 1;
      // The back of the shell drops a little lower than the front.
      const tail = 0.012 * smooth(0.0, 0.12, -z) * (1 - smooth(RIM_Y, RIM_Y + 0.02, y));
      return [
        x + (x / len) * lift,
        y + ((y - RIM_Y) / len) * lift - tail,
        z + ((z + 0.008) / len) * lift,
      ];
    },
  });
  // The peak: a blade out over the brow, curving down at its edge.
  const peak = shellArrays(0.092, 0.0065, 0.078, {
    seg: low ? 12 : 20, rows: 4, n: 2.6, center: [0, RIM_Y + 0.003, 0.1],
    deform: ([x, y, z]) => [x, y - 0.02 * smooth(0.11, 0.178, z) - 0.006 * (x / 0.092) ** 2, z],
  });
  // A narrow rim round the sides and back.
  const rim = shellArrays(0.108, 0.005, 0.132, {
    seg, rows: 3, n: 2.35, center: [0, RIM_Y - 0.004, -0.01],
    deform: ([x, y, z]) => [x, y - 0.012 * smooth(0.0, 0.13, -z), z],
  });
  return joinArrays([shell, peak, rim]);
}

/* ========================== the body plan ========================== */

/**
 * Body sections, in the local space of the joint each one hangs from.
 * The numbers are an adult man of about 1.76 m; `build` widens or
 * narrows the trunk.
 */
function bodyPlan(build = 1, belly = 0) {
  const w = build;
  return {
    // Hips joint at 0.94 m. Trousers from the crotch to above the belt.
    pelvis: [
      { y: -0.168, rx: 0.0005, rz: 0.0005, cz: -0.004 },
      { y: -0.158, rx: 0.07 * w, rz: 0.05, cz: -0.006, n: 2 },
      { y: -0.13, rx: 0.135 * w, rz: 0.088, cz: -0.012, n: 2.3 },
      { y: -0.075, rx: 0.168 * w, rz: 0.11, cz: -0.016, n: 2.5 },
      { y: -0.02, rx: 0.176 * w, rz: 0.114, cz: -0.014, n: 2.6 },
      { y: 0.04, rx: 0.17 * w, rz: 0.11 + belly * 0.4, cz: -0.006 + belly * 0.3, n: 2.5 },
      { y: 0.1, rx: 0.159 * w, rz: 0.104 + belly * 0.6, cz: belly * 0.5, n: 2.4 },
      { y: 0.13, rx: 0.152 * w, rz: 0.1 + belly * 0.6, cz: belly * 0.5, n: 2.3 },
    ],
    // Spine joint at the hips. The shirt, from inside the waistband to
    // the base of the neck, through the ribcage and the trapezius.
    torso: [
      { y: 0.07, rx: 0.144 * w, rz: 0.095 + belly * 0.6, cz: belly * 0.5, n: 2.3 },
      { y: 0.12, rx: 0.151 * w, rz: 0.1 + belly, cz: belly * 0.8, n: 2.3 },
      { y: 0.18, rx: 0.149 * w, rz: 0.102 + belly, cz: 0.004 + belly * 0.8, n: 2.3 },
      { y: 0.25, rx: 0.155 * w, rz: 0.108 + belly * 0.7, cz: 0.008 + belly * 0.5, n: 2.4 },
      { y: 0.32, rx: 0.165 * w, rz: 0.117, cz: 0.012, n: 2.5 },
      { y: 0.385, rx: 0.174 * w, rz: 0.121, cz: 0.012, n: 2.6 },
      { y: 0.44, rx: 0.18 * w, rz: 0.116, cz: 0.006, n: 2.7 },
      { y: 0.488, rx: 0.177 * w, rz: 0.104, cz: -0.004, n: 2.7 },
      { y: 0.522, rx: 0.158 * w, rz: 0.09, cz: -0.012, n: 2.5 },
      { y: 0.546, rx: 0.118 * w, rz: 0.075, cz: -0.016, n: 2.3 },
      { y: 0.563, rx: 0.074, rz: 0.062, cz: -0.014, n: 2.1 },
      { y: 0.572, rx: 0.0005, rz: 0.0005, cz: -0.012 },
    ],
    // Leg joint at the hip socket.
    thigh: [
      { y: 0.08, rx: 0.0005, rz: 0.0005 },
      { y: 0.06, rx: 0.06, rz: 0.062 },
      { y: 0.02, rx: 0.084, rz: 0.088 },
      { y: -0.06, rx: 0.084, rz: 0.088, cz: 0.004 },
      { y: -0.16, rx: 0.077, rz: 0.081, cz: 0.007 },
      { y: -0.27, rx: 0.068, rz: 0.072, cz: 0.006 },
      { y: -0.37, rx: 0.059, rz: 0.062, cz: 0.003 },
      { y: -0.44, rx: 0.055, rz: 0.058 },
      { y: -0.475, rx: 0.046, rz: 0.048 },
      { y: -0.49, rx: 0.0005, rz: 0.0005 },
    ],
    // Knee joint. The trouser leg to just above the ankle.
    shin: [
      { y: 0.042, rx: 0.0005, rz: 0.0005 },
      { y: 0.03, rx: 0.046, rz: 0.048 },
      { y: 0.0, rx: 0.055, rz: 0.058 },
      { y: -0.06, rx: 0.056, rz: 0.061, cz: -0.006 },
      { y: -0.15, rx: 0.055, rz: 0.06, cz: -0.009 },
      { y: -0.24, rx: 0.05, rz: 0.054, cz: -0.005 },
      { y: -0.32, rx: 0.049, rz: 0.052, cz: -0.002 },
      { y: -0.37, rx: 0.05, rz: 0.054 },
      { y: -0.372, rx: 0.0005, rz: 0.0005 },
    ],
    // Arm joint at the shoulder. Deltoid, biceps, down to the elbow.
    upperArm: [
      { y: 0.06, rx: 0.0005, rz: 0.0005 },
      { y: 0.048, rx: 0.036, rz: 0.04 },
      { y: 0.02, rx: 0.056, rz: 0.058, cx: 0.006 },
      { y: -0.03, rx: 0.057, rz: 0.058, cx: 0.007 },
      { y: -0.09, rx: 0.05, rz: 0.052, cx: 0.002, cz: 0.003 },
      { y: -0.16, rx: 0.045, rz: 0.048, cz: 0.004 },
      { y: -0.24, rx: 0.041, rz: 0.043, cz: 0.001 },
      { y: -0.29, rx: 0.039, rz: 0.04 },
      { y: -0.315, rx: 0.026, rz: 0.026 },
      { y: -0.325, rx: 0.0005, rz: 0.0005 },
    ],
    // Elbow joint. The forearm to the wrist.
    forearm: [
      { y: 0.032, rx: 0.0005, rz: 0.0005 },
      { y: 0.02, rx: 0.032, rz: 0.034 },
      { y: -0.01, rx: 0.039, rz: 0.042 },
      { y: -0.05, rx: 0.041, rz: 0.043, cz: 0.003 },
      { y: -0.11, rx: 0.035, rz: 0.038, cz: 0.002 },
      { y: -0.18, rx: 0.026, rz: 0.03 },
      { y: -0.235, rx: 0.019, rz: 0.026 },
      { y: -0.258, rx: 0.018, rz: 0.024 },
      { y: -0.268, rx: 0.0005, rz: 0.0005 },
    ],
    // Neck joint.
    neck: [
      { y: -0.03, rx: 0.0005, rz: 0.0005, cz: -0.012 },
      { y: -0.02, rx: 0.064, rz: 0.06, cz: -0.012 },
      { y: 0.03, rx: 0.058, rz: 0.056, cz: -0.006 },
      { y: 0.08, rx: 0.055, rz: 0.055, cz: 0.0 },
      { y: 0.125, rx: 0.053, rz: 0.054, cz: 0.002 },
      { y: 0.15, rx: 0.0005, rz: 0.0005, cz: 0.002 },
    ],
  };
}

/* =========================== the palette =========================== */

const SKIN_TONES = [0xc18a64, 0xa87351, 0x8d5f3f, 0x76492f, 0x5f3a26];
const HAIR = { black: 0x15110e, brown: 0x2b1d14, grey: 0x8b8a86, salt: 0x55524e };
const SHIRTS = [0x8fb0d4, 0x6b93c4, 0xe4e2dc, 0x9aa0a6, 0xb6a27a, 0x7b3037, 0x31405e, 0x6c6c45, 0x8a6b4c, 0xc9b9a0];
const OFFICER_SHIRTS = [0xe8e8e4, 0xb9d0ea, 0xd8dde2];
const TROUSERS = [0x2d394d, 0x3a3c40, 0x8b7a56, 0x4a4936, 0x26272a, 0x5a4a3a];
const GLOVES = [0xb7b6ae, 0xd5b03a, 0x2c2c2c];

/**
 * The people materials, made once per scene and kept on the scene's
 * material set so they are disposed with it.
 */
function palette(mat) {
  if (mat.__people) return mat.__people;
  const cache = new Map();
  const made = (key, make) => {
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key);
  };
  const tag = (m, role) => { m.userData.role = role; return m; };
  const people = {
    skin(tone) {
      // Skin passes some light through, so its shadows are never as
      // dark as cloth's. A little of its own colour as emissive fakes
      // that, and stops a dark complexion going to a black silhouette.
      const glow = (m) => {
        if (!m.userData.glowed) {
          m.emissive = m.color.clone().multiplyScalar(0.2);
          m.userData.glowed = true;
        }
        return m;
      };
      // The two tones the games already name keep their materials.
      if (tone === 0 && mat.skin) return tag(glow(mat.skin), "skin");
      if (tone === 2 && mat.skinDark) return tag(glow(mat.skinDark), "skin");
      return made(`skin${tone}`, () => tag(glow(new THREE.MeshLambertMaterial({ color: SKIN_TONES[tone] })), "skin"));
    },
    /** The face's material: the same tone as the body, plus the painted colours. */
    headSkin(base) {
      return made(`headSkin${base.uuid}`, () => tag(new THREE.MeshLambertMaterial({
        color: base.color.clone(), emissive: base.emissive.clone(), vertexColors: true,
      }), "skin"));
    },
    cloth(hex, role = "cloth") {
      return made(`cloth${hex}`, () => tag(new THREE.MeshLambertMaterial({ color: hex }), role));
    },
    hair(key) {
      return made(`hair${key}`, () => tag(new THREE.MeshLambertMaterial({ color: HAIR[key] || HAIR.black }), "hair"));
    },
    eye() {
      return made("eye", () => tag(new THREE.MeshPhongMaterial({
        vertexColors: true, shininess: 80, specular: 0x444444,
      }), "eye"));
    },
    helmet(base) {
      // The games' named colours, with a gloss, because a hard hat is
      // shiny plastic and a matte one reads as a cloth cap.
      return made(`helmet${base.uuid}`, () => tag(new THREE.MeshPhongMaterial({
        color: base.color.clone(), shininess: 60, specular: 0x5a5a5a,
      }), "helmet"));
    },
    /** Lettering on the back of a vest — "ERT" on the response team. */
    badge(text) {
      return made(`badge${text}`, () => {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 128;
        const c = canvas.getContext("2d");
        c.fillStyle = "#ffffff";
        c.font = "900 92px Arial, Helvetica, sans-serif";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(text, 128, 70);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tag(new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.4 }), "badge");
      });
    },
    tape() {
      return made("tape", () => tag(new THREE.MeshPhongMaterial({
        color: 0xd9dde0, emissive: 0x2a2a2a, shininess: 90, specular: 0x9a9a9a,
      }), "tape"));
    },
    boot(hex) {
      return made(`boot${hex}`, () => tag(new THREE.MeshPhongMaterial({
        color: hex, shininess: 18, specular: 0x222222,
      }), "boot"));
    },
  };
  Object.defineProperty(mat, "__people", { value: people, enumerable: false });
  return people;
}

/* ========================== geometry cache ========================== */

/*
 * The heavy shapes — the sculpted heads and the hands — are computed
 * once per page as plain arrays and turned into geometry once per
 * scene. Arrays are not GPU resources, so keeping them between scenes
 * costs a little memory and never leaks a buffer.
 */
const ARRAYS = new Map();
function arraysFor(key, build) {
  if (!ARRAYS.has(key)) ARRAYS.set(key, build());
  return ARRAYS.get(key);
}

const GEOMETRIES = new WeakMap();
function geometryFor(geo, key, build) {
  if (!GEOMETRIES.has(geo)) GEOMETRIES.set(geo, new Map());
  const map = GEOMETRIES.get(geo);
  if (!map.has(key)) map.set(key, toGeometry(arraysFor(key, build)));
  return map.get(key);
}

/** Three face shapes, so a crowd has different faces, not one face. */
const FACES = [
  { jaw: 1, nose: 1, cheek: 1, brow: 1 },
  { jaw: 1.08, nose: 1.12, cheek: 1.1, brow: 1.1 },
  { jaw: 0.94, nose: 0.92, cheek: 0.95, brow: 0.95 },
];
/* A woman's face: a narrower, softer jaw, a smaller nose, fuller lips
 * and less of a brow ridge. */
const FACES_F = [
  { jaw: 0.88, nose: 0.86, cheek: 1.04, brow: 0.78, lips: 1.18, female: true },
  { jaw: 0.91, nose: 0.9, cheek: 1.0, brow: 0.82, lips: 1.12, female: true },
];

/* Kurti colours, and the darker trousers worn under them. */
const TUNICS = [0x7a2e4d, 0x2f6f73, 0xc98b2a, 0x5a3f8c, 0xa33b3b, 0x3e6fa8, 0xc77f92, 0x4f7a3a];
const TROUSERS_F = [0x2b2b33, 0x3a3f58, 0x463a52, 0x2d394d];

/**
 * A woman's proportions, from the man's: narrower shoulders, a waist,
 * a bust, wider hips; slimmer arms, legs and neck.
 */
function feminise(plan) {
  const each = (rings, f) => rings.map((r) => ({ ...r, ...f(r) }));
  return {
    pelvis: each(plan.pelvis, (r) => ({
      rx: r.rx * (r.y <= 0.06 ? 1.08 : 0.97),
      rz: r.rz * 1.03,
    })),
    torso: each(plan.torso, (r) => {
      const waist = r.y > 0.08 && r.y < 0.3 ? 0.89 : 1;
      const shoulders = r.y >= 0.44 ? 0.87 : r.y >= 0.36 ? 0.93 : 1;
      const bust = Math.exp(-(((r.y - 0.355) / 0.055) ** 2));
      return {
        rx: r.rx * waist * shoulders,
        rz: r.rz * (r.y > 0.08 && r.y < 0.3 ? 0.93 : 1) + 0.024 * bust,
        cz: (r.cz || 0) + 0.018 * bust,
      };
    }),
    thigh: each(plan.thigh, (r) => {
      const k = r.y > -0.2 ? 1.0 : 0.92;
      return { rx: r.rx * k, rz: r.rz * k };
    }),
    shin: each(plan.shin, (r) => ({ rx: r.rx * 0.9, rz: r.rz * 0.9 })),
    upperArm: each(plan.upperArm, (r) => ({ rx: r.rx * 0.86, rz: r.rz * 0.86, cx: (r.cx || 0) * 0.6 })),
    forearm: each(plan.forearm, (r) => ({ rx: r.rx * 0.87, rz: r.rz * 0.87 })),
    neck: each(plan.neck, (r) => ({ rx: r.rx * 0.86, rz: r.rz * 0.86 })),
  };
}

/** Gold studs, coloured by vertex for the shiny vertex-coloured material. */
function studArrays(points, radius) {
  return joinArrays(points.map((p) => paint(shellArrays(radius, radius, radius, { seg: 8, rows: 5, center: p }), [0.95, 0.74, 0.26])));
}

/** A long braid down the back, as Tamil women wear it under a hat. */
function braidArrays() {
  const pts = [];
  const radii = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push([0.004 * Math.sin(i * 1.7), -0.045 - t * 0.33, -0.098 - t * 0.04]);
    // The plaits: a little fuller and thinner in turn, tapering.
    radii.push((0.021 - t * 0.011) * (i % 2 ? 0.86 : 1));
  }
  return tubeArrays(pts, radii, { seg: 8, side: [1, 0, 0] });
}

/* ============================ baking ============================ */

/**
 * Bakes a joint's meshes down to one mesh per material.
 *
 * Within one joint nothing moves relative to anything else — the skull,
 * the ears and the eyes all turn with the head — so they can be merged
 * and still animate, because it is the joint group that rotates. Child
 * groups are left alone: the knee has to keep moving inside the leg.
 *
 * If a merge is refused (mismatched attributes), the parts are kept as
 * they were rather than silently dropped.
 */
function compactJoint(group) {
  const byMaterial = new Map();
  const keep = [];
  group.children.forEach((child) => {
    if (!child.isMesh) { keep.push(child); return; }
    if (!byMaterial.has(child.material)) byMaterial.set(child.material, []);
    byMaterial.get(child.material).push(child);
  });
  if (!byMaterial.size) return;
  group.clear();
  keep.forEach((c) => group.add(c));
  byMaterial.forEach((meshes, material) => {
    const baked = meshes.map((m) => {
      m.updateMatrix();
      const g = m.geometry.clone().applyMatrix4(m.matrix);
      if (!g.index) {
        const n = g.attributes.position.count;
        g.setIndex(Array.from({ length: n }, (_, i) => i));
      }
      // A mirrored part (the left arm is the right arm with x negated)
      // comes out inside out once the mirror is baked into it.
      if (m.matrix.determinant() < 0) {
        const ix = g.index.array;
        for (let i = 0; i < ix.length; i += 3) {
          const t = ix[i + 1];
          ix[i + 1] = ix[i + 2];
          ix[i + 2] = t;
        }
        g.index.needsUpdate = true;
      }
      return g;
    });
    const merged = baked.length === 1 ? baked[0] : mergeGeometries(baked, false);
    if (!merged) {
      meshes.forEach((m) => group.add(m));
      return;
    }
    if (baked.length > 1) baked.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });
}

/* ============================= the person ============================= */

let nextSeed = 1;

/** Pick from a list with a generator. */
const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];

/**
 * A person.
 *
 * Every option the games already pass still works, with the same
 * meaning. New ones add variety; when they are left out they come from
 * `seed`, so each figure in a scene is a different person.
 *
 * @param helmet, vest, harness, boots  the PPE (boots:false = chappals)
 * @param helmetColor  "yellow" | "white" | "blue" | "orange" | "green"
 * @param vestColor    as helmetColor, or "hiVis" (the default)
 * @param role         "worker" | "officer" (white hat, orange vest,
 *                     clipboard, long-sleeved shirt)
 * @param skin         "skin" | "dark" | 0-4, or left out for any tone
 * @param detail       "high" | "low" (background crowds)
 * @param seed         which person; the same seed is the same person
 * @param shirt, trousers   a colour as a number, or left out
 * @param sleeves      "long" | "short"
 * @param gloves       true / false / a colour
 * @param hair         "black" | "brown" | "grey" | "salt" | "none"
 * @param moustache    true / false
 * @param build        0.92 (slight) - 1.1 (heavy)
 */
export function buildWorker(geo, mat, {
  helmet = true, vest = true, harness = false, boots = true,
  helmetColor = null, pose = "stand", skin = null, scale = 1,
  role = "worker", vestColor = null, detail = "high",
  seed = null, shirt = null, trousers = null, sleeves = null,
  gloves = null, hair = null, moustache = null, build = null,
  gender = "male", badge = null, braid = null, bindi = null, stance = null,
} = {}) {
  const r = rng(seed ?? nextSeed++);
  // "any" lets the seed decide, about one in three a woman, for crowds.
  const female = gender === "female" || (gender === "any" && r() < 0.34);
  const officer = role === "officer";
  // On the lowest graphics setting everybody is built at crowd detail:
  // a full figure is ~18k triangles against ~9k, and the phones that
  // end up on "low" are the ones that cannot spare the difference.
  const lowQuality = (geo.cyl?.parameters?.radialSegments ?? 12) <= 8;
  const low = detail === "low" || lowQuality;
  const P = palette(mat);

  /* ---- who this is ---- */
  const toneIndex = skin === "skin" ? 0
    : skin === "dark" ? 2
      : Number.isInteger(skin) ? clamp(skin, 0, SKIN_TONES.length - 1)
        : Math.floor(r() * SKIN_TONES.length);
  const skinMat = P.skin(toneIndex);
  const older = r() < (female ? 0.1 : 0.18);
  const hairKey = hair || (older ? pick(r, ["grey", "salt"]) : r() < 0.85 ? "black" : "brown");
  const hairMat = hairKey === "none" ? null : P.hair(hairKey);
  const hasMoustache = !female && (moustache ?? (r() < 0.62));
  const bodyBuild = build ?? (female ? 0.95 + r() * 0.08 : 0.94 + r() * 0.14);
  const belly = female ? 0 : older ? 0.006 + r() * 0.01 : r() * 0.006;
  // A man here is 1.69-1.82 m, a woman 1.58-1.66 m.
  const heightScale = female ? 0.9 + r() * 0.045 : 0.96 + r() * 0.07;
  const longSleeves = sleeves ? sleeves === "long" : (officer || harness || female || r() < 0.55);
  const shirtHex = shirt ?? (female && !officer ? pick(r, TUNICS) : officer ? pick(r, OFFICER_SHIRTS) : pick(r, SHIRTS));
  const trouserHex = trousers ?? (female ? pick(r, TROUSERS_F)
    : officer ? pick(r, [0x26272a, 0x2d394d, 0x3a3c40]) : pick(r, TROUSERS));
  const wearsBraid = female && (braid ?? r() < 0.6);
  const wearsBindi = female && (bindi ?? r() < 0.55);
  const noseStud = female && r() < 0.45;
  const gloveHex = gloves === true ? pick(r, GLOVES)
    : typeof gloves === "number" ? gloves
      : gloves === false || officer ? null
        : r() < 0.35 ? pick(r, GLOVES) : null;
  const faceBase = female ? FACES_F[Math.floor(r() * FACES_F.length)] : FACES[Math.floor(r() * FACES.length)];
  const face = { ...faceBase, bindi: wearsBindi };
  const faceKey = `${female ? "f" : "m"}${(female ? FACES_F : FACES).indexOf(faceBase)}${wearsBindi ? "b" : ""}`;

  const shirtMat = P.cloth(shirtHex);
  const trouserMat = P.cloth(trouserHex);
  const beltMat = mat.black;
  const named = {
    yellow: mat.yellow, white: mat.white, blue: mat.blue, orange: mat.orange,
    green: mat.green, hiVis: mat.hiVis, red: mat.red,
  };
  const helmetBase = named[helmetColor] || (officer ? mat.white : mat.yellow);
  const vestMat = named[vestColor] || (officer ? mat.orange : mat.hiVis);
  const handMat = gloveHex ? P.cloth(gloveHex, "glove") : skinMat;
  const bootMat = P.boot(r() < 0.7 ? 0x1f1f21 : 0x4a3222);

  const plan = female ? feminise(bodyPlan(bodyBuild, belly)) : bodyPlan(bodyBuild, belly);
  // Every cached shape is keyed by body, so a woman's never borrows a man's.
  const g = female ? "f" : "m";
  const seg = low ? 12 : 18;
  const limbSeg = low ? 10 : 14;

  const group = new THREE.Group();

  /** A mesh from cached arrays, placed in a joint. */
  const part = (parent, material, key, build, { at = [0, 0, 0], rot = [0, 0, 0], scale: s = [1, 1, 1], shadow = true } = {}) => {
    const m = new THREE.Mesh(geometryFor(geo, `${g}:${key}`, build), material);
    m.position.set(...at);
    m.rotation.set(...rot);
    m.scale.set(...s);
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const loftPart = (parent, material, key, rings, opts = {}) => {
    const n = opts.seg || seg;
    return part(parent, material, `loft:${key}:${n}`, () => loftArrays(rings, { ...opts, seg: n }), opts);
  };

  /* ------------------------------ hips ------------------------------ */
  const HIP_Y = 0.94;
  const hips = new THREE.Group();
  hips.position.y = HIP_Y;
  group.add(hips);

  const buildKey = `${bodyBuild.toFixed(2)}:${belly.toFixed(3)}`;
  loftPart(hips, trouserMat, `pelvis:${buildKey}`, plan.pelvis);
  if (female) {
    // The tunic (kurti) over the hips, flared enough at its hem for the
    // legs to stride inside it.
    // Sized from the hips it hangs over, so the trousers never show
    // through its sides.
    const over = (y, ease, flare) => {
      const r = ringAt(plan.pelvis, Math.max(-0.13, y)) || plan.pelvis[plan.pelvis.length - 1];
      return { y, rx: r.rx + ease + flare, rz: r.rz + ease + flare * 0.8, cz: r.cz || 0, n: r.n || 2.3 };
    };
    loftPart(hips, shirtMat, `tunic:${buildKey}`, [
      over(-0.135, 0.018, 0.05), over(-0.07, 0.016, 0.02), over(0.0, 0.014, 0.004),
      over(0.09, 0.012, 0), over(0.15, 0.01, 0),
    ], { capBottom: false, capTop: false });
  } else {
    // The belt, and its buckle at the front.
    const beltRings = inflate([ringAt(plan.pelvis, 0.078), ringAt(plan.pelvis, 0.112)].map((x) => ({ ...x, n: 2.4 })), 0.0045);
    loftPart(hips, beltMat, `belt:${buildKey}`, beltRings, { capBottom: false, capTop: false });
    const buckleZ = (surfaceZ(plan.pelvis, 0, 0.095, 1) || 0.11) + 0.006;
    part(hips, beltMat, "buckle", () => shellArrays(0.022, 0.017, 0.006, { seg: 8, rows: 4, n: 3 }), { at: [0, 0.095, buckleZ] });
  }

  /* ------------------------------ legs ------------------------------ */
  const legs = [];
  [-1, 1].forEach((side) => {
    const leg = new THREE.Group();
    leg.position.set(side * (female ? 0.096 : 0.092), 0, 0);
    loftPart(leg, trouserMat, "thigh", plan.thigh, { seg: limbSeg });
    if (harness) {
      // Leg loops round the top of each thigh.
      const loop = inflate([ringAt(plan.thigh, -0.11), ringAt(plan.thigh, -0.08)], 0.006);
      loftPart(leg, mat.orange, "legloop", loop, { seg: limbSeg, capBottom: false, capTop: false });
    }

    const knee = new THREE.Group();
    knee.position.y = -0.44;
    loftPart(knee, trouserMat, "shin", plan.shin, { seg: limbSeg });

    const ankle = new THREE.Group();
    ankle.position.y = -0.41;
    if (boots) {
      part(ankle, bootMat, `boot:${low}`, () => bootArrays({ low }), { scale: female ? [0.9, 1, 0.9] : [1, 1, 1] });
    } else {
      // Chappals: a bare foot on a thin sole with a strap over it.
      part(ankle, skinMat, "barefoot", bareFootArrays);
      part(ankle, mat.black, "chappal", () => shellArrays(0.05, 0.007, 0.135, {
        seg: 14, rows: 3, n: 2.6, center: [0, -0.084, 0.058],
      }));
      part(ankle, mat.black, "chappalStrap", () => shellArrays(0.046, 0.006, 0.014, {
        seg: 10, rows: 3, n: 2.2, center: [0, -0.052, 0.112],
      }));
    }
    knee.add(ankle);
    knee.userData.ankle = ankle;
    leg.add(knee);
    leg.userData.knee = knee;
    leg.userData.ankle = ankle;
    hips.add(leg);
    legs.push(leg);
  });

  /* ------------------------------ torso ------------------------------ */
  const spine = new THREE.Group();
  hips.add(spine);
  loftPart(spine, shirtMat, `torso:${buildKey}`, plan.torso);
  // Collar, standing up round the base of the neck.
  loftPart(spine, shirtMat, "collar", [
    { y: 0.538, rx: 0.08, rz: 0.072, cz: -0.006 },
    { y: 0.566, rx: 0.07, rz: 0.066, cz: -0.004 },
    { y: 0.578, rx: 0.066, rz: 0.064, cz: -0.002 },
  ], { capBottom: false, capTop: false });

  if (vest) {
    const tape = P.tape();
    const body = inflate(plan.torso, 0.011);
    part(spine, vestMat, `vest:${buildKey}:${low}`, () => vestArrays(body, { rows: low ? 10 : 18, cols: low ? 6 : 10 }));
    // Over each shoulder the front and back panels meet in a strap.
    const strapX = 0.114 * bodyBuild;
    [-1, 1].forEach((side) => {
      const path = pathOverBody(body, side * strapX, { yFront: 0.47, yBack: 0.47, center: [0.43, -0.004] });
      part(spine, vestMat, `vestStrap:${side}:${buildKey}`, () => strapArrays(path, { width: 0.064, thick: 0.006, bank: -side * 0.6 }));
      // A stripe of reflective tape up the front, over the shoulder
      // and down the back.
      const tapePath = pathOverBody(body, side * strapX, { yFront: 0.2, yBack: 0.2, center: [0.43, -0.004], lift: 0.008 });
      part(spine, tape, `vestStrapTape:${side}:${buildKey}`, () => strapArrays(tapePath, { width: 0.03, thick: 0.004, bank: -side * 0.6 }));
    });
    // Two bands of tape round the body.
    [0.22, 0.32].forEach((y) => {
      const band = inflate([ringAt(plan.torso, y - 0.019), ringAt(plan.torso, y + 0.019)], 0.0145);
      loftPart(spine, tape, `vestBand:${y}:${buildKey}`, band, { capBottom: false, capTop: false });
    });
  }

  if (badge) {
    const backZ = (surfaceZ(inflate(plan.torso, vest ? 0.011 : 0.002), 0, 0.37, -1) || -0.13) - 0.006;
    const plate = new THREE.Mesh(geo.plane, P.badge(badge));
    plate.scale.set(0.2, 0.1, 1);
    plate.rotation.y = Math.PI;
    plate.position.set(0, 0.37, backZ);
    spine.add(plate);
  }

  if (harness) {
    const body = inflate(plan.torso, vest ? 0.017 : 0.006);
    [-1, 1].forEach((side) => {
      const path = pathOverBody(body, side * 0.074, { yFront: 0.08, yBack: 0.12, center: [0.42, -0.004], lift: 0.004 });
      part(spine, mat.orange, `harnessStrap:${side}:${buildKey}:${vest}`, () => strapArrays(path, { width: 0.042, thick: 0.007, bank: -side * 0.45 }));
    });
    // Chest strap with its buckle, and the D-ring between the shoulder blades.
    const chestZ = (surfaceZ(body, 0, 0.37, 1) || 0.13) + 0.006;
    part(spine, mat.orange, "harnessChest", () => strapArrays(
      [[-0.085, 0.37, chestZ - 0.012], [0, 0.37, chestZ], [0.085, 0.37, chestZ - 0.012]],
      { width: 0.035, thick: 0.007, across: [0, 1, 0] }
    ));
    const backZ = (surfaceZ(body, 0, 0.42, -1) || -0.12) - 0.012;
    const ring = new THREE.Mesh(geometryFor(geo, "dring", () => {
      const t = new THREE.TorusGeometry(0.026, 0.0055, 6, 12);
      const out = { positions: Array.from(t.attributes.position.array), indices: Array.from(t.index.array) };
      t.dispose();
      return out;
    }), mat.orange);
    ring.position.set(0, 0.42, backZ);
    spine.add(ring);
    // The lanyard, hanging from the D-ring down the back to its hook.
    part(spine, mat.orange, `lanyard:${buildKey}`, () => tubeArrays(
      [[0, 0.4, backZ - 0.01], [0.02, 0.3, backZ - 0.025], [0.035, 0.18, backZ - 0.02], [0.04, 0.08, backZ]],
      0.008, { seg: 6, side: [1, 0, 0] }
    ));
    // Waist strap.
    const waist = inflate([ringAt(plan.torso, 0.1), ringAt(plan.torso, 0.135)], vest ? 0.016 : 0.006);
    loftPart(spine, mat.orange, `harnessWaist:${buildKey}:${vest}`, waist, { capBottom: false, capTop: false });
  }

  /* ------------------------------ arms ------------------------------ */
  const arms = [];
  [-1, 1].forEach((side) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.183 * bodyBuild * (female ? 0.9 : 1), female ? 0.488 : 0.495, 0);
    const mirror = side < 0 ? [-1, 1, 1] : [1, 1, 1];
    const upper = plan.upperArm;
    if (longSleeves) {
      loftPart(arm, shirtMat, "upperArm", upper, { seg: limbSeg, scale: mirror });
    } else {
      // Short sleeve to mid upper arm, then skin.
      const sleeve = inflate(upper.filter((x) => x.y >= -0.13), 0.006);
      sleeve.push({ y: -0.13, rx: 0.0005, rz: 0.0005 });
      loftPart(arm, shirtMat, "sleeve", [...sleeve.filter((x) => x.y > -0.13), { y: -0.135, rx: 0.052, rz: 0.054, cz: 0.004 }],
        { seg: limbSeg, capBottom: false, scale: mirror });
      loftPart(arm, skinMat, "upperArmSkin", upper.filter((x) => x.y <= -0.06), { seg: limbSeg, scale: mirror });
    }

    const elbow = new THREE.Group();
    elbow.position.y = -0.29;
    if (longSleeves) {
      loftPart(elbow, shirtMat, "forearmSleeve", inflate(plan.forearm, 0.005).filter((x) => x.y >= -0.22)
        .concat([{ y: -0.235, rx: 0.028, rz: 0.032 }]), { seg: limbSeg, capBottom: false, scale: mirror });
      // Wrist below the cuff.
      loftPart(elbow, skinMat, "wrist", plan.forearm.filter((x) => x.y <= -0.17), { seg: limbSeg, scale: mirror });
    } else {
      loftPart(elbow, skinMat, "forearm", plan.forearm, { seg: limbSeg, scale: mirror });
    }

    const hand = new THREE.Group();
    hand.position.y = -0.255;
    const handGeo = geometryFor(geo, `hand:${low}:${side}`, () => {
      const a = handArrays({ mitten: low });
      return side < 0 ? mirrorX(a) : a;
    });
    const handMesh = new THREE.Mesh(handGeo, handMat);
    if (female) handMesh.scale.setScalar(0.9);
    handMesh.castShadow = true;
    hand.add(handMesh);
    elbow.add(hand);
    arm.userData.hand = hand;
    arm.userData.side = side;
    arm.add(elbow);
    arm.userData.elbow = elbow;
    spine.add(arm);
    arms.push(arm);
  });

  /* -------------------------- neck and head -------------------------- */
  const neck = new THREE.Group();
  neck.position.y = 0.545;
  spine.add(neck);
  loftPart(neck, skinMat, "neck", plan.neck, { seg: limbSeg });

  const head = new THREE.Group();
  head.position.set(0, 0.168, 0.008);
  if (female) head.scale.setScalar(0.96);
  neck.add(head);

  const headSeg = low ? 30 : 60;
  const headRows = low ? 22 : 46;
  const faceMat = P.headSkin(skinMat);
  part(head, faceMat, `head:${faceKey}:${headSeg}`, () => headArrays(face, headSeg, headRows));
  part(head, faceMat, `nose:${faceKey}`, () => noseArrays(face.nose));
  // Ears: a shell with a fold, set back and angled the way ears are.
  [-1, 1].forEach((side) => {
    part(head, faceMat, `ear:${side}`, () => {
      const ear = shellArrays(0.0085, 0.029, 0.019, {
        seg: 10, rows: 8, n: 2,
        deform: ([x, y, z]) => [x + (Math.abs(z) < 0.012 && Math.abs(y) < 0.018 ? -0.003 : 0), y, z],
      });
      return paint(placeArrays(ear, { at: [side * 0.071, -0.008, -0.008], rot: [0.12, side * 0.22, side * 0.06] }), [0.94, 0.9, 0.9]);
    });
  });
  // Eyes in the sockets, with the upper lid over the top of each.
  const eyeMat = P.eye();
  [-1, 1].forEach((side) => {
    part(head, eyeMat, "eyeball", () => eyeArrays(female ? 0.0117 : 0.0112), { at: [side * 0.031, 0.008, 0.0758] });
    part(head, faceMat, `lid:${side}`, () => paint(placeArrays(
      shellArrays(0.0142, 0.0085, 0.0128, { seg: 10, rows: 5, latFrom: 0, latTo: Math.PI * 0.62, capBottom: true }),
      { at: [side * 0.031, 0.0126, 0.0762], rot: [-0.32, 0, 0] }
    ), [0.86, 0.8, 0.8]));
    part(head, faceMat, `lowerLid:${side}`, () => paint(placeArrays(
      shellArrays(0.0136, 0.0062, 0.0122, { seg: 10, rows: 4, latFrom: Math.PI * 0.6, latTo: Math.PI, capTop: true }),
      { at: [side * 0.031, 0.0052, 0.0766], rot: [0.3, 0, 0] }
    ), [0.92, 0.88, 0.88]));
  });
  if (hairMat) {
    part(head, hairMat, `hair:${faceKey}:${low}`, () => hairArrays(face, low ? 30 : 48, low ? 20 : 34));
    // Eyebrows.
    [-1, 1].forEach((side) => {
      part(head, hairMat, `brow:${side}:${faceKey}`, () => placeArrays(
        shellArrays(0.0162, female ? 0.0018 : 0.0026, 0.0046, {
          seg: 10, rows: 4, deform: ([x, y, z]) => [x, y - (female ? 15 : 9) * x * x, z],
        }),
        { at: [side * 0.032, 0.0275, 0.0912 + (face.brow - 1) * 0.004], rot: [0.25, side * 0.22, side * -0.08] }
      ));
    });
    if (female) {
      // Long hair, worn up: a braid down the back, or a bun at the nape.
      if (wearsBraid) part(head, hairMat, "braid", braidArrays);
      else part(head, hairMat, "bun", () => shellArrays(0.043, 0.036, 0.033, { seg: 12, rows: 8, center: [0, -0.04, -0.098] }));
    }
    if (hasMoustache) {
      [-1, 1].forEach((side) => {
        part(head, hairMat, `moustache:${side}:${faceKey}`, () => placeArrays(
          shellArrays(0.0135, 0.0052, 0.0058, { seg: 8, rows: 4 }),
          { at: [side * 0.0112, -0.0442, 0.1036 + (face.nose - 1) * 0.002], rot: [0.2, side * 0.38, side * 0.22] }
        ));
      });
    }
  }

  if (female) {
    // Gold ear studs, and a nose stud on some — in the eyes' shiny,
    // vertex-coloured material, so they cost no draw call.
    const studs = [[-0.077, -0.032, -0.003], [0.077, -0.032, -0.003]];
    if (noseStud) studs.push([0.0128, -0.03, 0.1035]);
    part(head, eyeMat, `studs:${noseStud}`, () => studArrays(studs, 0.0034));
  }

  if (helmet) {
    part(head, P.helmet(helmetBase), `hardhat:${low}`, () => hardHatArrays({ low }));
  }

  if (officer) {
    // A clipboard in the hand. It is what makes somebody read as the
    // person inspecting rather than the person working, before you are
    // close enough to see the vest colour.
    const board = new THREE.Group();
    board.position.set(arms[0].userData.side * -0.012, -0.075, 0.035);
    board.rotation.set(-1.25, 0, arms[0].userData.side * -0.15);
    const slab = (material, w, h, d, x, y, z) => {
      const m = new THREE.Mesh(geo.box, material);
      m.scale.set(w, h, d);
      m.position.set(x, y, z);
      m.castShadow = true;
      board.add(m);
    };
    slab(mat.timber, 0.2, 0.01, 0.27, 0, 0, 0);
    slab(mat.white, 0.17, 0.006, 0.22, 0, 0.008, -0.014);
    slab(mat.black, 0.08, 0.014, 0.026, 0, 0.012, 0.11);
    compactJoint(board);
    arms[0].userData.hand.add(board);
    arms[0].userData.board = board;
  }

  group.userData.rig = {
    hips, spine, neck, head,
    legL: legs[0], legR: legs[1], armL: arms[0], armR: arms[1],
  };
  // What a radio, phone or clipboard is made from, if an action calls
  // for one (see HELD).
  group.userData.kit = { geo, mat };
  group.userData.role = role;
  group.userData.pose = pose;
  // Each figure's own offset into the idle cycle, so a yard full of
  // people does not breathe in unison.
  group.userData.idleOffset = r() * 12;
  // How they stand about when there is nothing to do. Somebody holding
  // a clipboard keeps their arms down; everybody else is one of the
  // usual ways, so a yard of people does not stand like dummies.
  const roll = r();
  group.userData.stance = stance || (arms[0].userData.board ? "relaxed"
    : roll < 0.4 ? "relaxed" : roll < 0.6 ? "hips" : roll < 0.8 ? "folded" : "behind");
  group.userData.worker = { helmet, vest, harness, boots };
  group.userData.person = {
    gender: female ? "female" : "male",
    tone: toneIndex, hair: hairKey, moustache: hasMoustache,
    sleeves: longSleeves ? "long" : "short", seed,
    braid: wearsBraid, bindi: wearsBindi, badge,
  };

  // Bake each joint down to one mesh per material. Done last, so
  // everything is in place; the rig still works because the joint
  // groups rotate, not the parts inside them.
  [hips, spine, neck, head, ...legs, ...arms].forEach(compactJoint);
  legs.forEach((leg) => {
    compactJoint(leg.userData.knee);
    compactJoint(leg.userData.ankle);
  });
  arms.forEach((arm) => {
    compactJoint(arm.userData.elbow);
    compactJoint(arm.userData.hand);
  });

  if (heightScale !== 1) group.scale.setScalar(heightScale);
  if (scale !== 1) group.scale.multiplyScalar(scale);

  poseWorker(group, { pose, phase: 0, moving: false });
  return group;
}

/* ============================ the gait ============================ */

/**
 * A periodic curve through keyframes, for one joint over one stride.
 * Keys are [fraction of the stride, degrees]; the curve wraps, and is a
 * cubic through the keys so it has no corners.
 */
function gaitCurve(keys) {
  const K = keys.map(([p, deg]) => [p, (deg * Math.PI) / 180]);
  const n = K.length;
  const at = (i) => {
    const k = ((i % n) + n) % n;
    const wrap = Math.floor(i / n);
    return [K[k][0] + wrap, K[k][1]];
  };
  const slope = (i) => {
    const [p0, v0] = at(i - 1);
    const [p1, v1] = at(i + 1);
    return (v1 - v0) / (p1 - p0);
  };
  return (phase) => {
    const p = phase - Math.floor(phase);
    let i = n - 1;
    for (let k = 0; k < n; k++) {
      if (K[k][0] <= p) i = k;
    }
    const [p0, v0] = at(i);
    const [p1, v1] = at(i + 1);
    let q = p;
    if (q < p0) q += 1;
    const h = p1 - p0;
    const t = (q - p0) / h;
    const m0 = slope(i) * h;
    const m1 = slope(i + 1) * h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * v0 + (t3 - 2 * t2 + t) * m0
      + (-2 * t3 + 3 * t2) * v1 + (t3 - t2) * m1;
  };
}

/*
 * Joint angles over one stride, from heel strike (0) of that leg, in
 * anatomical degrees: hip flexion (+ forward), knee flexion, ankle
 * dorsiflexion (+ toes up). Shaped on published normal-gait curves —
 * the small knee bend as the heel takes the weight, the big one in
 * swing, the push-off at the ankle — because those are what the eye
 * reads as somebody walking.
 */
const WALK = {
  hip: gaitCurve([[0, 27], [0.1, 24], [0.3, 8], [0.5, -10], [0.6, -6], [0.72, 12], [0.86, 30]]),
  knee: gaitCurve([[0, 4], [0.12, 17], [0.25, 9], [0.4, 4], [0.55, 22], [0.63, 42], [0.72, 60], [0.82, 44], [0.92, 12]]),
  ankle: gaitCurve([[0, 1], [0.07, -6], [0.18, 3], [0.42, 10], [0.52, 4], [0.62, -17], [0.7, -9], [0.82, 2], [0.92, 3]]),
};
const RUN = {
  hip: gaitCurve([[0, 33], [0.12, 22], [0.3, -10], [0.4, -17], [0.55, 8], [0.72, 52], [0.85, 58]]),
  knee: gaitCurve([[0, 22], [0.12, 40], [0.3, 22], [0.4, 28], [0.55, 88], [0.66, 118], [0.78, 96], [0.9, 42]]),
  ankle: gaitCurve([[0, 4], [0.12, 16], [0.3, -8], [0.4, -26], [0.55, -12], [0.75, 4]]),
};

/*
 * Where in its stride the -X leg is for a given `phase`. The offset is
 * chosen so phase PI/2 has that leg well forward and 3PI/2 has it well
 * back, which is what the games and the tests have always assumed.
 */
const PHASE_OFFSET = 0.65;

/** Every value a pose sets, so two poses can be blended. */
const POSE_KEYS = [
  "hipsX", "hipsRotX", "hipsRotY", "hipsRotZ", "hipsY",
  "spineX", "spineY", "spineZ", "neckX", "headX", "headY", "headZ",
  "legL", "legLz", "kneeL", "ankleL", "legR", "legRz", "kneeR", "ankleR",
  "armLx", "armLy", "armLz", "elbowL", "handL",
  "armRx", "armRy", "armRz", "elbowR", "handR",
];

function blankPose() {
  const p = { ground: true };
  POSE_KEYS.forEach((k) => { p[k] = 0; });
  p.hipsY = 0.94;
  return p;
}

const D = Math.PI / 180;

/*
 * A pose is written in anatomical terms — flexion forward, abduction
 * outward — and turned into rig rotations here, in one place, so the
 * sign conventions cannot be got backwards again pose by pose.
 */
function setLeg(p, side, { hip = 0, knee = 0, ankle = 0, out = 0 }) {
  const L = side < 0 ? "L" : "R";
  p[`leg${L}`] = -hip;
  p[`knee${L}`] = Math.max(0, knee);
  p[`ankle${L}`] = -ankle;
  p[`leg${L}z`] = side * out;
}
function setArm(p, side, { flex = 0, out = 0.1, twist = 0, elbow = 0.15, wrist = 0 }) {
  const L = side < 0 ? "L" : "R";
  p[`arm${L}x`] = -flex;
  p[`arm${L}z`] = side * out;
  p[`arm${L}y`] = side * twist;
  p[`elbow${L}`] = -Math.max(0, elbow);
  p[`hand${L}`] = wrist;
}

/*
 * An arm placed by where its hand goes, for poses where the hand has to
 * land ON something — a hip, the other arm, a sack on the shoulder —
 * which joint angles guessed one at a time never quite reach. `to` is
 * the wrist relative to the shoulder joint and `pole` the way the elbow
 * points, both written for the +X arm in the chest's frame; the -X arm
 * mirrors them. Solved as a two-bone chain and turned into the angles
 * the rig takes: the arm hangs down its local -Y and the elbow bends
 * towards its local +Z.
 */
const UPPER_ARM = 0.29;
const FOREARM = 0.255;
const ik = {
  t: new THREE.Vector3(), dir: new THREE.Vector3(), pole: new THREE.Vector3(),
  n: new THREE.Vector3(), u: new THREE.Vector3(), f: new THREE.Vector3(),
  w: new THREE.Vector3(), x: new THREE.Vector3(), y: new THREE.Vector3(),
  m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(),
};
function reachArm(p, side, to, pole) {
  const { t, dir, n, u, f, w, x, y, m, q, e } = ik;
  t.set(to[0] * side, to[1], to[2]);
  ik.pole.set(pole[0] * side, pole[1], pole[2]);
  const a = UPPER_ARM;
  const b = FOREARM;
  const d = clamp(t.length(), Math.abs(a - b) + 0.01, (a + b) * 0.995);
  dir.copy(t).normalize();
  // How far the upper arm turns off the line to the hand, towards the pole.
  const turn = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
  n.crossVectors(dir, ik.pole).normalize();
  u.copy(dir).applyAxisAngle(n, turn);
  f.copy(dir).multiplyScalar(d).addScaledVector(u, -a).normalize();
  const elbow = Math.acos(clamp(u.dot(f), -1, 1));
  w.copy(f).addScaledVector(u, -u.dot(f)).normalize();
  y.copy(u).negate();
  x.crossVectors(y, w);
  m.makeBasis(x, y, w);
  q.setFromRotationMatrix(m);
  e.setFromQuaternion(q, "XYZ");
  const L = side < 0 ? "L" : "R";
  p[`arm${L}x`] = e.x;
  p[`arm${L}y`] = e.y;
  p[`arm${L}z`] = e.z;
  p[`elbow${L}`] = -elbow;
}

/** The ways people stand about, and how often. */
export const STANCES = ["relaxed", "hips", "folded", "behind"];

/*
 * How somebody stands about. Not everybody hangs their arms at their
 * sides: hands on hips, arms folded and hands clasped behind the back
 * are all common on a site, and a yard of people all standing the same
 * way reads as a yard of dummies.
 */
function applyStance(p, stance) {
  switch (stance) {
    case "hips":
      reachArm(p, -1, [-0.03, -0.37, -0.05], [1, 0.15, -0.4]);
      reachArm(p, 1, [-0.03, -0.37, -0.05], [1, 0.15, -0.4]);
      p.spineX -= 0.04;
      break;
    case "folded":
      // One forearm over the other in front of the chest.
      reachArm(p, 1, [-0.21, -0.16, 0.19], [0.3, -1, 0.05]);
      reachArm(p, -1, [-0.21, -0.2, 0.23], [0.3, -1, 0.05]);
      p.headX -= 0.04;
      break;
    case "behind":
      reachArm(p, -1, [-0.13, -0.45, -0.17], [0.5, -0.25, -1]);
      reachArm(p, 1, [-0.12, -0.47, -0.17], [0.5, -0.25, -1]);
      p.spineX -= 0.05;
      p.headX -= 0.03;
      break;
    default:
      break;
  }
}

/*
 * The arms (and the lean that goes with them) for holding a load:
 *   front    in both hands at the chest — a box, a block
 *   hug      clutched to the chest in both arms, a sack on its way up
 *   shoulder a sack across the +X shoulder, that hand up on top of it,
 *            the body leaning and the head tipping away from the weight
 *   ahead    a stretcher handle in each hand, the stretcher in front
 *   behind   the same, the stretcher behind: the one leading the carry
 * Returns which arm is left free to swing (0 if none).
 */
function holdLoad(p, style) {
  switch (style) {
    case "shoulder":
      reachArm(p, 1, [-0.02, 0.07, 0.15], [0.45, -1, 0.55]);
      p.spineZ += 0.07;
      p.spineX += 0.05;
      p.headZ += 0.1;
      return -1;
    case "hug":
      setArm(p, -1, { flex: 0.75, out: -0.1, elbow: 1.35 });
      setArm(p, 1, { flex: 0.75, out: -0.1, elbow: 1.35 });
      return 0;
    case "ahead":
      setArm(p, -1, { flex: 0.42, out: 0.16, elbow: 0.22 });
      setArm(p, 1, { flex: 0.42, out: 0.16, elbow: 0.22 });
      p.spineX += 0.06;
      return 0;
    case "behind":
      setArm(p, -1, { flex: -0.26, out: 0.17, elbow: 0.1 });
      setArm(p, 1, { flex: -0.26, out: 0.17, elbow: 0.1 });
      p.spineX += 0.04;
      return 0;
    default:
      setArm(p, -1, { flex: 1.2, out: -0.28, elbow: 0.85 });
      setArm(p, 1, { flex: 1.2, out: -0.28, elbow: 0.85 });
      return 0;
  }
}

/*
 * What some actions are done with, made the first time they are needed
 * and shown only while that action is: a radio, a phone, a clipboard. A
 * worker built by buildWorker carries the kit to make them.
 */
const HELD = {
  radio(geo, mat) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(geo.box, mat.black);
    body.scale.set(0.055, 0.13, 0.035);
    body.position.set(0, -0.11, 0.02);
    g.add(body);
    const aerial = new THREE.Mesh(geo.cylLow || geo.cyl, mat.black);
    aerial.scale.set(0.012, 0.09, 0.012);
    aerial.position.set(0.015, -0.21, 0.02);
    g.add(aerial);
    return { hand: "R", object: g };
  },
  phone(geo, mat) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(geo.box, mat.black);
    body.scale.set(0.07, 0.14, 0.012);
    body.position.set(0, -0.1, 0.035);
    g.add(body);
    return { hand: "R", object: g };
  },
  write(geo, mat, worker) {
    // An officer already carries a clipboard.
    if (worker.userData.rig.armL.userData.board) return null;
    const g = new THREE.Group();
    const board = new THREE.Mesh(geo.box, mat.timber);
    board.scale.set(0.22, 0.3, 0.012);
    board.position.set(0, -0.15, 0.04);
    g.add(board);
    const paper = new THREE.Mesh(geo.box, mat.white);
    paper.scale.set(0.19, 0.24, 0.004);
    paper.position.set(0, -0.16, 0.049);
    g.add(paper);
    return { hand: "L", object: g };
  },
};

function syncHeld(worker, pose) {
  const held = worker.userData.held || (worker.userData.held = {});
  const kit = worker.userData.kit;
  if (HELD[pose] && held[pose] === undefined && kit) {
    const made = HELD[pose](kit.geo, kit.mat, worker);
    held[pose] = made ? made.object : null;
    if (made) {
      const arm = made.hand === "L" ? worker.userData.rig.armL : worker.userData.rig.armR;
      arm.userData.hand.add(made.object);
    }
  }
  for (const k in held) if (held[k]) held[k].visible = k === pose;
}

/** One frame of walking or running. `run` blends walk (0) to run (1). */
function gaitPose(phase, { run = 0, carrying = false, crouch = false, stride = 1 }) {
  const p = blankPose();
  const pL = phase / TAU + PHASE_OFFSET;
  const pR = pL + 0.5;
  const joint = (q) => ({
    hip: lerp(WALK.hip(q) * stride, RUN.hip(q), run),
    knee: lerp(WALK.knee(q), RUN.knee(q), run),
    ankle: lerp(WALK.ankle(q), RUN.ankle(q), run),
  });
  const L = joint(pL);
  const R = joint(pR);
  if (crouch) {
    L.hip += 0.55; L.knee += 0.9; L.ankle += 0.3;
    R.hip += 0.55; R.knee += 0.9; R.ankle += 0.3;
  }
  setLeg(p, -1, { ...L, out: 0.02 });
  setLeg(p, 1, { ...R, out: 0.02 });

  // The pelvis turns towards the leg going forward, drops on the side
  // that is swinging, and shifts over the foot that is planted.
  const c = Math.cos(TAU * (pL - 0.95));
  const sL = Math.sin(TAU * pL);
  p.hipsRotY = lerp(0.075, 0.1, run) * c;
  p.hipsRotZ = -lerp(0.045, 0.03, run) * sL;
  p.hipsX = -lerp(0.02, 0.012, run) * sL;
  // The chest turns the other way, so the shoulders counter the hips,
  // and the head holds steady over both.
  p.spineY = -1.7 * p.hipsRotY;
  p.spineZ = -0.6 * p.hipsRotZ;
  p.spineX = lerp(0.05, 0.22, run) + (crouch ? 0.32 : 0);
  p.headY = -(p.hipsRotY + p.spineY);
  p.headX = -lerp(0.02, 0.14, run) - (crouch ? 0.2 : 0);

  if (carrying) {
    const style = carrying === true ? "front" : carrying;
    const free = holdLoad(p, style);
    if (style === "front") p.spineX -= 0.1;
    if (!free) return p;
    // The hand that is not on the load swings, less than it would.
    const swing = (free < 0 ? -0.24 : 0.24) * c + 0.05;
    setArm(p, free, { flex: swing, out: 0.12, elbow: 0.22 + Math.max(0, swing) });
    return p;
  }
  // Arms swing against the legs: the -X arm goes back as the -X leg
  // comes forward. Running pumps them, elbows at about a right angle.
  const amp = lerp(0.36, 0.78, run);
  const flexL = -amp * c + 0.06;
  const flexR = amp * c + 0.06;
  const elbowFor = (flex) => lerp(
    0.22 + (0.3 * Math.max(0, flex)) / amp,
    1.42 + (0.18 * Math.max(0, flex)) / amp,
    run
  );
  setArm(p, -1, { flex: flexL, out: lerp(0.09, 0.16, run), elbow: elbowFor(flexL) });
  setArm(p, 1, { flex: flexR, out: lerp(0.09, 0.16, run), elbow: elbowFor(flexR) });
  return p;
}

/**
 * A pose held still: standing, working, crouching and the rest. `carry`
 * is how the "carry" pose holds its load, and `stance` how this person
 * stands about in the "stand" one.
 */
function stillPose(pose, phase = 0, { carry = "front", stance = "relaxed" } = {}) {
  const p = blankPose();
  setLeg(p, -1, { hip: 1 * D, knee: 3 * D, out: 0.035 });
  setLeg(p, 1, { hip: -1 * D, knee: 3 * D, out: 0.035 });
  setArm(p, -1, { flex: 0.03, out: 0.11, elbow: 0.16 });
  setArm(p, 1, { flex: -0.02, out: 0.1, elbow: 0.13 });

  switch (pose) {
    case "stand":
      applyStance(p, stance);
      break;
    case "work":
      // Hands together in front at waist height, head down at the job.
      setLeg(p, -1, { hip: 6 * D, knee: 9 * D, out: 0.06 });
      setLeg(p, 1, { hip: 2 * D, knee: 7 * D, out: 0.06 });
      setArm(p, -1, { flex: 0.7, out: -0.1, elbow: 1.05 });
      setArm(p, 1, { flex: 0.52, out: -0.16, elbow: 1.2 });
      p.spineX = 0.32;
      p.headX = 0.36;
      break;
    case "reach":
      setArm(p, -1, { flex: 2.6, out: 0.22, elbow: 0.25 });
      setArm(p, 1, { flex: 2.5, out: 0.2, elbow: 0.3 });
      p.spineX = -0.08;
      p.headX = -0.32;
      break;
    case "carry":
      holdLoad(p, carry);
      if (carry === "front") p.spineX = -0.07;
      break;
    case "lift":
      // Bent to a load on the ground, the way lifting is taught: hips
      // back, knees bent, the back straight but leaning in over the load,
      // both hands down to it and the head up. It was a squat with the
      // body bolt upright, like sitting on a chair that was not there.
      p.hipsRotX = 0.45;
      setLeg(p, -1, { hip: 91 * D, knee: 95 * D, ankle: 28 * D, out: 0.13 });
      setLeg(p, 1, { hip: 88 * D, knee: 92 * D, ankle: 27 * D, out: 0.13 });
      p.spineX = 0.35;
      setArm(p, -1, { flex: 0.95, out: 0.07, elbow: 0.15 });
      setArm(p, 1, { flex: 0.95, out: 0.07, elbow: 0.15 });
      p.headX = -0.45;
      break;
    case "crouch":
      setLeg(p, -1, { hip: 88 * D, knee: 118 * D, ankle: 30 * D, out: 0.16 });
      setLeg(p, 1, { hip: 88 * D, knee: 118 * D, ankle: 30 * D, out: 0.16 });
      setArm(p, -1, { flex: 0.85, out: 0.08, elbow: 0.9 });
      setArm(p, 1, { flex: 0.8, out: 0.08, elbow: 1.0 });
      p.spineX = 0.42;
      p.headX = -0.25;
      break;
    case "wave":
      // Calling for help: both arms up and waving over the head.
      setArm(p, -1, { flex: 2.75, out: 0.5, elbow: 0.25 });
      setArm(p, 1, { flex: 2.75, out: 0.5, elbow: 0.25 });
      p.headX = -0.18;
      break;
    case "point":
      // Pointing at it, the other hand cupped at the mouth, shouting.
      setArm(p, 1, { flex: 1.45, out: 0.14, elbow: 0.06 });
      reachArm(p, -1, [-0.15, 0.17, 0.13], [0.6, -1, 0.3]);
      p.headX = -0.1;
      break;
    case "signal":
      // A banksman's signal to the crane: the hand up over the head, finger
      // up, circling for "hoist", eyes on the load.
      reachArm(p, 1, [0.06, 0.46, 0.08], [1, -0.25, 0]);
      p.headX = -0.42;
      break;
    case "write":
      // Checking a clipboard: held up in one hand, writing with the other,
      // head down over it.
      reachArm(p, -1, [0.05, -0.24, 0.29], [0.35, -1, -0.2]);
      reachArm(p, 1, [-0.19, -0.2, 0.3], [0.45, -1, -0.1]);
      p.headX = 0.42;
      p.spineX = 0.06;
      break;
    case "radio":
      // Talking on a radio, held up at the mouth.
      reachArm(p, 1, [-0.16, 0.17, 0.13], [0.5, -1, 0.4]);
      p.headX = 0.04;
      break;
    case "phone":
      // On the phone, at the ear, head tipped to it.
      reachArm(p, 1, [-0.09, 0.22, 0.03], [0.6, -1, 0.1]);
      p.headZ = 0.12;
      break;
    case "talk":
      // Talking with somebody: a hand up, making the point.
      setArm(p, 1, { flex: 0.6, out: 0.14, elbow: 1.3 });
      break;
    case "struggle":
      // Hanging in a harness: arms up for the lanyard, legs looking for
      // something to stand on.
      setArm(p, -1, { flex: 2.6, out: 0.3, elbow: 0.5 });
      setArm(p, 1, { flex: 2.7, out: 0.25, elbow: 0.4 });
      setLeg(p, -1, { hip: 20 * D, knee: 32 * D, out: 0.05 });
      setLeg(p, 1, { hip: 6 * D, knee: 16 * D, out: 0.05 });
      p.headX = -0.42;
      break;
    case "tie":
      // Crouched over work on the ground — tying bars, nailing a sheet:
      // the back leaning in and both hands down at it.
      setLeg(p, -1, { hip: 88 * D, knee: 118 * D, ankle: 30 * D, out: 0.16 });
      setLeg(p, 1, { hip: 88 * D, knee: 118 * D, ankle: 30 * D, out: 0.16 });
      p.spineX = 0.62;
      setArm(p, -1, { flex: 1.05, out: 0.12, elbow: 0.35 });
      setArm(p, 1, { flex: 1.15, out: 0.08, elbow: 0.4 });
      p.headX = -0.3;
      break;
    case "kneel":
      // Down on the +X knee, the -X foot planted in front.
      setLeg(p, -1, { hip: 84 * D, knee: 88 * D, ankle: 4 * D, out: 0.1 });
      setLeg(p, 1, { hip: -8 * D, knee: 96 * D, ankle: -38 * D, out: 0.06 });
      setArm(p, -1, { flex: 0.75, out: 0.05, elbow: 0.9 });
      setArm(p, 1, { flex: 0.9, out: -0.05, elbow: 1.1 });
      p.spineX = 0.2;
      p.headX = 0.15;
      break;
    case "climb": {
      // On a ladder: opposite hand and foot, three points of contact.
      const s = Math.sin(phase);
      setLeg(p, -1, { hip: (38 + s * 26) * D, knee: (58 + s * 34) * D, ankle: 8 * D, out: 0.05 });
      setLeg(p, 1, { hip: (38 - s * 26) * D, knee: (58 - s * 34) * D, ankle: 8 * D, out: 0.05 });
      setArm(p, -1, { flex: 2.45 - s * 0.32, out: 0.12, elbow: 0.42 + s * 0.25 });
      setArm(p, 1, { flex: 2.45 + s * 0.32, out: 0.12, elbow: 0.42 - s * 0.25 });
      p.spineX = 0.12;
      p.headX = -0.3;
      p.ground = false;
      p.hipsY = 0.94;
      break;
    }
    default:
      break;
  }
  return p;
}

/**
 * The layer that keeps a still figure alive: breathing, a slow shift
 * of weight from foot to foot, a sway, and a head that looks about.
 * Small — single degrees — because a person is never quite still, not
 * because they are fidgeting. Somebody at work also WORKS: a hand
 * keeps hammering or tying, rather than freezing mid-task.
 */
function addLife(p, pose, t) {
  const breath = Math.sin(t * 1.25);
  const shift = Math.sin(t * 0.37);
  const sway = Math.sin(t * 0.61);
  const glance = Math.sin(t * 0.29) * Math.sin(t * 0.13);

  p.spineX += breath * 0.016;
  p.hipsRotZ += shift * 0.022;
  p.hipsX += shift * 0.012;
  p.spineY += sway * 0.035;
  p.spineZ -= shift * 0.014;
  p.headY += glance * 0.42;
  p.headX += Math.sin(t * 0.47) * 0.045;
  p.armLz += sway * 0.02;
  p.armRz += sway * 0.02;
  p.armLx += breath * 0.018;
  p.armRx -= breath * 0.018;
  // The leg taking the weight straightens as the other relaxes.
  p.kneeL = Math.max(0, p.kneeL + Math.max(0, shift) * 0.08);
  p.kneeR = Math.max(0, p.kneeR + Math.max(0, -shift) * 0.08);

  if (pose === "work") {
    // A working rhythm in the +X hand, with pauses in it.
    const beat = Math.sin(t * 7.2);
    const busy = smooth(-0.2, 0.4, Math.sin(t * 0.55));
    p.elbowR -= Math.max(0, beat) * 0.42 * busy;
    p.armRx -= Math.max(0, beat) * 0.14 * busy;
    p.headX += beat * 0.03 * busy;
  } else if (pose === "reach") {
    p.armLx += Math.sin(t * 1.7) * 0.08;
    p.armRx -= Math.sin(t * 1.7 + 1) * 0.08;
  } else if (pose === "wave") {
    // Frantic: both arms sweeping across over the head.
    const sweep = Math.sin(t * 7.5);
    p.armLz -= sweep * 0.32;
    p.armRz -= sweep * 0.32;
    p.headY += sweep * 0.08;
  } else if (pose === "point") {
    // Jabbing at it while shouting.
    const jab = Math.max(0, Math.sin(t * 5.5));
    p.armRx -= jab * 0.12;
    p.headX -= jab * 0.05;
  } else if (pose === "signal") {
    // Small circles with the raised hand: "hoist".
    p.armRx += Math.sin(t * 6) * 0.12;
    p.armRz += Math.cos(t * 6) * 0.12;
  } else if (pose === "write") {
    // Writing, in bursts, and now and then looking up from the board.
    const busy = smooth(-0.2, 0.4, Math.sin(t * 0.7));
    p.elbowR -= Math.max(0, Math.sin(t * 9)) * 0.12 * busy;
    p.headX -= smooth(0.6, 0.95, Math.sin(t * 0.31)) * 0.5;
  } else if (pose === "talk") {
    // Making a point, with pauses for the other one to answer.
    const speaking = smooth(-0.3, 0.3, Math.sin(t * 0.45));
    p.elbowR -= Math.sin(t * 2.6) * 0.32 * speaking;
    p.armRz += Math.sin(t * 1.3) * 0.08 * speaking;
    p.headX += Math.sin(t * 2.6 + 1) * 0.05 * speaking;
  } else if (pose === "radio" || pose === "phone") {
    // Listening, then talking: a nod, a look round, and the free hand
    // making the point while they speak.
    const speaking = smooth(-0.2, 0.4, Math.sin(t * 0.55 + 1));
    p.headY += Math.sin(t * 0.8) * 0.12;
    p.headX += Math.sin(t * 3.1) * 0.06 * speaking;
    p.elbowL -= Math.max(0, Math.sin(t * 2.2)) * 0.55 * speaking;
    p.armLx -= Math.max(0, Math.sin(t * 2.2)) * 0.15 * speaking;
  } else if (pose === "struggle") {
    // Kicking for a foothold and pulling on the lanyard.
    const kick = Math.sin(t * 4.2);
    p.legL -= kick * 0.35;
    p.legR += kick * 0.35;
    p.kneeL = Math.max(0, p.kneeL + kick * 0.3);
    p.kneeR = Math.max(0, p.kneeR - kick * 0.3);
    p.armLx -= Math.max(0, Math.sin(t * 2.1)) * 0.25;
    p.armRx -= Math.max(0, Math.sin(t * 2.1 + 1.5)) * 0.25;
  } else if (pose === "crouch" || pose === "tie") {
    // Tying wire or driving nails down there: the working hand busy, in
    // bursts, rather than resting on the knee.
    const beat = Math.sin(t * 6.4);
    const busy = smooth(-0.2, 0.4, Math.sin(t * 0.5 + 1));
    p.elbowR -= Math.max(0, beat) * 0.3 * busy;
    p.armRx -= Math.max(0, beat) * 0.1 * busy;
  }
}

/*
 * Lowest point of a leg below its hip socket, for the angles it has.
 * The hip height is worked out from this every frame so a foot is ON
 * the ground: the bounce of a walk comes out of the leg geometry
 * instead of being painted on, and a crouch or a kneel lands properly.
 */
const FOOT_POINTS = [[-0.075, -0.09], [0.13, -0.09], [0.205, -0.085]];
function legDrop(pelvisTilt, legRot, kneeRot, ankleRot) {
  const a1 = pelvisTilt + legRot;
  const a2 = a1 + kneeRot;
  const a3 = a2 + ankleRot;
  const kneeY = -0.44 * Math.cos(a1);
  const ankleY = kneeY - 0.41 * Math.cos(a2);
  let low = kneeY - 0.055;
  FOOT_POINTS.forEach(([z, y]) => {
    low = Math.min(low, ankleY + y * Math.cos(a3) - z * Math.sin(a3));
  });
  return low;
}

function applyPose(rig, p) {
  const { hips, spine, neck, head, legL, legR, armL, armR } = rig;
  hips.rotation.set(p.hipsRotX, p.hipsRotY, p.hipsRotZ);
  spine.rotation.set(p.spineX, p.spineY, p.spineZ);
  neck.rotation.set(p.neckX, 0, 0);
  head.rotation.set(p.headX, p.headY, p.headZ);

  legL.rotation.set(p.legL, 0, p.legLz);
  legR.rotation.set(p.legR, 0, p.legRz);
  legL.userData.knee.rotation.x = p.kneeL;
  legR.userData.knee.rotation.x = p.kneeR;
  if (legL.userData.ankle) legL.userData.ankle.rotation.x = p.ankleL;
  if (legR.userData.ankle) legR.userData.ankle.rotation.x = p.ankleR;

  armL.rotation.set(p.armLx, p.armLy, p.armLz);
  armR.rotation.set(p.armRx, p.armRy, p.armRz);
  armL.userData.elbow.rotation.x = p.elbowL;
  armR.userData.elbow.rotation.x = p.elbowR;
  if (armL.userData.hand) armL.userData.hand.rotation.x = p.handL;
  if (armR.userData.hand) armR.userData.hand.rotation.x = p.handR;

  hips.position.x = p.hipsX;
  if (p.ground) {
    // Each leg's socket rises or falls as the pelvis rolls.
    const roll = Math.sin(p.hipsRotZ) * 0.092;
    const dropL = legDrop(p.hipsRotX, p.legL, p.kneeL, p.ankleL) - roll;
    const dropR = legDrop(p.hipsRotX, p.legR, p.kneeR, p.ankleR) + roll;
    hips.position.y = -Math.min(dropL, dropR) + (p.lift || 0);
  } else {
    hips.position.y = p.hipsY;
  }
}

function mixPoses(a, b, w) {
  if (w <= 0) return a;
  if (w >= 1) return b;
  const out = { ground: a.ground || b.ground, lift: lerp(a.lift || 0, b.lift || 0, w) };
  POSE_KEYS.forEach((k) => { out[k] = lerp(a[k], b[k], w); });
  return out;
}

/**
 * Poses or animates a worker built by buildWorker().
 *
 * @param phase    walk cycle phase in radians
 * @param moving   true to walk (or run), false to hold `pose`
 * @param pose     "stand" | "work" | "reach" | "carry" | "lift" |
 *                 "crouch" | "kneel" | "climb" | "tie" — and the things
 *                 people do instead of standing about: "wave", "point",
 *                 "signal", "write", "radio", "phone", "talk", "struggle"
 * @param running  run rather than walk
 * @param carrying both hands on a load while walking
 * @param t        elapsed seconds, for the living layer on a still pose
 * @param blend    0-1 how far from the still pose into the walk, for
 *                 easing in and out of a stride (default: all or none)
 * @param runBlend 0-1 walk to run, the same way
 * @param stride   longer steps for a faster walk (1 = normal)
 * @param carrying how a load is held: true or "front", "shoulder",
 *                 "ahead"/"behind" for the two ends of a stretcher
 * @param from     a pose to come from (what this returned last time),
 *                 and `mix` 0-1 how far from it into this one
 * @returns        the still pose it applied, to come from next time
 */
export function poseWorker(worker, {
  phase = 0, moving = false, pose = "stand", running = false, carrying = false,
  t = null, blend = null, runBlend = null, stride = 1, from = null, mix = 1,
} = {}) {
  const rig = worker?.userData?.rig;
  if (!rig) return null;
  if (worker.userData.kit || worker.userData.held) syncHeld(worker, pose);

  let still = stillPose(pose, phase, {
    carry: typeof carrying === "string" ? carrying : "front",
    stance: worker.userData.stance || "relaxed",
  });
  // On the way from another pose: part of the way there.
  if (from && mix < 1) still = mixPoses(from, still, smooth(0, 1, mix));
  if (t !== null && Number.isFinite(t) && pose !== "climb") addLife(still, pose, t);

  const w = blend === null ? (moving ? 1 : 0) : clamp(blend, 0, 1);
  if (w <= 0 || pose === "climb") {
    applyPose(rig, still);
    return still;
  }
  const run = runBlend === null ? (running ? 1 : 0) : clamp(runBlend, 0, 1);
  const stepping = gaitPose(phase, { run, carrying, crouch: pose === "crouch", stride });
  // A little air under a runner at the top of each stride.
  stepping.lift = run * 0.03 * Math.max(0, Math.sin(2 * (phase + TAU * PHASE_OFFSET) - 0.6));
  applyPose(rig, mixPoses(still, stepping, w));
  return still;
}

/*
 * Metres covered by one full stride (two steps) at a speed. Walking
 * strides lengthen with speed; a run adds the flight between steps.
 * The phase is advanced by distance over this, so a foot on the ground
 * stays where it was put instead of skating.
 */
function strideLength(speed, run) {
  const walk = clamp(0.95 + 0.2 * speed, 1.1, 1.75);
  const sprint = clamp(1.9 + 0.22 * speed, 2.4, 3.4);
  return lerp(walk, sprint, run);
}

/**
 * Animates a figure from how fast it is actually moving, with easing in
 * and out of the stride and between walking and running.
 *
 * Keeps its state on the figure, so the caller only says what the body
 * is doing this frame.
 */
export function animateWorker(worker, {
  dt = 0, speed = 0, running = false, carrying = false, pose = "stand", t = null,
  climbing = false, climbRate = 0,
} = {}) {
  if (!worker?.userData?.rig) return;
  const g = worker.userData.gait || (worker.userData.gait = { phase: 0, blend: 0, run: 0, climb: 0 });
  const step = Math.min(dt, 0.1);
  if (climbing) {
    g.climb += climbRate * step * 3.2;
    g.blend = 0;
    poseWorker(worker, { pose: "climb", phase: g.climb });
    g.pose = "climb";
    g.last = null;
    return;
  }
  // A change of pose is a movement, not a cut: kneeling down, getting up
  // or turning to fold the arms takes about half a second.
  if (g.pose !== pose) {
    g.from = g.pose === undefined ? null : g.last;
    g.mix = 0;
    g.pose = pose;
  }
  g.mix = Math.min(1, (g.mix ?? 1) + step / 0.5);
  const moving = speed > 0.25;
  g.blend += ((moving ? 1 : 0) - g.blend) * Math.min(1, step * 9);
  g.run += ((running && moving ? 1 : 0) - g.run) * Math.min(1, step * 5);
  if (g.blend < 0.003) g.blend = 0;
  g.phase += (speed / strideLength(speed, g.run)) * TAU * step;
  const stride = clamp(0.85 + speed * 0.07, 0.9, 1.15);
  g.last = poseWorker(worker, {
    phase: g.phase, moving: g.blend > 0, blend: g.blend, runBlend: g.run,
    running, carrying, pose, t, stride, from: g.from, mix: g.mix,
  });
}

/** Turns a figure towards a compass heading by the short way round. */
export function turnToward(object, heading, dt, rate = 10) {
  if (!object || !Number.isFinite(heading)) return;
  let d = (heading - object.rotation.y) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  object.rotation.y += d * Math.min(1, dt * rate);
}

/**
 * Walks a figure round a route, pausing at each stop, turning to face
 * where it is going and slowing for the corners.
 *
 * Gives a site its background life: people going about their work
 * rather than standing posed. The figure is marked self-animated so
 * the crowd animator leaves it alone.
 *
 * With a `load`, a stop marked `carry: true` is where one is picked up
 * and `carry: false` where it is put down, and both are done properly:
 * a stack of the same thing stands in front of each, the figure bends
 * to it (hips back, knees bent), takes the top one and lifts it onto
 * the shoulder — the load following the hands up — and at the other
 * end lowers it onto the stack and straightens up. It used to crouch
 * with empty hands while the load appeared in mid-air at chest height.
 *
 * @param route  [{x, z, pause?, pose?, carry?}] — pause in seconds at
 *               that stop, what to do while there ("write", "radio"...),
 *               and whether a load is picked up (true) or put down
 *               (false). A stop with neither a pause nor a pose is a
 *               corner, walked round without stopping.
 * @param load   the thing carried — a bag of cement, a block
 * @param carryStyle "shoulder" (a sack) or "front" (in both hands)
 */
export function createWalker(worker, route, {
  speed = 1.35, carrying = false, y = 0, load = null, carryStyle = "shoulder",
} = {}) {
  worker.userData.selfAnimated = true;
  const stops = route.filter(Boolean);
  let index = 0;
  let wait = stops[0]?.pause ?? 1;
  let carryNow = carrying;
  if (stops[0]) worker.position.set(stops[0].x, y, stops[0].z);
  if (stops[1]) worker.rotation.y = Math.atan2(stops[1].x - stops[0].x, stops[1].z - stops[0].z);

  // Where the load rides, in the figure's own frame (it faces +Z). The
  // shoulder is measured off the rig, so a shorter figure carries lower.
  let held = null;
  let size = null;
  let piles = null;
  let action = null;
  if (load) {
    size = new THREE.Box3().setFromObject(load).getSize(new THREE.Vector3());
    poseWorker(worker, { pose: "stand" });
    worker.updateMatrixWorld(true);
    const shoulder = worker.worldToLocal(new THREE.Vector3().setFromMatrixPosition(worker.userData.rig.armR.matrixWorld));
    held = carryStyle === "shoulder"
      ? {
        at: new THREE.Vector3(shoulder.x - 0.03, shoulder.y + 0.05 + size.y / 2, 0.01),
        rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, -0.12)),
      }
      : { at: new THREE.Vector3(0, shoulder.y - 0.3, 0.34), rot: new THREE.Quaternion() };
    worker.add(load);
    load.visible = carryNow;
    load.position.copy(held.at);
    load.quaternion.copy(held.rot);
  }

  // A stack of loads in front of each stop where one is picked up or
  // put down, cross-stacked the way bags are, so a load comes from
  // somewhere and goes somewhere.
  function stackPiles() {
    const out = new Map();
    stops.forEach((stop, i) => {
      if (stop.carry === undefined) return;
      const prev = stops[(i - 1 + stops.length) % stops.length];
      const heading = Math.atan2(stop.x - prev.x, stop.z - prev.z);
      const pile = new THREE.Group();
      const layers = stop.carry ? 3 : 1;
      for (let l = 0; l < layers; l++) {
        [-1, 1].forEach((sign) => {
          const bag = load.clone(true);
          bag.visible = true;
          if (l % 2 === 0) bag.position.set(sign * size.x * 0.52, size.y * (l + 0.5), 0);
          else {
            bag.position.set(0, size.y * (l + 0.5), sign * size.x * 0.52);
            bag.rotation.y = Math.PI / 2;
          }
          pile.add(bag);
        });
      }
      const reach = 0.62;
      pile.position.set(stop.x + Math.sin(heading) * reach, y, stop.z + Math.cos(heading) * reach);
      pile.rotation.y = heading;
      pile.userData.loadStack = true;
      worker.parent.add(pile);
      // Which way to face it, and where the next load sits on top.
      out.set(i, { pile, heading, top: new THREE.Vector3(pile.position.x, y + size.y * (layers + 0.5), pile.position.z) });
    });
    return out;
  }

  const ease = (v) => smooth(0, 1, v);
  const carryPose = () => stillPose("carry", 0, { carry: carryStyle });

  // Where a load is while it is in both hands: between the palms.
  const palm = new THREE.Vector3();
  const palms = new THREE.Vector3();
  const sag = new THREE.Vector3(0, -0.03, 0);
  function betweenHands() {
    const rig = worker.userData.rig;
    worker.updateMatrixWorld(true);
    palms.set(0, 0, 0);
    [rig.armL, rig.armR].forEach((arm) => {
      palm.set(0, -0.07, 0.02);
      arm.userData.hand.localToWorld(palm);
      palms.add(worker.worldToLocal(palm));
    });
    return palms.multiplyScalar(0.5).add(sag);
  }

  // One frame of picking up (or, run backwards, putting down) at the
  // pile in front: bend, take hold, bring it up to the chest in both
  // arms, then swing it onto the shoulder — the way a sack is lifted.
  function handle(k, spot, t) {
    const bend = stillPose("lift");
    const hug = stillPose("carry", 0, { carry: "hug" });
    let p;
    if (k < 0.32) p = mixPoses(stillPose("stand"), bend, ease(k / 0.32));
    else if (k < 0.45) p = bend;
    else if (k < 0.65) p = mixPoses(bend, hug, ease((k - 0.45) / 0.2));
    else p = mixPoses(hug, carryPose(), ease((k - 0.65) / 0.2));
    addLife(p, "lift", t);
    applyPose(worker.userData.rig, p);
    // The load stays on the stack until the hands are on it, then goes
    // where they go — up to the chest — and over onto the shoulder.
    if (k < 0.45) {
      load.position.copy(spot);
      load.quaternion.identity();
      return p;
    }
    const inHands = betweenHands();
    const over = ease((k - 0.65) / 0.2);
    if (over > 0) {
      load.position.lerpVectors(inHands, held.at, over);
      load.position.y += Math.sin(Math.PI * over) * 0.08;
    } else {
      load.position.lerpVectors(spot, inHands, ease((k - 0.45) / 0.06));
    }
    load.quaternion.identity().slerp(held.rot, over);
    return p;
  }

  return {
    worker,
    get carrying() { return carryNow; },
    update(dt, t) {
      if (!stops.length) return;
      if (load && !piles && worker.parent) piles = stackPiles();
      const here = stops[index];
      const g = worker.userData.gait || (worker.userData.gait = { phase: 0, blend: 0, run: 0, climb: 0 });
      if (wait > 0) {
        wait -= dt;
        const pause = here.pause ?? 1;
        const k = clamp(1 - wait / pause, 0, 1);
        if (load && piles?.has(index)) {
          // Square up to the stack, and reach for where its top really is.
          const { top, heading } = piles.get(index);
          turnToward(worker, heading, dt, 6);
          worker.updateMatrixWorld(true);
          const spot = worker.worldToLocal(top.clone());
          if (action === null) action = here.carry && !carryNow ? "pick" : !here.carry && carryNow ? "drop" : "none";
          if (action === "pick") {
            if (load.parent !== worker) worker.attach(load);
            load.visible = true;
            if (k >= 0.45) carryNow = true;
            g.last = handle(k, spot, t);
            g.pose = carryNow ? "carry" : "lift";
            g.blend = 0;
            if (wait <= 0) action = null;
            return;
          }
          if (action === "drop") {
            if (k < 0.45) {
              g.last = handle(0.45 + (0.45 - k) / 0.45 * 0.4, spot, t);
            } else {
              // Let go: the load stays on the stack, and the figure
              // straightens up without it.
              if (carryNow) {
                carryNow = false;
                load.position.copy(spot);
                load.quaternion.identity();
                worker.parent.attach(load);
              }
              const p = mixPoses(stillPose("lift"), stillPose("stand"), ease((k - 0.5) / 0.35));
              addLife(p, "lift", t);
              applyPose(worker.userData.rig, p);
              g.last = p;
            }
            g.pose = carryNow ? "carry" : "stand";
            g.blend = 0;
            if (wait <= 0) action = null;
            return;
          }
        }
        animateWorker(worker, {
          dt, speed: 0, pose: carryNow ? "carry" : here.pose || "stand",
          carrying: carryNow ? carryStyle : false, t,
        });
        if (wait <= 0) action = null;
        return;
      }
      const next = stops[(index + 1) % stops.length];
      const dx = next.x - worker.position.x;
      const dz = next.z - worker.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.12) {
        index = (index + 1) % stops.length;
        // A stop with nothing to do there is a corner, walked round
        // without stopping; people do not halt at every turn.
        wait = next.pause ?? (next.pose ? 1.5 : 0);
        action = null;
        animateWorker(worker, {
          dt, speed: wait > 0 ? 0 : speed, pose: carryNow ? "carry" : "stand", carrying: carryNow ? carryStyle : false, t,
        });
        return;
      }
      const heading = Math.atan2(dx, dz);
      turnToward(worker, heading, dt, 4);
      let off = (heading - worker.rotation.y) % TAU;
      if (off > Math.PI) off -= TAU;
      if (off < -Math.PI) off += TAU;
      // Slow right down to turn a corner, as people do.
      const v = Math.min(dist / Math.max(dt, 1e-3), speed * (0.25 + 0.75 * Math.max(0, Math.cos(off))));
      worker.position.x += Math.sin(worker.rotation.y) * v * dt;
      worker.position.z += Math.cos(worker.rotation.y) * v * dt;
      animateWorker(worker, {
        dt, speed: v, pose: carryNow ? "carry" : "stand", carrying: carryNow ? carryStyle : false, t,
      });
    },
  };
}

/**
 * Every rigged figure under `root`, except any that animates itself.
 *
 * The player's avatar and anybody on a walking route set their own
 * pose each frame, so they are marked `selfAnimated` and left out —
 * posing them twice would fight the walk.
 */
export function collectWorkers(root) {
  const list = [];
  root.traverse((o) => {
    if (o.userData?.rig && !o.userData.selfAnimated) list.push(o);
  });
  return list;
}

/** Runs the living layer over a list from collectWorkers(). */
export function idleWorkers(list, t) {
  for (let i = 0; i < list.length; i++) {
    const w = list[i];
    poseWorker(w, {
      pose: w.userData.pose || "stand",
      moving: false,
      t: t + (w.userData.idleOffset || 0),
    });
  }
}
