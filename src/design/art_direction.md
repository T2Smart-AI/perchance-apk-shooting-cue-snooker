# Art direction — Shooting Ball (frozen bible, v1)

Relaxing premium pool-hall toy: crisp readable balls on rich mid-tone cloth,
dark room around a lit table, gold-and-wood jewellery. Stylized-but-composed:
never photoreal, never minimal.

## Palette

- **Felts stay mid-tone** (Emerald Classic, Cyberpunk Strip, Miami Vice, Toxic
  Jungle, Glacier, Magma Dunes, Bubblegum Pop, Graphite Storm, Nebula Wine,
  Dragon Fire, Golden Palace, Moonstone). Never near-black (balls
  vanish) and never neon (balls clash). Checked against the 15-ball palette:
  yellow #f6c90e … black 8-ball #151515.
- **Rails** contrast the felt: dark wood / piano black / pearl / metal against
  saturated cloth; light felts get dark rails, dark rooms get emissive lift.
- **Metals**: brass #c9a227 rails trim + pocket rims; gems only as stud accents.
- **Room**: deep gradient dome (top #060913 → horizon glow), near-black ground
  with a soft pool of table light; decor props silhouetted, never competing.

## Materials & light

- Cloth: woven fibre normal (weave-biased angles), micro-roughness variation,
  recessed AO where cloth meets cushions, small centered "SHOOTING BALL" stamp
  (opacity ≤0.4 — a maker's mark, not a watermark).
- Balls: clearcoat physical material, roughness 0.055, contact-shadow blob.
- Rails: six finishes (wood grain, lacquer, veined marble, carbon twill,
  brushed metal, pearl) + one trim (LED glow strips / metallic inlay /
  instanced studs). LED themes get glowing diamond sights.
- Key/fill/rim from `createLights` per theme; one warm point light inside the
  ball-return trough. Shadows PCFSoft, NeutralToneMapping. No default lighting.

## Camera & composition

- Portrait-first: camera on +X frames table **plus** the glass ball-return
  trough; landscape on +Z. HUD top (objective card, bonus bar), power + spin
  bottom, fine-aim row under power. Nothing clips at 390×844 or 1920×1080.
- Readability order: balls > aim lines > jewellery. Trim glows; it never
  outshines the cue ball path.

## Motion & feedback

- Cue stick draws back with power, strikes, fades. Pots drop into the trough
  and roll to slots; scratch re-spots. Outcome rings (green legal / red foul)
  + illegal-contact ✕ are markers, not lines. Bonus entry: gold flash +
  expanding rings (~2 s, skippable). Shake/flash restrained; UI transitions
  short fades/slides.

## UI

- Dark glass cards, gold accents, rounded pills. Screens: menu → map (50
  chapters, bonus nodes every 5th) → game → result → bonus intro/result →
  shop/missions/daily. Badge dot on MISSIONS only when something is claimable.

## Compliance

Every new theme/asset is checked against this doc before production; drift
(LED over-glow, black pearl, watermark decals, clipped HUD) is a defect.
Re-render the §visual matrix on any material/lighting change.
