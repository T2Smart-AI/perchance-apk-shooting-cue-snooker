/* Adversarial QA suite — the "never punish a mistap" enforcer.
 *
 * Deterministic, headless, typed results. Covers what the happy-path suites
 * don't: input spam, strikes landing mid-motion, level re-entry, boundary
 * powers/spins, out-of-range level/bonus ids, corrupt save payloads, mission
 * rotation sanity, and multi-pot foul bursts. Any failure here is a real
 * softlock/corruption risk in the live game.
 *
 * Run via loadToolModule("src/tools/adversarial.js", files) then
 * runAdversarial({spam: 120}).
 */
import { createState, shoot, stepToRest, applyOutcome, speedFor, SIM_DT } from "./harness.js";
import { getLevel, TOTAL_LEVELS } from "../levels.js";
import { getBonusLevel, TOTAL_BONUS, modeForBonus } from "../modes.js";
import { rollDaily, describe, addProgress, claimableCount } from "../missions.js";
import { normalizeAimHelp, Save } from "../save.js";
import { mulberry32 } from "../rng.js";

function suite(name) {
  return { name, checks: 0, passed: 0, failed: 0, errors: [] };
}

function check(s, cond, label) {
  s.checks++;
  if (cond) s.passed++;
  else {
    s.failed++;
    s.errors.push(label);
  }
}

function finiteSim(s, state, label) {
  for (const b of state.sim.balls) {
    if (b.potted) continue;
    if (![b.x, b.z, b.vx, b.vz].every(Number.isFinite)) {
      check(s, false, `${label}: non-finite ball state`);
      return;
    }
    if (Math.abs(b.x) > state.sim.halfLength + 0.3 || Math.abs(b.z) > state.sim.halfWidth + 0.3) {
      check(s, false, `${label}: ball escaped table`);
      return;
    }
  }
  check(s, true, label);
}

/* 1. Input spam: hundreds of rapid shots on one state, random everything. */
export function spamShots(count = 120, seed = 7) {
  const s = suite("spamShots");
  const state = createState(42);
  const rnd = mulberry32(seed);
  let threw = null;
  try {
    for (let i = 0; i < count && !state.over; i++) {
      shoot(state, rnd() * Math.PI * 2, rnd(), { top: rnd() * 2 - 1, side: rnd() * 2 - 1 });
      finiteSim(s, state, `spam shot ${i}`);
    }
    check(s, state.shotsUsed > 0, "shots counted under spam");
    check(s, state.over === (state.win || state.reason === "out of shots" || state.reason === "no shot available"), "terminal flag consistent");
  } catch (e) {
    threw = String(e?.message ?? e);
  }
  check(s, threw === null, threw ?? "no throw under spam");
  return s;
}

/* 2. Strike while balls are still moving (double-shoot / triple-tap). */
export function strikeWhileMoving() {
  const s = suite("strikeWhileMoving");
  const state = createState(9);
  try {
    state.sim.strike(state.cue, 1, 0, speedFor(1, state.physics, 1));
    state.sim.step(SIM_DT);
    check(s, state.sim.isMoving(), "sim moving after strike");
    state.sim.strike(state.cue, 0, 1, speedFor(0.5, state.physics, 1));
    const evs = stepToRest(state.sim);
    check(s, Array.isArray(evs), "settles after mid-motion re-strike");
    finiteSim(s, state, "post double-strike");
    check(s, !state.sim.isMoving(), "fully at rest");
  } catch (e) {
    check(s, false, `threw: ${e?.message ?? e}`);
  }
  return s;
}

/* 3. Level re-entry: same level built twice behaves identically. */
export function reentryDeterminism(sample = [1, 50, 500, 1000]) {
  const s = suite("reentryDeterminism");
  const sig = (lv) => lv.balls.map((b) => `${b.number}:${b.x.toFixed(6)},${b.z.toFixed(6)}`).join("|");
  for (const n of sample) {
    const a = createState(n);
    shoot(a, 0.3, 0.8);
    const b = createState(n);
    shoot(b, 0.3, 0.8);
    check(s, sig(a.level) === sig(b.level), `level ${n} identical on re-entry`);
    check(s, a.shotsUsed === b.shotsUsed && a.fouls === b.fouls, `level ${n} outcome identical`);
  }
  return s;
}

