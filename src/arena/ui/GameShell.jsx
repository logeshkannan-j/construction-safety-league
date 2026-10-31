import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Play, RotateCcw, LogOut, Settings, Volume2, VolumeX, MonitorSmartphone,
  AlertTriangle, Loader2, Smartphone, Gamepad2, Keyboard, ChevronRight,
  Maximize2, X, ShieldAlert,
} from "lucide-react";
import {
  C, DIFFICULTIES, getDifficulty, QUALITY_LEVELS, ratingFor,
} from "../arenaConstants.js";
import { supportsWebGL, resolveQuality, isMobileLayout, isTouchDevice } from "../engine/gfx.js";
import { submitRun, fetchAllProfiles, buildLeaderboard } from "../arenaDb.js";
import { loadSettings, saveSettings } from "../identity.js";
import { sfx, setSoundEnabled, setVolume, unlockAudio, disposeAudio } from "../audio.js";
import { ArenaButton, Overlay, Pill, panelStyle } from "./primitives.jsx";
import {
  HudTopBar, Crosshair, InteractPrompt, ToastStack, useToasts,
  StatusMeter, ObjectiveList, Readouts, PaletteBar, ARENA_KEYFRAMES,
} from "./Hud.jsx";
import Joystick from "./Joystick.jsx";
import TouchLook from "./TouchLook.jsx";
import ActionButtonCluster, { CraneControls } from "./ActionButtons.jsx";
import ResultsScreen from "./ResultsScreen.jsx";

/* ------------------------------------------------------------------ *
 *  GAME SHELL
 *
 *  The single harness all five games run inside. It owns everything
 *  that is NOT gameplay:
 *
 *    - WebGL capability check and the unsupported-device fallback
 *    - the intro / briefing / controls / difficulty flow
 *    - lazy-loading the game module (each game is its own JS chunk, so
 *      visiting the quiz never downloads any 3D game code)
 *    - the loading screen and orientation prompt
 *    - the HUD, rendered from state the game reports (throttled, so a
 *      60fps game loop never triggers 60 React renders a second)
 *    - the mobile control layer: joystick, touch-look, action buttons
 *    - pause / restart / graphics / sound
 *    - in-game decision dialogs
 *    - submitting the finished run to Firebase and showing results
 *
 *  Games therefore contain only their own simulation and are written
 *  once for every device.
 * ------------------------------------------------------------------ */

// Lazy module map. Vite splits each into its own chunk.
const GAME_LOADERS = {
  "safety-mission": () => import("../games/safetyMission/index.js"),
  "crane-master": () => import("../games/craneMaster/index.js"),
  "safest-tower": () => import("../games/safestTower/index.js"),
  "escape-challenge": () => import("../games/escapeChallenge/index.js"),
  "emergency-commander": () => import("../games/emergencyCommander/index.js"),
};

const HUD_FLUSH_MS = 60;

