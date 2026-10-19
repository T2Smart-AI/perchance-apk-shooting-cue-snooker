import { mulberry32, hashString } from "./rng.js";
import { PoolSim, TABLE_PARAMS } from "./physics.js";

export const CHAPTERS = 50;
export const LEVELS_PER_CHAPTER = 20;
export const TOTAL_LEVELS = CHAPTERS * LEVELS_PER_CHAPTER;

export const THEME_ORDER = [
  "arena", "nightcity", "beach", "forest", "ice", "desert",
  "candy", "neon", "space", "volcano", "royal", "ocean",
];

const CHAPTER_NAMES = [
  "First Break", "Green Felt", "Long Shots", "Tight Pockets", "Angle Work",
  "Spin Doctor", "Bank Shots", "Combo Rail", "Precision", "Momentum",
  "Ricochet", "Night Shift", "Sunset Run", "Emerald Deep", "Cold Steel",
  "Dune Drift", "Sugar Rush", "Voltage", "Deep Field", "Molten Core",
  "Royal Line", "Tide Break", "Ghost Ball", "Double Rail", "Fade Away",
  "Chalk Dust", "Table Master", "Break Point", "Silk Touch", "Ironside",
  "Lucky Roll", "High Stakes", "Cut Shot", "Safety Play", "The Rack",
  "Clean Sweep", "One Chance", "Perfect Line", "Final Rail", "Unbroken",
  "Hustler", "Cold Blood", "Knife Edge", "No Mercy", "Golden Cue",
  "Beyond Time", "Absolute", "Perfect Run", "Champion", "Impossible",
];

const NAME_A = [
  "Sunny", "Breezy", "Quiet", "Golden", "Silver", "Lucky", "Swift", "Silent",
  "Bright", "Wild", "Smooth", "Sharp", "Royal", "Frozen", "Crimson", "Velvet",
  "Iron", "Amber", "Jade", "Coral", "Neon", "Dusty", "Glassy", "Midnight",
];
const NAME_B = [
  "Break", "Shot", "Rail", "Angle", "Bank", "Cut", "Roll", "Drop", "Pocket",
  "Corner", "Carom", "Spin", "Line", "Table", "Rack", "Arc", "Slate", "Cushion",
];

export function chapterOf(levelNumber) {
  return Math.floor((levelNumber - 1) / LEVELS_PER_CHAPTER);
}
export function indexInChapter(levelNumber) {
  return (levelNumber - 1) % LEVELS_PER_CHAPTER;
}
export function chapterName(chapterIndex) {
  return CHAPTER_NAMES[chapterIndex % CHAPTER_NAMES.length];
}
export function themeForLevel(levelNumber) {
  const c = chapterOf(levelNumber);
  return THEME_ORDER[c % THEME_ORDER.length];
}

const SOLIDS = [1, 2, 3, 4, 5, 6, 7];
const STRIPES = [9, 10, 11, 12, 13, 14, 15];
const ALL_NUMBERS = [...SOLIDS, 8, ...STRIPES];

export function pickNumbers(rnd, count, opts = {}) {
  const pool = opts.pool ?? ALL_NUMBERS;
  const arr = pool.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const out = arr.slice(0, Math.min(count, arr.length));
  out.sort((a, b) => a - b);
  return out;
}

/* ------------------------------------------------------------------ */
/*  Formations                                                         */
/* ------------------------------------------------------------------ */

function pyramid(rows) {
  const pts = [];
  const sx = 0.0602;
  const sz = 0.0694;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i <= r; i++) {
      pts.push({ x: r * sx, z: (i - r / 2) * sz });
    }
  }
  return pts;
}

function line(n, along = "z") {
  const pts = [];
  const s = 0.0725;
  for (let i = 0; i < n; i++) {
    const t = (i - (n - 1) / 2) * s;
    pts.push(along === "z" ? { x: 0.35, z: t } : { x: 0.35 + t, z: 0 });
  }
  return pts;
}

