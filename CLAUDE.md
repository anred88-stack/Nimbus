# CLAUDE.md

Read this in full at the start of every Claude Code session.

## Project brief

**VIS — Visual Impact Software** is an open-source, browser-based
popular-science simulator of catastrophic events on a 3D Earth globe.
Audience: the scientifically curious, students, educators, journalists,
documentary makers. Events covered (M1+):

- Cosmic impacts (asteroids, meteorites, comets)
- Explosions (conventional and nuclear; airburst and groundburst)
- Earthquakes (magnitude, depth, fault type)
- Volcanic eruptions (VEI 1–8; plume and pyroclastic)
- Tsunamis (impact-, seismic-, submarine-landslide-driven)
- Submarine landslides (flank collapse, sturzstrom)

What sets it apart from NUKEMAP and neal.fun's Asteroid Launcher:

1. **Multi-event cascading.** An ocean impact spawns tsunami, shock,
   and thermal pulse on a shared timeline.
2. **Real formulas.** Validated against peer-reviewed references
   (Collins/Melosh/Marcus 2005, Glasstone & Dolan 1977, Ward &
   Asphaug 2000, Mastin 2009, USGS ShakeMap).
3. **Rigour with popular-science accessibility.** Every number is
   tooltip-cited to a source. Product-grade UI, not a technical
   dashboard.
4. **True geographic scale.** Damage footprints render at real radii
   on the globe, not artistic exaggeration.
5. **Internationalised and accessible.** WCAG AA, keyboard
   navigation, IT + EN from day one, mobile-first.
6. **Shareable URLs.** Every scenario state serialises into the URL.

## Tech stack

| Area            | Choice                                                                                       |
| --------------- | -------------------------------------------------------------------------------------------- |
| Framework       | React 19 + TypeScript 5.7 strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Bundler         | Vite 6                                                                                       |
| Runtime         | Node 20 LTS                                                                                  |
| Package manager | pnpm 9 (via Corepack)                                                                        |
| Globe rendering | Cesium 1.x (M2+)                                                                             |
| State           | Zustand                                                                                      |
| Routing & URL   | TanStack Router                                                                              |
| i18n            | `react-i18next`, IT + EN                                                                     |
| Accessibility   | Radix UI primitives                                                                          |
| Physics         | Pure TypeScript, zero runtime deps, Web Worker via Comlink                                   |
| Testing         | Vitest (unit), Playwright (E2E), Storybook (component isolation)                             |
| Lint / format   | ESLint flat + `typescript-eslint` strict-type-checked, Prettier, Husky, lint-staged          |
| Versioning      | Changesets + Conventional Commits                                                            |
| CI/CD           | GitHub Actions + Cloudflare Pages                                                            |
| Analytics       | Plausible                                                                                    |

## 4-layer architecture (immutable)

```
┌─────────────────────────────────────────────┐
│ Layer 4 — UI / Controls (React)             │
│ src/ui/                                     │
└─────────────────────────────────────────────┘
                    ↕ Zustand store
┌─────────────────────────────────────────────┐
│ Layer 3 — Rendering (Cesium globe)          │
│ src/scene/globe/                            │
│ Reads from the engine; does NOT compute.    │
└─────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────┐
│ Layer 2 — Physics engine (pure TS, headless)│
│ src/physics/                                │
│ Zero deps on cesium / three / react.        │
│ Testable from the Node CLI.                 │
└─────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────┐
│ Layer 1 — Scientific data & assets          │
│ src/data/, public/models/, public/luts/     │
└─────────────────────────────────────────────┘
```

**Iron rule.** Layer 2 (`src/physics/**`) never imports `cesium`,
`three`, `@react-three/*`, `react`, or `react-dom`. ESLint
(`no-restricted-imports` in `eslint.config.js`) enforces it.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Visual style

Single render mode: **Globe** — Cesium photorealistic Earth. The user
picks the event point; multi-event damage zones render as 2D markers
at true geographic scale. The R3F "Stage" comparison scene was
removed (see `docs/ART_DIRECTION.md`); all physics paths it exercised
are preserved and a future cinematic mode can reuse them.

## Code conventions

- **Branded types.** Physics functions take and return branded
  primitives (`Kilograms`, `Joules`, `Meters`, …) from
  `src/physics/units.ts`. No raw `number` across physics boundaries.
- **JSDoc with citation.** Every physics function implementing a
  formula carries a JSDoc block citing the paper — authors, year,
  short title, DOI/URL, and the equation number used.
- **No `any`.** `@typescript-eslint/no-explicit-any` is `error`.
  Use `unknown` + narrowing, or model the type properly.
- **No `@ts-ignore` or `@ts-expect-error`** without an issue link in
  the comment.
- **`import type` for type-only imports.** `consistent-type-imports`
  is `error`.