function genRunId() {
  try { return crypto.randomUUID(); } catch {
    return "run-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }
}

/**
 * `embedded` runs the game as one stage of an integrated participant
 * session (see SoloSession.jsx) rather than as a standalone Arena game:
 * the run is NOT submitted to the Arena leaderboard, because the session
 * owns the scoring and banks it as the participant's 3D game score, and
 * the results screen offers "continue" instead of "play again".
 */
export default function GameShell({
  game, identity, onExit, onOpenLeaderboard,
  embedded = false, onEmbeddedComplete, roundLabel = "",
}) {
  /* ------------------------------ state ------------------------------ */

  const [phase, setPhase] = useState(() => (supportsWebGL() ? "briefing" : "unsupported"));
  const [difficultyId, setDifficultyId] = useState("normal");
  const [settings, setSettings] = useState(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [paused, setPaused] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [mobile, setMobile] = useState(isMobileLayout);
  const [portraitBlock, setPortraitBlock] = useState(false);
  const [hud, setHud] = useState({});
  const [dialog, setDialog] = useState(null);
  const [buttons, setButtons] = useState([]);
  const [result, setResult] = useState(null);
  // The game module carries its own briefing, objectives, scoring table
  // and control lists. It is loaded as soon as the shell mounts — both
  // so the briefing screen has real content to show, and so three.js and
  // the world builders finish downloading while the player reads it,
  // which makes START MISSION feel instant.
  const [gameModule, setGameModule] = useState(null);
  const [submitState, setSubmitState] = useState("idle");
  const [submitMessage, setSubmitMessage] = useState("");
  const [newAchievements, setNewAchievements] = useState([]);
  const [rank, setRank] = useState(null);
  const [personalBest, setPersonalBest] = useState(null);

  const { toasts, push: pushToast } = useToasts();

  const containerRef = useRef(null);
  const rootRef = useRef(null);
  const [fullscreen, setFullscreen] = useState(false);
  const instanceRef = useRef(null);
  const hudBufferRef = useRef({});
  const hudTimerRef = useRef(0);
  const finishedRef = useRef(false);
  const runIdRef = useRef(null);
  const lastResultRef = useRef(null);
  // `api` below is memoised once, so anything it calls must be reached
  // through a ref or it would capture the first render's closure — which
  // would submit every run under whatever difficulty was selected when
  // the component first mounted.
  const finishHandlerRef = useRef(null);

  const difficulty = useMemo(() => getDifficulty(difficultyId), [difficultyId]);
  const quality = useMemo(() => resolveQuality(settings.quality), [settings.quality]);

  // The registry entry (title, cover, accent, ceiling) plus whatever the
  // game module declares about itself (briefing, scoring, controls).
  const gameInfo = useMemo(() => {
    const meta = gameModule?.default || gameModule || null;
    if (!meta) return game;
    return {
      ...game,
      controls: meta.controls || game.controls,
      briefing: meta.briefing || null,
      desktopControls: meta.desktopControls || [],
      mobileControls: meta.mobileControls || [],
    };
  }, [game, gameModule]);

  /* --------------------------- responsiveness --------------------------- */

  useEffect(() => {
    function check() {
      setMobile(isMobileLayout());
      const portrait = window.innerHeight > window.innerWidth;
      setPortraitBlock(isTouchDevice() && portrait && window.innerWidth < 760);
    }
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  /* ------------------------------ audio ------------------------------ */

  useEffect(() => {
    setSoundEnabled(settings.sound);
    setVolume(settings.volume);
  }, [settings.sound, settings.volume]);

  useEffect(() => () => disposeAudio(), []);

  const updateSettings = useCallback((patch) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  /* --------------------------- HUD throttling --------------------------- */

  const flushHud = useCallback(() => {
    hudTimerRef.current = 0;
    const buffered = hudBufferRef.current;
    hudBufferRef.current = {};
    if (Object.keys(buffered).length) {
      setHud((current) => ({ ...current, ...buffered }));
    }
  }, []);

  const api = useMemo(() => ({
    hud(partial) {
      Object.assign(hudBufferRef.current, partial);
      if (!hudTimerRef.current) {
        hudTimerRef.current = setTimeout(flushHud, HUD_FLUSH_MS);
      }
    },
    toast(text, kind = "info", points) {
      pushToast(text, kind, points);
      if (kind === "good") sfx.correct();
      else if (kind === "bad") sfx.wrong();
      else if (kind === "warn") sfx.warning();
    },
    dialog(next) {
      // Opening a decision does NOT pause the simulation: each game
      // freezes its own player/controls while keeping its mission clock
      // running, because deciding under time pressure is the point. Only
      // the pause menu actually stops the clock.
      setDialog(next);
    },
    buttons(list) {
      setButtons(Array.isArray(list) ? list : []);
    },
    requestPause() {
      setPaused(true);
    },
    finish(runResult) {
      if (finishedRef.current) return;
      finishedRef.current = true;
      finishHandlerRef.current?.(runResult);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [flushHud, pushToast]);

  /* ---------------------------- game lifecycle ---------------------------- */

  const teardown = useCallback(() => {
    if (hudTimerRef.current) {
      clearTimeout(hudTimerRef.current);
      hudTimerRef.current = 0;
    }
    try { instanceRef.current?.dispose(); } catch (e) { console.error("[arena] dispose failed", e); }
    instanceRef.current = null;
    hudBufferRef.current = {};
    disposeAudio();
  }, []);

  useEffect(() => teardown, [teardown]);

  /* ------------------------ the back button ------------------------
   *
   * On a phone, Back — the button or the edge swipe — leaves the page,
   * and the page is the event. A player part way through a mission
   * taps it by reflex and drops out of the game entirely.
   *
   * There is no router here, so the fix is a sacrificial history
   * entry: push one when the mission starts, and when the browser
   * pops it, push another and PAUSE instead of going anywhere. Back
   * then means "stop and think", which is what the player meant, and
   * leaving is only possible through the pause menu's own exit.
   *
   * The entry is removed on unmount, so Back works normally
   * everywhere else in the app.
   */
  useEffect(() => {
    if (phase !== "playing" || typeof window === "undefined") return undefined;
    let armed = true;

    const onPop = () => {
      if (!armed) return;
      // Put the guard entry straight back, or the next Back really
      // does leave.
      window.history.pushState({ cslArenaGuard: true }, "");
      setPaused(true);
    };

    window.history.pushState({ cslArenaGuard: true }, "");
    window.addEventListener("popstate", onPop);
    return () => {
      armed = false;
      window.removeEventListener("popstate", onPop);
      // Take our entry back off, but only if it is still ours — if the
      // player navigated on, going back here would move them.
      if (window.history.state?.cslArenaGuard) window.history.back();
    };
  }, [phase]);

  /* --------------------------- full screen ---------------------------
   *
   * The shell already fills the browser WINDOW, but a window is not a
   * screen: browser chrome on a phone eats 100-150 px of height, and
   * these games are played in landscape where that is a third of the
   * view. Going properly full screen is the single biggest thing a
   * player can do for how much site they can see.
   */
  const fullscreenSupported = typeof document !== "undefined"
    && (document.fullscreenEnabled || document.webkitFullscreenEnabled || false);

  const toggleFullscreen = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const active = document.fullscreenElement || document.webkitFullscreenElement;
    try {
      if (active) {
        (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
      } else {
        (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el, { navigationUI: "hide" });
      }
    } catch (e) {
      // Safari on iPhone refuses this outright. Nothing to recover
      // from, and the button simply does not latch.
      console.warn("[arena] full screen unavailable", e);
    }
  }, []);

  // The browser owns this state: Escape and the system gesture both
  // leave full screen without going through the button.
  useEffect(() => {
    const sync = () => setFullscreen(
      !!(document.fullscreenElement || document.webkitFullscreenElement)
    );
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  // Preload the game module (and with it three.js and the 3D kit).
  useEffect(() => {
    if (phase === "unsupported") return;
    let cancelled = false;
    const loader = GAME_LOADERS[game.id];
    if (!loader) {
      setLoadError(`This game is not available in this build (no module registered for "${game.id}").`);
      return undefined;
    }
    loader()
      .then((mod) => { if (!cancelled) setGameModule(mod); })
      .catch((e) => {
        console.error("[arena] failed to preload game module", e);
        if (!cancelled) setLoadError("This game could not be downloaded. Check your connection and try again.");
      });
    return () => { cancelled = true; };
  }, [game.id, phase]);

  const startGame = useCallback(async () => {
    unlockAudio();
    sfx.missionStart();
    finishedRef.current = false;
    runIdRef.current = genRunId();
    setLoadError("");
    setHud({});
    setDialog(null);
    setButtons([]);
    setResult(null);
    setSubmitState("idle");
    setNewAchievements([]);
    setRank(null);
    setPaused(false);
    setPhase("loading");

    // Normally already resolved by the preload above; this await is the
    // fallback for a player who hits START before the download finishes.
    let mod = gameModule;
    if (!mod) {
      try {
        const loader = GAME_LOADERS[game.id];
        if (!loader) throw new Error(`No module registered for ${game.id}`);
        mod = await loader();
        setGameModule(mod);
      } catch (e) {
        console.error("[arena] failed to load game module", e);
        setLoadError("This game could not be loaded. Check your connection and try again.");
        setPhase("briefing");
        return;
      }
    }

    // Let React paint the canvas container before the (synchronous and
    // fairly heavy) world build runs, so the loading screen is visible.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const container = containerRef.current;
    if (!container) {
      // The canvas host vanished between START and the paint above (the
      // player backed out, or React re-mounted us). Never leave the loading
      // screen spinning with no explanation — go back to the briefing.
      setLoadError("The game view was closed before it finished loading. Press START to try again.");
      setPhase("briefing");
      return;
    }

    try {
      const createGame = mod.default?.create || mod.create;
      if (typeof createGame !== "function") throw new Error("Game module has no create()");
      instanceRef.current = createGame({
        container,
        difficulty,
        quality,
        settings,
        mobile,
        api,
      });
      setPhase("playing");
    } catch (e) {
      console.error("[arena] failed to start game", e);
      teardown();
      setLoadError(`This game failed to start: ${e.message}`);
      setPhase("briefing");
    }
  }, [api, difficulty, game.id, gameModule, mobile, quality, settings, teardown]);

  const restart = useCallback(() => {
    teardown();
    setPhase("briefing");
    // Immediately relaunch at the same difficulty — the player asked to
    // retry, not to re-read the briefing.
    setTimeout(() => startGame(), 0);
  }, [startGame, teardown]);

  const backToBriefing = useCallback(() => {
    teardown();
    setPaused(false);
    setDialog(null);
    setResult(null);
    setPhase("briefing");
  }, [teardown]);

  /* ------------------------------ pausing ------------------------------ */

  useEffect(() => {
    if (phase !== "playing") return;
    instanceRef.current?.setPaused(paused);
  }, [paused, phase]);

  // While a decision dialog is open the player must not also be walking
  // around behind it, so input is muted (the clock keeps running).
  useEffect(() => {
    if (phase !== "playing") return;
    instanceRef.current?.input?.setEnabled(!dialog && !paused);
  }, [dialog, paused, phase]);

  // Pause automatically if the tab is hidden or the window loses focus,
  // so a timed mission can't run down while the player is elsewhere.
  useEffect(() => {
    function onHidden() {
      if (document.hidden && phase === "playing") setPaused(true);
    }
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [phase]);

  /* --------------------------- finishing a run --------------------------- */

  async function handleFinish(runResult) {
    const timeTakenMs = runResult.timeTakenMs || 0;
    // The rating reflects how well the mission was PERFORMED, not the raw
    // score against the anti-cheat ceiling — a flawless run on Trainee
    // scores fewer points than a flawless run on Safety Manager, but both
    // deserve to be rated flawless.
    const performance = Math.max(0, Math.min(100, Math.round(
      runResult.performance ?? runResult.accuracy ?? 0
    )));
    const enriched = {
      ...runResult,
      performance,
      score: Math.max(0, Math.round(runResult.score || 0)),
      rating: runResult.rating || ratingFor(performance).label,
      timeTakenMs,
    };
    lastResultRef.current = enriched;
    setResult(enriched);
    setPhase("results");
    instanceRef.current?.setPaused(true);
    if (enriched.completed) sfx.missionComplete();
    else sfx.missionFailed();

    if (embedded) {
      // The session banks this score, so there is no separate Arena
      // submission and nothing to double-count.
      setSubmitState("session");
      return;
    }
    await submitResult(enriched);
  }

  // Always point the memoised api.finish at the current handler.
  finishHandlerRef.current = handleFinish;

  const submitResult = useCallback(async (enriched) => {
    if (!identity?.id) {
      setSubmitState("error");
      setSubmitMessage("No player profile is available on this device.");
      return;
    }
    setSubmitState("saving");
    setSubmitMessage("");
    try {
      const outcome = await submitRun(identity.id, {
        runId: runIdRef.current,
        playerName: identity.name || "Player",
        gameId: game.id,
        difficulty: difficultyId,
        score: enriched.score,
        completed: !!enriched.completed,
        accuracy: enriched.accuracy || 0,
        timeTakenMs: enriched.timeTakenMs || 0,
        rating: enriched.rating,
        stats: enriched.stats || {},
      });

      if (!outcome.ok) {
        setSubmitState("error");
        setSubmitMessage(outcome.message || "");
        return;
      }
      setSubmitState(outcome.duplicate ? "duplicate" : "saved");
      setNewAchievements(outcome.newAchievements || []);
      if (outcome.profile?.bestScores) {
        setPersonalBest(Number(outcome.profile.bestScores[game.id]) || 0);
      }
      if ((outcome.newAchievements || []).length) sfx.achievement();

      // One extra read to show the player where they now stand.
      const profiles = await fetchAllProfiles();
      const board = buildLeaderboard({ profiles, period: "alltime", gameId: game.id });
      const mine = board.find((r) => r.playerId === identity.id);
      setRank(mine ? mine.rank : null);
    } catch (e) {
      console.error("[arena] submit failed", e);
      setSubmitState("error");
      setSubmitMessage("Unexpected error while saving. See the browser console for detail.");
    }
  }, [difficultyId, game.id, identity]);

  /* ------------------------------ render ------------------------------ */

  if (phase === "unsupported") {
    return <UnsupportedScreen game={game} onExit={onExit} />;
  }

  const input = instanceRef.current?.input || null;
  const scheme = hud.controlScheme || game.controls;
  const interactive = phase === "playing" && !paused && !dialog && !portraitBlock;
  const showMobileControls = mobile && interactive;
  // Every mission has a stick now. In the walking ones it walks; in
  // the crane it IS the crane joystick, slewing the jib and running
  // the trolley, which is how the real cab works.
  const needsJoystick = showMobileControls && scheme !== "none";
  // Every scheme aims its camera by dragging, so the look pad covers the
  // play area on touch devices in all of them. On desktop the engine's
  // own mouse handling does the job, so the pad is not rendered there
  // (rendering both would double the look speed).
  const needsTouchLook = mobile && interactive;
  // The crane desk is shown on touch devices AND on desktop, because
  // clicking the rockers is a perfectly good alternative to the keys.
  const needsCraneDesk = interactive && scheme === "crane";

  return (
    <div
      ref={rootRef}
      style={{
        position: "fixed",
        inset: 0,
        background: C.bg,
        overflow: "hidden",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTapHighlightColor: "transparent",
        // Stops iOS Safari's rubber-band scroll behind the game.
        overscrollBehavior: "none",
        touchAction: "none",
      }}
    >
      <style>{ARENA_KEYFRAMES}</style>

      {/* ---------------- the 3D canvas host ---------------- */}
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
          background: C.bg,
        }}
      />

      {/* ---------------- touch look pad (sits under the HUD) ---------------- */}
      {needsTouchLook && (
        <TouchLook input={input} sensitivity={settings.lookSensitivity} />
      )}

      {/* ---------------- HUD ---------------- */}
      {phase === "playing" && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              paddingTop: "env(safe-area-inset-top, 0px)",
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
            }}
          >
            {hud.flashDanger && (
              <div style={{ position: "absolute", inset: 0, animation: "cslArenaFlashRed 1.1s ease-in-out infinite", pointerEvents: "none" }} />
            )}

            <HudTopBar
              objective={hud.objective || game.title}
              score={hud.score || 0}
              timeMs={hud.timeMs ?? null}
              progress={hud.progress ?? null}
              progressLabel={hud.progressLabel}
              accent={game.accent}
              danger={hud.danger}
              mobile={mobile}
              onPause={() => setPaused(true)}
              onFullscreen={fullscreenSupported ? toggleFullscreen : null}
              fullscreen={fullscreen}
            />

            {hud.crosshair && <Crosshair state={hud.crosshair} accent={game.accent} />}

            <InteractPrompt
              text={hud.prompt?.text}
              tone={hud.prompt?.tone}
              keyHint={hud.prompt?.key || "E"}
              mobile={mobile}
            />

            <ToastStack toasts={toasts} mobile={mobile} />

            {/* Meters, readouts and objective list, top-left. */}
            {(hud.meters?.length > 0 || hud.tasks?.length > 0 || hud.readouts?.length > 0) && (
              <div
                style={{
                  position: "absolute",
                  left: mobile ? 10 : 18,
                  top: mobile ? 92 : 118,
                  display: "flex",
                  flexDirection: "column",
                  gap: 7,
                  pointerEvents: "none",
                  maxWidth: mobile ? 220 : 300,
                }}
              >
                {hud.readouts?.length > 0 && (
                  <Readouts items={hud.readouts} mobile={mobile} title={hud.readoutsTitle} />
                )}
                {hud.meters?.map((m) => (
                  <StatusMeter key={m.label} {...m} mobile={mobile} />
                ))}
                {hud.tasks?.length > 0 && (
                  <ObjectiveList items={hud.tasks} mobile={mobile} title={hud.tasksTitle || "MISSION TASKS"} collapsed={mobile} />
                )}
              </div>
            )}

            {/* Component palette (Build the Safest Tower), bottom-centre. */}
            {interactive && hud.palette && (
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  transform: "translateX(-50%)",
                  bottom: "max(14px, calc(env(safe-area-inset-bottom, 0px) + 10px))",
                  pointerEvents: "auto",
                }}
              >
                <PaletteBar palette={hud.palette} mobile={mobile} />
              </div>
            )}

            {/* Tower crane control desk, bottom-left. */}
            {needsCraneDesk && (
              <div
                style={{
                  position: "absolute",
                  left: "max(14px, env(safe-area-inset-left, 0px))",
                  bottom: "max(18px, calc(env(safe-area-inset-bottom, 0px) + 12px))",
                  pointerEvents: "auto",
                }}
              >
                <CraneControls input={input} mobile={mobile} readouts={hud.craneReadouts} disabled={hud.controlsLocked} hoistOnly={needsJoystick} />
              </div>
            )}

            {/* ---------------- mobile controls ---------------- */}
            {needsJoystick && (
              <div
                style={{
                  position: "absolute",
                  left: "max(16px, env(safe-area-inset-left, 0px))",
                  bottom: "max(26px, calc(env(safe-area-inset-bottom, 0px) + 20px))",
                  pointerEvents: "auto",
                }}
              >
                <Joystick input={input} accent={game.accent} size={mobile ? 124 : 132} />
              </div>
            )}

            {/* Action buttons: always on touch, and on desktop for the
                schemes whose actions have no natural key (crane release,
                command decisions). */}
            {interactive && buttons.length > 0 && (mobile || scheme === "crane" || scheme === "build" || scheme === "command") && (
              <div
                style={{
                  position: "absolute",
                  right: "max(14px, env(safe-area-inset-right, 0px))",
                  bottom: "max(22px, calc(env(safe-area-inset-bottom, 0px) + 16px))",
                  pointerEvents: "none",
                }}
              >
                <ActionButtonCluster buttons={buttons} input={input} compact={window.innerHeight < 420} />
              </div>
            )}

            {/* Desktop key reminder strip */}
            {!mobile && hud.keyHints?.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  left: 18,
                  bottom: 16,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  maxWidth: "60vw",
                  pointerEvents: "none",
                }}
              >
                {hud.keyHints.map((hint) => (
                  <span
                    key={hint.key + hint.label}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      background: C.bg + "cc", border: `1px solid ${C.line}`,
                      borderRadius: 7, padding: "4px 8px", fontSize: 11, color: C.muted,
                    }}
                  >
                    <kbd style={{ background: C.surfaceRaised, color: C.ink, borderRadius: 4, padding: "1px 6px", fontWeight: 800, fontFamily: "inherit" }}>
                      {hint.key}
                    </kbd>
                    {hint.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------- decision dialog ---------------- */}
      {dialog && phase === "playing" && (
        <DecisionDialog dialog={dialog} mobile={mobile} accent={game.accent} />
      )}

      {/* ---------------- loading ---------------- */}
      {phase === "loading" && <LoadingScreen game={gameInfo} difficulty={difficulty} />}

      {/* ---------------- briefing ---------------- */}
      {phase === "briefing" && (
        <BriefingScreen
          game={gameInfo}
          ready={!!gameModule}
          embedded={embedded}
          roundLabel={roundLabel}
          difficultyId={difficultyId}
          setDifficultyId={setDifficultyId}
          onStart={startGame}
          onExit={onExit}
          mobile={mobile}
          error={loadError}
          quality={quality}
          settings={settings}
          updateSettings={updateSettings}
        />
      )}

      {/* ---------------- pause ---------------- */}
      {paused && phase === "playing" && (
        <PauseMenu
          game={game}
          settings={settings}
          updateSettings={updateSettings}
          quality={quality}
          showSettings={showSettings}
          setShowSettings={setShowSettings}
          onResume={() => setPaused(false)}
          onRestart={restart}
          onQuit={() => { teardown(); onExit(); }}
          mobile={mobile}
        />
      )}

      {/* ---------------- results ---------------- */}
      {phase === "results" && result && (
        <ResultsScreen
          game={game}
          result={result}
          difficulty={difficulty}
          newAchievements={newAchievements}
          rank={rank}
          personalBest={personalBest}
          submitState={submitState}
          submitMessage={submitMessage}
          embedded={embedded}
          onRetrySubmit={() => lastResultRef.current && submitResult(lastResultRef.current)}
          onReplay={restart}
          onContinue={() => {
            teardown();
            onEmbeddedComplete?.({ ...result, gameId: game.id });
          }}
          onExit={() => { teardown(); onExit(); }}
          onLeaderboard={() => { teardown(); onOpenLeaderboard?.(game.id); }}
          mobile={mobile}
        />
      )}

      {/* ---------------- portrait prompt ---------------- */}
      {portraitBlock && phase === "playing" && (
        <RotatePrompt onPlayAnyway={() => setPortraitBlock(false)} />
      )}
    </div>
  );
}

/* ====================== briefing / intro screen ====================== */

function BriefingScreen({
  game, ready, difficultyId, setDifficultyId, onStart, onExit, mobile, error,
  quality, settings, updateSettings, embedded = false, roundLabel = "",
}) {
  const [tab, setTab] = useState("brief");
  // Skipping inside a session costs the participant their 3D score, so
  // the control needs a confirming second tap rather than a small ✕.
  const [confirmSkip, setConfirmSkip] = useState(false);
  const difficulty = getDifficulty(difficultyId);

  return (
    <Overlay align="top" blur={false}>
      <div
        style={{
          width: "min(100%, 760px)",
          animation: "cslArenaRise .35s ease-out",
        }}
      >
        {/* header */}
        <div
          style={{
            ...panelStyle,
            padding: mobile ? 16 : 24,
            marginBottom: 12,
            borderTop: `3px solid ${game.accent}`,
            background: `linear-gradient(160deg, ${game.accent}14, ${C.surface} 45%)`,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Pill color={game.accent}>{roundLabel || "3D SAFETY GAMING ARENA"}</Pill>
              <h1 style={{ fontSize: mobile ? 24 : 32, fontWeight: 900, margin: "10px 0 6px", letterSpacing: -0.8, lineHeight: 1.1 }}>
                {game.title}
              </h1>
              <p style={{ color: game.accent, fontSize: mobile ? 13 : 15, fontWeight: 700, margin: 0 }}>
                {game.tagline}
              </p>
            </div>
            {embedded ? (
              <button
                type="button"
                onClick={() => { if (confirmSkip) onExit(); else setConfirmSkip(true); }}
                style={{
                  background: confirmSkip ? C.red : "none",
                  border: `1px solid ${confirmSkip ? C.red : C.line}`,
                  borderRadius: 9, color: confirmSkip ? "#fff" : C.muted,
                  padding: "8px 11px", cursor: "pointer", flexShrink: 0,
                  fontSize: 12, fontWeight: 700, maxWidth: 160, lineHeight: 1.3,
                }}
              >
                {confirmSkip ? "Tap again to skip — scores 0" : "Skip this mission"}
              </button>
            ) : (
              <button
                type="button"
                onClick={onExit}
                aria-label="Back to the Gaming Arena"
                style={{
                  background: "none", border: `1px solid ${C.line}`, borderRadius: 9,
                  color: C.muted, width: 36, height: 36, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}
              >
                <X size={17} />
              </button>
            )}
          </div>
          <p style={{ color: C.muted, fontSize: mobile ? 13 : 14, lineHeight: 1.6, margin: "12px 0 0" }}>
            {game.description}
          </p>
        </div>

        {/* tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {[
            ["brief", "Mission briefing"],
            ["controls", "Controls"],
            ["difficulty", "Difficulty"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => { sfx.click(); setTab(id); }}
              style={{
                padding: "7px 14px",
                borderRadius: 20,
                border: `1px solid ${tab === id ? game.accent : C.line}`,
                background: tab === id ? game.accent + "1f" : "transparent",
                color: tab === id ? game.accent : C.muted,
                fontSize: 12,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ ...panelStyle, padding: mobile ? 14 : 20, marginBottom: 12 }}>
          {!ready && tab !== "difficulty" && (
            <p style={{ color: C.muted, fontSize: 13, display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
              <Loader2 size={14} style={{ animation: "cslArenaSpin 1s linear infinite" }} />
              Downloading the mission…
            </p>
          )}
          {ready && tab === "brief" && <BriefTab game={game} mobile={mobile} />}
          {ready && tab === "controls" && <ControlsTab game={game} mobile={mobile} />}
          {tab === "difficulty" && (
            <DifficultyTab
              difficultyId={difficultyId}
              setDifficultyId={setDifficultyId}
              quality={quality}
              settings={settings}
              updateSettings={updateSettings}
              mobile={mobile}
            />
          )}
        </div>

        {error && (
          <div
            style={{
              display: "flex", alignItems: "center", gap: 8,
              background: C.red + "18", border: `1px solid ${C.red}66`,
              borderRadius: 10, padding: "10px 13px", marginBottom: 12,
              color: C.ink, fontSize: 13,
            }}
          >
            <AlertTriangle size={15} color={C.red} style={{ flexShrink: 0 }} />
            {error}
          </div>
        )}

        {/* start */}
        <div style={{ ...panelStyle, padding: mobile ? 14 : 18, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          <div style={{ flex: "1 1 180px", minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: C.muted }}>SELECTED DIFFICULTY</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: difficulty.color }}>{difficulty.label}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{difficulty.desc}</div>
          </div>
          <ArenaButton
            onClick={onStart}
            color={game.accent}
            size="lg"
            disabled={!ready && !error}
            icon={ready ? <Play size={18} /> : <Loader2 size={18} style={{ animation: "cslArenaSpin 1s linear infinite" }} />}
            style={{ flex: "1 1 180px" }}
          >
            {ready ? "START MISSION" : "LOADING…"}
          </ArenaButton>
        </div>

        <div style={{ height: 24 }} />
      </div>
    </Overlay>
  );
}

function BriefTab({ game, mobile }) {
  const brief = game.briefing || {};
  return (
    <div>
      {brief.role && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: C.muted, marginBottom: 5 }}>YOUR ROLE</div>
          <div style={{ fontSize: mobile ? 14 : 15, fontWeight: 700, color: C.ink, lineHeight: 1.5 }}>{brief.role}</div>
        </div>
      )}
      {brief.objectives?.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: C.muted, marginBottom: 7 }}>OBJECTIVES</div>
          {brief.objectives.map((o, i) => (
            <div key={i} style={{ display: "flex", gap: 9, marginBottom: 6, fontSize: mobile ? 13 : 14, lineHeight: 1.5 }}>
              <span
                style={{
                  width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                  background: game.accent + "22", border: `1px solid ${game.accent}66`,
                  color: game.accent, fontSize: 11, fontWeight: 900,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {i + 1}
              </span>
              <span style={{ color: C.ink }}>{o}</span>
            </div>
          ))}
        </div>
      )}
      {brief.scoring?.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: C.muted, marginBottom: 7 }}>SCORING</div>
          <div style={{ display: "grid", gap: 4 }}>
            {brief.scoring.map((s, i) => (
              <div
                key={i}
                style={{
                  display: "flex", justifyContent: "space-between", gap: 10,
                  background: C.surfaceRaised, borderRadius: 7, padding: "7px 11px", fontSize: 12.5,
                }}
              >
                <span style={{ color: C.ink }}>{s.label}</span>
                <b style={{ color: s.value.toString().trim().startsWith("-") ? C.red : C.green, whiteSpace: "nowrap" }}>{s.value}</b>
              </div>
            ))}
          </div>
        </div>
      )}
      {brief.tips?.length > 0 && (
        <div
          style={{
            background: C.yellow + "0f", border: `1px solid ${C.yellow}44`,
            borderRadius: 10, padding: 12,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: C.yellow, marginBottom: 6 }}>SAFETY OFFICER'S NOTES</div>
          {brief.tips.map((t, i) => (
            <div key={i} style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.5, marginBottom: 4, display: "flex", gap: 7 }}>
              <span style={{ color: C.yellow }}>▸</span>
              <span>{t}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ControlsTab({ game, mobile }) {
  const touch = isTouchDevice();
  const mobileGroup = { id: "mobile", label: "Touch / phone / tablet", icon: <Smartphone size={14} />, rows: game.mobileControls || [] };
  const desktopGroup = { id: "desktop", label: "Keyboard & mouse", icon: <Keyboard size={14} />, rows: game.desktopControls || [] };
  // Show whichever scheme the player is actually on first.
  const ordered = touch ? [mobileGroup, desktopGroup] : [desktopGroup, mobileGroup];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {ordered.filter((g) => g.rows.length).map((group) => (
        <div key={group.id}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 900, letterSpacing: 0.8, color: C.muted, marginBottom: 8 }}>
            {group.icon}
            {group.label.toUpperCase()}
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            {group.rows.map(([control, desc], i) => (
              <div
                key={i}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: C.surfaceRaised, borderRadius: 7, padding: "7px 11px",
                }}
              >
                <span
                  style={{
                    background: C.bg, border: `1px solid ${C.line}`, borderRadius: 5,
                    padding: "3px 8px", fontSize: 11, fontWeight: 900, color: game.accent,
                    minWidth: 74, textAlign: "center", flexShrink: 0,
                  }}
                >
                  {control}
                </span>
                <span style={{ fontSize: mobile ? 12.5 : 13, color: C.ink }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {touch && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.muted, background: C.surfaceRaised, borderRadius: 9, padding: "9px 12px" }}>
          <MonitorSmartphone size={15} color={C.green} style={{ flexShrink: 0 }} />
          Turn your phone sideways for the best view — the controls lay themselves out automatically.
        </div>
      )}
    </div>
  );
}

function DifficultyTab({ difficultyId, setDifficultyId, quality, settings, updateSettings, mobile }) {
  return (
    <div>
      <div style={{ display: "grid", gap: 8, marginBottom: 18 }}>
        {DIFFICULTIES.map((d) => {
          const active = d.id === difficultyId;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => { sfx.click(); setDifficultyId(d.id); }}
              style={{
                display: "flex", alignItems: "center", gap: 12, textAlign: "left",
                background: active ? d.color + "16" : C.surfaceRaised,
                border: `1px solid ${active ? d.color : C.line}`,
                borderRadius: 10, padding: "11px 13px", cursor: "pointer", color: C.ink,
              }}
            >
              <span
                style={{
                  width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                  border: `2px solid ${active ? d.color : C.line}`,
                  background: active ? d.color : "transparent",
                }}
              />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 900, fontSize: 14, color: active ? d.color : C.ink }}>{d.label}</span>
                <span style={{ display: "block", fontSize: 12, color: C.muted, marginTop: 1 }}>{d.desc}</span>
              </span>
              {active && <ChevronRight size={16} color={d.color} style={{ marginLeft: "auto", flexShrink: 0 }} />}
            </button>
          );
        })}
      </div>

      <GraphicsAndSound quality={quality} settings={settings} updateSettings={updateSettings} mobile={mobile} />
    </div>
  );
}

function GraphicsAndSound({ quality, settings, updateSettings, mobile }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: C.muted, marginBottom: 8 }}>
        GRAPHICS — DETECTED: {quality.toUpperCase()}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {[{ id: "auto", label: "Auto", desc: "Match this device" }, ...QUALITY_LEVELS].map((q) => {
          const active = settings.quality === q.id;
          return (
            <button
              key={q.id}
              type="button"
              title={q.desc}
              onClick={() => { sfx.click(); updateSettings({ quality: q.id }); }}
              style={{
                padding: "7px 13px", borderRadius: 8,
                border: `1px solid ${active ? C.green : C.line}`,
                background: active ? C.green + "1f" : "transparent",
                color: active ? C.green : C.muted,
                fontSize: 12, fontWeight: 800, cursor: "pointer",
              }}
            >
              {q.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: mobile ? "1fr" : "1fr 1fr" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: C.muted, marginBottom: 8 }}>SOUND</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              onClick={() => { unlockAudio(); updateSettings({ sound: !settings.sound }); if (!settings.sound) sfx.click(); }}
              style={{
                display: "flex", alignItems: "center", gap: 7, padding: "7px 12px", borderRadius: 8,
                border: `1px solid ${settings.sound ? C.green : C.line}`,
                background: settings.sound ? C.green + "1f" : "transparent",
                color: settings.sound ? C.green : C.muted, fontSize: 12, fontWeight: 800, cursor: "pointer",
              }}
            >
              {settings.sound ? <Volume2 size={14} /> : <VolumeX size={14} />}
              {settings.sound ? "On" : "Off"}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.volume}
              onChange={(e) => updateSettings({ volume: Number(e.target.value) })}
              disabled={!settings.sound}
              aria-label="Volume"
              style={{ flex: 1, accentColor: C.green, minWidth: 0 }}
            />
          </div>
        </div>

        <div>
          <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: C.muted, marginBottom: 8 }}>
            LOOK SENSITIVITY — {settings.lookSensitivity.toFixed(1)}x
          </div>
          <input
            type="range"
            min="0.4"
            max="2.4"
            step="0.1"
            value={settings.lookSensitivity}
            onChange={(e) => updateSettings({ lookSensitivity: Number(e.target.value) })}
            aria-label="Look sensitivity"
            style={{ width: "100%", accentColor: C.yellow }}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: C.muted, marginTop: 7, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={settings.invertY}
              onChange={(e) => updateSettings({ invertY: e.target.checked })}
            />
            Invert vertical look
          </label>
        </div>
      </div>
    </div>
  );
}

