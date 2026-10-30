import React, { useCallback, useEffect, useRef, useState } from "react";
import { C } from "../arenaConstants.js";

/* ------------------------------------------------------------------ *
 *  VIRTUAL JOYSTICK
 *
 *  A real analogue stick, not a picture of one:
 *   - the knob tracks the finger continuously and is clamped to the
 *     base radius, so the player gets a true 360° analogue vector
 *   - output is a normalised (x, y) pair with a dead zone, written
 *     straight into the engine's input object every move event
 *   - springs back to centre on release / cancel / pointer loss
 *   - uses Pointer Events with setPointerCapture, so dragging the
 *     finger outside the base keeps control, and a second finger on
 *     the look pad or an action button is unaffected
 *   - touch-action:none plus preventDefault stops iOS Safari from
 *     scrolling the page or triggering pull-to-refresh mid-game
 * ------------------------------------------------------------------ */

const BASE_SIZE = 132;
const KNOB_SIZE = 58;
const DEAD_ZONE = 0.14;

export default function Joystick({ input, size = BASE_SIZE, accent = C.yellow }) {
  const baseRef = useRef(null);
  const pointerIdRef = useRef(null);
  const centreRef = useRef({ x: 0, y: 0 });
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  const radius = size / 2;
  const maxTravel = radius - KNOB_SIZE / 2 + 6;

  const publish = useCallback((vx, vy) => {
    // Screen y grows downward; forward is negative screen y.
    const magnitude = Math.hypot(vx, vy);
    if (magnitude < DEAD_ZONE) {
      input?.setJoystick(0, 0);
      return;
    }
    // Rescale past the dead zone so the first responsive movement is
    // slow rather than jumping straight to 14% speed.
    const scaled = (magnitude - DEAD_ZONE) / (1 - DEAD_ZONE);
    const nx = (vx / magnitude) * scaled;
    const ny = (vy / magnitude) * scaled;
    input?.setJoystick(nx, -ny);
  }, [input]);

  const reset = useCallback(() => {
    pointerIdRef.current = null;
    setActive(false);
    setKnob({ x: 0, y: 0 });
    input?.setJoystick(0, 0);
  }, [input]);

  const handleMove = useCallback((clientX, clientY) => {
    const centre = centreRef.current;
    let dx = clientX - centre.x;
    let dy = clientY - centre.y;
    const distance = Math.hypot(dx, dy);
    if (distance > maxTravel) {
      dx = (dx / distance) * maxTravel;
      dy = (dy / distance) * maxTravel;
    }
    setKnob({ x: dx, y: dy });
    publish(dx / maxTravel, dy / maxTravel);
  }, [maxTravel, publish]);

  function onPointerDown(e) {
    if (pointerIdRef.current !== null) return;
    const rect = baseRef.current.getBoundingClientRect();
    centreRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    pointerIdRef.current = e.pointerId;
    setActive(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    handleMove(e.clientX, e.clientY);
    e.preventDefault();
    e.stopPropagation();
  }

  function onPointerMove(e) {
    if (pointerIdRef.current !== e.pointerId) return;
    handleMove(e.clientX, e.clientY);
    e.preventDefault();
    e.stopPropagation();
  }

  function onPointerUp(e) {
    if (pointerIdRef.current !== e.pointerId) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    reset();
    e.preventDefault();
    e.stopPropagation();
  }

  // If the component unmounts (pause, results, exit) mid-drag, the engine
  // must not be left believing a stick is still pushed forward.
  useEffect(() => reset, [reset]);

  const intensity = Math.min(1, Math.hypot(knob.x, knob.y) / maxTravel);

  return (
    <div
      ref={baseRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={reset}
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: "50%",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTapHighlightColor: "transparent",
        background: `radial-gradient(circle at 50% 50%, ${C.surface}cc 0%, ${C.bg}aa 70%, ${C.bg}55 100%)`,
        border: `2px solid ${active ? accent + "cc" : C.line + "cc"}`,
        boxShadow: active ? `0 0 22px ${accent}33` : "0 4px 18px #00000055",
        transition: "border-color .14s, box-shadow .14s",
        pointerEvents: "auto",
      }}
    >
      {/* Direction ticks so the stick reads as a control, not a blob. */}
      {[0, 90, 180, 270].map((deg) => (
        <div
          key={deg}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 2,
            height: radius - 14,
            marginLeft: -1,
            transformOrigin: "50% 0",
            transform: `rotate(${deg}deg)`,
            background: `linear-gradient(${C.line}00, ${C.line}99)`,
            pointerEvents: "none",
          }}
        />
      ))}

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: KNOB_SIZE,
          height: KNOB_SIZE,
          marginLeft: -KNOB_SIZE / 2,
          marginTop: -KNOB_SIZE / 2,
          borderRadius: "50%",
          transform: `translate(${knob.x}px, ${knob.y}px)`,
          transition: active ? "none" : "transform .16s cubic-bezier(.3,1.4,.5,1)",
          background: `radial-gradient(circle at 38% 32%, ${accent} 0%, ${accent}bb 55%, ${accent}66 100%)`,
          border: `2px solid ${C.bg}99`,
          boxShadow: `0 3px 12px #000000aa, inset 0 0 ${8 + intensity * 10}px ${C.ink}33`,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          bottom: -22,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 1,
          color: C.muted,
          pointerEvents: "none",
        }}
      >
        MOVE
      </div>
    </div>
  );
}
