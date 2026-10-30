import React, { useCallback, useEffect, useRef, useState } from "react";
import { HardHat, Gamepad2, Loader2 } from "lucide-react";
import { C, getGame } from "./arenaConstants.js";
import { resolveIdentity, saveName, resolvePlayerId } from "./identity.js";
import { ensureProfile, fetchProfile, fetchArenaConfig, defaultArenaConfig } from "./arenaDb.js";
import { ArenaButton, panelStyle } from "./ui/primitives.jsx";
import { ARENA_KEYFRAMES } from "./ui/Hud.jsx";
import ArenaHome from "./ui/ArenaHome.jsx";
import ArenaLeaderboard from "./ui/ArenaLeaderboard.jsx";
import GameShell from "./ui/GameShell.jsx";
import { unlockAudio } from "./audio.js";

/* ------------------------------------------------------------------ *
 *  ARENA ROOT
 *
 *  Routes between the Arena home page, the leaderboard and a running
 *  game, using the same "screen state" pattern App.jsx already uses for
 *  admin / player / TV — so no router is introduced and no existing
 *  route changes.
 *
 *  It also resolves the player's identity: if this browser has joined a
 *  quiz, the Arena adopts that player's name and id. Otherwise it asks
 *  for a name once and remembers it.
 * ------------------------------------------------------------------ */

