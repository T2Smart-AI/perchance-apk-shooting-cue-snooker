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

## Known limits

The reference player uses a fixed 0.85 power, straight ghost-ball pots only (no
banks, no spin, no multi-ball planning), so its failure rate is an upper bound on
difficulty, not proof that a level is unwinnable. Remaining failures (~7 % of
levels) are all "out of shots".
