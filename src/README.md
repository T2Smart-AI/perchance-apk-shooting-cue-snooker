# Shooting Ball — 3D billiards game
 portrait 3D pool, 1000+ levels across
50 themed chapters, collectible cues, hearts/coins/gems, missions, and 200 bonus
stages interleaved between every 5th level — on three.js with a real physics
simulation.

Live page: `https://perchance.org/apk-shooting-cue-snooker`

## Controls

- Drag anywhere on the table to aim (drag away from the cue ball to build power), release to shoot.
- `←` / `→` (or the Fine ◀ / ▶ buttons) nudge the aim angle by a small amount; **◎ Lock** jumps straight to the nearest verified pot.
- `Settings → Aiming help` switches the two help levels (Basic / Advanced) — see below.
- `Space` shoots at the current power. The power slider shows / sets power; the SPIN widget sets cue english (draw/follow/side).
- `Esc` / pause button opens the pause menu.
- `M` toggles all audio; `R` restarts the current level; `P`/`Esc` pause.

## Daily missions & career stats

`MISSIONS` on the menu opens the daily-missions screen (with a red dot badge when
something is claimable). Each UTC day rolls 3 distinct missions from 6 templates
(pot N balls / clear N levels / earn 3 stars on N levels / reach an N-ball combo /
clear N levels foul-free / earn N coins) — deterministic per date via
`rollDaily(dayKey())`, so every device sees the same missions that day. Progress is
tracked by `missionProgress(kind, amount, mode)` in `src/main.js`, hooked into the
game events (`pocket` for pots & combos, `bonus` for coins, `complete` for
clear/stars/foul-free/coins). Claiming pays coins/gems straight from
`save.claimMission(id)`. The same screen shows career stats: balls potted, stars
earned, levels unlocked, cues owned. Missions reset automatically at UTC midnight
(60s interval in `main.js` plus the boot-time `ensureMissions`).

## Music

Background music lives in `src/music/*.mp3` and is played through **Web Audio**
(`src/music.js`), not `<audio>`/`new Audio()`. This is deliberate: media elements
fail to load at all inside the editor's preview iframe (they stall at `readyState 0`
even for blob URLs), whereas Web Audio `decodeAudioData` works everywhere. The
context is shared with the SFX engine (`getAudioContext()` in `src/audio.js`) and
unlocked on the first user gesture (`unlockMusic()`). Crossfades between the `menu`
and `play` tracks, and pause/resume preserves the playback offset.

## Architecture

Everything ships from `main.pjs` + `index.html` + `src/`. The pjs file is the
high-level config (metadata, economy, physics constants, table dims, cue catalogue);
`index.html` is the app shell (markup + CSS + the module bootstrap);
`src/*.js` is the ES-module game (loaded via `<script type="module" src="src/main.js">`).

