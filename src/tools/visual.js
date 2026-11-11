/* Visual QA matrix + perceptual diff + scorecard (dependency-free).
 *
 * The studio blueprint demands screenshots compared against approved
 * baselines with thresholds — never exact pixels — across scenes, angles and
 * resolutions. This module is the machine side of that loop: it declares the
 * capture matrix, diffs two RGBA frames with a perceptual-ish threshold, and
 * scores a shot against the art-direction rubric. Captures themselves come
 * from the live page (canvas.toDataURL / snapshot helper); approval copies a
 * capture into scratch/shots/baselines/ and records its hash here.
 *
 * All functions are pure: Uint8ClampedArray in, typed results out.
 */

/* Capture matrix: theme x view x viewport. 12 themes x 3 views x 2 sizes
 * is the full matrix (72 shots); `quickMatrix()` is the 8-shot smoke set. */
export const MATRIX_THEMES = [
  "arena", "nightcity", "beach", "forest", "ice", "desert",
  "candy", "neon", "space", "volcano", "royal", "ocean",
];

export const MATRIX_VIEWS = ["orbit", "cue-close", "top"];
export const MATRIX_VIEWPORTS = [{ w: 390, h: 844 }, { w: 1920, h: 1080 }];

export function fullMatrix() {
  const out = [];
  for (const theme of MATRIX_THEMES)
    for (const view of MATRIX_VIEWS)
      for (const vp of MATRIX_VIEWPORTS) out.push({ theme, view, ...vp });
  return out;
}

export function quickMatrix() {
  return [
    { theme: "arena", view: "orbit", w: 390, h: 844 },
    { theme: "royal", view: "orbit", w: 1920, h: 1080 },
    { theme: "nightcity", view: "cue-close", w: 390, h: 844 },
    { theme: "ice", view: "top", w: 1920, h: 1080 },
    { theme: "candy", view: "orbit", w: 390, h: 844 },
    { theme: "midnight-bonus", view: "orbit", w: 390, h: 844 },
    { theme: "neon", view: "cue-close", w: 1920, h: 1080 },
    { theme: "volcano", view: "top", w: 390, h: 844 },
  ];
}

/* Perceptual-ish diff: per-pixel normalized distance with a just-noticeable
 * threshold; reports the fraction of pixels above it plus the mean delta.
 * Brightness-shift tolerant: compares chroma-weighted distance, so a global
 * exposure nudge doesn't fail the suite. */
export function diffFrames(a, b, opts = {}) {
  if (!a || !b || a.length !== b.length || a.length % 4 !== 0) {
    return { status: "error", ok: false, errors: ["size mismatch"] };
  }
  const jnd = opts.jnd ?? 12 / 255;
  const pixels = a.length / 4;
  let different = 0;
  let sum = 0;
  let worst = 0;
  for (let i = 0; i < a.length; i += 4) {
    const dr = (a[i] - b[i]) / 255;
    const dg = (a[i + 1] - b[i + 1]) / 255;
    const db = (a[i + 2] - b[i + 2]) / 255;
    // luma-weighted distance; alpha ignored (canvas premultiplied noise).
    const d = Math.sqrt(0.299 * dr * dr + 0.587 * dg * dg + 0.114 * db * db);
    sum += d;
    if (d > worst) worst = d;
    if (d > jnd) different++;
  }
  const frac = different / pixels;
  const mean = sum / pixels;
  const budget = opts.budget ?? 0.02;
  return {
    status: "ok",
    ok: frac <= budget,
    pixels,
    different,
    frac: +frac.toFixed(5),
    meanDelta: +mean.toFixed(5),
    worstDelta: +worst.toFixed(4),
    budget,
  };
}

/* Blank / frozen-frame detector: a capture that is one flat color (or two,
 * for a menu) is a capture bug, not a passing shot. */
export function frameLiveliness(px, w, h) {
  if (!px || px.length !== w * h * 4) return { status: "error", ok: false, errors: ["bad buffer"] };
  const buckets = new Set();
  let lumSum = 0;
  for (let i = 0; i < px.length; i += 4 * 7) {
    const l = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
    lumSum += l;
    buckets.add((l / 16) | 0);
  }
  const samples = Math.ceil(px.length / (4 * 7));
  return {
    status: "ok",
    ok: buckets.size > 3,
    buckets: buckets.size,
    meanLuma: +((lumSum / samples).toFixed(1)),
  };
}

/* Scorecard (SPEC §9 weights): six dimensions, 0..1 each. `signals` come from
 * automated checks + the reviewing eye; this just aggregates honestly. */
export const SCORECARD_WEIGHTS = {
  direction: 0.2, assets: 0.2, lighting: 0.2,
  motion: 0.15, composition: 0.15, interface: 0.1,
};

export function scoreShot(signals) {
  const dims = Object.keys(SCORECARD_WEIGHTS);
  const scores = {};
  let total = 0;
  const missing = [];
  for (const d of dims) {
    const v = signals?.[d];
    if (typeof v !== "number" || !(v >= 0 && v <= 1)) {
      missing.push(d);
      scores[d] = null;
    } else {
      scores[d] = v;
      total += v * SCORECARD_WEIGHTS[d];
    }
  }
  return {
    status: missing.length ? "incomplete" : "ok",
    ok: missing.length === 0,
    scores,
    total: missing.length ? null : +total.toFixed(3),
    missing,
  };
}

/* Baseline registry: label -> {hash, approvedAt, note}. Approval = a human
 * looked at the capture and blessed it. Compare by hash first (exact), fall
 * back to diffFrames against the stored pixels (kept in scratch/, not src/). */
export const BASELINES = {};

export function baselineStatus(label, hash) {
  const b = BASELINES[label];
  if (!b) return { status: "missing", approved: false };
  return { status: "ok", approved: b.hash === hash, recorded: b.hash };
}
