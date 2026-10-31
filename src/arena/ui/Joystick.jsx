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
 *
 *  THREE STYLES, because one stick does not suit every pair of hands:
 *
 *    fixed     the base sits in the corner and the knob follows the
 *              finger. The default: easiest to find without looking
 *              down, and the only one that works with a mouse.
 *    floating  the base appears wherever the thumb lands in the lower
 *              left of the screen, so the hand never reaches for a
 *              fixed spot. Better on a large phone.
 *    dpad      four buttons instead of a stick, for anybody who cannot
 *              hold an analogue angle on glass — which in gloves, on a
 *              site, is most people. Full speed, no analogue.
 *
 *  It also says what it DRIVES. The same component is the walk stick in
 *  four missions and the crane's own joystick in the fifth, and a stick
 *  labelled MOVE in a tower crane cab is simply wrong: there it slews
 *  the jib and runs the trolley, and the labels say so.
 * ------------------------------------------------------------------ */

const BASE_SIZE = 132;
const KNOB_SIZE = 58;
const DEAD_ZONE = 0.14;

export const JOYSTICK_STYLES = [
  { id: "fixed", label: "Fixed stick", desc: "Always in the same corner" },
  { id: "floating", label: "Floating stick", desc: "Appears where your thumb lands" },
  { id: "dpad", label: "Four buttons", desc: "No analogue angle to hold" },
];

export default function Joystick({
  input, size = BASE_SIZE, accent = C.yellow,
  style = "fixed", label = "MOVE", axisHints = null,
}) {
  if (style === "dpad") {
    return <DirectionPad input={input} size={size} accent={accent} label={label} axisHints={axisHints} />;
  }
  return (
    <AnalogueStick
      input={input} size={size} accent={accent}
      floating={style === "floating"} label={label} axisHints={axisHints}
    />
  );
}

function AnalogueStick({ input, size, accent, floating, label, axisHints }) {
  const padRef = useRef(null);
  const pointerIdRef = useRef(null);
  const centreRef = useRef({ x: 0, y: 0 });
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  // Where the base is drawn inside the pad, for the floating style.
  const [origin, setOrigin] = useState(null);

  const radius = size / 2;
  const maxTravel = radius - KNOB_SIZE / 2 + 6;

  /* The floating style needs somewhere to land, so it captures a patch
   * of the lower left rather than only the base itself. That patch is
   * the stick's zone: a drag starting there steers instead of looking,
   * which is the whole point of a floating stick. */
  const padWidth = floating ? Math.round(size * 1.9) : size;
  const padHeight = floating ? Math.round(size * 1.5) : size;
  const restLeft = floating ? 0 : 0;
  const restTop = floating ? padHeight - size : 0;

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
    setOrigin(null);
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
    const rect = padRef.current.getBoundingClientRect();

    if (floating) {
      /* The base re-centres on the finger, so the first touch is dead
       * centre and nothing moves until the thumb does. It is kept whole
       * inside the pad so half a stick never hangs off the screen. */
      const localX = Math.max(radius, Math.min(rect.width - radius, e.clientX - rect.left));
      const localY = Math.max(radius, Math.min(rect.height - radius, e.clientY - rect.top));
      setOrigin({ left: localX - radius, top: localY - radius });
      centreRef.current = { x: rect.left + localX, y: rect.top + localY };
    } else {
      centreRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

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
  const base = origin || { left: restLeft, top: restTop };

  return (
    <div
      ref={padRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={reset}
      style={{
        position: "relative",
        width: padWidth,
        height: padHeight,
        // The pad only takes the stick's own room in the layout; the
        // floating one's extra reach is overflow, not a bigger box.
        marginRight: floating ? size - padWidth : 0,
        marginTop: floating ? size - padHeight : 0,
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTapHighlightColor: "transparent",
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: base.left,
          top: base.top,
          width: size,
          height: size,
          borderRadius: "50%",
          background: `radial-gradient(circle at 50% 50%, ${C.surface}cc 0%, ${C.bg}aa 70%, ${C.bg}55 100%)`,
          border: `2px solid ${active ? accent + "cc" : C.line + "cc"}`,
          boxShadow: active ? `0 0 22px ${accent}33` : "0 4px 18px #00000055",
          opacity: floating && !active ? 0.55 : 1,
          transition: active ? "border-color .14s, box-shadow .14s" : "all .16s ease-out",
          pointerEvents: "none",
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

        {/* What each direction does, for a stick that is not just "move". */}
        {axisHints && (
          <>
            <AxisHint text={axisHints.up} style={{ top: 5, left: 0, right: 0 }} />
            <AxisHint text={axisHints.down} style={{ bottom: 5, left: 0, right: 0 }} />
            <AxisHint text={`◀ ${axisHints.left}`} style={{ left: 4, top: "50%", marginTop: -6 }} />
            <AxisHint text={`${axisHints.right} ▶`} style={{ right: 4, top: "50%", marginTop: -6 }} />
          </>
        )}
      </div>

      <StickLabel text={label} />
    </div>
  );
}

function StickLabel({ text }) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: -22,
        left: -20,
        right: -20,
        textAlign: "center",
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 1,
        color: C.muted,
        whiteSpace: "nowrap",
        pointerEvents: "none",
      }}
    >
      {text}
    </div>
  );
}

