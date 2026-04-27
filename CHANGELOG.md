# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Commit subjects follow [Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

### Added

- **Submarine landslide event type.** Watts (2000) flank-collapse and
  submarine-landslide tsunamigenesis with archetype scenarios for
  Storegga (~8200 BP), Anak Krakatau 2018, Lituya Bay 1958. Wired
  through store, URL state, cascade timeline, globe, and report.
- **Fault-style-aware seismic tsunami source.** Per-style rupture
  aspect ratio (Strasser 2010, Wells & Coppersmith 1994 Table 2A),
  dip-dependent uplift factor (Okada 1992, Tanioka & Satake 1996,
  Geist & Bilek 2001), and a wave-coupling efficiency η ≈ 0.7
  (Satake et al. 2013). Strike-slip Mw 8.5 now produces a smaller
  wave than a megathrust at the same magnitude, which is what the
  DART buoys actually measure.
- **Tsunami coverage extended to all event types.** Underwater and
  contact-water nuclear bursts (Glasstone §6, Le Méhauté & Wang 1996),
  volcanic flank- and caldera-collapse waves (Watts 2000, Grilli 2019),
  Green's-law shoaling combined with cylindrical 1/√r spreading
  painted as a heatmap (Lamb 1932, Synolakis & Bernard 2006).
- **Earthquake aftershock catalogue.** Deterministic Reasenberg-Jones /
  Båth / Omori-Utsu / Gutenberg-Richter sequence, seeded by the
  mainshock so the catalogue is reproducible and shareable. Rendered
  as a magnitude-graded point cloud with a log-compressed time-lapse.
- **Population-exposure overlay.** Client-side WorldPop 2020 COG
  lookup via geotiff.js with HTTP Range requests. Counts population
  inside the headline damage circle. Frames the number as exposure,
  not casualties — the casualty conversion needs a vulnerability
  function we deliberately don't ship.
- **U.S. Standard Atmosphere 1976.** Seven-layer hydrostatic profile
  (NOAA-S/T 76-1562) feeds atmospheric-entry and ash-settling.
- **Atmospheric-entry phenomenology.** Pancake penetration bonus,
  atmospheric yield in megatons, thermal-flash burn radii, and shock-
  wave overpressure radii applied to the airburst yield. Resolves the
  pedagogical "fragments at 46 km, 100 % energy to ground" puzzle:
  the penetration bonus exceeds the breakup altitude, regime is INTACT.
- **High-altitude airburst amplification.** Closed-form factor
  `f(h) = (P₀ / P_amb(h))^(1/β)` with β = 5/3 (Whitham 1974, Sachs
  1944, Korobeinikov 1991, USSA 1976) replaces the previous 2-point
  empirical fit. Validates Chelyabinsk 0.5 psi reach to within 1 %,
  Tunguska 5 psi reach to within 15 %.
- **Damage rings honour airburst regime.** Rings now use
  `max(surface burst from gf · KE, atmospheric airburst from
  (1 − gf) · KE)`, so Tunguska no longer renders as if 7 Mt detonated
  at sea level.
- **Bathymetry-aware scenarios.** Impact and explosion auto-derive
  water depth from AWS Terrarium tiles; clicking on open ocean
  triggers the tsunami branch without manual configuration.
- **Coastal explosion → tsunami auto-trigger.** Beirut 2020 on Hangar
  12, Castle Bravo on the Bikini reef. `findNearbyOceanDepth`
  searches a 9×9 lattice, falls back to the median ocean cell
  depth capped at 200 m.
- **DEM-driven Synolakis run-up.** Caller-supplied beach slope from
  the Terrarium tile around the click whenever the slope is inside
  Synolakis' valid envelope (~0.057° to ~18°). Outside the envelope
  the simulator falls back to the 1:100 reference. Inundation
  distance becomes `runup / tan(slope)`.
- **Tsunami kinematics in the report.** Open-ocean celerity `c=√(g·h)`,
  source wavelength (≈ 2× rupture length for seismic; ≈ 2× cavity
  diameter for impact), dominant period T = λ/c, plus inland
  inundation estimates at 100 km and 1000 km.
- **Tsunami visualisation.** Concentric wave-front rings (5 m / 1 m /
  0.3 m amplitude), tighter masking on the FMM amplitude raster,
  hover tooltips on every contour with EN+IT explanations tied to
  historical events.
- **Coastal damage tier description.** Six-tier readout under every
  run-up row, keyed off Bryant 2014 §10.5 / FEMA P-646 §3 /
  Imamura intensity thresholds.
- **Click-through aftershock detail.** Click any aftershock in the
  cloud, get magnitude, time, distance, MMI V/VI/VII contours, and
  three dim rings drawn around the picked event.
- **Geometry asymmetries.** Schultz & Anderson (1996) ejecta-blanket
  butterfly for oblique impacts, Glicken (1996) lateral-blast wedge
  for volcanoes (Mt St Helens 1980 archetype).
- **Monte-Carlo P10/P90 rings.** Faint translucent bands around the
  nominal damage circles when an MC sweep is run.
- **18 new historical presets.** Popigai, Boltysh, Sikhote-Alin (impact);
  Ivy Mike, Halifax 1917, Texas City 1947 (explosion); Valdivia 1960,
  Great Alaska 1964, Gorkha 2015, L'Aquila 2009, Amatrice 2016
  (earthquake); Vesuvius 79 CE, Etna 1669, Pelée 1902, Eyjafjallajökull
  2010, Hunga Tonga 2022 (volcano); Vaiont 1963, Elm 1881 (landslide).