export default function ArenaView({ onExit }) {
  const [screen, setScreen] = useState("loading"); // loading | name | home | game | leaderboard
  const [identity, setIdentity] = useState(null);
  const [profile, setProfile] = useState(null);
  const [config, setConfig] = useState(defaultArenaConfig);
  const [activeGameId, setActiveGameId] = useState(null);
  const [boardGameId, setBoardGameId] = useState("overall");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const mountedRef = useRef(true);

  // React StrictMode mounts, unmounts and re-mounts every component in dev.
  // The flag MUST be re-armed on each mount: if it is only ever cleared, the
  // second mount's bootstrap() bails out at its first `if (!mountedRef.current)`
  // and the Arena sits on its loading spinner forever. App.jsx does the same.
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  /* --------------------------- bootstrap --------------------------- */

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const resolved = await resolveIdentity();
      if (!mountedRef.current) return;

      if (!resolved.name) {
        setIdentity(resolved);
        setScreen("name");
        setLoading(false);
        return;
      }

      setIdentity(resolved);
      const [savedProfile, arenaConfig] = await Promise.all([
        ensureProfile(resolved.id, {
          name: resolved.name,
          team: resolved.team,
          company: resolved.company,
        }),
        fetchArenaConfig(),
      ]);
      if (!mountedRef.current) return;

      setProfile(savedProfile);
      setConfig(arenaConfig);
      if (!savedProfile) {
        setError("Connected, but your Arena profile could not be read. Scores may not save — check your connection.");
      }
      setScreen("home");
    } catch (e) {
      console.error("[arena] bootstrap failed", e);
      if (!mountedRef.current) return;
      setError("Could not reach the Construction League database. You can still play, but scores will not be saved.");
      setIdentity((current) => current || { id: resolvePlayerId(), name: "Player", source: "none" });
      setScreen("home");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  /* ---------------------------- actions ---------------------------- */

  const refreshProfile = useCallback(async () => {
    if (!identity?.id) return;
    setLoading(true);
    try {
      const [fresh, arenaConfig] = await Promise.all([fetchProfile(identity.id), fetchArenaConfig()]);
      if (!mountedRef.current) return;
      if (fresh) setProfile(fresh);
      setConfig(arenaConfig);
      setError("");
    } catch (e) {
      console.error("[arena] refresh failed", e);
      setError("Refresh failed. Check your connection.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [identity?.id]);

  const handleNameSubmit = useCallback(async (name) => {
    const clean = saveName(name);
    if (!clean) return;
    const next = { ...(identity || { id: resolvePlayerId() }), name: clean, source: "arena" };
    setIdentity(next);
    setLoading(true);
    try {
      const [savedProfile, arenaConfig] = await Promise.all([
        ensureProfile(next.id, { name: clean }),
        fetchArenaConfig(),
      ]);
      if (!mountedRef.current) return;
      setProfile(savedProfile);
      setConfig(arenaConfig);
    } catch (e) {
      console.error("[arena] profile create failed", e);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setScreen("home");
      }
    }
  }, [identity]);

  const playGame = useCallback((gameId) => {
    if (config?.games?.[gameId]?.enabled === false) return;
    unlockAudio();
    setActiveGameId(gameId);
    setScreen("game");
  }, [config]);

  const leaveGame = useCallback(() => {
    setActiveGameId(null);
    setScreen("home");
    refreshProfile();
  }, [refreshProfile]);

  const openLeaderboard = useCallback((gameId = "overall") => {
    setBoardGameId(gameId || "overall");
    setActiveGameId(null);
    setScreen("leaderboard");
  }, []);

  /* ---------------------------- rendering ---------------------------- */

  if (screen === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <style>{ARENA_KEYFRAMES}</style>
        <div style={{ textAlign: "center" }}>
          <Loader2 size={30} color={C.yellow} style={{ animation: "cslArenaSpin 1s linear infinite" }} />
          <div style={{ color: C.muted, fontSize: 13, marginTop: 14 }}>Opening the Gaming Arena…</div>
        </div>
      </div>
    );
  }

  if (screen === "name") {
    return <NamePrompt onSubmit={handleNameSubmit} onExit={onExit} busy={loading} />;
  }

  if (screen === "game" && activeGameId) {
    const game = getGame(activeGameId);
    if (!game) {
      // Defensive only: activeGameId always comes from the registry.
      console.error("[arena] unknown game id", activeGameId);
      return null;
    }
    return (
      <GameShell
        key={activeGameId}
        game={game}
        identity={identity}
        onExit={leaveGame}
        onOpenLeaderboard={openLeaderboard}
      />
    );
  }

  if (screen === "leaderboard") {
    return (
      <ArenaLeaderboard
        identity={identity}
        initialGameId={boardGameId}
        onBack={() => setScreen("home")}
        onPlay={() => setScreen("home")}
      />
    );
  }

  return (
    <ArenaHome
      identity={identity}
      profile={profile}
      config={config}
      loading={loading}
      error={error}
      onPlay={playGame}
      onOpenLeaderboard={openLeaderboard}
      onRefresh={refreshProfile}
      onExit={onExit}
      onChangeName={() => setScreen("name")}
    />
  );
}

/* --------------------------- name prompt --------------------------- */

function NamePrompt({ onSubmit, onExit, busy }) {
  const [name, setName] = useState("");
  const valid = name.trim().length >= 2;

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{ARENA_KEYFRAMES}</style>
      <div style={{ ...panelStyle, width: "min(100%, 420px)", animation: "cslArenaRise .3s ease-out" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
          <Gamepad2 size={20} color={C.yellow} />
          <h2 style={{ fontSize: 19, fontWeight: 900, margin: 0 }}>Enter the Gaming Arena</h2>
        </div>
        <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.6, margin: "0 0 16px" }}>
          What name should appear on the Arena leaderboard? If you later join a live quiz on this
          device, your quiz name takes over automatically — you will not end up with two profiles.
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 32))}
          onKeyDown={(e) => { if (e.key === "Enter" && valid) onSubmit(name); }}
          placeholder="Your name"
          aria-label="Your name"
          autoFocus
          style={{
            width: "100%", padding: "12px 14px", marginBottom: 14, borderRadius: 9,
            border: `1px solid ${C.line}`, background: C.surfaceRaised, color: C.ink,
            fontSize: 15, outline: "none", boxSizing: "border-box",
          }}
        />
        <ArenaButton onClick={() => onSubmit(name)} color={C.yellow} disabled={!valid || busy} full size="lg" icon={<HardHat size={17} />}>
          {busy ? "Setting up…" : "ENTER THE ARENA"}
        </ArenaButton>
        <button
          type="button"
          onClick={onExit}
          style={{
            background: "none", border: "none", color: C.muted, fontSize: 12.5,
            cursor: "pointer", textDecoration: "underline", marginTop: 14, width: "100%",
          }}
        >
          ← Back to the main menu
        </button>
      </div>
    </div>
  );
}
