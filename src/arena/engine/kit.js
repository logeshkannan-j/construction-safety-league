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
import { stairFlight, validateFlight, stairRails } from "./stairs.js";
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
    // The red-paved internal driveway of the development.
    paving: L({ color: 0xa65d45 }),

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
    // Stair handrails: painted safety yellow, so the rail you are meant
    // to hold stands out from the concrete it runs along.
    handrail: P({ color: 0xffc21a, shininess: 55, specular: 0x5a4a10 }),

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

/* ========================= Casagrand Aria =========================
 *
 * The development the site is building, as the renders show it:
 *
 *   - a 19-floor tower on the west side,
 *   - a 9-floor block in the middle, in front,
 *   - a 19-floor L-shaped block to the east: one long wing across the
 *     back of the garden and a return wing behind the corner, with the
 *     rooftop pool where the two meet,
 *
 * around a landscaped garden, with the blue tennis court and the
 * coloured play court in the south-east corner, a red-paved internal
 * driveway, dense palms and broadleaf trees all round, the main road
 * along the front, and the low-rise city beyond.
 *
 * The facades are what make it read as THIS building: light grey walls
 * with a deep, full-height balcony slot in every fourth bay, so the
 * recesses line up into the dark vertical stripes of the renders; a
 * sunshade over every window; a dark stilt-parking floor underneath;
 * and a jagged roofline of stair heads, lift rooms and water tanks.
 */

/** One tile is one floor of four bays: window, window, balcony, window. */
function ariaFacadeTexture(aniso) {
  return canvasTexture("ariaFacade", 512, 128, (g, w, h) => {
    const bay = w / 4;
    g.fillStyle = "#dcdfe0";
    g.fillRect(0, 0, w, h);
    for (let b = 0; b < 4; b++) {
      const x = b * bay;
      if (b === 2) {
        // The balcony: deep in shadow, a glazed door at the back, the
        // railing across the front.
        g.fillStyle = "#3a4048";
        g.fillRect(x + bay * 0.05, 0, bay * 0.9, h);
        g.fillStyle = "#65727e";
        g.fillRect(x + bay * 0.22, h * 0.12, bay * 0.56, h * 0.7);
        g.fillStyle = "#8ea3b4";
        g.fillRect(x + bay * 0.24, h * 0.14, bay * 0.16, h * 0.64);
        g.fillStyle = "#f1f2f2";
        g.fillRect(x + bay * 0.05, h * 0.55, bay * 0.9, h * 0.045);
        for (let i = 0; i <= 8; i++) g.fillRect(x + bay * (0.05 + i * 0.1125), h * 0.55, 2, h * 0.33);
      } else {
        // A window under its sunshade.
        g.fillStyle = "#4e5a66";
        g.fillRect(x + bay * 0.18, h * 0.26, bay * 0.64, h * 0.5);
        const glare = g.createLinearGradient(0, h * 0.26, 0, h * 0.76);
        glare.addColorStop(0, "rgba(196,220,238,0.55)");
        glare.addColorStop(1, "rgba(196,220,238,0.04)");
        g.fillStyle = glare;
        g.fillRect(x + bay * 0.18, h * 0.26, bay * 0.64, h * 0.5);
        g.fillStyle = "#c8ccd0";
        g.fillRect(x + bay * 0.495, h * 0.26, 3, h * 0.5);
        g.fillStyle = "#f4f5f5";
        g.fillRect(x + bay * 0.13, h * 0.2, bay * 0.74, h * 0.065);
        g.fillStyle = "rgba(0,0,0,0.2)";
        g.fillRect(x + bay * 0.13, h * 0.265, bay * 0.74, h * 0.035);
      }
      // The pier between bays.
      g.fillStyle = "#ccd1d4";
      g.fillRect(x, 0, bay * 0.04, h);
    }
    // The slab edge at each floor.
    g.fillStyle = "#f5f6f6";
    g.fillRect(0, h * 0.91, w, h * 0.09);
  }, { aniso });
}

/** The stilt floor under each block: columns, parked cars, shadow. */
function ariaStiltTexture(aniso) {
  return canvasTexture("ariaStilt", 256, 64, (g, w, h) => {
    g.fillStyle = "#2b3035";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#c9cdd0";
    for (let i = 0; i < 4; i++) g.fillRect(i * (w / 4), 0, w * 0.035, h);
    const cars = ["#8a1f1f", "#d6d8da", "#3b4f6b", "#1d1f22"];
    for (let i = 0; i < 4; i++) {
      g.fillStyle = cars[i];
      g.fillRect(i * (w / 4) + w * 0.07, h * 0.55, w * 0.14, h * 0.3);
    }
    g.fillStyle = "#f2f3f3";
    g.fillRect(0, 0, w, h * 0.08);
  }, { aniso });
}

/**
 * The walls of a block as ONE geometry: four faces per part, with UVs
 * in bays and floors so the facade tiles at the right scale on every
 * face, whatever the part's size.
 *
 * part: { x, z, w, d, y0, floors } in the block's local space.
 */
function facadeGeometry(parts, { floorH, bayW, startFloor = 0 }) {
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const quad = (a, b, c, d, n, uw, vh, v0) => {
    const i = pos.length / 3;
    pos.push(...a, ...b, ...c, ...d);
    for (let k = 0; k < 4; k++) nor.push(...n);
    uv.push(0, v0, uw, v0, uw, v0 + vh, 0, v0 + vh);
    idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  parts.forEach((p) => {
    const x0 = p.x - p.w / 2;
    const x1 = p.x + p.w / 2;
    const z0 = p.z - p.d / 2;
    const z1 = p.z + p.d / 2;
    const y0 = p.y0;
    const y1 = p.y0 + p.floors * floorH;
    const tilesW = (len) => len / (bayW * 4);
    const v0 = startFloor;
    // +z, -z, +x, -x — counter-clockwise seen from outside.
    quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], tilesW(p.w), p.floors, v0);
    quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], tilesW(p.w), p.floors, v0);
    quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], tilesW(p.d), p.floors, v0);
    quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], tilesW(p.d), p.floors, v0);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/**
 * One block of the development: stilt floor, the floors above it, the
 * roof with its parapet and the stair heads, lift rooms and water tanks
 * that give these blocks their jagged skyline.
 */
