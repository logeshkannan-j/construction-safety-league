import React, { useEffect, useMemo, useState } from "react";
import {
  Trophy, ChevronLeft, Loader2, RefreshCw, Crown, Medal, BarChart3,
  Clock, Target, AlertTriangle, History,
} from "lucide-react";
import { C, GAMES, getGame } from "../arenaConstants.js";
import { buildLeaderboard, fetchAllProfiles, fetchFeed, fetchPlayerRuns } from "../arenaDb.js";
import { ArenaButton, Pill, StatBox, panelStyle } from "./primitives.jsx";
import { ARENA_KEYFRAMES, formatClock } from "./Hud.jsx";
import { sfx } from "../audio.js";

/* ------------------------------------------------------------------ *
 *  ARENA LEADERBOARD
 *
 *  Daily / weekly / all-time boards, overall and per game, plus the
 *  player's own run history.
 *
 *  Reads are deliberately cheap: ONE read of the profile aggregates and
 *  ONE read of the run feed covers every tab, because the boards are
 *  computed from that data in memory (see buildLeaderboard). Switching
 *  tabs costs nothing.
 * ------------------------------------------------------------------ */

const PERIOD_TABS = [
  ["daily", "Today"],
  ["weekly", "This week"],
  ["alltime", "All time"],
];

