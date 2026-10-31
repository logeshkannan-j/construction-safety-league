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
  // Trilinear mipmapping. Without this a tiling texture on a big plane
  // shimmers and aliases as the camera moves, which reads as cheap no
  // matter how good the texture itself is.
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
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

/**
 * The site ground — by far the most-looked-at surface in four of the
 * five missions, and previously a flat wash with four bezier tyre
 * tracks. Now built in layers: damp and dry patches, compacted hardcore,
 * loose stone, ruts with a highlight on one edge so they read as
 * depressions, and puddle stains.
 */
function dirtTexture(repeat, aniso) {
  return canvasTexture("dirt", 512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#9c8a6a";
    ctx.fillRect(0, 0, w, h);

    // Broad damp / dry patches, so the ground is not one flat colour.
    for (let i = 0; i < 16; i++) {
      const cx = (i * 137) % w;
      const cy = (i * 223) % h;
      const r = 50 + ((i * 29) % 90);
      const patch = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
      const dark = i % 2 === 0;
      patch.addColorStop(0, dark ? "rgba(108,96,74,0.5)" : "rgba(186,172,142,0.42)");
      patch.addColorStop(1, "rgba(156,138,106,0)");
      ctx.fillStyle = patch;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    // Compacted fines, then loose stone on top.
    //
    // Deliberately LOW CONTRAST and fairly coarse. This texture is
    // tiled 14x across a 260 m ground plane, so anything fine and
    // high-contrast turns into crawling static when the camera moves —
    // no amount of mipmapping or anisotropy rescues it, because the
    // detail is smaller than a pixel by the time it is a few metres
    // away. Bigger, closer-toned specks read as ground; small, punchy
    // ones read as a broken screen.
    ctx.globalAlpha = 0.5;
    noise(ctx, w, h, 4200, ["#96855f", "#a3906f", "#a89778", "#8e7f63", "#ab9b7d"], 5);
    ctx.globalAlpha = 0.42;
    noise(ctx, w, h, 900, ["#7d7059", "#b8a98a", "#857759"], 7);
    ctx.globalAlpha = 0.34;
    noise(ctx, w, h, 240, ["#c4b89c", "#6d6450"], 10);
    ctx.globalAlpha = 1;

    // Plant ruts. A dark trough with a lighter lip on one side reads as
    // a depression rather than a painted line.
    for (let i = 0; i < 7; i++) {
      const y = 24 + i * 70;
      ctx.globalAlpha = 0.24;
      ctx.strokeStyle = "#6a5f4b";
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(150, y + 30, 330, y - 34, 512, y + 10);
      ctx.stroke();

      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = "#c0b093";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, y - 9);
      ctx.bezierCurveTo(150, y + 21, 330, y - 43, 512, y + 1);
      ctx.stroke();
    }

    // Tread marks across the ruts.
    ctx.globalAlpha = 0.09;
    ctx.fillStyle = "#574f3f";
    for (let i = 0; i < 90; i++) {
      const x = (i * 71) % w;
      const y = 24 + ((i * 37) % 480);
      ctx.fillRect(x, y, 9, 3);
    }
    ctx.globalAlpha = 1;
  }, { repeat, aniso });
}

function concreteTexture(repeat, aniso) {
  return canvasTexture("concrete", 512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#b4b2ab";
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 2600, ["#a9a7a0", "#bebcb5", "#9d9b95", "#c5c3bc"], 4);

    // Shutter panel joints, with a shadow line on one side so the seam
    // has depth instead of being a drawn stripe.
    [0, 128].forEach((x) => {
      ctx.strokeStyle = "#8f8d87";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      ctx.strokeStyle = "#c9c7c0";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 2, 0); ctx.lineTo(x + 2, h); ctx.stroke();
    });
    [0, 128].forEach((y) => {
      ctx.strokeStyle = "#8f8d87";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      ctx.strokeStyle = "#c9c7c0";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y + 2); ctx.lineTo(w, y + 2); ctx.stroke();
    });

    // Tie-bolt holes at the panel corners — the detail that says
    // "this was cast against formwork".
    ctx.fillStyle = "#8a8882";
    [[64, 64], [192, 64], [64, 192], [192, 192]].forEach(([tx, ty]) => {
      ctx.beginPath();
      ctx.arc(tx, ty, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Pour lines and staining.
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = "#7e7c77";
    ctx.lineWidth = 5;
    for (let i = 0; i < 4; i++) {
      const y = 20 + i * 64;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(70, y + 5, 170, y - 4, 256, y + 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    noise(ctx, w, h, 160, ["#7e7c77"], 2);
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
/** The ARIA brand orange, shared by the banners and the 3D mark. */
export const ARIA_ORANGE = "#F4631A";

/* The ARIA "A", as ONE outline in a unit space with y pointing UP and
 * the letter two units tall. Both the flat version on the banners and
 * the extruded version in the world are built from these numbers, so
 * the mark on a hoarding and the mark on the building are the same
 * shape and cannot drift apart.
 *
 * The outline walks the apex, down the outside of the right leg, back
 * up its inside to the crossbar, across, and down the left leg. The
 * counter (the triangular hole in the A) is the separate path. */
const ARIA_A_OUTLINE = [
  [0.00, 1.00],
  [0.64, -1.00],
  [0.32, -1.00],
  [0.19, -0.26],
  [-0.19, -0.26],
  [-0.32, -1.00],
  [-0.64, -1.00],
];
const ARIA_A_COUNTER = [
  [0.00, 0.50],
  [0.18, -0.02],
  [-0.18, -0.02],
];

/**
 * Draws the ARIA mark — the orange "A" with its orbital ring — onto a
 * 2D canvas, centred on (cx, cy), where `s` is the A's HALF height.
 */
function drawAriaMark(ctx, cx, cy, s) {
  const grad = ctx.createLinearGradient(cx - s, cy - s, cx + s, cy + s);
  grad.addColorStop(0, "#FFAE3D");
  grad.addColorStop(0.55, ARIA_ORANGE);
  grad.addColorStop(1, "#CE3A05");

  // The ring sweeping around the letter.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.36);
  ctx.strokeStyle = grad;
  ctx.lineWidth = s * 0.15;
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 1.06, s * 0.47, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // The letter. Canvas y runs DOWN, so the outline's y is negated.
  const trace = (points) => {
    points.forEach(([x, y], i) => {
      const px = cx + x * s;
      const py = cy - y * s;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
  };
  ctx.fillStyle = grad;
  ctx.beginPath();
  trace(ARIA_A_OUTLINE);
  trace(ARIA_A_COUNTER);
  ctx.fill("evenodd");
}

/**
 * Shrinks `font(px)` until `text` fits in `maxWidth`, and leaves the
 * chosen font set on the context.
 *
 * The banner said "CASAGRAND AR" for a while because the name was set
 * at a fixed 86px and simply ran off the end of the canvas. Anything
 * driven by SITE_NAME has to fit whatever the name happens to be.
 */
function fitFont(ctx, text, maxWidth, startPx, minPx, apply) {
  let px = startPx;
  apply(px);
  // measureText is stubbed in the headless tests, so this loop has to
  // terminate on its own rather than relying on a real measurement.
  while (px > minPx && ctx.measureText(text).width > maxWidth) {
    px -= 2;
    apply(px);
  }
  return px;
}

export function brandTexture(
  { title = SITE_NAME, subtitle = SITE_SUBTITLE, dark = false } = {}
) {
  const bg = dark ? "#10161D" : "#F3F1EA";
  const fg = dark ? "#F3F1EA" : "#14202B";
  const accent = ARIA_ORANGE;
  return canvasTexture(`brand:${title}:${subtitle}:${dark}`, 1024, 256, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // A thin rule top and bottom, the way developer hoarding is set out.
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, w, 7);
    ctx.fillRect(0, h - 7, w, 7);

    // The mark sits on the left, as it does on the real hoarding, with
    // the name set beside it rather than under it.
    drawAriaMark(ctx, 118, h / 2, 62);

    // Everything right of the mark, with a margin at each end.
    const left = 196;
    const right = w - 28;
    const textCx = (left + right) / 2;
    const maxWidth = right - left;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Letter spacing scales WITH the size. Held fixed, it dominates at
    // small sizes and a long name can never be shrunk enough to fit.
    ctx.fillStyle = fg;
    fitFont(ctx, title, maxWidth, 76, 20, (px) => {
      ctx.font = `800 ${px}px Georgia, 'Times New Roman', serif`;
      ctx.letterSpacing = `${(px * 0.13).toFixed(1)}px`;
    });
    ctx.fillText(title, textCx, h / 2 - 20);

    ctx.fillStyle = accent;
    ctx.fillRect(textCx - 140, h / 2 + 30, 280, 3);

    ctx.fillStyle = dark ? "#9FB0C0" : "#5A6B7A";
    fitFont(ctx, subtitle, maxWidth, 28, 12, (px) => {
      ctx.font = `600 ${px}px system-ui, sans-serif`;
      ctx.letterSpacing = `${(px * 0.22).toFixed(1)}px`;
    });
    ctx.fillText(subtitle, textCx, h / 2 + 64);
    ctx.letterSpacing = "0px";
  });
}

/**
 * The ARIA mark as REAL GEOMETRY, not a picture on a plane.
 *
 * The brand is an orange gradient "A" with an orbital ring sweeping
 * around it. The ring is an actual torus tilted off-axis and the A is
 * extruded from ARIA_A_OUTLINE, so it catches the light and reads as a
 * sign from any angle — including from directly above, which a flat
 * decal does not.
 *
 * The A was previously three leaning boxes. At the lean they had, the
 * legs never met at the top and the crossbar ran straight across, so
 * the mark read as a capital H. It is now the real letter outline with
 * its counter punched out.
 *
 * `size` is the full height of the letter. Returns { group, ring }.
 */
export function buildAriaMark(geo, mat, { size = 3, depth = 0.22 } = {}) {
  const group = new THREE.Group();
  const s = size / 2;

  const shape = new THREE.Shape(
    ARIA_A_OUTLINE.map(([x, y]) => new THREE.Vector2(x * s, y * s))
  );
  shape.holes.push(new THREE.Path(
    ARIA_A_COUNTER.map(([x, y]) => new THREE.Vector2(x * s, y * s))
  ));

  const letter = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 }),
    mat.ariaOrange
  );
  letter.position.z = -depth / 2;
  letter.castShadow = false;
  group.add(letter);

  // The ring orbiting the letter. Tilted so it reads as a sweep around
  // the A rather than a circle drawn on top of it.
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(s * 1.02, s * 0.075, 10, 48),
    mat.ariaOrange
  );
  ring.rotation.set(1.16, 0.0, 0.42);
  ring.castShadow = false;
  group.add(ring);

  return { group, ring };
}

/** Square brand plate, for crane counterweights and site huts. */
export function brandPlateTexture() {
  return canvasTexture("brandPlate", 256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#10161D";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = ARIA_ORANGE;
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, w - 28, h - 28);

    // Square plate, so the mark goes above the name rather than beside it.
    drawAriaMark(ctx, w / 2, 96, 54);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#F3F1EA";
    ctx.font = "800 32px Georgia, serif";
    ctx.letterSpacing = "4px";
    ctx.fillText("CASAGRAND", w / 2, 182);
    ctx.fillStyle = ARIA_ORANGE;
    ctx.font = "800 44px Georgia, serif";
    ctx.letterSpacing = "7px";
    ctx.fillText("ARIA", w / 2, 222);
  });
}

