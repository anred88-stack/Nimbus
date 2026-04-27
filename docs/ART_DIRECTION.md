# Art direction

The simulator is a data-viz documentary. The Cesium globe is the
canvas of a serious scientific instrument, not a video-game level or
a meme generator. Damage data lands on the planet at true geographic
scale, sun-lit by the real solar geometry of the picked longitude,
with an explanatory legend always in reach.

(An earlier iteration shipped a stylised "Stage" comparison scene
inspired by MetaBallStudios. It was retired so all rendering effort
goes into the canvas the user actually interacts with. The physics
paths it exercised are preserved if a future cinematic mode revives
them.)

## Principles

1. **Scale is the protagonist.** Damage rings render at true
   geographic radius, never an artistic exaggeration. When a ring
   would wrap the planet it's clamped at the antipode and tagged
   `(global)` instead of degenerating into a meaningless circle.
2. **Restraint beats spectacle.** No neon, no aggressive rim lights,
   no meme. Sun-lit, physically plausible, a little solemn. The
   numbers are the drama; the rings are diagrams over a real planet.
3. **One typographic system.** Inter for UI, JetBrains Mono for
   numeric readouts. No third face.
4. **Colour is earned.** Warm colours mark energy (fireball,
   pyroclastic front, MMI VIII contour). Cool blue is reserved for
   tsunami and water overlays. Everything else is a cool neutral.
5. **Pedagogy by composition.** Every overlay has a plain-language
   explanation one glance away — `RingLegend` for ring colours,
   `CitationTooltip` for every numeric value, `GlossaryDialog` for
   technical terms. The user shouldn't need to leave the globe to
   find out what an "MMI VIII contour" or a "5 psi ring" is.

## Palette

CSS custom properties in `src/styles/globals.css`.

| Token              | Hex       | Use                                      |
| ------------------ | --------- | ---------------------------------------- |
| `--bg-deep`        | `#0A0E16` | App background                           |
| `--bg-mid`         | `#1A2332` | Cards, panels, feature tiles             |
| `--text-primary`   | `#F4F1EA` | Headings, primary body                   |
| `--text-secondary` | `#B8B5AE` | Captions, footnotes                      |
| `--accent`         | `#E8A33D` | CTA, highlighted figures, energy markers |
| `--accent-hot`     | `#D64A1F` | Fireball / thermal                       |
| `--accent-cool`    | `#4A90C9` | Water / tsunami                          |

Contrast targets:

- `--text-primary` on `--bg-deep`: ≥ 13:1 (WCAG AAA).
- `--text-secondary` on `--bg-deep`: ≥ 7:1 (WCAG AAA).
- `--accent` on `#1a1206`: ≥ 7:1.

Any new colour passes WCAG 2.1 AA (≥ 4.5:1 for normal text, ≥ 3:1
for large text).

## Typography

- UI display — Inter 700, clamp 2.2rem → 4.5rem.
- Body — Inter 400, 1rem, line-height 1.6.
- Numeric readouts — JetBrains Mono 500, tabular figures
  (`font-variant-numeric: tabular-nums`).
- Eyebrow / small caps — JetBrains Mono 400, 0.8rem,
  letter-spacing 0.18em, uppercase.

Inter is warm and quiet; JetBrains Mono is technical without being
hostile. Together they read as measured, serious, approachable.

## Motion

- Default ease: `cubic-bezier(0.22, 0.61, 0.36, 1)` (gentle decel).
- Hover transitions: 160 ms.
- State changes: 320 ms.
- View-mode crossfade (landing / globe / methodology / report):
  ~1.5 s.
- Damage rings expand on a physically calibrated schedule. Per-ring
  start delay is a log-compressed version of the real propagation
  onset (sound at `r/343 m·s⁻¹`, P-wave at `r/6000 m·s⁻¹`,
  light-speed phenomena at t=0). The total cascade is capped at
  `MAX_TOTAL_CASCADE_MS` (5 s) so the cinematic beat —
  flash → fire → shock → tremor → tsunami — lands within the
  mushroom-cloud VFX lifetime.
- `prefers-reduced-motion: reduce` skips every duration and stagger;
  rings snap to their final radii.

## Globe composition

Cesium runs with `enableLighting = true`. The real sun shades the
planet, and `viewer.clock.currentTime` is anchored to local solar
noon at the picked longitude. Two consequences:

1. The picked event point is always visibly lit — no scenarios
   rendered into the night terminator.
2. Lighting depends only on the picked longitude and today's UTC
   date, so two visitors opening the same shareable URL on the same
   day see the same illumination. The URL-shareability contract
   holds.

The terminator is deliberately stretched (`nightFadeOutDistance =
40000 km`, `nightFadeInDistance = 100000 km`) so global-scale events
keep a visible day–night arc instead of washing into uniform
daylight.

## Ring rendering

Damage rings are 2D ground primitives, not extruded volumes — their
geographic radius reads literally on the imagery. The fill is a
registered Cesium Fabric type, `RadialDamageRing`
(`src/scene/globe/radialDamageMaterial.ts`): alpha ramps from 0 at
the centre to a marked rim near the boundary, giving each ring the
perceptual cue of a translucent dome without faking volumetric
geometry. Outline strokes are a thin solid edge so the ring's exact
radius is unambiguous.

## Asset strategy

- CC0 only for models, textures, HDRIs (Poly Haven, Kenney,
  Sketchfab CC0). Every asset is listed in
  [docs/ASSETS.md](ASSETS.md) with source URL and licence
  screenshot.
- No logos, no trademarks. If we need an "iconic building" we use a
  generic silhouette or a Sketchfab CC0 model. No Eiffel Towers
  scraped without licence.
- Global inclusivity. Scale landmarks shouldn't always be Western:
  include the Shanghai Tower, the Great Pyramid, Mount Fuji, a
  generic mid-rise city block.

## What this project doesn't look like

- **NUKEMAP.** Utility map overlay. We're documentary.
- **neal.fun Asteroid Launcher.** Playful and illustrative. We're
  restrained and scientific.
- **Game engines, "tactical HUD" dashboards.** No HUDs, glowing
  gizmos, lens flares, neon trim, synthwave grids. The globe is a
  photograph of a real planet with measured circles drawn on top —
  not a Unity scene.

If a PR's screenshots look like any of the above, pause and reread
this doc.
