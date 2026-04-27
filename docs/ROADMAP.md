# Roadmap

Eight milestones from empty repo to a multi-event simulator. Every
milestone has a single exit criterion that can be checked from a fresh
clone.

---

## M0 — Setup _(complete)_

A deployable "coming soon" landing page with the full project
scaffolding: configs, docs, workflows. No physics, no 3D yet.

- Vite 6 + React 19 + TypeScript 5.7 strict.
- ESLint flat config, Prettier, Husky, lint-staged.
- Vitest split into `physics` (Node) and `ui` (jsdom). Playwright
  scaffold.
- i18n (IT + EN) wired from the first render.
- Zustand and TanStack Router installed (not yet wired).
- Branded units and core constants in `src/physics/{units,constants}.ts`,
  unit-tested.
- ESLint Layer-2 import guard (`no-restricted-imports`) in place.
- Landing page: hero, features, language switch, scale-bar decorative
  element, footer. Skip link, single H1, keyboard reachable.
- CI on Node 20: typecheck + lint + format:check + test + build +
  Playwright.
- Cloudflare Pages preview on every PR, production on `main`.

**Exit:** `pnpm install && pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`
all pass on a fresh clone. Landing renders correctly at 375 / 768 / 1440. IT ↔ EN toggle works. Lighthouse a11y ≥ 95. CI green on `main`.

---

## M1 — Physics engine foundations _(complete)_

Headless TypeScript physics for impacts and explosions, callable from
a Node CLI.

- Collins/Melosh/Marcus 2005 — energy, crater, seismic magnitude.
- Glasstone & Dolan 1977 — overpressure, thermal flux, cratering.
- Pike 1980 — depth-to-diameter ratio for complex craters.
- Comlink Web-Worker wrapper.
- Deterministic.
- Storybook scaffold (no components yet).

**Exit:** every formula has a test that reproduces a published value
(Chicxulub energy, Tunguska TNT-equivalent, Hiroshima 5 psi at 1 km)
within tolerance. `node scripts/simulate-impact.ts` prints a JSON
snapshot for a Chicxulub-class event.

---

## M2 — Globe + Stage rendering _(complete)_

Cesium globe and the MBS-inspired Stage scene, both reading from the
same Zustand store.

- Cesium 1.x globe with OSM imagery (no Ion token), click-to-pick,
  four damage rings.
- R3F Stage with dusk-warm scene, ground plane, 1.7 m human and
  381 m tower landmarks, scale bar.
- ~1.5 s black-crossfade Globe ↔ Stage, collapses under
  `prefers-reduced-motion`.
- Radix Dialog (About) and Tooltip (citations).

**Exit:** pick a point on the globe → simulate → crossfade into the
Stage scene at the right scale for the event radius. No console
warnings. 60 fps on a mid-tier laptop.

**Status:** feature-complete through Block 8. The Stage path was later
retired (see [docs/ART_DIRECTION.md](ART_DIRECTION.md)); the physics
paths it exercised remain.

---

## M3 — Earthquakes, tsunamis, volcanoes _(complete)_

Remaining event types and the cascade.

- Earthquakes: USGS ShakeMap attenuation; magnitude, depth, fault
  type.
- Tsunamis: Ward & Asphaug 2000 (impact), classical long-wave
  propagation (seismic, submarine landslide).
- Volcanic eruptions: Mastin 2009 plume height, pyroclastic runout.
- Cascade: an ocean impact emits crater energy, tsunami, and thermal
  pulse on a single timeline.

**Exit:** a Krakatau-scale eruption reproduces plume height and ash
radius within tolerance. A Chicxulub-class ocean impact cascades into
a plausible megatsunami without a special case.

---

## M4 — URL-serialisable state _(complete)_

Every scenario state is a URL. Copy, share, replay.

- Compact, versioned URL schema (TanStack Router search params).
- "Copy link" button.
- OG image generator deferred to post-v1.0.

**Exit:** opening a shared URL on another device reproduces the same
simulation pixel-for-pixel modulo device-specific canvas rendering.

---

## M5 — Cross-browser, mobile, a11y, performance _(complete)_

Make it work everywhere.

- Playwright matrix: Chromium, Firefox, WebKit, Pixel 7, iPhone 14.
  85 tests × 5 projects.
- `@axe-core/playwright` sweeps WCAG 2.1 AA on landing (IT + EN),
  globe mode, About, Glossary.
- Lighthouse CI: accessibility = 1.0, LCP warning at 3000 ms, TBT
  warning at 500 ms.

**Exit:** Lighthouse a11y = 100 on every primary view. All Playwright
projects green. Real-device smoke on iOS Safari and Android Chrome.

**Status:** the real-device pass is still pending a human run; the
emulated suite is green.

---

## M6 — Content, tooltips, scientific provenance _(complete)_

Make it a teaching tool.

- Tooltip on every numeric readout, with formula and source citation.
- In-app glossary for terms like "overpressure", "VEI", "runup".
- Preset gallery (Chicxulub, Tunguska, Krakatau 1883, Tōhoku 2011,
  Hiroshima, Tsar Bomba, …).
- Translator pass on IT + EN.

**Exit:** every preset renders without TODO strings. Every tooltip
cites a real paper. A non-technical reviewer can explain each number
in their own words.

---

## M7 — v1.0 release _(machinery in place; awaiting curation)_

Polish, QA, ship.

- `CHANGELOG.md` covers every milestone; the `[Unreleased]` section
  tracks the v1.0 blockers.
- `src/analytics.ts` opt-in Plausible tracker, DNT-aware, silent in
  dev.
- `docs/ANNOUNCEMENT.md` short / medium / long-form launch copy.
- `docs/RELEASE_CHECKLIST.md` seven-section pre-flight (identity, CI,
  analytics, content, science, mechanics, first-24h).
- `.github/workflows/release.yml` signed-tag-triggered release that
  reruns every quality gate.

**Exit:** `v1.0.0` ships a green CI build, a production deploy, and a
landing page that links to the announcement. Zero open P0 bugs.

**Status:** automation ready; `git tag -s v1.0.0 && git push origin
v1.0.0` runs the full pipeline. The blockers are all human work
(copyright holder, real contact addresses, Plausible domain,
announcement polish, scientific sign-off) and live in
[docs/RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). The OG-image worker
is deferred.