- **No magic numbers in physics code.** Constants live in
  `src/physics/constants.ts` with a source line. Inline literals are
  reserved for dimensionless coefficients lifted from a specific
  equation, with the equation number in the comment.
- **Determinism.** Same input → same output. No `Math.random()` in
  formulas. Accept an explicit seed if stochasticity is genuinely
  needed.

## Commands

```sh
pnpm dev                   # Vite dev server, http://localhost:5173
pnpm build                 # typecheck + production bundle
pnpm preview               # serve the production bundle locally
pnpm typecheck             # tsc --noEmit
pnpm lint                  # eslint . --max-warnings 0
pnpm lint:fix              # eslint . --fix
pnpm format                # prettier --write .
pnpm format:check          # prettier --check .
pnpm test                  # vitest run
pnpm test:watch            # vitest
pnpm test:ui               # vitest --ui
pnpm test:e2e              # playwright test
pnpm storybook             # storybook dev -p 6006
```

## Git workflow

- **Branch prefixes**: `feat/`, `fix/`, `chore/`, `docs/`,
  `refactor/`, `test/`, `ci/`.
- **Conventional Commits.**
- **DCO sign-off.** Every commit signed off (`git commit -s`). No CLA.
- **No direct pushes to `main`.** PR with passing CI and at least one
  approving review.
- **Changeset.** Any user-facing change requires a changeset
  (`pnpm changeset`).

## Review rules

- Every physics formula has a unit test verifying output against a
  known published value (±5% by default; widen and document if the
  source has wider uncertainty).
- PRs touching `src/physics/**` are reviewed by a scientifically
  literate reviewer.
- PRs adding assets must include the licence screenshot or a
  `docs/ASSETS.md` entry with the CC0 / CC-BY source URL.
- No skipped tests without a linked GitHub issue.

## Documents

- [README.md](README.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [SECURITY.md](SECURITY.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/SCIENCE.md](docs/SCIENCE.md)
- [docs/ART_DIRECTION.md](docs/ART_DIRECTION.md)
- [docs/ROADMAP.md](docs/ROADMAP.md)
- [docs/ASSETS.md](docs/ASSETS.md)

## Don't

- Import `cesium`, `three`, `@react-three/*`, `react`, or `react-dom`
  from `src/physics/**`. ESLint blocks it; don't work around with
  `eslint-disable`.
- Put physics math inside a React component. Formulas belong in
  `src/physics/`; components read pre-computed values from the
  store.
- Use `any`. Use `unknown` + narrowing.
- Add an asset to `public/` without documenting it in
  `docs/ASSETS.md` (author, licence, source URL, date).
- Replace a physics-derived damage radius with a hand-picked artistic
  value. Every visible number traces back to a formula.
- Skip a test without a GitHub issue link.
- Commit without `-s`.

## Current milestone

**M7 — v1.0 release.** Machinery ready, human steps pending.

M0 → M6 are feature-complete. M7 is shipping the release artefacts
and automation; the remainder is human curation listed in
`docs/RELEASE_CHECKLIST.md`.

What's in `main` today:

- Five event types (impact, explosion, earthquake, volcano,
  submarine landslide) with 20 historical presets cited to
  peer-reviewed papers.
- Cesium globe with damage rings at true geographic scale, Radix
  Dialog + Tooltip for About / Glossary / citations.
- URL-serialisable scenario state, Copy-link button.
- 595+ unit tests, 85 Playwright E2E tests across Chromium,
  Firefox, WebKit, Pixel 7, iPhone 14. `@axe-core/playwright` and
  Lighthouse CI enforce `accessibility = 1.0`.
- Headless `pnpm simulate` CLI for any event type. Comlink worker
  wraps the same physics in the browser.
- `CHANGELOG.md`, `docs/ANNOUNCEMENT.md`,
  `docs/RELEASE_CHECKLIST.md`, `.github/workflows/release.yml` —
  `git tag -s v1.0.0 && git push --tags` triggers verify → publish
  end-to-end.

Remaining for v1.0: substitute the real copyright holder (`TBD`) and
contact addresses (`conduct@example.com`, `security@example.com`),
set `VITE_PLAUSIBLE_DOMAIN` in production, do a real-device QA pass
on iOS / Android, polish the announcement copy. See
[docs/ROADMAP.md](docs/ROADMAP.md) and
[docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).

## Outstanding TODOs (human)

Project identity is resolved: **VIS** (display) / **Visual Impact
Software** (long form) / **vis** (technical) — repo
**anred88-stack/Impact**. Remaining placeholders before public
release:

- `TBD` — `LICENSE`, `NOTICE` (copyright holder).
- `conduct@example.com`, `security@example.com` — `CODE_OF_CONDUCT.md`,
  `SECURITY.md`.
- `PROJECT_TAGLINE` is currently: "Simulate catastrophic events on an
  interactive 3D globe."

Update this section once substituted.