/**
 * Painted plasterboard. Used for the escape building's interior, which
 * is deliberately white: a dark interior reads as atmospheric on a
 * desktop monitor and as an unplayable smear on a phone outdoors.
 */
function plasterTexture(repeat, aniso, { tint = "#F4F5F6" } = {}) {
  return canvasTexture(`plaster:${tint}`, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, w, h);
    // Faint roller texture, so a big white wall is not a dead flat fill.
    noise(ctx, w, h, 260, ["#ffffff", "#EDEEF0", "#E6E8EA"], 2);
    // Board joints every half metre or so.
    ctx.strokeStyle = "#E2E4E7";
    ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo((w / 4) * i, 0);
      ctx.lineTo((w / 4) * i, h);
      ctx.stroke();
    }
  }, { repeat, aniso });
}

/** Light power-floated screed, for the same interior. */
function screedTexture(repeat, aniso) {
  return canvasTexture("screed", 256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#DCDFE2";
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 420, ["#E6E9EC", "#D2D6DA", "#C8CDD2"], 3);
    // Trowel swirls.
    ctx.strokeStyle = "#D5D9DD";
    ctx.lineWidth = 3;
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.arc((i * 61) % w, (i * 97) % h, 26 + (i % 4) * 9, 0, Math.PI * 1.4);
      ctx.stroke();
    }
  }, { repeat, aniso });
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
    // polygonOffset pushes the ground very slightly away from the
    // camera in the depth buffer. Everything laid flat ON the ground —
    // yard slabs, zone markings, puddles — sits at or near y = 0, and
    // without this they z-fight with it and the ground flickers.
    ground: L({
      map: dirtTexture([14, 14], aniso),
      polygonOffset: true, polygonOffsetFactor: 1.2, polygonOffsetUnits: 1.2,
    }),
    concrete: L({ map: concreteTexture([2, 2], aniso) }),
    concreteSlab: L({ map: concreteTexture([6, 6], aniso) }),
    concreteDark: L({ color: 0x8e8c86 }),
    plywood: L({ map: plywoodTexture([2, 2], aniso) }),
    brick: L({ map: brickTexture([3, 2], aniso) }),
    hazard: L({ map: hazardStripeTexture([4, 1]) }),

    // Casagrand Aria branding — hoarding banners, the tower crown and
    // the crane counterweight all carry it, so the player can see whose
    // site they are standing on from anywhere in every mission.
    brand: L({ map: brandTexture() }),
    brandDark: L({ map: brandTexture({ dark: true }) }),
    brandPlate: L({ map: brandPlateTexture() }),
    // The ARIA orange. Emissive so the mark reads as lit signage at
    // dusk rather than a flat orange block.
    ariaOrange: new THREE.MeshPhongMaterial({
      color: 0xf4631a, emissive: 0xc23c05, emissiveIntensity: 0.55,
      shininess: 70, specular: 0x552000,
    }),
    // Warm uplight wash on the tower fins, as in the night render.
    facadeUplight: new THREE.MeshBasicMaterial({
      color: 0xffc777, transparent: true, opacity: 0.5, depthWrite: false,
    }),

    /* --- the Casagrand Aria development (scenery, see
       buildBrandedTower). Pulled from the project renders: a pale
       stone shell, bronze fins, bright slab edges and lit glazing. --- */
    towerShell: P({ color: 0xe8e2d6, shininess: 14, specular: 0x2a2825 }),
    towerFin: P({ color: 0xbfa98c, shininess: 40, specular: 0x4a3f30 }),
    towerBand: L({ color: 0xf6f3ec }),
    balconyGlass: new THREE.MeshPhongMaterial({
      color: 0xa8cfe0, transparent: true, opacity: 0.5, shininess: 90,
    }),
    // The glazed podium that glows at the base of each tower.
    lobbyGlow: new THREE.MeshBasicMaterial({
      color: 0xffe2a8, transparent: true, opacity: 0.72, depthWrite: false,
    }),
    poolWater: new THREE.MeshPhongMaterial({
      color: 0x3fa9d6, transparent: true, opacity: 0.8, shininess: 130, specular: 0x8fd9f2,
    }),

    /* --- the grounds: lawn, courts, roads and planting --- */
    lawn: L({ color: 0x4e7c42 }),
    foliage: L({ color: 0x386b35 }),
    asphalt: L({ color: 0x3a3d40 }),
    courtBlue: L({ color: 0x2d6ea8 }),
    courtRed: L({ color: 0xa8452f }),

    // White interior finishes — the escape building's palette.
    plaster: L({ map: plasterTexture([2, 1], aniso) }),
    plasterCeiling: L({ map: plasterTexture([3, 3], aniso, { tint: "#FAFBFC" }) }),
    screed: L({ map: screedTexture([5, 5], aniso) }),
    skirting: L({ color: 0xdfe3e7 }),
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
  // Per-scene, so disposing a scene disposes these with it.
  const taperCache = new Map();
  const seg = Math.max(5, cfg.segments || 10);
  return {
    box: new THREE.BoxGeometry(1, 1, 1),
    plane: new THREE.PlaneGeometry(1, 1),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, seg),
    cylLow: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
    cone: new THREE.ConeGeometry(0.5, 1, Math.max(6, seg - 2)),
    sphere: new THREE.SphereGeometry(0.5, seg, Math.max(5, (seg / 2) | 0)),
    capsule: new THREE.CapsuleGeometry(0.3, 0.6, 3, seg),

    /**
     * A TAPERED tube, cached per taper ratio.
     *
     * Limbs are cones, not tubes: a thigh is half again as thick at the
     * hip as it is at the knee, and a figure built from even-width
     * cylinders reads as scaffold poles no matter what else is right.
     * A uniform cylinder cannot be scaled into a tapered one, so these
     * are real geometries — but there are only a handful of distinct
     * ratios in a body, so they are shared, and they live on this
     * object so they die with the scene rather than outliving it.
     *
     * Bottom radius is 1 and height is 1, so the caller scales by
     * (rBottom, length, rBottom).
     */
    taper(topRatio) {
      const key = Math.round(topRatio * 24);
      if (!taperCache.has(key)) {
        taperCache.set(key, new THREE.CylinderGeometry(key / 24, 1, 1, seg, 1, true));
      }
      return taperCache.get(key);
    },
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

