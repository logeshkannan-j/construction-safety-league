/* ------------------------------------------------------------------ *
 *  3D SAFETY GAMING ARENA — sound
 *
 *  Every sound is synthesised with the Web Audio API at runtime. That
 *  is a deliberate choice: the site is hosted on GitHub Pages, so
 *  shipping a folder of .mp3 files would add hundreds of KB to the
 *  download and a pile of binary assets to the repo for what are
 *  essentially beeps, clicks and alarms.
 *
 *  Browser audio policy is respected properly: no AudioContext is
 *  created until the first user gesture, and a suspended context is
 *  resumed on the next gesture rather than throwing.
 * ------------------------------------------------------------------ */

let ctx = null;
let master = null;
let enabled = true;
// Full. These are warning sounds, alarms and plant noise on a site —
// at 0.7 on a phone speaker in a room full of people they were simply
// not audible.
let volume = 1;
let unlocked = false;

// Long-running loops (crane motors, alarms) keyed by name.
const loops = new Map();

function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? volume : 0;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

/**
 * Must be called from inside a real user gesture (a click/tap handler).
 * Safe to call many times.
 */
export function unlockAudio() {
  const c = ensureCtx();
  if (!c) return false;
  if (c.state === "suspended") c.resume().catch(() => {});
  unlocked = true;
  return true;
}

export function setSoundEnabled(on) {
  enabled = !!on;
  if (master) master.gain.value = enabled ? volume : 0;
  if (!enabled) stopAllLoops();
}

export function setVolume(v) {
  volume = Math.max(0, Math.min(1, Number(v) || 0));
  if (master) master.gain.value = enabled ? volume : 0;
}

export function isSoundEnabled() { return enabled; }
export function getVolume() { return volume; }

/* --------------------------- primitives --------------------------- */