function buildAriaBlock(geo, mat, facadeMat, stiltMat, {
  name, parts, floors, floorH = 3.0, bayW = 3.4, services = [], pool = null,
}) {
  const group = new THREE.Group();
  const STILT = 3.6;
  const top = STILT + floors * floorH;

  const stiltMesh = new THREE.Mesh(
    facadeGeometry(parts.map((p) => ({ ...p, w: p.w - 0.8, d: p.d - 0.8, y0: 0, floors: 1 })), { floorH: STILT, bayW: bayW * 1.6 }),
    stiltMat
  );
  group.add(stiltMesh);
  group.add(new THREE.Mesh(
    facadeGeometry(parts.map((p) => ({ ...p, y0: STILT, floors })), { floorH, bayW }),
    facadeMat
  ));

  // Roofs, the slab over the stilts, the parapet and the roof clutter,
  // all in one merged mesh.
  const roof = [];
  parts.forEach((p) => {
    roof.push({ w: p.w + 0.6, h: 0.35, d: p.d + 0.6, x: p.x, y: STILT, z: p.z });
    roof.push({ w: p.w, h: 0.3, d: p.d, x: p.x, y: top, z: p.z });
    // Parapet round each part.
    roof.push({ w: p.w, h: 1.1, d: 0.25, x: p.x, y: top + 0.55, z: p.z + p.d / 2 - 0.12 });
    roof.push({ w: p.w, h: 1.1, d: 0.25, x: p.x, y: top + 0.55, z: p.z - p.d / 2 + 0.12 });
    roof.push({ w: 0.25, h: 1.1, d: p.d, x: p.x + p.w / 2 - 0.12, y: top + 0.55, z: p.z });
    roof.push({ w: 0.25, h: 1.1, d: p.d, x: p.x - p.w / 2 + 0.12, y: top + 0.55, z: p.z });
  });
  services.forEach((s) => {
    roof.push({ w: s.w, h: s.h, d: s.d, x: s.x, y: top + s.h / 2, z: s.z });
    // A water tank on top of most of them.
    if (s.tank !== false) {
      roof.push({ w: s.w * 0.7, h: 1.6, d: s.d * 0.6, x: s.x, y: top + s.h + 0.8, z: s.z });
    }
  });
  group.add(mergedMesh(roof, mat.towerBand, { shadow: false }));

  if (pool) {
    // The rooftop pool with its deck and glass balustrade.
    group.add(mergedMesh([
      { w: pool.w + 4, h: 0.3, d: pool.d + 4, x: pool.x, y: top + 0.45, z: pool.z },
    ], mat.timber, { shadow: false }));
    const water = new THREE.Mesh(geo.plane, mat.poolWater);
    water.scale.set(pool.w, pool.d, 1);
    water.rotation.x = -Math.PI / 2;
    water.position.set(pool.x, top + 0.64, pool.z);
    group.add(water);
    group.add(mergedMesh([
      { w: pool.w + 4, h: 1.1, d: 0.08, x: pool.x, y: top + 1.15, z: pool.z + pool.d / 2 + 2 },
      { w: 0.08, h: 1.1, d: pool.d + 4, x: pool.x + pool.w / 2 + 2, y: top + 1.15, z: pool.z },
    ], mat.balconyGlass, { shadow: false }));
  }

  group.userData.ariaBuilding = { name, floors, height: top, parts };
  return { group, height: top };
}

/* ------------------------------ trees ------------------------------ */

/** A repeatable random stream, so a grove grows the same every time. */
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * A leaf texture drawn on a canvas, uploaded with its see-through pixels
 * coloured like the leaves instead of black. A canvas keeps no colour
 * where it is fully transparent, and each smaller mipmap averages that
 * black into the leaf edges, so distant foliage got a dark fringe. Rows
 * are flipped so v runs up the canvas, as with a CanvasTexture.
 */
function bledTexture(key, width, height, draw) {
  if (textureCache.has(key)) return textureCache.get(key);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d");
  draw(g, width, height);
  const src = g.getImageData(0, 0, width, height).data;
  const sum = [0, 0, 0, 0];
  for (let i = 0; i < src.length; i += 4) {
    if (src[i + 3] > 200) {
      sum[0] += src[i]; sum[1] += src[i + 1]; sum[2] += src[i + 2]; sum[3] += 1;
    }
  }
  const fill = sum[3] ? [sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]] : [60, 100, 40];
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * 4;
      const to = ((height - 1 - y) * width + x) * 4;
      const clear = src[from + 3] === 0;
      out[to] = clear ? fill[0] : src[from];
      out[to + 1] = clear ? fill[1] : src[from + 1];
      out[to + 2] = clear ? fill[2] : src[from + 2];
      out[to + 3] = src[from + 3];
    }
  }
  const tex = new THREE.DataTexture(out, width, height, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  textureCache.set(key, tex);
  return tex;
}

/**
 * Lights both faces of a leaf card or a frond with the normal it was
 * given. three.js turns the normal round on the back face of a
 * double-sided material, and leaves lit as one rounded mass have their
 * normals pointing out of the crown — so every card seen from behind
 * came out black.
 */
function keepNormals(material) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_begin>",
      "#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\n\tnormal *= faceDirection;\n#endif",
    );
  };
  return material;
}

/**
 * The inside of a canopy: leaves packed so close there is no ground
 * between them, darker than the leaves on the outside.
 */
