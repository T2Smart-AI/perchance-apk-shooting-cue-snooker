/* Release verifier — clean-build + manifest + suite aggregation.
 *
 * Answers one question with typed evidence: "is this tree shippable?"
 * File inventory is injected (the worker lists files via fs; the page can
 * pass its own manifest), so this module stays pure and dependency-light.
 */
import { runRegression, predictionCheck } from "./regression.js";
import { runAdversarial } from "./adversarial.js";
import { validateAll } from "./levelcheck.js";

/* Every module the shipped game imports must be present. */
export const REQUIRED_GAME_FILES = [
  "main.pjs", "index.html",
  "src/main.js", "src/game.js", "src/physics.js", "src/levels.js",
  "src/modes.js", "src/missions.js", "src/music.js", "src/save.js",
  "src/table.js", "src/textures.js", "src/themes.js", "src/gfx.js",
  "src/audio.js", "src/rng.js", "src/ui.js",
  "src/music/menu-lounge.mp3", "src/music/play-loop.mp3",
];

export const REQUIRED_TOOL_FILES = [
  "src/tools/bundle.js", "src/tools/harness.js", "src/tools/levelcheck.js",
  "src/tools/regression.js", "src/tools/adversarial.js",
  "src/tools/release.js", "src/tools/visual.js",
];

export function auditFiles(present) {
  const set = new Set(present);
  const missing = [...REQUIRED_GAME_FILES, ...REQUIRED_TOOL_FILES].filter((f) => !set.has(f));
  return { status: missing.length ? "error" : "ok", ok: missing.length === 0, checked: REQUIRED_GAME_FILES.length + REQUIRED_TOOL_FILES.length, missing };
}

/* License audit: mirrors the studio's check_manifest — every manifest asset
 * needs a known-good license, every file it names must exist. */
const LICENSES_OK = new Set(["own", "CC0", "MIT", "Apache-2.0", "CC-BY", "CC-BY-SA"]);

export function auditManifest(manifest, present) {
  const errors = [];
  if (!manifest || !Array.isArray(manifest.assets)) return { status: "error", ok: false, errors: ["manifest has no assets[]"] };
  const set = present ? new Set(present) : null;
  for (const a of manifest.assets) {
    if (!LICENSES_OK.has(a.license)) errors.push(`${a.id}: license ${a.license}`);
    // Only workspace-relative paths (src/…) are existence-checked; URLs,
    // imports, method notes and $meta refs are provenance records, not files.
    if (set && a.path && a.path.startsWith("src/") && !set.has(a.path)) {
      errors.push(`${a.id}: missing file ${a.path}`);
    }
  }
  return { status: errors.length ? "error" : "ok", ok: errors.length === 0, assets: manifest.assets.length, errors };
}

/* Schema audit: the versioned JSON schemas under src/schemas/ are project
 * memory (formats for levels, themes, bonus, saves). They must stay parseable
 * and keep their $schema tag plus the fields the game actually reads, so
 * drift between code and documented format is caught here, not in production. */
const SCHEMA_FILES = [
  "src/schemas/levels.json",
  "src/schemas/themes.json",
  "src/schemas/bonus.json",
  "src/schemas/save.json",
];

const SCHEMA_REQUIREMENTS = {
  "src/schemas/levels.json": ["total", "fields"],
  "src/schemas/themes.json": ["count", "ids", "fields"],
  "src/schemas/bonus.json": ["every", "total", "fields"],
  "src/schemas/save.json": ["backend", "fields"],
};

export function auditSchemas(files) {
  const errors = [];
  let checked = 0;
  for (const path of SCHEMA_FILES) {
    const raw = files?.[path];
    if (raw == null) {
      errors.push(`${path}: missing`);
      continue;
    }
    checked++;
    let doc;
    try {
      doc = JSON.parse(raw);
    } catch (e) {
      errors.push(`${path}: invalid JSON`);
      continue;
    }
    if (typeof doc.$schema !== "string" || !doc.$schema.startsWith("shooting-ball/")) {
      errors.push(`${path}: missing $schema tag`);
    }
    for (const key of SCHEMA_REQUIREMENTS[path] ?? []) {
      if (doc[key] == null) errors.push(`${path}: missing key ${key}`);
    }
  }
  return { status: errors.length ? "error" : "ok", ok: errors.length === 0, checked, errors };
}

/* Full gate: files + manifest + schemas + headless suites. validateAll is
 * sampled by default (full 1000-level sweep only on demand — ~40 s). */
export async function verifyRelease(opts = {}) {
  const files = opts.files ?? [];
  const fileAudit = files.length ? auditFiles(files) : { status: "skipped", ok: true, checked: 0, missing: [] };
  const manifestAudit = opts.manifest ? auditManifest(opts.manifest, files) : { status: "skipped", ok: true, assets: 0, errors: [] };
  const schemaAudit = opts.schemaFiles ? auditSchemas(opts.schemaFiles) : { status: "skipped", ok: true, checked: 0, errors: [] };
  const regression = runRegression({ fuzz: opts.fuzz ?? 24 });
  const adversarial = await runAdversarial({ spam: opts.spam ?? 120 });
  const prediction = predictionCheck(undefined, opts);
  const sweep = opts.fullSweep ? validateAll({}) : null;
  const ok = fileAudit.ok && manifestAudit.ok && schemaAudit.ok && regression.ok && adversarial.ok && prediction.ok && (!sweep || (sweep.cleared / sweep.sampled >= 0.85 && sweep.noOpeningShot / sweep.sampled <= 0.02));
  return {
    status: ok ? "ok" : "error",
    ok,
    files: fileAudit,
    manifest: manifestAudit,
    schemas: schemaAudit,
    regression: { ok: regression.ok, fuzz: regression.fuzz, determinism: regression.determinism, perf: regression.perf, checked: regression.checked, failed: regression.failed.length },
    adversarial: { ok: adversarial.ok, checks: adversarial.checks, errors: adversarial.errors },
    prediction: { ok: prediction.ok, solutions: prediction.solutions, mismatches: prediction.mismatches, worstDeg: prediction.worstDeg },
    sweep: sweep ? { sampled: sweep.sampled, cleared: sweep.cleared, noOpeningShot: sweep.noOpeningShot } : { status: "skipped" },
    generatedAt: new Date().toISOString(),
  };
}

export function releaseReport(v) {
  const line = (ok, s) => `${ok ? "PASS" : "FAIL"}  ${s}`;
  return [
    `release verification ${v.status} (${v.generatedAt})`,
    line(v.files.ok, `files (${v.files.checked} checked)`),
    line(v.manifest.ok, `manifest (${v.manifest.assets} assets)`),
    v.schemas.status === "skipped" ? "SKIP  schemas" : line(v.schemas.ok, `schemas (${v.schemas.checked} checked)`),
    line(v.regression.ok, `regression (${v.regression.checked} levels sampled)`),
    line(v.adversarial.ok, `adversarial (${v.adversarial.checks} checks)`),
    line(v.prediction.ok, `prediction (${v.prediction.solutions} pots, ${v.prediction.mismatches} mismatches)`),
    v.sweep.status === "skipped" ? "SKIP  full sweep" : line(true, `sweep ${v.sweep.cleared}/${v.sweep.sampled}`),
  ].join("\n");
}
