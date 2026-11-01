/* ------------------------------------------------------------------ *
 *  MISSION DEMO PLAYER — the built-in, step-by-step demo for a mission.
 *
 *  It goes through the mission ONE STEP AT A TIME. Each step is on
 *  screen in English and Tamil together — a crew watching the TV is a
 *  mix of both, and nobody should have to switch language to follow
 *  it — with the control that step is about drawn the way it looks in
 *  the game (the INSPECT button, the joystick, TOP VIEW), and the
 *  camera showing the place in the mission that step is about.
 *
 *  It plays on its own, a step every few seconds, or the viewer can
 *  step through it with Back and Next, or jump to any step from the
 *  dots. It can read each step aloud as it comes up.
 *
 *  The 3D is the mission's REAL world, not a recording: the shots are
 *  built from the game's own coordinates (see demoTour.js), so they
 *  cannot go stale, there is nothing to host or buffer on a venue
 *  connection, and it works offline. Where 3D cannot run — no WebGL,
 *  or the host has supplied a video instead — the steps still go one by
 *  one; only the picture changes.
 *
 *  Input to the 3D world is disabled throughout. This is something to
 *  watch, not something to play.
 * ------------------------------------------------------------------ */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Play, Pause, ChevronLeft, ChevronRight, RotateCcw, Loader2, Volume2, VolumeX,
  CircleDot, Hand, ScanSearch, Layers, ZoomIn, MousePointerClick, SkipForward, FileText,
  Link, Unlink, OctagonX, RotateCw, MoveHorizontal, MoveVertical, Pointer, ListChecks,
  Timer, Wind, TriangleAlert, Flame, Users, Megaphone, MapPin, ListOrdered, Ban,
} from "lucide-react";
import { C, getDifficulty } from "../arenaConstants.js";
import { supportsWebGL, resolveQuality, isMobileLayout } from "../engine/gfx.js";

const GAME_LOADERS = {
  "safety-mission": () => import("../games/safetyMission/index.js"),
  "crane-master": () => import("../games/craneMaster/index.js"),
  "safest-tower": () => import("../games/safestTower/index.js"),
  "escape-challenge": () => import("../games/escapeChallenge/index.js"),
  "emergency-commander": () => import("../games/emergencyCommander/index.js"),
};

const ICONS = {
  joystick: CircleDot, drag: Hand, inspect: ScanSearch, topview: Layers, zoom: ZoomIn,
  use: MousePointerClick, next: SkipForward, brief: FileText, attach: Link, release: Unlink,
  estop: OctagonX, slew: RotateCw, trolley: MoveHorizontal, hoist: MoveVertical, tap: Pointer,
  choice: ListChecks, timer: Timer, wind: Wind, zone: TriangleAlert, fire: Flame, muster: Users,
  command: Megaphone, stations: MapPin, order: ListOrdered, noentry: Ban,
};

const SPEECH = { en: "en-IN", ta: "ta-IN" };

/** Everything the games call on `api`, doing nothing. */
function silentApi() {
  return {
    hud() {}, toast() {}, dialog() {}, buttons() {},
    requestPause() {}, finish() {},
  };
}

/** How long a step stays up: long enough to read it in both languages. */
export function stepSeconds(step) {
  const words = String(step?.en || "").split(/\s+/).filter(Boolean).length;
  return Math.min(14, Math.max(6.5, 3.5 + words * 0.32));
}

/**
 * The camera shots for each step, from the mission's own tour. A step
 * the tour has no shot of keeps the shot of the step before it (or the
 * opening shot), so the camera always has somewhere sensible to be.
 */
export function shotsByStep(tour, count) {
  const list = (tour || []).filter(Boolean);
  const out = [];
  let last = list.length ? [list[0]] : [];
  for (let i = 0; i < count; i++) {
    const mine = list.filter((s) => s.step === i);
    if (mine.length) last = mine;
    out.push(last);
  }
  return out;
}

/**
 * Reads a step aloud through the browser's own speech synthesiser.
 *
 * Depends on the device having a voice for the language — Tamil is not
 * installed everywhere — so it says whether it can, rather than
 * silently doing nothing.
 */