/* =========================== loading screen =========================== */

function LoadingScreen({ game, difficulty }) {
  const [tipIndex, setTipIndex] = useState(0);
  const tips = game.briefing?.tips || ["Checking site conditions…"];

  useEffect(() => {
    const id = setInterval(() => setTipIndex((i) => (i + 1) % tips.length), 2600);
    return () => clearInterval(id);
  }, [tips.length]);

  return (
    <Overlay blur={false}>
      <div style={{ textAlign: "center", width: "min(100%, 460px)" }}>
        <div
          style={{
            width: 64, height: 64, margin: "0 auto 20px", borderRadius: "50%",
            border: `3px solid ${C.line}`, borderTopColor: game.accent,
            animation: "cslArenaSpin .9s linear infinite",
          }}
        />
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.6, color: game.accent, marginBottom: 7 }}>
          BUILDING THE SITE
        </div>
        <div style={{ fontSize: 21, fontWeight: 900, marginBottom: 6 }}>{game.title}</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 22 }}>
          {difficulty.label} · preparing 3D environment
        </div>
        <div
          style={{
            background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10,
            padding: "12px 15px", fontSize: 12.5, color: C.ink, lineHeight: 1.55,
            minHeight: 62, display: "flex", alignItems: "center", gap: 9, textAlign: "left",
          }}
        >
          <ShieldAlert size={16} color={C.yellow} style={{ flexShrink: 0 }} />
          {tips[tipIndex]}
        </div>
      </div>
    </Overlay>
  );
}

