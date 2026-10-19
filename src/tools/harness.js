/* Headless gameplay bridge.
 *
 * Runs the *real* PoolSim and level generator with no THREE and no DOM, so the
 * game can be played, measured and validated at scale from a Web Worker (or any
 * plain JS context) instead of only in the live page.
 *
 * Modelled on the studio blueprint's `gameplay_bridge` + `test_runner`:
 * typed results, deterministic stepping, an auto-player policy and a level
 * validity check.
 */
import { PoolSim, TABLE_PARAMS } from "../physics.js";
import { getLevel, cueSpot } from "../levels.js";
import { mulberry32 } from "../rng.js";

export const SIM_DT = 1 / 60;

export const DEFAULT_PARAMS = { ...TABLE_PARAMS };

export const DEFAULT_PHYSICS = { maxSpeed: 13, hitPower: 1.15 };

const SOLIDS = [1, 2, 3, 4, 5, 6, 7];
const STRIPES = [9, 10, 11, 12, 13, 14, 15];

export function hitMul(physics = DEFAULT_PHYSICS) {
  return physics?.hitPower ?? 1.15;
}

export function speedFor(power, physics = DEFAULT_PHYSICS, cuePower = 1) {
  return (2.2 + power * 10.8) * hitMul(physics) * cuePower;
}

export function isRequired(level, number) {
  const o = level.objective;
  if (!o) return true;
  if (o.type === "group") return (o.group === "solids" ? SOLIDS : STRIPES).includes(number);
  if (o.type === "forbid") return number !== o.ball;
  return true;
}

export function createState(levelNumber, opts = {}) {
  const params = { ...DEFAULT_PARAMS, ...(opts.params || {}) };
  const physics = { ...DEFAULT_PHYSICS, ...(opts.physics || {}) };
  const level = opts.level ?? getLevel(levelNumber, params);
  const sim = new PoolSim({
    ballRadius: params.ballRadius,
    halfLength: params.halfLength,
    halfWidth: params.halfWidth,
    cornerRadius: params.pocketRadius,
    sideRadius: params.sidePocketRadius,
    pocketInset: params.pocketInset,
    cornerMouth: params.cornerMouth,
    sideMouth: params.sideMouth,
    ...physics,
  });
  sim.maxSpeed = (physics.maxSpeed ?? 13) * hitMul(physics) * (opts.cuePower ?? 1);
  const cs = cueSpot(params);
  const cue = sim.addBall(cs.x, cs.z, { r: params.ballRadius, data: { cue: true } });
  for (const b of level.balls) {
    sim.addBall(b.x, b.z, { r: params.ballRadius, data: { number: b.number, special: b.special } });
  }
  return {
    sim,
    level,
    params,
    physics,
    cuePower: opts.cuePower ?? 1,
    cue,
    remaining: level.balls.filter((b) => isRequired(level, b.number)).length,
    pottedOrderCount: 0,
    fouls: 0,
    shotsUsed: 0,
    over: false,
    win: false,
    reason: null,
    potted: [],
  };
}

export function stepToRest(sim, opts = {}) {
  const dt = opts.dt ?? SIM_DT;
  const maxTime = opts.maxTime ?? 12;
  const events = [];
  let t = 0;
  while (t < maxTime && sim.isMoving()) {
    const evs = sim.step(dt);
    t += dt;
    for (const e of evs) events.push(e);
  }
  return events;
}

function freeSpot(state, ball) {
  const P = state.params;
  const R = P.ballRadius;
  const cs = cueSpot(P);
  if (state.sim.canPlace(cs.x, cs.z, R, ball.id)) return cs;
  for (let ring = 1; ring < 40; ring++) {
    const rad = ring * 0.045;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const x = cs.x + Math.cos(a) * rad;
      const z = cs.z + Math.sin(a) * rad;
      if (state.sim.canPlace(x, z, R, ball.id)) return { x, z };
    }
  }
  return cs;
}

function respotCue(state) {
  const ball = state.cue;
  const spot = freeSpot(state, ball);
  ball.potted = false;
  ball.pocket = null;
  ball.x = spot.x;
  ball.z = spot.z;
  ball.vx = ball.vz = ball.wx = ball.wy = ball.wz = 0;
}

