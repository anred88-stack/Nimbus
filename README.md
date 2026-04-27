# Nimbus — Nuclear & Impact Modeling & Blast Understanding System

A browser-based simulator for catastrophic events on a 3D Earth: asteroid
impacts, nuclear and conventional explosions, earthquakes, volcanic
eruptions, submarine landslides, and the tsunamis they spawn.

Pick a point on the globe, set the parameters, watch the cascade play out
on the same physical timeline. Numbers come from peer-reviewed papers
(Collins/Melosh/Marcus 2005, Glasstone & Dolan 1977, Mastin 2009, Ward &
Asphaug 2000, Wells & Coppersmith 1994, USGS ShakeMap, and the rest of
the bibliography in [docs/SCIENCE.md](docs/SCIENCE.md)). Every readout in
the UI traces back to a citation.

The project is open source under Apache-2.0. It is a popular-science
tool, not an engineering one: the goal is to help non-specialists feel
the difference between a kiloton and a megaton, between a Mw 6 and a
Mw 9, between an inland impact and one in the open ocean.

## Highlights

- Five event types (impact, explosion, earthquake, volcano, submarine
  landslide) plus multi-event cascading on a shared timeline.
- 20 historical presets, each cited to its primary source: Chicxulub,
  Tunguska, Chelyabinsk, Hiroshima, Nagasaki, Castle Bravo, Tsar Bomba,
  Beirut 2020, Tōhoku 2011, Sumatra 2004, Lisbon 1755, Northridge,
  Krakatau 1883, Anak Krakatau 2018, Mount St Helens, Tambora,
  Pinatubo, Storegga, Lituya Bay, and more.
- Bathymetric tsunami propagation with Fast-Marching arrival isochrones
  and a Green's-law amplitude heatmap on the same grid.
- Population-exposure overlay (WorldPop COG via geotiff.js, range
  requests, no backend).
- Monte-Carlo P10/P90 confidence rings around the nominal damage circles.
- Cesium globe with damage rings drawn at true geographic scale.
- WCAG 2.1 AA, full keyboard navigation, English + Italian.
- Every scenario state is in the URL — share a link, get the same sim.

## Running it

The fastest path is the bundled launcher. Install Node 20 LTS and:

- **Windows** — double-click `nimbus.cmd`.
- **macOS / Linux** — `./nimbus.sh`.

It checks the Node version, enables Corepack, runs `pnpm install` on
first launch, then starts the dev server on http://localhost:5173.

If you'd rather drive pnpm yourself:

```sh
corepack enable
pnpm install
pnpm dev
```

Other useful scripts:

```sh
pnpm typecheck       # tsc --noEmit
pnpm lint            # eslint, zero warnings
pnpm test            # vitest run
pnpm test:e2e        # playwright across 5 browser/device profiles
pnpm build           # production bundle
pnpm simulate        # headless CLI: JSON snapshot for any event
```

The `pnpm simulate` CLI is useful when you want to validate a formula
without touching the browser.

## Stack

React 19, TypeScript 5.7 (strict, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`), Vite 6, Cesium 1.x with OpenStreetMap
imagery (no Ion token), Zustand, TanStack Router, react-i18next, Radix
UI, Comlink for the physics worker, geotiff.js for the population
raster, AWS Terrarium tiles for bathymetry. Tests: Vitest and
Playwright. Quality gates: ESLint flat config, Prettier, Husky,
Conventional Commits, DCO sign-off.

## Architecture in one paragraph

Four layers, dependency-checked: a React UI on top, a Cesium/R3F
rendering layer below it, a pure-TypeScript physics engine under that,
and the static scientific data and assets at the bottom. The physics
layer is forbidden from importing React, Cesium, Three or any DOM API
— ESLint blocks it. That's what lets `pnpm simulate` run the same code
from the command line as the browser worker. Full discussion in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Documentation

- [docs/SCIENCE.md](docs/SCIENCE.md) — bibliography, formula rules, validation tolerances.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — the four-layer structure and why.
- [docs/ART_DIRECTION.md](docs/ART_DIRECTION.md) — visual language, palette, asset policy.
- [docs/ROADMAP.md](docs/ROADMAP.md) — milestones and what's left for v1.0.
- [docs/QUICKSTART.md](docs/QUICKSTART.md) — launcher subcommands.
- [docs/ASSETS.md](docs/ASSETS.md) — third-party assets and their licences.

## Contributing

Scientific corrections are the most welcome kind of contribution. The
workflow, the DCO sign-off, the branch naming, and the CC0-only asset
policy are documented in [CONTRIBUTING.md](CONTRIBUTING.md). Read the
[Code of Conduct](CODE_OF_CONDUCT.md) before you engage. Security
reports go through [SECURITY.md](SECURITY.md).

## Licence

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

Globe imagery: © OpenStreetMap contributors, ODbL 1.0. Bathymetry: AWS
Terrain Tiles (CC0). Population: WorldPop (Tatem 2017). Bundled fonts:
Inter and JetBrains Mono via `@fontsource` (OFL 1.1). Full inventory in
[docs/ASSETS.md](docs/ASSETS.md).