function ring(n, radius) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: Math.cos(a) * radius, z: Math.sin(a) * radius * 0.72 });
  }
  return pts;
}

function grid(cols, rows) {
  const pts = [];
  const sx = 0.0801;
  const sz = 0.0741;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      pts.push({ x: (c - (cols - 1) / 2) * sx, z: (r - (rows - 1) / 2) * sz });
    }
  }
  return pts;
}

function arc(n, radius, spread) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = -spread + (i / (n - 1 || 1)) * spread * 2;
    pts.push({ x: Math.cos(a) * radius, z: Math.sin(a) * radius * 0.7 });
  }
  return pts;
}

/* ------------------------------------------------------------------ */
/*  Placement                                                          */
/* ------------------------------------------------------------------ */

function pocketList(P) {
  const HL = P.halfLength;
  const HW = P.halfWidth;
  const ins = P.pocketInset ?? 0.012;
  return [
    { x: -(HL - ins), z: -(HW - ins), r: P.pocketRadius },
    { x: HL - ins, z: -(HW - ins), r: P.pocketRadius },
    { x: -(HL - ins), z: HW - ins, r: P.pocketRadius },
    { x: HL - ins, z: HW - ins, r: P.pocketRadius },
    { x: 0, z: -(HW - ins), r: P.sidePocketRadius },
    { x: 0, z: HW - ins, r: P.sidePocketRadius },
  ];
}

const PLAY_X = (P) => P.halfLength - 0.30;
const PLAY_Z = (P) => P.halfWidth - 0.115;

function relax(pts, P, rnd) {
  const R = P.ballRadius;
  const minD = 2 * R + 0.0035;
  const pockets = pocketList(P);
  const limX = PLAY_X(P);
  const limZ = PLAY_Z(P);
  for (let it = 0; it < 90; it++) {
    let moved = false;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        let dx = pts[j].x - pts[i].x;
        let dz = pts[j].z - pts[i].z;
        let d = Math.hypot(dx, dz);
        if (d < 1e-6) {
          dx = rnd() - 0.5;
          dz = rnd() - 0.5;
          d = Math.hypot(dx, dz) || 1;
        }
        if (d < minD) {
          const push = (minD - d) / 2 + 1e-4;
          const nx = dx / d;
          const nz = dz / d;
          pts[i].x -= nx * push;
          pts[i].z -= nz * push;
          pts[j].x += nx * push;
          pts[j].z += nz * push;
          moved = true;
        }
      }
    }
    for (const p of pts) {
      if (p.x < -limX) p.x = -limX;
      if (p.x > limX) p.x = limX;
      if (p.z < -limZ) p.z = -limZ;
      if (p.z > limZ) p.z = limZ;
      for (const q of pockets) {
        const d = Math.hypot(p.x - q.x, p.z - q.z);
        const need = q.r + R + 0.004;
        if (d < need) {
          const nx = (p.x - q.x) / (d || 1);
          const nz = (p.z - q.z) / (d || 1);
          p.x = q.x + nx * need;
          p.z = q.z + nz * need;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return pts;
}

function formationsFor(rnd, count, P) {
  const limX = PLAY_X(P);
  const limZ = PLAY_Z(P);
  const out = [];
  if (count <= 3) out.push(line(count, "z"), line(count, "x"), pyramid(2).slice(0, count));
  out.push(pyramid(Math.ceil((-1 + Math.sqrt(1 + 8 * count)) / 2)));
  out.push(grid(Math.ceil(Math.sqrt(count * 1.4)), Math.ceil(count / Math.ceil(Math.sqrt(count * 1.4)))));
  out.push(ring(count, Math.min(limX * 0.55, 0.55)));
  out.push(arc(count, Math.min(limX * 0.6, 0.7), Math.PI * 0.55));
  const scat = [];
  for (let i = 0; i < count; i++) {
    scat.push({ x: (rnd() * 2 - 1) * limX, z: (rnd() * 2 - 1) * limZ });
  }
  out.push(scat);
  return out;
}

function fitCount(pts, count, rnd) {
  while (pts.length > count) {
    const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
    const cz = pts.reduce((a, p) => a + p.z, 0) / pts.length;
    let bi = 0;
    let bd = -1;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - cx, pts[i].z - cz);
      if (d > bd) { bd = d; bi = i; }
    }
    pts.splice(bi, 1);
  }
  while (pts.length < count) {
    const cx = pts.reduce((a, p) => a + p.x, 0) / Math.max(1, pts.length);
    const cz = pts.reduce((a, p) => a + p.z, 0) / Math.max(1, pts.length);
    pts.push({ x: cx + (rnd() * 2 - 1) * 0.2, z: cz + (rnd() * 2 - 1) * 0.2 });
  }
  return pts;
}

