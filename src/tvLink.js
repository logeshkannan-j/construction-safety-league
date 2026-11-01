/* ------------------------------------------------------------------ *
 *  LIVE ON THE TV
 *
 *  The host picks a participant in the admin panel, and the TV shows
 *  that participant's 3D mission as it is being played.
 *
 *  The picture goes straight from the player's device to the TV over
 *  WebRTC: peer to peer, so it is smooth, and it costs the database
 *  nothing. The Realtime Database only carries the introductions:
 *
 *    tv/spotlight                  who is on the TV:
 *                                  { playerId, name, token, at } — a new
 *                                  token every time the host picks
 *    tv/live/{playerId}            the player's mission, about once a
 *                                  second: title, round, score, time
 *                                  left, and `stream`, the id of the
 *                                  picture on offer for this mission
 *    tv/viewers/{viewerId}         each screen showing it: the token it
 *                                  follows and how it is getting on
 *    tv/links/{viewerId}/{stream}  one introduction: the player's offer,
 *                                  the screen's answer, and `fallback`
 *    tv/frames/{playerId}          snapshots, twice a second, for a
 *                                  screen that could not connect directly
 *
 *  Some networks — guest Wi-Fi that keeps devices apart, some mobile
 *  carriers — will not let two devices connect directly, and there is
 *  no relay server. Then the screen asks for `fallback` and the player
 *  sends small snapshots through the database instead: a slide show
 *  rather than video, but the room still sees the game.
 *
 *  Everything here talks to a `channel` — the little this needs from a
 *  realtime store — so it can be tested against memoryChannel() with no
 *  database at all.
 * ------------------------------------------------------------------ */

import { getApp, getApps, initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, remove, onDisconnect } from "firebase/database";
import { firebaseConfig } from "./firebaseConfig.js";

export const TV = "tv";

// Public STUN servers: they tell each device its outside address, which
// is all a direct connection needs on most networks.
export const ICE_SERVERS = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];

const GATHER_MS = 2500;     // longest wait for the network routes before sending them
const DIRECT_MS = 12000;    // longest wait for a direct connection before snapshots
const RECOVER_MS = 5000;    // a dropped connection gets this long to come back
const FRAME_MS = 500;       // a snapshot every half second
const FRAME_WIDTH = 480;
const LIVE_MS = 1000;       // the score and clock, about once a second
const MAX_VIEWERS = 3;      // each screen is one more video for the phone to encode

/** A short random id that is safe as a database key. */
export function newId(length = 12) {
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = globalThis.crypto?.getRandomValues
    ? globalThis.crypto.getRandomValues(new Uint8Array(length))
    : Array.from({ length }, () => Math.floor(Math.random() * 256));
  let id = "";
  for (let i = 0; i < length; i++) id += abc[bytes[i] % abc.length];
  return id;
}

/* ------------------------------ channels ------------------------------ */

/**
 * The Realtime Database as a channel. Writes resolve to true or false
 * rather than throwing; a refusal is reported through `onError`, which
 * is how the admin panel finds out the rules have not been published.
 */
export function firebaseChannel({ onError = () => {} } = {}) {
  const db = getDatabase(getApps().length ? getApp() : initializeApp(firebaseConfig));
  const done = (promise) => promise.then(() => true, (e) => { onError(e); return false; });
  return {
    watch(path, cb) {
      return onValue(ref(db, path), (snap) => cb(snap.val()), (e) => { onError(e); cb(null); });
    },
    write: (path, value) => done(set(ref(db, path), value)),
    remove: (path) => done(remove(ref(db, path))),
    // Removed by the server if this device drops off without cleaning up.
    removeOnDisconnect(path) {
      const d = onDisconnect(ref(db, path));
      d.remove().catch(onError);
      return () => { d.cancel().catch(() => {}); };
    },
  };
}

const copy = (value) => (value === undefined ? null : JSON.parse(JSON.stringify(value)));

/**
 * A channel kept in memory, for tests: the same shape, the same
 * behaviour for the parts this uses (a watcher is called with the
 * current value straight away, and again whenever it changes; null
 * means nothing is there; `disconnect()` runs the onDisconnect removals).
 */