/* ============================= pause menu ============================= */

function PauseMenu({
  game, settings, updateSettings, quality, showSettings, setShowSettings,
  onResume, onRestart, onQuit, mobile,
}) {
  return (
    <Overlay onBackdrop={onResume}>
      <div style={{ ...panelStyle, width: "min(100%, 520px)", padding: mobile ? 16 : 22, animation: "cslArenaRise .25s ease-out" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4 }}>
          <Gamepad2 size={19} color={game.accent} />
          <h2 style={{ fontSize: 19, fontWeight: 900, margin: 0 }}>Mission paused</h2>
        </div>
        <p style={{ color: C.muted, fontSize: 12.5, margin: "0 0 18px" }}>
          The clock is stopped. Nothing is lost.
        </p>

        {!showSettings ? (
          <div style={{ display: "grid", gap: 8 }}>
            <ArenaButton onClick={onResume} color={game.accent} size="lg" icon={<Play size={17} />} full>
              RESUME
            </ArenaButton>
            <ArenaButton onClick={() => setShowSettings(true)} color={C.muted} variant="outline" icon={<Settings size={16} />} full>
              Graphics & sound
            </ArenaButton>
            {document.fullscreenEnabled && (
              <ArenaButton
                onClick={() => {
                  const el = document.documentElement;
                  if (document.fullscreenElement) document.exitFullscreen?.();
                  else el.requestFullscreen?.().catch(() => {});
                }}
                color={C.muted}
                variant="outline"
                icon={<Maximize2 size={16} />}
                full
              >
                Toggle fullscreen
              </ArenaButton>
            )}
            <ArenaButton onClick={onRestart} color={C.orange} variant="outline" icon={<RotateCcw size={16} />} full>
              Restart mission
            </ArenaButton>
            <ArenaButton onClick={onQuit} color={C.red} variant="outline" icon={<LogOut size={16} />} full>
              Quit to Gaming Arena
            </ArenaButton>
            <p style={{ fontSize: 11, color: C.muted, textAlign: "center", margin: "6px 0 0" }}>
              Quitting abandons this run — nothing is saved to the leaderboard.
            </p>
          </div>
        ) : (
          <div>
            <GraphicsAndSound quality={quality} settings={settings} updateSettings={updateSettings} mobile={mobile} />
            <div style={{ fontSize: 11, color: C.muted, margin: "14px 0" }}>
              Changing graphics quality applies when you restart the mission.
            </div>
            <ArenaButton onClick={() => setShowSettings(false)} color={game.accent} full>
              Back
            </ArenaButton>
          </div>
        )}
      </div>
    </Overlay>
  );
}