export function ballLayout(rnd, count, P) {
  const forms = formationsFor(rnd, count, P);
  const pick = forms[Math.floor(rnd() * forms.length)];
  let pts = fitCount(pick.map((p) => ({ x: p.x, z: p.z })), count, rnd);
  relax(pts, P, rnd);
  // shift the whole cluster toward the +x half so the cue ball has room
  const cx = pts.reduce((a, p) => a + p.x, 0) / Math.max(1, pts.length);
  const shift = Math.min(Math.max(0.34 - cx, -0.4), 0.5);
  for (const p of pts) {
    p.x += shift;
    if (p.x > PLAY_X(P)) p.x = PLAY_X(P);
    if (p.x < -PLAY_X(P)) p.x = -PLAY_X(P);
  }
  relax(pts, P, rnd);
  return pts;
}

export function cueSpot(P) {
  return { x: -P.halfLength + 0.34, z: 0 };
}

/* ------------------------------------------------------------------ */
/*  Objectives                                                         */
/* ------------------------------------------------------------------ */

function objectiveFor(rnd, chapter, count, numbers) {
  const c = chapter;
  if (c >= 2 && c < 6 && rnd() < 0.34) {
    return { type: "order", hint: "Sink the balls in ascending order" };
  }
  if (c >= 4 && rnd() < 0.3) {
    return { type: "last" };
  }
  if (c >= 6 && rnd() < 0.24) {
    return { type: "forbid" };
  }
  if (c >= 3 && rnd() < 0.2) {
    return { type: "within", hint: "Clear the table in limited shots" };
  }
  if (c >= 5 && rnd() < 0.18) {
    return { type: "timed", hint: "Beat the clock — clear the table in time" };
  }
  if (c >= 8 && rnd() < 0.24) {
    const grp = rnd() < 0.5 ? "solids" : "stripes";
    const group = grp === "solids" ? SOLIDS : STRIPES;
    const inGroup = numbers.filter((n) => group.includes(n));
    const others = numbers.filter((n) => !group.includes(n));
    if (inGroup.length >= 2 && others.length >= 1) {
      return { type: "group", group: grp, hint: `Sink every ${grp === "solids" ? "solid" : "stripe"} ball` };
    }
  }
  return { type: "clear", hint: "Clear every ball from the table" };
}

/* ------------------------------------------------------------------ */
/*  Opening-shot validity gate                                         */
/*                                                                     */
/*  A level is only accepted if the player has at least one real pot   */
/*  available on the opening shot: a ball they are allowed to sink     */
/*  with a clear ghost-ball line into a pocket. Layouts that fail are  */
/*  re-rolled (deterministically) up to GATE_ATTEMPTS times. This is   */
/*  the "algorithms guarantee validity" rule: the generator may not    */
/*  hand out a table with nothing to aim at.                           */
/* ------------------------------------------------------------------ */

const GATE_ATTEMPTS = 10;

function gateSim(P) {
  return new PoolSim({
    ballRadius: P.ballRadius,
    halfLength: P.halfLength,
    halfWidth: P.halfWidth,
    cornerRadius: P.pocketRadius,
    sideRadius: P.sidePocketRadius,
    pocketInset: P.pocketInset,
    cornerMouth: P.cornerMouth,
    sideMouth: P.sideMouth,
  });
}