function tone({ freq = 440, type = "sine", dur = 0.15, gain = 0.3, attack = 0.005, slideTo = null, delay = 0 }) {
  if (!enabled || !unlocked) return;
  const c = ensureCtx();
  if (!c || !master) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noiseBurst({ dur = 0.2, gain = 0.2, filterFreq = 1200, delay = 0 }) {
  if (!enabled || !unlocked) return;
  const c = ensureCtx();
  if (!c || !master) return;
  const t0 = c.currentTime + delay;
  const frames = Math.max(1, Math.floor(c.sampleRate * dur));
  const buffer = c.createBuffer(1, frames, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start(t0);
}

/* ----------------------------- the kit ----------------------------- */

export const sfx = {
  click: () => tone({ freq: 620, type: "triangle", dur: 0.06, gain: 0.14 }),
  hover: () => tone({ freq: 880, type: "sine", dur: 0.04, gain: 0.05 }),

  missionStart: () => {
    tone({ freq: 392, type: "triangle", dur: 0.18, gain: 0.22 });
    tone({ freq: 523, type: "triangle", dur: 0.18, gain: 0.22, delay: 0.14 });
    tone({ freq: 659, type: "triangle", dur: 0.3, gain: 0.24, delay: 0.28 });
  },

  missionComplete: () => {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone({ freq: f, type: "triangle", dur: 0.32, gain: 0.22, delay: i * 0.13 })
    );
  },

  missionFailed: () => {
    tone({ freq: 330, type: "sawtooth", dur: 0.5, gain: 0.2, slideTo: 110 });
    tone({ freq: 220, type: "sine", dur: 0.7, gain: 0.16, slideTo: 80, delay: 0.1 });
  },

  correct: () => {
    tone({ freq: 784, type: "sine", dur: 0.11, gain: 0.2 });
    tone({ freq: 1175, type: "sine", dur: 0.16, gain: 0.18, delay: 0.09 });
  },

  wrong: () => {
    tone({ freq: 196, type: "square", dur: 0.18, gain: 0.16 });
    tone({ freq: 150, type: "square", dur: 0.22, gain: 0.14, delay: 0.12 });
  },

  warning: () => {
    tone({ freq: 880, type: "square", dur: 0.12, gain: 0.14 });
    tone({ freq: 880, type: "square", dur: 0.12, gain: 0.14, delay: 0.2 });
  },

  alarm: () => {
    tone({ freq: 660, type: "sawtooth", dur: 0.4, gain: 0.18, slideTo: 1100 });
    tone({ freq: 660, type: "sawtooth", dur: 0.4, gain: 0.18, slideTo: 1100, delay: 0.45 });
  },

  interact: () => tone({ freq: 520, type: "sine", dur: 0.08, gain: 0.12, slideTo: 760 }),
  pickup: () => tone({ freq: 300, type: "triangle", dur: 0.1, gain: 0.16, slideTo: 620 }),
  drop: () => tone({ freq: 400, type: "triangle", dur: 0.14, gain: 0.16, slideTo: 160 }),
  place: () => { noiseBurst({ dur: 0.14, gain: 0.14, filterFreq: 700 }); tone({ freq: 240, type: "sine", dur: 0.12, gain: 0.14 }); },
  thud: () => noiseBurst({ dur: 0.26, gain: 0.26, filterFreq: 380 }),
  step: () => noiseBurst({ dur: 0.05, gain: 0.045, filterFreq: 900 }),
  doorOpen: () => { noiseBurst({ dur: 0.3, gain: 0.1, filterFreq: 500 }); tone({ freq: 180, type: "sine", dur: 0.3, gain: 0.1, slideTo: 300 }); },
  locked: () => { tone({ freq: 140, type: "square", dur: 0.09, gain: 0.14 }); tone({ freq: 120, type: "square", dur: 0.09, gain: 0.14, delay: 0.1 }); },
  achievement: () => {
    [659, 880, 1047, 1319].forEach((f, i) => tone({ freq: f, type: "sine", dur: 0.26, gain: 0.18, delay: i * 0.1 }));
  },
  tick: () => tone({ freq: 1200, type: "sine", dur: 0.03, gain: 0.07 }),

  /* ---- emergency response ---- */

  // The site evacuation siren: a long two-tone wail, loud enough to be
  // the thing that starts the incident.
  siren: () => {
    for (let i = 0; i < 3; i++) {
      tone({ freq: 500, type: "sawtooth", dur: 0.55, gain: 0.2, slideTo: 980, delay: i * 1.1 });
      tone({ freq: 980, type: "sawtooth", dur: 0.5, gain: 0.18, slideTo: 500, delay: i * 1.1 + 0.55 });
    }
  },

  // Radio squelch before a message from the scene.
  radio: () => {
    noiseBurst({ dur: 0.07, gain: 0.1, filterFreq: 2600 });
    tone({ freq: 1500, type: "square", dur: 0.05, gain: 0.07, delay: 0.07 });
    noiseBurst({ dur: 0.05, gain: 0.07, filterFreq: 2200, delay: 0.14 });
  },

  // Three rising pips as the decision window opens.
  decisionOpen: () => {
    [700, 900, 1150].forEach((f, i) =>
      tone({ freq: f, type: "triangle", dur: 0.1, gain: 0.16, delay: i * 0.09 })
    );
  },

  // Urgent repeating beep as a decision clock runs out.
  countdown: () => {
    tone({ freq: 1000, type: "square", dur: 0.07, gain: 0.13 });
  },

  // An ambulance arriving.
  ambulance: () => {
    for (let i = 0; i < 4; i++) {
      tone({ freq: 760, type: "square", dur: 0.26, gain: 0.14, delay: i * 0.52 });
      tone({ freq: 580, type: "square", dur: 0.26, gain: 0.14, delay: i * 0.52 + 0.26 });
    }
  },
};

/* ---------------------------- motor loops ---------------------------- */

/**
 * Starts (or updates) a continuous machine sound — used for the crane's
 * slew / trolley / hoist motors. `intensity` 0..1 maps to volume and a
 * small pitch bend so the motor audibly loads up.
 */
export function setMotor(name, intensity, baseFreq = 70) {
  if (!enabled || !unlocked) { stopMotor(name); return; }
  const c = ensureCtx();
  if (!c || !master) return;
  const amount = Math.max(0, Math.min(1, intensity));

  let loop = loops.get(name);
  if (amount <= 0.001) { stopMotor(name); return; }

  if (!loop) {
    const osc = c.createOscillator();
    const sub = c.createOscillator();
    const g = c.createGain();
    const filter = c.createBiquadFilter();
    osc.type = "sawtooth";
    sub.type = "square";
    filter.type = "lowpass";
    filter.frequency.value = 420;
    g.gain.value = 0;
    osc.connect(filter);
    sub.connect(filter);
    filter.connect(g);
    g.connect(master);
    osc.start();
    sub.start();
    loop = { osc, sub, g, filter };
    loops.set(name, loop);
  }

  const now = c.currentTime;
  loop.osc.frequency.setTargetAtTime(baseFreq + amount * 26, now, 0.08);
  loop.sub.frequency.setTargetAtTime(baseFreq / 2 + amount * 10, now, 0.08);
  loop.g.gain.setTargetAtTime(0.05 + amount * 0.06, now, 0.06);
}

export function stopMotor(name) {
  const loop = loops.get(name);
  if (!loop) return;
  try {
    const c = ensureCtx();
    if (c) loop.g.gain.setTargetAtTime(0, c.currentTime, 0.05);
    setTimeout(() => {
      try { loop.osc.stop(); loop.sub.stop(); } catch { /* already stopped */ }
    }, 220);
  } catch { /* ignore */ }
  loops.delete(name);
}

export function stopAllLoops() {
  [...loops.keys()].forEach(stopMotor);
  stopAmbience();
}

/* ------------------------- the site around you ------------------------- *
 *
 * A construction site is never quiet: plant idling in the distance, a
 * generator, hammering, a grinder, a lorry reversing, steel being
 * dropped. All of it made here, like every other sound in the game, and
 * kept low under the alarms, the voices and the game's own sounds.
 */
let ambience = null;
let noiseBuffer = null;

function noise(c) {
  if (noiseBuffer) return noiseBuffer;
  // Two seconds of brown noise: soft, low, rumbling.
  const length = c.sampleRate * 2;
  noiseBuffer = c.createBuffer(1, length, c.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  return noiseBuffer;
}

/** A short sound somewhere on the site, panned to one side or the other. */
function siteEvent(c, out) {
  const now = c.currentTime + 0.05;
  const pan = c.createStereoPanner ? c.createStereoPanner() : null;
  if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; pan.connect(out); }
  const dest = pan || out;
  const level = 0.4 + Math.random() * 0.6;
  const kind = Math.random();
  const hit = (at, freq, decay, gain, type = "triangle") => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.55), at + decay);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain * level, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    o.connect(g); g.connect(dest);
    o.start(at); o.stop(at + decay + 0.05);
  };
  const burst = (at, freq, q, decay, gain) => {
    const src = c.createBufferSource();
    src.buffer = noise(c);
    const f = c.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain * level, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(at, Math.random()); src.stop(at + decay + 0.05);
  };
  if (kind < 0.38) {
    // Hammering: a few blows on timber or steel.
    const blows = 2 + Math.floor(Math.random() * 4);
    const gap = 0.32 + Math.random() * 0.2;
    const pitch = 260 + Math.random() * 400;
    for (let i = 0; i < blows; i++) {
      hit(now + i * gap, pitch, 0.09, 0.22);
      burst(now + i * gap, 2400, 1.5, 0.05, 0.5);
    }
  } else if (kind < 0.55) {
    // A lorry reversing, out by the gate.
    for (let i = 0; i < 4; i++) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "square"; o.frequency.value = 1040;
      g.gain.setValueAtTime(0.0001, now + i);
      g.gain.linearRampToValueAtTime(0.025 * level, now + i + 0.02);
      g.gain.setValueAtTime(0.025 * level, now + i + 0.45);
      g.gain.linearRampToValueAtTime(0.0001, now + i + 0.48);
      o.connect(g); g.connect(dest);
      o.start(now + i); o.stop(now + i + 0.5);
    }
  } else if (kind < 0.75) {
    // A grinder or a drill, for a second or two.
    const len = 0.9 + Math.random() * 1.4;
    const o = c.createOscillator();
    const f = c.createBiquadFilter();
    const g = c.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(150, now);
    o.frequency.linearRampToValueAtTime(210 + Math.random() * 60, now + 0.25);
    f.type = "bandpass"; f.frequency.value = 1800; f.Q.value = 0.9;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.05 * level, now + 0.2);
    g.gain.setValueAtTime(0.05 * level, now + len - 0.25);
    g.gain.linearRampToValueAtTime(0.0001, now + len);
    o.connect(f); f.connect(g); g.connect(dest);
    o.start(now); o.stop(now + len + 0.05);
    burst(now, 3200, 0.8, len, 0.12);
  } else {
    // Steel dropped onto steel: two ringing, out-of-tune tones.
    hit(now, 523 + Math.random() * 80, 0.9, 0.08, "sine");
    hit(now, 1179 + Math.random() * 120, 0.7, 0.05, "sine");
    burst(now, 900, 2, 0.12, 0.4);
  }
}