function useStepVoice() {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
  const [voices, setVoices] = useState([]);
  useEffect(() => {
    if (!synth) return undefined;
    const load = () => setVoices(synth.getVoices?.() || []);
    load();
    synth.addEventListener?.("voiceschanged", load);
    return () => {
      synth.removeEventListener?.("voiceschanged", load);
      try { synth.cancel(); } catch { /* not supported */ }
    };
  }, [synth]);
  const voiceFor = useCallback((code) => {
    const base = String(code).split("-")[0].toLowerCase();
    return voices.find((v) => String(v.lang || "").toLowerCase().startsWith(base)) || null;
  }, [voices]);
  return useMemo(() => ({
    supported: !!synth,
    canSpeak: (lang) => !!synth && !!voiceFor(SPEECH[lang] || lang),
    speak(text, lang, onEnd) {
      if (!synth || !text) { onEnd?.(); return; }
      try {
        synth.cancel();
        const u = new window.SpeechSynthesisUtterance(text);
        u.lang = SPEECH[lang] || lang;
        const v = voiceFor(u.lang);
        if (v) u.voice = v;
        u.rate = 0.95;
        u.onend = () => onEnd?.();
        u.onerror = () => onEnd?.();
        synth.speak(u);
      } catch {
        onEnd?.();
      }
    },
    cancel() {
      try { synth?.cancel(); } catch { /* not supported */ }
    },
  }), [synth, voiceFor]);
}

/** One control, drawn as the game draws it, with what it does in Tamil. */
function ControlChip({ control, tv }) {
  const Icon = ICONS[control.icon] || Pointer;
  const size = tv ? 46 : 34;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: tv ? 10 : 8, minWidth: 0 }}>
      <span
        aria-hidden="true"
        style={{
          flex: "0 0 auto",
          width: size, height: size, borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: `${control.color}22`,
          border: `2px solid ${control.color}`,
          color: control.color,
          boxShadow: `0 0 0 0 ${control.color}66`,
          animation: "cslChipPulse 1.6s ease-out infinite",
        }}
      >
        <Icon size={tv ? 22 : 16} />
      </span>
      <span style={{ display: "grid", lineHeight: 1.2, minWidth: 0 }}>
        <span style={{
          fontWeight: 900, letterSpacing: control.button ? 1 : 0.2,
          fontSize: tv ? 17 : 12.5, color: C.ink,
        }}>
          {control.en}
        </span>
        <span style={{ fontSize: tv ? 15 : 11.5, color: C.muted }}>{control.ta}</span>
      </span>
    </div>
  );
}

/**
 * @param gameId          which mission
 * @param steps           [{ en, ta, controls }] from missionSteps()
 * @param lang            which language leads ("en" | "ta"); both show
 * @param with3d          fly the mission's real world behind the steps
 * @param size            "tv" for the projected screen, "compact" on a phone
 * @param autoPlay        start stepping as soon as it is ready
 * @param secondsPerStep  fixed time per step (tests); otherwise by length
 */