function denseFoliageTexture() {
  return canvasTexture("treeFoliageDense", 128, 128, (g, w, h) => {
    g.fillStyle = "#1f3d18";
    g.fillRect(0, 0, w, h);
    const rand = seededRandom(17);
    const greens = ["#24461b", "#2d5622", "#376429", "#1a3514", "#41702e"];
    for (let i = 0; i < 420; i++) {
      const len = 4 + rand() * 5;
      g.save();
      g.translate(rand() * w, rand() * h);
      g.rotate(rand() * Math.PI * 2);
      g.fillStyle = greens[(rand() * greens.length) | 0];
      g.beginPath();
      g.ellipse(0, 0, len, len * 0.45, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }, { repeat: [2, 2] });
}

/**
 * A spray of leaves on clear ground, for the alpha-cut cards a shade
 * tree's canopy is made of. Dense in the middle and ragged at the edge,
 * so no card ever shows its square.
 */
function foliageTexture() {
  return bledTexture("treeFoliage", 256, 256, (g, w, h) => {
    const rand = seededRandom(11);
    const greens = ["#2b5921", "#37682a", "#447730", "#538636", "#62953e", "#244a1b", "#73a24a"];
    for (let i = 0; i < 640; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * w * 0.46;
      const len = 6 + rand() * 8;
      g.save();
      g.translate(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
      g.rotate(rand() * Math.PI * 2);
      g.fillStyle = greens[(rand() * greens.length) | 0];
      g.beginPath();
      g.ellipse(0, 0, len, len * 0.42, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  });
}

/**
 * A coconut frond laid flat: the midrib up the middle and the leaflets
 * in pairs either side, swept towards the tip and longest in the middle
 * of the frond. The tip is at the top of the canvas, which is v = 1.
 */
function frondTexture() {
  return bledTexture("palmFrond", 128, 512, (g, w, h) => {
    const rand = seededRandom(23);
    const greens = ["#3f6f25", "#4b7d2b", "#578a31", "#668f36", "#3a6522", "#6f9a3c"];
    const cx = w / 2;
    g.lineCap = "round";
    for (let y = h - 8; y > 6; y -= 4.2) {
      const t = 1 - y / h;
      const reach = cx * 0.95 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.1 + t * 0.95)), 0.55)
        * (0.86 + rand() * 0.2);
      [-1, 1].forEach((side) => {
        g.strokeStyle = greens[(rand() * greens.length) | 0];
        g.lineWidth = 2 + rand() * 1.4;
        g.beginPath();
        g.moveTo(cx + side * 2, y);
        g.quadraticCurveTo(cx + side * reach * 0.55, y - reach * 0.16, cx + side * reach, y - reach * 0.6 - rand() * 6);
        g.stroke();
      });
    }
    // The midrib, pale and stiff.
    const rib = g.createLinearGradient(0, h, 0, 0);
    rib.addColorStop(0, "#c4b66e");
    rib.addColorStop(1, "#8da24c");
    g.strokeStyle = rib;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(cx, h);
    g.lineTo(cx, 0);
    g.stroke();
  });
}

/** Palm bark: grey-brown, ringed where old fronds fell. One metre of trunk. */
function palmBarkTexture() {
  return canvasTexture("palmBark", 32, 128, (g, w, h) => {
    g.fillStyle = "#8b7c68";
    g.fillRect(0, 0, w, h);
    noise(g, w, h, 160, ["#7a6c5a", "#968873", "#6f6252", "#a09079"], 2);
    const rand = seededRandom(5);
    for (let y = 4; y < h; y += 13 + rand() * 4) {
      g.fillStyle = "rgba(68, 56, 44, 0.8)";
      g.fillRect(0, y, w, 2);
      g.fillStyle = "rgba(196, 180, 154, 0.4)";
      g.fillRect(0, y + 2, w, 1);
    }
  });
}

/** Bark for a shade tree: dark, with fissures running up the trunk. */
function barkTexture() {
  return canvasTexture("treeBark", 64, 128, (g, w, h) => {
    g.fillStyle = "#5d4834";
    g.fillRect(0, 0, w, h);
    const rand = seededRandom(9);
    for (let i = 0; i < 28; i++) {
      const x = rand() * w;
      g.strokeStyle = rand() < 0.55 ? "rgba(36, 27, 20, 0.6)" : "rgba(134, 114, 90, 0.45)";
      g.lineWidth = 1 + rand() * 2;
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + (rand() - 0.5) * 8, h * 0.33, x + (rand() - 0.5) * 8, h * 0.66, x + (rand() - 0.5) * 6, h);
      g.stroke();
    }
  });
}

/**
 * A tapering tube through `points` ([x, y, z]) with a radius at each,
 * for trunks and branches; `vMetres` of length to one repeat of the bark.
 */
function taperedTube(points, radii, radial, vMetres = 1) {
  const p = points.map((a) => new THREE.Vector3(a[0], a[1], a[2]));
  const pos = [];
  const nor = [];
  const uv = [];
  const index = [];
  const fwd = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3();
  let along = 0;
  for (let i = 0; i < p.length; i++) {
    if (i > 0) along += p[i].distanceTo(p[i - 1]);
    fwd.subVectors(p[Math.min(i + 1, p.length - 1)], p[Math.max(i - 1, 0)]).normalize();
    if (Math.abs(fwd.x) > 0.9) side.set(0, 0, 1);
    else side.set(1, 0, 0);
    up.crossVectors(fwd, side).normalize();
    side.crossVectors(up, fwd).normalize();
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const cx = side.x * Math.cos(a) + up.x * Math.sin(a);
      const cy = side.y * Math.cos(a) + up.y * Math.sin(a);
      const cz = side.z * Math.cos(a) + up.z * Math.sin(a);
      pos.push(p[i].x + cx * radii[i], p[i].y + cy * radii[i], p[i].z + cz * radii[i]);
      nor.push(cx, cy, cz);
      uv.push(j / radial, along / vMetres);
    }
  }
  for (let i = 0; i < p.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      index.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

/**
 * One palm frond: a strip along the midrib that leaves the crown `rise`
 * radians above level and bends down by `droop` towards the tip, with
 * the leaflets either side raised into a shallow V, the way a real frond
 * holds them. u runs across the frond and v from the stalk (0) to the
 * tip (1), matching frondTexture().
 */
function frondGeometry({ length, width, rise, droop, segments, yaw, base, tint }) {
  const dx = Math.sin(yaw);
  const dz = Math.cos(yaw);
  const sx = Math.cos(yaw);
  const sz = -Math.sin(yaw);
  const fold = 0.38;
  const pos = [];
  const uv = [];
  const col = [];
  const index = [];
  let along = 0;
  let up = 0;
  for (let i = 0; i <= segments; i++) {
    const s = i / segments;
    if (i > 0) {
      const mid = rise - droop * Math.pow((i - 0.5) / segments, 1.3);
      along += Math.cos(mid) * (length / segments);
      up += Math.sin(mid) * (length / segments);
    }
    // Square to the midrib, in the upright plane it runs in.
    const a = rise - droop * Math.pow(s, 1.3);
    const nx = -Math.sin(a) * dx;
    const ny = Math.cos(a);
    const nz = -Math.sin(a) * dz;
    const cx = base[0] + dx * along;
    const cy = base[1] + up;
    const cz = base[2] + dz * along;
    // Bare stalk at the crown, leaflets from there to the tip.
    const half = (width / 2) * Math.min(1, s / 0.12);
    const shade = 0.72 + 0.32 * s;
    [-1, 0, 1].forEach((side) => {
      const out = Math.abs(side) * half;
      pos.push(
        cx + side * sx * half * Math.cos(fold) + nx * out * Math.sin(fold),
        cy + ny * out * Math.sin(fold),
        cz + side * sz * half * Math.cos(fold) + nz * out * Math.sin(fold),
      );
      uv.push((side + 1) / 2, s);
      const k = side === 0 ? shade * 0.92 : shade;
      col.push(tint[0] * k, tint[1] * k, tint[2] * k);
    });
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 3;
    const b = a + 3;
    index.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  // Turned to the sky and leant towards it, so the crown is lit like
  // foliage from wherever it is seen, the underside included.
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) {
    const flip = n.getY(i) < 0 ? -1 : 1;
    const x = n.getX(i) * flip * 0.6;
    const y = n.getY(i) * flip * 0.6 + 0.8;
    const z = n.getZ(i) * flip * 0.6;
    const len = Math.hypot(x, y, z) || 1;
    n.setXYZ(i, x / len, y / len, z / len);
  }
  g.userData.tipY = base[1] + up;
  return g;
}

/** Leaf colour per tree, so a grove is not one green. */
const TREE_HUES = [[1, 1, 1], [1.08, 1.04, 0.78], [0.86, 0.98, 0.9], [0.98, 0.94, 0.86]];

/**
 * Trees, the way the renders have them: coconut palms and broadleaf
 * shade trees.
 *
 * A palm is a curving, ringed trunk with a crown of fronds in a spiral:
 * the young ones stand up in the middle, the older ones arch out and
 * droop at the tips, the oldest hang yellowing down the trunk, and a
 * bunch of coconuts sits under them. A shade tree is a trunk forking
 * into branches, each ending in a clump of leaves. Leaves are alpha-cut
 * cards on a painted leaf texture around a dark core, so the outline is
 * leaves against the sky rather than a lump, and the fronds are leaflets
 * on a midrib rather than flat blades. Everything is merged by material:
 * the whole grove is six draw calls. `low` thins it all out for the
 * lowest graphics setting.
 */
function buildTreeGroves(spots, { seed = 7, low = false } = {}) {
  const rand = seededRandom(seed);
  const parts = { bark: [], palmBark: [], solid: [], cores: [], leaves: [], fronds: [] };
  const stats = { palms: 0, broadleaf: 0, crowns: [] };
  const card = new THREE.PlaneGeometry(1, 1);
  const nut = new THREE.IcosahedronGeometry(0.13, 0);
  const core = new THREE.IcosahedronGeometry(1, low ? 0 : 1);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const twist = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const Z = new THREE.Vector3(0, 0, 1);

  // Colours a geometry: `rgb` times a shade worked out per vertex.
  const paint = (g, rgb, shadeAt) => {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const k = shadeAt(p.getY(i), n ? n.getY(i) : 0);
      c[i * 3] = rgb[0] * k;
      c[i * 3 + 1] = rgb[1] * k;
      c[i * 3 + 2] = rgb[2] * k;
    }
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    return g;
  };

  const growPalm = (x, z, scale) => {
    const h = (8 + rand() * 4) * scale;
    const leanYaw = rand() * Math.PI * 2;
    const lean = h * (0.03 + rand() * 0.08);
    const rings = low ? 6 : 9;
    const pts = [];
    const radii = [];
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      const off = lean * Math.pow(t, 1.6);
      pts.push([x + Math.sin(leanYaw) * off, h * t, z + Math.cos(leanYaw) * off]);
      // Flared at the foot, then slim and nearly even to the crown.
      radii.push((0.14 + 0.06 * (1 - t) + 0.12 * Math.pow(1 - t, 8)) * scale);
    }
    parts.palmBark.push(taperedTube(pts, radii, low ? 6 : 8, 1));
    const top = pts[rings];

    const count = low ? 10 : 15;
    const yaw0 = rand() * Math.PI * 2;
    let lowestTip = Infinity;
    let highest = -Infinity;
    for (let k = 0; k < count; k++) {
      const age = k / (count - 1);
      const dead = !low && age > 0.9;
      // The golden angle: how a palm lays its fronds round the crown.
      const yaw = yaw0 + k * 2.39996 + (rand() - 0.5) * 0.3;
      const frond = frondGeometry({
        length: (3.4 + rand() * 1.2) * scale * (0.85 + 0.2 * age),
        width: 1.5 * scale,
        rise: dead ? -1.25 : 1.05 - 1.35 * age + (rand() - 0.5) * 0.2,
        droop: dead ? 0.45 : 1.15 + 0.7 * age,
        segments: low ? 5 : 8,
        yaw,
        base: [top[0] + Math.sin(yaw) * 0.12, top[1] + 0.1 - 0.45 * age * scale, top[2] + Math.cos(yaw) * 0.12],
        tint: dead ? [1.25, 0.92, 0.5] : age > 0.7 ? [1.08, 1, 0.72] : [1, 1, 1],
      });
      const fp = frond.attributes.position;
      for (let i = 0; i < fp.count; i++) highest = Math.max(highest, fp.getY(i));
      lowestTip = Math.min(lowestTip, frond.userData.tipY);
      parts.fronds.push(frond);
    }

    // A bunch of coconuts under the crown.
    const nuts = low ? 3 : 5 + Math.floor(rand() * 3);
    for (let k = 0; k < nuts; k++) {
      const a = rand() * Math.PI * 2;
      const g = nut.clone().applyMatrix4(m.makeTranslation(
        top[0] + Math.cos(a) * 0.24, top[1] - 0.3 - rand() * 0.25, top[2] + Math.sin(a) * 0.24,
      ));
      parts.solid.push(paint(g, rand() < 0.6 ? [0.42, 0.5, 0.16] : [0.55, 0.4, 0.18], (y, ny) => 0.8 + 0.3 * ny));
    }
    stats.palms += 1;
    stats.crowns.push({ x, z, top: top[1], lowestTip, highest });
  };

  const growShadeTree = (x, z, scale) => {
    const forkH = (2.2 + rand() * 1.2) * scale;
    const R = (2.5 + rand() * 1.5) * scale;
    const crownY = forkH + R * 0.75;
    const lx = (rand() - 0.5) * 0.4 * scale;
    const lz = (rand() - 0.5) * 0.4 * scale;
    const fork = new THREE.Vector3(x + lx, forkH, z + lz);
    const r0 = (0.2 + rand() * 0.08) * scale;
    parts.bark.push(taperedTube(
      [[x, 0, z], [x + lx * 0.3, forkH * 0.35, z + lz * 0.3], [x + lx * 0.7, forkH * 0.7, z + lz * 0.7], fork.toArray()],
      [r0 * 1.5, r0 * 1.05, r0 * 0.95, r0 * 0.85],
      low ? 5 : 7, 1.6,
    ));

    // Branches out to the clumps of leaves; the top clump sits over the fork.
    const clumps = [{ c: new THREE.Vector3(fork.x, crownY + R * 0.3, fork.z), r: R * 0.72 }];
    const branches = 3 + Math.floor(rand() * 2);
    const a0 = rand() * Math.PI * 2;
    for (let b = 0; b < branches; b++) {
      const a = a0 + (b / branches) * Math.PI * 2 + (rand() - 0.5) * 0.5;
      const reach = R * (0.5 + rand() * 0.2);
      const end = new THREE.Vector3(fork.x + Math.cos(a) * reach, crownY + (rand() - 0.4) * R * 0.3, fork.z + Math.sin(a) * reach);
      const mid = fork.clone().lerp(end, 0.5);
      mid.y += 0.35 * scale;
      parts.bark.push(taperedTube([fork.toArray(), mid.toArray(), end.toArray()], [r0 * 0.6, r0 * 0.42, r0 * 0.2], low ? 4 : 5, 1.6));
      clumps.push({ c: end, r: R * (0.55 + rand() * 0.15) });
    }

    // Each clump: a dark core so the middle reads as deep shade, then
    // leaf cards over it, lit as one rounded mass rather than card by
    // card, and darker underneath than on top.
    const hue = TREE_HUES[(rand() * TREE_HUES.length) | 0];
    const bottom = crownY - R;
    const span = 2 * R;
    clumps.forEach(({ c, r }, i) => {
      parts.cores.push(paint(
        core.clone().applyMatrix4(m.compose(c, q.identity(), v.set(r * 0.7, r * 0.6, r * 0.7))),
        hue,
        (y, ny) => 0.75 + 0.3 * Math.max(0, ny),
      ));
      const n = Math.round((low ? 7 : 16) * (i === 0 ? 1.3 : 1));
      for (let k = 0; k < n; k++) {
        // Mostly over the top and round the sides: the underside is in
        // shade and seen far less.
        const dir = new THREE.Vector3(rand() * 2 - 1, rand() * 1.5 - 0.5, rand() * 2 - 1).normalize();
        const at = c.clone().addScaledVector(dir, r * (0.6 + rand() * 0.35));
        at.y = c.y + (at.y - c.y) * 0.82;
        const facing = dir.clone().add(new THREE.Vector3(rand() - 0.5, rand() - 0.3, rand() - 0.5).multiplyScalar(0.9)).normalize();
        q.setFromUnitVectors(Z, facing);
        twist.setFromAxisAngle(Z, rand() * Math.PI * 2);
        q.multiply(twist);
        const size = r * (0.75 + rand() * 0.45);
        const leaf = card.clone().applyMatrix4(m.compose(at, q, v.set(size, size, size)));
        const lp = leaf.attributes.position;
        const ln = leaf.attributes.normal;
        for (let j = 0; j < lp.count; j++) {
          v.set(lp.getX(j) - c.x, (lp.getY(j) - c.y) * 1.2 + r * 0.25, lp.getZ(j) - c.z).normalize();
          ln.setXYZ(j, v.x, v.y, v.z);
        }
        parts.leaves.push(paint(leaf, hue, (y) => 0.6 + 0.55 * Math.min(1, Math.max(0, (y - bottom) / span))));
      }
    });
    stats.broadleaf += 1;
  };

  spots.forEach(({ x, z, palm = null, scale = 1 }) => {
    if (palm ?? rand() < 0.35) growPalm(x, z, scale);
    else growShadeTree(x, z, scale);
  });

  const group = new THREE.Group();
  const add = (list, material) => {
    if (!list.length) return;
    const merged = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    if (merged) group.add(new THREE.Mesh(merged, material));
  };
  add(parts.bark, new THREE.MeshLambertMaterial({ map: barkTexture() }));
  add(parts.palmBark, new THREE.MeshLambertMaterial({ map: palmBarkTexture() }));
  add(parts.solid, new THREE.MeshLambertMaterial({ vertexColors: true }));
  add(parts.cores, new THREE.MeshLambertMaterial({ map: denseFoliageTexture(), vertexColors: true }));
  add(parts.leaves, keepNormals(new THREE.MeshLambertMaterial({
    map: foliageTexture(), vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide,
  })));
  add(parts.fronds, keepNormals(new THREE.MeshLambertMaterial({
    map: frondTexture(), vertexColors: true, alphaTest: 0.4, side: THREE.DoubleSide,
  })));
  card.dispose();
  nut.dispose();
  core.dispose();
  group.userData.treeCount = spots.length;
  group.userData.trees = stats;
  return group;
}

