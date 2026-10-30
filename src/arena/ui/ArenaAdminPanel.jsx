import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Gamepad2, RefreshCw, Loader2, ShieldAlert, ToggleLeft, ToggleRight,
  BarChart3, Users, Clock, Trophy, Copy, Check, AlertTriangle, Target,
} from "lucide-react";
import { C, GAMES, GAME_IDS, getGame } from "../arenaConstants.js";
import {
  fetchAllProfiles, fetchFeed, fetchArenaConfig, setGameEnabled,
  findSuspiciousRuns, buildLeaderboard,
} from "../arenaDb.js";
import { ARENA_KEYFRAMES, formatClock } from "./Hud.jsx";

/* ------------------------------------------------------------------ *
 *  ARENA ADMIN PANEL
 *
 *  Drops into the EXISTING admin screen (inside its existing Panel
 *  component, so it inherits the admin look) and is only reachable
 *  behind the existing admin PIN. It never grants any player elevated
 *  permissions: every control here writes to arena/config, which is the
 *  only place the Arena reads its on/off switches from.
 *
 *  All reporting is computed from exactly two reads — the profile
 *  aggregates and the run feed — so opening this panel is cheap even
 *  during a live event.
 * ------------------------------------------------------------------ */

export default function ArenaAdminPanel({ panelStyleOverride }) {
  const [profiles, setProfiles] = useState([]);
  const [feed, setFeed] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyGame, setBusyGame] = useState(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState("games");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [p, f, c] = await Promise.all([fetchAllProfiles(), fetchFeed(), fetchArenaConfig()]);
      setProfiles(p);
      setFeed(f);
      setConfig(c);
    } catch (e) {
      console.error("[arena admin] load failed", e);
      setError("Could not read the Arena data. Check the Firebase connection and the database rules.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* ---------------------------- derived data ---------------------------- */

  const stats = useMemo(() => {
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const runsToday = feed.filter((f) => (f.createdAt || 0) >= dayAgo);
    const runsWeek = feed.filter((f) => (f.createdAt || 0) >= weekAgo);
    const completed = feed.filter((f) => f.completed);
    return {
      players: profiles.filter((p) => (p.runCount || 0) > 0).length,
      runs: feed.length,
      runsToday: runsToday.length,
      runsWeek: runsWeek.length,
      completionRate: feed.length ? Math.round((completed.length / feed.length) * 100) : 0,
      avgScore: feed.length ? Math.round(feed.reduce((sum, f) => sum + (f.score || 0), 0) / feed.length) : 0,
      avgAccuracy: feed.length ? Math.round(feed.reduce((sum, f) => sum + (f.accuracy || 0), 0) / feed.length) : 0,
    };
  }, [profiles, feed]);

  const perGame = useMemo(() => GAME_IDS.map((id) => {
    const game = getGame(id);
    const runs = feed.filter((f) => f.gameId === id);
    const players = new Set(runs.map((r) => r.playerId));
    const completed = runs.filter((r) => r.completed);
    const scores = runs.map((r) => r.score || 0);
    return {
      id,
      title: game.title,
      accent: game.accent,
      enabled: config?.games?.[id]?.enabled !== false,
      runs: runs.length,
      players: players.size,
      completionRate: runs.length ? Math.round((completed.length / runs.length) * 100) : 0,
      avgScore: runs.length ? Math.round(scores.reduce((a, b) => a + b, 0) / runs.length) : 0,
      bestScore: scores.length ? Math.max(...scores) : 0,
      avgAccuracy: runs.length ? Math.round(runs.reduce((s, r) => s + (r.accuracy || 0), 0) / runs.length) : 0,
      avgTime: runs.length ? Math.round(runs.reduce((s, r) => s + (r.timeTakenMs || 0), 0) / runs.length) : 0,
    };
  }), [feed, config]);

  const ranking = useMemo(
    () => buildLeaderboard({ profiles, feed, period: "alltime", gameId: "overall" }),
    [profiles, feed]
  );

  const suspicious = useMemo(() => findSuspiciousRuns(feed), [feed]);

  /* ------------------------------ actions ------------------------------ */

  async function toggleGame(gameId, next) {
    setBusyGame(gameId);
    const ok = await setGameEnabled(gameId, next);
    if (!ok) setError("Could not write the game setting. Check that rules.json allows writes to arena/config.");
    await load();
    setBusyGame(null);
  }

  function copyReport() {
    const rows = [
      ["Game", "Plays", "Players", "Completion %", "Avg score", "Best score", "Avg accuracy %"],
      ...perGame.map((g) => [g.title, g.runs, g.players, g.completionRate, g.avgScore, g.bestScore, g.avgAccuracy]),
      [],
      ["Rank", "Player", "Arena points", "Games cleared", "Runs", "Best run"],
      ...ranking.map((r) => [r.rank, r.name, r.score, r.gamesCompleted, r.runs, r.best]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    try {
      navigator.clipboard.writeText(csv);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setError("Could not copy to the clipboard in this browser.");
    }
  }

  /* ------------------------------ rendering ------------------------------ */

  const th = {
    textAlign: "left", fontSize: 10, fontWeight: 900, letterSpacing: 0.6,
    color: C.muted, padding: "6px 8px", borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap",
  };
  const td = {
    fontSize: 12.5, padding: "7px 8px", borderBottom: `1px solid ${C.line}44`, whiteSpace: "nowrap",
  };

  return (
    <div>
      <style>{ARENA_KEYFRAMES}</style>

      <p style={{ color: C.muted, fontSize: 13, marginTop: 0, marginBottom: 12, lineHeight: 1.55 }}>
        Turn individual 3D games on or off, and review participation, scores and anything that looks
        like a tampered submission. These controls are admin-only — players never see them.
      </p>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {[["games", "Games"], ["reports", "Reports"], ["players", "Players"], ["integrity", `Integrity${suspicious.length ? ` (${suspicious.length})` : ""}`]].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            style={{
              padding: "6px 13px", borderRadius: 20,
              border: `1px solid ${tab === id ? (id === "integrity" && suspicious.length ? C.red : C.yellow) : C.line}`,
              background: tab === id ? (id === "integrity" && suspicious.length ? C.red : C.yellow) + "1f" : "transparent",
              color: tab === id ? (id === "integrity" && suspicious.length ? C.red : C.yellow) : C.muted,
              fontSize: 12, fontWeight: 800, cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={copyReport}
            disabled={!feed.length}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "6px 11px", borderRadius: 8,
              border: `1px solid ${C.line}`, background: "transparent",
              color: feed.length ? C.ink : C.line, fontSize: 12, fontWeight: 700,
              cursor: feed.length ? "pointer" : "not-allowed",
            }}
          >
            {copied ? <Check size={13} color={C.green} /> : <Copy size={13} />}
            {copied ? "Copied" : "Copy CSV"}
          </button>
          <button
            type="button"
            onClick={load}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "6px 11px", borderRadius: 8,
              border: `1px solid ${C.line}`, background: "transparent",
              color: C.ink, fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}
          >
            {loading ? <Loader2 size={13} style={{ animation: "cslArenaSpin 1s linear infinite" }} /> : <RefreshCw size={13} />}
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            display: "flex", alignItems: "flex-start", gap: 8,
            background: C.red + "14", border: `1px solid ${C.red}55`,
            borderRadius: 8, padding: "9px 11px", marginBottom: 12, fontSize: 12.5, lineHeight: 1.5,
          }}
        >
          <AlertTriangle size={14} color={C.red} style={{ flexShrink: 0, marginTop: 1 }} />
          {error}
        </div>
      )}

      {loading && !feed.length && (
        <p style={{ color: C.muted, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
          <Loader2 size={14} style={{ animation: "cslArenaSpin 1s linear infinite" }} /> Reading Arena data…
        </p>
      )}

      {/* ---------------------------- summary ---------------------------- */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 7, marginBottom: 16 }}>
        <Cell icon={<Users size={12} />} label="PLAYERS" value={stats.players} />
        <Cell icon={<Gamepad2 size={12} />} label="TOTAL PLAYS" value={stats.runs} />
        <Cell icon={<Clock size={12} />} label="TODAY" value={stats.runsToday} />
        <Cell icon={<Clock size={12} />} label="THIS WEEK" value={stats.runsWeek} />
        <Cell icon={<Target size={12} />} label="COMPLETED" value={`${stats.completionRate}%`} />
        <Cell icon={<Trophy size={12} />} label="AVG SCORE" value={stats.avgScore} />
      </div>

      {/* ----------------------------- games ----------------------------- */}
      {tab === "games" && (
        <div style={{ display: "grid", gap: 7 }}>
          {perGame.map((game) => (
            <div
              key={game.id}
              style={{
                display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                background: C.surfaceRaised, borderRadius: 9, padding: "10px 12px",
                borderLeft: `3px solid ${game.enabled ? game.accent : C.line}`,
              }}
            >
              <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 13.5, color: game.enabled ? C.ink : C.muted }}>
                  {game.title}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                  {game.runs} play{game.runs === 1 ? "" : "s"} · {game.players} player{game.players === 1 ? "" : "s"} · {game.completionRate}% completed
                </div>
              </div>
              <div style={{ fontSize: 11, color: C.muted, textAlign: "right", minWidth: 92 }}>
                avg <b style={{ color: C.ink }}>{game.avgScore}</b><br />
                best <b style={{ color: C.yellow }}>{game.bestScore}</b>
              </div>
              <button
                type="button"
                disabled={busyGame === game.id}
                onClick={() => toggleGame(game.id, !game.enabled)}
                title={game.enabled ? "Disable this game for all players" : "Enable this game"}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "7px 11px", borderRadius: 8,
                  border: `1px solid ${game.enabled ? C.green : C.line}`,
                  background: game.enabled ? C.green + "1a" : "transparent",
                  color: game.enabled ? C.green : C.muted,
                  fontSize: 12, fontWeight: 800, cursor: "pointer", minWidth: 104,
                  justifyContent: "center",
                }}
              >
                {busyGame === game.id
                  ? <Loader2 size={14} style={{ animation: "cslArenaSpin 1s linear infinite" }} />
                  : game.enabled ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                {game.enabled ? "Enabled" : "Disabled"}
              </button>
            </div>
          ))}
          <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5, margin: "6px 0 0" }}>
            A disabled game still appears in the Gaming Arena, shown as locked, so players are not
            confused by a menu that changes shape. Existing scores are never deleted.
          </p>
        </div>
      )}

      {/* ---------------------------- reports ---------------------------- */}
      {tab === "reports" && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
            <thead>
              <tr>
                <th style={th}>Game</th>
                <th style={th}>Plays</th>
                <th style={th}>Players</th>
                <th style={th}>Completed</th>
                <th style={th}>Avg score</th>
                <th style={th}>Best</th>
                <th style={th}>Avg accuracy</th>
                <th style={th}>Avg time</th>
              </tr>
            </thead>
            <tbody>
              {perGame.map((game) => (
                <tr key={game.id}>
                  <td style={{ ...td, fontWeight: 700 }}>
                    <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: game.accent, marginRight: 7 }} />
                    {game.title}
                  </td>
                  <td style={td}>{game.runs}</td>
                  <td style={td}>{game.players}</td>
                  <td style={td}>{game.completionRate}%</td>
                  <td style={td}>{game.avgScore}</td>
                  <td style={{ ...td, color: C.yellow, fontWeight: 800 }}>{game.bestScore}</td>
                  <td style={td}>{game.avgAccuracy}%</td>
                  <td style={td}>{game.avgTime ? formatClock(game.avgTime) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!feed.length && (
            <p style={{ color: C.muted, fontSize: 13, marginTop: 10 }}>
              No Arena games have been played yet.
            </p>
          )}
        </div>
      )}

      {/* ---------------------------- players ---------------------------- */}
      {tab === "players" && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
            <thead>
              <tr>
                <th style={th}>#</th>
                <th style={th}>Player</th>
                <th style={th}>Arena points</th>
                <th style={th}>Games cleared</th>
                <th style={th}>Plays</th>
                <th style={th}>Best run</th>
                <th style={th}>Last played</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((row) => {
                const profile = profiles.find((p) => p.id === row.playerId);
                return (
                  <tr key={row.playerId}>
                    <td style={{ ...td, color: row.rank <= 3 ? C.yellow : C.muted, fontWeight: 800 }}>{row.rank}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{row.name}</td>
                    <td style={{ ...td, color: C.yellow, fontWeight: 800 }}>{row.score}</td>
                    <td style={td}>{row.gamesCompleted} / {GAME_IDS.length}</td>
                    <td style={td}>{row.runs}</td>
                    <td style={td}>{row.best}</td>
                    <td style={{ ...td, color: C.muted }}>
                      {profile?.lastPlayedAt ? new Date(profile.lastPlayedAt).toLocaleString() : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!ranking.length && (
            <p style={{ color: C.muted, fontSize: 13, marginTop: 10 }}>No players have finished an Arena game yet.</p>
          )}
        </div>
      )}

      {/* --------------------------- integrity --------------------------- */}
      {tab === "integrity" && (
        <div>
          <div
            style={{
              display: "flex", alignItems: "flex-start", gap: 8,
              background: C.surfaceRaised, borderRadius: 9, padding: "10px 12px",
              marginBottom: 12, fontSize: 12, color: C.muted, lineHeight: 1.55,
            }}
          >
            <ShieldAlert size={15} color={suspicious.length ? C.red : C.green} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              Scores are validated twice: the game clamps them before writing, and the Realtime
              Database rules reject anything above each game's ceiling, any run written twice, and
              any attempt to edit a run after the fact. This list is the third layer — runs that are
              within the rules but still look implausible.
            </span>
          </div>

          {!suspicious.length && (
            <p style={{ color: C.green, fontSize: 13, display: "flex", alignItems: "center", gap: 7 }}>
              <Check size={14} /> Nothing flagged across {feed.length} submission{feed.length === 1 ? "" : "s"}.
            </p>
          )}

          {suspicious.length > 0 && (
            <div style={{ display: "grid", gap: 6 }}>
              {suspicious.slice(0, 30).map((run) => (
                <div
                  key={run.runId + run.reasons.join()}
                  style={{
                    background: C.red + "12", border: `1px solid ${C.red}44`,
                    borderRadius: 8, padding: "9px 11px", fontSize: 12.5,
                  }}
                >
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                    <b>{run.playerName || run.playerId}</b>
                    <span style={{ color: C.muted }}>{getGame(run.gameId)?.title || run.gameId}</span>
                    <span style={{ color: C.yellow, fontWeight: 800 }}>{run.score} pts</span>
                    <span style={{ color: C.muted, marginLeft: "auto" }}>
                      {run.createdAt ? new Date(run.createdAt).toLocaleString() : ""}
                    </span>
                  </div>
                  <div style={{ color: C.red, marginTop: 4, fontSize: 12 }}>
                    {run.reasons.join(" · ")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Cell({ icon, label, value }) {
  return (
    <div style={{ background: C.surfaceRaised, borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
      <div style={{ fontSize: 17, fontWeight: 900, color: C.yellow, lineHeight: 1.1 }}>{value}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 9.5, color: C.muted, fontWeight: 800, marginTop: 3 }}>
        {icon}{label}
      </div>
    </div>
  );
}
