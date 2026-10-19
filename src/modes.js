import { mulberry32, hashString } from "./rng.js";
import {
  ballLayout, pickNumbers, chapterName, themeForLevel,
  LEVELS_PER_CHAPTER, TOTAL_LEVELS,
} from "./levels.js";

/* ------------------------------------------------------------------ */
/*  Bonus levels                                                       */
/*                                                                     */
/*  A bonus stage sits after every 5th regular level. Its content is   */
/*  generated from its own index (k = milestone / 5) so it never       */
/*  disturbs the 1000-level track: bonus stages are optional, free     */
/*  (no hearts), replayable, and pay a chest the first time you beat   */
/*  the mode's goal.                                                   */
/* ------------------------------------------------------------------ */

export const BONUS_EVERY = 5;
export const BONUS_PER_CHAPTER = LEVELS_PER_CHAPTER / BONUS_EVERY;
export const TOTAL_BONUS = TOTAL_LEVELS / BONUS_EVERY;

export const isBonusMilestone = (n) =>
  n >= BONUS_EVERY && n <= TOTAL_LEVELS && n % BONUS_EVERY === 0;
export const bonusIdFor = (milestone) => Math.round(milestone / BONUS_EVERY);
export const milestoneFor = (k) => k * BONUS_EVERY;

const rndFor = (k) => mulberry32(hashString(`sb-bonus-${k}`));

function layoutOf(count, k, P, rnd) {
  const numbers = pickNumbers(rnd, count);
  const pts = ballLayout(rnd, count, P);
  return pts.map((p, i) => ({ number: numbers[i], x: p.x, z: p.z, special: null }));
}

/* ------------------------------------------------------------------ */
/*  Modes                                                              */
/* ------------------------------------------------------------------ */