/**
 * The site ground, with REAL holes cut in it.
 *
 * This used to be one solid plane at y = 0 across the whole site, which
 * meant every excavation was invisible: its walls and floor were built
 * below grade, and the ground sheet covered them like a lid. You saw
 * flat earth and then fell into a pit that was never drawn.
 *
 * `holes` are world-space rectangles ({ x, z, w, d }) punched out of the
 * sheet, so an excavation is genuinely open to the sky.
 */
export function buildGround(mat, size = 240, { holes = [] } = {}) {
  const group = new THREE.Group();
  const half = size / 2;

  let geometry;
  if (!holes.length) {
    geometry = new THREE.PlaneGeometry(size, size);
  } else {
    const shape = new THREE.Shape();
    shape.moveTo(-half, -half);
    shape.lineTo(half, -half);
    shape.lineTo(half, half);
    shape.lineTo(-half, half);
    shape.closePath();

    // The sheet is rotated -90° about X, which maps shape-Y to world -Z.
    // So a hole at world z sits at shape y = -z.
    holes.forEach(({ x = 0, z = 0, w = 1, d = 1 }) => {
      const hw = w / 2;
      const hd = d / 2;
      const path = new THREE.Path();
      path.moveTo(x - hw, -z - hd);
      path.lineTo(x + hw, -z - hd);
      path.lineTo(x + hw, -z + hd);
      path.lineTo(x - hw, -z + hd);
      path.closePath();
      shape.holes.push(path);
    });

    geometry = new THREE.ShapeGeometry(shape);
    // ShapeGeometry writes UVs in shape units, which would tile the dirt
    // texture once per metre. Rewrite them to PlaneGeometry's 0..1 so the
    // material's own repeat still applies.
    const pos = geometry.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = pos.getX(i) / size + 0.5;
      uv[i * 2 + 1] = pos.getY(i) / size + 0.5;
    }
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  }

  const plane = new THREE.Mesh(geometry, mat.ground);
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
 * ONE tower of the Casagrand Aria development, built from the project
 * renders: a lit podium, a shaft of vertical fins with a warm uplight
 * wash climbing them, glazing recessed behind the fin line, bright slab
 * edges, balconies and a crown.
 *
 * `floors` defaults to 19 — the real building.
 *
 * Everything that can be merged is merged: a tower is ~15 draw calls,
 * because three of these plus the grounds have to sit in the background
 * of every mission without costing frame rate on a phone.
 */
function buildAriaTower(geo, mat, {
  floors = 19, floorHeight = 3.1, width = 20, depth = 16,
  pool = false,
} = {}) {
  const group = new THREE.Group();
  const shaftH = floors * floorHeight;
  const hw = width / 2;
  const hd = depth / 2;
  const podiumH = 5.2;
  const base = 1 + podiumH;
  const roofY = base + shaftH;

  /* ---- podium: the lit glass base the towers stand on ---- */
  group.add(box(geo, mat.concrete, width + 6, 1.0, depth + 6, 0, 0.5, 0));
  group.add(box(geo, mat.concreteDark, width + 3.4, podiumH, depth + 3.4, 0, 1 + podiumH / 2, 0));

  // The continuous glazed strip that makes the base glow at dusk.
  const glowStrips = [
    { w: width + 3.2, h: 2.4, d: 0.2, x: 0, y: 2.6, z: hd + 1.75 },
    { w: width + 3.2, h: 2.4, d: 0.2, x: 0, y: 2.6, z: -hd - 1.75 },
    { w: 0.2, h: 2.4, d: depth + 3.2, x: hw + 1.75, y: 2.6, z: 0 },
    { w: 0.2, h: 2.4, d: depth + 3.2, x: -hw - 1.75, y: 2.6, z: 0 },
  ];
  const glow = mergedMesh(glowStrips, mat.lobbyGlow, { shadow: false });
  glow.renderOrder = 1;
  group.add(glow);

  /* ---- the shaft ---- */
  group.add(box(geo, mat.towerShell, width, shaftH, depth, 0, base + shaftH / 2, 0));

  // Glazing, set INSIDE the fin line so the fins stand proud of it.
  const glass = (w, px, pz, ry) => {
    const face = new THREE.Mesh(geo.plane, mat.curtainWall);
    face.scale.set(w, shaftH - 1.2, 1);
    face.position.set(px, base + shaftH / 2, pz);
    face.rotation.y = ry;
    group.add(face);
  };
  glass(width - 2.2, 0, hd + 0.05, 0);
  glass(width - 2.2, 0, -hd - 0.05, Math.PI);
  glass(depth - 2.2, hw + 0.05, 0, Math.PI / 2);
  glass(depth - 2.2, -hw - 0.05, 0, -Math.PI / 2);

  /* ---- vertical fins: the defining feature of this facade ---- */
  const fins = [];
  const finD = 0.75;
  const finW = 0.85;
  const perFace = 5;
  for (let i = 0; i <= perFace; i++) {
    const fx = -hw + (i / perFace) * width;
    fins.push({ w: finW, h: shaftH, d: finD, x: fx, y: base + shaftH / 2, z: hd + finD / 2 });
    fins.push({ w: finW, h: shaftH, d: finD, x: fx, y: base + shaftH / 2, z: -hd - finD / 2 });
  }
  for (let i = 0; i <= perFace - 1; i++) {
    const fz = -hd + (i / (perFace - 1)) * depth;
    fins.push({ w: finD, h: shaftH, d: finW, x: hw + finD / 2, y: base + shaftH / 2, z: fz });
    fins.push({ w: finD, h: shaftH, d: finW, x: -hw - finD / 2, y: base + shaftH / 2, z: fz });
  }
  group.add(mergedMesh(fins, mat.towerFin, { shadow: false }));

  // The warm uplight washing up every other fin, as in the night render.
  const wash = mergedMesh(
    fins.filter((_, i) => i % 2 === 0).map((f) => ({
      w: f.w * 1.3, h: shaftH * 0.72, d: f.d * 1.3,
      x: f.x, y: base + shaftH * 0.36, z: f.z,
    })),
    mat.facadeUplight,
    { shadow: false },
  );
  wash.renderOrder = 2;
  group.add(wash);

  /* ---- slab edges and balconies ---- */
  const bands = [];
  const balconies = [];
  for (let f = 0; f < floors; f++) {
    const y = base + f * floorHeight;
    bands.push({ w: width + 1.8, h: 0.3, d: depth + 1.8, x: 0, y, z: 0 });
    if (f % 2 === 1) {
      balconies.push({ w: width * 0.3, h: 0.2, d: 1.5, x: -width * 0.27, y: y + 0.28, z: hd + 1.1 });
      balconies.push({ w: width * 0.3, h: 0.2, d: 1.5, x: width * 0.27, y: y + 0.28, z: -hd - 1.1 });
    }
  }
  group.add(mergedMesh(bands, mat.towerBand, { shadow: false }));
  if (balconies.length) group.add(mergedMesh(balconies, mat.balconyGlass, { shadow: false }));

  /* ---- roof: parapet, lift overrun, warning lights ---- */
  group.add(box(geo, mat.concreteDark, width + 2.2, 0.8, depth + 2.2, 0, roofY + 0.4, 0));
  group.add(box(geo, mat.steelDark, 3.4, 2.8, 3.4, -hw + 3.2, roofY + 2.2, -hd + 3.2));
  group.add(mergedMesh(
    [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]].map(([cx, cz]) => ({
      w: 0.4, h: 0.4, d: 0.4, x: cx, y: roofY + 1.1, z: cz,
    })),
    mat.red,
    { shadow: false },
  ));

  if (pool) {
    // The rooftop pool and deck from the aerial render — the thing that
    // makes the overhead view of this development recognisable.
    group.add(box(geo, mat.timber, 11, 0.12, 7.5, 2, roofY + 0.86, 1.5));
    const water = new THREE.Mesh(geo.plane, mat.poolWater);
    water.scale.set(7.4, 4.4, 1);
    water.rotation.x = -Math.PI / 2;
    water.position.set(2, roofY + 0.95, 1.5);
    group.add(water);
  }

  group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return { group, height: roofY + 3 };
}

