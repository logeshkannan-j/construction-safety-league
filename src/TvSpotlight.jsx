import React, { useEffect, useMemo, useRef, useState } from "react";
import { Tv, Radio, X, AlertTriangle } from "lucide-react";
import { COLORS } from "./theme.js";
import {
  TV, getTvChannel, createTvViewer, showOnTv, clearTv, onTvError, tvError,
} from "./tvLink.js";

/* ------------------------------------------------------------------ *
 *  LIVE ON THE TV — the screens
 *
 *  The host picks a participant (TvSpotlightPanel, in the admin panel);
 *  the TV shows that participant's 3D mission live (SpotlightStage); the
 *  participant sees that they are on (OnTvBadge). How the picture gets
 *  there is in tvLink.js.
 * ------------------------------------------------------------------ */

/**
 * Who is on the TV, and their live mission record. `viewers` (each TV
 * screen and how it is getting on) only when asked for — the admin
 * panel wants it, nobody else does.
 */
export function useTvSpotlight({ viewers: withViewers = false, channel = null } = {}) {
  const ch = channel || getTvChannel();
  const [spotlight, setSpotlight] = useState(null);
  const [live, setLive] = useState(null);
  const [viewers, setViewers] = useState(null);
  const [error, setError] = useState(tvError);

  useEffect(() => onTvError(setError), []);
  useEffect(() => ch.watch(`${TV}/spotlight`, (v) => setSpotlight(v && v.playerId ? v : null)), [ch]);
  const playerId = spotlight?.playerId || null;
  useEffect(() => {
    setLive(null);
    if (!playerId) return undefined;
    return ch.watch(`${TV}/live/${playerId}`, (v) => setLive(v && v.stream ? v : null));
  }, [ch, playerId]);
  useEffect(() => (withViewers ? ch.watch(`${TV}/viewers`, setViewers) : undefined), [ch, withViewers]);

  return { spotlight, live, viewers, error, channel: ch };
}

