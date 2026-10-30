import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Gamepad2, Trophy, Play, Clock, BarChart3, Award, Lock, RefreshCw,
  ChevronLeft, User, Loader2, AlertTriangle, Target, CheckCircle2, Zap,
} from "lucide-react";
import { C, GAMES, ACHIEVEMENTS, GAME_IDS } from "../arenaConstants.js";
import { ArenaButton, Pill, StatBox, panelStyle, Divider } from "./primitives.jsx";
import { ARENA_KEYFRAMES } from "./Hud.jsx";
import GameCover from "./GameCover.jsx";
import { sfx, unlockAudio } from "../audio.js";

/* ------------------------------------------------------------------ *
 *  GAMING ARENA — entry page
 *
 *  Shows the player who they are, what they have achieved, and the five
 *  games with their own cover art, difficulty, play time, personal best
 *  and progress. Games an admin has switched off are shown as locked
 *  rather than silently hidden, so players are not confused by a
 *  changing menu.
 * ------------------------------------------------------------------ */

export default function ArenaHome({
  identity, profile, config, loading, error,
  onPlay, onOpenLeaderboard, onRefresh, onExit, onChangeName,
}) {
  const [showAchievements, setShowAchievements] = useState(false);
  const bestScores = profile?.bestScores || {};
  const earned = profile?.achievements || {};

  const completedCount = GAME_IDS.filter((id) => (bestScores[id] || 0) > 0).length;
  const earnedCount = ACHIEVEMENTS.filter((a) => earned[a.id]).length;

  return (
    <div style={{ minHeight: "100vh", padding: "18px 16px 64px" }}>
      <style>{ARENA_KEYFRAMES}</style>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>

        {/* ------------------------- header ------------------------- */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => { sfx.click(); onExit(); }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              background: "none", border: `1px solid ${C.line}`, borderRadius: 9,
              color: C.muted, padding: "7px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}
          >
            <ChevronLeft size={14} /> Main menu
          </button>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ArenaButton onClick={() => onOpenLeaderboard("overall")} color={C.purple} variant="outline" size="sm" icon={<BarChart3 size={14} />}>
              Leaderboard
            </ArenaButton>
            <ArenaButton onClick={onRefresh} color={C.muted} variant="outline" size="sm" icon={loading ? <Loader2 size={14} style={{ animation: "cslArenaSpin 1s linear infinite" }} /> : <RefreshCw size={14} />}>
              Refresh
            </ArenaButton>
          </div>
        </div>

        <div
          style={{
            position: "relative",
            background: `radial-gradient(circle at 12% 18%, ${C.orange}1f, transparent 36%), radial-gradient(circle at 88% 78%, ${C.green}16, transparent 38%), ${C.surface}`,
            border: `1px solid ${C.line}`,
            borderRadius: 16,
            padding: "26px 22px",
            marginBottom: 20,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute", inset: 0,
              backgroundImage: `repeating-linear-gradient(135deg, ${C.yellow}0b 0 18px, transparent 18px 36px)`,
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "relative" }}>
            <Pill color={C.yellow} filled size={11}><Gamepad2 size={12} /> 3D SAFETY GAMING ARENA</Pill>
            <h1 style={{ fontSize: "clamp(28px, 6vw, 44px)", fontWeight: 900, letterSpacing: -1.2, margin: "14px 0 8px", lineHeight: 1.05 }}>
              Learn site safety<br />by doing it
            </h1>
            <p style={{ color: C.muted, fontSize: 15, lineHeight: 1.6, maxWidth: 560, margin: 0 }}>
              Five playable 3D missions on a real construction site. Find hazards, operate a tower
              crane, build safe access, escape a locked building and command an emergency — then
              see where you rank.
            </p>
          </div>
        </div>

        {/* ------------------------- player card ------------------------- */}
        <div style={{ ...panelStyle, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <div
              style={{
                width: 46, height: 46, borderRadius: 12, flexShrink: 0,
                background: C.yellow + "20", border: `1px solid ${C.yellow}66`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <User size={22} color={C.yellow} />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: C.muted }}>PLAYING AS</div>
              <div style={{ fontSize: 19, fontWeight: 900 }}>{identity?.name || "Player"}</div>
              {identity?.source === "quiz" && (
                <div style={{ fontSize: 11, color: C.green, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                  <CheckCircle2 size={11} /> Linked to your quiz profile{identity.team ? ` · ${identity.team}` : ""}
                </div>
              )}
            </div>
            <ArenaButton onClick={onChangeName} color={C.muted} variant="outline" size="sm">
              Change name
            </ArenaButton>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: 8 }}>
            <StatBox label="ARENA POINTS" value={profile?.totalScore ?? 0} color={C.yellow} />
            <StatBox label="GAMES PLAYED" value={profile?.runCount ?? 0} color={C.ink} />
            <StatBox label="GAMES CLEARED" value={`${completedCount}/5`} color={completedCount === 5 ? C.green : C.ink} />
            <StatBox label="ACHIEVEMENTS" value={`${earnedCount}/${ACHIEVEMENTS.length}`} color={C.purple} />
          </div>

          <Divider />

          <button
            type="button"
            onClick={() => { sfx.click(); setShowAchievements((v) => !v); }}
            style={{
              display: "flex", alignItems: "center", gap: 7, width: "100%",
              background: "none", border: "none", padding: 0, cursor: "pointer",
              color: C.ink, fontSize: 13, fontWeight: 800,
            }}
          >
            <Award size={15} color={C.yellow} />
            Achievements
            <span style={{ marginLeft: "auto", color: C.muted, fontSize: 12 }}>
              {showAchievements ? "Hide" : "Show"}
            </span>
          </button>

          {showAchievements && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 8, marginTop: 12 }}>
              {ACHIEVEMENTS.map((a) => {
                const has = !!earned[a.id];
                return (
                  <div
                    key={a.id}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 9,
                      background: has ? a.color + "12" : C.surfaceRaised,
                      border: `1px solid ${has ? a.color + "66" : C.line}`,
                      borderRadius: 10, padding: "9px 11px",
                      opacity: has ? 1 : 0.6,
                    }}
                  >
                    {has ? <Award size={16} color={a.color} style={{ flexShrink: 0, marginTop: 1 }} /> : <Lock size={15} color={C.muted} style={{ flexShrink: 0, marginTop: 1 }} />}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 12.5, color: has ? a.color : C.ink }}>{a.name}</div>
                      <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.4 }}>{a.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ------------------------- error banner ------------------------- */}
        {error && (
          <div
            style={{
              display: "flex", alignItems: "center", gap: 9,
              background: C.orange + "14", border: `1px solid ${C.orange}55`,
              borderRadius: 10, padding: "11px 14px", marginBottom: 18, fontSize: 13,
            }}
          >
            <AlertTriangle size={16} color={C.orange} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{error}</span>
            <ArenaButton onClick={onRefresh} color={C.orange} variant="outline" size="sm">Retry</ArenaButton>
          </div>
        )}

        {/* ------------------------- game grid ------------------------- */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Target size={17} color={C.orange} />
          <h2 style={{ fontSize: 17, fontWeight: 900, margin: 0 }}>Choose your mission</h2>
          <span style={{ marginLeft: "auto", fontSize: 12, color: C.muted }}>{GAMES.length} games</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14 }}>
          {GAMES.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              best={bestScores[game.id] || 0}
              enabled={config?.games?.[game.id]?.enabled !== false}
              onPlay={() => { unlockAudio(); onPlay(game.id); }}
              onLeaderboard={() => onOpenLeaderboard(game.id)}
            />
          ))}
        </div>

        <p style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.6, marginTop: 26, textAlign: "center" }}>
          Your scores are saved to the Construction League leaderboard under the name above.
          The 3D games need WebGL — every modern phone, tablet and laptop browser has it.
        </p>
      </div>
    </div>
  );
}

