/* ------------------------------------------------------------------ *
 *  ARENA ENGINE — graphics core
 *
 *  One place that owns: WebGL capability detection, the three quality
 *  tiers, renderer creation/teardown, resize handling, the frame loop,
 *  and GPU resource disposal. Every game builds on this so mobile
 *  performance work only has to be done once.
 * ------------------------------------------------------------------ */

import * as THREE from "three";

/* ------------------------- capability checks ------------------------- */

let webglCache = null;

export function supportsWebGL() {
  if (webglCache !== null) return webglCache;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    webglCache = !!gl;
    // Free the probe context immediately; mobile browsers cap the number
    // of live WebGL contexts and we only need the yes/no answer.
    if (gl && gl.getExtension) {
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    }
  } catch {
    webglCache = false;
  }
  return webglCache;
}

export function isTouchDevice() {
  return typeof window !== "undefined" && (
    "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0
  );
}

export function isMobileLayout() {
  if (typeof window === "undefined") return false;
  return isTouchDevice() && Math.min(window.innerWidth, window.innerHeight) < 820;
}

/**
 * Picks a starting quality tier from what the device tells us about
 * itself. Players can always override this in Settings.
 */
export function detectQuality() {
  if (typeof navigator === "undefined") return "medium";
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 0; // Chrome only
  const touch = isTouchDevice();
  const dpr = window.devicePixelRatio || 1;
  const pixels = window.screen ? window.screen.width * window.screen.height * dpr * dpr : 1e6;

  if (touch) {
    if (cores <= 4 || (memory && memory <= 3) || pixels > 4.5e6) return "low";
    if (cores <= 6) return "medium";
    return "medium"; // phones cap at medium by default; High is opt-in
  }
  if (cores <= 4) return "medium";
  return "high";
}

export const QUALITY_PRESETS = {
  low: {
    maxPixelRatio: 1,
    antialias: false,
    shadows: false,
    shadowMapSize: 0,
    shadowType: THREE.BasicShadowMap,
    fog: true,
    anisotropy: 1,
    maxLights: 1,
    drawDistance: 120,
    segments: 6,
  },
  medium: {
    maxPixelRatio: 1.5,
    antialias: false,
    shadows: true,
    shadowMapSize: 1024,
    shadowType: THREE.PCFShadowMap,
    fog: true,
    anisotropy: 2,
    maxLights: 2,
    drawDistance: 220,
    segments: 10,
  },
  high: {
    maxPixelRatio: 2,
    antialias: true,
    shadows: true,
    shadowMapSize: 2048,
    shadowType: THREE.PCFSoftShadowMap,
    fog: true,
    anisotropy: 4,
    maxLights: 3,
    drawDistance: 400,
    segments: 16,
  },
};

export function resolveQuality(setting) {
  if (setting === "low" || setting === "medium" || setting === "high") return setting;
  return detectQuality();
}

export function preset(quality) {
  return QUALITY_PRESETS[quality] || QUALITY_PRESETS.medium;
}

/* ---------------------------- the stage ---------------------------- */

/**
 * Test seam. The games build their worlds through createStage, which
 * needs a real WebGL context — so without this there is no way to run a
 * game's actual world construction and update loop outside a browser.
 *
 * `tests/arena-games.test.mjs` swaps in a renderer stub and then drives
 * every game's real `create()` and real frame loop headlessly, which is
 * how the games get tested at all in CI. Nothing in the app calls this.
 */
let rendererFactory = null;

export function __setRendererFactory(factory) {
  rendererFactory = factory;
}

function createRenderer(options) {
  if (rendererFactory) return rendererFactory(options);
  return new THREE.WebGLRenderer(options);
}

/**
 * Creates a renderer + scene + camera bound to `container`, wired for
 * resize and context loss.
 *
 * Returns a Stage object:
 *   { renderer, scene, camera, quality, cfg, size,
 *     start(fn), stop(), setPaused(b), setQuality(q), dispose() }
 *
 * `fn` receives (dt, elapsed) in seconds. dt is clamped so a backgrounded
 * tab can never produce a single giant physics step.
 */