/* 4. Boundary powers / spins / full angle sweep at max power. */
export function boundaryShots() {
  const s = suite("boundaryShots");
  try {
    for (const power of [0, 0.01, 0.5, 0.99, 1]) {
      const st = createState(77);
      shoot(st, 1.2, power, { top: 0, side: 0 });
      finiteSim(s, st, `power ${power}`);
    }
    for (const sp of [-1.6, -1, 1, 1.6]) {
      const st = createState(77);
      shoot(st, 2.1, 1, { top: sp, side: -sp });
      finiteSim(s, st, `spin ${sp}`);
    }
    const st = createState(15);
    for (let k = 0; k < 64; k++) {
      const g = st.sim.makeGhost();
      const cue = g.balls.find((b) => b.id === st.cue.id);
      g.strike(cue, Math.cos((k / 64) * Math.PI * 2), Math.sin((k / 64) * Math.PI * 2), speedFor(1, st.physics, 1.4), { top: 1, side: 1 });
      let t = 0;
      let guard = 0;
      while (t < 20 && g.isMoving() && guard++ < 2400) {
        g.step(SIM_DT);
        t += SIM_DT;
      }
      if (g.isMoving()) {
        check(s, false, `angle ${k} stuck`);
        break;
      }
    }
    check(s, true, "64 max-power max-spin directions settle");
  } catch (e) {
    check(s, false, `threw: ${e?.message ?? e}`);
  }
  return s;
}

/* 5. Out-of-range ids clamp instead of corrupt. */
export function idBounds() {
  const s = suite("idBounds");
  for (const n of [0, -5, 1.7, TOTAL_LEVELS + 1, 99999, NaN]) {
    try {
      const lv = getLevel(n);
      check(s, lv.number >= 1 && lv.number <= TOTAL_LEVELS && lv.balls.length > 0, `getLevel(${n}) -> #${lv.number}`);
    } catch (e) {
      check(s, false, `getLevel(${n}) threw`);
    }
  }
  for (const k of [0, -3, TOTAL_BONUS + 1, NaN]) {
    try {
      const bl = getBonusLevel(k);
      check(s, bl.bonusId >= 1 && bl.bonusId <= TOTAL_BONUS && bl.balls.length > 0, `getBonusLevel(${k}) -> ${bl.bonusId}`);
    } catch (e) {
      check(s, false, `getBonusLevel(${k}) threw`);
    }
  }
  try {
    for (let k = 1; k <= TOTAL_BONUS; k++) {
      const bl = getBonusLevel(k);
      if (!bl.balls.length || !(bl.shots > 0)) {
        check(s, false, `bonus ${k} degenerate`);
        break;
      }
    }
    check(s, true, `all ${TOTAL_BONUS} bonus levels well-formed`);
    const modes = new Set();
    for (let k = 1; k <= TOTAL_BONUS; k++) modes.add(modeForBonus(k).id);
    check(s, modes.size === 8, `all 8 modes used (${modes.size})`);
  } catch (e) {
    check(s, false, `bonus sweep threw: ${e?.message ?? e}`);
  }
  return s;
}

/* 6. Corrupt save payloads must boot with defaults, never throw. */
export async function saveRobustness() {
  const s = suite("saveRobustness");
  const payloads = [
    null, 42, "junk", [],
    { stars: "oops", cuesOwned: "starter", aimHelp: "ultra", shootMode: "turbo" },
    { stars: null, cuesOwned: null, maxLevel: -3, coins: NaN },
    { aimHelp: "full", assistMode: "auto" },
    { aimHelp: false, shootMode: "twostep" },
  ];
  for (let i = 0; i < payloads.length; i++) {
    let restore = null;
    try {
      const keep = globalThis.root;
      restore = () => {
        globalThis.root = keep;
      };
      globalThis.root = { kv: { shootingBallSave: { get: async () => payloads[i] } } };
      const save = new Save({});
      await save.init();
      check(s, save.ready === true, `payload ${i} boots`);
      check(s, Array.isArray(save.state.cuesOwned) && save.state.cuesOwned.includes("starter"), `payload ${i} cues sane`);
      check(s, ["off", "basic", "advanced"].includes(save.state.aimHelp), `payload ${i} aimHelp normalized`);
      check(s, ["release", "twostep"].includes(save.state.shootMode), `payload ${i} shootMode sane`);
      restore();
    } catch (e) {
      if (restore) restore();
      check(s, false, `payload ${i} threw: ${e?.message ?? e}`);
    }
  }
  for (const v of ["off", false, "advanced", "full", "basic", "auto", "junk", null, 0]) {
    check(s, ["off", "basic", "advanced"].includes(normalizeAimHelp(v)), `normalizeAimHelp(${JSON.stringify(v)})`);
  }
  return s;
}