| File | Role |
| --- | --- |
| `main.pjs` | `$meta`, `kv` import, and all tunable data: `gameInfo`, `economy`, `physics`, `table`, `cues`. Numbers here are read at boot by `src/main.js` (`readTable`/`readPhysics`/cfg) and override the code defaults. |
| `index.html` | App shell: screens (menu, map, shop, game, modals), HUD, CSS, and the module bootstrap. Square-block templating for the title/level-name bits only. |
| `src/main.js` | Boot + glue. Reads pjs config, builds `Save` → `Game` → `UI`, wires buttons/keys, `loadDemo`, `startLevel(n)`, `startBonus(k)`/`enterBonus(k)`/`finishBonus()`, exposes `window.__game/__ui/__save/__ready`. |
| `src/game.js` | Game controller: owns the `THREE.Scene` and the `PoolSim`, builds the table/balls/cue meshes, camera framing, aiming + power, cue-stick placement (`updateCue`), the two-level aiming help (`helpLevel`/`helpBounces`/`aimSolutions`/`snapAim`/`updateGuide`), shot resolution, pockets, special-ball effects, stars/complete/fail, demo mode, and the bonus-stage runtime (`loadLevel(0,{bonusId})`, `updateBonus`, `bonusGoalMet`, `bonusBlast`, `bonusLamp`, `bonusVortex`, `refillBall`). |
| `src/physics.js` | `PoolSim` — the ball simulator. Fixed-substep integration: sliding→rolling friction, spin decay, ball-ball impulses, cushion bounces, pocket detection, rest detection, plus the bonus additions `posts` (static bumpers), `pocketsEnabled` and `field` (vortex/well). Pure math, no rendering. Also exports `TABLE_PARAMS` (the one source of truth for table geometry). |
| `src/rng.js` | `mulberry32` + `hashString`, pure and dependency-free so the level generator and `src/tools` can run headless (`textures.js` re-exports them for the renderer side). |
| `src/levels.js` | Procedural level generator. `CHAPTERS=50`, `LEVELS_PER_CHAPTER=20`, `TOTAL_LEVELS=1000`; `getLevel(n)` returns ball layout, cue spot, theme, specials and an `objective` (order / last / forbid / within / group / clear). Deterministic per level number, and **validity-gated**: layouts without a legal opening pot are re-rolled (see *Level validity gate*). |
| `src/modes.js` | Bonus stages: `BONUS_EVERY=5`, `TOTAL_BONUS=200`, `isBonusMilestone/bonusIdFor/milestoneFor`, the 8 `BONUS_MODES` (palettes, goals, chests and per-mode hooks) and `getBonusLevel(k, P)`. See **Bonus stages**. |
| `src/themes.js` | The 12 table themes (felt/cushion/rail colours, light scale, key light colour/intensity, sky-dome params). Theme index = `chapter % 12`. |
| `src/table.js` | Builds the table geometry: rails (the +X rail is extruded past the playing surface to house the **ball-return trough**), cushion profiles, pocket rims, diamond sights, apron/legs. Also adds the cloth wordmark decal and the rail contact-shadow (AO) overlay. Returns `table.rack` (glass trough: `slots`, `centerX`, `frontX`, …). |
| `src/textures.js` | Procedural canvas textures (felt + felt normal map, rail contact shadow, wood/marble rails, ball numbers, decals, blob shadows) — no external image assets. |
| `src/gfx.js` | Renderer + environment: `createRenderer` (preserveDrawingBuffer, PCFSoft shadows, sRGB, NeutralToneMapping), `createEnvironment`, `createLights`, `makeSkyDome`, `fitPerspectiveCamera`, `disposeTree`. |
| `src/audio.js` | WebAudio SFX (cue hit, ball clicks, pocket, win/lose, UI taps) synthesized at runtime — no audio files. `unlockAudio()`, `setEnabled()`, `sfx`, `getAudioContext()` (shared by music.js). |
| `src/music.js` | Background music via **Web Audio** (`AudioContext` + `decodeAudioData` + `GainNode` crossfade), tracks in `src/music/*.mp3`. `setMusicEnabled/unlockMusic/preloadMusic/play/fadeOut/pauseMusic/resumeMusic/musicState`. |
| `src/missions.js` | Daily-missions model: `dayKey`, `msUntilReset`, `rollDaily` (3 distinct missions/day, deterministic from the UTC date), `describe`, `addProgress`, `claimableCount`. |
| `src/save.js` | Persistence over `kv-plugin`: coins, gems, hearts (+refill timer), `maxLevel`, per-level stars, owned/equipped cues, daily-claim state, `totalPotted`, settings (`sfx`/`music`/`quality`/`aimHelp`), the daily `missions` block and the `bonus` record map. Also exports `normalizeAimHelp()`. Mission helpers: `ensureMissions/progressMissions/claimMission/missionsClaimable/addPotted`; bonus helpers: `isBonusUnlocked/bonusRecord/bonusCleared/setBonusResult/bonusClearedCount`. |
| `src/ui.js` | All DOM/HUD wiring: screens, toasts, modals, HUD numbers, power slider + knob (`setPower`), spin widget, map/shop/daily/missions rendering (`openMissions`/`renderMissions`), the career-stats panel, and the bonus UI (`#bonusBar`/`setBonusProgress`, `.bonusNode` map tiles, `playBonusEntry`, `openBonusIntro`, `showBonusResult`). |
| `src/tools/*` | **Headless studio toolchain** (dev-only, not imported by the game): `bundle.js` (tiny ESM bundler), `harness.js` (gameplay bridge: reference player, solver, fuzz/determinism/perf probes), `levelcheck.js` (level validator), `regression.js` (test runner). See `src/tools/README.md` for how to run it and the **evidence ledger**. |
| `src/SPEC.md` | Durable game + toolchain specification (rules, balance, acceptance criteria, quality gates). |

