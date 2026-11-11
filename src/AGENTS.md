# Agent instructions — Shooting Ball (studio-adopted project)

The game on disk is the source of truth. Perchance lists in `main.pjs` are
config, `src/*.js` is the implementation, `src/SPEC.md` is the durable spec,
`src/tools/README.md` holds the evidence ledger. Read them before writing code.

## Standing orders

1. **Smallest subsystem first.** Change the fewest files that fix the task; add
   a regression test with every behavior change. Never rewrite what a targeted
   edit fixes.
2. **Typed results, never dumps.** Every headless tool returns
   `{status|ok, …measured fields, errors: []}`. A console dump is not evidence.
3. **Green suite before done.** `runRegression()` ok, `predictionCheck()` 0 /
   <0.05°, `validateAll()` ≥85% cleared / ≥98% opening pot. Restore the
   last-known-good file contents past the retry budget (keep a `scratch/`
   copy of anything you touch before a risky edit).
4. **Bounded retries.** A failing task gets a diagnostic + one targeted fix,
   then re-run the failing check plus the regression — never loop blindly.
5. **Visual QA is mandatory.** A clean console is not visual QA: capture the
   rendered canvas (`src/tools/visual.js` matrix), inspect it with your own
   eyes, compare against the approved direction (`src/design/art_direction.md`).
6. **Direction freeze.** `art_direction.md` is the bible. New visuals must
   comply with it; to change the look, update the bible first, then the assets.
7. **Ledger every claim.** Any "improvement" ships with a measured
   before/after in `src/tools/README.md` + one line in `src/reports/decisions.log`.
8. **Defaults unchanged.** Existing tunables in `main.pjs` keep their values
   unless the task explicitly rebalances — then update SPEC §4 gates too.
9. **Provenance.** Every asset has a manifest entry (`src/assets/manifest.json`:
   id, path, source, license). No unlisted assets, no unknown licenses.
10. **Never save/publish.** The user saves. Leave `main.pjs` $meta.image alone
    unless asked for a new hero.