/**
 * The Casagrand Aria development: three 19-floor towers in the stepped
 * L the site plan uses, on landscaped grounds with the sports courts,
 * the internal road and the tree line from the aerial render — and the
 * ARIA mark standing lit at the entrance, as real geometry rather than
 * a texture.
 *
 * This is SCENERY. It sits beyond the hoarding, carries no colliders,
 * casts no shadows, and reads from any angle the player can get to,
 * including the overhead view.
 *
 * `x`/`z` place the ENTRANCE, not the centre: the grounds are pushed
 * back behind that anchor so a caller can park the development just
 * past its hoarding line without doing the arithmetic.
 */
export function buildBrandedTower(geo, mat, {
  x = 0, z = -95, floors = 19, rotY = 0,
} = {}) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotY;

  // Everything hangs off this, offset so local z = 0 is the entrance.
  const site = new THREE.Group();
  site.position.z = -40;
  group.add(site);

  // Landscaped ground the whole development sits on.
  site.add(box(geo, mat.lawn, 150, 0.4, 92, 0, 0.2, 0));

  /* ---- three towers, stepped as the renders show ---- */
  const towers = [
    { at: [-38, 6], rot: 0, floors, width: 20, depth: 16, pool: true },
    { at: [2, -18], rot: -0.42, floors: floors - 2, width: 17, depth: 15 },
    { at: [44, 10], rot: 0.30, floors, width: 26, depth: 15 },
  ];
  towers.forEach((t) => {
    const tower = buildAriaTower(geo, mat, {
      floors: t.floors, width: t.width, depth: t.depth, pool: t.pool,
    });
    tower.group.position.set(t.at[0], 0, t.at[1]);
    tower.group.rotation.y = t.rot;
    site.add(tower.group);
  });

  /* ---- sports courts, straight off the aerial ---- */
  const courts = [
    { at: [46, 34], w: 17, d: 11, m: mat.courtBlue },
    { at: [64, 34], w: 15, d: 11, m: mat.courtRed },
  ];
  const courtLines = [];
  courts.forEach((c) => {
    const pad = new THREE.Mesh(geo.plane, c.m);
    pad.scale.set(c.w, c.d, 1);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(c.at[0], 0.45, c.at[1]);
    site.add(pad);
    courtLines.push({ w: c.w, h: 0.04, d: 0.16, x: c.at[0], y: 0.47, z: c.at[1] });
    courtLines.push({ w: 0.16, h: 0.04, d: c.d, x: c.at[0], y: 0.47, z: c.at[1] });
  });
  site.add(mergedMesh(courtLines, mat.white, { shadow: false }));

  /* ---- internal road and the paths between the towers ---- */
  site.add(mergedMesh([
    { w: 150, h: 0.08, d: 5, x: 0, y: 0.44, z: 26 },
    { w: 5, h: 0.08, d: 68, x: -62, y: 0.44, z: 0 },
  ], mat.asphalt, { shadow: false }));
  site.add(mergedMesh([
    { w: 60, h: 0.06, d: 2.4, x: -4, y: 0.44, z: 20 },
    { w: 2.4, h: 0.06, d: 34, x: 22, y: 0.44, z: 2 },
  ], mat.concreteDark, { shadow: false }));

  /* ---- tree line, with a gap left open at the entrance ---- */
  const trunks = [];
  const canopy = [];
  for (let i = 0; i < 46; i++) {
    const ang = (i / 46) * Math.PI * 2;
    const r = 58 + ((i * 13) % 11);
    const tx = Math.cos(ang) * r;
    const tz = Math.sin(ang) * r * 0.55;
    // Keep the view of the entrance and the mark clear.
    if (tz > 20 && Math.abs(tx) < 26) continue;
    const h = 4.5 + ((i * 7) % 4);
    trunks.push({ w: 0.5, h, d: 0.5, x: tx, y: 0.4 + h / 2, z: tz });
    canopy.push({ w: 4.6, h: 3.4, d: 4.6, x: tx, y: 0.4 + h + 1.3, z: tz });
  }
  site.add(mergedMesh(trunks, mat.timberDark, { shadow: false }));
  site.add(mergedMesh(canopy, mat.foliage, { shadow: false }));

  /* ---- the entrance: name wall with the ARIA mark above it ---- */
  const wall = box(geo, mat.brandDark, 26, 6.5, 0.6, 0, 3.6, 36, { shadow: false });
  site.add(wall);

  const mark = buildAriaMark(geo, mat, { size: 7 });
  mark.group.position.set(0, 12.5, 36);
  site.add(mark.group);

  group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return { group, height: 1 + 5.2 + floors * 3.1 + 3, floors, ariaRing: mark.ring };
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
 * Collapses the loose meshes hanging directly off a joint into one
 * mesh per material, leaving child GROUPS alone.
 *
 * A figure built from anatomical parts is 54 draw calls, and sixteen of
 * them in a crowd is most of a phone's budget. But within one joint
 * nothing moves relative to anything else — the skull, jaw, ears, nose
 * and eyes all turn with the head — so they can be baked together and
 * still animate, because it is the JOINT that rotates, not the parts.
 *
 * Child groups are left untouched: the knee has to keep moving inside
 * the leg.
 */
function compactJoint(group) {
  const byMaterial = new Map();
  const keep = [];

  for (const child of group.children) {
    if (!child.isMesh) { keep.push(child); continue; }
    child.updateMatrix();
    const baked = child.geometry.clone().applyMatrix4(child.matrix);
    if (!byMaterial.has(child.material)) byMaterial.set(child.material, []);
    byMaterial.get(child.material).push(baked);
  }
  if (!byMaterial.size) return;

  group.clear();
  keep.forEach((c) => group.add(c));

  byMaterial.forEach((geoms, material) => {
    let merged;
    if (geoms.length === 1) {
      merged = geoms[0];
    } else {
      merged = mergeGeometries(geoms, false);
      geoms.forEach((g) => g.dispose());
      // mergeGeometries returns null if the attribute sets differ.
      if (!merged) return;
    }
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });
}