/* ========================== decision dialog ========================== */

// Exported so the layout contract can be tested without standing up a
// WebGL stage. It is the one panel that regularly does not fit.
export function DecisionDialog({ dialog, mobile, accent }) {
  const color = dialog.tone === "danger" ? C.red : dialog.tone === "good" ? C.green : accent;
  return (
    <Overlay align={mobile ? "top" : "center"} blur={false} onBackdrop={dialog.dismissable ? dialog.onDismiss : undefined}>
      <div
        style={{
          ...panelStyle,
          width: "min(100%, 620px)",
          padding: 0,
          borderTop: `3px solid ${color}`,
          animation: "cslArenaRise .22s ease-out",
          // Never taller than the space it is given. A four-option
          // decision in a landscape phone window does not fit, so the
          // panel caps itself and scrolls the ANSWERS rather than
          // letting them fall off the bottom where they cannot be
          // reached.
          maxHeight: "100%",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        {/* The question stays put while the answers scroll under it. */}
        <div style={{ flex: "0 0 auto", padding: mobile ? "14px 14px 0" : "20px 20px 0" }}>
          {dialog.eyebrow && (
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.3, color, marginBottom: 7 }}>
              {dialog.eyebrow}
            </div>
          )}
          <h3 style={{ fontSize: mobile ? 16 : 19, fontWeight: 900, margin: "0 0 6px", lineHeight: 1.3 }}>
            {dialog.title}
          </h3>
        </div>

        <div
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            padding: mobile ? "0 14px 14px" : "0 20px 20px",
          }}
        >
        {dialog.subtitle && (
          <p style={{ color: C.muted, fontSize: mobile ? 12.5 : 13.5, lineHeight: 1.55, margin: "8px 0 14px" }}>
            {dialog.subtitle}
          </p>
        )}

        {dialog.timerMs !== undefined && dialog.timerMs !== null && (
          <div style={{ height: 4, background: C.bg, borderRadius: 2, overflow: "hidden", marginBottom: 14 }}>
            <div
              style={{
                width: `${dialog.timerPercent ?? 100}%`,
                height: "100%",
                background: (dialog.timerPercent ?? 100) < 30 ? C.red : color,
                transition: "width .25s linear",
              }}
            />
          </div>
        )}

        <div style={{ display: "grid", gap: 7 }}>
          {(dialog.options || []).map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={opt.disabled}
              onClick={() => { sfx.click(); dialog.onPick?.(opt.id); }}
              style={{
                display: "flex", alignItems: "center", gap: 11, textAlign: "left",
                background: C.surfaceRaised,
                border: `1px solid ${opt.disabled ? C.line : C.line}`,
                borderRadius: 10, padding: mobile ? "11px 12px" : "13px 15px",
                color: opt.disabled ? C.muted : C.ink,
                cursor: opt.disabled ? "not-allowed" : "pointer",
                opacity: opt.disabled ? 0.5 : 1,
                minHeight: 50,
                width: "100%",
              }}
              onMouseEnter={(e) => { if (!opt.disabled) e.currentTarget.style.borderColor = color; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.line; }}
            >
              {opt.badge && (
                <span
                  style={{
                    width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                    background: color + "22", border: `1px solid ${color}66`, color,
                    fontSize: 12, fontWeight: 900,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {opt.badge}
                </span>
              )}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 800, fontSize: mobile ? 13 : 14, lineHeight: 1.35 }}>
                  {opt.label}
                </span>
                {opt.desc && (
                  <span style={{ display: "block", fontSize: 11.5, color: C.muted, marginTop: 2, lineHeight: 1.4 }}>
                    {opt.desc}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>

        {dialog.footer && (
          <p style={{ fontSize: 11, color: C.muted, margin: "14px 0 0", lineHeight: 1.5 }}>{dialog.footer}</p>
        )}

        {dialog.dismissable && (
          <ArenaButton onClick={dialog.onDismiss} color={C.muted} variant="outline" size="sm" style={{ marginTop: 12 }}>
            {dialog.dismissLabel || "Close"}
          </ArenaButton>
        )}
        </div>
      </div>
    </Overlay>
  );
}

/* ====================== rotate / unsupported ====================== */

function RotatePrompt({ onPlayAnyway }) {
  return (
    <Overlay blur>
      <div style={{ textAlign: "center", width: "min(100%, 360px)" }}>
        <Smartphone
          size={54}
          color={C.yellow}
          style={{ transform: "rotate(90deg)", animation: "cslArenaPulse 1.6s ease-in-out infinite" }}
        />
        <h3 style={{ fontSize: 19, fontWeight: 900, margin: "18px 0 7px" }}>Turn your phone sideways</h3>
        <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.55, marginBottom: 18 }}>
          These games are built for landscape — you'll see much more of the site and the controls
          sit under your thumbs.
        </p>
        <ArenaButton onClick={onPlayAnyway} color={C.muted} variant="outline" full>
          Play in portrait anyway
        </ArenaButton>
      </div>
    </Overlay>
  );
}

function UnsupportedScreen({ game, onExit }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <style>{ARENA_KEYFRAMES}</style>
      <div style={{ ...panelStyle, width: "min(100%, 460px)", textAlign: "center" }}>
        <AlertTriangle size={40} color={C.orange} />
        <h2 style={{ fontSize: 20, fontWeight: 900, margin: "14px 0 8px" }}>3D is not available here</h2>
        <p style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.6, marginBottom: 8 }}>
          This browser could not create a WebGL context, which the 3D games need. The quiz works
          perfectly without it.
        </p>
        <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.6, marginBottom: 18, textAlign: "left" }}>
          Common fixes: update your browser, turn on hardware acceleration in its settings, or try
          Chrome on Android / Safari on iOS. Some corporate devices block WebGL by policy.
        </p>
        <ArenaButton onClick={onExit} color={game?.accent || C.yellow} full>
          Back to the Gaming Arena
        </ArenaButton>
      </div>
    </div>
  );
}
