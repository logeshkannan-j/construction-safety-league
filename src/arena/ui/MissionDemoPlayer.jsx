/* ------------------------------------------------------------------ *
 *  MISSION DEMO PLAYER — the built-in demo for a 3D mission.
 *
 *  Not a recorded video. It mounts the mission's REAL 3D world and
 *  flies a scripted camera through it, captioned in English or Tamil
 *  and read aloud, while the scene runs live underneath.
 *
 *  That is better than a video file for this event, for four reasons:
 *
 *    it cannot go stale   the shots are built from the game's own
 *                         coordinates, so moving a hazard moves the
 *                         shot that looks at it
 *    it needs no hosting  nothing to upload, nothing to buffer on a
 *                         venue connection, and it works offline
 *    it is translated     captions come from the same briefing text as
 *                         the voice-over, so adding a language adds it
 *                         to the demo as well
 *    it is already there  the three.js chunk is downloaded anyway
 *
 *  The host can still paste a real video per mission (see
 *  MissionDemo.jsx); when they do, that plays instead.
 *
 *  Input is disabled throughout. This is something to watch, not
 *  something to play, and a viewer who grabs the camera mid-tour would
 *  fight the shot list.
 * ------------------------------------------------------------------ */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Play, RotateCcw, X, Loader2, Volume2, Pause } from "lucide-react";
import { C } from "../arenaConstants.js";
import { supportsWebGL, resolveQuality, isMobileLayout } from "../engine/gfx.js";
import { tourSeconds } from "../engine/demoTour.js";
import { getDifficulty } from "../arenaConstants.js";

const GAME_LOADERS = {
  "safety-mission": () => import("../games/safetyMission/index.js"),
  "crane-master": () => import("../games/craneMaster/index.js"),
  "safest-tower": () => import("../games/safestTower/index.js"),
  "escape-challenge": () => import("../games/escapeChallenge/index.js"),
  "emergency-commander": () => import("../games/emergencyCommander/index.js"),
};

/** Everything the games call on `api`, doing nothing. */
function silentApi() {
  return {
    hud() {}, toast() {}, dialog() {}, buttons() {},
    requestPause() {}, finish() {},
  };
}

/**
 * @param gameId    which mission to demo
 * @param captions  the briefing steps in the viewer's language
 * @param speak     optional { text, speaking, toggle, supported }
 * @param onClose   called when the viewer closes the demo
 * @param autoPlay  start as soon as the world is ready
 */