function AxisHint({ text, style }) {
  if (!text) return null;
  return (
    <div
      style={{
        position: "absolute",
        textAlign: "center",
        fontSize: 8.5,
        fontWeight: 900,
        letterSpacing: 0.6,
        color: C.muted,
        pointerEvents: "none",
        ...style,
      }}
    >
      {text}
    </div>
  );
}

/* ------------------------------ the d-pad ------------------------------
 *
 * Four buttons, full speed on each, and two at once gives a diagonal
 * that is normalised so it is not faster than a straight line.
 */
function DirectionPad({ input, size, accent, label, axisHints }) {
  const heldRef = useRef({ up: false, down: false, left: false, right: false });

  const publish = useCallback(() => {
    const h = heldRef.current;
    const x = (h.right ? 1 : 0) - (h.left ? 1 : 0);
    const y = (h.up ? 1 : 0) - (h.down ? 1 : 0);
    const magnitude = Math.hypot(x, y) || 1;
    input?.setJoystick(x / magnitude, y / magnitude);
  }, [input]);

  const set = useCallback((dir, value) => {
    heldRef.current = { ...heldRef.current, [dir]: value };
    publish();
  }, [publish]);

  const releaseAll = useCallback(() => {
    heldRef.current = { up: false, down: false, left: false, right: false };
    input?.setJoystick(0, 0);
  }, [input]);

  useEffect(() => releaseAll, [releaseAll]);

  const pad = Math.round(size / 3);

  return (
    <div style={{ position: "relative", width: size, height: size, pointerEvents: "auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateAreas: '". up ." "left . right" ". down ."',
          gridTemplateColumns: `${pad}px ${pad}px ${pad}px`,
          gridTemplateRows: `${pad}px ${pad}px ${pad}px`,
          placeItems: "center",
          width: size,
          height: size,
        }}
      >
        {[
          ["up", "▲", axisHints?.up],
          ["left", "◀", axisHints?.left],
          ["right", "▶", axisHints?.right],
          ["down", "▼", axisHints?.down],
        ].map(([dir, glyph, hint]) => (
          <button
            key={dir}
            type="button"
            aria-label={hint ? `${dir} — ${hint}` : dir}
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); set(dir, true); }}
            onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); set(dir, false); }}
            onPointerLeave={() => set(dir, false)}
            onPointerCancel={() => set(dir, false)}
            onLostPointerCapture={() => set(dir, false)}
            style={{
              gridArea: dir,
              width: pad,
              height: pad,
              borderRadius: 12,
              border: `2px solid ${C.line}cc`,
              background: `linear-gradient(${C.surface}dd, ${C.bg}bb)`,
              color: accent,
              fontSize: 15,
              fontWeight: 900,
              lineHeight: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              touchAction: "none",
              cursor: "pointer",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <span>{glyph}</span>
            {hint && <span style={{ fontSize: 7, color: C.muted, letterSpacing: 0.4 }}>{hint}</span>}
          </button>
        ))}
      </div>
      <StickLabel text={label} />
    </div>
  );
}
