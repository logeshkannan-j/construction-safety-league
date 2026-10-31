import React, { useEffect, useRef, useState } from "react";
import { Clock, Target, Trophy, AlertTriangle, CheckCircle2, XCircle, Pause, Activity, Maximize, Minimize } from "lucide-react";
import { C, SITE_NAME, SITE_SUBTITLE } from "../arenaConstants.js";

/* ------------------------------------------------------------------ *
 *  SHARED HUD
 *
 *  Every game renders the same HUD primitives, so the player learns one
 *  interface. All pieces are pointer-events:none except the controls,
 *  which matters because the HUD sits on top of the touch-look pad.
 *
 *  The layout deliberately keeps the centre of the screen and the
 *  bottom-left/bottom-right thumb zones clear.
 * ------------------------------------------------------------------ */

export function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* ----------------------------- top bar ----------------------------- */

export function HudTopBar({
  objective, score = 0, timeMs = null, progress = null, progressLabel,
  accent = C.yellow, onPause, onFullscreen = null, fullscreen = false,
  extra = null, mobile = false, danger = false,
}) {
  const urgent = timeMs !== null && timeMs <= 20000;
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        padding: mobile ? "8px 10px" : "12px 18px",
        display: "flex",
        alignItems: "flex-start",
        gap: mobile ? 8 : 14,
        background: `linear-gradient(${C.bg}dd, ${C.bg}00)`,
        pointerEvents: "none",
      }}
    >
      {/* Objective */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Whose site this is. Sits above the objective so it is visible
            in every mission without ever overlapping the controls. */}
        <div
          style={{
            fontSize: mobile ? 8.5 : 9.5,
            fontWeight: 800,
            letterSpacing: mobile ? 1.6 : 2.4,
            color: C.muted,
            marginBottom: 3,
            textShadow: "0 2px 8px #000000cc",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {SITE_NAME}
          {!mobile && <span style={{ color: C.line, margin: "0 7px" }}>|</span>}
          {!mobile && <span style={{ letterSpacing: 1.4 }}>{SITE_SUBTITLE}</span>}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: mobile ? 9 : 10,
            fontWeight: 900,
            letterSpacing: 1.2,
            color: danger ? C.red : accent,
            marginBottom: 2,
          }}
        >
          {danger ? <AlertTriangle size={mobile ? 11 : 12} /> : <Target size={mobile ? 11 : 12} />}
          {danger ? "PRIORITY" : "OBJECTIVE"}
        </div>
        <div
          style={{
            fontSize: mobile ? 13 : 16,
            fontWeight: 800,
            lineHeight: 1.25,
            color: C.ink,
            textShadow: "0 2px 8px #000000cc",
            maxWidth: mobile ? "100%" : 520,
          }}
        >
          {objective}
        </div>
        {progress !== null && (
          <div style={{ marginTop: 6, maxWidth: mobile ? "70%" : 320 }}>
            <div style={{ height: 4, background: C.bg + "aa", borderRadius: 2, overflow: "hidden", border: `1px solid ${C.line}66` }}>
              <div
                style={{
                  width: `${Math.max(0, Math.min(100, progress))}%`,
                  height: "100%",
                  background: accent,
                  transition: "width .35s ease-out",
                }}
              />
            </div>
            {progressLabel && (
              <div style={{ fontSize: 10, color: C.muted, marginTop: 3, fontWeight: 700 }}>{progressLabel}</div>
            )}
          </div>
        )}
      </div>

      {extra}

      {/* Timer */}
      {timeMs !== null && (
        <HudChip
          icon={<Clock size={mobile ? 13 : 15} />}
          value={formatClock(timeMs)}
          label="TIME"
          color={urgent ? C.red : C.yellow}
          mobile={mobile}
          pulse={urgent}
        />
      )}

      {/* Score */}
      <HudChip
        icon={<Trophy size={mobile ? 13 : 15} />}
        value={score}
        label="SCORE"
        color={C.green}
        mobile={mobile}
      />

      {onFullscreen && (
        <button
          type="button"
          aria-label={fullscreen ? "Leave full screen" : "Full screen"}
          title={fullscreen ? "Leave full screen" : "Full screen"}
          onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onFullscreen(); }}
          style={{
            pointerEvents: "auto",
            width: mobile ? 38 : 42,
            height: mobile ? 38 : 42,
            borderRadius: 10,
            border: `1px solid ${C.line}`,
            background: C.surface + "dd",
            color: C.ink,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            touchAction: "none",
            flexShrink: 0,
          }}
        >
          {fullscreen ? <Minimize size={mobile ? 16 : 18} /> : <Maximize size={mobile ? 16 : 18} />}
        </button>
      )}

      {onPause && (
        <button
          type="button"
          aria-label="Pause"
          onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onPause(); }}
          style={{
            pointerEvents: "auto",
            width: mobile ? 38 : 42,
            height: mobile ? 38 : 42,
            borderRadius: 10,
            border: `1px solid ${C.line}`,
            background: C.surface + "dd",
            color: C.ink,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            touchAction: "none",
            flexShrink: 0,
          }}
        >
          <Pause size={mobile ? 16 : 18} />
        </button>
      )}
    </div>
  );
}

