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
  const [hintVisible, setHintVisible] = useState(showHint);

  const release = useCallback(() => {
    pointerIdRef.current = null;
  }, []);

  function onPointerDown(e) {
    if (pointerIdRef.current !== null) return;
    pointerIdRef.current = e.pointerId;
    lastRef.current = { x: e.clientX, y: e.clientY };
    movedRef.current = 0;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (hintVisible) setHintVisible(false);
    e.preventDefault();
  }

  function onPointerMove(e) {
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
    if (pointerIdRef.current !== e.pointerId) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    // A finger that barely moved is a tap on the world, not a camera
    // drag — that is how the build game places components on a phone.
    if (movedRef.current < 14) input?.registerTap?.(e.clientX, e.clientY);
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
