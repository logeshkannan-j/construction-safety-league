/* ------------------------------------------------------------------ *
 *  ARENA ENGINE — the construction kit
 *
 *  Reusable, low-poly builders for everything the five games need:
 *  ground, buildings, scaffolds, a working tower crane, workers,
 *  ladders, excavations, panels, signage, barriers, PPE stations and
 *  material. All five games compose their worlds from these, so a
 *  visual or performance improvement here lifts every game at once.
 *
 *  Performance rules followed throughout:
 *   - one shared unit BoxGeometry, scaled per mesh (geometry count ~20
 *     for a whole site instead of several hundred)
 *   - Lambert/Phong materials only, never Standard/PBR — roughly 3x
 *     cheaper per fragment on mobile GPUs and visually fine under the
 *     daylight rig
 *   - tube-heavy structures (scaffolds, guardrails) are merged into a
 *     single geometry so a full scaffold tower costs ONE draw call
 *   - textures are small procedural canvases (128–256px), generated
 *     once and cached, so nothing is downloaded
 * ------------------------------------------------------------------ */

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { stairFlight, validateFlight } from "./stairs.js";
import { SITE_NAME, SITE_SUBTITLE } from "../arenaConstants.js";

/* ============================ textures ============================ */

// Procedural textures are cached so that, for example, twenty identical
// warning signs in one scene cost one canvas and one GPU upload.
//
// The cache is per-SCENE, not global: disposeScene() releases every
// texture it finds on the way out, so holding these across games would
// hand the next game a set of already-disposed textures (which renders
// as black or missing surfaces the second time you play). createMaterials
// clears it, and that is the one call every game makes exactly once when
// it builds its world.
const textureCache = new Map();

export function clearTextureCache() {
  textureCache.clear();
}