export function HudChip({ icon, value, label, color = C.yellow, mobile = false, pulse = false }) {
  return (
    <div
      style={{
        background: C.bg + "cc",
        border: `1px solid ${color}66`,
        borderRadius: 10,
        padding: mobile ? "5px 8px" : "7px 12px",
        textAlign: "center",
        minWidth: mobile ? 56 : 72,
        flexShrink: 0,
        animation: pulse ? "cslArenaPulse 1s ease-in-out infinite" : "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          color,
          fontWeight: 900,
          fontSize: mobile ? 15 : 18,
          lineHeight: 1.1,
        }}
      >
        {icon}
        {value}
      </div>
      <div style={{ fontSize: mobile ? 8 : 9, color: C.muted, fontWeight: 800, letterSpacing: 0.8, marginTop: 1 }}>
        {label}
      </div>
    </div>
  );
}

/* ---------------------------- crosshair ---------------------------- */

export function Crosshair({ state = "idle", accent = C.yellow }) {
  // state: idle | target | locked
  const color = state === "locked" ? C.green : state === "target" ? accent : C.ink;
  const size = state === "idle" ? 4 : 18;
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: 30,
        height: 30,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 4,
          height: 4,
          marginLeft: -2,
          marginTop: -2,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 5px ${color}`,
          transition: "background .12s",
        }}
      />
      {state !== "idle" && [0, 90, 180, 270].map((deg) => (
        <div
          key={deg}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 2,
            height: size / 2,
            marginLeft: -1,
            transformOrigin: "50% 0",
            transform: `rotate(${deg}deg) translateY(5px)`,
            background: color,
            transition: "height .12s",
          }}
        />
      ))}
    </div>
  );
}

/* -------------------------- interact prompt -------------------------- */

export function InteractPrompt({ text, keyHint = "E", mobile = false, tone = "normal" }) {
  if (!text) return null;
  const color = tone === "bad" ? C.red : tone === "good" ? C.green : C.yellow;
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "58%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: mobile ? "7px 12px" : "9px 16px",
        borderRadius: 24,
        background: C.bg + "e0",
        border: `1px solid ${color}88`,
        color: C.ink,
        fontSize: mobile ? 12 : 14,
        fontWeight: 700,
        whiteSpace: "nowrap",
        maxWidth: "88vw",
        overflow: "hidden",
        textOverflow: "ellipsis",
        pointerEvents: "none",
        boxShadow: `0 4px 20px ${C.bg}aa`,
      }}
    >
      {!mobile && (
        <kbd
          style={{
            background: color,
            color: "#14171A",
            borderRadius: 5,
            padding: "2px 7px",
            fontSize: 11,
            fontWeight: 900,
            fontFamily: "inherit",
          }}
        >
          {keyHint}
        </kbd>
      )}
      {text}
    </div>
  );
}

/* ------------------------------ toasts ------------------------------ */

/**
 * Floating score/feedback messages. Driven by a queue the game pushes
 * into, so a correct answer and a time bonus can stack visibly.
 */
export function ToastStack({ toasts = [], mobile = false }) {
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: mobile ? "22%" : "26%",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        pointerEvents: "none",
        width: "min(92vw, 460px)",
      }}
    >
      {toasts.map((t) => {
        const color = t.kind === "good" ? C.green : t.kind === "bad" ? C.red : t.kind === "warn" ? C.orange : C.yellow;
        const Icon = t.kind === "good" ? CheckCircle2 : t.kind === "bad" ? XCircle : AlertTriangle;
        return (
          <div
            key={t.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: mobile ? "7px 12px" : "9px 16px",
              borderRadius: 10,
              background: C.bg + "e8",
              border: `1px solid ${color}`,
              color: C.ink,
              fontSize: mobile ? 12 : 14,
              fontWeight: 700,
              boxShadow: `0 6px 24px ${C.bg}cc`,
              animation: "cslArenaToast .35s cubic-bezier(.2,1.3,.4,1)",
              textAlign: "left",
            }}
          >
            {t.kind !== "info" && <Icon size={mobile ? 14 : 16} color={color} style={{ flexShrink: 0 }} />}
            <span style={{ flex: 1 }}>{t.text}</span>
            {t.points !== undefined && t.points !== 0 && (
              <b style={{ color, fontSize: mobile ? 13 : 15, whiteSpace: "nowrap" }}>
                {t.points > 0 ? "+" : ""}{t.points}
              </b>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Hook that manages the toast queue with automatic expiry. */
export function useToasts(maxVisible = 4) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const timersRef = useRef([]);

  const push = useRef((text, kind = "info", points, ttl = 2600) => {
    const id = ++idRef.current;
    setToasts((list) => [...list, { id, text, kind, points }].slice(-maxVisible));
    const timer = setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
    }, ttl);
    timersRef.current.push(timer);
  }).current;

  useEffect(() => () => { timersRef.current.forEach(clearTimeout); }, []);

  return { toasts, push };
}

/* --------------------------- status meter --------------------------- */

export function StatusMeter({ label, value, max = 100, color = C.green, icon, mobile = false, warnBelow = 30 }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const shown = pct <= warnBelow ? C.red : color;
  return (
    <div
      style={{
        background: C.bg + "cc",
        border: `1px solid ${C.line}`,
        borderRadius: 8,
        padding: mobile ? "5px 8px" : "7px 11px",
        minWidth: mobile ? 110 : 150,
        pointerEvents: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: mobile ? 9 : 10, fontWeight: 800, color: C.muted, letterSpacing: 0.8, marginBottom: 4 }}>
        {icon || <Activity size={mobile ? 10 : 11} />}
        {label}
        <span style={{ marginLeft: "auto", color: shown, fontWeight: 900 }}>{Math.round(value)}</span>
      </div>
      <div style={{ height: mobile ? 5 : 6, background: "#00000066", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: shown, transition: "width .3s, background .3s" }} />
      </div>
    </div>
  );
}

/* ------------------------- objective checklist ------------------------- */

export function ObjectiveList({ items = [], mobile = false, title = "MISSION TASKS", collapsed = false }) {
  const [open, setOpen] = useState(!collapsed);
  if (!items.length) return null;
  return (
    <div
      style={{
        background: C.bg + "d8",
        border: `1px solid ${C.line}`,
        borderRadius: 10,
        padding: mobile ? "7px 9px" : "10px 12px",
        maxWidth: mobile ? 210 : 290,
        pointerEvents: "auto",
      }}
    >
      <button
        type="button"
        onPointerDown={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        style={{
          display: "flex", alignItems: "center", gap: 6, width: "100%",
          background: "none", border: "none", padding: 0, cursor: "pointer",
          fontSize: mobile ? 9 : 10, fontWeight: 900, letterSpacing: 1, color: C.muted,
          marginBottom: open ? 6 : 0, touchAction: "none",
        }}
      >
        {title}
        <span style={{ marginLeft: "auto", color: C.yellow }}>
          {items.filter((i) => i.done).length}/{items.length} {open ? "▾" : "▸"}
        </span>
      </button>
      {open && items.map((item, i) => (
        <div
          key={item.id || i}
          style={{
            display: "flex", alignItems: "flex-start", gap: 6,
            fontSize: mobile ? 11 : 12, lineHeight: 1.35,
            color: item.done ? C.muted : C.ink,
            textDecoration: item.done ? "line-through" : "none",
            marginBottom: 3,
          }}
        >
          {item.done
            ? <CheckCircle2 size={mobile ? 12 : 13} color={C.green} style={{ flexShrink: 0, marginTop: 1 }} />
            : <span style={{ width: mobile ? 12 : 13, height: mobile ? 12 : 13, borderRadius: 3, border: `1px solid ${C.line}`, flexShrink: 0, marginTop: 1 }} />}
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------- readouts panel ---------------------------- */

/**
 * Compact instrument panel — the crane's radius / load / height / wind,
 * the tower audit's compliance figures, the incident clock. Driven by
 * plain data so games stay free of JSX.
 */
export function Readouts({ items = [], mobile = false, title }) {
  if (!items.length) return null;
  return (
    <div
      style={{
        background: C.bg + "dd",
        border: `1px solid ${C.line}`,
        borderRadius: 10,
        padding: mobile ? "6px 8px" : "9px 12px",
        pointerEvents: "none",
        minWidth: mobile ? 128 : 168,
      }}
    >
      {title && (
        <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1, color: C.muted, marginBottom: 5 }}>
          {title}
        </div>
      )}
      {items.map((item) => {
        const color = item.tone === "bad" ? C.red : item.tone === "warn" ? C.orange : item.tone === "good" ? C.green : C.ink;
        return (
          <div
            key={item.label}
            style={{
              display: "flex", alignItems: "baseline", gap: 8,
              fontSize: mobile ? 10.5 : 11.5, marginBottom: 3,
            }}
          >
            <span style={{ color: C.muted, fontWeight: 700, letterSpacing: 0.4 }}>{item.label}</span>
            <span style={{ marginLeft: "auto", color, fontWeight: 900, fontSize: mobile ? 12 : 13.5, fontVariantNumeric: "tabular-nums" }}>
              {item.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ----------------------------- palette bar ----------------------------- */

/**
 * The component palette for Build the Safest Tower: pick a safety
 * system, then place it. Shown as a scrollable strip so it works at
 * phone width without covering the build area.
 */
export function PaletteBar({ palette, mobile = false }) {
  if (!palette?.items?.length) return null;
  const { items, selectedId, onSelect, note } = palette;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 5,
        pointerEvents: "auto",
        maxWidth: "min(96vw, 760px)",
      }}
    >
      {note && (
        <div style={{ fontSize: 10.5, color: C.muted, fontWeight: 700, paddingLeft: 2 }}>{note}</div>
      )}
      <div
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          padding: "3px 2px 6px",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "thin",
        }}
      >
        {items.map((item) => {
          const selected = item.id === selectedId;
          const exhausted = item.remaining !== undefined && item.remaining <= 0;
          return (
            <button
              key={item.id}
              type="button"
              disabled={exhausted}
              onPointerDown={(e) => { e.stopPropagation(); if (!exhausted) onSelect?.(item.id); }}
              style={{
                flex: "0 0 auto",
                minWidth: mobile ? 86 : 104,
                padding: mobile ? "7px 9px" : "9px 12px",
                borderRadius: 10,
                border: `1px solid ${selected ? item.color : C.line}`,
                background: selected ? item.color + "26" : C.bg + "dd",
                color: exhausted ? C.line : selected ? item.color : C.ink,
                textAlign: "left",
                cursor: exhausted ? "not-allowed" : "pointer",
                opacity: exhausted ? 0.45 : 1,
                touchAction: "none",
              }}
            >
              <div style={{ fontSize: mobile ? 10.5 : 11.5, fontWeight: 900, lineHeight: 1.25 }}>
                {item.label}
              </div>
              {item.remaining !== undefined && (
                <div style={{ fontSize: 9.5, color: C.muted, marginTop: 2, fontWeight: 700 }}>
                  {item.remaining} left
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------- global keyframes --------------------------- */

export const ARENA_KEYFRAMES = `
@keyframes cslArenaPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
@keyframes cslArenaToast { from { opacity: 0; transform: translateY(14px) scale(.94); } to { opacity: 1; transform: none; } }
@keyframes cslArenaFadePulse { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
@keyframes cslArenaSpin { to { transform: rotate(360deg); } }
@keyframes cslArenaRise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
@keyframes cslArenaFlashRed { 0%,100% { box-shadow: inset 0 0 0 0 #EA4F4F00; } 50% { box-shadow: inset 0 0 120px 0 #EA4F4F55; } }
@keyframes cslArenaScan { from { background-position: 0 0; } to { background-position: 0 28px; } }
`;