/** The site's own sound, while a mission is running. Safe to call often. */
export function startAmbience() {
  if (ambience || !enabled || !unlocked) return;
  const c = ensureCtx();
  if (!c || !master) return;
  try {
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, c.currentTime);
    // Background, under the alarms and voices — but audible on a phone.
    out.gain.linearRampToValueAtTime(1, c.currentTime + 1.5);
    out.connect(master);
    // The bed: distant plant and traffic, and a generator ticking over.
    const bed = c.createBufferSource();
    bed.buffer = noise(c);
    bed.loop = true;
    const low = c.createBiquadFilter();
    low.type = "lowpass"; low.frequency.value = 320;
    const bedGain = c.createGain();
    bedGain.gain.value = 0.09;
    bed.connect(low); low.connect(bedGain); bedGain.connect(out);
    bed.start();
    const gen = c.createOscillator();
    const genFilter = c.createBiquadFilter();
    const genGain = c.createGain();
    gen.type = "sawtooth"; gen.frequency.value = 48;
    genFilter.type = "lowpass"; genFilter.frequency.value = 140;
    genGain.gain.value = 0.018;
    gen.connect(genFilter); genFilter.connect(genGain); genGain.connect(out);
    gen.start();
    let timer = 0;
    const next = () => {
      timer = setTimeout(() => {
        if (!ambience) return;
        try { siteEvent(c, out); } catch { /* a missing node type on an old browser */ }
        next();
      }, 1200 + Math.random() * 3800);
    };
    ambience = { out, bed, gen, stop: () => clearTimeout(timer) };
    next();
  } catch {
    ambience = null;
  }
}

export function stopAmbience() {
  const a = ambience;
  if (!a) return;
  ambience = null;
  a.stop();
  try {
    const c = ensureCtx();
    if (c) a.out.gain.setTargetAtTime(0.0001, c.currentTime, 0.15);
    setTimeout(() => {
      try { a.bed.stop(); a.gen.stop(); a.out.disconnect(); } catch { /* already stopped */ }
    }, 800);
  } catch { /* ignore */ }
}

/** True while the site's sound is playing (for tests and the HUD). */
export function ambiencePlaying() {
  return !!ambience;
}

/** Call when leaving a game so no sound survives the unmount. */
export function disposeAudio() {
  stopAllLoops();
}