/**
 * A person.
 *
 * Built the way a base mesh is: a skeleton of nested joint groups, with
 * every part a TAPERED section rather than an even tube, and a sphere
 * at each joint so nothing has a seam or a gap. That taper is most of
 * the difference between a person and a set of scaffold poles — a
 * thigh is half again as thick at the hip as it is at the knee, a
 * forearm narrows to the wrist, and a torso is a shape, not a box.
 *
 * Proportions are a real 1.78 m adult, in metres from the sole:
 *
 *      crown 1.78   head centre 1.66   chin 1.58   shoulder 1.44
 *      elbow 1.15   wrist 0.89   hip 0.94   knee 0.50   ankle 0.09
 *
 * Returns the group, with the rig on `userData.rig` for animation and
 * the PPE state on `userData.worker` for the games that inspect it.
 */
export function buildWorker(geo, mat, {
  helmet = true, vest = true, harness = false, boots = true,
  helmetColor = null, pose = "stand", skin = "skin", scale = 1,
  // "officer" has to be recognisable across a site at a glance, so it
  // is three signals at once, not one: a WHITE hat, an ORANGE vest
  // where the crew wear hi-vis yellow, and a clipboard. One of those
  // alone is not enough at distance or on a small screen.
  role = "worker",
  vestColor = null,
  // "low" drops the detail you cannot see past about 15 m and takes a
  // figure from ~34 draw calls to ~22 while keeping the whole
  // skeleton, so a crowd still walks properly. Use it for background
  // crowds, not for anyone the player stands next to.
  detail = "high",
} = {}) {
  const group = new THREE.Group();
  const officer = role === "officer";
  const fine = detail !== "low";
  const palette = { yellow: mat.yellow, white: mat.white, blue: mat.blue, orange: mat.orange, green: mat.green, hiVis: mat.hiVis };
  const helmetMat = palette[helmetColor] || (officer ? mat.white : mat.yellow);
  const vestMat = palette[vestColor] || (officer ? mat.orange : mat.hiVis);
  const skinMat = skin === "dark" ? mat.skinDark : mat.skin;

  /**
   * A tapered section hanging DOWN from its parent origin, which is
   * the joint it pivots about. `rTop` is at the joint.
   */
  const limb = (material, rTop, rBottom, length, { flat = 1 } = {}) => {
    const m = new THREE.Mesh(geo.taper(rTop / rBottom), material);
    m.scale.set(rBottom, length, rBottom * flat);
    m.position.y = -length / 2;
    m.castShadow = true;
    return m;
  };

  /** A tapered section standing UP from `yBottom`. */
  const section = (material, rBottom, rTop, length, yBottom, { flat = 1 } = {}) => {
    const m = new THREE.Mesh(geo.taper(rTop / rBottom), material);
    m.scale.set(rBottom, length, rBottom * flat);
    m.position.y = yBottom + length / 2;
    m.castShadow = true;
    return m;
  };

  /** A joint, so two tapered sections never show a step between them. */
  const joint = (material, radius, y, { x = 0, z = 0, flat = 1 } = {}) => {
    const m = new THREE.Mesh(geo.sphere, material);
    m.scale.set(radius * 2, radius * 2, radius * 2 * flat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  };

  const HIP_Y = 0.94;
  const hips = new THREE.Group();
  hips.position.y = HIP_Y;
  group.add(hips);

  /* ------------------------------ legs ------------------------------ */
  const legs = [];
  [-0.095, 0.095].forEach((sx) => {
    const leg = new THREE.Group();
    leg.position.set(sx, 0, 0);
    leg.add(joint(mat.denim, 0.098, 0));                 // hip
    leg.add(limb(mat.denim, 0.098, 0.066, 0.44));        // thigh

    const knee = new THREE.Group();
    knee.position.y = -0.44;
    knee.add(joint(mat.denim, 0.068, 0));                // knee
    knee.add(limb(mat.denim, 0.066, 0.044, 0.41));       // calf to ankle

    if (boots) {
      // Ankle, foot and a toe box, so a foot has a direction.
      knee.add(joint(mat.black, 0.052, -0.40));
      knee.add(box(geo, mat.black, 0.115, 0.075, 0.16, 0, -0.44, 0.015));
      knee.add(box(geo, mat.black, 0.105, 0.055, 0.1, 0, -0.465, 0.1));
      if (fine) knee.add(box(geo, mat.black, 0.1, 0.05, 0.06, 0, -0.41, -0.07));
    }
    leg.add(knee);
    leg.userData.knee = knee;
    hips.add(leg);
    legs.push(leg);
  });

  /* ----------------------------- torso ------------------------------
   * Three lofted sections, flattened front-to-back, so the body goes
   * hips -> waist -> chest instead of being one slab. */
  const spine = new THREE.Group();
  hips.add(spine);

  const bodyMat = mat.denim;
  spine.add(section(bodyMat, 0.155, 0.132, 0.20, -0.02, { flat: 0.78 }));  // pelvis
  spine.add(section(bodyMat, 0.132, 0.150, 0.18, 0.18, { flat: 0.76 }));   // waist
  spine.add(section(bodyMat, 0.150, 0.188, 0.19, 0.36, { flat: 0.74 }));   // chest
  // Shoulder yoke across the top, so the arms come off something.
  spine.add(joint(bodyMat, 0.1, 0.52, { x: -0.13, flat: 0.8 }));
  spine.add(joint(bodyMat, 0.1, 0.52, { x: 0.13, flat: 0.8 }));

  if (vest) {
    // Over the chest and waist, a touch proud of the body.
    spine.add(section(vestMat, 0.148, 0.2, 0.20, 0.355, { flat: 0.76 }));
    spine.add(section(vestMat, 0.142, 0.15, 0.17, 0.19, { flat: 0.78 }));
    // Reflective bands round the body.
    [0.46, 0.27].forEach((by) => {
      const band = new THREE.Mesh(geo.taper(1), mat.white);
      const r = by > 0.4 ? 0.196 : 0.152;
      band.scale.set(r, 0.04, r * 0.77);
      band.position.y = by;
      band.castShadow = false;
      spine.add(band);
    });
    if (fine) {
      // The two braces over the shoulders. They lie ON the front of
      // the vest — 18 mm of tape, not a slab. They were 0.3 m DEEP,
      // which is deeper than the whole chest, so they stood proud of
      // the vest front and back and read as a box strapped to the
      // ribs.
      [-0.075, 0.075].forEach((bx) => {
        spine.add(box(geo, mat.white, 0.042, 0.2, 0.018, bx, 0.45, 0.136, { shadow: false }));
        spine.add(box(geo, mat.white, 0.042, 0.2, 0.018, bx, 0.45, -0.132, { shadow: false }));
      });
    }
  }

  if (harness) {
    [-0.09, 0.09].forEach((sx) => {
      spine.add(box(geo, mat.black, 0.045, 0.4, 0.045, sx, 0.4, 0.1, { shadow: false }));
    });
    spine.add(box(geo, mat.black, 0.26, 0.045, 0.045, 0, 0.24, 0.1, { shadow: false }));
    spine.add(box(geo, mat.steel, 0.07, 0.07, 0.04, 0, 0.47, -0.12, { shadow: false }));
    spine.add(box(geo, mat.orange, 0.045, 0.6, 0.045, 0, 0.26, -0.26, { rotX: 0.34, shadow: false }));
  }

  /* ------------------------------ arms ------------------------------ */
  const arms = [];
  [-0.185, 0.185].forEach((sx) => {
    const arm = new THREE.Group();
    arm.position.set(sx, 0.50, 0);                       // shoulder
    const sleeveMat = vest ? vestMat : bodyMat;
    arm.add(joint(sleeveMat, 0.062, 0));                 // deltoid
    arm.add(limb(sleeveMat, 0.058, 0.044, 0.29));        // upper arm

    const elbow = new THREE.Group();
    elbow.position.y = -0.29;
    elbow.add(joint(skinMat, 0.046, 0));                 // elbow
    elbow.add(limb(skinMat, 0.044, 0.031, 0.26));        // forearm

    // Glove: palm, then a thumb off the side.
    const hand = new THREE.Group();
    hand.position.y = -0.26;
    hand.add(joint(mat.black, 0.036, -0.02, { flat: 0.7 }));
    hand.add(box(geo, mat.black, 0.062, 0.095, 0.042, 0, -0.07, 0));
    if (fine) hand.add(box(geo, mat.black, 0.03, 0.05, 0.038, 0.036, -0.035, 0.008, { rotZ: 0.5 }));
    elbow.add(hand);
    arm.userData.hand = hand;

    arm.add(elbow);
    arm.userData.elbow = elbow;
    spine.add(arm);
    arms.push(arm);
  });

  /* -------------------------- neck and head -------------------------- */
  const neck = new THREE.Group();
  neck.position.y = 0.55;
  spine.add(neck);
  neck.add(section(skinMat, 0.054, 0.05, 0.1, -0.01));

  const head = new THREE.Group();
  head.position.y = 0.17;          // head centre, world 1.66
  neck.add(head);

  // Cranium: taller than it is wide, deeper than it is wide.
  const skull = new THREE.Mesh(geo.sphere, skinMat);
  skull.scale.set(0.168, 0.225, 0.202);
  skull.castShadow = true;
  head.add(skull);
  if (fine) {
    // Jaw and chin, so the profile is not a ball.
    head.add(joint(skinMat, 0.062, -0.075, { z: 0.012, flat: 1.15 }));
    head.add(box(geo, skinMat, 0.075, 0.05, 0.055, 0, -0.095, 0.052, { shadow: false }));
    // Ears.
    [-0.082, 0.082].forEach((ex) => {
      head.add(box(geo, skinMat, 0.016, 0.042, 0.03, ex, -0.005, 0.004, { shadow: false }));
    });

    /* ---- the face ----
     *
     * Everything here sits PROUD of the skull. The first version put
     * the eyes at z = 0.093 inside a skull that reaches 0.101, so they
     * were buried in the head and the face was blank. A feature on a
     * head this size has to break the surface to exist at all.
     *
     * The skull front is at z = 0.101, so the face plate at 0.098
     * gives a flat cheek for the features to sit on and everything
     * else is measured out from there. */
    head.add(box(geo, skinMat, 0.125, 0.14, 0.02, 0, 0.01, 0.098, { shadow: false }));

    // Brow ridge: the single biggest thing that stops a head reading
    // as an egg, because it puts the eyes in shadow.
    head.add(box(geo, skinMat, 0.132, 0.022, 0.028, 0, 0.052, 0.105, { shadow: false }));

    // Eyes: a white, then a dark iris standing in front of it.
    [-0.038, 0.038].forEach((ex) => {
      head.add(box(geo, mat.white, 0.034, 0.019, 0.016, ex, 0.028, 0.108, { shadow: false }));
      head.add(box(geo, mat.black, 0.016, 0.016, 0.012, ex, 0.027, 0.114, { shadow: false }));
      // Brows, above and a touch wider than the eye.
      head.add(box(geo, mat.timberDark, 0.038, 0.011, 0.014, ex, 0.041, 0.112, { shadow: false }));
    });

    // Nose: a bridge and a tip, clearly out from the face.
    head.add(box(geo, skinMat, 0.026, 0.05, 0.028, 0, 0.012, 0.114, { shadow: false }));
    head.add(box(geo, skinMat, 0.032, 0.022, 0.034, 0, -0.016, 0.119, { shadow: false }));

    // Mouth.
    head.add(box(geo, mat.skinDark, 0.05, 0.014, 0.014, 0, -0.056, 0.111, { shadow: false }));
  }

  if (helmet) {
    // A hard hat sits ON the head: the shell is a little wider than the
    // skull and the brim a little wider again. Getting this wrong by a
    // factor of two is the difference between a hard hat and a sombrero.
    /* A hard hat sits ON TOP of the head: the shell starts ABOVE the
     * brow and the brim rings it there. Both earlier attempts put it
     * too low — first a brim 2.4x the width of the skull, then a shell
     * big enough to swallow the eyes and a brim slicing across the
     * face between the eyes and the nose.
     *
     * Brow is at local y = 0.047, so nothing of the hat comes below
     * 0.05, and the eyes at 0.027 are clear of all of it. */
    const HAT_BOTTOM = 0.05;
    const HAT_TOP = 0.185;
    const shell = new THREE.Mesh(geo.sphere, helmetMat);
    shell.scale.set(0.206, HAT_TOP - HAT_BOTTOM, 0.232);
    shell.position.y = (HAT_TOP + HAT_BOTTOM) / 2;
    shell.castShadow = true;
    head.add(shell);

    const brim = cylinder(geo, helmetMat, 0.122, 0.015, 0, HAT_BOTTOM + 0.004, 0.002, { shadow: false });
    head.add(brim);
    if (fine) {
      // A peak at the front, and the ridge over the crown.
      head.add(box(geo, helmetMat, 0.14, 0.016, 0.052, 0, HAT_BOTTOM + 0.002, 0.116, { shadow: false }));
      head.add(box(geo, helmetMat, 0.028, 0.028, 0.168, 0, HAT_TOP - 0.012, 0.004, { shadow: false }));
    }
  }

  if (officer) {
    // A clipboard in the left hand. It is what makes somebody read as
    // the person inspecting rather than the person working, before you
    // are close enough to see the vest colour.
    const board = new THREE.Group();
    board.position.set(0, -0.08, 0.05);
    board.rotation.set(-1.2, 0, 0.2);
    board.add(box(geo, mat.timber, 0.18, 0.012, 0.24, 0, 0, 0));
    board.add(box(geo, mat.white, 0.15, 0.008, 0.2, 0, 0.012, -0.012, { shadow: false }));
    board.add(box(geo, mat.steel, 0.08, 0.014, 0.028, 0, 0.022, 0.095, { shadow: false }));
    arms[0].userData.hand.add(board);
    arms[0].userData.board = board;
  }

  group.userData.rig = {
    hips, spine, neck, head,
    legL: legs[0], legR: legs[1], armL: arms[0], armR: arms[1],
  };
  group.userData.role = role;
  // What this figure is doing, so an animator can keep re-applying it,
  // and its own offset into the idle cycle — without this a yard full
  // of people breathes in unison, which is worse than not breathing.
  group.userData.pose = pose;
  group.userData.idleOffset = Math.random() * 12;
  group.userData.worker = { helmet, vest, harness, boots };

  // Bake each joint down to one mesh per material. Done last, so
  // everything is in place; the rig still works because it is the
  // joints that rotate, not the parts inside them.
  [hips, spine, neck, head, ...legs, ...arms].forEach(compactJoint);
  legs.forEach((leg) => compactJoint(leg.userData.knee));
  arms.forEach((arm) => {
    compactJoint(arm.userData.elbow);
    compactJoint(arm.userData.hand);
  });

  // A standing person is not at attention: break the symmetry so a
  // crowd of these does not look like a shop display.
  poseWorker(group, { pose, phase: 0, moving: false });

  if (scale !== 1) group.scale.setScalar(scale);
  return group;
}

/**
 * Poses or animates a worker built by buildWorker().
 *
 * @param phase   walk cycle phase in radians — pass elapsed * speed
 * @param moving  true to swing the limbs, false to stand
 * @param pose    "stand" | "work" | "reach" | "crouch" | "kneel"
 */
export function poseWorker(worker, {
  phase = 0, moving = false, pose = "stand", running = false, carrying = false,
  // Elapsed seconds, for the idle layer. A figure standing perfectly
  // still is the thing that makes a scene look dead, so standing is
  // never actually still: it breathes, shifts its weight, and looks
  // around. Pass the stage clock; each figure offsets it by its own
  // amount so a crowd is not synchronised.
  t = null,
} = {}) {
  const rig = worker?.userData?.rig;
  if (!rig) return;
  const { hips, spine, legL, legR, armL, armR, head } = rig;

  if (moving) {
    // Opposite arm to leg, knees that only bend backwards, and a small
    // bob and sway. Those four things are what make a walk read as a
    // walk rather than a figure sliding along the ground.
    //
    // A run is not a fast walk: the stride opens up, the knees come up
    // much higher, the body leans into it and the arms bend to about a
    // right angle and pump rather than swing.
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    const stride = running ? 0.95 : 0.62;
    const lift = running ? 1.5 : 0.95;
    const lean = running ? 0.26 : 0.05;

    legL.rotation.x = s * stride;
    legR.rotation.x = -s * stride;
    legL.userData.knee.rotation.x = -Math.max(0, -s) * lift - 0.05;
    legR.userData.knee.rotation.x = -Math.max(0, s) * lift - 0.05;
    hips.position.y = 0.94 - Math.abs(c) * (running ? 0.05 : 0.025);
    hips.rotation.z = s * (running ? 0.05 : 0.03);
    spine.rotation.set(lean, -s * (running ? 0.12 : 0.07), 0);
    head.rotation.set(-lean * 0.7, 0, 0);

    if (carrying) {
      // Both hands on the load in front; only the legs do the walking.
      armL.rotation.set(-1.35, 0, 0.3);
      armR.rotation.set(-1.35, 0, -0.3);
      armL.userData.elbow.rotation.x = -0.75;
      armR.userData.elbow.rotation.x = -0.75;
      spine.rotation.x = lean - 0.12;        // leaning back against the weight
      return;
    }

    const swing = running ? 0.85 : 0.52;
    armL.rotation.set(-s * swing, 0, 0.1);
    armR.rotation.set(s * swing, 0, -0.1);
    const bend = running ? 1.35 : 0.3;
    armL.userData.elbow.rotation.x = -bend - Math.max(0, s) * 0.3;
    armR.userData.elbow.rotation.x = -bend - Math.max(0, -s) * 0.3;
    return;
  }

  hips.position.y = 0.94;
  hips.rotation.z = 0;
  spine.rotation.set(0, 0, 0);
  legL.rotation.x = 0.02;
  legR.rotation.x = -0.02;
  legL.userData.knee.rotation.x = -0.04;
  legR.userData.knee.rotation.x = -0.04;
  head.rotation.set(0, 0, 0);

  if (pose === "work") {
    // Hands up in front, head down at what they are doing.
    armL.rotation.set(-1.15, 0, 0.22);
    armR.rotation.set(-1.05, 0, -0.26);
    armL.userData.elbow.rotation.x = -1.2;
    armR.userData.elbow.rotation.x = -1.35;
    spine.rotation.x = 0.16;
    head.rotation.x = 0.3;
  } else if (pose === "reach") {
    armL.rotation.set(-2.5, 0, 0.3);
    armR.rotation.set(-2.6, 0, -0.3);
    armL.userData.elbow.rotation.x = -0.2;
    armR.userData.elbow.rotation.x = -0.2;
    spine.rotation.x = -0.08;
    head.rotation.x = -0.25;
  } else if (pose === "carry") {
    // Standing holding something at chest height.
    armL.rotation.set(-1.35, 0, 0.3);
    armR.rotation.set(-1.35, 0, -0.3);
    armL.userData.elbow.rotation.x = -0.75;
    armR.userData.elbow.rotation.x = -0.75;
    spine.rotation.x = -0.1;
  } else if (pose === "lift") {
    // Mid-lift, done properly: back straight, knees bent, load close.
    hips.position.y = 0.70;
    legL.rotation.x = 0.85;
    legR.rotation.x = 0.85;
    legL.userData.knee.rotation.x = -1.4;
    legR.userData.knee.rotation.x = -1.4;
    armL.rotation.set(-0.45, 0, 0.26);
    armR.rotation.set(-0.45, 0, -0.26);
    armL.userData.elbow.rotation.x = -0.55;
    armR.userData.elbow.rotation.x = -0.55;
    spine.rotation.x = 0.18;
    head.rotation.x = -0.12;
  } else if (pose === "climb") {
    // On a ladder: opposite hand and foot, three points of contact.
    const s = Math.sin(phase);
    hips.position.y = 0.94;
    legL.rotation.x = -0.25 + s * 0.5;
    legR.rotation.x = -0.25 - s * 0.5;
    legL.userData.knee.rotation.x = -0.5 - Math.max(0, s) * 0.7;
    legR.userData.knee.rotation.x = -0.5 - Math.max(0, -s) * 0.7;
    armL.rotation.set(-2.5 - s * 0.35, 0, 0.16);
    armR.rotation.set(-2.5 + s * 0.35, 0, -0.16);
    armL.userData.elbow.rotation.x = -0.3;
    armR.userData.elbow.rotation.x = -0.3;
    spine.rotation.x = 0.1;
    head.rotation.x = -0.3;
  } else if (pose === "crouch" || pose === "kneel") {
    hips.position.y = pose === "kneel" ? 0.56 : 0.62;
    legL.rotation.x = pose === "kneel" ? 1.5 : 1.15;
    legR.rotation.x = pose === "kneel" ? 0.2 : 1.15;
    legL.userData.knee.rotation.x = pose === "kneel" ? -1.7 : -1.6;
    legR.userData.knee.rotation.x = pose === "kneel" ? -1.5 : -1.6;
    armL.rotation.set(-0.8, 0, 0.2);
    armR.rotation.set(-0.8, 0, -0.2);
    armL.userData.elbow.rotation.x = -0.9;
    armR.userData.elbow.rotation.x = -0.9;
    spine.rotation.x = 0.22;
  } else {
    // Standing. Arms hang slightly out from the body with a little
    // bend, because a straight arm pinned to the side looks like a
    // mannequin.
    armL.rotation.set(0.06, 0, 0.13);
    armR.rotation.set(-0.04, 0, -0.11);
    armL.userData.elbow.rotation.x = -0.18;
    armR.userData.elbow.rotation.x = -0.14;
    spine.rotation.x = 0;
  }

  /* ---- the idle layer, on top of whatever pose was just set ----
   *
   * Four slow cycles at different periods, so they never line up and
   * the loop is not visible: a breath, a weight shift, a sway, and a
   * head that looks around. Small — single degrees — because the point
   * is that a person is never quite still, not that they are fidgeting.
   */
  if (t !== null && Number.isFinite(t)) {
    const breath = Math.sin(t * 1.25);
    const shift = Math.sin(t * 0.37);
    const sway = Math.sin(t * 0.61);
    const glance = Math.sin(t * 0.29) * Math.sin(t * 0.13);

    hips.position.y += breath * 0.006;
    hips.rotation.z += shift * 0.022;
    spine.rotation.x += breath * 0.018;
    spine.rotation.y += sway * 0.035;
    spine.rotation.z -= shift * 0.014;
    head.rotation.y += glance * 0.42;
    head.rotation.x += Math.sin(t * 0.47) * 0.05;
    armL.rotation.z += sway * 0.03;
    armR.rotation.z += sway * 0.03;
    armL.rotation.x += breath * 0.02;
    armR.rotation.x -= breath * 0.02;
    // The leg carrying the weight straightens as the other relaxes.
    legL.rotation.x += shift * 0.018;
    legR.rotation.x -= shift * 0.018;
  }
}

/**
 * Every rigged figure under `root`, except any that animates itself.
 *
 * The player's own avatar sets its pose from the controller each frame,
 * so it marks itself `selfAnimated` and is left out — posing it twice
 * would fight the walk cycle.
 */
export function collectWorkers(root) {
  const list = [];
  root.traverse((o) => {
    if (o.userData?.rig && !o.userData.selfAnimated) list.push(o);
  });
  return list;
}

/** Runs the idle layer over a list from collectWorkers(). */
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

/**
 * A door key, big enough to spot across a room.
 *
 * Deliberately oversized and bright: it is a thing the player has to
 * FIND and walk to, so it has to read as "pick me up" from the far
 * side of a plant room, not as a detail on the floor.
 */
export function buildKey(geo, mat) {
  const group = new THREE.Group();

  // Bow (the ring you hold), shank, and two bits at the end.
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 8, 20), mat.yellow);
  bow.position.y = 0.11;
  group.add(bow);
  group.add(cylinder(geo, mat.yellow, 0.025, 0.3, 0, -0.07, 0, { rotX: 0 }));
  group.add(box(geo, mat.yellow, 0.09, 0.035, 0.03, 0.045, -0.15, 0));
  group.add(box(geo, mat.yellow, 0.06, 0.035, 0.03, 0.03, -0.21, 0));

  // A soft halo so it is visible against a dark floor or a bright one.
  const halo = new THREE.Mesh(geo.sphere, new THREE.MeshBasicMaterial({
    color: 0xffc629, transparent: true, opacity: 0.16, depthWrite: false,
  }));
  halo.scale.setScalar(0.9);
  halo.position.y = 0.02;
  group.add(halo);

  group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  group.userData.key = { halo };
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