## Visuals / materials

All textures are procedurally generated canvases (`src/textures.js`) — there are no
image assets. The current material pass:

- **Cloth** — `feltTexture()` draws a base colour, low-amplitude dye blotches, two
  fibre passes (a short dense one plus a sparser longer one) with a *weave-biased*
  angle (`(rnd()<0.5?0:PI/2) + jitter`) so it reads as woven cloth rather than
  random scratches; blotch amplitude is deliberately low so the tile's mean
  luminance is even and tiling produces no visible repetition. A light wear pass
  adds faint chalk smears and ~600 dust pixels. `feltNormal()` derives a normal map
  from the same weave field (seed-matched) and is applied at
  `normalScale 0.85` and a higher repeat (`3.4 × 2.0`) than the colour map so the
  fibre normal is fine-grained. `clothRoughness()` varies the micro-roughness.
- **Rail contact shadow (AO)** — `railShadowTexture()` is a "picture frame" gradient
  (transparent centre, dark edges with a shaped falloff + corner darkening) mapped
  onto a plane covering the playing area just above the cloth (`railShadowTexture`
  → `ao` in `table.js`, `renderOrder 0`, `depthWrite:false`). This is what gives the
  cloth its recessed look where it meets the cushions; it is cheap (one unlit quad)
  and theme-independent.
- **Wordmark decal** — a `0.36 × 0.09` plane at the cloth centre, `textDecalTexture("SHOOTING BALL")`
  (`fitFont` auto-shrinks the line to 90% of the canvas so nothing clips),
  opacity `theme.decalOpacity ?? 0.4`. Kept small and crisp on purpose: it should
  read as a manufacturer's stamp, not a watermark (large/low-opacity versions were
  consistently judged as an artifact).
- **Pockets** — the drop-cup wall uses `vertexColors` on a `MeshBasicMaterial` with a
  quadratic top-to-bottom luminance ramp, so the pocket interior reads as a lit
  funnel mouth fading to black at depth instead of a flat black disc.
- **Wood / balls** — `woodTexture()` is value-noise growth rings + pores + knots,
  reused (rotated) as the cue shaft map; balls are `MeshPhysicalMaterial` with
  `clearcoat: 1`, `roughness 0.055`, plus a `blobShadowTexture()` contact-shadow quad
  under each ball (`R*5.4`, updated per frame in `game.js`).
- When judging visuals in the editor preview, force `renderer.setPixelRatio(2)` and
  `resize()` first — the preview's devicePixelRatio is ~0.9 (editor scaling) and the
  default render looks blurry at that scale.

## Ball return (glass trough built into the end rail)

Potted object balls collect on show, in a glazed trough recessed into the table's
own +X end rail (the classic vintage "watch the balls come back" idea, but *built
into* the table rather than bolted to its side).

- **Geometry** — the end rail is one `ExtrudeGeometry` whose outer `roundedRectAB`
  extends to `rackOuterX = OX + 0.21` while a second hole (inside the playing-area
  hole) opens the trough. The trough itself is a separate `rackGroup` under that
  opening: a felt-lined bed (`feltTexture(theme.felt)`, faintly emissive), a wooden
  sill, two brass track rails the balls nestle between, four glass panes
  (front/back/ends) and a near-flush inlaid `trimMesh` that finishes the opening.
  A dim warm `PointLight` sits inside the recess so the balls read.
- **Visibility** — the trough must sit *past* the cloth edge or the playing surface
  occludes it from the gameplay cameras; the extension is sized so the near rail of
  the trough always clears the sight line in both portrait (camera on +X) and
  landscape (camera on +Z). `Game.fitCamera()` frames the table **plus** `rack.frontX`
  and drops the box bottom to give the case air.
