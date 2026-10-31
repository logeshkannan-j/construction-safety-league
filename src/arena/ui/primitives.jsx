import React, { useState } from "react";
import { C } from "../arenaConstants.js";
import { sfx, unlockAudio } from "../audio.js";

/* ------------------------------------------------------------------ *
 *  Small shared UI primitives for the Arena, styled to match the
 *  existing quiz (same palette, same inline-style approach, same
 *  radius/weight language) so the section does not look bolted on.
 * ------------------------------------------------------------------ */

export const panelStyle = {
  background: C.surface,
  border: `1px solid ${C.line}`,
  borderRadius: 14,
  padding: 18,
};

export function ArenaButton({
  children, onClick, color = C.yellow, variant = "solid", size = "md",
  disabled = false, icon, full = false, style: extra,
}) {
  const [hover, setHover] = useState(false);
  const pad = size === "lg" ? "15px 26px" : size === "sm" ? "7px 12px" : "11px 18px";
  const font = size === "lg" ? 16 : size === "sm" ? 12 : 14;
  const solid = variant === "solid";

  return (
    <button
      type="button"
      disabled={disabled}
      onMouseEnter={() => { if (!disabled) { setHover(true); sfx.hover(); } }}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => {
        if (disabled) return;
        unlockAudio();
        sfx.click();
        onClick?.(e);
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        width: full ? "100%" : "auto",
        padding: pad,
        borderRadius: 10,
        border: solid ? "none" : `1px solid ${disabled ? C.line : color}`,
        background: solid
          ? (disabled ? C.line : hover ? color : color)
          : (hover && !disabled ? color + "1f" : "transparent"),
        color: solid ? (disabled ? C.muted : "#14171A") : (disabled ? C.muted : color),
        fontSize: font,
        fontWeight: 800,
        letterSpacing: 0.3,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        transform: hover && !disabled ? "translateY(-1px)" : "none",
        boxShadow: solid && hover && !disabled ? `0 8px 22px ${color}33` : "none",
        transition: "all .15s ease",
        touchAction: "manipulation",
        ...extra,
      }}
    >
      {icon}
      {children}
    </button>
  );
}

export function Pill({ children, color = C.muted, filled = false, size = 11 }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: size,
        fontWeight: 800,
        letterSpacing: 0.6,
        color: filled ? "#14171A" : color,
        background: filled ? color : color + "18",
        border: `1px solid ${color}${filled ? "" : "66"}`,
        borderRadius: 20,
        padding: "3px 9px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export function StatBox({ label, value, color = C.yellow, sub, big = false }) {
  return (
    <div
      style={{
        background: C.surfaceRaised,
        border: `1px solid ${C.line}`,
        borderRadius: 10,
        padding: big ? "14px 16px" : "10px 12px",
        textAlign: "center",
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: big ? 30 : 21, fontWeight: 900, color, lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis" }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: C.muted, fontWeight: 800, letterSpacing: 0.7, marginTop: 3 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function SectionTitle({ children, icon, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      {icon}
      <h2 style={{ fontSize: 15, fontWeight: 900, margin: 0, letterSpacing: 0.2 }}>{children}</h2>
      <div style={{ marginLeft: "auto" }}>{right}</div>
    </div>
  );
}

export function Divider({ margin = 14 }) {
  return <div style={{ height: 1, background: C.line, margin: `${margin}px 0` }} />;
}

/** Full-screen overlay used by the briefing, pause and results screens. */
/**
 * The dimmed layer every panel, dialog and results screen sits on.
 *
 * Centred with AUTO MARGINS rather than `align-items: center`, which
 * matters more than it sounds. A flex item centred with align-items
 * that is taller than its container overflows equally in both
 * directions, and the part above the top is unreachable — the
 * scrollbar cannot get to it. An auto margin collapses to zero when
 * there is not enough room, so the item pins to the top and the whole
 * thing scrolls normally.
 *
 * This is why the electrical-room question appeared with its answers
 * cut off the bottom of a short window: a 3D game is usually played in
 * landscape, landscape on a phone is a short viewport, and a four
 * option decision is a tall panel.
 */
export function Overlay({ children, onBackdrop, align = "center", padded = true, blur = true }) {
  return (
    <div
      onPointerDown={(e) => { if (e.target === e.currentTarget) onBackdrop?.(); }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 40,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: padded ? "max(14px, env(safe-area-inset-top, 0px)) 14px max(14px, env(safe-area-inset-bottom, 0px))" : 0,
        background: `${C.bg}e8`,
        backdropFilter: blur ? "blur(7px)" : "none",
        WebkitBackdropFilter: blur ? "blur(7px)" : "none",
        overflowY: "auto",
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          // The centring. `auto` top and bottom when there is room,
          // nothing when there is not.
          margin: align === "top" ? "0 auto" : "auto",
          width: "100%",
          maxWidth: "100%",
          display: "flex",
          justifyContent: "center",
          // Never let the wrapper be squashed by the flex container —
          // it must keep its natural height so the parent can scroll.
          flexShrink: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}
