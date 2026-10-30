import React from "react";
import {
  Trophy, RotateCcw, LayoutGrid, BarChart3, Clock, Target, CheckCircle2,
  XCircle, Award, AlertTriangle, Loader2, CloudOff, ArrowRight,
} from "lucide-react";
import { C, ratingFor } from "../arenaConstants.js";
import { ArenaButton, Overlay, Pill, StatBox, panelStyle } from "./primitives.jsx";
import { formatClock } from "./Hud.jsx";

/* ------------------------------------------------------------------ *
 *  RESULTS SCREEN
 *
 *  Shared by all five games. Shows the final score, the performance
 *  rating, a per-game breakdown of what the player got right and wrong,
 *  any achievements unlocked, their leaderboard position, and the
 *  replay / return actions.
 *
 *  Submission state is shown honestly: if the Firebase write failed the
 *  player is told so and offered a retry, rather than being shown a
 *  fake "saved" tick.
 * ------------------------------------------------------------------ */

export default function ResultsScreen({
  game, result, difficulty, newAchievements = [], rank = null,
  submitState = "idle", submitMessage = "", onRetrySubmit, onReplay, onExit,
  onLeaderboard, mobile = false, personalBest = null,
  // When the game is one stage of an integrated participant session, the
  // session banks the score and the player continues to the quiz — there
  // is no separate save and no "play again".
  embedded = false, onContinue,
}) {
  const percent = Math.max(0, Math.min(100, Math.round(result.performance ?? result.accuracy ?? 0)));
  const band = ratingFor(percent);
  const rating = result.rating ? { ...band, label: result.rating } : band;
  const isNewBest = personalBest !== null && (result.score || 0) >= personalBest && (result.score || 0) > 0;

  return (
    <Overlay align={mobile ? "top" : "center"}>
      <div
        style={{
          ...panelStyle,
          width: "min(100%, 680px)",
          padding: mobile ? 14 : 24,
          animation: "cslArenaRise .4s ease-out",
          marginTop: mobile ? 0 : undefined,
        }}
      >
        {/* ---------- header ---------- */}
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div
            style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              fontSize: 10, fontWeight: 900, letterSpacing: 1.4,
              color: result.completed ? C.green : C.orange,
              border: `1px solid ${result.completed ? C.green : C.orange}66`,
              borderRadius: 20, padding: "4px 12px", marginBottom: 12,
            }}
          >
            {result.completed ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
            {result.completed ? "MISSION COMPLETE" : "MISSION ENDED"}
          </div>

          <div style={{ fontSize: mobile ? 44 : 60, fontWeight: 900, color: rating.color, lineHeight: 1, letterSpacing: -2 }}>
            {result.score}
          </div>
          <div style={{ fontSize: 11, color: C.muted, fontWeight: 800, letterSpacing: 1.2, marginTop: 2 }}>
            POINTS
          </div>

          <div
            style={{
              display: "inline-flex", flexDirection: "column", alignItems: "center",
              marginTop: 14, padding: "8px 20px", borderRadius: 10,
              background: rating.color + "14", border: `1px solid ${rating.color}66`,
            }}
          >
            <div style={{ fontSize: mobile ? 20 : 24, fontWeight: 900, color: rating.color, letterSpacing: 1 }}>
              {rating.label}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{rating.sub}</div>
          </div>

          {isNewBest && (
            <div style={{ marginTop: 12 }}>
              <Pill color={C.yellow} filled size={11}><Trophy size={11} /> NEW PERSONAL BEST</Pill>
            </div>
          )}
        </div>

        {/* ---------- core stats ---------- */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${mobile ? 2 : 4}, minmax(0, 1fr))`,
            gap: 8,
            marginBottom: 16,
          }}
        >
          <StatBox label="ACCURACY" value={`${Math.round(result.accuracy || 0)}%`} color={(result.accuracy || 0) >= 80 ? C.green : (result.accuracy || 0) >= 50 ? C.yellow : C.red} />
          <StatBox label="TIME TAKEN" value={formatClock(result.timeTakenMs || 0)} color={C.ink} />
          <StatBox label="DIFFICULTY" value={difficulty.label} color={difficulty.color} />
          <StatBox label="ARENA RANK" value={rank ? `#${rank}` : "—"} color={C.purple} />
        </div>

        {/* ---------- per-game breakdown ---------- */}
        {result.breakdown?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.1, color: C.muted, marginBottom: 8 }}>
              PERFORMANCE BREAKDOWN
            </div>
            <div style={{ display: "grid", gap: 5 }}>
              {result.breakdown.map((row, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: C.surfaceRaised, borderRadius: 8,
                    padding: "8px 11px", fontSize: mobile ? 12 : 13,
                  }}
                >
                  {row.tone === "good" && <CheckCircle2 size={14} color={C.green} style={{ flexShrink: 0 }} />}
                  {row.tone === "bad" && <XCircle size={14} color={C.red} style={{ flexShrink: 0 }} />}
                  {(!row.tone || row.tone === "info") && <Target size={14} color={C.muted} style={{ flexShrink: 0 }} />}
                  <span style={{ flex: 1, minWidth: 0 }}>{row.label}</span>
                  <b
                    style={{
                      color: row.tone === "good" ? C.green : row.tone === "bad" ? C.red : C.ink,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.value}
                  </b>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---------- what to review ---------- */}
        {result.lessons?.length > 0 && (
          <div
            style={{
              background: C.surfaceRaised,
              border: `1px solid ${C.orange}44`,
              borderRadius: 10,
              padding: 12,
              marginBottom: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 900, letterSpacing: 1, color: C.orange, marginBottom: 8 }}>
              <AlertTriangle size={12} /> REVIEW THESE
            </div>
            {result.lessons.slice(0, 6).map((lesson, i) => (
              <div key={i} style={{ fontSize: mobile ? 12 : 13, color: C.ink, lineHeight: 1.45, marginBottom: 5, display: "flex", gap: 7 }}>
                <span style={{ color: C.orange, fontWeight: 900 }}>·</span>
                <span>{lesson}</span>
              </div>
            ))}
          </div>
        )}

        {/* ---------- achievements ---------- */}
        {newAchievements.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.1, color: C.yellow, marginBottom: 8 }}>
              ACHIEVEMENT{newAchievements.length > 1 ? "S" : ""} UNLOCKED
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {newAchievements.map((a) => (
                <div
                  key={a.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    background: (a.color || C.yellow) + "14",
                    border: `1px solid ${a.color || C.yellow}66`,
                    borderRadius: 10, padding: "9px 12px",
                    animation: "cslArenaRise .45s ease-out",
                  }}
                >
                  <Award size={18} color={a.color || C.yellow} style={{ flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 13 }}>{a.name}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{a.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---------- save state ---------- */}
        <div
          style={{
            display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap",
            fontSize: 11, color: submitState === "error" ? C.red : C.muted,
            marginBottom: 14, minHeight: 18, lineHeight: 1.5,
          }}
        >
          {submitState === "session" && (<><CheckCircle2 size={12} color={C.green} /> Added to your session score. Next: the safety quiz.</>)}
          {submitState === "saving" && (<><Loader2 size={12} style={{ animation: "cslArenaSpin 1s linear infinite" }} /> Saving your score to the leaderboard…</>)}
          {submitState === "saved" && (<><CheckCircle2 size={12} color={C.green} /> Score saved to the Arena leaderboard.</>)}
          {submitState === "duplicate" && (<><CheckCircle2 size={12} color={C.green} /> This run was already saved — no double points awarded.</>)}
          {submitState === "error" && (
            <>
              <CloudOff size={12} />
              <span>Could not save this score. {submitMessage}</span>
              <button
                type="button"
                onClick={onRetrySubmit}
                style={{ background: "none", border: "none", color: C.yellow, textDecoration: "underline", cursor: "pointer", fontSize: 11, padding: 0 }}
              >
                Retry
              </button>
            </>
          )}
        </div>

        {/* ---------- actions ---------- */}
        {embedded ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <ArenaButton onClick={onContinue} color={C.green} icon={<ArrowRight size={16} />} size="lg" style={{ flex: "1 1 220px" }}>
              CONTINUE TO THE QUIZ
            </ArenaButton>
            <ArenaButton onClick={onReplay} color={game.accent} variant="outline" icon={<RotateCcw size={16} />} style={{ flex: "1 1 140px" }}>
              Retry the mission
            </ArenaButton>
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <ArenaButton onClick={onReplay} color={game.accent} icon={<RotateCcw size={16} />} size="lg" style={{ flex: "1 1 160px" }}>
              PLAY AGAIN
            </ArenaButton>
            <ArenaButton onClick={onLeaderboard} color={C.purple} variant="outline" icon={<BarChart3 size={16} />} style={{ flex: "1 1 130px" }}>
              Leaderboard
            </ArenaButton>
            <ArenaButton onClick={onExit} color={C.muted} variant="outline" icon={<LayoutGrid size={16} />} style={{ flex: "1 1 130px" }}>
              Gaming Arena
            </ArenaButton>
          </div>
        )}
        {embedded && (
          <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, margin: "10px 0 0" }}>
            Nothing is banked until you continue, so only the attempt you carry forward counts —
            and it can never be counted twice.
          </p>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: C.muted, marginTop: 12, justifyContent: "center" }}>
          <Clock size={10} /> {game.title} · {difficulty.label}
        </div>
      </div>
    </Overlay>
  );
}