- **Gameplay wiring** (`src/game.js`) — `loadLevel` sets `this.rack = {slot:0}`;
  a potted ball's `drop` animation ends by calling `stashInRack(bm)`, which assigns
  the next slot (`bm.stashed`, `bm.rack = {t,dur,sx…tz,lx,lz}`); `updateRack(dt)`
  smooth-steps the mesh to its slot and rolls it via quaternion premultiply. The cue
  ball is never racked (a scratch does *not* consume a slot), stashing stops once the
  slots are full, and reloading a level empties the trough. `slotCount` is 15 (more
  than any level's ball count) and slots are centred on z so few balls sit mid-trough.

## Aiming

Aim is **relative/angular**: dragging accumulates the pointer's rotation *around*
the cue ball (`drag.acc`, wrap-aware) and sets `aim = drag.aim0 + drag.acc *
aiming.dragGain` — so a pointer sweep of ~40° turns the aim ~13°, roughly 2.2× finer
than the old 1:1 mapping. Tap-to-aim (absolute) is unchanged. `aiming.dragGain` and
`aiming.maxAngles` in `main.pjs` are read into `game.aimDragGain` / `game.aimMaxAngles`
in `src/main.js`.

Aim is made easy to land precisely by the **◀ Fine / ◎ Lock / Fine ▶** row under
the power bar: the fine buttons step the aim by 0.46°, and **Lock** jumps straight to
the nearest verified potting angle (`Game.lockAim()` → `nearestSolution()`) when one
exists, so a mobile player never has to fight the drag to hit the exact line. The
button greys out when there is no clear pot from the current cue position.

## Aim prediction (forward simulation)

Every guide line is derived from a **real forward simulation of the shot**, not from
straight-ray geometry. `PoolSim.predictShot(cueId, dirX, dirZ, speed, spin, opts)`
(`src/physics.js`) builds a shadow copy of the table (`makeGhost()`), strikes the cue
ball with the *actual* aim, power and spin, steps the **same integrator** forward, and
returns clean polylines:

- `cue.path` — the cue ball's vertices until it makes contact (cushion bounces use the
  real cushion friction, not specular reflection);
- `object` — the first ball it strikes: its `dir` (the exact post-impact velocity, so
  ball "throw" from side-spin is reproduced), `ghost` (contact point), `cueDir`
  (post-impact cue direction for the tangent line), `path` (its real trajectory,
  including cushion bounces and ball collisions) and `potted`/`pocket`.

This replaced the old analytic `aimPreview()` ray for the guides (that function still
exists — `projectLine()` uses it for straight-line projections) which was spin-blind
and could not show bounces, throw or pocket capture. Accuracy was checked against the live sim
across hundreds of shots/levels: predicted object-ball direction error **0°**, first
contact and potted-pocket both exact. Cost is ~0.5–1 ms and `Game.predictCurrent()`
caches the result on a key of cue position + aim + spin + power + ball layout, so it
only re-simulates when something actually changes. The preview uses the shot's real
power (falling back to 0.7 only when no power is pulled), which keeps the prediction
identical to what `Game.shoot()` will do — including on rail-first shots where power
changes which ball is struck first.

**Fixed timestep.** The live shot is integrated at a fixed `SIM_DT = 1/60` (a small
accumulator in `Game.update`), the *same* dt the predictor uses. Both call the
identical `PoolSim.step` sequence, so a predicted line is exactly what the shot
does on every device, at any framerate. (This matters: measured with the old
variable `Math.min(dt,1/40)` step, a 30 fps frame cadence shifted the predicted
object-ball direction by up to ~4° and could even change which ball was struck
first.)

**At most three directions.** `main.pjs → aiming.maxAngles` (default 3) is the
maximum number of straight legs a predicted trajectory may trace — the shot
direction plus at most two cushion bounces — and it is passed to `predictShot` as
`cueBounces`/`objBounces = maxAngles - 1` for both the cue ball and the object ball.
This keeps the guide short and readable instead of snaking around the table.

## Aiming help (two levels)

`Settings → Aiming help` has three options: **Off**, **Basic** and **Advanced**
(`save.state.aimHelp`, normalised by `normalizeAimHelp()` in `src/save.js`, which
also migrates the old `assistMode` values `auto/full/off`). The level is global (it
is *not* gated by the equipped cue), so help is always available. `game.helpBounces()`
now simply returns `aiming.maxAngles - 1` (so the prediction never traces more than
three straight directions) — the old per-cue `aimBounces` bonus is capped away by
that limit.