export function createStage(container, { quality = "medium", fov = 70, near = 0.1 } = {}) {
  const cfg = preset(quality);

  const renderer = createRenderer({
    antialias: cfg.antialias,
    powerPreference: "high-performance",
    alpha: false,
    stencil: false,
    depth: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.maxPixelRatio));
  renderer.setSize(container.clientWidth || 1, container.clientHeight || 1, false);
  renderer.shadowMap.enabled = cfg.shadows;
  renderer.shadowMap.type = cfg.shadowType;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:none;outline:none";
  renderer.domElement.tabIndex = -1;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    fov,
    (container.clientWidth || 1) / (container.clientHeight || 1),
    near,
    cfg.drawDistance
  );

  const state = {
    running: false,
    paused: false,
    rafId: 0,
    last: 0,
    elapsed: 0,
    tick: null,
    disposed: false,
    contextLost: false,
  };

  function resize() {
    if (state.disposed) return;
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  let observer = null;
  if (typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(resize);
    observer.observe(container);
  }
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);

  function onContextLost(e) {
    e.preventDefault();
    state.contextLost = true;
  }
  function onContextRestored() {
    state.contextLost = false;
    resize();
  }
  renderer.domElement.addEventListener("webglcontextlost", onContextLost, false);
  renderer.domElement.addEventListener("webglcontextrestored", onContextRestored, false);

  function frame(now) {
    if (!state.running || state.disposed) return;
    state.rafId = requestAnimationFrame(frame);
    if (state.contextLost) return;

    const nowSec = now / 1000;
    if (!state.last) state.last = nowSec;
    // Clamp to 100ms: a tab that was hidden for 30s must not advance
    // physics by 30s on the first frame back.
    const dt = Math.min(0.1, Math.max(0, nowSec - state.last));
    state.last = nowSec;
    if (state.paused) {
      renderer.render(scene, camera);
      return;
    }
    state.elapsed += dt;
    if (state.tick) {
      try {
        state.tick(dt, state.elapsed);
      } catch (err) {
        console.error("[arena] frame error", err);
      }
    }
    renderer.render(scene, camera);
  }

  const stage = {
    renderer,
    scene,
    camera,
    quality,
    cfg,
    get elapsed() { return state.elapsed; },
    get isPaused() { return state.paused; },
    resize,

    start(tick) {
      state.tick = tick;
      if (state.running) return;
      state.running = true;
      state.last = 0;
      state.rafId = requestAnimationFrame(frame);
    },

    stop() {
      state.running = false;
      if (state.rafId) cancelAnimationFrame(state.rafId);
      state.rafId = 0;
    },

    setPaused(value) {
      state.paused = !!value;
      // Reset the clock so unpausing doesn't produce a catch-up step.
      state.last = 0;
    },

    dispose() {
      if (state.disposed) return;
      state.disposed = true;
      stage.stop();
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", onContextRestored);
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
      if (observer) observer.disconnect();
      disposeScene(scene);
      renderer.dispose();
      try {
        const gl = renderer.getContext();
        const lose = gl && gl.getExtension && gl.getExtension("WEBGL_lose_context");
        if (lose) lose.loseContext();
      } catch { /* ignore */ }
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    },
  };

  resize();
  return stage;
}

/* ------------------------- resource disposal ------------------------- */

/**
 * Walks a scene (or any Object3D) and releases every geometry, material
 * and texture. Called on unmount — without this, repeatedly entering and
 * leaving games leaks GPU memory until the browser kills the context,
 * which on mobile means a black screen after a few replays.
 */
export function disposeScene(root) {
  if (!root) return;
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  root.traverse((obj) => {
    if (obj.geometry) geometries.add(obj.geometry);
    const m = obj.material;
    if (Array.isArray(m)) m.forEach((x) => x && materials.add(x));
    else if (m) materials.add(m);
  });

  materials.forEach((mat) => {
    Object.values(mat).forEach((value) => {
      if (value && value.isTexture) textures.add(value);
    });
  });

  textures.forEach((t) => { try { t.dispose(); } catch { /* ignore */ } });
  materials.forEach((m) => { try { m.dispose(); } catch { /* ignore */ } });
  geometries.forEach((g) => { try { g.dispose(); } catch { /* ignore */ } });

  // Detach children so nothing keeps the scene graph alive.
  while (root.children.length) root.remove(root.children[0]);
}

/* ---------------------------- lighting ---------------------------- */

/**
 * Standard daylight rig for the outdoor construction sites, tuned per
 * quality tier. Returns the directional light so a game can move the
 * shadow frustum with the player if it needs to.
 */
