import React, { useCallback, useEffect, useRef, useState } from "react";
import { C } from "../arenaConstants.js";
import { sfx } from "../audio.js";

/* ------------------------------------------------------------------ *
 *  MOBILE ACTION BUTTONS
 *
 *  Large, thumb-reachable buttons on the right of the screen. Each one
 *  drives the SAME named action a keyboard key drives, so no game has
 *  separate "mobile logic":
 *
 *    mode "tap"  -> input.tap(action)      e.g. INTERACT, REPORT
 *    mode "hold" -> press/release pairs    e.g. RUN, HOIST UP
 *
 *  Each game declares only the buttons it needs, so the crane never
 *  shows a JUMP button and the escape rooms never show a HOIST button.
 * ------------------------------------------------------------------ */

export function ActionButton({
  label, icon, action, input, mode = "tap", color = C.yellow,
  size = 72, disabled = false, badge = null, sublabel = null, onPress,
}) {
  const [down, setDown] = useState(false);
  const pointerIdRef = useRef(null);

  const releaseAction = useCallback(() => {
    if (mode === "hold" && action) input?.release(action);
    setDown(false);
    pointerIdRef.current = null;
  }, [action, input, mode]);

  function onPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    pointerIdRef.current = e.pointerId;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    setDown(true);
    sfx.click();
    if (mode === "hold") {
      if (action) input?.press(action);
    } else {
      if (action) input?.tap(action);
      if (onPress) onPress();
    }
  }

  function onPointerUp(e) {
    e.preventDefault();
    e.stopPropagation();
    if (pointerIdRef.current !== e.pointerId) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    releaseAction();
  }

  // Never leave a held action stuck down if the button disappears.
  useEffect(() => releaseAction, [releaseAction]);

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={releaseAction}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2px solid ${disabled ? C.line : color}`,
        background: down
          ? `radial-gradient(circle at 50% 40%, ${color} 0%, ${color}cc 100%)`
          : `radial-gradient(circle at 50% 35%, ${C.surfaceRaised}ee 0%, ${C.bg}dd 100%)`,
        color: down ? "#14171A" : disabled ? C.line : color,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        fontSize: size > 64 ? 11 : 10,
        fontWeight: 900,
        letterSpacing: 0.4,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTapHighlightColor: "transparent",
        boxShadow: down ? `0 0 20px ${color}55` : "0 3px 14px #00000077",
        transform: down ? "scale(0.94)" : "scale(1)",
        transition: "transform .08s, box-shadow .12s, background .12s",
        pointerEvents: "auto",
      }}
    >
      {icon}
      <span style={{ lineHeight: 1 }}>{label}</span>
      {sublabel && <span style={{ fontSize: 8, fontWeight: 700, opacity: 0.75 }}>{sublabel}</span>}
      {badge !== null && badge !== undefined && (
        <span
          style={{
            position: "absolute",
            top: -4,
            right: -4,
            minWidth: 20,
            height: 20,
            padding: "0 5px",
            borderRadius: 10,
            background: C.orange,
            color: "#14171A",
            fontSize: 11,
            fontWeight: 900,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: `1px solid ${C.bg}`,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

/**
 * A two-way hold rocker — the control a crane actually has. Holding
 * either end presses the matching named action for as long as the
 * finger is down, so the motion is analogue in time rather than a
 * series of taps.
 */
export function Rocker({
  label, input, minusAction, plusAction, minusLabel = "−", plusLabel = "+",
  color = C.yellow, vertical = false, value = null, disabled = false, size = 46,
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: vertical ? "column" : "row",
        alignItems: "center",
        gap: 4,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 900,
          letterSpacing: 0.8,
          color: disabled ? C.line : C.muted,
          textAlign: "center",
          minWidth: vertical ? undefined : 54,
        }}
      >
        {label}
        {value !== null && (
          <span style={{ display: "block", color: disabled ? C.line : color, fontSize: 12 }}>{value}</span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: vertical ? "column" : "row", gap: 5 }}>
        <ActionButton
          label={vertical ? plusLabel : minusLabel}
          action={vertical ? plusAction : minusAction}
          input={input}
          mode="hold"
          color={color}
          size={size}
          disabled={disabled}
        />
        <ActionButton
          label={vertical ? minusLabel : plusLabel}
          action={vertical ? minusAction : plusAction}
          input={input}
          mode="hold"
          color={color}
          size={size}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

/**
 * The tower crane's control desk, laid out for thumbs. Each rocker
 * drives the SAME named actions the keyboard drives, so the crane
 * behaves identically on both.
 */
export function CraneControls({
  input, mobile = false, readouts = null, disabled = false,
  // With a joystick on screen the stick IS the slew and trolley, the
  // way a real cab works. Showing rockers for the same two axes beside
  // it is a second set of controls for the same thing.
  hoistOnly = false,
}) {
  const size = mobile ? 44 : 48;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: mobile ? 10 : 16,
        pointerEvents: "none",
      }}
    >
      {!hoistOnly && (
      <Rocker
        label="SLEW"
        input={input}
        minusAction="slewLeft"
        plusAction="slewRight"
        minusLabel="◀"
        plusLabel="▶"
        color={C.yellow}
        size={size}
        disabled={disabled}
        value={readouts?.slew}
      />
      )}
      {!hoistOnly && (
      <Rocker
        label="TROLLEY"
        input={input}
        minusAction="trolleyIn"
        plusAction="trolleyOut"
        minusLabel="IN"
        plusLabel="OUT"
        color={C.blue}
        size={size}
        disabled={disabled}
        value={readouts?.radius}
      />
      )}
      <Rocker
        label="HOIST"
        input={input}
        minusAction="hoistDown"
        plusAction="hoistUp"
        minusLabel="▼"
        plusLabel="▲"
        color={C.green}
        size={size}
        vertical
        disabled={disabled}
        value={readouts?.height}
      />
    </div>
  );
}

/**
 * Standard cluster: a large primary button with up to four smaller
 * buttons arranged around it, matching the thumb arc of a phone held
 * in landscape.
 */
export default function ActionButtonCluster({ buttons = [], input, compact = false }) {
  if (!buttons.length) return null;
  const primary = buttons.find((b) => b.primary) || buttons[0];
  const rest = buttons.filter((b) => b !== primary);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: compact ? 8 : 10,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: rest.length > 2 ? "repeat(2, auto)" : "auto",
          gap: compact ? 7 : 9,
          justifyItems: "end",
          pointerEvents: "none",
        }}
      >
        {rest.map((b) => (
          <ActionButton
            key={b.id || b.label}
            {...b}
            input={input}
            size={compact ? 52 : 58}
          />
        ))}
      </div>
      <ActionButton
        {...primary}
        input={input}
        size={compact ? 68 : 80}
      />
    </div>
  );
}