/* ----------------------------- game card ----------------------------- */

function GameCard({ game, best, enabled, onPlay, onLeaderboard }) {
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: C.surface,
        border: `1px solid ${hover && enabled ? game.accent : C.line}`,
        borderRadius: 14,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        transform: hover && enabled ? "translateY(-3px)" : "none",
        boxShadow: hover && enabled ? `0 14px 32px ${game.accent}22` : "0 6px 18px #00000033",
        transition: "all .18s ease",
      }}
    >
      <div style={{ position: "relative" }}>
        <GameCover gameId={game.id} height={150} dim={!enabled} />
        <div style={{ position: "absolute", top: 10, left: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
          {!enabled && <Pill color={C.red} filled size={10}><Lock size={10} /> DISABLED</Pill>}
          {best > 0 && <Pill color={C.yellow} filled size={10}><Trophy size={10} /> BEST {best}</Pill>}
        </div>
      </div>

      <div style={{ padding: 15, display: "flex", flexDirection: "column", flex: 1 }}>
        <h3 style={{ fontSize: 17, fontWeight: 900, margin: "0 0 4px", lineHeight: 1.2 }}>{game.title}</h3>
        <div style={{ color: game.accent, fontSize: 12.5, fontWeight: 700, marginBottom: 9 }}>{game.tagline}</div>
        <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.55, margin: "0 0 12px", flex: 1 }}>
          {game.description}
        </p>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          <Pill color={C.muted} size={10}><Clock size={10} /> {game.minutes}</Pill>
          <Pill color={C.muted} size={10}><Zap size={10} /> 3 difficulties</Pill>
        </div>

        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 14 }}>
          {game.skills.map((skill) => (
            <span
              key={skill}
              style={{
                fontSize: 10, fontWeight: 700, color: C.muted,
                background: C.surfaceRaised, borderRadius: 5, padding: "3px 7px",
              }}
            >
              {skill}
            </span>
          ))}
        </div>

        <div style={{ display: "flex", gap: 7 }}>
          <ArenaButton
            onClick={onPlay}
            color={game.accent}
            icon={<Play size={16} />}
            disabled={!enabled}
            style={{ flex: 1 }}
          >
            {enabled ? (best > 0 ? "PLAY AGAIN" : "PLAY") : "UNAVAILABLE"}
          </ArenaButton>
          <ArenaButton onClick={onLeaderboard} color={C.purple} variant="outline" size="sm" icon={<BarChart3 size={14} />}>
            <span style={{ display: "none" }}>Ranks</span>
          </ArenaButton>
        </div>

        {!enabled && (
          <div style={{ fontSize: 11, color: C.muted, marginTop: 9, lineHeight: 1.45 }}>
            An administrator has switched this game off for now.
          </div>
        )}
      </div>
    </div>
  );
}
