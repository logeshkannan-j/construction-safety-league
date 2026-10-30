/* ------------------------------------------------------------------ *
 *  ARENA ENGINE — unified input
 *
 *  One input object that the game loop reads every frame, fed from
 *  three different sources:
 *
 *    desktop   keyboard (WASD/arrows) + mouse look (pointer lock, with
 *              a click-drag fallback when lock is unavailable/denied)
 *    touch     the React virtual joystick and touch-look pad write
 *              directly into this object via setJoystick()/addLook()
 *    buttons   on-screen action buttons call press()/release(), which
 *              produce exactly the same edges as a keypress
 *
 *  Because all three write the same fields, every game is written once
 *  against this interface and is automatically playable on phone,
 *  tablet, laptop and desktop.
 *
 *  Keyboard listeners are attached ONLY while a game is mounted and are
 *  removed on dispose, so Arena hotkeys can never interfere with normal
 *  typing or navigation elsewhere on the site.
 * ------------------------------------------------------------------ */

// Default key -> action map. Games can extend or replace entries.
export const DEFAULT_KEYMAP = {
  KeyE: "interact",
  Space: "jump",
  ShiftLeft: "run",
  ShiftRight: "run",
  KeyC: "crouch",
  ControlLeft: "crouch",
  KeyQ: "inspect",
  KeyF: "pickup",
  KeyR: "report",
  Escape: "pause",
  Digit1: "slot1",
  Digit2: "slot2",
  Digit3: "slot3",
  Digit4: "slot4",
  KeyX: "stop",
  Enter: "confirm",
  Tab: "cycle",
};

const MOVE_KEYS = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

/**
 * @param {HTMLElement} element the game container (receives mouse/touch)
 * @param {object} opts { keymap, pointerLock, onPause }
 */
