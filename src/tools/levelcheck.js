/* Level validity sweep — the "artifact validator" of the toolchain.
 *
 * Every level should offer at least one verified pot on the opening shot and be
 * clearable inside its shot budget by the heuristic auto-player. Run via
 * src/tools/run.js (see src/tools/README.md).
 */
import { report, validateLevel, autoPlay } from "./harness.js";
import { TOTAL_LEVELS } from "../levels.js";

export const TOTAL = TOTAL_LEVELS;

export function levelSample(step = 1, from = 1, to = TOTAL_LEVELS) {
  const out = [];
  for (let n = Math.max(1, from); n <= Math.min(TOTAL_LEVELS, to); n += Math.max(1, step)) out.push(n);
  return out;
}

export function validateAll(opts = {}) {
  return report(levelSample(opts.step ?? 1, opts.from ?? 1, opts.to ?? TOTAL_LEVELS), opts);
}

export { report, validateLevel, autoPlay };