export const BONUS_MODES = [
  {
    id: "goldRush",
    name: "GOLD RUSH",
    icon: "🪙",
    tag: "TIMED",
    blurb: "Every ball on the table is solid gold. Bank them in fast — the clock bleeds 3 seconds back for every pot.",
    hint: "Pot 6 gold balls before the clock dies",
    time: 45,
    count: 8,
    special: "gold",
    goal: { type: "pots", target: 6 },
    goalText: (s) => `${s.pots}/6 pots`,
    chest: { coins: 420, gems: 2, perScore: 30 },
    palette: {
      felt: "#3d2c07",
      cushion: "#2a1d04",
      rail: "#4e3c11",
      rim: "#ffd24a",
      accent: "#ffd24a",
      lights: { keyColor: "#ffd98a", fillColor: "#ffb84a", rimColor: "#ffe9b0", keyIntensity: 72, fillIntensity: 0.85, rimIntensity: 0.7 },
    },
    onPocket(game) {
      game.timeLeft += 3;
      game.bonusPop("+3s", "#ffd24a");
    },
  },
  {
    id: "blitz",
    name: "BLITZ",
    icon: "⚡",
    tag: "TIMED",
    blurb: "No shot limit, no mercy: every ball you sink is instantly replaced. How long can you keep the table red hot?",
    hint: "Sink 8 balls in 30 seconds",
    time: 30,
    count: 5,
    refill: true,
    goal: { type: "pots", target: 8 },
    goalText: (s) => `${s.pots}/8 pots`,
    chest: { coins: 360, gems: 2, perScore: 35 },
    palette: {
      felt: "#123a4a",
      cushion: "#0d2a36",
      rail: "#1a1f2a",
      rim: "#5ad6ff",
      accent: "#35e0ff",
      lights: { keyColor: "#dff2ff", fillColor: "#35e0ff", rimColor: "#8affe0", keyIntensity: 70, fillIntensity: 1.0, rimIntensity: 0.9 },
    },
    onPocket(game) {
      game.timeLeft += 2;
      game.bonusPop("+2s", "#7ee0ff");
      if (game.bonus.mode.refill) game.refillBall();
    },
  },
  {
    id: "bombSquad",
    name: "BOMB SQUAD",
    icon: "💣",
    tag: "3 SHOTS",
    blurb: "The whole rack is wired. Sink a bomb and it takes its neighbours with it — chain them for the biggest blast.",
    hint: "Clear every bomb ball in 3 shots",
    shots: 3,
    count: 6,
    special: "bomb",
    blastRadius: 0.8,
    goal: { type: "clear" },
    goalText: (s) => `${s.left} bombs left`,
    chest: { coins: 520, gems: 3, perScore: 20 },
    palette: {
      felt: "#3a1410",
      cushion: "#2a0d0a",
      rail: "#2a1a16",
      rim: "#ff8a3a",
      accent: "#ff6a2a",
      lights: { keyColor: "#ffd0a0", fillColor: "#ff6a2a", rimColor: "#ffb04a", keyIntensity: 66, fillIntensity: 0.9, rimIntensity: 0.8 },
    },
    onPocket(game, info) {
      if (info.bm.special !== "bomb") return;
      const r = game.bonus.mode.blastRadius;
      const chain = [];
      for (const other of game.ballMeshes) {
        if (other === info.bm || other.ball === game.cueBall || other.ball.potted) continue;
        if (Math.hypot(other.ball.x - info.ball.x, other.ball.z - info.ball.z) <= r) chain.push(other);
      }
      if (chain.length) game.bonusBlast(chain, info.ball);
    },
  },
  {
    id: "ricochet",
    name: "RICOCHET",
    icon: "🎱",
    tag: "TIMED",
    blurb: "Every cushion a ball touches before it drops multiplies the pot. Bank them off three rails and watch the score climb.",
    hint: "Score 1500 in 60 seconds",
    time: 60,
    count: 7,
    special: "gold",
    goal: { type: "score", target: 1500 },
    goalText: (s) => `${s.score}/1500`,
    chest: { coins: 420, gems: 2, perScore: 1 },
    palette: {
      felt: "#1d2a5a",
      cushion: "#141d42",
      rail: "#232a3a",
      rim: "#a0d8ff",
      accent: "#7a9cff",
      lights: { keyColor: "#e8f0ff", fillColor: "#7a9cff", rimColor: "#a0d8ff", keyIntensity: 64, fillIntensity: 0.9, rimIntensity: 0.8 },
    },
    setup(game) {
      game.bonus.state.rails = 0;
    },
    onCushion(game) {
      const s = game.bonus.state;
      s.rails = (s.rails ?? 0) + 1;
    },
    onShot(game) {
      game.bonus.state.rails = 0;
    },
    onPocket(game, info) {
      const s = game.bonus.state;
      const mult = 1 + (s.rails ?? 0);
      const pts = 100 * mult;
      s.score += pts;
      s.pots++;
      game.bonusPop(`${pts} x${mult}`, "#ffd24a");
      game.timeLeft += 1;
    },
  },
  {
    id: "midnight",
    name: "MIDNIGHT",
    icon: "🌙",
    tag: "TIMED",
    blurb: "The lights are out. Only a pool of moonlight follows the cue ball — every pot flares it wider for a few seconds.",
    hint: "Sink 6 balls in the dark",
    time: 40,
    count: 6,
    dark: true,
    goal: { type: "pots", target: 6 },
    goalText: (s) => `${s.pots}/6 pots`,
    chest: { coins: 460, gems: 3, perScore: 30 },
    palette: {
      felt: "#0b1a2a",
      cushion: "#081320",
      rail: "#101822",
      rim: "#9fc0ff",
      accent: "#9fc0ff",
      fog: { color: "#04060c", near: 1.2, far: 9 },
      lights: { keyColor: "#cfe0ff", fillColor: "#4a6aff", rimColor: "#9fc0ff", keyIntensity: 9, fillIntensity: 0.25, rimIntensity: 0.3, hemiIntensity: 0.16 },
    },
    setup(game) {
      const lamp = game.bonusLamp(2.6);
      game.bonus.state.lamp = lamp;
      game.bonus.state.flare = 0;
    },
    onPocket(game) {
      game.bonus.state.flare = 3;
      game.timeLeft += 2;
      game.bonusPop("+2s", "#7ee0ff");
    },
    tick(game, dt) {
      const s = game.bonus.state;
      if (!s.lamp) return;
      s.flare = Math.max(0, (s.flare ?? 0) - dt);
      const target = 1.05 + Math.min(1.9, (s.flare ?? 0) * 0.6) + (game.state === "aim" ? 0.35 : 0);
      s.lamp.radius += (target - s.lamp.radius) * Math.min(1, dt * 2.4);
      const c = game.cueBall;
      if (c) s.lamp.set(c.x, c.z, s.lamp.radius);
      s.lamp.light.intensity = 60 + s.lamp.radius * 26;
    },
  },
  {
    id: "bumpers",
    name: "BUMPER BONANZA",
    icon: "🎯",
    tag: "TIMED",
    blurb: "The pockets are sealed and the table is a pinball machine. Ricochet off the glowing bumpers for points.",
    hint: "Score 1200 in 60 seconds",
    time: 60,
    count: 4,
    noPockets: true,
    posts: (P) => {
      const pts = [{ x: 0, z: 0, r: 0.055, e: 1.06 }];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.35;
        pts.push({ x: Math.cos(a) * 0.62, z: Math.sin(a) * 0.36, r: 0.05, e: 1.06 });
      }
      return pts;
    },
    goal: { type: "score", target: 1200 },
    goalText: (s) => `${s.score}/1200`,
    chest: { coins: 420, gems: 2, perScore: 1 },
    palette: {
      felt: "#0e2a2a",
      cushion: "#0a1e1e",
      rail: "#1c2a26",
      rim: "#7ef2b0",
      accent: "#7ef2b0",
      lights: { keyColor: "#e0fff0", fillColor: "#7ef2b0", rimColor: "#b0ffd8", keyIntensity: 70, fillIntensity: 0.95, rimIntensity: 0.85 },
    },
    onBumper(game, ev) {
      const s = game.bonus.state;
      s.score += 40;
      s.hits = (s.hits ?? 0) + 1;
      if (s.hits % 5 === 0) {
        game.timeLeft += 2;
        game.bonusPop("+2s", "#7ef2b0");
      }
      game.spawnRipple(ev.x, ev.z, 0x7ef2b0, 0.5);
      sfxClick(game, ev.strength);
    },
  },
  {
    id: "cyclone",
    name: "CYCLONE",
    icon: "🌀",
    tag: "GUSTS",
    blurb: "Every shot drags a swirling wind across the cloth. Ride the vortex — the gust curls every ball toward the middle.",
    hint: "Clear the table before time runs out",
    time: 50,
    count: 7,
    goal: { type: "clear" },
    goalText: (s) => `${s.left} balls left`,
    chest: { coins: 460, gems: 3, perScore: 20 },
    field: { type: "vortex", strength: 5.5, swirl: 1.7, radius: 1.9 },
    gustTime: 2.4,
    palette: {
      felt: "#13333a",
      cushion: "#0d2429",
      rail: "#1a2c31",
      rim: "#7ee0ff",
      accent: "#5ad6ff",
      lights: { keyColor: "#dff6ff", fillColor: "#4ac0e8", rimColor: "#7ee0ff", keyIntensity: 66, fillIntensity: 0.9, rimIntensity: 0.8 },
    },
    setup(game) {
      const s = game.bonus.state;
      s.gust = 0;
      s.vortex = game.bonusVortex(game.bonus.mode.field.radius);
    },
    onShot(game) {
      game.bonus.state.gust = game.bonus.mode.gustTime;
    },
    tick(game, dt) {
      const s = game.bonus.state;
      const v = s.vortex;
      if (s.gust > 0) {
        s.gust = Math.max(0, s.gust - dt);
        if (game.sim) game.sim.field = s.gust > 0 ? game.bonus.mode.field : null;
        s.swirl = (s.swirl ?? 0) + dt * 6;
      } else if (game.sim?.field) {
        game.sim.field = null;
      }
      if (v) {
        v.visible = (s.gust ?? 0) > 0;
        v.rotation.y += dt * (2.6 + (s.gust ?? 0));
      }
    },
  },
  {
    id: "trickShot",
    name: "TRICK SHOT",
    icon: "🎩",
    tag: "ONE SHOT",
    blurb: "Three balls, one shot, one perfect line into the corner. Sink them all and the chest is yours.",
    hint: "Clear all 3 balls with a single shot",
    shots: 1,
    count: 3,
    goal: { type: "clear" },
    goalText: (s) => `${s.left} balls left`,
    chest: { coins: 640, gems: 4, perScore: 0 },
    palette: {
      felt: "#2a1c3a",
      cushion: "#1e142c",
      rail: "#2e2038",
      rim: "#e0b0ff",
      accent: "#c08aff",
      lights: { keyColor: "#f0e0ff", fillColor: "#a06ad0", rimColor: "#e0b0ff", keyIntensity: 64, fillIntensity: 0.85, rimIntensity: 0.75 },
    },
    layout(k, P, rnd) {
      const numbers = pickNumbers(rnd, 3, { pool: [2, 3, 4, 5, 6, 7, 8] });
      const HL = P.halfLength;
      const HW = P.halfWidth;
      const ins = P.pocketInset ?? 0.012;
      const px = HL - ins;
      const pz = HW - ins;
      const u = Math.SQRT1_2;
      const step = 2 * P.ballRadius + 0.0015;
      const balls = [0, 1, 2].map((i) => ({
        number: numbers[i],
        x: px - u * (0.10 + i * step),
        z: pz - u * (0.10 + i * step),
        special: null,
      }));
      return balls;
    },
    cue(k, P) {
      const u = Math.SQRT1_2;
      return { x: P.halfLength - u * 1.55 - 0.06, z: P.halfWidth - u * 1.55 - 0.06 };
    },
  },
];

