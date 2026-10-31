/**
 * Headless browser harness for the Arena games.
 *
 * The games build real three.js scenes and run a real frame loop, so to
 * test them outside a browser we need just enough of the DOM, plus a
 * renderer stub injected through the test seam in engine/gfx.js.
 *
 * This deliberately stubs only what the Arena actually touches. If a
 * game starts using a new browser API, the harness will throw with a
 * clear "not stubbed" message rather than silently passing.
 */

/* ---------------------------- 2D context ---------------------------- */

function makeContext2D() {
  const noop = () => {};
  return {
    canvas: null,
    fillStyle: "", strokeStyle: "", lineWidth: 1, globalAlpha: 1,
    font: "", textAlign: "", textBaseline: "", lineCap: "", lineJoin: "",
    fillRect: noop, strokeRect: noop, clearRect: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    bezierCurveTo: noop, quadraticCurveTo: noop, arc: noop, ellipse: noop,
    rect: noop, stroke: noop, fill: noop, clip: noop,
    fillText: noop, strokeText: noop,
    measureText: () => ({ width: 10 }),
    save: noop, restore: noop,
    translate: noop, rotate: noop, scale: noop, setTransform: noop, transform: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({}),
    getImageData: (x, y, w = 1, h = 1) => ({
      data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h,
    }),
    putImageData: noop, drawImage: noop,
  };
}

/* ----------------------------- elements ----------------------------- */

let nextId = 1;

export function makeElement(tag = "div", { width = 1280, height = 720 } = {}) {
  const listeners = new Map();
  const element = {
    __id: nextId++,
    tagName: String(tag).toUpperCase(),
    nodeType: 1,
    style: { cssText: "", setProperty() {}, removeProperty() {} },
    dataset: {},
    children: [],
    parentNode: null,
    clientWidth: width,
    clientHeight: height,
    width,
    height,
    tabIndex: 0,
    isContentEditable: false,

    appendChild(child) {
      element.children.push(child);
      if (child) child.parentNode = element;
      return child;
    },
    removeChild(child) {
      const index = element.children.indexOf(child);
      if (index >= 0) element.children.splice(index, 1);
      if (child) child.parentNode = null;
      return child;
    },
    getBoundingClientRect() {
      return {
        left: 0, top: 0, right: element.clientWidth, bottom: element.clientHeight,
        width: element.clientWidth, height: element.clientHeight, x: 0, y: 0,
      };
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      listeners.get(type)?.delete(handler);
    },
    dispatch(type, event = {}) {
      const set = listeners.get(type);
      if (!set) return;
      [...set].forEach((handler) => handler({ type, preventDefault() {}, stopPropagation() {}, ...event }));
    },
    hasListener(type) {
      return (listeners.get(type)?.size || 0) > 0;
    },
    setPointerCapture() {},
    releasePointerCapture() {},
    requestPointerLock() { return undefined; },
    focus() {},
    getContext(kind) {
      if (kind === "2d") {
        const ctx = makeContext2D();
        ctx.canvas = element;
        return ctx;
      }
      // The renderer is stubbed, so nothing should ask for a GL context.
      return null;
    },
    toDataURL() { return "data:,"; },
    // three.js checks these on textures/images.
    nodeName: String(tag).toLowerCase(),
  };
  return element;
}

/* ----------------------------- renderer ----------------------------- */

/**
 * A WebGLRenderer stand-in with the surface createStage and the games
 * use. It records render calls so a test can assert the loop is running.
 */
export function makeRendererStub() {
  const domElement = makeElement("canvas");
  const stub = {
    domElement,
    renderCount: 0,
    disposed: false,
    shadowMap: { enabled: false, type: 0, mapSize: { set() {} } },
    outputColorSpace: "",
    toneMapping: 0,
    toneMappingExposure: 1,
    capabilities: { isWebGL2: true, maxTextureSize: 4096, getMaxAnisotropy: () => 4 },
    info: { render: {}, memory: {} },
    setPixelRatio() {},
    setSize(w, h) { domElement.width = w; domElement.height = h; },
    getContext() {
      return {
        getExtension() { return null; },
        getParameter() { return 0; },
      };
    },
    // Keep what we were handed. It is the only way a test can see the
    // REAL camera and scene a game is drawing with, without every game
    // having to export them through its __test seam.
    lastScene: null,
    lastCamera: null,
    render(scene, camera) {
      stub.renderCount += 1;
      stub.lastScene = scene || stub.lastScene;
      stub.lastCamera = camera || stub.lastCamera;
    },
    dispose() { stub.disposed = true; },
    clear() {},
    setClearColor() {},
    setAnimationLoop() {},
    compile() {},
  };
  return stub;
}

/* ------------------------------ globals ------------------------------ */

let rafQueue = [];
let rafNext = 1;
let installed = false;
let timeMs = 0;

