import { getAudioContext } from "./audio.js";

const TRACK_SRC = {
  menu: "src/music/menu-lounge.mp3",
  play: "src/music/play-loop.mp3",
};

const TARGET = 0.34;
const FADE = 1.1;

let enabled = true;
let unlocked = false;
let currentName = null;
let current = null;
let playing = false;
let resumeOffset = 0;

const buffers = {};
const loading = {};

function candidateUrls(path) {
  const list = [];
  const push = (u) => {
    if (u && !list.includes(u)) list.push(u);
  };
  try {
    push(new URL(path, document.location.href).href);
  } catch (e) { /* ignore */ }
  try {
    push(new URL(path, document.baseURI).href);
  } catch (e) { /* ignore */ }
  push(path);
  return list;
}

async function loadBuffer(name) {
  if (buffers[name]) return buffers[name];
  if (loading[name]) return loading[name];
  loading[name] = (async () => {
    const ctx = getAudioContext();
    if (!ctx) return null;
    for (const url of candidateUrls(TRACK_SRC[name])) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.arrayBuffer();
        const buf = await ctx.decodeAudioData(data);
        buffers[name] = buf;
        return buf;
      } catch (e) { /* try next url */ }
    }
    return null;
  })();
  return loading[name];
}

export function preloadMusic() {
  Object.keys(TRACK_SRC).forEach(loadBuffer);
}

function startVoice(name, buf, offset) {
  const ctx = getAudioContext();
  if (!ctx) return null;
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  gain.connect(ctx.destination);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.connect(gain);
  const off = buf.duration ? offset % buf.duration : 0;
  src.start(0, off);
  return { name, src, gain, startedAt: ctx.currentTime - off, offset: off };
}

function ramp(param, to, dur) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(Math.max(0.0001, param.value), now);
  param.linearRampToValueAtTime(Math.max(0.0001, to), now + dur);
}

function killVoice(voice, afterMs) {
  const src = voice.src;
  const gain = voice.gain;
  setTimeout(() => {
    try { src.stop(); } catch (e) { /* ignore */ }
    try { gain.disconnect(); } catch (e) { /* ignore */ }
  }, Math.max(0, afterMs));
}

export function setMusicEnabled(on) {
  enabled = !!on;
  if (!enabled) {
    if (current && playing) {
      playing = false;
      ramp(current.gain.gain, 0.0001, 0.4);
    }
  } else if (unlocked && currentName) {
    play(currentName);
  }
}

export function isMusicEnabled() {
  return enabled;
}

export function unlockMusic() {
  unlocked = true;
  getAudioContext();
  preloadMusic();
  if (enabled && currentName) play(currentName);
}

export async function play(name) {
  currentName = name;
  if (!enabled || !unlocked || !TRACK_SRC[name]) return;
  const buf = await loadBuffer(name);
  if (!buf) return;
  if (currentName !== name || !enabled || !unlocked) return;
  if (current && current.name === name) {
    if (!playing) {
      playing = true;
      ramp(current.gain.gain, TARGET, FADE);
    }
    return;
  }
  const old = current;
  const voice = startVoice(name, buf, 0);
  if (!voice) return;
  current = voice;
  playing = true;
  ramp(voice.gain.gain, TARGET, FADE);
  if (old) {
    ramp(old.gain.gain, 0.0001, FADE);
    killVoice(old, FADE * 1000 + 250);
  }
}

export function fadeOut() {
  playing = false;
  currentName = null;
  const v = current;
  current = null;
  if (!v) return;
  ramp(v.gain.gain, 0.0001, 0.5);
  killVoice(v, 700);
}

export function pauseMusic() {
  if (!current || !playing) return;
  playing = false;
  const ctx = getAudioContext();
  const buf = current.src.buffer;
  if (ctx && buf && buf.duration) {
    resumeOffset = (ctx.currentTime - current.startedAt) % buf.duration;
  }
  const v = current;
  current = null;
  ramp(v.gain.gain, 0.0001, 0.25);
  killVoice(v, 350);
}

export function resumeMusic() {
  if (!enabled || !unlocked || !currentName || playing) return;
  const name = currentName;
  const buf = buffers[name];
  if (!buf) { play(name); return; }
  const voice = startVoice(name, buf, resumeOffset);
  if (!voice) return;
  current = voice;
  playing = true;
  ramp(voice.gain.gain, TARGET, 0.4);
}

export function musicState() {
  const b = currentName ? buffers[currentName] : null;
  const ctx = getAudioContext();
  return {
    enabled,
    unlocked,
    currentName,
    playing,
    loaded: !!b,
    duration: b ? Math.round(b.duration * 10) / 10 : null,
    offset: Math.round((current ? current.offset : resumeOffset) * 10) / 10,
    gain: current ? Math.round(current.gain.gain.value * 1000) / 1000 : 0,
    ctxState: ctx ? ctx.state : null,
    tracks: Object.keys(TRACK_SRC).map((k) => ({ name: k, loaded: !!buffers[k] })),
  };
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseMusic();
  else resumeMusic();
});