function gateAllows(level, number) {
  const o = level.objective;
  if (o.type === "order") {
    const sorted = level.balls.map((b) => b.number).sort((a, b) => a - b);
    if (number !== sorted[0]) return false;
  }
  if ((o.type === "last" || o.type === "forbid") && number === o.ball) return false;
  if (o.type === "group") {
    const g = o.group === "solids" ? SOLIDS : STRIPES;
    if (!g.includes(number)) return false;
  }
  return true;
}

function hasClearPot(sim, cue, ball) {
  const R = sim.R;
  for (const p of sim.pockets) {
    const dx = p.x - ball.x;
    const dz = p.z - ball.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) continue;
    const nx = dx / d;
    const nz = dz / d;
    const gx = ball.x - nx * 2 * R;
    const gz = ball.z - nz * 2 * R;
    if (Math.abs(gx) > sim.halfLength || Math.abs(gz) > sim.halfWidth) continue;
    const ax = gx - cue.x;
    const az = gz - cue.z;
    const ad = Math.hypot(ax, az);
    if (ad < 2 * R) continue;
    const cut = (ax / ad) * nx + (az / ad) * nz;
    if (cut < 0.34) continue;
    if (!sim.pathClear(cue, { x: gx, z: gz, id: "__gate_ghost" }, [cue.id, ball.id])) continue;
    if (!sim.pathClear(ball, p, [ball.id])) continue;
    return true;
  }
  return false;
}

export function openingPotCount(level, P) {
  const { sim, cue, byNumber } = scratchTable(level.balls, P);
  let count = 0;
  for (const b of level.balls) {
    if (!gateAllows(level, b.number)) continue;
    const ball = byNumber.get(b.number);
    if (ball && hasClearPot(sim, cue, ball)) count++;
  }
  return count;
}

function scratchTable(balls, P) {
  const sim = gateSim(P);
  const cs = cueSpot(P);
  const cue = sim.addBall(cs.x, cs.z, { r: P.ballRadius, data: { cue: true } });
  const byNumber = new Map();
  for (const b of balls) {
    byNumber.set(b.number, sim.addBall(b.x, b.z, { r: P.ballRadius, data: { number: b.number } }));
  }
  return { sim, cue, byNumber };
}

/* The marked ball of a `last` / `forbid` level is chosen as one of the
 * *hardest to pot* balls on the table (largest clear distance to any pocket),
 * so a break or a stray carom is far less likely to sink it by accident —
 * which is the single most common way those levels were being lost. */
function markFor(balls, P, rnd) {
  const { sim, byNumber } = scratchTable(balls, P);
  const scored = balls.map((b) => {
    const ball = byNumber.get(b.number);
    let best = Infinity;
    for (const p of sim.pockets) {
      if (!sim.pathClear(ball, p, [ball.id])) continue;
      best = Math.min(best, Math.hypot(p.x - ball.x, p.z - ball.z));
    }
    return { number: b.number, clearance: best };
  });
  scored.sort((a, b) => b.clearance - a.clearance);
  const pool = scored.slice(0, Math.min(3, scored.length));
  return pool[Math.floor(rnd() * pool.length)].number;
}

/* ------------------------------------------------------------------ */
/*  Level generation                                                   */
/* ------------------------------------------------------------------ */