export function memoryChannel() {
  const root = {};
  const watchers = new Set();
  let leaving = new Set();
  const keys = (path) => path.split("/").filter(Boolean);
  const read = (path) => keys(path).reduce((node, k) => (node == null ? undefined : node[k]), root);
  const put = (path, value) => {
    const parts = keys(path);
    const trail = [root];
    let node = root;
    for (const k of parts.slice(0, -1)) {
      if (typeof node[k] !== "object" || node[k] === null) node[k] = {};
      node = node[k];
      trail.push(node);
    }
    const last = parts[parts.length - 1];
    if (value === null || value === undefined) delete node[last];
    else node[last] = copy(value);
    // Like the database, an empty object is no object at all.
    for (let i = parts.length - 2; i >= 0; i--) {
      if (Object.keys(trail[i + 1]).length === 0) delete trail[i][parts[i]];
    }
  };
  const notify = () => {
    for (const w of [...watchers]) {
      const now = JSON.stringify(read(w.path) ?? null);
      if (now !== w.last && watchers.has(w)) {
        w.last = now;
        w.cb(JSON.parse(now));
      }
    }
  };
  return {
    root,
    watch(path, cb) {
      const w = { path, cb, last: undefined };
      watchers.add(w);
      Promise.resolve().then(() => {
        if (!watchers.has(w) || w.last !== undefined) return;
        w.last = JSON.stringify(read(path) ?? null);
        cb(JSON.parse(w.last));
      });
      return () => { watchers.delete(w); };
    },
    write(path, value) { put(path, value); notify(); return Promise.resolve(true); },
    remove(path) { put(path, null); notify(); return Promise.resolve(true); },
    removeOnDisconnect(path) {
      leaving.add(path);
      return () => { leaving.delete(path); };
    },
    read: (path) => copy(read(path)),
    disconnect() {
      const paths = [...leaving];
      leaving = new Set();
      paths.forEach((p) => put(p, null));
      notify();
    },
  };
}

/* The page's own channel: the database, made once, unless a test has
 * put something else in its place. Refusals are kept so the screens can
 * say what is wrong instead of just showing nothing. */
let shared = null;
let lastError = null;
const errorListeners = new Set();

function noteError(e) {
  const message = String(e?.message || e || "");
  lastError = { message, denied: /permission[_ ]denied/i.test(message) || e?.code === "PERMISSION_DENIED", at: Date.now() };
  errorListeners.forEach((fn) => { try { fn(lastError); } catch { /* a listener must not break the rest */ } });
}

export function getTvChannel() {
  if (!shared) shared = firebaseChannel({ onError: noteError });
  return shared;
}

/** For tests: use another channel (a memoryChannel) for this page. */
export function setTvChannel(channel) {
  shared = channel;
  lastError = null;
}

export function tvError() {
  return lastError;
}

/** Calls `fn` with each refusal or failure. Returns an unsubscribe. */
export function onTvError(fn) {
  errorListeners.add(fn);
  return () => { errorListeners.delete(fn); };
}

/* ------------------------------ the host ------------------------------ */

/** Puts a participant on the TV. */
export function showOnTv(channel, player) {
  return channel.write(`${TV}/spotlight`, {
    playerId: String(player.id),
    name: String(player.name || "Player").slice(0, 40),
    token: newId(),
    at: Date.now(),
  });
}

/** Takes them off: the TV goes back to the scoreboard. */
export function clearTv(channel) {
  return channel.remove(`${TV}/spotlight`);
}

/** What goes up to the TV about the game, and nothing else: only known
 *  fields, of the right type and length (the database rules check the
 *  same), never `undefined` (which the database refuses outright). */
export function liveStats(stats = {}) {
  const out = {};
  const text = (key, max) => {
    if (typeof stats[key] === "string" && stats[key]) out[key] = stats[key].slice(0, max);
  };
  const number = (key, lo, hi) => {
    const v = Number(stats[key]);
    if (stats[key] !== null && stats[key] !== undefined && Number.isFinite(v)) out[key] = Math.min(hi, Math.max(lo, v));
  };
  text("name", 40);
  text("team", 40);
  text("gameId", 40);
  text("title", 60);
  text("round", 40);
  text("objective", 140);
  number("score", 0, 100000);
  number("timeMs", 0, 7200000);
  number("progress", 0, 100);
  return out;
}