function unpot(state, ball) {
  const spot = freeSpot(state, ball);
  ball.potted = false;
  ball.pocket = null;
  ball.x = spot.x;
  ball.z = spot.z;
  ball.vx = ball.vz = ball.wx = ball.wy = ball.wz = 0;
}

export function applyOutcome(state, events) {
  const sim = state.sim;
  const level = state.level;
  const o = level.objective;
  for (const ev of events) {
    if (ev.type !== "pocket") continue;
    const ball = ev.ball;
    if (ball === state.cue) {
      state.fouls++;
      ball.potted = true;
      ball.pocket = ev.pocket;
      respotCue(state);
      continue;
    }
    const num = ball.data?.number;
    let credited = true;
    if (o.type === "order") {
      const sorted = level.balls.map((b) => b.number).sort((a, b) => a - b);
      const expected = sorted[state.pottedOrderCount];
      if (num !== expected) {
        credited = false;
        state.fouls++;
        unpot(state, ball);
      } else {
        state.pottedOrderCount++;
      }
    }
    if (credited && o.type === "last" && num === o.ball) {
      const others = sim.balls.filter((b) => b !== state.cue && !b.potted && b.data?.number !== o.ball).length;
      if (others > 0) {
        credited = false;
        state.fouls++;
        unpot(state, ball);
      }
    }
    if (credited && o.type === "forbid" && num === o.ball) {
      credited = false;
      state.fouls++;
      unpot(state, ball);
    }
    if (credited && isRequired(level, num)) state.remaining = Math.max(0, state.remaining - 1);
    if (credited) state.potted.push(num);
  }
  if (state.remaining === 0) {
    state.over = true;
    state.win = true;
    state.reason = "cleared";
    return;
  }
  if (state.shotsUsed >= level.shots) {
    state.over = true;
    state.win = false;
    state.reason = "out of shots";
  }
}

export function shoot(state, angle, power, spin = { top: 0, side: 0 }) {
  const speed = speedFor(power, state.physics, state.cuePower);
  state.sim.strike(state.cue, Math.cos(angle), Math.sin(angle), speed, spin);
  state.shotsUsed++;
  const events = stepToRest(state.sim);
  applyOutcome(state, events);
  return events;
}

export function potSolutions(state, opts = {}) {
  const sim = state.sim;
  const cue = state.cue;
  const R = state.params.ballRadius;
  const power = opts.power ?? 0.85;
  const speed = speedFor(power, state.physics, state.cuePower);
  const out = [];
  for (const b of sim.balls) {
    if (b === cue || b.potted) continue;
    for (const p of sim.pockets) {
      const dx = p.x - b.x;
      const dz = p.z - b.z;
      const d = Math.hypot(dx, dz);
      if (d < 1e-4) continue;
      const nx = dx / d;
      const nz = dz / d;
      const gx = b.x - nx * 2 * R;
      const gz = b.z - nz * 2 * R;
      if (Math.abs(gx) > sim.halfLength || Math.abs(gz) > sim.halfWidth) continue;
      const ax = gx - cue.x;
      const az = gz - cue.z;
      const ad = Math.hypot(ax, az);
      if (ad < 2 * R) continue;
      const cx = ax / ad;
      const cz = az / ad;
      const cut = cx * nx + cz * nz;
      if (cut < 0.34) continue;
      if (!sim.pathClear(cue, { x: gx, z: gz, id: "__ghost" }, [cue.id, b.id])) continue;
      if (!sim.pathClear(b, p, [b.id])) continue;
      const angle = Math.atan2(cz, cx);
      const pr = sim.predictShot(
        cue.id,
        Math.cos(angle),
        Math.sin(angle),
        speed,
        { top: 0, side: 0 },
        { cueBounces: 2, objBounces: 2, maxTime: 6, dt: SIM_DT }
      );
      if (pr.object && pr.object.ballId === b.id && pr.object.potted && pr.object.pocket) {
        out.push({
          ball: b,
          number: b.data?.number,
          pocket: pr.object.pocket,
          angle,
          ghost: pr.object.ghost,
          dir: pr.object.dir,
          cut,
          dist: ad,
          required: isRequired(state.level, b.data?.number),
        });
      }
      if (out.length >= (opts.maxSolutions ?? 12)) return out;
    }
  }
  return out;
}