const fmtClock = (ms) => {
  if (!Number.isFinite(ms)) return null;
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/** How a TV screen is getting on, in words for the host. */
export function describeScreens(viewers, token) {
  const mine = Object.values(viewers || {}).filter((v) => v && v.token === token);
  if (!token) return { text: "Nobody is on the TV.", tone: COLORS.muted };
  if (!mine.length) return { text: "No TV screen is open — open the TV display on the projector.", tone: COLORS.yellow };
  const states = mine.map((v) => v.state);
  if (states.includes("video")) return { text: "Live video on the TV.", tone: COLORS.green };
  if (states.includes("snapshots")) return { text: "On the TV as snapshots — this network will not let the devices connect directly.", tone: COLORS.yellow };
  if (states.includes("connecting")) return { text: "Connecting to the TV…", tone: COLORS.muted };
  return { text: "On the TV, waiting for their next 3D mission.", tone: COLORS.muted };
}

/* ------------------------------- the TV ------------------------------- */

/**
 * The spotlit participant's mission, live, filling most of the TV, with
 * the race down the side so the room still sees everybody.
 *
 * `where` is what App.jsx already says about them (describeParticipant);
 * `standings` is the race, best first.
 */
export function SpotlightStage({ spotlight, live, player = null, where = null, standings = [], channel = null }) {
  const ch = channel || getTvChannel();
  const videoRef = useRef(null);
  const viewerRef = useRef(null);
  const [media, setMedia] = useState(null);
  const [frame, setFrame] = useState(null);
  const [state, setState] = useState("idle");

  useEffect(() => {
    const viewer = createTvViewer({ channel: ch, onStream: setMedia, onFrame: setFrame, onState: setState });
    viewerRef.current = viewer;
    return () => { viewer.dispose(); viewerRef.current = null; };
  }, [ch]);

  useEffect(() => {
    viewerRef.current?.follow({ spotlight, live });
  }, [spotlight?.token, spotlight?.playerId, live?.stream]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== media) el.srcObject = media;
    if (media) el.play?.()?.catch?.(() => {});
  }, [media, state]);

  const name = player?.name || spotlight?.name || "Player";
  const team = player?.team || live?.team || "";
  const clock = fmtClock(live?.timeMs);
  const showVideo = state === "video" && media;
  const showFrame = !showVideo && frame;

  let message = null;
  if (!live) {
    message = where?.label
      ? `${name} is on: ${where.label}. Their 3D mission will appear here as soon as they start it.`
      : `Their 3D mission will appear here as soon as ${name} starts it.`;
  } else if (!showVideo && !showFrame) {
    message = state === "snapshots" ? "Waiting for the first picture…" : "Connecting to the player…";
  }

  return (
    <div className="csl-tv-spotlight" style={{ flex: 1, minHeight: 0 }}>
      <style>{`.csl-tv-spotlight { display: grid; grid-template-columns: minmax(0, 3fr) minmax(250px, 1fr); gap: 18px; }
        @media (max-width: 900px) { .csl-tv-spotlight { grid-template-columns: 1fr; } }`}</style>

      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, background: COLORS.red, color: "#fff", fontWeight: 900, fontSize: 13, letterSpacing: 1.2, padding: "6px 12px", borderRadius: 6 }}>
            <Radio size={15} /> LIVE
          </span>
          <span style={{ fontSize: 30, fontWeight: 900, letterSpacing: -0.5 }}>{name}</span>
          {team && <span style={{ color: COLORS.muted, fontSize: 18, fontWeight: 700 }}>{team}</span>}
          <span style={{ marginLeft: "auto", color: COLORS.orange, fontWeight: 800, fontSize: 16, letterSpacing: 0.5 }}>
            {[live?.round, live?.title].filter(Boolean).join(" · ") || where?.label || ""}
          </span>
        </div>

        <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", background: "#07090B", borderRadius: 14, overflow: "hidden", border: `2px solid ${COLORS.line}` }}>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", display: showVideo ? "block" : "none" }}
          />
          {showFrame && (
            <img src={frame} alt={`${name}'s mission`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
          )}
          {message && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 30, textAlign: "center" }}>
              <Tv size={54} color={COLORS.yellow} />
              <div style={{ fontSize: 24, fontWeight: 800, maxWidth: 720, lineHeight: 1.35 }}>{message}</div>
              {Number.isFinite(player?.score) && (
                <div style={{ color: COLORS.muted, fontSize: 18 }}>Score so far <b style={{ color: COLORS.yellow }}>{player.score}</b></div>
              )}
            </div>
          )}
          {live && (
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "14px 18px", background: "linear-gradient(to top, #000000cc, #00000000)", display: "flex", alignItems: "flex-end", gap: 18 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                {live.objective && <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.ink, textShadow: "0 1px 3px #000", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{live.objective}</div>}
                {Number.isFinite(live.progress) && (
                  <div style={{ height: 6, background: "#ffffff22", borderRadius: 4, marginTop: 8, overflow: "hidden" }}>
                    <div style={{ width: `${Math.max(0, Math.min(100, live.progress))}%`, height: "100%", background: COLORS.green }} />
                  </div>
                )}
              </div>
              {clock && <div style={{ fontSize: 30, fontWeight: 900, fontVariantNumeric: "tabular-nums", color: live.timeMs < 30000 ? COLORS.red : COLORS.ink }}>{clock}</div>}
              {Number.isFinite(live.score) && (
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, color: COLORS.muted }}>MISSION SCORE</div>
                  <div style={{ fontSize: 34, fontWeight: 900, color: COLORS.yellow, fontVariantNumeric: "tabular-nums" }}>{Math.round(live.score)}</div>
                </div>
              )}
            </div>
          )}
          {state === "snapshots" && (showFrame || message) && (
            <div style={{ position: "absolute", top: 12, right: 12, fontSize: 12, color: COLORS.ink, background: "#000000aa", padding: "4px 9px", borderRadius: 6 }}>
              Snapshots — no direct connection on this network
            </div>
          )}
        </div>
      </div>

      <div style={{ minWidth: 0, background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 14, padding: 16, overflow: "hidden" }}>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 1, color: COLORS.muted, marginBottom: 10 }}>THE RACE</div>
        {standings.slice(0, 10).map((p, i) => {
          const me = String(p.id) === String(spotlight?.playerId);
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, marginBottom: 4, background: me ? `${COLORS.red}22` : "transparent", border: `1px solid ${me ? COLORS.red : "transparent"}` }}>
              <span style={{ width: 22, color: i < 3 ? COLORS.yellow : COLORS.muted, fontWeight: 900 }}>{i + 1}</span>
              <span style={{ flex: 1, minWidth: 0, fontWeight: me ? 900 : 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
              <span style={{ fontWeight: 900, color: COLORS.yellow, fontVariantNumeric: "tabular-nums" }}>{p.score || 0}</span>
            </div>
          );
        })}
        {!standings.length && <div style={{ color: COLORS.muted }}>Nobody has joined yet.</div>}
      </div>
    </div>
  );
}