/**
 * A site information board: a heading bar and a few lines under it.
 *
 * The scenario in each escape area only existed inside the dialog that
 * opened when you walked up to something, so until you triggered it the
 * room told you nothing. This is the board that is on the wall of the
 * real thing — what the area is, what is wrong with it, what you have
 * to decide.
 *
 * Text is fitted to the width the same way the hoarding is, because the
 * content comes from the scenario files and nobody writing those should
 * have to count characters.
 */
export function boardTexture(title, lines = [], { accent = ARIA_ORANGE } = {}) {
  const key = `board:${title}:${lines.join("|")}:${accent}`;
  return canvasTexture(key, 768, 512, (ctx, w, h) => {
    ctx.fillStyle = "#11161B";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#2B343C";
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, w - 10, h - 10);

    // Heading bar.
    ctx.fillStyle = accent;
    ctx.fillRect(10, 10, w - 20, 92);
    ctx.fillStyle = "#11161B";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.letterSpacing = "2px";
    fitFont(ctx, title, w - 72, 54, 20, (px) => {
      ctx.font = `900 ${px}px system-ui, sans-serif`;
    });
    ctx.fillText(title, 36, 57);

    // Body, wrapped to the width rather than to a character count.
    ctx.fillStyle = "#E8EDF2";
    ctx.letterSpacing = "0px";
    const size = lines.length > 4 ? 28 : 33;
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    const maxWidth = w - 76;
    const wrapped = [];
    lines.forEach((line) => {
      let current = "";
      String(line).split(/\s+/).forEach((word) => {
        const next = current ? `${current} ${word}` : word;
        if (ctx.measureText(next).width > maxWidth && current) {
          wrapped.push(current);
          current = word;
        } else {
          current = next;
        }
      });
      if (current) wrapped.push(current);
      wrapped.push("");
    });
    let y = 150;
    wrapped.slice(0, 10).forEach((line) => {
      if (line) ctx.fillText(line, 38, y);
      y += line ? size * 1.34 : size * 0.6;
    });
  });
}