export function addDaylight(scene, cfg, { intensity = 2.1, shadowRadius = 60 } = {}) {
  const hemi = new THREE.HemisphereLight(0xbfd9ea, 0x6b6253, 1.15);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff3dc, intensity);
  sun.position.set(42, 68, 30);
  if (cfg.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(cfg.shadowMapSize, cfg.shadowMapSize);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 220;
    sun.shadow.camera.left = -shadowRadius;
    sun.shadow.camera.right = shadowRadius;
    sun.shadow.camera.top = shadowRadius;
    sun.shadow.camera.bottom = -shadowRadius;
    sun.shadow.bias = -0.0015;
    sun.shadow.normalBias = 0.035;
  }
  scene.add(sun);
  // The target must be in the graph for a game to steer the shadow
  // frustum by moving it.
  scene.add(sun.target);

  if (cfg.maxLights >= 2) {
    // Cool bounce from the sky on the shadow side, no shadow cost.
    const fill = new THREE.DirectionalLight(0x9ec4e8, 0.45);
    fill.position.set(-40, 30, -25);
    scene.add(fill);
  }
  return sun;
}

/** Indoor rig for the escape rooms — dimmer, warmer, moodier. */
export function addIndoorLight(scene, cfg, { color = 0xffe6bd, intensity = 0.9 } = {}) {
  const ambient = new THREE.HemisphereLight(0x5a6472, 0x24201c, 0.75);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(color, intensity);
  key.position.set(8, 22, 10);
  if (cfg.shadows) {
    key.castShadow = true;
    key.shadow.mapSize.set(Math.min(1024, cfg.shadowMapSize), Math.min(1024, cfg.shadowMapSize));
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 90;
    key.shadow.camera.left = -30;
    key.shadow.camera.right = 30;
    key.shadow.camera.top = 30;
    key.shadow.camera.bottom = -30;
    key.shadow.normalBias = 0.04;
  }
  scene.add(key);
  return key;
}

/* ------------------------------ sky ------------------------------ */

/**
 * Vertical-gradient sky on the inside of a large sphere. One 32x256
 * canvas texture — far cheaper on a phone than a cubemap or a shader
 * sky, and it reads as a real sky at these camera angles.
 */
export function addSky(scene, cfg, {
  top = "#2C6FA8", bottom = "#CFE3F2", fogColor = "#C2D8E8",
  clouds = true, sun = true,
} = {}) {
  // A 32px-wide strip gave a clean gradient and nothing else — every
  // mission's sky was a flat wash. This paints a real sky: banded haze
  // towards the horizon, a soft sun bloom and layered cloud. It is one
  // canvas, drawn once per scene, so it costs nothing per frame.
  const W = clouds ? 512 : 32;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(0.42, blendHex(top, bottom, 0.55));
  grad.addColorStop(0.72, bottom);
  grad.addColorStop(1, bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, 256);

  if (clouds) {
    // Sun bloom, low and to one side so the shadows have a story.
    if (sun) {
      const sx = W * 0.68;
      const sy = 64;
      const halo = g.createRadialGradient(sx, sy, 2, sx, sy, 120);
      halo.addColorStop(0, "rgba(255,252,240,0.95)");
      halo.addColorStop(0.18, "rgba(255,246,219,0.45)");
      halo.addColorStop(1, "rgba(255,246,219,0)");
      g.fillStyle = halo;
      g.fillRect(sx - 130, sy - 130, 260, 260);
    }

    // Two cloud layers: soft high cloud, then brighter cumulus below.
    const puff = (cx, cy, r, alpha) => {
      const c = g.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
      c.addColorStop(0, `rgba(255,255,255,${alpha})`);
      c.addColorStop(0.6, `rgba(255,255,255,${alpha * 0.45})`);
      c.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = c;
      g.fillRect(cx - r, cy - r, r * 2, r * 2);
    };
    // Deterministic placement — the sky must not flicker between plays.
    for (let i = 0; i < 26; i++) {
      const cx = ((i * 97) % W);
      const cy = 30 + ((i * 53) % 90);
      puff(cx, cy, 26 + ((i * 17) % 34), 0.30);
    }
    for (let i = 0; i < 16; i++) {
      const cx = ((i * 151) % W);
      const cy = 86 + ((i * 41) % 54);
      puff(cx, cy, 34 + ((i * 23) % 40), 0.50);
    }

    // Horizon haze band, which is what makes distance read as distance.
    const haze = g.createLinearGradient(0, 150, 0, 256);
    haze.addColorStop(0, "rgba(255,255,255,0)");
    haze.addColorStop(1, hexToRgba(fogColor, 0.9));
    g.fillStyle = haze;
    g.fillRect(0, 150, W, 106);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(cfg.drawDistance * 0.92, clouds ? 32 : 16, clouds ? 18 : 10),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, depthWrite: false, fog: false })
  );
  sphere.name = "sky";
  scene.add(sphere);

  if (cfg.fog) {
    scene.fog = new THREE.Fog(new THREE.Color(fogColor), cfg.drawDistance * 0.35, cfg.drawDistance * 0.85);
  }
  return sphere;
}

