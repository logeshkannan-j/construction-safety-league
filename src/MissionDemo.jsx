/* ------------------------------------------------------------------ *
 *  MISSION DEMO — the instruction screen shown before a round starts.
 *
 *  Three things in one screen, in English or Tamil:
 *
 *    the demo video   if the host has pasted one for this mission in
 *                     this language (game.missionVideos), it plays at
 *                     the top. Until then the screen falls back to the
 *                     written brief, so it is useful with no video at
 *                     all.
 *    the brief        what the mission asks, how to play it, how it is
 *                     scored — from missionBriefs.js.
 *    the rules        the event's rules and regulations.
 *
 *  "with voice": the brief can be READ ALOUD through the browser's own
 *  speech synthesiser, in English or Tamil, so a crew that would rather
 *  listen than read can. It needs no files and no network, but it does
 *  depend on the device having a voice installed for that language —
 *  Tamil is not present on every device, so the button says when it is
 *  not available rather than silently doing nothing.
 *
 *  Used on the TV (large, host-driven) and on a player's phone while
 *  they wait for the host to release the round (compact).
 * ------------------------------------------------------------------ */

import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Play, Pause, Languages, ListChecks, ShieldAlert, Trophy, Gamepad2, Volume2, VolumeX,
} from "lucide-react";
import { COLORS } from "./theme.js";
import {
  LANGUAGES, DEFAULT_LANGUAGE, isLanguage, languageById,
  missionBrief, eventRules, briefSpeech, missionVideoUrl,
} from "./missionBriefs.js";
import { SITE_NAME } from "./arena/arenaConstants.js";

// The live 3D demo mounts the real mission world, so it pulls in
// three.js. Loaded only when somebody actually opens a briefing.
const MissionDemoPlayer = lazy(() => import("./arena/ui/MissionDemoPlayer.jsx"));

/* --------------------------- the voice-over --------------------------- */

/**
 * Wraps window.speechSynthesis.
 *
 * Kept behind a hook because the API is a global with its own queue:
 * two components speaking at once would talk over each other, and a
 * component that unmounts mid-sentence leaves the device still talking.
 */
function useSpeech(text, speechLang) {
  const [speaking, setSpeaking] = useState(false);
  const [voiceReady, setVoiceReady] = useState(null); // null = still looking
  const utteranceRef = useRef(null);

  const synth = typeof window !== "undefined" ? window.speechSynthesis : null;

  // Voices load asynchronously, and on some browsers the first call
  // returns an empty list.
  useEffect(() => {
    if (!synth) { setVoiceReady(false); return undefined; }
    let cancelled = false;
    const look = () => {
      if (cancelled) return;
      const voices = synth.getVoices() || [];
      if (!voices.length) return;              // try again on the event
      const base = String(speechLang).split("-")[0].toLowerCase();
      setVoiceReady(voices.some((v) => String(v.lang || "").toLowerCase().startsWith(base)));
    };
    look();
    synth.addEventListener?.("voiceschanged", look);
    // Some browsers never fire the event if voices were already loaded.
    const id = setTimeout(() => { if (!cancelled) setVoiceReady((v) => (v === null ? false : v)); }, 1500);
    return () => {
      cancelled = true;
      clearTimeout(id);
      synth.removeEventListener?.("voiceschanged", look);
    };
  }, [synth, speechLang]);

  const stop = useCallback(() => {
    try { synth?.cancel(); } catch { /* not supported */ }
    setSpeaking(false);
  }, [synth]);

  // Never leave a device talking after the screen has gone.
  useEffect(() => stop, [stop]);
  // Changing language or mission stops whatever is being said.
  useEffect(() => { stop(); }, [text, speechLang, stop]);

  const start = useCallback(() => {
    if (!synth || !text) return;
    try {
      synth.cancel();
      const u = new window.SpeechSynthesisUtterance(text);
      u.lang = speechLang;
      u.rate = 0.95;
      const base = String(speechLang).split("-")[0].toLowerCase();
      const match = (synth.getVoices() || [])
        .find((v) => String(v.lang || "").toLowerCase().startsWith(base));
      if (match) u.voice = match;
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      utteranceRef.current = u;
      synth.speak(u);
      setSpeaking(true);
    } catch {
      setSpeaking(false);
    }
  }, [synth, text, speechLang]);

  return {
    speaking,
    supported: !!synth,
    voiceReady,
    toggle: () => (speaking ? stop() : start()),
    stop,
  };
}

/* ----------------------------- the video ----------------------------- */

