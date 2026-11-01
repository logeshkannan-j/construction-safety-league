/**
 * Live on the TV: the handshake between the spotlit player's game and
 * the TV, run against an in-memory channel and a stand-in for WebRTC —
 * no database, no browser. (The real thing, video and all, is checked
 * in a real browser; see the notes at the end of tv-link in the
 * commit.)
 */

import {
  memoryChannel, showOnTv, clearTv, liveStats, createTvSender, createTvViewer, TV,
} from "../src/tvLink.js";

let pass = 0;
let fail = 0;
const failures = [];
function check(name, condition, extra = "") {
  if (condition) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name}${extra ? `  — ${extra}` : ""}`); }
}
function section(t) { console.log(`\n== ${t} ==`); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(test, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (test()) return true;
    await wait(10);
  }
  return test();
}

/* A stand-in for WebRTC: offers and answers are paired by their text,
 * and when the player takes the screen's answer both ends "connect" and
 * the screen receives the player's track. */
function fakeRtc({ outcome = "connected" } = {}) {
  const offerers = new Map();
  const answerers = new Map();
  let n = 0;
  const made = [];
  class RTCPeerConnection {
    constructor(config) {
      this.config = config;
      this.iceGatheringState = "new";
      this.connectionState = "new";
      this.localDescription = null;
      this.remoteDescription = null;
      this.sent = [];
      this.closed = false;
      made.push(this);
    }
    addEventListener() {}
    removeEventListener() {}
    addTransceiver(track, init) { this.sent.push({ track, stream: init?.streams?.[0], init }); }
    addTrack(track, stream) { this.sent.push({ track, stream }); }
    async createOffer() {
      const sdp = `offer-${++n}`;
      offerers.set(sdp, this);
      return { type: "offer", sdp };
    }
    async createAnswer() {
      const sdp = `answer-to-${this.remoteDescription.sdp}`;
      answerers.set(sdp, this);
      return { type: "answer", sdp };
    }
    async setLocalDescription(d) { this.localDescription = d; this.iceGatheringState = "complete"; }
    async setRemoteDescription(d) {
      this.remoteDescription = d;
      if (d.type !== "answer") return;
      const screen = answerers.get(d.sdp);
      if (!screen || this.closed || screen.closed) return;
      for (const pc of [this, screen]) {
        pc.connectionState = outcome;
        pc.onconnectionstatechange?.();
      }
      if (outcome === "connected" && this.sent[0]) {
        screen.ontrack?.({ track: this.sent[0].track, streams: [this.sent[0].stream] });
      }
    }
    close() { this.closed = true; this.connectionState = "closed"; }
  }
  return { RTCPeerConnection, MediaStream: class { constructor(tracks) { this.tracks = tracks; } }, made };
}

function fakeCanvas() {
  const track = { kind: "video", stopped: false, stop() { this.stopped = true; } };
  const stream = { id: "canvas-stream", getVideoTracks: () => [track], getTracks: () => [track] };
  return { width: 1920, height: 1080, track, stream, captureStream: (fps) => { stream.fps = fps; return stream; } };
}

/* Enough of a document for snapshots: a playing video and a canvas that
 * turns it into a JPEG. */
function fakeDocument() {
  let shots = 0;
  const doc = {
    nodes: [],
    body: { appendChild(el) { doc.nodes.push(el); } },
    createElement(tag) {
      if (tag === "video") {
        return {
          tag, style: {}, readyState: 4, videoWidth: 1280, videoHeight: 720,
          setAttribute() {}, play: () => Promise.resolve(), pause() {},
          remove() { doc.nodes = doc.nodes.filter((x) => x !== this); },
        };
      }
      return {
        tag, width: 0, height: 0,
        getContext: () => ({ drawImage() {} }),
        toDataURL: (type) => `data:${type};base64,SHOT${++shots}`,
      };
    },
  };
  return doc;
}

const spotlightOf = (ch) => ch.read(`${TV}/spotlight`);

/* =============================================================== */

section("The channel behaves like the database");
{
  const ch = memoryChannel();
  const seen = [];
  const off = ch.watch("a/b", (v) => seen.push(v));
  await wait(0);
  check("a watcher hears what is there straight away (nothing: null)", seen.length === 1 && seen[0] === null);
  await ch.write("a/b/c", 1);
  check("and again when it changes", JSON.stringify(seen.at(-1)) === JSON.stringify({ c: 1 }));
  await ch.remove("a/b/c");
  check("an emptied branch is gone, like the database", seen.at(-1) === null && ch.read("a") === null);
  off();
  await ch.write("a/b/c", 2);
  check("and a watcher that has stopped hears nothing", seen.length === 3);
  ch.removeOnDisconnect("x/y");
  await ch.write("x/y", { z: 1 });
  ch.disconnect();
  check("what was to go on a disconnect goes", ch.read("x") === null);
}

section("The host picks somebody, and takes them off again");
{
  const ch = memoryChannel();
  await showOnTv(ch, { id: "p1", name: "A very long name that goes on and on and on and on" });
  const first = spotlightOf(ch);
  check("the spotlight names them", first.playerId === "p1" && first.name.length <= 40);
  await showOnTv(ch, { id: "p1", name: "Asha" });
  check("picking again is a new pick, with a new token", spotlightOf(ch).token && spotlightOf(ch).token !== first.token);
  await clearTv(ch);
  check("and taking them off clears it", spotlightOf(ch) === null);
}

section("Only known, sound numbers and text go up to the TV");
{
  const s = liveStats({ score: 812.5, timeMs: NaN, progress: 140, title: "x".repeat(99), objective: undefined, rogue: "nope", name: 7 });
  check("the score goes up", s.score === 812.5);
  check("nothing that is not a number goes up as one", !("timeMs" in s));
  check("and nothing out of range", s.progress === 100);
  check("text is cut to length", s.title.length === 60);
  check("nothing undefined (the database refuses it), nothing unknown, nothing of the wrong type",
    !("objective" in s) && !("rogue" in s) && !("name" in s));
}

section("A player who is not on the TV sends nothing");
{
  const ch = memoryChannel();
  const rtc = fakeRtc();
  const canvas = fakeCanvas();
  const sender = createTvSender({ channel: ch, playerId: "p1", canvas, rtc, doc: fakeDocument() });
  sender.follow(null);
  sender.publish({ score: 100 });
  await showOnTv(ch, { id: "p2", name: "Somebody else" });
  sender.follow(spotlightOf(ch));
  await wait(20);
  check("nothing about them is written", ch.read(TV + "/live") === null && ch.read(TV + "/links") === null);
  check("and no video is made", canvas.stream.fps === undefined && rtc.made.length === 0);
  sender.dispose();
}

section("On the TV: the player's mission goes live, as video");
{
  const ch = memoryChannel();
  const rtc = fakeRtc();
  const canvas = fakeCanvas();
  const states = [];
  const sender = createTvSender({
    channel: ch, playerId: "p1", canvas, rtc, doc: fakeDocument(),
    info: { name: "Asha", title: "Safety Mission", round: "Round 2" },
    onState: (s) => states.push(s),
  });
  await showOnTv(ch, { id: "p1", name: "Asha" });
  sender.follow(spotlightOf(ch));
  await until(() => ch.read(`${TV}/live/p1`));
  const live = ch.read(`${TV}/live/p1`);
  check("the mission is announced, with the stream on offer", live?.stream === sender.stream && live.title === "Safety Mission" && live.name === "Asha");
  check("the player knows they are on", await until(() => states.includes("on")), states.join(","));

  let media = null;
  let frame = null;
  const viewerStates = [];
  const viewer = createTvViewer({
    channel: ch, rtc, viewerId: "tv1", directMs: 400,
    onStream: (m) => { media = m; }, onFrame: (f) => { frame = f; }, onState: (s) => viewerStates.push(s),
  });
  viewer.follow({ spotlight: spotlightOf(ch), live });
  check("the screen says who it is following", (await until(() => ch.read(`${TV}/viewers/tv1`)?.token === spotlightOf(ch).token)));
  check("the player offers the screen its picture", await until(() => ch.read(`${TV}/links/tv1/${sender.stream}/offer`)));
  check("the screen answers", await until(() => ch.read(`${TV}/links/tv1/${sender.stream}/answer`)));
  check("and it is live video", await until(() => viewer.state === "video"), viewerStates.join(" → "));
  check("the picture is the game's canvas", media === canvas.stream);
  const offerPc = rtc.made.find((pc) => pc.sent.length);
  check("sent no wider than 1280", offerPc?.sent[0].init.sendEncodings[0].scaleResolutionDownBy === 1.5);
  check("the screen reports it to the host", ch.read(`${TV}/viewers/tv1`).state === "video");
  await wait(450);
  check("no snapshots when the video works", frame === null && ch.read(`${TV}/frames/p1`) === null);

  // The score and clock, about once a second — not on every HUD update.
  const before = JSON.stringify(ch.read(`${TV}/live/p1`));
  for (let i = 1; i <= 20; i++) sender.publish({ score: i * 10, timeMs: 60000 - i * 100 });
  const straightAway = JSON.stringify(ch.read(`${TV}/live/p1`));
  await until(() => ch.read(`${TV}/live/p1`)?.score === 200, 2000);
  check("the HUD goes up at most once a second, and the latest of it does",
    ch.read(`${TV}/live/p1`)?.score === 200 && ch.read(`${TV}/live/p1`)?.timeMs === 58000
      && (straightAway === before || ch.read(`${TV}/live/p1`)?.score !== Number(JSON.parse(straightAway).score)));

  // The mission ends.
  sender.dispose();
  check("when the mission ends, everything it put up comes down",
    ch.read(`${TV}/live/p1`) === null && ch.read(`${TV}/links/tv1/${sender.stream}`) === null && ch.read(`${TV}/frames/p1`) === null);
  check("and the camera on the canvas is switched off", canvas.track.stopped);
  check("the screen goes back to waiting for their next mission", await until(() => {
    viewer.follow({ spotlight: spotlightOf(ch), live: ch.read(`${TV}/live/p1`) });
    return viewer.state === "waiting";
  }));
  check("with the video gone", media === null);

  // Their next mission: a new picture, and the screen picks it up.
  const canvas2 = fakeCanvas();
  const next = createTvSender({ channel: ch, playerId: "p1", canvas: canvas2, rtc, doc: fakeDocument() });
  next.follow(spotlightOf(ch));
  await until(() => ch.read(`${TV}/live/p1`)?.stream === next.stream);
  viewer.follow({ spotlight: spotlightOf(ch), live: ch.read(`${TV}/live/p1`) });
  check("their next mission comes up on the same screen", await until(() => viewer.state === "video" && media === canvas2.stream));

  // The host picks somebody else.
  await showOnTv(ch, { id: "p2", name: "Bala" });
  next.follow(spotlightOf(ch));
  viewer.follow({ spotlight: spotlightOf(ch), live: ch.read(`${TV}/live/p2`) });
  check("when somebody else is picked, the first player's picture comes down",
    await until(() => ch.read(`${TV}/live/p1`) === null && ch.read(`${TV}/links/tv1/${next.stream}`) === null));
  check("and the screen waits for the new pick", viewer.state === "waiting");
  check("the first player is told they are off", next.state === "off");

  viewer.dispose();
  check("a screen that closes leaves nothing behind",
    ch.read(`${TV}/viewers/tv1`) === null && ch.read(`${TV}/links/tv1`) === null);
  next.dispose();
}

section("No direct connection: snapshots instead");
{
  // A screen without WebRTC at all asks for snapshots straight away.
  const ch = memoryChannel();
  const rtc = fakeRtc();
  const doc = fakeDocument();
  const sender = createTvSender({ channel: ch, playerId: "p1", canvas: fakeCanvas(), rtc, doc });
  await showOnTv(ch, { id: "p1", name: "Asha" });
  sender.follow(spotlightOf(ch));
  await until(() => ch.read(`${TV}/live/p1`));
  let frame = null;
  const viewer = createTvViewer({ channel: ch, rtc: {}, viewerId: "tv2", onFrame: (f) => { frame = f; } });
  viewer.follow({ spotlight: spotlightOf(ch), live: ch.read(`${TV}/live/p1`) });
  check("the screen asks for snapshots", await until(() => ch.read(`${TV}/links/tv2/${sender.stream}/fallback`) === true));
  check("and gets them, as JPEGs", await until(() => typeof frame === "string" && frame.startsWith("data:image/jpeg")), String(frame));
  check("labelled with the mission they belong to", ch.read(`${TV}/frames/p1`)?.stream === sender.stream);
  check("from a video kept in the page, out of sight", doc.nodes.length === 1 && doc.nodes[0].tag === "video");
  check("the screen says so", viewer.state === "snapshots" && ch.read(`${TV}/viewers/tv2`).state === "snapshots");
  viewer.dispose();
  check("when the screen goes, the snapshots stop", await until(() => ch.read(`${TV}/frames/p1`) === null));
  sender.dispose();
  check("and the hidden video is taken out again", doc.nodes.length === 0);

  // A screen that tries, but cannot get through, falls back in time.
  const failing = fakeRtc({ outcome: "failed" });
  const s2 = createTvSender({ channel: ch, playerId: "p1", canvas: fakeCanvas(), rtc: failing, doc: fakeDocument() });
  s2.follow(spotlightOf(ch));
  await until(() => ch.read(`${TV}/live/p1`));
  let frame2 = null;
  const v2 = createTvViewer({ channel: ch, rtc: failing, viewerId: "tv3", onFrame: (f) => { frame2 = f; } });
  v2.follow({ spotlight: spotlightOf(ch), live: ch.read(`${TV}/live/p1`) });
  check("a connection that fails falls back to snapshots", await until(() => v2.state === "snapshots" && typeof frame2 === "string"));
  v2.dispose();
  s2.dispose();

  // And one that never hears back gives it the time it was given.
  const silent = fakeRtc();
  const s3 = createTvSender({ channel: ch, playerId: "p1", canvas: fakeCanvas(), rtc: {}, doc: fakeDocument() });
  s3.follow(spotlightOf(ch));
  await until(() => ch.read(`${TV}/live/p1`));
  let frame3 = null;
  const v3 = createTvViewer({ channel: ch, rtc: silent, viewerId: "tv4", directMs: 150, onFrame: (f) => { frame3 = f; } });
  v3.follow({ spotlight: spotlightOf(ch), live: ch.read(`${TV}/live/p1`) });
  await wait(60);
  check("a screen waits a moment for a direct connection first", v3.state === "connecting");
  check("then asks for snapshots", await until(() => v3.state === "snapshots" && typeof frame3 === "string"));
  v3.dispose();
  s3.dispose();
}

section("Phones and TVs that drop off without saying so");
{
  const ch = memoryChannel();
  const rtc = fakeRtc();
  const sender = createTvSender({ channel: ch, playerId: "p1", canvas: fakeCanvas(), rtc, doc: fakeDocument() });
  await showOnTv(ch, { id: "p1", name: "Asha" });
  sender.follow(spotlightOf(ch));
  const viewer = createTvViewer({ channel: ch, rtc, viewerId: "tv1" });
  await until(() => ch.read(`${TV}/live/p1`));
  viewer.follow({ spotlight: spotlightOf(ch), live: ch.read(`${TV}/live/p1`) });
  await until(() => viewer.state === "video");
  ch.disconnect();
  check("the database clears up after them: no stale picture, no stale screen",
    ch.read(`${TV}/live`) === null && ch.read(`${TV}/viewers`) === null && ch.read(`${TV}/links`) === null);
  check("but the host's pick stays", spotlightOf(ch)?.playerId === "p1");
  viewer.dispose();
  sender.dispose();
}

section("A phone serves at most three screens");
{
  const ch = memoryChannel();
  const rtc = fakeRtc();
  const sender = createTvSender({ channel: ch, playerId: "p1", canvas: fakeCanvas(), rtc, doc: fakeDocument() });
  await showOnTv(ch, { id: "p1", name: "Asha" });
  sender.follow(spotlightOf(ch));
  await until(() => ch.read(`${TV}/live/p1`));
  const screens = ["s1", "s2", "s3", "s4"].map((id) => {
    const v = createTvViewer({ channel: ch, rtc, viewerId: id, directMs: 60000 });
    v.follow({ spotlight: spotlightOf(ch), live: ch.read(`${TV}/live/p1`) });
    return v;
  });
  await until(() => sender.viewers === 3);
  await wait(50);
  check("four screens, three videos: the phone is not asked to encode more", sender.viewers === 3, `${sender.viewers}`);
  screens.forEach((v) => v.dispose());
  sender.dispose();
}

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log("\nFailures:");
  failures.forEach((f) => console.log(`  - ${f}`));
}
process.exit(fail ? 1 : 0);