export function installDom({ width = 1280, height = 720, touch = false } = {}) {
  if (installed) return;
  installed = true;
  timeMs = 0;
  rafQueue = [];

  const windowListeners = new Map();
  const documentListeners = new Map();

  const documentStub = {
    hidden: false,
    pointerLockElement: null,
    fullscreenEnabled: false,
    fullscreenElement: null,
    documentElement: makeElement("html", { width, height }),
    body: makeElement("body", { width, height }),
    createElement: (tag) => makeElement(tag, { width: 256, height: 256 }),
    createElementNS: (ns, tag) => makeElement(tag, { width: 256, height: 256 }),
    addEventListener(type, handler) {
      if (!documentListeners.has(type)) documentListeners.set(type, new Set());
      documentListeners.get(type).add(handler);
    },
    removeEventListener(type, handler) { documentListeners.get(type)?.delete(handler); },
    dispatch(type, event = {}) {
      [...(documentListeners.get(type) || [])].forEach((h) => h({ type, preventDefault() {}, ...event }));
    },
    exitPointerLock() { documentStub.pointerLockElement = null; },
    exitFullscreen() {},
  };

  const windowStub = {
    devicePixelRatio: 2,
    innerWidth: width,
    innerHeight: height,
    screen: { width, height },
    location: { search: "", href: "http://localhost/" },
    navigator: undefined, // set below from globalThis.navigator
    addEventListener(type, handler) {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set());
      windowListeners.get(type).add(handler);
    },
    removeEventListener(type, handler) { windowListeners.get(type)?.delete(handler); },
    dispatch(type, event = {}) {
      [...(windowListeners.get(type) || [])].forEach((h) => h({ type, preventDefault() {}, ...event }));
    },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    // Deliberately absent: AudioContext. audio.js must stay silent and
    // must not throw when it cannot create one.
  };
  if (touch) windowStub.ontouchstart = null;

  globalThis.window = windowStub;
  globalThis.document = documentStub;
  globalThis.self = windowStub;
  // Node exposes `navigator` as a getter-only global, so it cannot be
  // replaced — define the properties the Arena reads onto the existing
  // object instead, falling back to a plain stub if even that is denied.
  let navigatorStub = globalThis.navigator;
  if (!navigatorStub) navigatorStub = {};
  try {
    Object.defineProperty(navigatorStub, "hardwareConcurrency", { value: 8, configurable: true });
    Object.defineProperty(navigatorStub, "maxTouchPoints", { value: touch ? 5 : 0, configurable: true });
  } catch {
    navigatorStub = { hardwareConcurrency: 8, maxTouchPoints: touch ? 5 : 0 };
  }
  windowStub.navigator = navigatorStub;

  globalThis.requestAnimationFrame = (cb) => {
    const id = rafNext++;
    rafQueue.push({ id, cb });
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => {
    rafQueue = rafQueue.filter((entry) => entry.id !== id);
  };

  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  globalThis.createImageBitmap = async () => ({});

  return { window: windowStub, document: documentStub };
}

export function uninstallDom() {
  installed = false;
  rafQueue = [];
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.self;
  delete globalThis.requestAnimationFrame;
  delete globalThis.cancelAnimationFrame;
  delete globalThis.ResizeObserver;
  delete globalThis.createImageBitmap;
}

/**
 * Runs `frames` animation frames at a fixed timestep, which is what
 * drives a game's real update loop.
 */
export function runFrames(frames, stepMs = 1000 / 60) {
  for (let i = 0; i < frames; i++) {
    const queue = rafQueue;
    rafQueue = [];
    timeMs += stepMs;
    queue.forEach(({ cb }) => cb(timeMs));
    if (!queue.length) break; // nothing is driving the loop any more
  }
}

export function pendingFrames() {
  return rafQueue.length;
}

/* ------------------------------ fake api ------------------------------ */

/**
 * Stands in for the GameShell api object, recording everything a game
 * reports so tests can assert on it.
 */
export function makeApi() {
  const record = {
    hud: {},
    hudUpdates: 0,
    toasts: [],
    dialog: null,
    dialogs: [],
    buttons: [],
    finished: null,
    pauseRequests: 0,
  };
  const api = {
    hud(partial) {
      Object.assign(record.hud, partial);
      record.hudUpdates += 1;
    },
    toast(text, kind = "info", points) {
      record.toasts.push({ text, kind, points });
    },
    dialog(next) {
      record.dialog = next;
      if (next) record.dialogs.push(next);
    },
    buttons(list) { record.buttons = list || []; },
    requestPause() { record.pauseRequests += 1; },
    finish(result) { if (!record.finished) record.finished = result; },
  };
  return { api, record };
}

/** Difficulty objects matching arenaConstants, without importing React. */
export const DIFFICULTY = {
  easy: { id: "easy", label: "Trainee", color: "#33C481", timeScale: 1.45, scoreScale: 0.85, hints: true, penaltyScale: 0.5 },
  normal: { id: "normal", label: "Site Officer", color: "#FFC629", timeScale: 1, scoreScale: 1, hints: false, penaltyScale: 1 },
  hard: { id: "hard", label: "Safety Manager", color: "#EA4F4F", timeScale: 0.72, scoreScale: 1.3, hints: false, penaltyScale: 1.5 },
};

export const SETTINGS = {
  quality: "medium", sound: false, volume: 0, lookSensitivity: 1, invertY: false,
};
