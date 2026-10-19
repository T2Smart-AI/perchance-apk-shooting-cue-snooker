# SPEC — Shooting Ball

Durable specification for the game and for the way it is developed. Anything here
is a standing requirement: keep it true, or update it deliberately.

## 1. Product

A faithful 3D recreation of the Android game **Shooting Ball**
(`com.billiards.shooting.ball.pool`) on Perchance + three.js: portrait 3D pool,
1000 levels in 50 themed chapters, 200 bonus stages interleaved between every 5th
level, collectible cues, hearts / coins / gems, daily missions, real physics.

Non-goals: multiplayer, live-service features, a level editor.

## 2. Experience requirements

1. **Always something to shoot.** Every level must offer a legal pot on the
   opening shot (validity gate). A table where the player can only smash into a
   cluster is a bug.
2. **No unrecoverable accidents.** A ball sunk at the wrong moment is re-spotted
   with a foul; levels may not end on an accident the player cannot influence.
   (The `order` rule set this precedent; `last` and `forbid` follow it.)
3. **The prediction tells the truth.** Every guide line is derived from a real
   forward simulation of the exact shot (same aim, power, spin, same fixed
   timestep), so what is drawn is what happens. Verified: 0° error in the
   predicted object-ball direction across hundreds of shots.
4. **At most three prediction lines.** The cue path (first contact), the struck
   ball's path, and either its pocket line or a single recommended angle. Fewer
   angles is better; extra "maybe" lines are noise.
5. **Aiming is easy to land precisely.** Magnetic snap near a verified pot angle,
   `◀ Fine / ◎ Lock / Fine ▶` buttons, relative (angular) dragging so a full
   sweep moves the aim only a fraction of that distance.
6. **Smooth on weak hardware.** Frame time is budgeted, not hoped for; the `auto`
   quality setting adapts the tier to the device.
7. **Never punish a mistap.** Impulse input (multi-touch spam, triple-taps,
   pause-cycling, restart mid-shot) must not soft-lock, double-shoot or corrupt
   state.

## 3. Rules

- Cue ball potted → foul, ball in hand (drag to place). Cue balls are never
  racked.
- Objectives: `clear` (all balls), `order` (ascending numbers), `last` (a marked
  ball must go last), `forbid` (a marked ball must never drop), `within` (clear in
  `count` shots), `timed` (beat the clock), `group` (solids or stripes).
- Wrong-moment pots (out of order / marked ball early / forbidden ball) →
  re-spot + foul, never an instant loss.
- Shot budget by chapter: `count + 3` (ch 0) → `count + 2` (ch 1–3) →
  `count + 1` (ch 4–7) → `count (+1 usually)` (ch 8+); `within` = `count`,
  `timed` = `count + 2`, `last` = +1 spare.
- Stars: 3 if `shots + fouls ≤ par`, 2 if `≤ par + 2`, else 1; ≥3 fouls caps at 1.
- Specials (chapter ≥6): star/gold coins, gem, +1 shot / +6 s time ball, bomb.

## 4. Balance targets (measured, see `src/tools/README.md`)

| Gate | Target |
|---|---|
| Levels with an opening pot | ≥ 98 % |
| Levels cleared by the reference player | ≥ 85 % |
| Unrecoverable instant losses | 0 |
| Physics fuzz | no NaN, no stuck ball, peak speed ≈ `maxSpeed` |
| Object-direction prediction error | < 0.05° |
| Frame budget (high tier, 7 balls) | p95 ≤ 22 ms |

The reference player is deliberately simple (fixed 0.85 power, straight ghost-ball
pots only, no banks or spin), so its failure rate is an upper bound on difficulty —
never nerf a level just because the bot struggles, and never call the bot's success
a proof of fun.

## 5. Method (studio pipeline applied to this project)

1. **Specify** — this file; `src/README.md` holds the architecture.
2. **Produce** — real code, real assets (procedural textures; no placeholders).
3. **Validate headlessly** — `src/tools` runs the *real* simulator outside the page:
   level validity sweep, physics fuzz, determinism, perf probes, prediction check.
4. **Inspect** — look at the rendered page (canvas captures + zoomed crops), not
   just the console. A clean boot is not visual QA.
5. **Adversarial QA** — input spam, pause/restart mid-shot, ball-in-hand spam,
   multi-tap shooting, full UI cycle, softlock hunt.
6. **Ledger** — every change that claims an improvement ships with a measured
   before/after (the table in `src/tools/README.md`).
7. **Gates before "done"** — clean load with no console/perchance errors, no
   regression in the numbers above, and a look at the result.

## 6. Quality gates for any future change

- `page_refresh` reports no JS syntax errors and no perchance/template errors.
- `runRegression()` returns `ok: true` (fuzz, determinism, validity within the
  failure budget).
- `predictionCheck()` stays at 0 mismatches / < 0.05°.
- A full `validateAll()` sweep clears ≥ 85 % and keeps the opening-pot rate ≥ 98 %.
- Visual check of the changed screen (capture + inspect), on phone and desktop
  viewports, with no clipped HUD and at most three guide lines.