/**
 * The board above, mounted on a wall or on two legs.
 *
 * `facing` is the direction the FACE looks, in radians about Y.
 */
export function buildInfoBoard(geo, mat, {
  title = "NOTICE", lines = [], width = 2.6, accent = null, legs = true, height = 1.1,
} = {}) {
  const group = new THREE.Group();
  const h = width * (512 / 768);

  const face = new THREE.Mesh(geo.plane, new THREE.MeshLambertMaterial({
    map: boardTexture(title, lines, accent ? { accent } : {}),
    side: THREE.DoubleSide,
  }));
  face.scale.set(width, h, 1);
  face.position.set(0, height + h / 2, 0.035);
  face.castShadow = false;
  group.add(face);

  // Backing panel and a frame, so it is an object and not a decal.
  group.add(box(geo, mat.steelDark, width + 0.08, h + 0.08, 0.06, 0, height + h / 2, 0));

  if (legs) {
    [-width / 2 + 0.2, width / 2 - 0.2].forEach((lx) => {
      group.add(cylinder(geo, mat.galv, 0.035, height, lx, height / 2, 0, { low: true }));
    });
    group.add(box(geo, mat.black, width * 0.8, 0.05, 0.4, 0, 0.025, 0, { shadow: false }));
  }
  group.userData.boardHeight = height + h;
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

/**
 * Extinguisher types, as they are actually marked.
 *
 * Every body is RED; the type is the colour of the band round the top
 * and the text on the label. That is the real convention, and it is
 * also the thing the plant-room decision turns on — a player who
 * cannot read the band is guessing, which is not the lesson.
 */
export const EXTINGUISHER_TYPES = {
  water: { band: "blue2", name: "WATER", classes: "A", use: "Wood, paper, textiles" },
  foam: { band: "white", name: "FOAM", classes: "A B", use: "Wood, paper, flammable liquids" },
  co2: { band: "black", name: "CO2", classes: "B + ELECTRICAL", use: "Live electrical equipment" },
  wet: { band: "yellow", name: "WET CHEMICAL", classes: "F", use: "Cooking oils and fats" },
  powder: { band: "blue2", name: "DRY POWDER", classes: "A B C", use: "Most fires, but not indoors" },
  ABC: { band: "blue2", name: "DRY POWDER", classes: "A B C", use: "Most fires, but not indoors" },
};

/** The label wrapped round an extinguisher: name, classes and use. */
export function extinguisherLabelTexture(cls) {
  const t = EXTINGUISHER_TYPES[cls] || EXTINGUISHER_TYPES.ABC;
  return canvasTexture(`extLabel:${cls}`, 256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#F4F2EC";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#1A1A1A";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.letterSpacing = "1px";
    fitFont(ctx, t.name, w - 24, 46, 16, (px) => {
      ctx.font = `900 ${px}px system-ui, sans-serif`;
    });
    ctx.fillText(t.name, w / 2, 52);
    ctx.fillStyle = "#C8262B";
    ctx.fillRect(18, 86, w - 36, 6);
    ctx.fillStyle = "#1A1A1A";
    fitFont(ctx, t.classes, w - 30, 58, 18, (px) => {
      ctx.font = `900 ${px}px system-ui, sans-serif`;
    });
    ctx.fillText(t.classes, w / 2, 134);
    ctx.fillStyle = "#4A5560";
    ctx.letterSpacing = "0px";
    fitFont(ctx, t.use, w - 26, 24, 11, (px) => {
      ctx.font = `600 ${px}px system-ui, sans-serif`;
    });
    ctx.fillText(t.use, w / 2, 196);
  });
}