function nearestTarget(state) {
  const o = state.level.objective;
  let best = null;
  let bd = Infinity;
  for (const b of state.sim.balls) {
    if (b === state.cue || b.potted) continue;
    const num = b.data?.number;
    if (!isRequired(state.level, num)) continue;
    if (o.type === "last" && num === o.ball) continue;
    if (o.type === "forbid" && num === o.ball) continue;
    const d = Math.hypot(b.x - state.cue.x, b.z - state.cue.z);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  if (best) return best;
  for (const b of state.sim.balls) {
    if (b === state.cue || b.potted) continue;
    if (isRequired(state.level, b.data?.number)) return b;
  }
  return null;
}

export function chooseShot(state, opts = {}) {
  const o = state.level.objective;
  let sols = potSolutions(state, opts);
  if (o.type === "order") {
    const sorted = state.level.balls.map((b) => b.number).sort((a, b) => a - b);
    const expected = sorted[state.pottedOrderCount];
    sols = sols.filter((s) => s.number === expected);
  } else if (o.type === "forbid") {
    sols = sols.filter((s) => s.number !== o.ball);
  } else if (o.type === "last") {
    const others = new Set(
      state.sim.balls.filter((b) => b !== state.cue && !b.potted && b.data?.number !== o.ball).map((b) => b.id)
    );
    const filtered = sols.filter((s) => others.has(s.ball.id));
    if (filtered.length) sols = filtered;
  } else if (o.type === "group") {
    const g = o.group === "solids" ? SOLIDS : STRIPES;
    const pref = sols.filter((s) => g.includes(s.number));
    if (pref.length) sols = pref;
  }
  if (sols.length) {
    sols.sort((a, b) => (b.required ? 1 : 0) - (a.required ? 1 : 0) || b.cut - a.cut || a.dist - b.dist);
    const s = sols[0];
    return { kind: "pot", angle: s.angle, power: opts.power ?? 0.85, number: s.number };
  }
  const target = nearestTarget(state);
  if (!target) return null;
  const ax = target.x - state.cue.x;
  const az = target.z - state.cue.z;
  const d = Math.hypot(ax, az) || 1;
  const R = state.params.ballRadius;
  const gx = target.x - (ax / d) * 2 * R;
  const gz = target.z - (az / d) * 2 * R;
  return {
    kind: "break",
    angle: Math.atan2(gz - state.cue.z, gx - state.cue.x),
    power: Math.min(1, 0.5 + d * 0.4),
    number: target.data?.number,
  };
}

/* Plays a level to completion with the heuristic policy.
 * Typed result — the shape the studio's tool layer expects. */
export function autoPlay(levelNumber, opts = {}) {
  const state = createState(levelNumber, opts);
  const budget = Math.min(opts.maxShots ?? state.level.shots, 60);
  const opening = potSolutions(state, opts).length;
  const trace = [];
  let guard = 0;
  while (!state.over && state.shotsUsed < budget && guard++ < 80) {
    const shot = chooseShot(state, opts);
    if (!shot) {
      state.over = true;
      state.reason = "no shot available";
      break;
    }
    trace.push({ n: state.shotsUsed + 1, kind: shot.kind, ball: shot.number ?? null, power: +shot.power.toFixed(2) });
    shoot(state, shot.angle, shot.power);
  }
  return {
    number: levelNumber,
    chapter: state.level.chapter,
    objective: state.level.objective.type,
    balls: state.level.count,
    shots: state.level.shots,
    par: state.level.par,
    openingSolutions: opening,
    cleared: state.win,
    shotsUsed: state.shotsUsed,
    fouls: state.fouls,
    remaining: state.remaining,
    reason: state.reason,
    trace,
  };
}

/* Validity gate for a level: an "approachable" level must offer at least one
 * verified pot on the opening shot, and be clearable within its shot budget. */
export function validateLevel(levelNumber, opts = {}) {
  const res = autoPlay(levelNumber, opts);
  return {
    ...res,
    valid: res.cleared,
    hasOpeningShot: res.openingSolutions > 0,
  };
}

export function report(levels, opts = {}) {
  const rows = [];
  let cleared = 0;
  let noOpening = 0;
  const byChapter = new Map();
  for (const n of levels) {
    const r = validateLevel(n, opts);
    rows.push(r);
    if (r.cleared) cleared++;
    if (!r.hasOpeningShot) noOpening++;
    const c = byChapter.get(r.chapter) ?? { chapter: r.chapter, n: 0, cleared: 0, shots: 0, budget: 0, opening: 0 };
    c.n++;
    if (r.cleared) {
      c.cleared++;
      c.shots += r.shotsUsed;
      c.budget += r.shots;
    }
    c.opening += r.openingSolutions > 0 ? 1 : 0;
    byChapter.set(r.chapter, c);
  }
  return {
    sampled: rows.length,
    cleared,
    failed: rows.length - cleared,
    noOpeningShot: noOpening,
    chapters: [...byChapter.values()]
      .sort((a, b) => a.chapter - b.chapter)
      .map((c) => ({
        chapter: c.chapter,
        levels: c.n,
        cleared: c.cleared,
        avgShots: c.cleared ? +(c.shots / c.cleared).toFixed(2) : null,
        avgBudget: c.cleared ? +(c.budget / c.cleared).toFixed(2) : null,
        withOpeningShot: c.opening,
      })),
    failures: rows.filter((r) => !r.cleared).slice(0, 40),
  };
}

/* Physics invariants under max-power chaos (no escapes, no NaN, always stops). */
export function physicsFuzz(count = 40, opts = {}) {
  let worstOverhang = 0;
  let maxSpeedSeen = 0;
  let nan = 0;
  let stuck = 0;
  for (let i = 0; i < count; i++) {
    const state = createState((i * 37) % 200 + 1, opts);
    const sim = state.sim;
    const rnd = mulberry32(i * 7919 + 3);
    const aim = rnd() * Math.PI * 2;
    sim.strike(state.cue, Math.cos(aim), Math.sin(aim), speedFor(1, state.physics, 1.4), {
      top: rnd() * 1.6 - 0.8,
      side: rnd() * 1.6 - 0.8,
    });
    let t = 0;
    let guard = 0;
    while (t < 30 && sim.isMoving() && guard++ < 3600) {
      sim.step(SIM_DT);
      t += SIM_DT;
      for (const b of sim.balls) {
        if (b.potted) continue;
        if (!Number.isFinite(b.x) || !Number.isFinite(b.z) || !Number.isFinite(b.vx) || !Number.isFinite(b.vz)) nan++;
        worstOverhang = Math.max(
          worstOverhang,
          Math.abs(b.x) - (sim.halfLength - b.r),
          Math.abs(b.z) - (sim.halfWidth - b.r)
        );
        maxSpeedSeen = Math.max(maxSpeedSeen, Math.hypot(b.vx, b.vz));
      }
    }
    if (sim.isMoving()) stuck++;
  }
  return {
    runs: count,
    nan,
    stuck,
    worstOverhang: +worstOverhang.toFixed(4),
    peakSpeed: +maxSpeedSeen.toFixed(2),
    ok: nan === 0 && stuck === 0 && worstOverhang < 0.09,
  };
}

/* Determinism: a level number must always produce the same layout. */
export function determinismCheck(sample = [1, 7, 42, 123, 500, 1000], opts = {}) {
  const bad = [];
  for (const n of sample) {
    const a = getLevel(n, DEFAULT_PARAMS);
    const b = getLevel(n, DEFAULT_PARAMS);
    const sig = (lv) => lv.balls.map((x) => `${x.number}:${x.x.toFixed(6)},${x.z.toFixed(6)}`).join("|") + "#" + lv.objective.type;
    if (sig(a) !== sig(b)) bad.push(n);
  }
  return { sample: sample.length, mismatches: bad, ok: bad.length === 0 };
}

/* Perf budgets: cost of a simulated shot / of a full level play-through. */
export function perfProbe(opts = {}) {
  const t0 = performance.now();
  const state = createState(123, opts);
  const t1 = performance.now();
  shoot(state, 0.4, 1);
  const t2 = performance.now();
  potSolutions(state, opts);
  const t3 = performance.now();
  const play = autoPlay(321, opts);
  const t4 = performance.now();
  return {
    buildMs: +(t1 - t0).toFixed(2),
    shotMs: +(t2 - t1).toFixed(2),
    solveMs: +(t3 - t2).toFixed(2),
    levelMs: +(t4 - t3).toFixed(2),
    levelShots: play.shotsUsed,
  };
}