function buildLevel(number, attempt, P) {
  const chapter = chapterOf(number);
  const idx = indexInChapter(number);
  const baseSeed = hashString(`sb-${number}-${chapter}`);
  const rnd = mulberry32(attempt === 0 ? baseSeed : (baseSeed ^ Math.imul(attempt, 0x9e3779b1)) >>> 0);
  const progress = number / TOTAL_LEVELS;

  const minBalls = 3 + Math.floor(progress * 4);
  const maxBalls = Math.min(10, minBalls + 3);
  const count = Math.max(3, Math.round(minBalls + rnd() * (maxBalls - minBalls)));

  const numbers = pickNumbers(rnd, count, { pool: ALL_NUMBERS });
  const objective = objectiveFor(rnd, chapter, count, numbers);

  // aim assitance is gated early, richer later
  const assist = chapter >= 3;

  // special balls appear from chapter 6 onward, occasionally
  const specials = {};
  const specialPool = [
    { type: "star", from: 6 },
    { type: "gold", from: 8 },
    { type: "time", from: 7 },
    { type: "gem", from: 11 },
    { type: "bomb", from: 10 },
  ];
  if (chapter >= 6) {
    const nSpec = chapter >= 14 ? (rnd() < 0.5 ? 2 : 1) : 1;
    for (let i = 0; i < nSpec; i++) {
      const opts = specialPool.filter((s) => chapter >= s.from);
      if (!opts.length) break;
      const s = opts[Math.floor(rnd() * opts.length)];
      const target = numbers[Math.floor(rnd() * numbers.length)];
      if (specials[target]) continue;
      specials[target] = s.type;
    }
  }

  const layout = ballLayout(rnd, count, P);
  const balls = layout.map((p, i) => ({
    number: numbers[i],
    x: p.x,
    z: p.z,
    special: specials[numbers[i]] ?? null,
  }));

  /* last / forbid marks are picked from the geometry, after the layout is known */
  if (objective.type === "last" || objective.type === "forbid") {
    const mark = markFor(balls, P, rnd);
    objective.ball = mark;
    objective.hint = objective.type === "last" ? `Sink the ${mark}-ball last` : `Never sink the ${mark}-ball`;
  }

  // shot budget
  let shots;
  if (objective.type === "within") {
    shots = Math.max(count, 2);
  } else if (objective.type === "timed") {
    shots = count + 2;
  } else if (chapter === 0) {
    shots = count + 3;
  } else if (chapter < 4) {
    shots = count + 2;
  } else if (chapter < 8) {
    shots = count + 1;
  } else {
    shots = count + (rnd() < 0.3 ? 0 : 1);
  }
  if (chapter >= 12 && rnd() < 0.25 && objective.type !== "timed") shots = Math.max(2, shots - 1);
  /* `last` needs one spare: a marked ball sunk too early now costs a shot
   * (it is re-spotted with a foul), so the mark may have to be potted twice. */
  if (objective.type === "last") shots += 1;

  let timeLimit = 0;
  if (objective.type === "timed") {
    timeLimit = Math.round(count * 8 + 12 - Math.min(6, chapter * 0.25));
  }

  const par = Math.max(2, count - (chapter >= 8 ? 1 : 0));
  const rewardCoins = 90 + count * 22 + chapter * 14;
  const rewardGems = (idx === LEVELS_PER_CHAPTER - 1) ? (2 + Math.floor(chapter / 5)) : (idx % 5 === 4 ? 1 : 0);

  const name = `${NAME_A[Math.floor(rnd() * NAME_A.length)]} ${NAME_B[Math.floor(rnd() * NAME_B.length)]}`;

  return {
    number,
    chapter,
    chapterName: chapterName(chapter),
    index: idx,
    name,
    themeId: themeForLevel(number),
    objective,
    balls,
    count,
    shots,
    par,
    timeLimit,
    assist,
    reward: { coins: rewardCoins, gems: rewardGems },
    seed: hashString(`sb-${number}`),
  };
}

export function levelSummary(level) {
  return `#${level.number} ${level.name}`;
}

/* Deterministic, validity-gated level lookup: keep re-rolling the seeded layout
 * until the opening-shot gate passes (see above). */
export function getLevel(number, P) {
  number = Math.max(1, Math.min(TOTAL_LEVELS, Math.round(number)));
  const params = P ?? TABLE_PARAMS;
  let level = buildLevel(number, 0, params);
  for (let attempt = 1; attempt < GATE_ATTEMPTS; attempt++) {
    if (openingPotCount(level, params) > 0) break;
    level = buildLevel(number, attempt, params);
  }
  return level;
}