export default function ArenaLeaderboard({ identity, initialGameId = "overall", onBack, onPlay }) {
  const [period, setPeriod] = useState("alltime");
  const [gameId, setGameId] = useState(initialGameId || "overall");
  const [profiles, setProfiles] = useState([]);
  const [feed, setFeed] = useState([]);
  const [myRuns, setMyRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [p, f, r] = await Promise.all([
        fetchAllProfiles(),
        fetchFeed(),
        identity?.id ? fetchPlayerRuns(identity.id, 25) : Promise.resolve([]),
      ]);
      setProfiles(p);
      setFeed(f);
      setMyRuns(r);
      if (!p.length && !f.length) {
        setError("No Arena scores have been recorded yet. Be the first — play a mission and your run will appear here.");
      }
    } catch (e) {
      console.error("[arena] leaderboard load failed", e);
      setError("Could not load the leaderboard. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [identity?.id]);

  const rows = useMemo(
    () => buildLeaderboard({ profiles, feed, period, gameId }),
    [profiles, feed, period, gameId]
  );

  const myRow = rows.find((r) => r.playerId === identity?.id);
  const game = gameId === "overall" ? null : getGame(gameId);

  return (
    <div style={{ minHeight: "100vh", padding: "18px 16px 64px" }}>
      <style>{ARENA_KEYFRAMES}</style>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => { sfx.click(); onBack(); }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              background: "none", border: `1px solid ${C.line}`, borderRadius: 9,
              color: C.muted, padding: "7px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}
          >
            <ChevronLeft size={14} /> Gaming Arena
          </button>
          <div style={{ marginLeft: "auto" }}>
            <ArenaButton onClick={load} color={C.muted} variant="outline" size="sm" icon={loading ? <Loader2 size={14} style={{ animation: "cslArenaSpin 1s linear infinite" }} /> : <RefreshCw size={14} />}>
              Refresh
            </ArenaButton>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <Trophy size={26} color={C.yellow} />
          <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0, letterSpacing: -0.5 }}>Arena Leaderboard</h1>
        </div>
        <p style={{ color: C.muted, fontSize: 13, margin: "0 0 20px", lineHeight: 1.55 }}>
          {gameId === "overall"
            ? "Overall ranking is the sum of your personal best in each game, so replaying an easy mission cannot inflate your position."
            : `Best ${game?.title} score per player.`}
        </p>

        {/* ----------------------- filters ----------------------- */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {PERIOD_TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => { sfx.click(); setPeriod(id); }}
              style={tabStyle(period === id, C.yellow)}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
          <button type="button" onClick={() => { sfx.click(); setGameId("overall"); }} style={tabStyle(gameId === "overall", C.purple)}>
            Overall
          </button>
          {GAMES.map((g) => (
            <button key={g.id} type="button" onClick={() => { sfx.click(); setGameId(g.id); }} style={tabStyle(gameId === g.id, g.accent)}>
              {g.title.replace("Safety ", "").replace("Tower ", "").replace("Build the ", "")}
            </button>
          ))}
        </div>

        {/* ----------------------- my position ----------------------- */}
        {myRow && (
          <div
            style={{
              ...panelStyle,
              marginBottom: 16,
              borderColor: C.yellow + "66",
              background: `linear-gradient(135deg, ${C.yellow}12, ${C.surface} 50%)`,
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1, color: C.muted, marginBottom: 10 }}>
              YOUR POSITION
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8 }}>
              <StatBox label="RANK" value={`#${myRow.rank}`} color={C.yellow} big />
              <StatBox label="POINTS" value={myRow.score} color={C.green} />
              <StatBox label="BEST RUN" value={myRow.best} color={C.ink} />
              <StatBox label="RUNS" value={myRow.runs} color={C.muted} />
            </div>
          </div>
        )}

        {/* ----------------------- board ----------------------- */}
        <div style={{ ...panelStyle, marginBottom: 20 }}>
          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: 9, color: C.muted, fontSize: 13, padding: "14px 0" }}>
              <Loader2 size={16} style={{ animation: "cslArenaSpin 1s linear infinite" }} /> Loading scores…
            </div>
          )}

          {!loading && error && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 9, color: C.muted, fontSize: 13, lineHeight: 1.55 }}>
              <AlertTriangle size={16} color={C.orange} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && rows.length === 0 && (
            <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.55 }}>
              No scores for this filter yet. Try <b style={{ color: C.ink }}>All time</b>, or play a mission to put
              yourself on the board.
            </div>
          )}

          {!loading && rows.length > 0 && (
            <div style={{ display: "grid", gap: 5 }}>
              {rows.slice(0, 50).map((row) => (
                <LeaderRow key={row.playerId} row={row} isMe={row.playerId === identity?.id} showGames={gameId === "overall"} />
              ))}
              {rows.length > 50 && (
                <div style={{ fontSize: 11, color: C.muted, textAlign: "center", marginTop: 8 }}>
                  Showing the top 50 of {rows.length} players.
                </div>
              )}
            </div>
          )}
        </div>

        {/* ----------------------- my run history ----------------------- */}
        <div style={{ ...panelStyle }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <History size={16} color={C.purple} />
            <h2 style={{ fontSize: 15, fontWeight: 900, margin: 0 }}>Your recent runs</h2>
          </div>

          {myRuns.length === 0 && (
            <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>
              You have not finished an Arena mission yet.
            </p>
          )}

          {myRuns.length > 0 && (
            <div style={{ display: "grid", gap: 5 }}>
              {myRuns.map((run) => {
                const g = getGame(run.gameId);
                return (
                  <div
                    key={run.runId}
                    style={{
                      display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap",
                      background: C.surfaceRaised, borderRadius: 9, padding: "9px 12px", fontSize: 12.5,
                    }}
                  >
                    <span
                      style={{
                        width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                        background: g?.accent || C.muted,
                      }}
                    />
                    <span style={{ fontWeight: 800, minWidth: 120, flex: 1 }}>{run.gameName || g?.title || run.gameId}</span>
                    <Pill color={run.completed ? C.green : C.orange} size={10}>
                      {run.completed ? "COMPLETED" : "ENDED"}
                    </Pill>
                    <span style={{ color: C.muted, display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Target size={11} /> {run.accuracy}%
                    </span>
                    <span style={{ color: C.muted, display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Clock size={11} /> {formatClock(run.timeTakenMs || 0)}
                    </span>
                    <b style={{ color: C.yellow, minWidth: 54, textAlign: "right" }}>{run.score} pts</b>
                  </div>
                );
              })}
            </div>
          )}

          {onPlay && (
            <ArenaButton onClick={() => onPlay()} color={C.yellow} style={{ marginTop: 14 }} icon={<BarChart3 size={15} />}>
              Back to the games
            </ArenaButton>
          )}
        </div>
      </div>
    </div>
  );
}

function tabStyle(active, color) {
  return {
    padding: "6px 13px",
    borderRadius: 20,
    border: `1px solid ${active ? color : C.line}`,
    background: active ? color + "1f" : "transparent",
    color: active ? color : C.muted,
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

function LeaderRow({ row, isMe, showGames }) {
  const podium = row.rank <= 3;
  const colors = ["#FFC629", "#C7CCD1", "#D08A54"];
  const color = podium ? colors[row.rank - 1] : C.muted;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 11px",
        borderRadius: 9,
        background: isMe ? C.yellow + "16" : podium ? color + "0d" : "transparent",
        border: `1px solid ${isMe ? C.yellow + "66" : podium ? color + "33" : "transparent"}`,
      }}
    >
      <div style={{ width: 30, textAlign: "center", flexShrink: 0 }}>
        {row.rank === 1 ? <Crown size={18} color={color} />
          : podium ? <Medal size={16} color={color} />
            : <span style={{ fontWeight: 900, fontSize: 13, color: C.muted }}>{row.rank}</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 800, fontSize: 14, overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap",
            color: podium ? color : C.ink,
          }}
        >
          {row.name}{isMe ? " (you)" : ""}
        </div>
        <div style={{ fontSize: 10.5, color: C.muted }}>
          {showGames ? `${row.gamesCompleted}/5 games · ${row.runs} run${row.runs === 1 ? "" : "s"}` : `${row.runs} run${row.runs === 1 ? "" : "s"}`}
          {row.team ? ` · ${row.team}` : ""}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontWeight: 900, fontSize: 16, color: podium ? color : C.yellow }}>{row.score}</div>
        <div style={{ fontSize: 9.5, color: C.muted, fontWeight: 700 }}>POINTS</div>
      </div>
    </div>
  );
}