The guide draws **at most three lines**, each a real forward-simulated trajectory:

- the **green aim line** (`ribbon`) — the cue ball's path to its first contact (the
  current shot direction; it stops there rather than snaking through rail bounces);
- the **pink object line** (`objectRibbon`) — the struck ball's real post-impact path
  (true cut/throw direction, at most three legs);
- a **third line**: the bright-green `pocketRibbon` over the final leg when that ball
  is going in, otherwise (Advanced, while off-line) the amber `solutionRibbon` to the
  recommended ghost point.

- **Basic** (`helpLevel() === 1`) — the green aim line, the white ghost ball and its
  contact ring at the first ball hit, the pink object-ball trajectory, and the
  green pocket line when the ball is going in.
- **Advanced** (`helpLevel() === 2`) — everything above, plus the amber recommended
  aim (the solver, `aimSolutions()`).
- **Off** — all guide geometry is hidden (the cue stick still shows the direction).

Colour language: green = the cue ball's own path, pink = the aimed ball's path,
bright green = "that ball is going in that pocket", amber = the recommendation / a
locked pot. The recommendation is only drawn when the current aim is *not* already a
clear pot, which keeps the advanced view uncluttered: it appears when the player is
off-line and disappears once they lock on (the aim line itself turns amber to confirm
the lock).

The solver iterates live ball × pocket, derives the ghost-ball position that sends
the ball into that pocket, rejects blocked/thin-cut solutions (`sim.pathClear`,
cut `cos > 0.34`) and sorts by required-ball → straightness → distance. **At most
three** solutions are kept, and only those pointing in clearly different directions
(angle separation > 0.05 rad) — no fan of near-identical angles. Each candidate is
then **confirmed with `sim.predictShot()`**: only shots that the real simulation
actually drops count, and the pocket / direction / ghost the solver reports are taken
from the simulation (so the drawn pocket line is always the pocket the ball really
reaches). Solutions are cached by cue-ball position + live-ball count (the
recommended *angle* is power-independent, so the solver runs once per cue position
rather than on every drag), so the per-frame cost is negligible.

`snapAim()` **magnetically locks** the aim onto the nearest solution angle when the
player is within ~1.15°. This now works at **Basic** as well as Advanced (the fine
◀/▶ buttons step 0.46°, so they land on it), and `Game.lockAim()` lets the **Lock**
button jump straight there in one tap.

## Physics notes

`src/physics.js` is the heart of the "realness". Defaults (all overridable from
the `physics` block in `main.pjs`): `muSlide 0.28`, `muRoll 0.09`, `kDrag 0.24`,
`muSpin 0.8` (spin decay → `spinDecay`), `muSpinStop 7.0` (→ `spinStop`),
`muBall 0.06`, `eBall 0.95`, `eCushion 0.8`, `muCushion 0.22`,
`restSpeed 0.012`, `restSpin 0.35`, `maxSpeed 13`, `hitPower 1.15`.

`hitPower` is a **global shot-strength multiplier (+15%)**: `Game.shoot()` scales
the strike speed by it, and `Game.hitMul()` is also folded into `sim.maxSpeed`
(13 × 1.15 × cue power = 14.95), otherwise the clamp would cap full-power shots and
cancel the boost. Change that one number in `main.pjs` to retune the game's feel.

Verified by fuzz test: 260 max-power breaks at 14.95 (random angles + english) —
no energy growth, no stuck frames, no NaN, no balls escaping the table
(worst cushion overhang 0.031), peak transient ball speed 16.25.

Physics is currently decoupled from the rendered scale by design (table dims from
`main.pjs` `table`, ball radius 0.03) — keep units consistent if you retune.

## Level / objective system

`getLevel(number)` is deterministic and seeded by the level number, so levels are
hand-set-feeling but generated. Difficulty ramps: ball count 3→9, specials from
chapter 6, and objectives unlock by chapter (order 2–4, last ≥4, forbid ≥6,
within ≥3, group ≥8, else plain clear). Themes cycle through `THEME_ORDER`
(`chapter % 12`), e.g. level 201 → chapter 10 → "royal", 161 → "space".