function DemoVideo({ url, compact }) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(parsed.protocol)) return null;

  const youtubeId = parsed.hostname.includes("youtu.be")
    ? parsed.pathname.slice(1)
    : parsed.hostname.includes("youtube.com") ? parsed.searchParams.get("v") : null;

  const frame = {
    width: "100%",
    aspectRatio: "16 / 9",
    border: 0,
    borderRadius: 10,
    background: "#000",
    maxHeight: compact ? 220 : "none",
  };

  if (youtubeId) {
    return (
      <iframe
        title="Mission demo"
        src={`https://www.youtube.com/embed/${encodeURIComponent(youtubeId)}`}
        style={frame}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }
  return (
    <video controls preload="metadata" src={url} style={{ ...frame, objectFit: "contain" }}>
      Your browser cannot play this video.
    </video>
  );
}

/* ------------------------------ the list ------------------------------ */

function Bullets({ items, color, numbered, size }) {
  return (
    <ol style={{
      listStyle: "none", margin: 0, padding: 0,
      display: "grid", gap: size === "tv" ? 10 : 7,
    }}>
      {items.map((line, i) => (
        <li key={line} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{
            flex: "0 0 auto",
            minWidth: numbered ? (size === "tv" ? 26 : 20) : 8,
            height: numbered ? (size === "tv" ? 26 : 20) : 8,
            marginTop: numbered ? 0 : (size === "tv" ? 9 : 7),
            borderRadius: numbered ? 6 : "50%",
            background: numbered ? `${color}22` : color,
            color,
            fontWeight: 900,
            fontSize: size === "tv" ? 14 : 11,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {numbered ? i + 1 : ""}
          </span>
          <span style={{
            color: COLORS.ink,
            fontSize: size === "tv" ? 19 : 13.5,
            lineHeight: 1.5,
          }}>
            {line}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Section({ icon, title, color, children, size }) {
  return (
    <div style={{
      background: COLORS.surface,
      border: `1px solid ${COLORS.line}`,
      borderRadius: 10,
      padding: size === "tv" ? "18px 20px" : "13px 14px",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        marginBottom: size === "tv" ? 12 : 9,
      }}>
        {icon}
        <span style={{
          fontWeight: 900, letterSpacing: 1,
          fontSize: size === "tv" ? 14 : 11,
          color,
        }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

/* ------------------------------ the screen ------------------------------ */

/**
 * @param gameId    which mission to brief
 * @param game      the game record, for the host's demo video URLs
 * @param size      "tv" for the projected display, "compact" on a phone
 * @param lang      controlled language, if the caller owns it
 * @param onLang    called when the viewer switches language
 * @param roundLabel e.g. "ROUND 2 OF 5"
 */
export default function MissionDemo({
  gameId, game, size = "compact", lang, onLang, roundLabel = "",
  showRules = true,
}) {
  const [ownLang, setOwnLang] = useState(DEFAULT_LANGUAGE);
  // Collapsed by default: the rules are the same every round, and
  // they were the main reason this screen did not fit.
  const [rulesOpen, setRulesOpen] = useState(false);
  const active = isLanguage(lang) ? lang : ownLang;
  const setLang = (id) => { setOwnLang(id); onLang?.(id); };

  const brief = missionBrief(gameId, active);
  const rules = eventRules(active);
  const videoUrl = missionVideoUrl(game, gameId, active);
  const speechText = useMemo(
    () => briefSpeech(gameId, active, { includeRules: false }),
    [gameId, active]
  );
  const speech = useSpeech(speechText, languageById(active).speechLang);

  if (!brief) return null;
  const tv = size === "tv";

  return (
    <div style={{
      width: "100%",
      maxWidth: tv ? 1180 : 560,
      margin: "0 auto",
      display: "grid",
      gap: tv ? 16 : 11,
    }}>
      {/* ---- header: mission, site, language, voice ---- */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 12,
        alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ minWidth: 0 }}>
          {roundLabel && (
            <div style={{
              fontSize: tv ? 13 : 10, fontWeight: 900, letterSpacing: 1.6,
              color: COLORS.yellow, marginBottom: 4,
            }}>
              {roundLabel}
            </div>
          )}
          <h2 style={{
            margin: 0, fontWeight: 900, letterSpacing: -0.6,
            fontSize: tv ? 40 : 22, lineHeight: 1.1,
          }}>
            {brief.title}
          </h2>
          <p style={{
            margin: "6px 0 0", color: COLORS.muted,
            fontSize: tv ? 19 : 13,
          }}>
            {brief.oneLiner} · {SITE_NAME}
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* language */}
          <div style={{
            display: "flex", background: COLORS.surface,
            border: `1px solid ${COLORS.line}`, borderRadius: 8, overflow: "hidden",
          }}>
            <Languages size={tv ? 18 : 14} color={COLORS.muted}
              style={{ alignSelf: "center", margin: "0 8px" }} />
            {LANGUAGES.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLang(l.id)}
                style={{
                  border: 0, cursor: "pointer",
                  padding: tv ? "10px 16px" : "7px 12px",
                  fontWeight: 800, fontSize: tv ? 16 : 12.5,
                  background: active === l.id ? COLORS.yellow : "transparent",
                  color: active === l.id ? "#1A1200" : COLORS.ink,
                }}
              >
                {l.label}
              </button>
            ))}
          </div>

          {/* voice-over */}
          {speech.supported && (
            <button
              type="button"
              onClick={speech.toggle}
              disabled={speech.voiceReady === false}
              title={speech.voiceReady === false
                ? `This device has no ${languageById(active).label} voice installed`
                : "Read the briefing aloud"}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                border: `1px solid ${COLORS.line}`, borderRadius: 8,
                padding: tv ? "10px 16px" : "7px 12px",
                fontWeight: 800, fontSize: tv ? 16 : 12.5,
                cursor: speech.voiceReady === false ? "not-allowed" : "pointer",
                opacity: speech.voiceReady === false ? 0.45 : 1,
                background: speech.speaking ? COLORS.purple : COLORS.surface,
                color: speech.speaking ? "#fff" : COLORS.ink,
              }}
            >
              {speech.voiceReady === false
                ? <VolumeX size={tv ? 18 : 14} />
                : speech.speaking ? <Pause size={tv ? 18 : 14} /> : <Volume2 size={tv ? 18 : 14} />}
              {speech.voiceReady === false
                ? "No voice"
                : speech.speaking ? "Stop" : "Listen"}
            </button>
          )}
        </div>
      </div>

{/* ---- the demo ----
          The host's own video if they have pasted one, otherwise the
          built-in demo, which flies the mission's real 3D world. */}
      {videoUrl ? (
        <DemoVideo url={videoUrl} compact={!tv} />
      ) : (
        <Suspense fallback={(
          <div style={{
            height: tv ? 420 : 240, borderRadius: 10,
            background: COLORS.surface, border: `1px solid ${COLORS.line}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: COLORS.muted, fontSize: 13,
          }}>
            Loading the 3D demo…
          </div>
        )}>
          <MissionDemoPlayer
            gameId={gameId}
            captions={brief.steps}
            speak={speech}
            height={tv ? 440 : 240}
          />
        </Suspense>
      )}

      {/* ---- one screen: what it is, what to do, how it scores ----
          The briefing used to run to three panels and a rules list,
          which does not fit a phone in landscape — so nobody read it
          and the demo video scrolled off the top. Everything below is
          what you need before you start; the detail is in the game. */}
      <Section icon={<Gamepad2 size={tv ? 18 : 14} color={COLORS.orange} />}
        title="WHAT YOU ARE DOING" color={COLORS.orange} size={size}>
        <p style={{
          margin: 0, color: COLORS.ink, lineHeight: 1.5,
          fontSize: tv ? 19 : 13.5,
        }}>
          {brief.goal}
        </p>
      </Section>

      <Section icon={<ListChecks size={tv ? 18 : 14} color={COLORS.green} />}
        title="HOW TO PLAY" color={COLORS.green} size={size}>
        {/* The first three steps only. The rest are discoverable in
            the game and were pushing the video off the screen. */}
        <Bullets items={brief.steps.slice(0, 3)} color={COLORS.green} numbered size={size} />
      </Section>

      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: tv ? "12px 16px" : "9px 12px",
        background: COLORS.surface, border: `1px solid ${COLORS.line}`,
        borderRadius: 10, color: COLORS.muted, fontSize: tv ? 15 : 12,
        lineHeight: 1.45,
      }}>
        <Trophy size={tv ? 17 : 14} color={COLORS.yellow} style={{ flexShrink: 0 }} />
        <span>{brief.scoring[0]}</span>
      </div>

      {showRules && (
        <button
          type="button"
          onClick={() => setRulesOpen((v) => !v)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            width: "100%", cursor: "pointer",
            padding: tv ? "11px 16px" : "9px 12px",
            background: "transparent", color: COLORS.muted,
            border: `1px dashed ${COLORS.line}`, borderRadius: 10,
            fontSize: tv ? 14 : 12, fontWeight: 700,
          }}
        >
          <ShieldAlert size={tv ? 16 : 13} color={COLORS.red} />
          {rulesOpen ? "Hide the rules" : rules.title}
        </button>
      )}

      {showRules && rulesOpen && (
        <Section icon={<ShieldAlert size={tv ? 18 : 14} color={COLORS.red} />}
          title={rules.title.toUpperCase()} color={COLORS.red} size={size}>
          <Bullets items={rules.items} color={COLORS.red} size={size} />
        </Section>
      )}
    </div>
  );
}