export function createInput(element, opts = {}) {
  const keymap = { ...DEFAULT_KEYMAP, ...(opts.keymap || {}) };
  const usePointerLock = opts.pointerLock !== false;

  const keysDown = new Set();       // raw key codes currently held
  const held = new Set();           // action names currently held
  const pressedQueue = new Set();   // action names pressed since last consume
  const releasedQueue = new Set();

  const state = {
    // -1..1 movement axes. x = strafe, y = forward.
    moveX: 0,
    moveY: 0,
    // Accumulated look delta in pixels, consumed by the camera each frame.
    lookDX: 0,
    lookDY: 0,
    joystickActive: false,
    pointerLocked: false,
    enabled: true,
    lookSensitivity: 1,
    invertY: false,
    // Raw pointer position in normalised device coords, for pick games.
    ndc: { x: 0, y: 0 },
    hasPointer: false,
  };

  // Keyboard axes kept separate from the joystick so one does not wipe
  // out the other (a tablet user may use both).
  let keyMoveX = 0;
  let keyMoveY = 0;
  let joyX = 0;
  let joyY = 0;

  function recomputeMove() {
    const x = joyX !== 0 || joyY !== 0 ? joyX : keyMoveX;
    const y = joyX !== 0 || joyY !== 0 ? joyY : keyMoveY;
    const len = Math.hypot(x, y);
    if (len > 1) {
      state.moveX = x / len;
      state.moveY = y / len;
    } else {
      state.moveX = x;
      state.moveY = y;
    }
  }

  function recomputeKeyAxes() {
    let x = 0;
    let y = 0;
    Object.entries(MOVE_KEYS).forEach(([code, [ax, ay]]) => {
      if (keysDown.has(code)) { x += ax; y += ay; }
    });
    keyMoveX = Math.max(-1, Math.min(1, x));
    keyMoveY = Math.max(-1, Math.min(1, y));
    recomputeMove();
  }

  /* --------------------------- keyboard --------------------------- */

  function onKeyDown(e) {
    if (!state.enabled) return;
    // Never swallow keys while the player is typing in a form field
    // (the pause menu and name fields are real inputs).
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target && e.target.isContentEditable)) return;

    const code = e.code;
    if (MOVE_KEYS[code] || keymap[code]) {
      // Stop the page scrolling on space/arrows while playing.
      if (code === "Space" || code.startsWith("Arrow") || code === "Tab") e.preventDefault();
    }
    if (keysDown.has(code)) return; // ignore auto-repeat
    keysDown.add(code);
    if (MOVE_KEYS[code]) recomputeKeyAxes();
    const action = keymap[code];
    if (action) {
      held.add(action);
      pressedQueue.add(action);
      if (action === "pause" && opts.onPause) opts.onPause();
    }
  }

  function onKeyUp(e) {
    const code = e.code;
    if (!keysDown.has(code)) return;
    keysDown.delete(code);
    if (MOVE_KEYS[code]) recomputeKeyAxes();
    const action = keymap[code];
    if (action) {
      // Only clear the held flag if no other key maps to the same action.
      const stillHeld = Object.entries(keymap).some(([c, a]) => a === action && keysDown.has(c));
      if (!stillHeld) {
        held.delete(action);
        releasedQueue.add(action);
      }
    }
  }

  function onBlur() {
    // Window lost focus: release everything so the player doesn't come
    // back to a character sprinting into a wall.
    keysDown.clear();
    held.clear();
    keyMoveX = 0;
    keyMoveY = 0;
    recomputeMove();
  }

  /* ---------------------------- mouse ---------------------------- */

  let dragging = false;
  let downAt = null;
  let dragDistance = 0;

  function onPointerDown(e) {
    if (!state.enabled) return;
    if (e.pointerType === "touch") return; // touch handled by the HUD
    state.hasPointer = true;
    updateNdc(e);
    downAt = { x: e.clientX, y: e.clientY };
    dragDistance = 0;
    if (usePointerLock && !state.pointerLocked && e.button === 0) {
      requestLock();
    } else if (!usePointerLock && e.button === 0) {
      dragging = true;
      try { element.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
  }

  function onPointerUp(e) {
    if (e.pointerType === "touch") return;
    dragging = false;
    try { element.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    // A press that barely moved is a click on the world, not a camera
    // drag. Games that place objects poll for this as the "tap" action.
    if (downAt && dragDistance < 8 && state.enabled) {
      registerTap(e.clientX, e.clientY);
    }
    downAt = null;
  }

  /**
   * Reports a tap/click at screen coordinates. Called by onPointerUp for
   * mouse input and by the touch-look pad for fingers, so both produce
   * the identical "tap" action plus a normalised pick position.
   */
  function registerTap(clientX, clientY) {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    state.ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    state.ndc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    state.hasPointer = true;
    pressedQueue.add("tap");
  }

  function updateNdc(e) {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    state.ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    state.ndc.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  }

  function onPointerMove(e) {
    if (!state.enabled) return;
    if (e.pointerType === "touch") return;
    state.hasPointer = true;
    updateNdc(e);
    if (state.pointerLocked || dragging) {
      state.lookDX += e.movementX || 0;
      state.lookDY += e.movementY || 0;
      dragDistance += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
    }
  }

  function onWheel(e) {
    if (!state.enabled) return;
    state.wheel = (state.wheel || 0) + e.deltaY;
    e.preventDefault();
  }

  /* ------------------------- pointer lock ------------------------- */

  function requestLock() {
    if (!usePointerLock) return;
    try {
      const p = element.requestPointerLock?.({ unadjustedMovement: false });
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch { /* Safari older versions reject the options object */
      try { element.requestPointerLock?.(); } catch { /* ignore */ }
    }
  }

  function exitLock() {
    try { if (document.pointerLockElement === element) document.exitPointerLock(); } catch { /* ignore */ }
  }

  function onLockChange() {
    state.pointerLocked = document.pointerLockElement === element;
  }

  /* ------------------- block unwanted page gestures ------------------- */

  // Stops pull-to-refresh, rubber-band scrolling and double-tap zoom
  // from firing while a finger is on the play area. The HUD controls
  // also set touch-action:none, but this is the belt-and-braces layer
  // iOS Safari needs.
  function onTouchMove(e) {
    if (!state.enabled) return;
    if (e.cancelable) e.preventDefault();
  }
  function onContextMenu(e) { e.preventDefault(); }
  function onGesture(e) { e.preventDefault(); }

  /* ------------------------- attach / detach ------------------------- */

  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  document.addEventListener("pointerlockchange", onLockChange);
  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("pointerup", onPointerUp);
  element.addEventListener("pointermove", onPointerMove);
  element.addEventListener("wheel", onWheel, { passive: false });
  element.addEventListener("touchmove", onTouchMove, { passive: false });
  element.addEventListener("contextmenu", onContextMenu);
  element.addEventListener("gesturestart", onGesture);
  element.addEventListener("gesturechange", onGesture);

  const input = {
    state,

    /* ---- read, called from the game loop ---- */

    /** Consumes accumulated look delta (pixels), applying sensitivity. */
    consumeLook() {
      const sens = state.lookSensitivity;
      const dx = state.lookDX * sens;
      const dy = state.lookDY * sens * (state.invertY ? -1 : 1);
      state.lookDX = 0;
      state.lookDY = 0;
      return { dx, dy };
    },

    consumeWheel() {
      const w = state.wheel || 0;
      state.wheel = 0;
      return w;
    },

    /** True once per press. */
    wasPressed(action) {
      return pressedQueue.has(action);
    },

    isHeld(action) {
      return held.has(action);
    },

    isKeyDown(code) {
      return keysDown.has(code);
    },

    /** Call at the END of each frame to clear edge-triggered sets. */
    endFrame() {
      pressedQueue.clear();
      releasedQueue.clear();
    },

    /* ---- write, called from the React HUD ---- */

    /** x/y in -1..1; y positive = forward. */
    setJoystick(x, y) {
      joyX = Math.max(-1, Math.min(1, Number(x) || 0));
      joyY = Math.max(-1, Math.min(1, Number(y) || 0));
      state.joystickActive = joyX !== 0 || joyY !== 0;
      recomputeMove();
    },

    /** Touch-look pad reports movement in pixels. */
    addLook(dx, dy) {
      state.lookDX += Number(dx) || 0;
      state.lookDY += Number(dy) || 0;
    },

    /** Touch-look pad reports a tap that was not a drag. */
    registerTap,

    press(action) {
      if (!action) return;
      held.add(action);
      pressedQueue.add(action);
      if (action === "pause" && opts.onPause) opts.onPause();
    },

    release(action) {
      if (!action) return;
      held.delete(action);
      releasedQueue.add(action);
    },

    /** Fire-and-forget tap from an on-screen button. */
    tap(action) {
      input.press(action);
      // Released on the next frame boundary by the game loop's endFrame,
      // but clear the held flag immediately so it reads as a tap.
      setTimeout(() => input.release(action), 0);
    },

    /* ---- control ---- */

    setEnabled(value) {
      state.enabled = !!value;
      if (!value) {
        onBlur();
        joyX = 0;
        joyY = 0;
        state.joystickActive = false;
        state.lookDX = 0;
        state.lookDY = 0;
        recomputeMove();
        exitLock();
      }
    },

    setSensitivity(value) {
      state.lookSensitivity = Math.max(0.2, Math.min(3, Number(value) || 1));
    },

    setInvertY(value) { state.invertY = !!value; },

    requestLock,
    exitLock,
    get pointerLocked() { return state.pointerLocked; },

    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("pointerlockchange", onLockChange);
      element.removeEventListener("pointerdown", onPointerDown);
      element.removeEventListener("pointerup", onPointerUp);
      element.removeEventListener("pointermove", onPointerMove);
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("contextmenu", onContextMenu);
      element.removeEventListener("gesturestart", onGesture);
      element.removeEventListener("gesturechange", onGesture);
      exitLock();
      keysDown.clear();
      held.clear();
      pressedQueue.clear();
    },
  };

  return input;
}