/* ------------------------------ zooming ------------------------------ */

/**
 * Field-of-view zoom for the first-person and cab views, driven by the
 * mouse wheel on desktop and pinch on a phone (both arrive through
 * input.consumeWheel()).
 *
 * The orbit games zoom by pulling the camera in and out; a first-person
 * camera cannot do that without walking through walls, so it narrows the
 * lens instead — which is also what "look closer at that thing across
 * the site" actually means.
 *
 * Returns an object with update(dt) to call each frame, plus toggle()
 * and reset() for an on-screen ZOOM button.
 */
export function createZoom(camera, input, {
  baseFov = camera.fov,
  minFov = 22,
  step = 0.055,
  // How far the toggle button jumps, as a fraction of the full range.
  toggleTo = 0.75,
  onChange = null,
} = {}) {
  let targetFov = baseFov;
  let currentFov = baseFov;

  function clamp(v) {
    return Math.max(minFov, Math.min(baseFov, v));
  }

  return {
    get fov() { return currentFov; },
    /** 0 = no zoom, 1 = fully zoomed in. */
    get amount() {
      return baseFov === minFov ? 0 : (baseFov - currentFov) / (baseFov - minFov);
    },
    get zoomed() { return currentFov < baseFov - 0.5; },

    update(dt) {
      const wheel = input.consumeWheel();
      if (wheel) targetFov = clamp(targetFov + wheel * step);

      if (Math.abs(currentFov - targetFov) > 0.01) {
        // Ease rather than snap: a hard FOV jump is nauseating.
        currentFov += (targetFov - currentFov) * Math.min(1, dt * 9);
        camera.fov = currentFov;
        camera.updateProjectionMatrix();
        onChange?.(this.amount);
      }
    },

    toggle() {
      const zoomedFov = baseFov - (baseFov - minFov) * toggleTo;
      targetFov = this.zoomed ? baseFov : zoomedFov;
    },

    reset() { targetFov = baseFov; },

    /** Lets a game widen the base FOV when it switches view. */
    setBaseFov(fov) {
      baseFov = fov;
      targetFov = clamp(targetFov);
    },
  };
}

/* ---------------------------- colour maths ---------------------------- */

function parseHex(hex) {
  const h = String(hex).replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Mixes two hex colours; t = 0 gives `a`, t = 1 gives `b`. */
function blendHex(a, b, t) {
  const x = parseHex(a);
  const y = parseHex(b);
  const mix = (p, q) => Math.round(p + (q - p) * t);
  return `rgb(${mix(x.r, y.r)}, ${mix(x.g, y.g)}, ${mix(x.b, y.b)})`;
}

function hexToRgba(hex, alpha) {
  const { r, g, b } = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* --------------------------- misc helpers --------------------------- */

/** Mobile-safe raycast from the centre of the screen (the crosshair). */
export function centerRaycast(camera, targets, maxDistance = 6) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = maxDistance;
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits = raycaster.intersectObjects(targets, true);
  return hits.length ? hits[0] : null;
}

export function screenRaycast(camera, ndc, targets, maxDistance = 400) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = maxDistance;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(targets, true);
  return hits.length ? hits[0] : null;
}

/** Walks up the parent chain to the nearest object carrying userData[key]. */
export function findTagged(object, key = "interactId") {
  let node = object;
  while (node) {
    if (node.userData && node.userData[key] !== undefined) return node;
    node = node.parent;
  }
  return null;
}

export { THREE };