- **Methodology page and glossary.** 23 new bibliographic Citations,
  validation roster grew from 15 to 38 historical events, glossary
  picked up 26 terms across 6 sections (new "Atmospheric entry" and
  "Population & exposure" categories). EN + IT.

### Fixed

- **Cascade ring timing for large-yield events.** Per-ring delay
  scaled linearly with the previous ring's radius at a fixed visual
  shock speed, so Tsar-Bomba light-damage rings appeared at t ≈ 23 s
  and Chicxulub rings at t ≈ 5 min — long after the 7 s mushroom-
  cloud VFX faded. New scheduler caps the total cascade at
  `MAX_TOTAL_CASCADE_MS` (5 s) by uniformly accelerating the
  effective shock speed when needed. Smaller scenarios unchanged.

### Changed

- Project renamed to **Nimbus — Nuclear & Impact Modeling & Blast Understanding System** (technical id
  `nimbus`). Repo: `anred88-stack/Nimbus`. All `PROJECT_NAME` /
  `GITHUB_USERNAME` placeholders substituted across `package.json`,
  `index.html`, the i18n JSON, the landing page, the deploy workflow,
  README, NOTICE, LICENSE, the announcement draft, the release
  checklist, and CLAUDE.md.

### Pending for v1.0

- Replace `TBD` copyright holder in `LICENSE` and `NOTICE`.
- Replace `conduct@example.com` and `security@example.com` with real
  contact addresses.
- Set `VITE_PLAUSIBLE_DOMAIN` in the Cloudflare Pages production
  environment.
- Real-device QA pass on iOS Safari and Android Chrome (Playwright
  emulation already green).
- Polish the announcement post, tag `v1.0.0`.

---

## Milestone history

Each milestone landed as a series of DCO-signed Conventional Commits;
the summaries below describe the shape, not the full diff.

### M6 — Content, tooltips, scientific provenance

Every numeric readout carries a Radix tooltip with the cited paper.
In-app `GlossaryDialog` with 14 plain-language definitions grouped by
discipline. Per-preset note line surfaces beneath the dropdown (date,
attribution, mechanism). Preset gallery covers Chicxulub, Chicxulub
ocean, Tunguska, Meteor Crater, Hiroshima, Nagasaki, Castle Bravo,
Tsar Bomba, 1 Mt reference, Tōhoku, Northridge, Kokoxili, Krakatau,
Mt St Helens, Tambora — 15 presets across four event types.

### M5 — Cross-browser, mobile, accessibility, performance

Playwright matrix: Chromium, Firefox, WebKit, Pixel 7, iPhone 14 — 85
E2E × 5 projects, all green locally and in CI. `@axe-core/playwright`
sweep on landing (IT + EN), globe mode, About, Glossary — WCAG 2.1 AA
clean. Lighthouse CI enforces accessibility = 1.0 and holds LCP under
3000 ms. Responsive polish for short viewports.

### M4 — URL-serialisable state

Schema v1 with compact keys. Encoder/decoder round-trips every
preset-level state. `useUrlStateSync()` keeps `window.location` in
sync with the store, preserves unrelated params, replays shared URLs.
Copy-link button with transient confirmation.

### M3 — Earthquakes, tsunamis, volcanoes, cascade

Earthquake primitives (Hanks & Kanamori 1979, Wells & Coppersmith
1994, Joyner & Boore 1981, Worden et al. 2012). Tsunami primitives
(Ward & Asphaug 2000, Green 1838, Aki 1966) plus impact cascade — a
Chicxulub-class ocean impact seeds a megatsunami without a special
case. Volcano primitives (Mastin 2009, Newhall & Self 1982, Sheridan
1979). Discriminated `EventType` union threaded through the store,
CLI, URL schema, UI dispatch. Globe paints per-type rings.

### M2 — Globe + Stage rendering

Cesium 1.x viewer with OSM imagery (no Ion token), click-to-pick
WGS84, four damage rings (crater rim, 3rd-degree burn, 5 psi, 1 psi).
React-three-fiber Stage scene with dusk-warm lighting, ground plane,
1.7 m human + 381 m tower landmarks, dynamic scale bar. ~1.5 s
black-crossfade transition that respects `prefers-reduced-motion`.
Radix Dialog (About) and Tooltip (citations) adopted. Zustand store
with discriminated event slices.

### M1 — Physics engine foundations

Impact: Collins/Melosh/Marcus 2005 crater scaling, Pike 1980 depth-
to-diameter, Schultz & Gault 1975 seismic magnitude. Chicxulub-class
test pins energy ≈ 3 × 10²³ J and final crater ≈ 180 km within 10 %.
Explosion: Glasstone & Dolan 1977, Kinney & Graham 1985, Nordyke
1977. Branded units, deterministic `simulateImpact`, Comlink worker,
`pnpm simulate` CLI. Layer 2 stays headless (ESLint-enforced).

### M0 — Setup

Vite 6, React 19, TypeScript 5.7 strict (`exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`, `verbatimModuleSyntax`). ESLint flat
config with the Layer-2 import guard. Vitest split (physics/Node and
ui/jsdom). Playwright scaffold. Storybook with `addon-a11y`. i18n
(IT + EN). Husky, lint-staged, Conventional Commits, DCO. CI workflow.