export default function MissionDemoPlayer({
  gameId, captions = [], speak = null, onClose = null, autoPlay = true, height = 420,
}) {
  const hostRef = useRef(null);
  const instanceRef = useRef(null);
  const [phase, setPhase] = useState("loading");   // loading | playing | done | error
  const [stepIndex, setStepIndex] = useState(null);
  const [error, setError] = useState("");

  // Captions change with the language, but the tour must not restart
  // when the viewer switches: keep them in a ref the callback reads.
  const captionsRef = useRef(captions);
  captionsRef.current = captions;

  const start = useCallback(() => {
    const instance = instanceRef.current;
    const view = instance?.siteView;
    const tour = instance?.demoTour;
    if (!view || !tour?.length) return;
    setPhase("playing");
    view.playTour(tour, {
      onStep: (i, legShot) => setStepIndex(Number.isFinite(legShot?.step) ? legShot.step : null),
      onEnd: () => { setPhase("done"); setStepIndex(null); },
    });
  }, []);

  /* ----------------------- mount the real world ----------------------- */

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return undefined;

    if (!supportsWebGL()) {
      setPhase("error");
      setError("This device cannot show 3D. The written briefing below is the full instruction set.");
      return undefined;
    }
    const loader = GAME_LOADERS[gameId];
    if (!loader) {
      setPhase("error");
      setError("No demo is available for this mission in this build.");
      return undefined;
    }

    setPhase("loading");
    setStepIndex(null);

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
        // Watch only. A viewer dragging the camera would fight the tour.
        instanceRef.current.input?.setEnabled?.(false);
        if (autoPlay) start();
        else setPhase("done");
      })
      .catch((e) => {
        console.error("[arena] demo failed to start", e);
        if (cancelled) return;
        setPhase("error");
        setError(`The demo could not start: ${e.message}`);
      });

    return () => {
      cancelled = true;
      try { instanceRef.current?.siteView?.stopTour?.(); } catch { /* already gone */ }
      try { instanceRef.current?.dispose?.(); } catch (e) { console.error("[arena] demo dispose failed", e); }
      instanceRef.current = null;
    };
  }, [gameId, autoPlay, start]);

  const caption = Number.isFinite(stepIndex) ? captionsRef.current[stepIndex] : null;
  const runtime = Math.round(tourSeconds(instanceRef.current?.demoTour || []));

  return (
    <div style={{
      position: "relative",
      width: "100%",
      height,
      borderRadius: 10,
      overflow: "hidden",
      background: "#06080A",
      border: `1px solid ${C.line}`,
    }}>
      <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />

      {/* ---- loading / error ---- */}
      {(phase === "loading" || phase === "error") && (
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center", gap: 10,
          padding: 24, textAlign: "center",
          color: phase === "error" ? C.orange : C.muted,
          fontSize: 14, background: "rgba(6,8,10,0.86)",
        }}>
          {phase === "loading" && (
            <Loader2 size={18} style={{ animation: "cslSpin 1s linear infinite" }} />
          )}
          <span>{phase === "error" ? error : "Building the site…"}</span>
          <style>{"@keyframes cslSpin { to { transform: rotate(360deg); } }"}</style>
        </div>
      )}

      {/* ---- the caption for the shot on screen ---- */}
      {phase === "playing" && caption && (
        <div style={{
          position: "absolute", left: 0, right: 0, bottom: 0,
          padding: "26px 18px 16px",
          background: "linear-gradient(to top, rgba(6,8,10,0.94), rgba(6,8,10,0))",
          color: C.ink, fontSize: "clamp(13px, 1.6vw, 19px)", lineHeight: 1.45,
          fontWeight: 600,
        }}>
          {caption}
        </div>
      )}

      {/* ---- the live badge ---- */}
      {phase === "playing" && (
        <div style={{
          position: "absolute", top: 10, left: 10,
          display: "flex", alignItems: "center", gap: 7,
          background: "rgba(6,8,10,0.72)", border: `1px solid ${C.line}`,
          borderRadius: 999, padding: "5px 11px",
          fontSize: 10.5, fontWeight: 900, letterSpacing: 1, color: C.yellow,
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%", background: C.red,
            boxShadow: `0 0 0 3px ${C.red}33`,
          }} />
          LIVE 3D DEMO
        </div>
      )}

      {/* ---- controls ---- */}
      <div style={{
        position: "absolute", top: 10, right: 10,
        display: "flex", gap: 7,
      }}>
        {speak?.supported && phase !== "loading" && phase !== "error" && (
          <button
            type="button"
            onClick={speak.toggle}
            title="Read the briefing aloud"
            style={ctrlStyle(speak.speaking)}
          >
            {speak.speaking ? <Pause size={14} /> : <Volume2 size={14} />}
          </button>
        )}
        {(phase === "done" || phase === "playing") && (
          <button type="button" onClick={start} title="Play the demo again" style={ctrlStyle(false)}>
            {phase === "done" ? <Play size={14} /> : <RotateCcw size={14} />}
          </button>
        )}
        {onClose && (
          <button type="button" onClick={onClose} title="Close the demo" style={ctrlStyle(false)}>
            <X size={14} />
          </button>
        )}
      </div>

      {/* ---- replay prompt once it has finished ---- */}
      {phase === "done" && (
        <button
          type="button"
          onClick={start}
          style={{
            position: "absolute", inset: 0, border: 0, cursor: "pointer",
            background: "rgba(6,8,10,0.55)", color: C.ink,
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 10, fontWeight: 800, fontSize: 15,
          }}
        >
          <Play size={34} color={C.yellow} />
          Play the 3D demo{runtime ? ` · ${runtime}s` : ""}
        </button>
      )}
    </div>
  );
}

function ctrlStyle(on) {
  return {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 30, height: 30, borderRadius: 7, cursor: "pointer",
    background: on ? C.purple : "rgba(6,8,10,0.72)",
    border: `1px solid ${C.line}`,
    color: on ? "#fff" : C.ink,
  };
}