/**
 * The Casagrand Aria development: the 19-floor west tower, the 9-floor
 * middle block and the 19-floor L-shaped block, laid out as the renders
 * show, with the grounds, the trees and the road in front.
 *
 * This is SCENERY. It sits beyond the hoarding, carries no colliders,
 * casts no shadows, and reads from any angle the player can get to,
 * including the overhead view.
 *
 * `x`/`z` place the ENTRANCE on the main road. The development runs
 * back from it (local -z), with the road along the front (local +z).
 */
export function buildBrandedTower(geo, mat, {
  x = 0, z = -95, floors = 19, rotY = 0,
} = {}) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotY;

  const aniso = 4;
  const facadeMat = new THREE.MeshLambertMaterial({ map: ariaFacadeTexture(aniso) });
  const stiltMat = new THREE.MeshLambertMaterial({ map: ariaStiltTexture(aniso) });

  // Everything hangs off this, so local z = 0 is the compound wall.
  const site = new THREE.Group();
  group.add(site);

  /* ---- the ground: garden lawn inside the wall, verge outside ---- */
  site.add(mergedMesh([
    { w: 168, h: 0.3, d: 104, x: 0, y: 0.15, z: -53 },
  ], mat.lawn, { shadow: false }));

  /* ---- the main road along the front, footpaths and markings ---- */
  site.add(mergedMesh([{ w: 230, h: 0.12, d: 8, x: 0, y: 0.06, z: 5 }], mat.asphalt, { shadow: false }));
  site.add(mergedMesh([
    { w: 230, h: 0.2, d: 1.6, x: 0, y: 0.1, z: 0.2 },
    { w: 230, h: 0.2, d: 1.4, x: 0, y: 0.1, z: 9.8 },
  ], mat.concreteDark, { shadow: false }));
  const marks = [];
  for (let i = -112; i < 112; i += 6) marks.push({ w: 3, h: 0.02, d: 0.18, x: i, y: 0.13, z: 5 });
  marks.push({ w: 230, h: 0.02, d: 0.14, x: 0, y: 0.13, z: 1.4 });
  marks.push({ w: 230, h: 0.02, d: 0.14, x: 0, y: 0.13, z: 8.6 });
  site.add(mergedMesh(marks, mat.white, { shadow: false }));

  /* ---- compound wall, with the gate on the driveway ---- */
  site.add(mergedMesh([
    { w: 76, h: 1.8, d: 0.3, x: -46, y: 0.9, z: -1.4 },
    { w: 76, h: 1.8, d: 0.3, x: 46, y: 0.9, z: -1.4 },
    { w: 0.3, h: 1.8, d: 102, x: -84, y: 0.9, z: -52 },
    { w: 0.3, h: 1.8, d: 102, x: 84, y: 0.9, z: -52 },
    { w: 168, h: 1.8, d: 0.3, x: 0, y: 0.9, z: -103 },
  ], mat.towerShell, { shadow: false }));

  /* ---- the red-paved internal driveway ---- */
  site.add(mergedMesh([
    { w: 7, h: 0.08, d: 43, x: 0, y: 0.33, z: -23.5 },
    { w: 96, h: 0.08, d: 7, x: 9, y: 0.33, z: -44 },
    { w: 58, h: 0.08, d: 6, x: -27, y: 0.33, z: -12 },
    { w: 6, h: 0.08, d: 14, x: -54, y: 0.33, z: -21 },
  ], mat.paving || mat.timberDark, { shadow: false }));

  /* ---- the three buildings ---- */
  const west = buildAriaBlock(geo, mat, facadeMat, stiltMat, {
    name: "west tower",
    floors,
    parts: [
      { x: 0, z: 0, w: 24, d: 15 },
      { x: 0, z: 0, w: 15, d: 25 },
      { x: -8, z: 9, w: 6, d: 6 },
      { x: 8, z: -9, w: 6, d: 6 },
    ],
    services: [
      { x: -6, z: -4, w: 6, d: 5, h: 4.5 },
      { x: 6, z: 4, w: 6, d: 5, h: 4.5 },
      { x: 0, z: 9, w: 4, d: 4, h: 3, tank: false },
      { x: -9, z: 2, w: 3.5, d: 3.5, h: 2.6 },
    ],
  });
  west.group.position.set(-54, 0, -42);
  site.add(west.group);

  const middle = buildAriaBlock(geo, mat, facadeMat, stiltMat, {
    name: "middle block",
    floors: 9,
    parts: [
      { x: 0, z: 0, w: 17, d: 12 },
      { x: 0, z: 0, w: 11, d: 17 },
    ],
    services: [
      { x: -3, z: -2, w: 5, d: 4, h: 3.8 },
      { x: 4, z: 3, w: 3, d: 3, h: 2.4 },
    ],
  });
  middle.group.position.set(-24, 0, -27);
  site.add(middle.group);

  // The L: a long wing across the back of the garden, and a return wing
  // running back from its west end. The pool is on the corner.
  const lBlock = buildAriaBlock(geo, mat, facadeMat, stiltMat, {
    name: "L-shaped block",
    floors,
    parts: [
      { x: 0, z: 0, w: 62, d: 15 },
      { x: -23.5, z: -17, w: 15, d: 34 },
      // Projecting bays along the long face, so it steps as the renders do.
      { x: -8, z: 8.5, w: 8, d: 2.4 },
      { x: 10, z: 8.5, w: 8, d: 2.4 },
      { x: 26, z: 8.5, w: 7, d: 2.4 },
      { x: -8, z: -8.5, w: 8, d: 2.4 },
      { x: 12, z: -8.5, w: 8, d: 2.4 },
    ],
    services: [
      { x: -16, z: -4, w: 5, d: 5, h: 4.5 },
      { x: 2, z: 0, w: 6, d: 5, h: 4.5 },
      { x: 18, z: 0, w: 6, d: 5, h: 4.5 },
      { x: 28, z: -3, w: 4, d: 4, h: 3 },
      { x: -23.5, z: -28, w: 6, d: 5, h: 4.5 },
      { x: -27, z: -14, w: 3.5, d: 3.5, h: 2.6 },
    ],
    pool: { x: -23.5, z: -1, w: 9, d: 5 },
  });
  lBlock.group.position.set(14, 0, -58);
  site.add(lBlock.group);

  /* ---- the courts in the south-east corner ---- */
  const tennis = new THREE.Mesh(geo.plane, mat.courtBlue);
  tennis.scale.set(24, 11, 1);
  tennis.rotation.x = -Math.PI / 2;
  tennis.position.set(42, 0.32, -24);
  site.add(tennis);
  const play = new THREE.Mesh(geo.plane, mat.courtRed);
  play.scale.set(15, 11, 1);
  play.rotation.x = -Math.PI / 2;
  play.position.set(65, 0.32, -24);
  site.add(play);
  const lines = [];
  [[42, 24, 11], [65, 15, 11]].forEach(([cx, w, d]) => {
    lines.push({ w, h: 0.02, d: 0.14, x: cx, y: 0.34, z: -24 - d / 2 + 0.3 });
    lines.push({ w, h: 0.02, d: 0.14, x: cx, y: 0.34, z: -24 + d / 2 - 0.3 });
    lines.push({ w: 0.14, h: 0.02, d, x: cx - w / 2 + 0.3, y: 0.34, z: -24 });
    lines.push({ w: 0.14, h: 0.02, d, x: cx + w / 2 - 0.3, y: 0.34, z: -24 });
  });
  lines.push({ w: 0.14, h: 0.02, d: 11, x: 42, y: 0.34, z: -24 });
  lines.push({ w: 0.08, h: 1.0, d: 10, x: 42, y: 0.8, z: -24 });
  site.add(mergedMesh(lines, mat.white, { shadow: false }));
  // The play court's coloured rings and the fence round both courts.
  const rings = [];
  [[60, -27, mat.yellow], [65, -21, mat.green], [70, -26, mat.blue]].forEach(([cx, cz, m]) => {
    const ring = new THREE.Mesh(new THREE.CircleGeometry(1.8, 20), m);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, 0.335, cz);
    rings.push(ring);
  });
  rings.forEach((r) => site.add(r));
  site.add(mergedMesh([
    { w: 42, h: 3, d: 0.06, x: 53, y: 1.8, z: -17.6 },
    { w: 42, h: 3, d: 0.06, x: 53, y: 1.8, z: -30.4 },
  ], mat.net, { shadow: false }));

  /* ---- trees: the street, the garden, and the belt round the site ---- */
  const spots = [];
  // Along the road, inside the wall.
  let roadside = 0;
  for (let tx = -80; tx <= 80; tx += 9) {
    // Clear of the gate and of the name wall beside it.
    if (Math.abs(tx) < 10 || (tx > 6 && tx < 34)) continue;
    // Palms and shade trees by turns. (This was `(tx / 9) % 2 === 0`,
    // which no position on this line ever met, so there were no palms.)
    spots.push({ x: tx, z: -4.5, palm: roadside++ % 2 === 0 });
  }
  // The belt round the sides and back.
  for (let tz = -10; tz >= -98; tz -= 7) {
    spots.push({ x: -79, z: tz });
    spots.push({ x: 79, z: tz });
  }
  for (let tx = -76; tx <= 76; tx += 7) spots.push({ x: tx, z: -98 });
  // The garden between the blocks and the courts.
  [[-6, -18], [8, -14], [16, -26], [24, -16], [-10, -32], [6, -34], [28, -36],
    [18, -38], [-36, -10], [-40, -20], [-14, -12], [34, -10], [52, -38], [60, -12],
    [72, -38], [-68, -18], [-66, -62], [-40, -64], [-40, -78], [-56, -84], [44, -82],
    [60, -84], [70, -66], [30, -84], [5, -88], [14, -92], [50, -71], [74, -50]]
    .forEach(([tx, tz]) => spots.push({ x: tx, z: tz }));
  // Outside the compound: the green the city is set in.
  for (let tx = -110; tx <= 110; tx += 11) {
    if (Math.abs(tx) < 88) continue;
    for (let tz = -6; tz >= -100; tz -= 12) spots.push({ x: tx + ((tz * 7) % 5), z: tz, scale: 1.15 });
  }
  const groves = buildTreeGroves(spots, { low: (geo.cyl?.parameters?.radialSegments ?? 12) <= 8 });
  site.add(groves);

  /* ---- the city beyond: low blocks among the trees ---- */
  const city = [];
  [[-122, -20, 14, 10, 12], [-126, -48, 12, 16, 18], [-120, -78, 16, 12, 9],
    [122, -24, 12, 12, 15], [126, -56, 16, 14, 9], [120, -86, 12, 10, 21]].forEach(([cx, cz, w, d, h]) => {
    city.push({ w, h, d, x: cx, y: h / 2, z: cz });
    city.push({ w: 3, h: 2, d: 3, x: cx - w / 4, y: h + 1, z: cz });
  });
  site.add(mergedMesh(city, mat.towerShell, { shadow: false }));

  /* ---- the entrance: the name wall with the ARIA mark above it ---- */
  site.add(box(geo, mat.brandDark, 22, 5.4, 0.6, 20, 3.0, -3.2, { shadow: false }));
  const mark = buildAriaMark(geo, mat, { size: 6 });
  mark.group.position.set(20, 10.5, -3.2);
  site.add(mark.group);

  group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return {
    group,
    height: lBlock.height + 6,
    floors,
    ariaRing: mark.ring,
    buildings: [west.group, middle.group, lBlock.group],
    trees: spots.length,
    groves,
  };
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

      // Handrails up both sides of the flight. These DO collide: the
      // stringer behind them is only half a metre high, so without
      // them a player drifting off the centre line walks straight off
      // the side of the flight and falls back to the floor below —
      // which is what being unable to get upstairs looked like.
      const balustrade = stairRails(flight);
      if (balustrade.parts.length) {
        const railMesh = mergedMesh(balustrade.parts, mat.galv, { shadow: false });
        railMesh.position.set(x, 0, z);
        group.add(railMesh);
      }
      if (balustrade.handrail.length) {
        const handrailMesh = mergedMesh(balustrade.handrail, mat.handrail);
        handrailMesh.position.set(x, 0, z);
        handrailMesh.userData.handrail = true;
        group.add(handrailMesh);
      }
      balustrade.colliders.forEach((c) => {
        colliders.push(collider(x + c.x, c.y, z + c.z, c.w, c.h, c.d));
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

  // Access ladder up the inside face, running a metre past the top
  // platform so there is something to hold stepping off it.
  const ladder = buildLadder(geo, mat, { height: totalHeight + 1, lean: 0 });
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

/**
 * A ladder: aluminium stiles, rungs every 280 mm, rubber feet, caps.
 *
 * `height` is the length of the stiles and `lean` the angle off the
 * vertical. The origin is at the FEET and the ladder leans towards
 * local +Z — so put whatever it rests on there, and turn the returned
 * group about Y to face it. The lean lives on an inner frame, so a turn
 * and a lean can never fight; the old ladder put both on one group,
 * where three.js applies them in an order that tipped it sideways.
 *
 * `tieAt` (metres along the stiles) lashes both stiles there: a ladder
 * is tied at the top, where it rests, not held at the foot.
 */
export function buildLadder(geo, mat, { height = 4, lean = 0.18, width = 0.44, tieAt = null } = {}) {
  const group = new THREE.Group();
  const frame = new THREE.Group();
  frame.rotation.x = lean;
  group.add(frame);

  const STILE_W = 0.03;
  const STILE_D = 0.07;
  const parts = [];
  [-width / 2, width / 2].forEach((sx) => {
    parts.push({ w: STILE_W, h: height, d: STILE_D, x: sx, y: height / 2, z: 0 });
  });
  for (let y = 0.28; y < height - 0.1; y += 0.28) {
    parts.push({ w: width, h: 0.032, d: 0.034, x: 0, y, z: 0 });
  }
  frame.add(mergedMesh(parts, mat.galv));

  const ends = [];
  [-width / 2, width / 2].forEach((sx) => {
    ends.push({ w: STILE_W + 0.03, h: 0.06, d: STILE_D + 0.05, x: sx, y: 0.03, z: 0 });
    ends.push({ w: STILE_W + 0.008, h: 0.04, d: STILE_D + 0.008, x: sx, y: height - 0.02, z: 0 });
  });
  frame.add(mergedMesh(ends, mat.black, { shadow: false }));

  if (Number.isFinite(tieAt)) {
    const ties = [];
    [-width / 2, width / 2].forEach((sx) => {
      [-0.05, 0.05].forEach((dy) => {
        ties.push({ w: STILE_W + 0.022, h: 0.03, d: STILE_D + 0.022, x: sx, y: tieAt + dy, z: 0 });
      });
      // The tail of the lashing, back to whatever it is tied to.
      ties.push({ w: 0.018, h: 0.018, d: 0.16, x: sx, y: tieAt, z: 0.1 });
    });
    frame.add(mergedMesh(ties, mat.orange, { shadow: false }));
  }

  group.userData.ladder = {
    height, lean, width, tied: Number.isFinite(tieAt),
    topY: height * Math.cos(lean),
    reach: height * Math.sin(lean),
  };
  return group;
}

/**
 * A ladder set up the way it should be: one out for every four up
 * (about 75 degrees), standing on the level below, tied where it rests
 * and running on a metre past the landing so there is something to
 * hold while stepping off.
 *
 * `rise` is the climb from the feet to the landing. The group's origin
 * is at the feet and the landing edge is `footOffset` in front of them
 * along local +Z.
 */
export function buildLadderAgainst(geo, mat, { rise, extension = 1, width = 0.44, tied = true } = {}) {
  const lean = Math.atan(1 / 4);
  const toLanding = rise / Math.cos(lean);
  const length = toLanding + Math.max(0, extension) / Math.cos(lean);
  const group = buildLadder(geo, mat, {
    height: length, lean, width, tieAt: tied ? toLanding - 0.12 : null,
  });
  const footOffset = rise * Math.tan(lean);
  Object.assign(group.userData.ladder, { rise, footOffset, extension });
  return { group, lean, length, footOffset };
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

/*
 * People live in their own module: the sculpted head, the lofted body,
 * the clothing and PPE, and the gait. Re-exported here so every game
 * keeps importing them from the kit as it always has.
 */
export {
  buildWorker, poseWorker, animateWorker, turnToward, createWalker,
  collectWorkers, idleWorkers,
} from "./human.js";

/**
 * A bag of cement, for somebody to carry: a sack, sagging a little,
 * with the band of print across it.
 */
export function buildCementBag(geo, mat) {
  const group = new THREE.Group();
  group.add(box(geo, mat.concrete, 0.46, 0.13, 0.32, 0, 0, 0));
  group.add(box(geo, mat.white, 0.47, 0.135, 0.1, 0, 0, 0, { shadow: false }));
  return group;
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
 * The label that floats over a thing you can interact with.
 *
 * A SPRITE, not a plane, so it always faces the camera. A name you
 * have to walk round to read is not a name, and on a site where the
 * player approaches from any direction a flat label spends most of
 * its life edge-on.
 *
 * The HUD was naming the next objective — "Command post, 4 m N" —
 * while nothing in the world said which object that was.
 */
export function nameplateTexture(text, { sub = "", ta = "", accent = "#FFC629" } = {}) {
  return canvasTexture(`nameplate:${text}:${ta}:${sub}:${accent}`, 512, 208, (ctx, w, h) => {
    // Rounded pill. Drawn by hand rather than with arcTo, which is not
    // in the 2D stub the headless tests use.
    const r = 52;
    const pill = () => {
      ctx.beginPath();
      ctx.moveTo(r, 6);
      ctx.lineTo(w - r, 6);
      ctx.quadraticCurveTo(w - 6, 6, w - 6, r);
      ctx.lineTo(w - 6, h - r);
      ctx.quadraticCurveTo(w - 6, h - 6, w - r, h - 6);
      ctx.lineTo(r, h - 6);
      ctx.quadraticCurveTo(6, h - 6, 6, h - r);
      ctx.lineTo(6, r);
      ctx.quadraticCurveTo(6, 6, r, 6);
      ctx.closePath();
    };
    ctx.fillStyle = "rgba(10,14,18,0.9)";
    pill();
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 7;
    pill();
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Small line of context first — the step number, or PRESS E.
    if (sub) {
      ctx.fillStyle = accent;
      ctx.letterSpacing = "3px";
      fitFont(ctx, sub, w - 70, 26, 11, (px) => {
        ctx.font = `800 ${px}px system-ui, sans-serif`;
      });
      ctx.fillText(sub, w / 2, 38);
    }

    // English, then Tamil under it. Signage on a real multilingual
    // site shows both at once, because the person who needs the second
    // language is not going to tap a toggle first.
    const enY = ta ? (sub ? 92 : 78) : (sub ? 112 : h / 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.letterSpacing = "1px";
    fitFont(ctx, text, w - 56, 58, 18, (px) => {
      ctx.font = `900 ${px}px system-ui, sans-serif`;
    });
    ctx.fillText(text, w / 2, enY);

    if (ta) {
      ctx.fillStyle = "#CFE0EE";
      ctx.letterSpacing = "0px";
      fitFont(ctx, ta, w - 56, 46, 15, (px) => {
        ctx.font = `700 ${px}px system-ui, sans-serif`;
      });
      ctx.fillText(ta, w / 2, enY + 60);
    }
    ctx.letterSpacing = "0px";
  });
}

/** A floating, always-facing name over an interactable. */
export function buildNameplate(text, {
  sub = "", ta = "", accent = "#FFC629", width = 3.2,
} = {}) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: nameplateTexture(text, { sub, ta, accent }),
    transparent: true,
    depthWrite: false,
  }));
  sprite.scale.set(width, width * (208 / 512), 1);
  sprite.userData.nameplate = { text, sub, ta };
  return sprite;
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
export function boardTexture(title, lines = [], { accent = ARIA_ORANGE, ta = [], taTitle = "" } = {}) {
  const key = `board:${title}:${lines.join("|")}:${taTitle}:${ta.join("|")}:${accent}`;
  return canvasTexture(key, 768, 512, (ctx, w, h) => {
    ctx.fillStyle = "#11161B";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#2B343C";
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, w - 10, h - 10);

    // Heading bar: both languages, English then Tamil.
    ctx.fillStyle = accent;
    ctx.fillRect(10, 10, w - 20, taTitle ? 112 : 92);
    ctx.fillStyle = "#11161B";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.letterSpacing = "2px";
    fitFont(ctx, title, w - 72, taTitle ? 44 : 54, 18, (px) => {
      ctx.font = `900 ${px}px system-ui, sans-serif`;
    });
    ctx.fillText(title, 36, taTitle ? 44 : 57);
    if (taTitle) {
      ctx.letterSpacing = "0px";
      fitFont(ctx, taTitle, w - 72, 34, 14, (px) => {
        ctx.font = `800 ${px}px system-ui, sans-serif`;
      });
      ctx.fillText(taTitle, 36, 92);
    }

    // Body: the English lines, then the Tamil ones under a rule.
    const all = ta.length ? [...lines, "\u0000", ...ta] : lines;
    ctx.letterSpacing = "0px";
    const size = all.length > 4 ? 26 : 31;
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    const maxWidth = w - 76;
    const wrapped = [];
    all.forEach((line) => {
      if (line === "\u0000") { wrapped.push("\u0000"); return; }
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

    let y = taTitle ? 164 : 150;
    let inTamil = false;
    wrapped.slice(0, 12).forEach((line) => {
      if (line === "\u0000") {
        ctx.fillStyle = "#2B343C";
        ctx.fillRect(38, y - 6, w - 76, 2);
        y += 22;
        inTamil = true;
        return;
      }
      if (line) {
        ctx.fillStyle = inTamil ? "#BFD3E4" : "#E8EDF2";
        ctx.fillText(line, 38, y);
      }
      y += line ? size * 1.3 : size * 0.5;
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
  // The same board, in Tamil, under a rule. Both at once: a sign that
  // needs a toggle is no use to the person who needs the toggle.
  taTitle = "", ta = [],
} = {}) {
  const group = new THREE.Group();
  const h = width * (512 / 768);

  const face = new THREE.Mesh(geo.plane, new THREE.MeshLambertMaterial({
    map: boardTexture(title, lines, { ...(accent ? { accent } : {}), ta, taTitle }),
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

/**
 * A distribution board you can actually open and switch off.
 *
 * The door is hinged on a pivot group and the isolator handle is a
 * lever on its own pivot, so both can be animated: the door swings,
 * the handle throws from ON down to OFF, and the lamp goes from red
 * to green. Behind the door are busbars and a row of breakers, so
 * opening it reveals something rather than an empty box.
 *
 * Returns the parts a game needs to drive it:
 *   { group, door, lever, lamp, leverAnchor }
 * `leverAnchor` is where the player has to stand to reach the handle.
 */
export function buildIsolatorPanel(geo, mat, { width = 1.1, height = 2.0 } = {}) {
  const group = new THREE.Group();
  const bodyY = height / 2 + 0.3;

  // Plinth and enclosure.
  group.add(box(geo, mat.galv, width * 0.5, 0.3, 0.4, 0, 0.15, 0));
  group.add(box(geo, mat.steelDark, width, height, 0.36, 0, bodyY, 0));

  /* ---- the inside, revealed when the door opens ---- */
  const inner = new THREE.Group();
  inner.position.set(0, bodyY, 0.02);
  group.add(inner);
  inner.add(box(geo, mat.black, width - 0.14, height - 0.16, 0.02, 0, 0, 0.15, { shadow: false }));
  // Three copper busbars down the back.
  [-0.26, 0, 0.26].forEach((bx) => {
    inner.add(box(geo, mat.orange, 0.05, height - 0.44, 0.03, bx, 0, 0.16, { shadow: false }));
  });
  // Rows of breakers.
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5; c++) {
      inner.add(box(geo, mat.white, 0.08, 0.14, 0.05,
        -0.26 + c * 0.13, 0.42 - r * 0.22, 0.17, { shadow: false }));
    }
  }

  /* ---- the isolator handle ----
   * Pivoted at its top so it throws through 90 degrees: pointing up
   * is ON, pointing down is OFF, which is the way round every real
   * rotary isolator works. */
  const lever = new THREE.Group();
  lever.position.set(width * 0.3, bodyY - 0.45, 0.19);
  lever.add(cylinder(geo, mat.steel, 0.045, 0.1, 0, 0, 0.03, { rotX: Math.PI / 2 }));
  const handle = box(geo, mat.red, 0.075, 0.34, 0.075, 0, 0.17, 0.06);
  lever.add(handle);
  lever.add(box(geo, mat.black, 0.1, 0.1, 0.06, 0, 0.32, 0.06, { shadow: false }));
  group.add(lever);

  // ON / OFF marked beside the handle's two positions.
  group.add(box(geo, mat.white, 0.1, 0.05, 0.02, width * 0.3 - 0.16, bodyY - 0.1, 0.2, { shadow: false }));
  group.add(box(geo, mat.white, 0.1, 0.05, 0.02, width * 0.3 - 0.16, bodyY - 0.78, 0.2, { shadow: false }));

  /* ---- the door, hinged on the left edge ---- */
  const door = new THREE.Group();
  door.position.set(-width / 2, bodyY, 0.19);
  const leaf = box(geo, mat.steelDark, width, height - 0.04, 0.05, width / 2, 0, 0);
  door.add(leaf);
  const warn = new THREE.Mesh(geo.plane, new THREE.MeshLambertMaterial({
    map: signTexture("Danger 415V", "warning"), side: THREE.DoubleSide,
  }));
  warn.scale.set(width * 0.62, width * 0.47, 1);
  warn.position.set(width / 2, height * 0.22, 0.031);
  warn.castShadow = false;
  door.add(warn);
  door.add(box(geo, mat.galv, 0.07, 0.2, 0.06, width - 0.12, -0.2, 0.04, { shadow: false }));
  group.add(door);

  /* ---- live / isolated lamp ---- */
  const lamp = new THREE.Mesh(geo.sphere, new THREE.MeshBasicMaterial({ color: 0xea4f4f }));
  lamp.scale.setScalar(0.11);
  lamp.position.set(-width * 0.3, bodyY + height * 0.38, 0.21);
  group.add(lamp);

  return {
    group,
    door,
    lever,
    lamp,
    leverAnchor: new THREE.Vector3(width * 0.3, bodyY - 0.3, 0.9),
    height,
  };
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

/**
 * The PPE store: a rack you can see the kit ON.
 *
 * Every item is built to look like the thing it is — a hard hat with a
 * brim, a hi-vis with reflective bands, boots with a toe box, gloves,
 * and a harness on a hook — because the mission asks you to choose
 * your PPE and "a squashed sphere on a shelf" is not a choice you can
 * make by looking.
 */
export function buildPPEStation(geo, mat) {
  const group = new THREE.Group();

  // Open-fronted rack: back, sides, top rail.
  group.add(box(geo, mat.steelDark, 2.6, 0.08, 0.62, 0, 2.3, 0));
  group.add(box(geo, mat.galv, 2.6, 2.3, 0.06, 0, 1.15, -0.3, { shadow: false }));
  [-1.3, 1.3].forEach((sx) => {
    group.add(box(geo, mat.galv, 0.08, 2.3, 0.62, sx, 1.15, 0, { shadow: false }));
  });
  [0.52, 1.12, 1.72].forEach((y) => {
    group.add(box(geo, mat.galv, 2.5, 0.05, 0.58, 0, y, 0, { shadow: false }));
  });

  /* ---- top shelf: hard hats ---- */
  [mat.yellow, mat.white, mat.blue, mat.orange].forEach((hatMat, i) => {
    const hat = new THREE.Group();
    const dome = new THREE.Mesh(geo.sphere, hatMat);
    dome.scale.set(0.3, 0.2, 0.32);
    dome.position.y = 0.06;
    hat.add(dome);
    hat.add(cylinder(geo, hatMat, 0.19, 0.02, 0, 0, 0, { shadow: false }));
    hat.add(box(geo, hatMat, 0.2, 0.02, 0.09, 0, -0.002, 0.17, { shadow: false }));
    hat.position.set(-0.92 + i * 0.61, 1.78, 0.02);
    group.add(hat);
  });

  /* ---- middle shelf: hi-vis jackets on hangers ---- */
  for (let i = 0; i < 3; i++) {
    const x = -0.78 + i * 0.78;
    group.add(cylinder(geo, mat.galv, 0.012, 0.3, x, 1.98, 0, { shadow: false }));
    const jacket = new THREE.Group();
    jacket.add(box(geo, mat.hiVis, 0.46, 0.54, 0.11, 0, 0, 0));
    // Shoulders and the two reflective bands.
    jacket.add(box(geo, mat.hiVis, 0.56, 0.12, 0.11, 0, 0.21, 0, { shadow: false }));
    [0.08, -0.1].forEach((by) => {
      jacket.add(box(geo, mat.white, 0.47, 0.06, 0.12, 0, by, 0, { shadow: false }));
    });
    [-0.11, 0.11].forEach((bx) => {
      jacket.add(box(geo, mat.white, 0.05, 0.3, 0.12, bx, 0.06, 0, { shadow: false }));
    });
    jacket.position.set(x, 1.52, 0.04);
    group.add(jacket);
  }

  /* ---- lower shelf: safety boots, in pairs ---- */
  for (let p = 0; p < 3; p++) {
    [-0.07, 0.07].forEach((off) => {
      const boot = new THREE.Group();
      boot.add(box(geo, mat.black, 0.12, 0.17, 0.15, 0, 0.085, -0.02));
      boot.add(box(geo, mat.black, 0.13, 0.08, 0.26, 0, 0.04, 0.06));
      boot.add(box(geo, mat.steel, 0.12, 0.03, 0.08, 0, 0.015, 0.16, { shadow: false }));
      boot.position.set(-0.78 + p * 0.78 + off, 1.15, 0.05);
      group.add(boot);
    });
  }

  /* ---- bottom shelf: gloves, and a harness on the end post ---- */
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    g.add(box(geo, mat.black, 0.09, 0.13, 0.05, 0, 0, 0, { shadow: false }));
    g.add(box(geo, mat.black, 0.04, 0.06, 0.05, 0.05, 0.02, 0.01, { rotZ: 0.5, shadow: false }));
    g.position.set(-0.86 + i * 0.57, 0.6, 0.06);
    group.add(g);
  }
  const harness = new THREE.Group();
  [-0.09, 0.09].forEach((hx) => {
    harness.add(box(geo, mat.orange, 0.05, 0.5, 0.05, hx, 0, 0, { shadow: false }));
  });
  harness.add(box(geo, mat.orange, 0.26, 0.05, 0.05, 0, -0.14, 0, { shadow: false }));
  harness.add(box(geo, mat.steel, 0.08, 0.08, 0.04, 0, 0.2, 0, { shadow: false }));
  harness.position.set(1.12, 0.95, 0.22);
  group.add(harness);

  // Header board and the mandatory sign.
  group.add(box(geo, mat.blue, 2.6, 0.42, 0.08, 0, 2.55, 0.02, { shadow: false }));
  const sign = buildSign(geo, mat, {
    text: "PPE must be worn", kind: "mandatory", height: 2.56, width: 0.78, post: false,
  });
  sign.position.set(-0.85, 0, 0.07);
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