/* 7. Mission rotation: deterministic, distinct, in-range, describable. */
export function missionRotation() {
  const s = suite("missionRotation");
  try {
    const a = rollDaily("2026-01-05");
    const b = rollDaily("2026-01-05");
    check(s, JSON.stringify(a) === JSON.stringify(b), "same day rolls equal");
    const kinds = new Set(a.map((m) => m.kind));
    check(s, a.length === 3 && kinds.size === 3, "3 distinct missions per day");
    let year = true;
    for (let d = 1; d <= 60; d++) {
      const items = rollDaily(`2026-02-${String(d).padStart(2, "0")}`);
      for (const m of items) {
        if (m.target <= 0 || !describe(m).title || !Number.isFinite(m.coins)) year = false;
        const done = addProgress([{ ...m, progress: 0, claimed: false }], m.kind, 1e9);
        if (!Array.isArray(done)) year = false;
      }
    }
    check(s, year, "60 days of missions valid + completable");
    check(s, claimableCount(null) === 0 && claimableCount([]) === 0, "claimableCount null-safe");
  } catch (e) {
    check(s, false, `threw: ${e?.message ?? e}`);
  }
  return s;
}

/* 8. Multi-pot foul burst: several wrong-moment pots in ONE shot event list. */
export function foulBurst() {
  const s = suite("foulBurst");
  try {
    for (const n of [30, 120, 400]) {
      const state = createState(n);
      const o = state.level.objective;
      if (o.type !== "order" && o.type !== "last" && o.type !== "forbid") continue;
      const victims = state.sim.balls.filter((b) => b !== state.cue && !b.potted).slice(0, 3);
      const evs = victims.map((ball) => ({ type: "pocket", ball, pocket: { x: 0, z: 0 } }));
      applyOutcome(state, evs);
      check(s, state.fouls >= 1, `level ${n} (${o.type}) burst counted fouls`);
      let legal = true;
      for (const b of state.sim.balls) {
        if (b.potted || b === state.cue) continue;
        if (!state.sim.canPlace(b.x, b.z, b.r, b.id)) legal = false;
      }
      check(s, legal, `level ${n} re-spots all legal`);
      check(s, state.remaining >= 0, `level ${n} remaining sane`);
    }
    check(s, true, "foul bursts absorbed");
  } catch (e) {
    check(s, false, `threw: ${e?.message ?? e}`);
  }
  return s;
}

/* 9. Shot-budget edge: the last allowed shot decides, never a shot too many. */
export function budgetEdge() {
  const s = suite("budgetEdge");
  try {
    const state = createState(5);
    state.shotsUsed = state.level.shots - 1;
    applyOutcome(state, []);
    check(s, !state.over, "no premature end before last shot");
    state.shotsUsed = state.level.shots;
    applyOutcome(state, []);
    check(s, state.over && !state.win && state.reason === "out of shots", "budget edge ends level");
  } catch (e) {
    check(s, false, `threw: ${e?.message ?? e}`);
  }
  return s;
}

export async function runAdversarial(opts = {}) {
  const suites = [];
  suites.push(spamShots(opts.spam ?? 120, opts.seed ?? 7));
  suites.push(strikeWhileMoving());
  suites.push(reentryDeterminism());
  suites.push(boundaryShots());
  suites.push(idBounds());
  suites.push(await saveRobustness());
  suites.push(missionRotation());
  suites.push(foulBurst());
  suites.push(budgetEdge());
  const failed = suites.flatMap((x) => x.errors);
  const checks = suites.reduce((a, x) => a + x.checks, 0);
  return {
    status: failed.length === 0 ? "ok" : "error",
    ok: failed.length === 0,
    checks,
    suites: suites.map(({ name, checks: c, passed, failed: f, errors }) => ({ name, checks: c, passed, failed: f, errors })),
    errors: failed,
  };
}