/* ------------------------------ the host ------------------------------ */

/**
 * The admin's control: everybody who has joined, where they are, and a
 * button to put any one of them on the TV.
 *
 * `describe(player)` is App.jsx's describeParticipant for the event plan.
 */
export function TvSpotlightPanel({ players = [], describe = () => null, channel = null }) {
  const { spotlight, viewers, error, channel: ch } = useTvSpotlight({ viewers: true, channel });
  const [busy, setBusy] = useState(false);
  const status = describeScreens(viewers, spotlight?.token);

  const rows = useMemo(() => players
    .map((p) => ({ p, where: describe(p) || null }))
    .sort((a, b) => Number(b.where?.sub === "3D MISSION") - Number(a.where?.sub === "3D MISSION")
      || String(a.p.name || "").localeCompare(String(b.p.name || ""))),
  [players, describe]);

  async function pick(p) {
    setBusy(true);
    await showOnTv(ch, p);
    setBusy(false);
  }

  async function stop() {
    setBusy(true);
    await clearTv(ch);
    setBusy(false);
  }

  return (
    <div>
      {error?.denied && (
        <div style={{ display: "flex", gap: 10, background: `${COLORS.red}1f`, border: `1px solid ${COLORS.red}`, borderRadius: 10, padding: "11px 13px", marginBottom: 12, fontSize: 13, lineHeight: 1.5 }}>
          <AlertTriangle size={17} color={COLORS.red} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <b style={{ color: COLORS.red }}>The database will not take the TV link yet.</b>{" "}
            Publish this project&apos;s <code>rules.json</code>: Firebase console → Realtime Database → Rules →
            paste it → <b>Publish</b>. Nothing else needs to change.
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: COLORS.surfaceRaised, borderRadius: 10, padding: "11px 13px", marginBottom: 12 }}>
        <Tv size={18} color={spotlight ? COLORS.red : COLORS.muted} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 800 }}>{spotlight ? `On the TV: ${spotlight.name}` : "The TV shows the scoreboard"}</div>
          <div style={{ fontSize: 12, color: status.tone, marginTop: 2 }}>{status.text}</div>
        </div>
        {spotlight && (
          <button disabled={busy} onClick={stop} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8, border: `1px solid ${COLORS.line}`, background: COLORS.surface, color: COLORS.ink, fontWeight: 800, cursor: "pointer" }}>
            <X size={14} /> Back to the scoreboard
          </button>
        )}
      </div>

      {!rows.length && <p style={{ color: COLORS.muted, fontSize: 14, margin: 0 }}>Nobody has joined yet.</p>}
      {rows.map(({ p, where }) => {
        const on = String(spotlight?.playerId) === String(p.id);
        return (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 4px", borderBottom: `1px solid ${COLORS.line}` }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.name}{p.team ? <span style={{ color: COLORS.muted, fontWeight: 600 }}> · {p.team}</span> : null}
              </div>
              {where?.label && <div style={{ fontSize: 12, color: where.tone || COLORS.muted }}>{where.sub ? `${where.sub} · ` : ""}{where.label}</div>}
            </div>
            {on ? (
              <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1, color: COLORS.red, border: `1px solid ${COLORS.red}`, borderRadius: 20, padding: "4px 10px" }}>ON THE TV</span>
            ) : (
              <button disabled={busy} onClick={() => pick(p)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "none", background: COLORS.yellow, color: "#14171A", fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>
                <Tv size={14} /> Show on TV
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ----------------------------- the player ----------------------------- */

/** A small, honest notice on the player's own screen while they are on. */
export function OnTvBadge() {
  return (
    <div
      role="status"
      style={{
        // Just under the HUD's top bar, centred: clear of the toasts
        // (a quarter of the way down) and the prompts (lower still).
        position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)",
        zIndex: 30, pointerEvents: "none", display: "inline-flex", alignItems: "center", gap: 6,
        background: "#EA4F4Fe6", color: "#fff", fontWeight: 900, fontSize: 11, letterSpacing: 1,
        padding: "4px 10px", borderRadius: 20, boxShadow: "0 2px 8px #0006",
      }}
    >
      <Radio size={12} /> LIVE ON THE TV
    </div>
  );
}