function canvasTexture(key, width, height, draw, { repeat = [1, 1], aniso = 1 } = {}) {
  const cacheKey = `${key}:${repeat[0]}x${repeat[1]}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d"), width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = aniso;
  textureCache.set(cacheKey, tex);
  return tex;
}

function noise(ctx, w, h, count, colors, size = 3) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
    const s = size * (0.4 + Math.random());
    ctx.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}

function dirtTexture(repeat, aniso) {
  return canvasTexture("dirt", 256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#9c8a6a";
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 2600, ["#8d7c5e", "#a3906f", "#ab9a79", "#85765a", "#b4a383"], 4);
    noise(ctx, w, h, 300, ["#6f6350", "#c3b494"], 7);
    // Faint tyre tracks so the ground does not read as a flat plane.
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "#6a5f4b";
    ctx.lineWidth = 10;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      const y = 30 + i * 62;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(80, y + 18, 170, y - 20, 256, y + 6);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }, { repeat, aniso });
}

function concreteTexture(repeat, aniso) {
  return canvasTexture("concrete", 256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#b4b2ab";
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 2000, ["#a9a7a0", "#bebcb5", "#9d9b95", "#c5c3bc"], 4);
    // Form-work seams.
    ctx.strokeStyle = "#8f8d87";
    ctx.lineWidth = 2;
    [0, 128].forEach((x) => { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); });
    [0, 128].forEach((y) => { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); });
    noise(ctx, w, h, 120, ["#7e7c77"], 2);
  }, { repeat, aniso });
}

function plywoodTexture(repeat, aniso) {
  return canvasTexture("plywood", 128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#c49a62";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      ctx.strokeStyle = ["#b88b53", "#cfa770", "#ab7f49"][(Math.random() * 3) | 0];
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      const y = Math.random() * h;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(40, y + 4, 90, y - 5, w, y + 2);
      ctx.stroke();
    }
  }, { repeat, aniso });
}

function hazardStripeTexture(repeat) {
  return canvasTexture("hazard", 64, 64, (ctx, w, h) => {
    ctx.fillStyle = "#FFC629";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#1b1b1b";
    ctx.lineWidth = 0;
    for (let i = -h; i < w + h; i += 24) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 12, 0);
      ctx.lineTo(i + 12 + h, h);
      ctx.lineTo(i + h, h);
      ctx.closePath();
      ctx.fill();
    }
  }, { repeat });
}

function brickTexture(repeat, aniso) {
  return canvasTexture("brick", 128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#9c9a92";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#a8613f";
    const bh = 16;
    for (let row = 0; row * bh < h; row++) {
      const offset = row % 2 === 0 ? 0 : -16;
      for (let x = offset; x < w; x += 32) {
        ctx.fillStyle = ["#a8613f", "#9c5a3b", "#b36b46"][(Math.random() * 3) | 0];
        ctx.fillRect(x + 1, row * bh + 1, 30, bh - 2);
      }
    }
  }, { repeat, aniso });
}

/**
 * Builds a texture for a safety sign face. Cached per text+kind so the
 * same sign repeated across a site costs one texture.
 */
export function signTexture(text, kind = "warning") {
  const palette = {
    warning: { bg: "#FFC629", fg: "#161616", border: "#161616" },
    prohibition: { bg: "#ffffff", fg: "#C8262B", border: "#C8262B" },
    mandatory: { bg: "#0B5FA5", fg: "#ffffff", border: "#ffffff" },
    emergency: { bg: "#13864A", fg: "#ffffff", border: "#ffffff" },
    info: { bg: "#1C2126", fg: "#F3F1EA", border: "#909AA3" },
  }[kind] || { bg: "#FFC629", fg: "#161616", border: "#161616" };

  return canvasTexture(`sign:${kind}:${text}`, 256, 192, (ctx, w, h) => {
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = palette.border;
    ctx.lineWidth = 10;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = palette.fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const words = String(text).toUpperCase().split(/\s+/);
    const lines = [];
    let line = "";
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > 11) { if (line) lines.push(line); line = word; }
      else line = candidate;
    });
    if (line) lines.push(line);
    const size = lines.length > 2 ? 30 : 38;
    ctx.font = `800 ${size}px system-ui, sans-serif`;
    const startY = h / 2 - ((lines.length - 1) * size * 0.6);
    lines.slice(0, 4).forEach((l, i) => ctx.fillText(l, w / 2, startY + i * size * 1.2));
  });
}

/* ============================ branding ============================ */

// The development every mission is set on. Defined in arenaConstants so
// the HUD can show it without importing three.js; re-exported here
// because the builders below are the main consumers.
export { SITE_NAME, SITE_SUBTITLE };

/** Wide brand banner — used across hoarding panels and the tower crown. */
export function brandTexture(
  { title = SITE_NAME, subtitle = SITE_SUBTITLE, dark = false } = {}
) {
  const bg = dark ? "#10161D" : "#F3F1EA";
  const fg = dark ? "#F3F1EA" : "#14202B";
  const accent = "#C9A227";
  return canvasTexture(`brand:${title}:${subtitle}:${dark}`, 1024, 256, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // A thin rule top and bottom, the way developer hoarding is set out.
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, w, 7);
    ctx.fillRect(0, h - 7, w, 7);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = fg;
    ctx.font = "800 92px Georgia, 'Times New Roman', serif";
    ctx.letterSpacing = "14px";
    ctx.fillText(title, w / 2, h / 2 - 22);

    ctx.fillStyle = accent;
    ctx.fillRect(w / 2 - 150, h / 2 + 32, 300, 3);

    ctx.fillStyle = dark ? "#9FB0C0" : "#5A6B7A";
    ctx.font = "600 30px system-ui, sans-serif";
    ctx.letterSpacing = "7px";
    ctx.fillText(subtitle, w / 2, h / 2 + 68);
  });
}

/** Square brand plate, for crane counterweights and site huts. */
export function brandPlateTexture() {
  return canvasTexture("brandPlate", 256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#10161D";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#C9A227";
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, w - 28, h - 28);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#F3F1EA";
    ctx.font = "800 42px Georgia, serif";
    ctx.fillText("CASAGRAND", w / 2, h / 2 - 22);
    ctx.fillStyle = "#C9A227";
    ctx.font = "800 54px Georgia, serif";
    ctx.letterSpacing = "6px";
    ctx.fillText("AIRA", w / 2, h / 2 + 32);
  });
}

/** Tall window-grid texture for the finished tower's curtain walling. */
function curtainWallTexture(floors, repeatY) {
  return canvasTexture(`curtain:${floors}`, 256, 512, (ctx, w, h) => {
    ctx.fillStyle = "#28333D";
    ctx.fillRect(0, 0, w, h);
    const cols = 4;
    const rows = 6;
    const pw = w / cols;
    const ph = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // A few lit rooms so the tower reads as occupied, not a shell.
        const lit = ((r * 7 + c * 3) % 11) < 3;
        ctx.fillStyle = lit ? "#CFE2EE" : "#7FA6BD";
        ctx.globalAlpha = lit ? 0.95 : 0.6;
        ctx.fillRect(c * pw + 5, r * ph + 6, pw - 10, ph - 16);
      }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#1B242C";
    for (let r = 0; r <= rows; r++) ctx.fillRect(0, r * ph - 3, w, 6);
    for (let c = 0; c <= cols; c++) ctx.fillRect(c * pw - 3, 0, 6, h);
  }, { repeat: [2, repeatY] });
}

/* ============================ materials ============================ */

/**
 * Creates the palette of materials for one game. Call once per scene;
 * disposeScene() releases them on unmount.
 */
export function createMaterials(cfg) {
  // Start every scene with a clean texture cache — see the note on
  // textureCache above. Without this, the second play of any game draws
  // with textures the first play's teardown already disposed.
  clearTextureCache();
  const aniso = cfg.anisotropy || 1;
  const L = (params) => new THREE.MeshLambertMaterial(params);
  const P = (params) => new THREE.MeshPhongMaterial(params);

  return {
    ground: L({ map: dirtTexture([14, 14], aniso) }),
    concrete: L({ map: concreteTexture([2, 2], aniso) }),
    concreteSlab: L({ map: concreteTexture([6, 6], aniso) }),
    concreteDark: L({ color: 0x8e8c86 }),
    plywood: L({ map: plywoodTexture([2, 2], aniso) }),
    brick: L({ map: brickTexture([3, 2], aniso) }),
    hazard: L({ map: hazardStripeTexture([4, 1]) }),

    // Casagrand Aira branding — hoarding banners, the tower crown and
    // the crane counterweight all carry it, so the player can see whose
    // site they are standing on from anywhere in every mission.
    brand: L({ map: brandTexture() }),
    brandDark: L({ map: brandTexture({ dark: true }) }),
    brandPlate: L({ map: brandPlateTexture() }),
    curtainWall: P({ map: curtainWallTexture(19, 10), shininess: 70, specular: 0x55646f }),

    steel: P({ color: 0x9aa3ab, shininess: 42, specular: 0x4a5056 }),
    steelDark: P({ color: 0x5c646c, shininess: 30, specular: 0x33383d }),
    craneYellow: P({ color: 0xf2b417, shininess: 36, specular: 0x4a3a10 }),
    craneRed: P({ color: 0xcf3f2f, shininess: 30, specular: 0x402019 }),
    galv: P({ color: 0xc3c9cf, shininess: 60, specular: 0x6a7076 }),

    timber: L({ color: 0xb5854d }),
    timberDark: L({ color: 0x8a6436 }),
    rebar: P({ color: 0x8b8378, shininess: 18 }),

    orange: L({ color: 0xff5a1f }),
    yellow: L({ color: 0xffc629 }),
    green: L({ color: 0x33c481 }),
    red: L({ color: 0xea4f4f }),
    white: L({ color: 0xeeece4 }),
    black: L({ color: 0x25282c }),
    blue: L({ color: 0x2f6fb5 }),
    hiVis: L({ color: 0xd6ff2e }),
    skin: L({ color: 0xd7a07a }),
    skinDark: L({ color: 0x8d5f3f }),
    denim: L({ color: 0x3d4a5c }),
    glass: new THREE.MeshPhongMaterial({ color: 0x9fd0e8, transparent: true, opacity: 0.38, shininess: 90 }),
    net: new THREE.MeshLambertMaterial({ color: 0x2bbf6f, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    tarp: new THREE.MeshLambertMaterial({ color: 0x2f6fb5, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    water: new THREE.MeshPhongMaterial({ color: 0x3a5a6e, transparent: true, opacity: 0.72, shininess: 110 }),
    oil: new THREE.MeshPhongMaterial({ color: 0x1d1a16, transparent: true, opacity: 0.85, shininess: 140 }),

    // Highlight shells used for the interaction outline.
    highlight: new THREE.MeshBasicMaterial({ color: 0xffc629, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.BackSide }),
    highlightOk: new THREE.MeshBasicMaterial({ color: 0x33c481, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.BackSide }),
    highlightBad: new THREE.MeshBasicMaterial({ color: 0xea4f4f, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.BackSide }),
    ghost: new THREE.MeshBasicMaterial({ color: 0x59b7ff, transparent: true, opacity: 0.35, depthWrite: false }),
    zone: new THREE.MeshBasicMaterial({ color: 0xea4f4f, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
    zoneOk: new THREE.MeshBasicMaterial({ color: 0x33c481, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
  };
}

/* ========================= shared geometry ========================= */

export function createGeometries(cfg) {
  const seg = Math.max(5, cfg.segments || 10);
  return {
    box: new THREE.BoxGeometry(1, 1, 1),
    plane: new THREE.PlaneGeometry(1, 1),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, seg),
    cylLow: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
    cone: new THREE.ConeGeometry(0.5, 1, Math.max(6, seg - 2)),
    sphere: new THREE.SphereGeometry(0.5, seg, Math.max(5, (seg / 2) | 0)),
    capsule: new THREE.CapsuleGeometry(0.3, 0.6, 3, seg),
    torus: new THREE.TorusGeometry(0.4, 0.1, 6, seg),
  };
}

/* ====================== primitive helpers ====================== */

/**
 * A scaled unit box. Shares one geometry across the entire site.
 * `collide` adds an axis-aligned collider derived from the transform.
 */
export function box(geo, material, w, h, d, x, y, z, { rotY = 0, rotX = 0, rotZ = 0, shadow = true, receive = true } = {}) {
  const mesh = new THREE.Mesh(geo.box, material);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  if (rotY) mesh.rotation.y = rotY;
  if (rotX) mesh.rotation.x = rotX;
  if (rotZ) mesh.rotation.z = rotZ;
  mesh.castShadow = shadow;
  mesh.receiveShadow = receive;
  return mesh;
}

export function cylinder(geo, material, radius, height, x, y, z, { rotX = 0, rotZ = 0, low = false, shadow = true } = {}) {
  const mesh = new THREE.Mesh(low ? geo.cylLow : geo.cyl, material);
  mesh.scale.set(radius * 2, height, radius * 2);
  mesh.position.set(x, y, z);
  if (rotX) mesh.rotation.x = rotX;
  if (rotZ) mesh.rotation.z = rotZ;
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

/** Axis-aligned collider record consumed by the first-person controller. */
export function collider(x, y, z, w, h, d) {
  return {
    minX: x - w / 2, maxX: x + w / 2,
    minY: y - h / 2, maxY: y + h / 2,
    minZ: z - d / 2, maxZ: z + d / 2,
  };
}

export function colliderFromMesh(mesh) {
  const bbox = new THREE.Box3().setFromObject(mesh);
  return {
    minX: bbox.min.x, maxX: bbox.max.x,
    minY: bbox.min.y, maxY: bbox.max.y,
    minZ: bbox.min.z, maxZ: bbox.max.z,
  };
}

/* ===================== merged tube structures ===================== */

// Builds one merged geometry from a list of {w,h,d,x,y,z,rotX,rotY,rotZ}
// box descriptions. Used for scaffolds/guardrails so a structure of 80
// tubes costs a single draw call.
function mergeBoxes(parts) {
  const geoms = parts.map((p) => {
    const g = new THREE.BoxGeometry(p.w, p.h, p.d);
    const m = new THREE.Matrix4();
    const e = new THREE.Euler(p.rotX || 0, p.rotY || 0, p.rotZ || 0);
    m.makeRotationFromEuler(e);
    m.setPosition(p.x, p.y, p.z);
    g.applyMatrix4(m);
    return g;
  });
  const merged = mergeGeometries(geoms, false);
  geoms.forEach((g) => g.dispose());
  return merged;
}

export function mergedMesh(parts, material, { shadow = true } = {}) {
  const geometry = mergeBoxes(parts);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

/* ============================= ground ============================= */

export function buildGround(mat, size = 240) {
  const group = new THREE.Group();
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat.ground);
  plane.rotation.x = -Math.PI / 2;
  plane.receiveShadow = true;
  plane.name = "ground";
  group.add(plane);
  return group;
}

/** Perimeter hoarding — plywood panels on posts, with hazard stripes. */
export function buildHoarding(geo, mat, { width = 90, depth = 70, height = 2.4, gateAt = "north" } = {}) {
  const group = new THREE.Group();
  const colliders = [];
  const hx = width / 2;
  const hz = depth / 2;
  const panel = 3;

  const run = (from, to, axis, z, skipRange) => {
    for (let p = from; p < to; p += panel) {
      const centre = p + panel / 2;
      if (skipRange && centre > skipRange[0] && centre < skipRange[1]) continue;
      const x = axis === "x" ? centre : z;
      const zz = axis === "x" ? z : centre;
      const w = axis === "x" ? panel - 0.1 : 0.14;
      const d = axis === "x" ? 0.14 : panel - 0.1;
      group.add(box(geo, mat.plywood, w, height, d, x, height / 2, zz));
      group.add(box(geo, mat.hazard, w, 0.22, d + 0.02, x, height - 0.3, zz));
      colliders.push(collider(x, height / 2, zz, w, height, d));
    }
  };

  run(-hx, hx, "x", -hz, gateAt === "north" ? [-7, 7] : null);
  run(-hx, hx, "x", hz, gateAt === "south" ? [-7, 7] : null);
  run(-hz, hz, "z", -hx, gateAt === "west" ? [-7, 7] : null);
  run(-hz, hz, "z", hx, gateAt === "east" ? [-7, 7] : null);

  // The gateway is visually open — that is where the player arrives —
  // but it gets an invisible collider so nobody can walk out of the
  // site boundary and wander off across empty ground mid-mission.
  const gate = { north: [0, -hz], south: [0, hz], west: [-hx, 0], east: [hx, 0] }[gateAt];
  if (gate) {
    const [gx, gz] = gate;
    const alongX = gateAt === "north" || gateAt === "south";
    colliders.push(collider(
      gx, height / 2, gz,
      alongX ? 14 : 0.3, height,
      alongX ? 0.3 : 14
    ));
  }

  return { group, colliders };
}

/* ========================= site branding ========================= */

/**
 * A run of developer hoarding banner panels. Sits just inside the site
 * boundary so it is readable from anywhere inside the compound.
 *
 * Purely decorative — the hoarding itself already provides the collider.
 */
export function buildBrandBanners(geo, mat, {
  width = 90, depth = 70, height = 2.4, panel = 9,
} = {}) {
  const group = new THREE.Group();
  const hx = width / 2;
  const hz = depth / 2;
  const y = height * 0.62;
  const bh = height * 0.58;

  const place = (x, z, rotY) => {
    const sign = new THREE.Mesh(geo.plane, mat.brand);
    sign.scale.set(panel, bh, 1);
    sign.position.set(x, y, z);
    sign.rotation.y = rotY;
    group.add(sign);
  };

  // Four banners facing inwards, one per side, clear of the gateway.
  place(-hx * 0.45, -hz + 0.1, 0);
  place(hx * 0.45, hz - 0.1, Math.PI);
  place(-hx + 0.1, hz * 0.4, Math.PI / 2);
  place(hx - 0.1, -hz * 0.4, -Math.PI / 2);

  return group;
}

/**
 * The finished 19-floor Casagrand Aira tower, standing beyond the site
 * boundary. It is SCENERY — the player never enters it — so it is built
 * from a handful of merged meshes and carries no colliders.
 *
 * Its job is to give every mission a skyline and a reason to be there:
 * this is the building the work is for.
 */
export function buildBrandedTower(geo, mat, {
  x = 0, z = -95, floors = 19, floorHeight = 3.1,
  width = 20, depth = 16, rotY = 0, crown = true,
} = {}) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotY;

  const totalHeight = floors * floorHeight;
  const hw = width / 2;
  const hd = depth / 2;

  // --- podium ---
  group.add(box(geo, mat.concrete, width + 5, 1.2, depth + 5, 0, 0.6, 0));
  group.add(box(geo, mat.concreteDark, width + 2.4, 4.4, depth + 2.4, 0, 3.4, 0));

  // --- the shaft: one merged core, then glass on all four faces ---
  group.add(box(geo, mat.concrete, width, totalHeight, depth, 0, 5.6 + totalHeight / 2, 0));

  const glassFace = (w, px, pz, ry) => {
    const face = new THREE.Mesh(geo.plane, mat.curtainWall);
    face.scale.set(w, totalHeight - 1, 1);
    face.position.set(px, 5.6 + totalHeight / 2, pz);
    face.rotation.y = ry;
    group.add(face);
  };
  glassFace(width - 1.4, 0, hd + 0.06, 0);
  glassFace(width - 1.4, 0, -hd - 0.06, Math.PI);
  glassFace(depth - 1.4, hw + 0.06, 0, Math.PI / 2);
  glassFace(depth - 1.4, -hw - 0.06, 0, -Math.PI / 2);

  // --- floor bands and balconies, merged into two meshes ---
  const bands = [];
  const balconies = [];
  for (let f = 0; f < floors; f++) {
    const y = 5.6 + f * floorHeight;
    bands.push({ w: width + 0.5, h: 0.34, d: depth + 0.5, x: 0, y, z: 0 });
    // Alternating balconies break up the facade without doubling the mesh.
    if (f % 2 === 1 && f > 1) {
      balconies.push({ w: width * 0.42, h: 0.22, d: 1.5, x: -width * 0.22, y: y + 0.3, z: hd + 0.75 });
      balconies.push({ w: width * 0.42, h: 0.22, d: 1.5, x: width * 0.22, y: y + 0.3, z: -hd - 0.75 });
    }
  }
  group.add(mergedMesh(bands, mat.concreteDark));
  if (balconies.length) group.add(mergedMesh(balconies, mat.white));

  // --- roof and crown signage ---
  const roofY = 5.6 + totalHeight;
  group.add(box(geo, mat.concreteDark, width + 1.6, 0.7, depth + 1.6, 0, roofY + 0.35, 0));
  group.add(box(geo, mat.steelDark, 3.2, 2.6, 3.2, -hw + 3, roofY + 2, -hd + 3));

  if (crown) {
    // The name across the top of the tower, readable from the whole site.
    const signW = width * 0.86;
    const signH = signW / 4;
    const front = new THREE.Mesh(geo.plane, mat.brandDark);
    front.scale.set(signW, signH, 1);
    front.position.set(0, roofY + 1.1 + signH / 2, hd + 0.9);
    group.add(front);

    const back = new THREE.Mesh(geo.plane, mat.brandDark);
    back.scale.set(signW, signH, 1);
    back.position.set(0, roofY + 1.1 + signH / 2, -hd - 0.9);
    back.rotation.y = Math.PI;
    group.add(back);

    // Aviation warning lights on the parapet corners.
    [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]].forEach(([cx, cz]) => {
      group.add(box(geo, mat.red, 0.4, 0.4, 0.4, cx, roofY + 0.9, cz));
    });
  }

  group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return { group, height: roofY + 4, floors };
}

/* =========================== buildings =========================== */

/**
 * Builds one slab as a set of merged spans, skipping any rectangle in
 * `voids`. This is what makes the building genuinely navigable: the
 * stair core punches a real hole through every upper slab (otherwise
 * the slab above becomes a ceiling and the stairs are unusable), and a
 * game can punch an extra hole for an unprotected floor opening the
 * player can actually fall through.
 *
 * Returns { boxes } in LOCAL coordinates (relative to the slab centre),
 * each { x, z, w, d }. Merging rows into spans keeps both the vertex
 * count and the collider count low: a clear 18x14 slab becomes 14
 * spans, not 252 tiles.
 */
// Half-width of the clear space a flight needs either side of its centre.
const STAIR_CLEAR = 1.2;

function slabSpans(width, depth, voids, tile = 0.5) {
  const cols = Math.ceil(width / tile);
  const rows = Math.ceil(depth / tile);
  const spans = [];

  // A tile is removed if it OVERLAPS a void at all, not if its centre
  // happens to fall inside one. Centre-testing quantises the hole to the
  // tile grid, which can leave a sliver of slab exactly where a climbing
  // player needs head clearance (and did: it made the stairs unusable).
  // Erring towards a slightly larger hole is always safe, because every
  // void in this game is either railed off or deliberately open.
  const overlapsVoid = (x0, x1, z0, z1) => voids.some((v) =>
    x0 < v.x + v.w / 2 && x1 > v.x - v.w / 2 &&
    z0 < v.z + v.d / 2 && z1 > v.z - v.d / 2
  );

  for (let r = 0; r < rows; r++) {
    const z0 = -depth / 2 + r * tile;
    const z1 = Math.min(depth / 2, z0 + tile);
    let runStart = null;
    for (let c = 0; c <= cols; c++) {
      const x0 = -width / 2 + c * tile;
      const x1 = Math.min(width / 2, x0 + tile);
      const solid = c < cols && x1 > x0 && !overlapsVoid(x0, x1, z0, z1);
      if (solid && runStart === null) runStart = x0;
      if (!solid && runStart !== null) {
        const spanW = x0 - runStart;
        if (spanW > 0.01) {
          spans.push({ x: runStart + spanW / 2, z: (z0 + z1) / 2, w: spanW, d: z1 - z0 });
        }
        runStart = null;
      }
    }
  }
  return spans;
}

/**
 * A reinforced-concrete frame under construction: columns, slabs with
 * real voids, a stair core with usable flights, and per-floor edge
 * data the games can protect or deliberately leave open.
 *
 * `openings` is a list of { floor, x, z, w, d } in LOCAL coordinates —
 * genuine holes in that floor's slab.
 *
 * Returns { group, colliders, floors, core, footprint, slabGroups }
 */
export function buildConcreteFrame(geo, mat, {
  x = 0, z = 0, width = 18, depth = 14, floors = 4, floorHeight = 3.4,
  slabThickness = 0.32, columnSize = 0.6, openings = [], core = true,
} = {}) {
  const group = new THREE.Group();
  const colliders = [];
  const floorData = [];
  const slabGroups = [];
  const hw = width / 2;
  const hd = depth / 2;

  // One straight flight per storey, climbing in +x along the north side.
  // The geometry comes from stairs.js, which is unit tested against the
  // controller so the flight is guaranteed walkable.
  const flightZ = -hd + 2.1;
  const flightXStart = -hw + 1.0;
  const flights = [];
  for (let f = 0; f < Math.max(0, floors - 1); f++) {
    const flight = stairFlight({
      xStart: flightXStart,
      zCenter: flightZ,
      baseY: f * floorHeight,
      rise: floorHeight,
      slabThickness,
    });
    // Dev-time assertion. Guarded on `process` existing so this is safe
    // in the browser bundle and in the Node test harness alike.
    if (typeof process === "undefined" || process.env?.NODE_ENV !== "production") {
      const problems = validateFlight(flight);
      if (problems.length) console.warn("[arena] stair flight problems:", problems);
    }
    flights.push(flight);
  }
  // Every upper slab is voided for the flight that arrives at it.
  const stairVoidFor = (floorIndex) => (floorIndex >= 1 ? flights[floorIndex - 1]?.voidRect : null);

  // Column grid roughly every 5 m.
  const colsX = Math.max(2, Math.round(width / 5) + 1);
  const colsZ = Math.max(2, Math.round(depth / 5) + 1);
  const gridX = [];
  const gridZ = [];
  for (let i = 0; i < colsX; i++) gridX.push(-hw + (width * i) / (colsX - 1));
  for (let i = 0; i < colsZ; i++) gridZ.push(-hd + (depth * i) / (colsZ - 1));

  for (let f = 0; f < floors; f++) {
    const slabY = f * floorHeight;
    const floorOpenings = openings.filter((o) => o.floor === f);
    // The ground slab is cast on grade — no voids, you cannot fall
    // through it. Every upper slab gets its arriving flight's void.
    const stairVoid = stairVoidFor(f);
    const voids = f === 0 ? [] : [...(stairVoid ? [stairVoid] : []), ...floorOpenings];

    const spans = slabSpans(width, depth, voids);
    const slabMesh = mergedMesh(
      spans.map((s) => ({ w: s.w, h: slabThickness, d: s.d, x: s.x, y: -slabThickness / 2, z: s.z })),
      mat.concreteSlab,
      { shadow: f > 0 }
    );
    slabMesh.position.set(x, slabY, z);
    slabMesh.userData.floorIndex = f;
    group.add(slabMesh);
    slabGroups.push(slabMesh);

    spans.forEach((s) => {
      colliders.push(collider(x + s.x, slabY - slabThickness / 2, z + s.z, s.w, slabThickness, s.d));
    });

    // Columns up to the next floor.
    if (f < floors - 1) {
      const columnParts = [];
      const flight = flights[f];
      gridX.forEach((gx) => {
        gridZ.forEach((gz) => {
          // Skip columns that would stand in the middle of a flight.
          if (flight &&
              gx > flight.xStart - 0.6 && gx < flight.xEnd + 0.6 &&
              Math.abs(gz - flightZ) < STAIR_CLEAR) return;
          columnParts.push({ w: columnSize, h: floorHeight, d: columnSize, x: gx, y: slabY + floorHeight / 2, z: gz });
          colliders.push(collider(x + gx, slabY + floorHeight / 2, z + gz, columnSize, floorHeight, columnSize));
        });
      });
      if (columnParts.length) {
        const columnMesh = mergedMesh(columnParts, mat.concrete);
        columnMesh.position.set(x, 0, z);
        group.add(columnMesh);
      }
    }

    // The flight up to the next floor, plus a stringer wall on one side
    // so it reads as a real stair rather than floating treads.
    if (core && f < floors - 1 && flights[f]) {
      const flight = flights[f];
      const treadParts = flight.treads.map((t) => ({ w: t.w, h: t.h, d: t.d, x: t.x, y: t.y, z: t.z }));
      flight.treads.forEach((t) => {
        colliders.push(collider(x + t.x, t.y, z + t.z, t.w, t.h, t.d));
      });
      const treadMesh = mergedMesh(treadParts, mat.concreteDark);
      treadMesh.position.set(x, 0, z);
      group.add(treadMesh);

      // Sloping stringer walls either side of the flight (visual only —
      // the treads carry the collision).
      const slope = Math.atan2(floorHeight, flight.going);
      const diagonal = Math.hypot(floorHeight, flight.going);
      [-1, 1].forEach((side) => {
        const stringer = box(
          geo, mat.concrete, diagonal, 0.5, 0.18,
          x + (flight.xStart + flight.xEnd) / 2,
          slabY + floorHeight / 2 - 0.3,
          z + flightZ + side * (STAIR_CLEAR + 0.09),
          { rotZ: slope }
        );
        group.add(stringer);
      });

      // Guardrails around the stairwell void in the slab above, so the
      // only way in is down the flight itself.
      flight.railRuns.forEach((run) => {
        const rail = buildGuardrail(mat, {
          x: x + run.x,
          y: slabY + floorHeight,
          z: z + run.z,
          length: run.length,
          axis: run.axis,
        });
        group.add(rail);
        if (run.axis === "x") {
          colliders.push(collider(x + run.x, slabY + floorHeight + 0.55, z + run.z, run.length, 1.1, 0.12));
        } else {
          colliders.push(collider(x + run.x, slabY + floorHeight + 0.55, z + run.z, 0.12, 1.1, run.length));
        }
      });
    }

    floorData.push({
      index: f,
      y: slabY,
      openings: floorOpenings.map((o) => ({ ...o, worldX: x + o.x, worldZ: z + o.z })),
      // World-space edge runs, so a game can decide which to protect.
      edges: {
        north: { x, z: z - hd, length: width, axis: "x" },
        south: { x, z: z + hd, length: width, axis: "x" },
        west: { x: x - hw, z, length: depth, axis: "z" },
        east: { x: x + hw, z, length: depth, axis: "z" },
      },
    });
  }

  return {
    group,
    colliders,
    floors: floorData,
    slabGroups,
    // World-space stair information, so a game can spawn the player
    // facing the stairs or put a sign at the bottom of the flight.
    stairs: flights.map((flight, index) => ({
      floorFrom: index,
      floorTo: index + 1,
      entry: { x: x + flight.entry.x, z: z + flight.entry.z, y: index * floorHeight },
      exit: { x: x + flight.exit.x, z: z + flight.exit.z, y: flight.topY },
      xStart: x + flight.xStart,
      xEnd: x + flight.xEnd,
      z: z + flightZ,
      voidRect: { x: x + flight.voidRect.x, z: z + flight.voidRect.z, w: flight.voidRect.w, d: flight.voidRect.d },
    })),
    footprint: { x, z, width, depth, floorHeight, count: floors, hw, hd },
  };
}

/**
 * A compliant guardrail run: top rail at 1.1 m, mid rail, and a toe
 * board. Merged to one draw call. `compliant:false` omits the mid rail
 * and toe board so games can show a defective rail.
 */
export function buildGuardrail(mat, { x, y, z, length, axis = "x", compliant = true, height = 1.1 } = {}) {
  const parts = [];
  const posts = Math.max(2, Math.round(length / 2) + 1);
  const along = (i) => -length / 2 + (length * i) / (posts - 1);

  for (let i = 0; i < posts; i++) {
    const a = along(i);
    parts.push({
      w: axis === "x" ? 0.07 : 0.07, h: height, d: 0.07,
      x: axis === "x" ? a : 0, y: height / 2, z: axis === "x" ? 0 : a,
    });
  }
  // Top rail.
  parts.push({
    w: axis === "x" ? length : 0.06, h: 0.06, d: axis === "x" ? 0.06 : length,
    x: 0, y: height, z: 0,
  });
  if (compliant) {
    // Mid rail at ~0.55 m.
    parts.push({
      w: axis === "x" ? length : 0.05, h: 0.05, d: axis === "x" ? 0.05 : length,
      x: 0, y: height * 0.5, z: 0,
    });
  }

  const mesh = mergedMesh(parts, compliant ? mat.galv : mat.steelDark);
  const group = new THREE.Group();
  group.add(mesh);

  if (compliant) {
    // Toe board (150 mm) in timber, separate material.
    const toe = new THREE.Mesh(
      new THREE.BoxGeometry(axis === "x" ? length : 0.04, 0.15, axis === "x" ? 0.04 : length),
      mat.timber
    );
    toe.position.set(0, 0.09, 0);
    toe.castShadow = true;
    group.add(toe);
  }

  group.position.set(x, y, z);
  return group;
}

/**
 * Scaffold tower: standards, ledgers, transoms, braces and boarded
 * lifts. `incompleteLift` leaves one platform unboarded (a classic
 * hazard). Returns { group, colliders, platforms }.
 */
export function buildScaffold(geo, mat, {
  x = 0, y = 0, z = 0, bays = 3, depth = 1.2, lifts = 4, liftHeight = 2,
  incompleteLift = -1, missingGuardrailLift = -1, axis = "x",
} = {}) {
  const group = new THREE.Group();
  const colliders = [];
  const platforms = [];
  const bayWidth = 2.1;
  const length = bays * bayWidth;
  const tube = 0.055;
  const parts = [];

  const posX = [];
  for (let i = 0; i <= bays; i++) posX.push(-length / 2 + i * bayWidth);
  const posZ = [-depth / 2, depth / 2];
  const totalHeight = lifts * liftHeight;

  // Standards (vertical tubes).
  posX.forEach((px) => {
    posZ.forEach((pz) => {
      parts.push({ w: tube, h: totalHeight + 1.1, d: tube, x: px, y: (totalHeight + 1.1) / 2, z: pz });
    });
  });

  for (let l = 1; l <= lifts; l++) {
    const ly = l * liftHeight;
    // Ledgers (lengthwise).
    posZ.forEach((pz) => {
      parts.push({ w: length, h: tube, d: tube, x: 0, y: ly, z: pz });
    });
    // Transoms (crosswise).
    posX.forEach((px) => {
      parts.push({ w: tube, h: tube, d: depth, x: px, y: ly, z: 0 });
    });
    // Facade bracing on alternate bays.
    for (let b = 0; b < bays; b += 2) {
      const bx = -length / 2 + b * bayWidth + bayWidth / 2;
      const diag = Math.hypot(bayWidth, liftHeight);
      parts.push({
        w: diag, h: tube, d: tube,
        x: bx, y: ly - liftHeight / 2, z: posZ[0],
        rotZ: Math.atan2(liftHeight, bayWidth),
      });
    }
    // Guardrails on the boarded lifts.
    const hasRail = l !== missingGuardrailLift;
    if (hasRail && l >= 1) {
      [1.0, 0.5].forEach((h) => {
        parts.push({ w: length, h: tube, d: tube, x: 0, y: ly + h, z: posZ[1] });
      });
      posX.forEach((px) => {
        parts.push({ w: tube, h: 1.05, d: tube, x: px, y: ly + 0.52, z: posZ[1] });
      });
    }
  }

  const frame = mergedMesh(parts, mat.galv);
  group.add(frame);

  // Boarded platforms (scaffold boards), per lift.
  for (let l = 1; l <= lifts; l++) {
    const ly = l * liftHeight;
    const boards = 5;
    const incomplete = l === incompleteLift;
    const shown = incomplete ? boards - 2 : boards;
    for (let b = 0; b < shown; b++) {
      const bz = -depth / 2 + (depth * (b + 0.5)) / boards;
      const plank = new THREE.Mesh(new THREE.BoxGeometry(length, 0.04, depth / boards - 0.02), mat.timber);
      plank.position.set(0, ly + 0.03, bz);
      plank.castShadow = true;
      plank.receiveShadow = true;
      plank.userData.walkable = true;
      group.add(plank);
    }
    platforms.push({ y: ly + 0.05, incomplete, hasGuardrail: l !== missingGuardrailLift, boardsShown: shown, boardsTotal: boards });
    // The incomplete lift keeps its collider deliberately: the gap is a
    // visible defect to be inspected and reported, not a trapdoor that
    // silently drops the player off the scaffold.
    colliders.push(collider(x, ly + 0.03, z, length, 0.08, depth));
  }

  // Access ladder up the inside face.
  const ladder = buildLadder(geo, mat, { height: totalHeight + 0.4, lean: 0 });
  ladder.position.set(-length / 2 + 0.4, 0, depth / 2 - 0.15);
  group.add(ladder);

  group.position.set(x, y, z);
  // Shift colliders into world space.
  const worldColliders = colliders.map((c) => ({
    minX: c.minX + x, maxX: c.maxX + x,
    minY: c.minY + y, maxY: c.maxY + y,
    minZ: c.minZ + z, maxZ: c.maxZ + z,
  }));
  return { group, colliders: worldColliders, platforms, length, totalHeight };
}

export function buildLadder(geo, mat, { height = 4, lean = 0.18, width = 0.44 } = {}) {
  const group = new THREE.Group();
  const parts = [];
  const rungs = Math.max(3, Math.floor(height / 0.3));
  [-width / 2, width / 2].forEach((sx) => {
    parts.push({ w: 0.05, h: height, d: 0.05, x: sx, y: height / 2, z: 0 });
  });
  for (let r = 1; r < rungs; r++) {
    parts.push({ w: width, h: 0.035, d: 0.035, x: 0, y: (height * r) / rungs, z: 0 });
  }
  const mesh = mergedMesh(parts, mat.steel);
  group.add(mesh);
  group.rotation.x = lean;
  group.userData.ladder = true;
  return group;
}

/* ========================== tower crane ========================== */

/**
 * A full tower crane with every moving part exposed so the game can
 * actually drive it:
 *
 *   parts.slew    rotate on Y  → swings jib + counter-jib + trolley
 *   parts.trolley translate X  → runs out along the jib
 *   parts.hook    translate Y  → hoists up/down (rope auto-scales)
 *   parts.rope    scaled to match hook drop
 *
 * Returns { group, parts, spec }
 */
export function buildTowerCrane(geo, mat, {
  x = 0, z = 0, mastHeight = 34, jibLength = 38, counterJib = 13,
} = {}) {
  const group = new THREE.Group();
  const mastWidth = 2.0;
  const tube = 0.14;

  // --- base ---
  const base = box(geo, mat.concreteDark, 6, 1.2, 6, 0, 0.6, 0);
  group.add(base);

  // --- mast (lattice, merged) ---
  const mastParts = [];
  const sections = Math.ceil(mastHeight / 3);
  const corner = mastWidth / 2;
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) => {
    mastParts.push({ w: tube, h: mastHeight, d: tube, x: sx * corner, y: mastHeight / 2 + 1.2, z: sz * corner });
  });
  for (let s = 0; s <= sections; s++) {
    const y = 1.2 + (mastHeight * s) / sections;
    mastParts.push({ w: mastWidth, h: tube * 0.8, d: tube * 0.8, x: 0, y, z: -corner });
    mastParts.push({ w: mastWidth, h: tube * 0.8, d: tube * 0.8, x: 0, y, z: corner });
    mastParts.push({ w: tube * 0.8, h: tube * 0.8, d: mastWidth, x: -corner, y, z: 0 });
    mastParts.push({ w: tube * 0.8, h: tube * 0.8, d: mastWidth, x: corner, y, z: 0 });
    if (s < sections) {
      const h = mastHeight / sections;
      const diag = Math.hypot(mastWidth, h);
      const angle = Math.atan2(h, mastWidth);
      mastParts.push({ w: diag, h: tube * 0.7, d: tube * 0.7, x: 0, y: y + h / 2, z: -corner, rotZ: angle });
      mastParts.push({ w: diag, h: tube * 0.7, d: tube * 0.7, x: 0, y: y + h / 2, z: corner, rotZ: -angle });
    }
  }
  group.add(mergedMesh(mastParts, mat.craneYellow));

  // --- slewing assembly: everything above the mast turns ---
  const slew = new THREE.Group();
  slew.position.set(0, mastHeight + 1.2, 0);
  group.add(slew);

  const slewRing = cylinder(geo, mat.steelDark, 1.25, 0.6, 0, 0.3, 0);
  slew.add(slewRing);

  // Operator cab.
  const cab = box(geo, mat.craneYellow, 1.8, 1.7, 1.8, 1.6, 1.5, 0);
  slew.add(cab);
  const cabGlass = box(geo, mat.glass, 1.5, 1.1, 0.06, 1.6, 1.6, 0.92);
  slew.add(cabGlass);

  // A-frame / apex.
  const apexHeight = 6;
  slew.add(box(geo, mat.craneYellow, 0.22, apexHeight, 0.22, 0, 0.6 + apexHeight / 2, 0));

  // --- jib (front) ---
  const jibParts = [];
  const jibDepth = 1.5;
  const jibSections = Math.ceil(jibLength / 3);
  [[-1], [1]].forEach(([sz]) => {
    jibParts.push({ w: jibLength, h: tube, d: tube, x: jibLength / 2, y: 1.1, z: (sz * jibDepth) / 2 });
    jibParts.push({ w: jibLength, h: tube, d: tube, x: jibLength / 2, y: 1.1 - jibDepth * 0.7, z: (sz * jibDepth) / 2 });
  });
  for (let s = 0; s <= jibSections; s++) {
    const px = (jibLength * s) / jibSections;
    jibParts.push({ w: tube * 0.7, h: jibDepth * 0.7, d: tube * 0.7, x: px, y: 1.1 - jibDepth * 0.35, z: -jibDepth / 2 });
    jibParts.push({ w: tube * 0.7, h: jibDepth * 0.7, d: tube * 0.7, x: px, y: 1.1 - jibDepth * 0.35, z: jibDepth / 2 });
    jibParts.push({ w: tube * 0.7, h: tube * 0.7, d: jibDepth, x: px, y: 1.1, z: 0 });
    if (s < jibSections) {
      const seg = jibLength / jibSections;
      const diag = Math.hypot(seg, jibDepth * 0.7);
      jibParts.push({
        w: diag, h: tube * 0.6, d: tube * 0.6,
        x: px + seg / 2, y: 1.1 - jibDepth * 0.35, z: -jibDepth / 2,
        rotZ: Math.atan2(jibDepth * 0.7, seg),
      });
      jibParts.push({
        w: diag, h: tube * 0.6, d: tube * 0.6,
        x: px + seg / 2, y: 1.1 - jibDepth * 0.35, z: jibDepth / 2,
        rotZ: -Math.atan2(jibDepth * 0.7, seg),
      });
    }
  }
  slew.add(mergedMesh(jibParts, mat.craneYellow));

  // Pendant ties from apex to jib.
  const tieLength = Math.hypot(jibLength * 0.55, apexHeight);
  slew.add(box(geo, mat.steelDark, tieLength, 0.07, 0.07, jibLength * 0.275, 0.6 + apexHeight / 2 + 0.3, 0, {
    rotZ: -Math.atan2(apexHeight - 0.5, jibLength * 0.55),
  }));

  // --- counter-jib + counterweights ---
  const cjParts = [];
  [[-1], [1]].forEach(([sz]) => {
    cjParts.push({ w: counterJib, h: tube, d: tube, x: -counterJib / 2, y: 1.1, z: (sz * jibDepth) / 2 });
    cjParts.push({ w: counterJib, h: tube, d: tube, x: -counterJib / 2, y: 0.4, z: (sz * jibDepth) / 2 });
  });
  for (let s = 0; s <= Math.ceil(counterJib / 2.6); s++) {
    const px = -(counterJib * s) / Math.ceil(counterJib / 2.6);
    cjParts.push({ w: tube * 0.7, h: 0.7, d: tube * 0.7, x: px, y: 0.75, z: -jibDepth / 2 });
    cjParts.push({ w: tube * 0.7, h: 0.7, d: tube * 0.7, x: px, y: 0.75, z: jibDepth / 2 });
  }
  slew.add(mergedMesh(cjParts, mat.craneYellow));
  for (let i = 0; i < 4; i++) {
    slew.add(box(geo, mat.concreteDark, 0.45, 2.2, 2.6, -counterJib + 0.6 + i * 0.5, 1.1, 0));
  }
  // The developer's name on the counterweight, the way contractors brand
  // a tower crane — readable from anywhere on site.
  [[1, 1.32], [-1, -1.32]].forEach(([side, zOff]) => {
    const plate = new THREE.Mesh(geo.plane, mat.brandPlate);
    plate.scale.set(2.0, 2.0, 1);
    plate.position.set(-counterJib + 1.35, 1.1, zOff);
    plate.rotation.y = side > 0 ? 0 : Math.PI;
    slew.add(plate);
  });

  // Hoist winch + machinery deck.
  slew.add(box(geo, mat.steelDark, 2.6, 1.3, 2.0, -3.2, 1.5, 0));
  slew.add(cylinder(geo, mat.steel, 0.42, 1.7, -3.2, 1.6, 0, { rotX: Math.PI / 2 }));

  // --- jib walkway and handrail, so the jib reads as something a rigger
  //     can actually walk out along ---
  const walkway = [];
  const railSteps = Math.ceil(jibLength / 2.5);
  for (let s = 0; s <= railSteps; s++) {
    const px = (jibLength * s) / railSteps;
    walkway.push({ w: 0.08, h: 0.95, d: 0.08, x: px, y: 1.1 + 0.48, z: jibDepth / 2 });
  }
  walkway.push({ w: jibLength, h: 0.06, d: 0.06, x: jibLength / 2, y: 1.1 + 0.95, z: jibDepth / 2 });
  walkway.push({ w: jibLength, h: 0.06, d: 0.06, x: jibLength / 2, y: 1.1 + 0.5, z: jibDepth / 2 });
  slew.add(mergedMesh(walkway, mat.galv, { shadow: false }));

  // Obstruction light and anemometer at the jib tip.
  slew.add(box(geo, mat.red, 0.3, 0.3, 0.3, jibLength - 0.4, 1.5, 0));
  slew.add(cylinder(geo, mat.white, 0.03, 0.7, jibLength - 1.4, 1.75, 0, { low: true, shadow: false }));
  [0, 2.09, 4.19].forEach((a) => {
    slew.add(box(geo, mat.white, 0.26, 0.05, 0.12,
      jibLength - 1.4 + Math.cos(a) * 0.2, 2.05, Math.sin(a) * 0.2, { rotY: a, shadow: false }));
  });

  // Cab access platform and handrail.
  slew.add(box(geo, mat.galv, 1.5, 0.08, 1.0, 1.6, 0.6, 1.3, { shadow: false }));
  slew.add(box(geo, mat.galv, 1.5, 0.05, 0.05, 1.6, 1.5, 1.75, { shadow: false }));

  // --- trolley (runs along the jib) ---
  const trolley = new THREE.Group();
  trolley.add(box(geo, mat.steelDark, 1.1, 0.42, 1.5, 0, 0, 0));
  trolley.add(cylinder(geo, mat.steel, 0.18, 1.4, 0, 0.26, 0, { rotX: Math.PI / 2, low: true }));
  // Running wheels on the jib chords, and the sheave the rope passes over.
  [[-0.42, -0.62], [0.42, -0.62], [-0.42, 0.62], [0.42, 0.62]].forEach(([wx, wz]) => {
    trolley.add(cylinder(geo, mat.galv, 0.11, 0.1, wx, 0.3, wz, { rotX: Math.PI / 2, low: true, shadow: false }));
  });
  trolley.add(cylinder(geo, mat.galv, 0.22, 0.12, 0, -0.1, 0, { rotX: Math.PI / 2, low: true, shadow: false }));
  trolley.position.set(jibLength * 0.55, 0.78, 0);
  slew.add(trolley);

  // --- rope + hook block (children of the trolley so they follow it) ---
  const rope = cylinder(geo, mat.steelDark, 0.035, 1, 0, -0.5, 0, { low: true, shadow: false });
  rope.name = "hoistRope";
  trolley.add(rope);

  const hook = new THREE.Group();
  hook.name = "hookBlock";
  const blockBody = box(geo, mat.craneRed, 0.6, 0.55, 0.42, 0, 0, 0);
  hook.add(blockBody);
  hook.add(cylinder(geo, mat.steel, 0.2, 0.46, 0, 0.02, 0, { rotX: Math.PI / 2, low: true }));
  // The hook itself.
  const hookShank = cylinder(geo, mat.steel, 0.055, 0.5, 0, -0.52, 0, { low: true });
  hook.add(hookShank);
  const hookCurve = new THREE.Mesh(geo.torus, mat.steel);
  hookCurve.scale.set(0.55, 0.55, 0.55);
  hookCurve.position.set(0, -0.85, 0);
  hookCurve.rotation.y = Math.PI / 2;
  hook.add(hookCurve);
  // Sheave cheeks, the safety latch across the throat and a hi-vis
  // flash, so the block reads as hardware rather than a red box.
  [-0.24, 0.24].forEach((cz) => {
    hook.add(cylinder(geo, mat.galv, 0.22, 0.06, 0, 0.02, cz, { rotX: Math.PI / 2, low: true, shadow: false }));
  });
  hook.add(box(geo, mat.galv, 0.05, 0.3, 0.05, 0.16, -0.86, 0, { rotZ: 0.5, shadow: false }));
  hook.add(box(geo, mat.yellow, 0.63, 0.1, 0.45, 0, 0.24, 0, { shadow: false }));
  hook.position.set(0, -8, 0);
  trolley.add(hook);

  return {
    group,
    parts: { slew, trolley, hook, rope, cab },
    spec: {
      mastHeight, jibLength, counterJib,
      minRadius: 4.5,
      maxRadius: jibLength - 2,
      hookTopY: mastHeight + 1.2 + 0.78,
      baseX: x, baseZ: z,
    },
  };
}

/** Keeps the rope visually attached between the trolley and hook block. */
export function updateHoistRope(parts) {
  const drop = Math.max(0.2, -parts.hook.position.y);
  parts.rope.scale.set(0.07, drop, 0.07);
  parts.rope.position.y = -drop / 2;
}

/* ============================ workers ============================ */

/**
 * Low-poly worker. The flags are the hazard surface the games test:
 * helmet / vest / harness / boots / gloves can each be missing, and the
 * figure is posed so the problem is visible from a distance.
 */
export function buildWorker(geo, mat, {
  helmet = true, vest = true, harness = false, boots = true,
  helmetColor = "yellow", pose = "stand", skin = "skin", scale = 1,
} = {}) {
  const group = new THREE.Group();
  const helmetMat = { yellow: mat.yellow, white: mat.white, blue: mat.blue, orange: mat.orange, green: mat.green }[helmetColor] || mat.yellow;
  const skinMat = skin === "dark" ? mat.skinDark : mat.skin;

  // Legs.
  const legY = 0.45;
  [-0.14, 0.14].forEach((sx, i) => {
    const bend = pose === "crouch" ? 0.5 : pose === "kneel" && i === 0 ? 0.9 : 0;
    const leg = box(geo, mat.denim, 0.19, 0.9 - bend * 0.3, 0.19, sx, legY - bend * 0.18, 0);
    group.add(leg);
    if (boots) group.add(box(geo, mat.black, 0.22, 0.12, 0.3, sx, 0.06, 0.04));
  });

  // Torso.
  const torsoY = pose === "crouch" ? 1.12 : 1.24;
  group.add(box(geo, mat.denim, 0.46, 0.62, 0.26, 0, torsoY, 0));
  if (vest) {
    const v = box(geo, mat.hiVis, 0.5, 0.5, 0.3, 0, torsoY + 0.02, 0);
    group.add(v);
    // Reflective bands.
    group.add(box(geo, mat.white, 0.52, 0.06, 0.32, 0, torsoY + 0.12, 0, { shadow: false }));
    group.add(box(geo, mat.white, 0.52, 0.06, 0.32, 0, torsoY - 0.06, 0, { shadow: false }));
  }
  if (harness) {
    // Shoulder straps + dorsal D-ring, plus a lanyard hanging behind.
    [-0.14, 0.14].forEach((sx) => {
      group.add(box(geo, mat.black, 0.07, 0.56, 0.07, sx, torsoY + 0.04, 0.15, { shadow: false }));
    });
    group.add(box(geo, mat.black, 0.44, 0.07, 0.07, 0, torsoY - 0.14, 0.15, { shadow: false }));
    group.add(box(geo, mat.steel, 0.1, 0.1, 0.06, 0, torsoY + 0.2, -0.15, { shadow: false }));
    const lanyard = box(geo, mat.orange, 0.06, 0.9, 0.06, 0, torsoY - 0.1, -0.3, { rotX: 0.3, shadow: false });
    group.add(lanyard);
  }

  // Arms.
  const armRot = pose === "reach" ? -1.1 : pose === "work" ? -0.5 : 0.08;
  [-0.32, 0.32].forEach((sx) => {
    const arm = box(geo, skinMat, 0.15, 0.62, 0.15, sx, torsoY - 0.02, 0.05);
    arm.rotation.x = armRot;
    group.add(arm);
  });

  // Head + helmet.
  const headY = torsoY + 0.52;
  group.add(box(geo, skinMat, 0.26, 0.3, 0.26, 0, headY, 0));
  if (helmet) {
    const dome = new THREE.Mesh(geo.sphere, helmetMat);
    dome.scale.set(0.34, 0.26, 0.34);
    dome.position.set(0, headY + 0.17, 0);
    dome.castShadow = true;
    group.add(dome);
    // Peak.
    group.add(box(geo, helmetMat, 0.3, 0.04, 0.12, 0, headY + 0.11, 0.17));
  }

  if (pose === "crouch") group.position.y = -0.1;
  if (scale !== 1) group.scale.setScalar(scale);
  group.userData.worker = { helmet, vest, harness, boots };
  return group;
}

/* ====================== site objects & hazards ====================== */

export function buildCone(geo, mat, { height = 0.6 } = {}) {
  const group = new THREE.Group();
  group.add(box(geo, mat.black, 0.36, 0.05, 0.36, 0, 0.025, 0));
  const cone = new THREE.Mesh(geo.cone, mat.orange);
  cone.scale.set(0.5, height, 0.5);
  cone.position.y = height / 2 + 0.04;
  cone.castShadow = true;
  group.add(cone);
  const band = new THREE.Mesh(geo.cone, mat.white);
  band.scale.set(0.37, height * 0.18, 0.37);
  band.position.y = height * 0.52;
  group.add(band);
  return group;
}

export function buildBarrier(geo, mat, { length = 2, color = "orange" } = {}) {
  const group = new THREE.Group();
  const matColor = color === "red" ? mat.red : mat.orange;
  group.add(box(geo, matColor, length, 0.5, 0.12, 0, 0.75, 0));
  group.add(box(geo, mat.white, length * 0.9, 0.12, 0.14, 0, 0.75, 0, { shadow: false }));
  [-length / 2 + 0.1, length / 2 - 0.1].forEach((sx) => {
    group.add(box(geo, matColor, 0.12, 1, 0.12, sx, 0.5, 0));
    group.add(box(geo, mat.black, 0.5, 0.06, 0.5, sx, 0.03, 0));
  });
  return group;
}

export function buildSign(geo, mat, { text = "DANGER", kind = "warning", height = 2.1, width = 0.8, post = true } = {}) {
  const group = new THREE.Group();
  const faceMat = new THREE.MeshLambertMaterial({ map: signTexture(text, kind), side: THREE.DoubleSide });
  const face = new THREE.Mesh(geo.plane, faceMat);
  face.scale.set(width, width * 0.75, 1);
  face.position.set(0, height, 0.03);
  face.castShadow = false;
  group.add(face);
  group.add(box(geo, mat.white, width, width * 0.75, 0.04, 0, height, 0, { shadow: false }));
  if (post) {
    group.add(cylinder(geo, mat.galv, 0.035, height, 0, height / 2, 0, { low: true }));
    group.add(box(geo, mat.black, 0.4, 0.04, 0.4, 0, 0.02, 0));
  }
  return group;
}

export function buildFireExtinguisher(geo, mat, { onStand = true, cls = "ABC" } = {}) {
  const group = new THREE.Group();
  const body = cylinder(geo, mat.red, 0.11, 0.52, 0, 0.42, 0);
  group.add(body);
  group.add(cylinder(geo, mat.black, 0.055, 0.12, 0, 0.74, 0, { low: true }));
  group.add(box(geo, mat.steelDark, 0.2, 0.05, 0.07, 0.06, 0.78, 0));
  group.add(box(geo, mat.white, 0.13, 0.14, 0.02, 0, 0.46, 0.11, { shadow: false }));
  if (onStand) {
    group.add(box(geo, mat.red, 0.5, 0.05, 0.3, 0, 0.14, 0));
    group.add(box(geo, mat.red, 0.05, 0.16, 0.3, -0.22, 0.22, 0));
  }
  group.userData.extinguisherClass = cls;
  return group;
}

export function buildElectricalPanel(geo, mat, { unsafe = false, height = 1.6 } = {}) {
  const group = new THREE.Group();
  group.add(box(geo, mat.steelDark, 0.9, height, 0.32, 0, height / 2 + 0.3, 0));
  group.add(box(geo, mat.galv, 0.12, 0.6, 0.12, 0, 0.15, 0));
  // Door with a warning label.
  const door = new THREE.Mesh(geo.plane, new THREE.MeshLambertMaterial({ map: signTexture("Danger 415V", "warning"), side: THREE.DoubleSide }));
  door.scale.set(0.5, 0.38, 1);
  door.position.set(0, height / 2 + 0.55, 0.17);
  group.add(door);
  // Isolator handle.
  const handle = box(geo, unsafe ? mat.green : mat.red, 0.12, 0.2, 0.08, 0.3, height / 2 + 0.05, 0.18);
  handle.name = "isolator";
  group.add(handle);

  if (unsafe) {
    // Open door, exposed conductors, an unsupported trailing lead.
    group.add(box(geo, mat.steelDark, 0.9, height * 0.8, 0.04, -0.55, height / 2 + 0.4, 0.3, { rotY: 1.1 }));
    [-0.2, 0, 0.2].forEach((sx, i) => {
      group.add(cylinder(geo, [mat.red, mat.black, mat.blue][i], 0.018, 0.5, sx, height / 2 + 0.6, 0.2, { rotX: 0.4, low: true }));
    });
    group.add(box(geo, mat.yellow, 0.06, 0.06, 1.6, 0.1, 0.04, 0.9));
  }
  group.userData.unsafe = unsafe;
  return group;
}

/** Excavation / trench. `shored:false` is the cave-in hazard. */
/**
 * A real excavation rather than a timber-lined box: cut soil faces with
 * visible strata, an uneven dug floor, standing water and a pump, the
 * exposed service that is the reason it was dug, a spoil heap set back
 * from the edge, and — when `shored` — a proper trench-sheet, waler and
 * hydraulic-strut arrangement instead of two loose poles.
 *
 * The caller owns the pit volume and the walls that keep the player in
 * (see safetyMission), so this still returns no colliders by default.
 */
export function buildExcavation(geo, mat, {
  width = 8, depth = 3, trenchDepth = 2.2,
  shored = false, battered = false, edgeProtection = false,
  water = true, services = true, spoil = true,
} = {}) {
  const group = new THREE.Group();
  const colliders = [];
  const hw = width / 2;
  const hd = depth / 2;

  /* ---- the cut faces, built as soil strata ---- */
  // Topsoil, subsoil then clay, so the face reads as ground that was dug
  // rather than a plywood liner.
  const strata = [
    { mat: mat.ground, from: 0.0, to: 0.22 },
    { mat: mat.timberDark, from: 0.22, to: 0.62 },
    { mat: mat.concreteDark, from: 0.62, to: 1.0 },
  ];

  const faces = [];
  strata.forEach((band) => {
    const yTop = -trenchDepth * band.from;
    const yBot = -trenchDepth * band.to;
    const h = Math.abs(yTop - yBot);
    const y = (yTop + yBot) / 2;
    const parts = [
      { w: width, h, d: 0.16, x: 0, y, z: -hd },
      { w: width, h, d: 0.16, x: 0, y, z: hd },
      { w: 0.16, h, d: depth, x: -hw, y, z: 0 },
      { w: 0.16, h, d: depth, x: hw, y, z: 0 },
    ];
    faces.push({ band, mesh: mergedMesh(parts, band.mat) });
  });
  faces.forEach((f) => group.add(f.mesh));

  // An uneven dug floor: a grid of slightly different slab heights, so
  // the bottom is not a mirror.
  const floorTiles = [];
  const cols = Math.max(3, Math.round(width / 1.4));
  const rows = Math.max(2, Math.round(depth / 1.4));
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const jitter = ((c * 7 + r * 13) % 5) * 0.03;
      floorTiles.push({
        w: width / cols + 0.04, h: 0.12 + jitter, d: depth / rows + 0.04,
        x: -hw + (c + 0.5) * (width / cols),
        y: -trenchDepth + jitter / 2,
        z: -hd + (r + 0.5) * (depth / rows),
      });
    }
  }
  group.add(mergedMesh(floorTiles, mat.timberDark));

  /* ---- standing water and the pump that should be running ---- */
  if (water) {
    const pool = new THREE.Mesh(geo.plane, mat.water);
    pool.scale.set(width * 0.72, depth * 0.55, 1);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(-width * 0.08, -trenchDepth + 0.10, depth * 0.08);
    group.add(pool);

    // Pump on the bank with its hose dropped into the trench.
    const pump = new THREE.Group();
    pump.add(box(geo, mat.yellow, 0.5, 0.36, 0.4, 0, 0.18, 0));
    pump.add(cylinder(geo, mat.steelDark, 0.07, 0.3, 0.1, 0.5, 0, { low: true }));
    pump.position.set(-hw - 0.9, 0, -hd - 0.5);
    group.add(pump);
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      group.add(cylinder(geo, mat.black, 0.045, 0.42,
        -hw - 0.7 + t * 1.1, 0.12 - t * t * (trenchDepth + 0.1), -hd - 0.3 + t * 0.9,
        { rotX: Math.PI / 2.4, low: true }));
    }
  }

  /* ---- the service that is the reason for the dig ---- */
  if (services) {
    // A main crossing the trench, slung from a timber bearer.
    group.add(cylinder(geo, mat.blue, 0.14, depth + 0.6, 0, -trenchDepth * 0.42, 0,
      { rotX: Math.PI / 2 }));
    group.add(box(geo, mat.timber, 0.16, 0.16, depth + 1.2, 0, -trenchDepth * 0.18, 0));
    [-0.35, 0.35].forEach((off) => {
      group.add(box(geo, mat.steelDark, 0.05, trenchDepth * 0.26, 0.05,
        off, -trenchDepth * 0.3, 0));
    });
    // Yellow marker tape above the run.
    group.add(box(geo, mat.yellow, 0.1, 0.02, depth + 0.4, 0, -trenchDepth * 0.12, 0, { shadow: false }));
  }

  /* ---- spoil heap, correctly set back from the crest ---- */
  if (spoil) {
    const setBack = hd + 1.8;
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Mesh(geo.sphere, mat.ground);
      const t = i / 8;
      const bulk = 1.1 + Math.sin(t * Math.PI) * 1.3;
      s.scale.set(bulk, 0.55 + Math.sin(t * Math.PI) * 0.5, bulk * 0.8);
      s.position.set(-hw + t * width, 0.2, setBack + ((i % 3) - 1) * 0.3);
      s.castShadow = true;
      s.receiveShadow = true;
      group.add(s);
    }
    // Excavator track marks leading away from the heap.
    for (let i = 0; i < 5; i++) {
      group.add(box(geo, mat.timberDark, 1.6, 0.02, 0.34,
        -hw + i * (width / 4), 0.012, setBack + 2.2, { shadow: false }));
    }
  }

  /* ---- support ---- */
  if (shored) {
    // Trench sheets both faces, horizontal walers, then hydraulic struts
    // between them — the real arrangement, not two bare poles.
    [-1, 1].forEach((side) => {
      const sheets = [];
      const n = Math.max(4, Math.round(width / 0.6));
      for (let i = 0; i < n; i++) {
        sheets.push({
          w: width / n - 0.03, h: trenchDepth + 0.35, d: 0.06,
          x: -hw + (i + 0.5) * (width / n),
          y: -trenchDepth / 2 + 0.15,
          z: side * (hd - 0.1),
        });
      }
      group.add(mergedMesh(sheets, mat.galv));
      [-0.55, -1.55].forEach((wy) => {
        group.add(box(geo, mat.steel, width - 0.1, 0.16, 0.12, 0, wy, side * (hd - 0.22)));
      });
    });
    const struts = Math.max(3, Math.round(width / 2.2));
    for (let i = 0; i < struts; i++) {
      const px = -hw + (i + 0.5) * (width / struts);
      [-0.55, -1.55].forEach((sy) => {
        group.add(cylinder(geo, mat.craneRed, 0.07, depth - 0.3, px, sy, 0, { rotX: Math.PI / 2 }));
        group.add(cylinder(geo, mat.steelDark, 0.09, 0.22, px, sy, depth * 0.22, { rotX: Math.PI / 2, low: true }));
      });
    }
  }

  if (battered) {
    // Cut the faces back at a safe angle of repose instead of laying a
    // thin plate on the ground.
    [-1, 1].forEach((side) => {
      const slope = new THREE.Mesh(geo.box, mat.ground);
      slope.scale.set(width + 0.4, 0.18, trenchDepth * 1.5);
      slope.position.set(0, -trenchDepth / 2, side * (hd + trenchDepth * 0.45));
      slope.rotation.x = side * 0.62;
      slope.castShadow = true;
      slope.receiveShadow = true;
      group.add(slope);
    });
  }

  if (edgeProtection) {
    group.add(buildGuardrail(mat, { x: 0, y: 0, z: hd + 0.5, length: width + 1, axis: "x" }));
    group.add(buildGuardrail(mat, { x: 0, y: 0, z: -hd - 0.5, length: width + 1, axis: "x" }));
    group.add(buildGuardrail(mat, { x: -hw - 0.5, y: 0, z: 0, length: depth + 1, axis: "z" }));
    group.add(buildGuardrail(mat, { x: hw + 0.5, y: 0, z: 0, length: depth + 1, axis: "z" }));
    // Toe boards, which is what stops material being kicked onto people below.
    [[0, hd + 0.5, width + 1, 0.06], [0, -hd - 0.5, width + 1, 0.06]].forEach(([tx, tz, tw, td]) => {
      group.add(box(geo, mat.timber, tw, 0.16, td, tx, 0.1, tz));
    });
  }

  group.userData.excavation = { shored, battered, edgeProtection, trenchDepth };
  return { group, colliders };
}

export function buildMaterialPallet(geo, mat, { type = "block", rows = 3 } = {}) {
  const group = new THREE.Group();
  // Pallet.
  group.add(box(geo, mat.timberDark, 1.6, 0.14, 1.2, 0, 0.07, 0));
  if (type === "block") {
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 2; j++) {
          group.add(box(geo, mat.brick, 0.48, 0.22, 0.54, -0.52 + i * 0.52, 0.25 + r * 0.23, -0.28 + j * 0.56));
        }
      }
    }
  } else if (type === "rebar") {
    for (let i = 0; i < 14; i++) {
      group.add(cylinder(geo, mat.rebar, 0.022, 3.4, -0.5 + (i % 7) * 0.17, 0.2 + Math.floor(i / 7) * 0.06, 0, { rotX: Math.PI / 2, low: true }));
    }
    group.add(box(geo, mat.hazard, 0.12, 0.12, 0.12, 0, 0.3, 1.7, { shadow: false }));
  } else if (type === "pipe") {
    for (let i = 0; i < 9; i++) {
      const row = Math.floor(i / 5);
      group.add(cylinder(geo, mat.galv, 0.1, 2.8, -0.45 + (i % 5) * 0.22 + row * 0.11, 0.24 + row * 0.2, 0, { rotX: Math.PI / 2 }));
    }
  } else if (type === "bags") {
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < 2; i++) {
        const sack = box(geo, mat.white, 0.7, 0.2, 1.0, -0.35 + i * 0.7, 0.24 + r * 0.2, 0, { rotY: (Math.random() - 0.5) * 0.1 });
        group.add(sack);
      }
    }
  } else if (type === "steel") {
    for (let i = 0; i < 4; i++) {
      group.add(box(geo, mat.steel, 1.5, 0.18, 0.3, 0, 0.23 + i * 0.19, -0.3 + (i % 2) * 0.6));
    }
  }
  group.userData.pallet = { type };
  return group;
}

/** Loose, badly stacked material — the housekeeping hazard. */
export function buildDebris(geo, mat, { spread = 2.4, count = 14 } = {}) {
  const group = new THREE.Group();
  const mats = [mat.timber, mat.timberDark, mat.brick, mat.steel, mat.plywood];
  for (let i = 0; i < count; i++) {
    const m = mats[(Math.random() * mats.length) | 0];
    const w = 0.3 + Math.random() * 0.9;
    const piece = box(geo, m, w, 0.1 + Math.random() * 0.12, 0.2 + Math.random() * 0.4,
      (Math.random() - 0.5) * spread, 0.06 + Math.random() * 0.25, (Math.random() - 0.5) * spread,
      { rotY: Math.random() * Math.PI, rotZ: (Math.random() - 0.5) * 0.4 });
    group.add(piece);
  }
  // A few offcuts with nails and a coil of banding.
  group.add(cylinder(geo, mat.steelDark, 0.3, 0.06, 0.4, 0.04, -0.5, { rotX: Math.PI / 2, low: true }));
  return group;
}

export function buildCableRun(geo, mat, { length = 4, damaged = false, onGround = true } = {}) {
  const group = new THREE.Group();
  const segments = 8;
  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    const y = onGround ? 0.04 : 0.6 + Math.sin(t * Math.PI) * 0.3;
    const seg = cylinder(geo, damaged && i === 4 ? mat.red : mat.yellow, 0.035, length / segments + 0.04,
      -length / 2 + t * length + length / segments / 2, y, Math.sin(t * 3) * 0.2,
      { rotX: Math.PI / 2, low: true, shadow: false });
    group.add(seg);
  }
  if (damaged) {
    // Exposed copper at the damaged segment.
    [0, 1, 2].forEach((i) => {
      group.add(cylinder(geo, i === 1 ? mat.steel : mat.orange, 0.012, 0.3, 0.1 + i * 0.04, 0.09, 0.1, { rotZ: 0.6 + i * 0.3, low: true, shadow: false }));
    });
  }
  group.userData.damaged = damaged;
  return group;
}

export function buildPuddle(geo, mat, { radius = 1.1, oil = false } = {}) {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 14), oil ? mat.oil : mat.water);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.015;
  mesh.receiveShadow = false;
  return mesh;
}

export function buildPPEStation(geo, mat) {
  const group = new THREE.Group();
  group.add(box(geo, mat.steelDark, 1.8, 2.1, 0.5, 0, 1.05, 0));
  group.add(box(geo, mat.blue, 1.7, 0.4, 0.45, 0, 1.95, 0.04, { shadow: false }));
  // Shelves of helmets and vests.
  [0.5, 1.05, 1.55].forEach((y, row) => {
    group.add(box(geo, mat.galv, 1.6, 0.04, 0.42, 0, y, 0, { shadow: false }));
    for (let i = 0; i < 4; i++) {
      if (row === 0) {
        const dome = new THREE.Mesh(geo.sphere, [mat.yellow, mat.white, mat.blue, mat.orange][i]);
        dome.scale.set(0.3, 0.2, 0.3);
        dome.position.set(-0.6 + i * 0.4, y + 0.1, 0);
        group.add(dome);
      } else if (row === 1) {
        group.add(box(geo, mat.hiVis, 0.34, 0.3, 0.1, -0.6 + i * 0.4, y + 0.16, 0, { shadow: false }));
      } else {
        group.add(box(geo, mat.white, 0.3, 0.14, 0.2, -0.58 + i * 0.4, y + 0.1, 0, { shadow: false }));
      }
    }
  });
  const sign = buildSign(geo, mat, { text: "PPE must be worn", kind: "mandatory", height: 2.5, width: 0.9, post: false });
  group.add(sign);
  return group;
}

/** Material hoist up the face of a building. */
export function buildMaterialHoist(geo, mat, { height = 12, overloaded = false } = {}) {
  const group = new THREE.Group();
  const parts = [];
  const mastW = 0.8;
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) => {
    parts.push({ w: 0.08, h: height, d: 0.08, x: (sx * mastW) / 2, y: height / 2, z: (sz * mastW) / 2 });
  });
  for (let s = 0; s * 1.2 <= height; s++) {
    const y = s * 1.2;
    parts.push({ w: mastW, h: 0.05, d: 0.05, x: 0, y, z: -mastW / 2 });
    parts.push({ w: mastW, h: 0.05, d: 0.05, x: 0, y, z: mastW / 2 });
    parts.push({ w: 0.05, h: 0.05, d: mastW, x: -mastW / 2, y, z: 0 });
    parts.push({ w: 0.05, h: 0.05, d: mastW, x: mastW / 2, y, z: 0 });
  }
  group.add(mergedMesh(parts, mat.galv));

  // The cage.
  const cage = new THREE.Group();
  cage.add(box(geo, mat.steelDark, 1.8, 0.1, 1.6, 0, 0, 0));
  [[-0.9, 0], [0.9, 0], [0, -0.8], [0, 0.8]].forEach(([cx, cz]) => {
    cage.add(box(geo, mat.galv, cx === 0 ? 1.8 : 0.06, 1.3, cz === 0 ? 0.06 : 1.6, cx, 0.65, cz, { shadow: false }));
  });
  // The load inside — overloaded version is stacked above the cage rail.
  const stacks = overloaded ? 7 : 3;
  for (let i = 0; i < stacks; i++) {
    cage.add(box(geo, mat.brick, 1.3, 0.22, 1.1, 0, 0.2 + i * 0.23, 0));
  }
  if (overloaded) {
    cage.add(box(geo, mat.timber, 1.6, 0.16, 0.4, 0.3, 1.9, 0.5, { rotZ: 0.2 }));
  }
  cage.position.set(1.4, 2.4, 0);
  group.add(cage);
  group.userData.hoist = { overloaded };
  group.userData.cage = cage;
  return group;
}

/** Safety net slung off the building face. */
export function buildSafetyNet(mat, { width = 8, out = 2.6 } = {}) {
  const geometry = new THREE.PlaneGeometry(width, out, 1, 1);
  const mesh = new THREE.Mesh(geometry, mat.net);
  mesh.rotation.x = -Math.PI / 2 + 0.35;
  return mesh;
}

/** Exclusion-zone floor decal: a translucent disc or rectangle. */
export function buildZoneMarker(mat, { radius = 5, ok = false, rect = null } = {}) {
  const geometry = rect
    ? new THREE.PlaneGeometry(rect[0], rect[1])
    : new THREE.CircleGeometry(radius, 24);
  const mesh = new THREE.Mesh(geometry, ok ? mat.zoneOk : mat.zone);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.03;
  return mesh;
}

/** Simple site hut / container office. */
export function buildSiteHut(geo, mat, { width = 6, depth = 2.6, height = 2.6, color = "blue" } = {}) {
  const group = new THREE.Group();
  const bodyMat = color === "blue" ? mat.blue : color === "green" ? mat.green : mat.white;
  group.add(box(geo, bodyMat, width, height, depth, 0, height / 2 + 0.25, 0));
  group.add(box(geo, mat.steelDark, width + 0.2, 0.18, depth + 0.2, 0, height + 0.3, 0));
  group.add(box(geo, mat.steelDark, width + 0.3, 0.25, depth + 0.3, 0, 0.13, 0));
  // Ribbed sides, cheap: three thin boxes per face.
  for (let i = 0; i < 5; i++) {
    const px = -width / 2 + 0.6 + i * (width / 5);
    group.add(box(geo, mat.steelDark, 0.05, height * 0.9, depth + 0.02, px, height / 2 + 0.25, 0, { shadow: false }));
  }
  // Door + window.
  group.add(box(geo, mat.white, 0.9, 2, 0.06, -width / 2 + 1.2, 1.25, depth / 2 + 0.02));
  group.add(box(geo, mat.glass, 1.6, 0.9, 0.06, width / 2 - 1.6, 1.7, depth / 2 + 0.02));
  return group;
}

/* ------------------------- interaction glow ------------------------- */

/**
 * Creates a slightly inflated copy of a mesh's bounding box, rendered
 * in a translucent colour. This is the outline the player sees when the
 * crosshair is on an interactive object — it reads clearly on a phone
 * screen without needing a post-processing pass.
 */
export function makeHighlight(object, material) {
  const bbox = new THREE.Box3().setFromObject(object);
  const size = bbox.getSize(new THREE.Vector3());
  const centre = bbox.getCenter(new THREE.Vector3());
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size.x * 1.14 + 0.12, size.y * 1.1 + 0.12, size.z * 1.14 + 0.12),
    material
  );
  mesh.position.copy(centre);
  mesh.renderOrder = 2;
  return mesh;
}

export { THREE };