export function buildFireExtinguisher(geo, mat, { onStand = true, cls = "ABC" } = {}) {
  const group = new THREE.Group();
  const type = EXTINGUISHER_TYPES[cls] || EXTINGUISHER_TYPES.ABC;
  const bandMat = { white: mat.white, black: mat.black, yellow: mat.yellow, blue2: mat.blue, red: mat.red }[type.band] || mat.white;

  group.add(cylinder(geo, mat.red, 0.11, 0.52, 0, 0.42, 0));
  // The colour band round the shoulder — the thing you identify it by.
  group.add(cylinder(geo, bandMat, 0.115, 0.13, 0, 0.63, 0));
  group.add(cylinder(geo, mat.black, 0.055, 0.1, 0, 0.75, 0, { low: true }));
  group.add(box(geo, mat.steelDark, 0.2, 0.05, 0.07, 0.06, 0.79, 0));
  // Hose down the side.
  group.add(cylinder(geo, mat.black, 0.018, 0.34, 0.1, 0.5, 0.04, { rotZ: 0.3 }));

  // The label, large and legible, wrapped round the front.
  const label = new THREE.Mesh(geo.plane, new THREE.MeshLambertMaterial({
    map: extinguisherLabelTexture(cls), side: THREE.DoubleSide,
  }));
  label.scale.set(0.17, 0.17, 1);
  label.position.set(0, 0.44, 0.112);
  label.castShadow = false;
  group.add(label);

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