/* ------------------------------ helpers ------------------------------ */

/** Resolves once the connection knows its network routes — or after
 *  GATHER_MS, with what it has: the offer and answer then carry every
 *  route in one message, so nothing else has to be passed back and forth. */
function gathered(pc, ms = GATHER_MS) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    let timer = 0;
    const check = () => {
      if (pc.iceGatheringState !== "complete") return;
      clearTimeout(timer);
      pc.removeEventListener?.("icegatheringstatechange", check);
      resolve();
    };
    timer = setTimeout(() => {
      pc.removeEventListener?.("icegatheringstatechange", check);
      resolve();
    }, ms);
    pc.addEventListener?.("icegatheringstatechange", check);
  });
}

const closeQuietly = (pc) => { try { pc?.close(); } catch { /* already closed */ } };

/* ------------------------------ the player ------------------------------ */

/**
 * The player's side, for one mission (one canvas). Give it the spotlight
 * whenever that changes (`follow`), the HUD whenever that changes
 * (`publish`), and `dispose` it when the mission ends.
 *
 * Until the spotlight names this player it does nothing at all — no
 * video is encoded and nothing is written.
 */
export function createTvSender({
  channel, playerId, canvas, info = {},
  rtc = globalThis, doc = globalThis.document,
  fps = 24, maxBitrate = 1500000, maxWidth = 1280, iceServers = ICE_SERVERS,
  onState = () => {},
}) {
  const stream = newId();
  const RTC = rtc?.RTCPeerConnection || null;
  const path = {
    live: `${TV}/live/${playerId}`,
    frames: `${TV}/frames/${playerId}`,
    viewers: `${TV}/viewers`,
    link: (viewerId) => `${TV}/links/${viewerId}/${stream}`,
  };
  const peers = new Map();
  let token = null;
  let media = null;
  let disposed = false;
  let lastViewers = null;
  let stopViewers = null;
  let live = liveStats(info);
  let lastLive = 0;
  let liveTimer = 0;
  let cancelLiveDrop = null;
  let frameTimer = 0;
  let cancelFramesDrop = null;
  let snap = null;
  let state = "off";

  const setState = (next) => {
    if (next === state) return;
    state = next;
    onState(next);
  };

  /** The canvas as video, made the first time a screen wants it. */
  function capture() {
    if (!media) {
      try { media = typeof canvas?.captureStream === "function" ? canvas.captureStream(fps) : null; } catch { media = null; }
      // A projector shows blur far more than a slightly lower frame rate:
      // when the network or the phone cannot keep up, keep the picture
      // sharp and let the frame rate give.
      media?.getVideoTracks?.().forEach((t) => { try { t.contentHint = "detail"; } catch { /* not supported */ } });
    }
    return media;
  }

  /* --- what the TV shows round the picture --- */

  function writeLive() {
    if (!token || disposed) return;
    clearTimeout(liveTimer);
    liveTimer = 0;
    lastLive = Date.now();
    channel.write(path.live, { ...live, stream, at: lastLive })
      .then((ok) => { if (token) setState(ok ? "on" : "blocked"); });
  }

  function publish(stats) {
    live = { ...live, ...liveStats(stats) };
    if (!token || disposed) return;
    const wait = LIVE_MS - (Date.now() - lastLive);
    if (wait <= 0) writeLive();
    else if (!liveTimer) liveTimer = setTimeout(writeLive, wait);
  }

  /* --- one screen --- */

  async function offer(viewerId, peer) {
    const pc = new RTC({ iceServers });
    peer.pc = pc;
    const video = capture();
    const track = video?.getVideoTracks?.()[0];
    if (track) {
      // Sent at no more than 1280 wide, whatever the phone renders at.
      const scale = Math.max(1, (canvas?.width || maxWidth) / maxWidth);
      try {
        pc.addTransceiver(track, {
          direction: "sendonly",
          streams: [video],
          sendEncodings: [{ maxBitrate, maxFramerate: fps, scaleResolutionDownBy: scale }],
        });
      } catch {
        pc.addTrack(track, video);
      }
    }
    // The same preference, set on the sender as well, where browsers
    // that ignore the hint still honour it.
    pc.getSenders?.().forEach((sender) => {
      try {
        const params = sender.getParameters();
        sender.setParameters({ ...params, degradationPreference: "maintain-resolution" })?.catch?.(() => {});
      } catch { /* not supported: the browser's own balance it is */ }
    });
    const made = await pc.createOffer();
    await pc.setLocalDescription(made);
    await gathered(pc);
    if (disposed || peers.get(viewerId) !== peer) { closeQuietly(pc); return; }
    peer.offerId = newId();
    await channel.write(`${path.link(viewerId)}/offer`, {
      id: peer.offerId, type: pc.localDescription.type, sdp: pc.localDescription.sdp, at: Date.now(),
    });
  }

  async function onLink(viewerId, peer, link) {
    if (peers.get(viewerId) !== peer) return;
    const wantsFrames = !!link?.fallback;
    if (wantsFrames !== peer.wantsFrames) {
      peer.wantsFrames = wantsFrames;
      frames();
    }
    const answer = link?.answer;
    if (!answer || !peer.pc || peer.answered || answer.to !== peer.offerId) return;
    peer.answered = true;
    try {
      await peer.pc.setRemoteDescription({ type: answer.type, sdp: answer.sdp });
    } catch (e) {
      console.warn("[tv] the screen's answer did not fit", e);
    }
  }

  function addViewer(viewerId, viewerToken) {
    const peer = { token: viewerToken, pc: null, offerId: null, answered: false, wantsFrames: false };
    peers.set(viewerId, peer);
    peer.cancelDrop = channel.removeOnDisconnect(path.link(viewerId));
    peer.unwatch = channel.watch(path.link(viewerId), (link) => onLink(viewerId, peer, link));
    if (RTC && capture()?.getVideoTracks?.().length) {
      offer(viewerId, peer).catch((e) => console.warn("[tv] could not offer the picture", e));
    }
  }

  function dropViewer(viewerId) {
    const peer = peers.get(viewerId);
    if (!peer) return;
    peers.delete(viewerId);
    peer.unwatch?.();
    closeQuietly(peer.pc);
    peer.cancelDrop?.();
    channel.remove(path.link(viewerId));
    frames();
  }

  function onViewers(all) {
    lastViewers = all;
    if (disposed) return;
    const wanted = token
      ? Object.entries(all || {})
        .filter(([, v]) => v && v.token === token)
        .map(([id]) => id)
        .slice(0, MAX_VIEWERS)
      : [];
    for (const [id, peer] of [...peers]) {
      if (!wanted.includes(id) || peer.token !== token) dropViewer(id);
    }
    for (const id of wanted) if (!peers.has(id)) addViewer(id, token);
  }

  /* --- snapshots, for a screen that could not connect --- */

  function snapshot() {
    const video = capture();
    if (!video || !doc?.createElement) return null;
    if (!snap) {
      const el = doc.createElement("video");
      el.muted = true;
      el.playsInline = true;
      el.setAttribute?.("playsinline", "");
      el.autoplay = true;
      // In the page, out of sight: some browsers will not play a video
      // that is not in the document.
      el.style.cssText = "position:fixed;left:-8px;top:-8px;width:2px;height:2px;opacity:0;pointer-events:none";
      el.srcObject = video;
      doc.body?.appendChild(el);
      el.play?.()?.catch?.(() => {});
      const board = doc.createElement("canvas");
      snap = { el, board, ctx: board.getContext?.("2d") || null };
    }
    const { el, board, ctx } = snap;
    if (!ctx || el.readyState < 2 || !el.videoWidth) return null;
    const w = Math.min(FRAME_WIDTH, el.videoWidth);
    const h = Math.max(1, Math.round((w * el.videoHeight) / el.videoWidth));
    if (board.width !== w) board.width = w;
    if (board.height !== h) board.height = h;
    ctx.drawImage(el, 0, 0, w, h);
    try { return board.toDataURL("image/jpeg", 0.6); } catch { return null; }
  }

  function frames() {
    const wanted = !disposed && token && [...peers.values()].some((p) => p.wantsFrames);
    if (wanted && !frameTimer) {
      cancelFramesDrop = channel.removeOnDisconnect(path.frames);
      frameTimer = setInterval(() => {
        const img = snapshot();
        if (img) channel.write(path.frames, { stream, img, at: Date.now() });
      }, FRAME_MS);
    } else if (!wanted && frameTimer) {
      clearInterval(frameTimer);
      frameTimer = 0;
      cancelFramesDrop?.();
      cancelFramesDrop = null;
      channel.remove(path.frames);
    }
  }

  /* --- on and off --- */

  function goOff() {
    for (const id of [...peers.keys()]) dropViewer(id);
    clearTimeout(liveTimer);
    liveTimer = 0;
    if (cancelLiveDrop) {
      cancelLiveDrop();
      cancelLiveDrop = null;
      channel.remove(path.live);
    }
    frames();
    setState("off");
  }

  return {
    stream,
    get state() { return state; },
    get viewers() { return peers.size; },

    /** The spotlight changed: start, start again for a new pick, or stop. */
    follow(spotlight) {
      if (disposed) return;
      const next = spotlight && String(spotlight.playerId) === String(playerId) ? spotlight.token || null : null;
      if (next === token) return;
      goOff();
      token = next;
      if (!token) return;
      cancelLiveDrop = channel.removeOnDisconnect(path.live);
      writeLive();
      if (!stopViewers) stopViewers = channel.watch(path.viewers, onViewers);
      else onViewers(lastViewers);
    },

    publish,

    /** The mission is over: everything off, and nothing left behind. */
    dispose() {
      if (disposed) return;
      goOff();
      disposed = true;
      token = null;
      stopViewers?.();
      stopViewers = null;
      if (snap) {
        try { snap.el.pause?.(); } catch { /* not playing */ }
        snap.el.srcObject = null;
        snap.el.remove?.();
        snap = null;
      }
      media?.getTracks?.().forEach((t) => { try { t.stop(); } catch { /* already stopped */ } });
      media = null;
    },
  };
}

