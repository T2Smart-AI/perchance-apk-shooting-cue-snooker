/* Regression suite — the "test_runner" of the toolchain.
 *
 * Checks the invariants that keep the game trustworthy: deterministic levels,
 * sane physics under max-power chaos, valid/clearable levels, and perf budgets.
 * Run via src/tools/run.js (see src/tools/README.md).
 */
import { physicsFuzz, determinismCheck, perfProbe, validateLevel, potSolutions, createState, speedFor } from "./harness.js";

export const DEFAULT_LEVEL_SAMPLE = [1, 2, 3, 4, 5, 10, 25, 50, 100, 175, 250, 400, 600, 800, 950, 999, 1000];

export function runRegression(opts = {}) {
  const fuzz = physicsFuzz(opts.fuzz ?? 24, opts);
  const determinism = determinismCheck(opts.determinismSample, opts);
  const perf = perfProbe(opts);
  const sample = opts.levelSample ?? DEFAULT_LEVEL_SAMPLE;
  const validity = sample.map((n) => {
    const r = validateLevel(n, opts);
    return {
      n,
      objective: r.objective,
      balls: r.balls,
      cleared: r.cleared,
      opening: r.openingSolutions,
      shots: r.shotsUsed,
      budget: r.shots,
      reason: r.reason,
    };
  });
  const failed = validity.filter((v) => !v.cleared);
  const budget = opts.failBudget ?? 0.15;
  const allowed = Math.ceil(validity.length * budget);
  return {
    fuzz,
    determinism,
    perf,
    validity,
    failed,
    checked: validity.length,
    failBudget: budget,
    withinBudget: failed.length <= allowed,
    ok: fuzz.ok && determinism.ok && failed.length <= allowed,
  };
}

/* Prediction sanity: the solver's verified pots must really drop the ball, and
 * the drawn object-ball direction must match the simulated one exactly. */
export function predictionCheck(levels = [3, 9, 22, 44, 77, 150, 320], opts = {}) {
  const rows = [];
  let mismatches = 0;
  let worstDeg = 0;
  let total = 0;
  for (const n of levels) {
    const state = createState(n, opts);
    const sols = potSolutions(state, { ...opts, maxSolutions: 8 });
    let bad = 0;
    for (const s of sols) {
      total++;
      const g = state.sim.makeGhost();
      const cue = g.balls.find((b) => b.id === state.cue.id);
      g.strike(cue, Math.cos(s.angle), Math.sin(s.angle), speedFor(0.85, state.physics, state.cuePower), { top: 0, side: 0 });
      let t = 0;
      let got = null;
      let dir = null;
      let first = null;
      while (t < 6 && g.isMoving()) {
        const evs = g.step(1 / 60);
        t += 1 / 60;
        for (const ev of evs) {
          if (ev.type === "ball" && !first && (ev.a === cue.id || ev.b === cue.id)) {
            first = ev.a === cue.id ? ev.b : ev.a;
            const ovx = ev.a === cue.id ? ev.bvx : ev.avx;
            const ovz = ev.a === cue.id ? ev.bvz : ev.avz;
            const os = Math.hypot(ovx, ovz);
            if (os > 1e-5) dir = { x: ovx / os, z: ovz / os };
          }
          if (ev.type === "pocket" && ev.ball.id === s.ball.id) got = ev.pocket;
        }
      }
      if (!got || first !== s.ball.id) bad++;
      if (dir) {
        const dot = Math.max(-1, Math.min(1, dir.x * s.dir.x + dir.z * s.dir.z));
        worstDeg = Math.max(worstDeg, (Math.acos(dot) * 180) / Math.PI);
      }
    }
    mismatches += bad;
    rows.push({ n, solutions: sols.length, mismatched: bad });
  }
  return { levels: levels.length, solutions: total, mismatches, worstDeg: +worstDeg.toFixed(4), rows, ok: mismatches === 0 && worstDeg < 0.05 };
}