### Level validity gate

A level is only accepted if the player has a **legal pot on the opening shot** —
an allowed ball (respecting `order` / `last` / `forbid` / `group`) with a clear
ghost-ball line into a pocket, checked geometrically against the real pocket
geometry (`openingPotCount()` in `src/levels.js`). Layouts that fail are
re-rolled from a derived seed, up to `GATE_ATTEMPTS = 10` times, so the result
stays deterministic but the generator cannot hand out a table with nothing to aim
at. Measured effect: levels with no opening pot went from **417/1000 to 9/1000**.
Cost is 0.056 ms/level on average (0.86 ms worst case).

`last` and `forbid` marks are also chosen *from the geometry*: the marked ball is
picked among the balls farthest from any pocket (`markFor()`), so breaks and
caroms are unlikely to sink it by accident.

### Objective rules

A ball sunk at the wrong moment is **recoverable**: sinking a ball out of `order`,
the marked ball early on a `last` objective, or a `forbid` ball is **re-spotted
with a foul** (cost: the shot, and a foul toward the 3-foul star cap) instead of
ending the level. This is the rule the `order` objective always used; it was
extended to `last`/`forbid` after the headless validator showed 106 levels being
lost to unrecoverable accidents. `last` levels carry one extra shot in their
budget for exactly this reason. The `within` objective budgets `count` shots
(one pot per shot), not `count - 1`.

## Performance & quality

The renderer runs four quality **tiers** (`QUALITY_TIERS` in `src/game.js`:
pixel-ratio cap 1/1.5/2/2, shadows off/on/on/on, shadow map 1024/1024/1536/2048).
`Settings → Quality` picks `low` / `auto` / `high`; **`auto` is adaptive** —
`adaptQuality(frameMs)` samples real frame times, and when the 90th percentile
stays above 21 ms for two windows it steps the tier down (and back up after six
fast windows), so a weak phone holds a smooth framerate instead of dropping
frames. Manual settings never adapt.

Measured in the live preview during a shot (7 balls, high tier): 60.3 fps
average, p50 16.7 ms, p95 18.7 ms, 109 draw calls, 32 k triangles.

## Headless studio toolchain (`src/tools`)

The simulation and level generator are pure JS, so they also run **outside the
browser page** — thousands of shots per second in an isolated Worker, with no
effect on the preview. `src/tools/` is a small gameplay-bridge / validator /
test-runner layer built on that, with a measured evidence ledger; see
`src/tools/README.md`. Current status: 991/1000 levels offer an opening pot,
930/1000 are cleared by the reference player, physics fuzz clean (no NaN, no
stuck balls), prediction-vs-simulation object-direction error 0.

## Bonus stages

After every 5th regular level the map drops a **bonus stage** — a free, replayable,
no-hearts side level with its own mode, palette and goal. They live in
`src/modes.js` (`BONUS_MODES`, `getBonusLevel(k, P)`, `modeForBonus(k)`), where `k`
is the bonus index (`milestone = k*5`, 1..200 = `TOTAL_BONUS`). Content is
generated from `k` alone, so bonus stages never perturb the 1000-level track.

- **Unlock / pay** — `save.isBonusUnlocked(k)` is `maxLevel > k*5`, i.e. the
  milestone level must be cleared first. A run never costs a heart and never writes
  `stars`/`maxLevel`; the chest pays full value on the **first** clear only
  (replays pay 25% coins, no gems). `finishBonus()` in `main.js` implements this —
  the `complete`/`fail` handlers early-return to it whenever `level.bonus`.
- **The 8 modes** (cycling per chapter pair via `modeForBonus`):
  `goldRush` (all-gold balls, +3s per pot, pot 6 in 45s) · `blitz` (pot 8 in 30s;
  every pot instantly respawns a ball) · `bombSquad` (sink any bomb and it blasts
  every ball inside `blastRadius`; clear the rack in 3 shots) · `ricochet` (each
  cushion a ball touches before it drops multiplies the pot; score 1500 in 60s) ·
  `midnight` (near-black table lit only by a point-light pool that follows the cue
  ball and flares on each pot; pot 6 in 40s) · `bumpers` (pockets sealed, static
  bumpers on the cloth, 40/hit; score 1200 in 60s) · `cyclone` (each shot spawns a
  decaying vortex field that curls every ball toward the centre; clear the table in
  50s) · `trickShot` (3 balls in a corner line, clear them with a single shot).
