let ctx = null;
let master = null;
let enabled = true;
let noiseBuf = null;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function unlockAudio() {
  ac();
}

export function getAudioContext() {
  return ac();
}

export function setEnabled(on) {
  enabled = !!on;
  if (master) master.gain.value = enabled ? 0.85 : 0;
}

export function isEnabled() {
  return enabled;
}

function noise() {
  if (!noiseBuf) {
    const c = ac();
    if (!c) return null;
    const len = Math.floor(c.sampleRate * 0.4);
    noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function env(node, t0, a, d, peak) {
  const g = ac().createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  node.connect(g);
  g.connect(master);
  return g;
}

function tone({ freq = 440, type = "sine", dur = 0.2, gain = 0.3, slide = 0, detune = 0, at = 0 }) {
  const c = ac();
  if (!c || !enabled) return;
  const t0 = c.currentTime + at;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
  if (detune) o.detune.value = detune;
  env(o, t0, 0.006, dur, gain);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function burst({ dur = 0.12, gain = 0.3, lp = 2400, hp = 200, at = 0, q = 1 }) {
  const c = ac();
  if (!c || !enabled) return;
  const n = noise();
  if (!n) return;
  const t0 = c.currentTime + at;
  const src = c.createBufferSource();
  src.buffer = n;
  const lpf = c.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.value = lp;
  lpf.Q.value = q;
  const hpf = c.createBiquadFilter();
  hpf.type = "highpass";
  hpf.frequency.value = hp;
  src.connect(hpf);
  hpf.connect(lpf);
  const g = env(lpf, t0, 0.004, dur, gain);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
  return g;
}

export const sfx = {
  click() {
    tone({ freq: 880, type: "triangle", dur: 0.06, gain: 0.16, slide: 240 });
  },
  ui() {
    tone({ freq: 660, type: "sine", dur: 0.09, gain: 0.16, slide: 180 });
  },
  back() {
    tone({ freq: 520, type: "sine", dur: 0.1, gain: 0.14, slide: -160 });
  },
  ball(strength = 1) {
    const s = Math.min(1, Math.max(0.12, strength));
    tone({ freq: 1500 + s * 900, type: "triangle", dur: 0.05 + s * 0.03, gain: 0.06 + s * 0.16, slide: -500 * s });
    burst({ dur: 0.03, gain: 0.04 + s * 0.09, lp: 5200, hp: 1200 });
  },
  cushion(strength = 1) {
    const s = Math.min(1, Math.max(0.1, strength));
    burst({ dur: 0.07 + s * 0.06, gain: 0.05 + s * 0.16, lp: 900 + s * 700, hp: 120 });
    tone({ freq: 150 + s * 60, type: "sine", dur: 0.07, gain: 0.05 + s * 0.1, slide: -50 });
  },
  pocket() {
    burst({ dur: 0.22, gain: 0.22, lp: 1400, hp: 90 });
    tone({ freq: 200, type: "sine", dur: 0.18, gain: 0.12, slide: -120, at: 0.01 });
    tone({ freq: 130, type: "sine", dur: 0.25, gain: 0.1, slide: -60, at: 0.06 });
  },
  cue(strength = 1) {
    const s = Math.min(1, Math.max(0.15, strength));
    burst({ dur: 0.05, gain: 0.1 + s * 0.2, lp: 4200, hp: 700 });
    tone({ freq: 520, type: "triangle", dur: 0.05, gain: 0.08 + s * 0.12, slide: -220 });
  },
  foul() {
    tone({ freq: 300, type: "sawtooth", dur: 0.16, gain: 0.12, slide: -80 });
    tone({ freq: 220, type: "square", dur: 0.22, gain: 0.09, slide: -60, at: 0.08 });
  },
  win() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => tone({ freq: f, type: "triangle", dur: 0.3, gain: 0.16, at: i * 0.09 }));
    tone({ freq: 1318.5, type: "sine", dur: 0.5, gain: 0.12, at: 0.4 });
  },
  lose() {
    const notes = [392, 329.63, 261.63];
    notes.forEach((f, i) => tone({ freq: f, type: "sine", dur: 0.3, gain: 0.14, at: i * 0.14 }));
  },
  star(i = 0) {
    tone({ freq: 880 * Math.pow(1.26, i), type: "triangle", dur: 0.22, gain: 0.16 });
    tone({ freq: 1320 * Math.pow(1.26, i), type: "sine", dur: 0.18, gain: 0.08, at: 0.02 });
  },
  coin() {
    tone({ freq: 1046, type: "square", dur: 0.07, gain: 0.1 });
    tone({ freq: 1568, type: "square", dur: 0.12, gain: 0.09, at: 0.06 });
  },
  gem() {
    tone({ freq: 987, type: "triangle", dur: 0.12, gain: 0.12 });
    tone({ freq: 1318, type: "triangle", dur: 0.16, gain: 0.11, at: 0.08 });
    tone({ freq: 1975, type: "sine", dur: 0.2, gain: 0.08, at: 0.16 });
  },
  bomb() {
    burst({ dur: 0.5, gain: 0.38, lp: 700, hp: 40, q: 0.7 });
    tone({ freq: 120, type: "sine", dur: 0.5, gain: 0.24, slide: -90 });
  },
  power() {
    tone({ freq: 200, type: "sawtooth", dur: 0.05, gain: 0.04 });
  },
  tick() {
    tone({ freq: 1250, type: "square", dur: 0.028, gain: 0.05 });
  },
  countdown(urgent = false) {
    tone({ freq: urgent ? 920 : 640, type: "triangle", dur: urgent ? 0.12 : 0.09, gain: 0.15 });
  },
  unlock() {
    [659.25, 830.61, 987.77, 1318.5].forEach((f, i) => tone({ freq: f, type: "triangle", dur: 0.35, gain: 0.15, at: i * 0.1 }));
  },
};