export const MODE_BY_ID = Object.fromEntries(BONUS_MODES.map((m) => [m.id, m]));

export function modeForBonus(k) {
  const chapter = Math.floor((k - 1) / BONUS_PER_CHAPTER);
  const within = (k - 1) % BONUS_PER_CHAPTER;
  const idx = (chapter % 2) * BONUS_PER_CHAPTER + within;
  return BONUS_MODES[idx % BONUS_MODES.length];
}

/* ------------------------------------------------------------------ */
/*  Level object                                                       */
/* ------------------------------------------------------------------ */

export function getBonusLevel(k, P) {
  k = Math.max(1, Math.min(TOTAL_BONUS, Math.round(k)));
  const milestone = milestoneFor(k);
  const mode = modeForBonus(k);
  const rnd = rndFor(k);
  const chapter = Math.floor((milestone - 1) / LEVELS_PER_CHAPTER);

  const balls = mode.layout ? mode.layout(k, P, rnd) : layoutOf(mode.count, k, P, rnd);
  if (mode.special) for (const b of balls) b.special = mode.special;

  const shots = mode.shots ?? balls.length + 3;
  const reward = {
    coins: 120 + milestone * 4 + (chapter + 1) * 10,
    gems: 1 + Math.floor(chapter / 8),
  };

  return {
    number: milestone,
    bonus: true,
    bonusId: k,
    mode: mode.id,
    chapter,
    chapterName: chapterName(chapter),
    index: (milestone - 1) % LEVELS_PER_CHAPTER,
    name: mode.name,
    icon: mode.icon,
    themeId: themeForLevel(milestone),
    objective: { type: "bonus", hint: mode.hint },
    balls,
    cue: mode.cue ? mode.cue(k, P) : null,
    count: balls.length,
    shots,
    par: 1,
    timeLimit: mode.time ?? 0,
    assist: true,
    reward,
    chest: mode.chest,
    seed: hashString(`sb-bonus-${k}-${mode.id}`),
  };
}

function sfxClick(game, strength) {
  game.emit("bumper", { strength: strength ?? 1 });
}
