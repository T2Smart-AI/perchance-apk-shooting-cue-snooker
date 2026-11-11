# `src/tools` — headless studio toolchain

The game's simulation and content generation are pure JavaScript (no THREE, no
DOM), so they can be played, measured and validated **outside the live page** —
thousands of shots per second, in an isolated Web Worker, with no effect on the
preview. This is the "gameplay bridge + test runner + content validator" layer of
the studio blueprint, adapted to this project.

## Modules

| File | Role |
|---|---|
| `bundle.js` | Minimal ESM bundler (a classic script, not imported by the game). Turns the pure modules + a tool entry into one self-contained module so it can run where workspace-relative imports don't resolve. Also exposes `TOOL_FILES`. |
| `harness.js` | **Gameplay bridge.** `createState(levelNumber)` → real `PoolSim` + generated level; `shoot()`, `stepToRest()`, `applyOutcome()` (mirrors every objective rule in `game.js`), `potSolutions()` (the ghost-ball solver), `chooseShot()` (reference player policy), `autoPlay()`, `validateLevel()`, `report()`, `physicsFuzz()`, `determinismCheck()`, `perfProbe()`. |
| `levelcheck.js` | **Content validator.** `validateLevel(n)` / `validateAll({step,from,to})`: every level must offer a legal pot on the opening shot and be clearable within its shot budget. |
| `regression.js` | **Test runner.** `runRegression()` (physics invariants, determinism, validity sample, perf budgets) and `predictionCheck()` (the solver's pots really drop the ball and the drawn direction matches the simulation). |
| `adversarial.js` | **Adversarial QA.** `runAdversarial()`: input spam, strike-while-moving, level re-entry determinism, boundary powers/spins, out-of-range level/bonus ids, corrupt save payloads, mission rotation sanity, multi-pot foul bursts, shot-budget edge. 92 checks, all green. |
| `release.js` | **Release verifier.** `auditFiles()` (all shipped modules present), `auditManifest()` (licenses + paths), `auditSchemas()` (schemas parseable, $schema tags + required keys — drift detection), `verifyRelease()` (suites + sweep aggregation), `releaseReport()` (one-page text verdict, versioned under `src/reports/`). |
| `visual.js` | **Visual QA matrix.** `quickMatrix()` / `fullMatrix()` (theme × view × viewport scenarios), `diffFrames()` (thresholded perceptual diff, never exact pixels), `frameLiveliness()` (blank/frozen-frame detector), `scoreShot()` (six-dimension art-direction scorecard). |

Everything returns **typed results** (`{ok, cleared, reason, …}`), never console
dumps — per the blueprint's "typed tool results, not console dumps" rule.

## Running it

From the AI agent's worker (`execute_js`):

```js
const files = {};
let loaded = false;
for (const p of ["src/tools/bundle.js","src/tools/harness.js","src/tools/levelcheck.js",
                 "src/tools/regression.js","src/physics.js","src/levels.js","src/modes.js","src/rng.js"]) {
  files[p] = await fs.readTextFile(p);
}
(0, eval)(files["src/tools/bundle.js"]);          // defines TOOL_FILES / loadToolModule
const tool = await loadToolModule("src/tools/regression.js", files);
const res  = tool.runRegression({ fuzz: 24 });
```

A single full sweep of all 1000 levels takes ~40 s in the worker.

## Evidence ledger

Measured with the reference player (`autoPlay`) over **all 1000 levels**, before
and after the evidence-driven fixes below. Re-run with `validateAll()`.

| Metric | Before | After |
|---|---|---|
| Levels offering a legal pot on the opening shot | 583 / 1000 | **991 / 1000** |
| Levels the reference player clears | 734 / 1000 | **930 / 1000** |
| `within` (limited shots) clear rate | 9.5 % | **86.2 %** |
| `last` (marked ball) clear rate | 65.7 % | **88.9 %** |
| `forbid` clear rate | 77.0 % | **96.4 %** |
| Unrecoverable instant losses | 106 | **0** |
| Level generation cost | 0.02 ms | 0.056 ms avg / 0.86 ms worst |

The fixes themselves, each justified by a measurement:

1. **Opening-shot validity gate** (`levels.js`) — layouts are re-rolled
   (deterministically, `GATE_ATTEMPTS = 10`) until an allowed ball has a clear
   ghost-ball line into a pocket. 42 % of levels previously started with nothing
   to aim at; now 0.9 % do.
2. **Accidental pots are recoverable** (`game.js` / `applyOutcome`) — sinking the
   marked ball of a `last` objective, a `forbid` ball, or a ball out of `order`
   now re-spots it and charges a foul (exactly what the `order` rule already
   did) instead of ending the level. This removed 106 unrecoverable losses.
3. **`within` shot budget** was `count - 1` (strictly harder than one pot per
   shot → mathematically near-impossible); it is now `count`.
4. **Safer `last`/`forbid` marks** — the marked ball is chosen among the balls
   *farthest* from any pocket, so breaks and caroms are far less likely to sink
   it by accident.
5. **`last` gets one spare shot** — its mark may legitimately have to be potted
   twice.
6. **Cheater-Pool extraction** (aiming + 2-step shooting, all additive, defaults
   unchanged): optional `Settings → Shoot control → 2-step` (table drag aims
   only, power-bar pull-release fires); pocket outcome rings (green/red, from
   `predictShot().allPocketed`) and an illegal-first-contact ✕ (from
   `isPotClean()`, which mirrors `onPocket` exactly); mouse-wheel fine aim
   (~0.09°/notch); solver robustness check (±0.3° re-simulation, forgiving pots
   sort first). Measured: `runRegression()` ok, `predictionCheck()` 0
   mismatches / 0°, full sweep unchanged at **930/1000 cleared, 9/1000 without
   an opening pot**; live-verified 1-step drag-shoot, 2-step aim/no-fire +
   bar-fire + cancel, wheel step exactly 0.0016 rad, Settings toggle +
   persistence, phone + desktop captures (HUD fits, exactly 3 guide lines).
7. **Studio adoption** (memory + QA + release layers, zero gameplay changes):
   `AGENTS.md`, milestones, `schemas/*`, asset manifest (4 assets, licenses
   ok), art-direction freeze, `decisions.log`. New headless suites found and
   fixed 2 real bugs on first run: `getLevel(NaN)` → `#NaN` and
   `getBonusLevel(k)` throwing without `P` (NaN-safe clamps + `P ?? TABLE_PARAMS`
   in `levels.js`/`modes.js`). Measured after fix: adversarial **92/92**,
   `verifyRelease()` all PASS, full sweep unchanged (**930/1000, 9/1000**);
   visual quick-matrix 8/8 alive with 0 blocking defects (report versioned in
   `src/reports/`); whole-experience UI walk green on phone + desktop.

## Known limits

The reference player uses a fixed 0.85 power, straight ghost-ball pots only (no
banks, no spin, no multi-ball planning), so its failure rate is an upper bound on
difficulty, not proof that a level is unwinnable. Remaining failures (~7 % of
levels) are all "out of shots".