/* ------------------------------ the screen ------------------------------ */

/**
 * The TV's side. Give it the spotlight and the player's live record
 * whenever either changes (`follow`); it hands back the video
 * (`onStream`) or, failing a direct connection, snapshots (`onFrame`),
 * and says how it is getting on (`onState`):
 *
 *   idle        nobody is on the TV
 *   waiting     they are on, but not in a 3D mission right now
 *   connecting  a mission is on; making the connection
 *   video       showing it live
 *   snapshots   no direct connection; showing snapshots
 */
export function createTvViewer({
  channel, viewerId = newId(), rtc = globalThis, iceServers = ICE_SERVERS,
  directMs = DIRECT_MS, onStream = () => {}, onFrame = () => {}, onState = () => {},
}) {
  const RTC = rtc?.RTCPeerConnection || null;
  const linkOf = (s) => `${TV}/links/${viewerId}/${s}`;
  let token = null;
  let playerId = null;
  let stream = null;
  let pc = null;
  let offerId = null;
  let unwatchLink = null;
  let unwatchFrames = null;
  let fallbackTimer = 0;
  let state = "idle";
  let disposed = false;
  const cancelDrops = [
    channel.removeOnDisconnect(`${TV}/viewers/${viewerId}`),
    channel.removeOnDisconnect(`${TV}/links/${viewerId}`),
  ];

  function register() {
    if (disposed) return;
    if (!token) channel.remove(`${TV}/viewers/${viewerId}`);
    else channel.write(`${TV}/viewers/${viewerId}`, { token, state, at: Date.now() });
  }

  /** Returns whether it changed; `quiet` leaves the registration to the caller. */
  function setState(next, { quiet = false } = {}) {
    if (next === state) return false;
    state = next;
    onState(next);
    if (!quiet) register();
    return true;
  }

  function stopFrames() {
    if (!unwatchFrames) return;
    unwatchFrames();
    unwatchFrames = null;
    onFrame(null);
    if (stream) channel.write(`${linkOf(stream)}/fallback`, false);
  }

  function requestFrames() {
    if (!stream || !playerId || unwatchFrames || disposed) return;
    const mine = stream;
    setState("snapshots");
    channel.write(`${linkOf(mine)}/fallback`, true);
    // (The write above also makes sure the player sees this screen's
    // link even before it has made an offer.)
    unwatchFrames = channel.watch(`${TV}/frames/${playerId}`, (frame) => {
      if (frame?.stream === mine && typeof frame.img === "string") onFrame(frame.img);
    });
  }

  async function answer(link) {
    const theirs = link?.offer;
    if (!theirs || !RTC || theirs.id === offerId || disposed) return;
    offerId = theirs.id;
    closeQuietly(pc);
    const mine = new RTC({ iceServers });
    pc = mine;
    mine.ontrack = (e) => {
      if (pc !== mine) return;
      const media = e.streams?.[0] || (rtc.MediaStream ? new rtc.MediaStream([e.track]) : null);
      if (media) onStream(media);
    };
    mine.onconnectionstatechange = () => {
      if (pc !== mine) return;
      const s = mine.connectionState;
      if (s === "connected") {
        clearTimeout(fallbackTimer);
        stopFrames();
        setState("video");
      } else if (s === "failed") {
        requestFrames();
      } else if (s === "disconnected") {
        clearTimeout(fallbackTimer);
        fallbackTimer = setTimeout(() => {
          if (pc === mine && mine.connectionState !== "connected") requestFrames();
        }, RECOVER_MS);
      }
    };
    try {
      await mine.setRemoteDescription({ type: theirs.type, sdp: theirs.sdp });
      const made = await mine.createAnswer();
      await mine.setLocalDescription(made);
      await gathered(mine);
      if (pc !== mine || disposed) return;
      await channel.write(`${linkOf(stream)}/answer`, {
        to: theirs.id, type: mine.localDescription.type, sdp: mine.localDescription.sdp, at: Date.now(),
      });
    } catch (e) {
      console.warn("[tv] could not answer the player's offer", e);
      if (pc === mine) requestFrames();
    }
  }

  function reset() {
    clearTimeout(fallbackTimer);
    fallbackTimer = 0;
    unwatchLink?.();
    unwatchLink = null;
    if (unwatchFrames) {
      unwatchFrames();
      unwatchFrames = null;
    }
    closeQuietly(pc);
    pc = null;
    offerId = null;
    onStream(null);
    onFrame(null);
  }

  return {
    viewerId,
    get state() { return state; },

    follow({ spotlight = null, live = null } = {}) {
      if (disposed) return;
      const nextToken = spotlight?.token || null;
      const nextPlayer = spotlight?.playerId ? String(spotlight.playerId) : null;
      const nextStream = nextToken && live?.stream ? String(live.stream) : null;
      if (nextToken === token && nextPlayer === playerId && nextStream === stream) return;
      const old = stream;
      reset();
      if (old) channel.remove(linkOf(old));
      const tokenChanged = nextToken !== token;
      token = nextToken;
      playerId = nextPlayer;
      stream = nextStream;
      const next = !token ? "idle" : !stream ? "waiting" : RTC ? "connecting" : "snapshots";
      // One registration for the lot: the player answers screens that
      // follow its token, so a new token must always be written.
      if (setState(next, { quiet: true }) || tokenChanged) register();
      if (!stream) return;
      unwatchLink = channel.watch(linkOf(stream), (link) => { answer(link); });
      if (!RTC) requestFrames();
      else fallbackTimer = setTimeout(() => { if (state !== "video") requestFrames(); }, directMs);
    },

    dispose() {
      if (disposed) return;
      reset();
      channel.remove(`${TV}/links/${viewerId}`);
      channel.remove(`${TV}/viewers/${viewerId}`);
      disposed = true;
      cancelDrops.forEach((cancel) => cancel());
    },
  };
}
