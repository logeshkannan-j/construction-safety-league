/* ------------------------------------------------------------------ *
 *  MISSION DEMO — the instruction screen shown before a round starts.
 *
 *  Three things in one screen:
 *
 *    the demo         a STEP-BY-STEP walkthrough of the mission: one
 *                     instruction at a time, in English and Tamil
 *                     together, with the control it is about drawn as
 *                     it looks in the game, over the mission's real 3D
 *                     world (MissionDemoPlayer.jsx). It plays on its
 *                     own or is stepped through with Back and Next, and
 *                     can read each step aloud. If the host has pasted
 *                     a demo video for the mission, the video plays and
 *                     the steps still go one by one underneath it.
 *    the brief        what the mission asks and how it is scored, in
 *                     the language chosen — from missionBriefs.js.
 *    the rules        the event's rules and regulations.
 *
 *  Used on the TV (large, host-driven) and on a player's phone while
 *  they wait for the host to release the round (compact).
 * ------------------------------------------------------------------ */

import React, { lazy, Suspense, useMemo, useState } from "react";
import { Languages, ShieldAlert, Trophy, Gamepad2 } from "lucide-react";
import { COLORS } from "./theme.js";
import {
  LANGUAGES, DEFAULT_LANGUAGE, isLanguage,
  missionBrief, eventRules, missionVideoUrl, missionSteps,
} from "./missionBriefs.js";
import { SITE_NAME } from "./arena/arenaConstants.js";

// The live 3D demo mounts the real mission world, so it pulls in
// three.js. Loaded only when somebody actually opens a briefing.
const MissionDemoPlayer = lazy(() => import("./arena/ui/MissionDemoPlayer.jsx"));

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
  // Both languages, step by step, whichever one is chosen to lead.
  const steps = useMemo(() => missionSteps(gameId), [gameId]);

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
      {/* ---- header: mission, site, which language leads ---- */}
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
        </div>
      </div>

      {/* ---- the demo ----
          The host's own video if they have pasted one; otherwise the
          mission's real 3D world. Either way the instructions underneath
          go one step at a time, in English and Tamil together. */}
      {videoUrl && <DemoVideo url={videoUrl} compact={!tv} />}
      <Suspense fallback={(
        <div style={{
          height: tv ? 420 : 230, borderRadius: 10,
          background: COLORS.surface, border: `1px solid ${COLORS.line}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: COLORS.muted, fontSize: 13,
        }}>
          Loading the 3D demo…
        </div>
      )}>
        <MissionDemoPlayer
          gameId={gameId}
          steps={steps}
          lang={active}
          with3d={!videoUrl}
          size={size}
          height={tv ? 440 : 230}
        />
      </Suspense>

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
