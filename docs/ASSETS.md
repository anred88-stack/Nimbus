# Assets inventory

Every binary or creative asset shipped in `public/` is listed here
with author, licence, source URL, and the date it was added. **No
asset is added without a row in this file.**

## Licence policy

- **Models, textures, HDRIs** — CC0 only.
- **Icons, SVGs** — MIT or CC0.
- **Fonts** — OFL or similar, served via `@fontsource` (bundled).
- **No logos, trademarks, or copyrighted architectural likenesses**
  unless an explicit licence is documented.

A CC-BY (or similar attribution-required) asset may occasionally be
warranted. If so, the attribution must appear both here and in the
in-app credits surface (`footer.credits` key in
`src/i18n/locales/*.json`).

## Inventory

### Fonts

| Name           | Version | Licence | Source                             | Added      |
| -------------- | ------- | ------- | ---------------------------------- | ---------- |
| Inter          | 4.0+    | OFL-1.1 | https://rsms.me/inter/             | 2026-04-22 |
| JetBrains Mono | 2.304+  | OFL-1.1 | https://www.jetbrains.com/lp/mono/ | 2026-04-22 |

Delivered via `@fontsource/inter` and `@fontsource/jetbrains-mono`.
Bundled by Vite, no external CDN at runtime.

### 3D models

| File         | Subject | Author | Licence | Source URL | Added |
| ------------ | ------- | ------ | ------- | ---------- | ----- |
| _(none yet)_ |         |        |         |            |       |

The Stage scene (now retired from the rendering path but still in
the codebase as `src/scene/stage/`) composed scale landmarks from
Three.js primitives — no external asset files. CC0 swaps tracked as
post-v1.0 work:

- Human: a CC0 "everyperson" mesh from Sketchfab. Target ≤ 2 kTris.
- Tower: a CC0 low-poly skyscraper, ≤ 8 kTris.
- HDRI: a Poly Haven 1K dusk/sunset exterior HDRI, applied via
  `@react-three/drei` `<Environment>`.

### Textures & HDRIs

| File         | Subject | Author | Licence | Source URL | Added |
| ------------ | ------- | ------ | ------- | ---------- | ----- |
| _(none yet)_ |         |        |         |            |       |

### LUTs / colour grading

| File         | Purpose | Author | Licence | Source URL | Added |
| ------------ | ------- | ------ | ------- | ---------- | ----- |
| _(none yet)_ |         |        |         |            |       |

### Icons & SVGs

| File                 | Purpose      | Author  | Licence | Source URL | Added      |
| -------------------- | ------------ | ------- | ------- | ---------- | ---------- |
| `public/favicon.svg` | Site favicon | Project | MIT     | in-house   | 2026-04-22 |

### Network services

| Service                    | Purpose                      | Licence / terms                         | Source URL                                           | Added      |
| -------------------------- | ---------------------------- | --------------------------------------- | ---------------------------------------------------- | ---------- |
| OpenStreetMap raster tiles | Globe imagery in `Globe.tsx` | ODbL 1.0 — attribution + usage policy   | https://operations.osmfoundation.org/policies/tiles/ | 2026-04-23 |
| AWS Terrain Tiles          | Bathymetry / DEM samples     | CC0                                     | https://registry.opendata.aws/terrain-tiles/         | 2026-04-23 |
| WorldPop 2020 1 km mosaic  | Population exposure (COG)    | CC-BY-4.0 (academic, attribution req'd) | https://www.worldpop.org/                            | 2026-04-23 |

OSM usage-policy compliance:

- Attribution `© OpenStreetMap contributors` is shown in the Cesium
  credit overlay (wired via `UrlTemplateImageryProvider.credit`).
- Requests carry the browser default `User-Agent`; no bulk
  downloading or `z ≥ 20` requests.
- Tiles aren't cached or redistributed beyond the session.
- For higher-traffic deploys we plan to migrate to a commercial tile
  provider or self-hosted renderer; OSM direct-serve is for the
  open-source preview.

## Adding a new asset

1. Drop the file into the appropriate `public/` subfolder.
2. Add a row to the relevant table with author, licence, source URL,
   today's date.
3. If the source has no stable licence URL, also include a screenshot
   under `docs/references/<asset>-licence.png`.
4. Open the PR — reviewers check both the file and the row.

## In-app attribution

The `footer.credits` translation key currently reads:

> Inspired by MetaBallStudios · Assets from Poly Haven and Sketchfab CC0 · Science from peer-reviewed literature

When a CC-BY asset is added, append its attribution to this line in
both `en.json` and `it.json`.
