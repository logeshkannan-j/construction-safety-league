import React, { useCallback, useEffect, useRef, useState } from "react";
import { C } from "../arenaConstants.js";

/* ------------------------------------------------------------------ *
 *  TOUCH LOOK PAD
 *
 *  The right-hand half of the screen is a camera pad. Dragging rotates
 *  the camera (left/right = yaw, up/down = pitch) by feeding pixel
 *  deltas into the engine's input object — the exact same channel the
 *  desktop mouse uses, so look behaviour is identical on both.
 *
 *  Because it tracks its own pointerId and uses pointer capture, a
 *  finger on this pad works at the same time as a finger on the
 *  joystick: moving and looking simultaneously, which is what makes the
 *  games actually playable on a phone.
 *
 *  The pad sits BEHIND the action buttons in z-order and those buttons
 *  stop propagation, so tapping INTERACT never jerks the camera.
 * ------------------------------------------------------------------ */

export default function TouchLook({ input, sensitivity = 1, children, showHint = true }) {
  const pointerIdRef = useRef(null);
  const lastRef = useRef({ x: 0, y: 0 });
  const movedRef = useRef(0);
  // Every live finger on the pad, so a second one can start a pinch.
  const pointsRef = useRef(new Map());
  const pinchRef = useRef(null);
  const [hintVisible, setHintVisible] = useState(showHint);

  const release = useCallback(() => {
    pointerIdRef.current = null;
  }, []);

  function spread() {
    const pts = [...pointsRef.current.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  function onPointerDown(e) {
    pointsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Second finger down: switch from looking to pinch-zooming.
    if (pointsRef.current.size === 2) {
      pinchRef.current = spread();
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      e.preventDefault();
      return;
    }

    if (pointerIdRef.current !== null) return;
    pointerIdRef.current = e.pointerId;
    lastRef.current = { x: e.clientX, y: e.clientY };
    movedRef.current = 0;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (hintVisible) setHintVisible(false);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (pointsRef.current.has(e.pointerId)) {
      pointsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Pinching: feed the change in finger spread to the same zoom
    // channel the desktop mouse wheel uses, so a game only implements
    // zoom once and gets both.
    if (pointsRef.current.size >= 2 && pinchRef.current !== null) {
      const now = spread();
      const delta = now - pinchRef.current;
      if (Math.abs(delta) > 0.5) {
        // Spreading fingers apart zooms IN, which is the universal
        // convention — hence the sign flip against wheel deltaY.
        input?.addZoom?.(-delta * 2.2);
        pinchRef.current = now;
      }
      e.preventDefault();
      return;
    }

    if (pointerIdRef.current !== e.pointerId) return;
    const dx = e.clientX - lastRef.current.x;
    const dy = e.clientY - lastRef.current.y;
    lastRef.current = { x: e.clientX, y: e.clientY };
    movedRef.current += Math.abs(dx) + Math.abs(dy);
    // Touch look wants to feel a little quicker than a mouse, because the
    // physical travel available on a screen is much smaller.
    input?.addLook(dx * 1.55 * sensitivity, dy * 1.55 * sensitivity);
    e.preventDefault();
  }

  function onPointerUp(e) {
    pointsRef.current.delete(e.pointerId);
    if (pointsRef.current.size < 2) pinchRef.current = null;

    if (pointerIdRef.current !== e.pointerId) {
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      return;
    }
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    // A finger that barely moved is a tap on the world, not a camera
    // drag — that is how the build game places components on a phone.
    // A finger that was part of a pinch is never a tap.
    if (movedRef.current < 14 && pinchRef.current === null && pointsRef.current.size === 0) {
      input?.registerTap?.(e.clientX, e.clientY);
    }
    release();
    e.preventDefault();
  }

  useEffect(() => release, [release]);

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={release}
      style={{
        position: "absolute",
        inset: 0,
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTapHighlightColor: "transparent",
        pointerEvents: "auto",
      }}
    >
      {hintVisible && (
        <div
          style={{
            position: "absolute",
            right: "9%",
            top: "46%",
            padding: "8px 12px",
            borderRadius: 20,
            background: C.bg + "aa",
            border: `1px solid ${C.line}`,
            color: C.muted,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.5,
            pointerEvents: "none",
            animation: "cslArenaFadePulse 2.4s ease-in-out infinite",
          }}
        >
          DRAG TO LOOK AROUND
        </div>
      )}
      {children}
    </div>
  );
}