export default function MissionDemoPlayer({
  gameId, steps = [], lang = "en", height = 420, with3d = true, size = "compact",
  autoPlay = true, secondsPerStep = null,
}) {
  const hostRef = useRef(null);
  const instanceRef = useRef(null);
  const [view, setView] = useState(with3d ? "loading" : "off");
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(!!autoPlay);
  const [finished, setFinished] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const voice = useStepVoice();

  const tv = size === "tv";
  const count = steps.length;
  const at = Math.min(index, Math.max(0, count - 1));
  const step = steps[at] || null;
  const other = lang === "ta" ? "en" : "ta";

  // A new mission starts again at its first step.
  useEffect(() => {
    setIndex(0);
    setFinished(false);
    setPlaying(!!autoPlay);
  }, [gameId, autoPlay]);

  /* ----------------------- mount the real world ----------------------- */

  useEffect(() => {
    if (!with3d) { setView("off"); return undefined; }
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return undefined;

    if (!supportsWebGL()) {
      setView("nogl");
      return undefined;
    }
    const loader = GAME_LOADERS[gameId];
    if (!loader) {
      setView("error");
      setError("No 3D demo is available for this mission in this build.");
      return undefined;
    }

    setView("loading");
    loader()
      .then((mod) => {
        if (cancelled || !hostRef.current) return;
        const create = mod.default?.create || mod.create;
        if (typeof create !== "function") throw new Error("Game module has no create()");
        instanceRef.current = create({
          container: hostRef.current,
          difficulty: getDifficulty("normal"),
          quality: resolveQuality("auto"),
          settings: { quality: "auto", sound: false, haptics: false },
          mobile: isMobileLayout(),
          api: silentApi(),
        });
        // Watch only. A viewer dragging the camera would fight the shot.
        instanceRef.current.input?.setEnabled?.(false);
        setView("live");
      })
      .catch((e) => {
        console.error("[arena] demo failed to start", e);
        if (cancelled) return;
        setView("error");
        setError(`The 3D demo could not start: ${e.message}`);
      });

    return () => {
      cancelled = true;
      try { instanceRef.current?.siteView?.stopTour?.(); } catch { /* already gone */ }
      try { instanceRef.current?.dispose?.(); } catch (e) { console.error("[arena] demo dispose failed", e); }
      instanceRef.current = null;
    };
  }, [gameId, with3d]);

  /* ------------------- the camera follows the step ------------------- */

  useEffect(() => {
    if (view !== "live") return;
    const inst = instanceRef.current;
    const shots = shotsByStep(inst?.demoTour, count)[at] || [];
    // Looped, so the camera holds on this step's shot for as long as
    // the step is up, however long the viewer takes to read it.
    if (shots.length) inst.siteView?.playTour?.(shots, { loop: true });
  }, [view, at, count]);

  /* --------------------------- stepping on --------------------------- */

  const goTo = useCallback((i) => {
    voice.cancel();
    setFinished(false);
    setIndex(Math.max(0, Math.min(count - 1, i)));
  }, [count, voice]);

  useEffect(() => {
    if (!step) return undefined;
    let cancelled = false;
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(() => { if (!cancelled) fn(); }, ms));
    const advance = () => {
      if (at >= count - 1) {
        setPlaying(false);
        setFinished(true);
        return;
      }
      setIndex(at + 1);
    };
    const readMs = (secondsPerStep ?? stepSeconds(step)) * 1000;

    if (voiceOn && voice.canSpeak(lang)) {
      const started = Date.now();
      voice.speak(lang === "ta" ? step.ta : step.en, lang, () => {
        if (playing) later(advance, Math.max(1200, readMs - (Date.now() - started)));
      });
      // A voice that never says it has finished must not hang the demo.
      if (playing) later(advance, readMs + 15000);
    } else if (playing) {
      later(advance, readMs);
    }
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [at, step, count, playing, voiceOn, lang, secondsPerStep, voice]);

  const replay = () => {
    voice.cancel();
    setFinished(false);
    setIndex(0);
    setPlaying(true);
  };

  if (!count) return null;

  const voiceReady = voice.supported && voice.canSpeak(lang);
  const primary = lang === "ta" ? step.ta : step.en;
  const secondary = other === "ta" ? step.ta : step.en;
  const btn = (enabled = true) => ({
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    minWidth: tv ? 52 : 40, height: tv ? 48 : 38, padding: tv ? "0 16px" : "0 11px",
    borderRadius: 9, border: `1px solid ${C.line}`,
    background: "rgba(255,255,255,0.04)", color: C.ink,
    fontWeight: 800, fontSize: tv ? 16 : 13,
    cursor: enabled ? "pointer" : "not-allowed", opacity: enabled ? 1 : 0.4,
  });

  return (
    <div style={{ display: "grid", gap: tv ? 12 : 8 }}>
      <style>{`
        @keyframes cslSpin { to { transform: rotate(360deg); } }
        @keyframes cslChipPulse {
          0% { box-shadow: 0 0 0 0 rgba(255,255,255,0.28); }
          70% { box-shadow: 0 0 0 10px rgba(255,255,255,0); }
          100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); }
        }
      `}</style>

      {/* ---- the picture: the mission's real world ---- */}
      {with3d && (
        <div style={{
          position: "relative", width: "100%", height,
          borderRadius: 10, overflow: "hidden",
          background: "#06080A", border: `1px solid ${C.line}`,
        }}>
          <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />

          {view !== "live" && (
            <div style={{
              position: "absolute", inset: 0, display: "flex",
              alignItems: "center", justifyContent: "center", gap: 10,
              padding: 24, textAlign: "center",
              color: view === "loading" ? C.muted : C.orange,
              fontSize: tv ? 16 : 13, background: "rgba(6,8,10,0.86)",
            }}>
              {view === "loading" && (
                <Loader2 size={18} style={{ animation: "cslSpin 1s linear infinite" }} />
              )}
              <span>
                {view === "loading" && "Building the site…"}
                {view === "nogl" && "This device cannot show 3D. The steps below are the full instructions."}
                {view === "error" && error}
              </span>
            </div>
          )}

          {view === "live" && (
            <div style={{
              position: "absolute", top: 10, left: 10,
              display: "flex", alignItems: "center", gap: 7,
              background: "rgba(6,8,10,0.72)", border: `1px solid ${C.line}`,
              borderRadius: 999, padding: "5px 11px",
              fontSize: tv ? 13 : 10.5, fontWeight: 900, letterSpacing: 1, color: C.yellow,
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%", background: C.red,
                boxShadow: `0 0 0 3px ${C.red}33`,
              }} />
              LIVE 3D · {at + 1}/{count}
            </div>
          )}
        </div>
      )}

      {/* ---- the step, in both languages ---- */}
      <section
        aria-label="How to play, one step at a time"
        aria-live="polite"
        style={{
          background: C.panel || "rgba(255,255,255,0.03)",
          border: `1px solid ${C.line}`, borderRadius: 10,
          padding: tv ? "16px 18px" : "11px 12px",
          display: "grid", gap: tv ? 12 : 9,
        }}
      >
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 10, flexWrap: "wrap",
        }}>
          <span style={{
            fontWeight: 900, letterSpacing: 1.2, color: C.yellow,
            fontSize: tv ? 16 : 11.5,
          }}>
            STEP {at + 1} OF {count} · படி {at + 1} / {count}
          </span>
          <span style={{ display: "flex", gap: tv ? 7 : 5 }}>
            {steps.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Step ${i + 1}`}
                aria-current={i === at ? "step" : undefined}
                onClick={() => goTo(i)}
                style={{
                  width: tv ? 14 : 10, height: tv ? 14 : 10, padding: 0,
                  borderRadius: "50%", cursor: "pointer",
                  border: `1px solid ${i <= at ? C.yellow : C.line}`,
                  background: i < at ? `${C.yellow}88` : i === at ? C.yellow : "transparent",
                }}
              />
            ))}
          </span>
        </div>

        <p style={{
          margin: 0, color: C.ink, fontWeight: 700,
          fontSize: tv ? 24 : 15, lineHeight: 1.45,
        }}>
          {primary}
        </p>
        <p
          lang={other}
          style={{
            margin: 0, color: C.muted,
            fontSize: tv ? 20 : 13.5, lineHeight: 1.5,
            borderLeft: `3px solid ${C.line}`, paddingLeft: tv ? 12 : 9,
          }}
        >
          {secondary}
        </p>

        {step.controls?.length > 0 && (
          <div style={{
            display: "flex", flexWrap: "wrap", gap: tv ? "12px 22px" : "8px 16px",
            paddingTop: tv ? 4 : 2,
          }}>
            {step.controls.map((control) => (
              <ControlChip key={control.id} control={control} tv={tv} />
            ))}
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: tv ? 10 : 7, flexWrap: "wrap" }}>
          <button type="button" onClick={() => goTo(at - 1)} disabled={at === 0} style={btn(at > 0)}
            aria-label="Previous step">
            <ChevronLeft size={tv ? 20 : 16} /> Back
          </button>
          {finished ? (
            <button type="button" onClick={replay} style={btn()} aria-label="Play the steps again">
              <RotateCcw size={tv ? 18 : 15} /> Again
            </button>
          ) : (
            <button type="button" onClick={() => setPlaying((p) => !p)} style={btn()}
              aria-label={playing ? "Pause" : "Play"}>
              {playing ? <Pause size={tv ? 18 : 15} /> : <Play size={tv ? 18 : 15} />}
              {playing ? "Pause" : "Play"}
            </button>
          )}
          <button type="button" onClick={() => goTo(at + 1)} disabled={at >= count - 1} style={btn(at < count - 1)}
            aria-label="Next step">
            Next <ChevronRight size={tv ? 20 : 16} />
          </button>
          {voice.supported && (
            <button
              type="button"
              onClick={() => setVoiceOn((v) => !v)}
              disabled={!voiceReady}
              title={voiceReady ? "Read each step aloud" : "This device has no voice for this language"}
              style={{
                ...btn(voiceReady), marginLeft: "auto",
                background: voiceOn && voiceReady ? C.purple : btn().background,
                color: voiceOn && voiceReady ? "#fff" : C.ink,
              }}
            >
              {voiceOn && voiceReady ? <Volume2 size={tv ? 18 : 15} /> : <VolumeX size={tv ? 18 : 15} />}
              {voiceReady ? (voiceOn ? "Reading" : "Read aloud") : "No voice"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