- **Mode hooks** — a mode may define `setup(game)`, `tick(game, dt)`, `onShot`,
  `onPocket`, `onCushion`, `onBumper`, plus `layout(k,P,rnd)` / `cue(k,P)` for a
  bespoke rack and `posts(P)` for bumpers. `Game.loadLevel(0, {bonusId:k})` builds
  `this.bonus = {id, mode, level, state, t}` and merges the mode's `palette` over
  the base theme (`mergeTheme`, deep-merging `lights`/`fog`/…).
- **Physics additions** — `PoolSim` gained `posts` (static infinite-mass circular
  bumpers that emit a `bumper` event), `pocketsEnabled` (bumpers seals the pockets)
  and `field` (a per-ball accelerating field, `well` or `vortex`, applied at the top
  of `integrate`). `bumper` events reach `mode.onBumper` through
  `Game.handleEvents`. Note the field only acts while the sim is stepping, i.e.
  while balls are rolling.
- **Bonus UI** — `#bonusBar` (icon / mode / live goal, fed by
  `events.bonusProgress`) sits above the objective card; timed modes reuse
  `#timerWrap`. `ui.renderMap()` inserts a `.bonusNode` tile after every milestone,
  `openBonusIntro(k)` is the pre-run card and `showBonusResult` the end-of-run card.
  `?bonus=<k>` on the URL boots straight into a stage (handy for testing).
- **In the order of play** — bonus stages are not map-only. Clearing a milestone
  level makes its bonus the *next* step: `ui.showResult()` detects
  `isBonusMilestone(level.number)` (via `isBonusUnlocked`) and shows a bold
  **★ BONUS STAGE** button (plus a "Skip to level N" pill) instead of "Next Level".
  `main.js` `enterBonus(k, nextLevel)` remembers `nextLevel` in `pendingNextLevel`,
  plays `ui.playBonusEntry(k, …)` (the full-screen **entry animation**, see below)
  and then starts the stage; when it ends, `showBonusResult` offers **Next Level ▶**
  so play resumes at `milestone + 1`. `pendingNextLevel` survives "PLAY AGAIN" and
  is cleared by `startLevel`/`loadDemo`.
- **Entry animation** — `ui.playBonusEntry(k, onDone)` fills `#bonusSplash`
  (`index.html`) with the mode icon/name/tag/goal and reveals it: a gold flash +
  expanding rings, the "BONUS STAGE" kicker slams in, then the icon, name and goal
  rise into place (~2s; tap to skip). The CSS lives under `/* bonus entry animation */`.
  A JS safety net snaps the copy to its final state if CSS animations are stalled
  (e.g. a background tab pauses the animation clock).

## Notes for the next agent

- `src/` is served relatively; unsaved `src/` files need a service worker to
  preview (fine in a normal browser/editor; may fail in some in-app browsers until saved).
- The menu screen is a DOM overlay on top of the shared `#gameCanvas`, which runs
  `Game` in `demo` mode (slowly orbiting table + aim preview). Any DOM-only
  capture (html2canvas/snapdom) therefore shows the menu text over a blank gap —
  the gap is the WebGL canvas, not missing UI.
- Capturing the canvas: force a redraw immediately before `toDataURL()`
  (e.g. call `game.fitCamera(...)` / `game.update()` and wait a frame), otherwise
  an idle GPU surface can read back blank.
- Don't hardcode the generator name — use `window.generatorName` for share links.
- The `$meta.image` hero is a composite of a live canvas capture + an html2canvas
  pass of `#hud` (canvas-only captures are fine; `snapshot.js`'s `reconcile:true`
  snapdom path hangs on this page — use `reconcile:false` if you need snapdom).
- Regenerate the hero: load the game (level 201 for the royal table), capture
  `#gameCanvas` via `toDataURL()`, capture `#hud` with html2canvas at the same
  size, composite on an OffscreenCanvas, then `upload_file` and update
  `$meta.image`.
