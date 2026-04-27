# Architecture

Four layers, dependency-checked. The rules in this file are
load-bearing — break them and you break testability.

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 4  React UI                                           │
│ src/ui/                                                     │
└─────────────────────────────────────────────────────────────┘
                        ↕ Zustand selectors
┌─────────────────────────────────────────────────────────────┐
│ Layer 3  Rendering (Cesium globe, R3F stage)                │
│ src/scene/                                                  │
│ Reads simulation data; does NOT compute physics.            │
└─────────────────────────────────────────────────────────────┘
                        ↕
┌─────────────────────────────────────────────────────────────┐
│ Layer 2  Physics engine (pure TypeScript)                   │
│ src/physics/                                                │
│ Zero dependencies on React, Three, Cesium or any DOM API.   │
│ Runs in a Web Worker and from the Node CLI unchanged.       │
└─────────────────────────────────────────────────────────────┘
                        ↕
┌─────────────────────────────────────────────────────────────┐
│ Layer 1  Scientific data & assets                           │
│ src/data/, public/models/, public/luts/                     │
└─────────────────────────────────────────────────────────────┘
```

## Why four layers

Three things that have to hold simultaneously:

1. **Scientific correctness.** Physics has to be testable from a
   headless Node CLI in CI. Formulas inside React components would
   re-run on every render and entangle themselves with UI state, and
   could not be tested precisely.
2. **Cinematic visuals.** The rendering layer must be free to do
   shaders, postprocessing and non-physical camera moves without
   polluting the physics.
3. **Shareable URLs.** State has to be small, serialisable, and
   authoritative. It lives in the store, not the DOM.

## Layer 2 iron rule (ESLint-enforced)

`src/physics/**` cannot import:

- `react`, `react-dom`
- `three`, `@react-three/*`
- `cesium`
- any DOM or Web API (no `window`, `document`, `fetch`,
  `localStorage`, `performance.now()` — clocks are injected).

`eslint.config.js` enforces this with `no-restricted-imports`. Don't
disable it.

## Data flow

Input → simulation:

1. UI control fires `store.actions.simulate(params)`.
2. The action posts `params` to the Comlink-wrapped Web Worker.
3. The worker computes pure functions and returns a typed
   `SimulationResult`.
4. The action writes the result into the store.

Simulation → render:

5. `src/scene/globe/` subscribes to the relevant slices via
   selectors, translates simulation units into scene units.
6. `src/ui/` subscribes to display-friendly selectors (formatted
   strings, localised numbers). Never to raw physics directly —
   formatting goes through a thin adapter.

## Branded types

See [src/physics/units.ts](../src/physics/units.ts). Physics functions
take and return branded primitives (`Kilograms`, `Joules`, …). The
compiler rejects raw `number` at every physics boundary, so unit
confusion is unrepresentable instead of merely "checked in review".

## Determinism

No `Math.random()` in `src/physics/**`. If a formula needs a random
draw (ensemble earthquake slip), it accepts an explicit seed and uses
a seeded PRNG. Same input → same output. That's what makes the
shareable URLs (M4) and the tests both meaningful.

## Store

A single Zustand store, sliced by concern:

- `inputSlice` — user-chosen parameters.
- `simulationSlice` — last `SimulationResult`, status, timestamp.
- `viewSlice` — camera state, mode, UI toggles.
- `i18nSlice` — current language and (future) unit system.

The store contains state, not math. Actions are thin wrappers around
the physics worker.

## Testing

- `src/physics/` — Vitest Node project, one test per formula against
  a published value.
- `src/ui/`, `src/store/` — Vitest jsdom project.
- `tests/e2e/` — Playwright, end-to-end through the full stack.
- Storybook for component isolation and visual regression.

## Folder map

```
src/
  data/         typed scientific records
  i18n/         i18next bootstrap + locale JSONs
  physics/      formulas, constants, units (Layer 2)
  scene/
    globe/      Cesium (Layer 3)
    stage/      R3F (Layer 3, retired path kept for cinematic mode)
  store/        Zustand (between 2 and 4)
  styles/       global CSS tokens
  ui/           React components, pages, layouts (Layer 4)
```

## Dependencies that may not leak

- Cesium → physics: no.
- Three → physics: no.
- React → physics: no.
- Physics → DOM or Node-only APIs: no (must run in a Worker).
- Physics → i18n: no. Physics returns numbers; the UI formats them.

If you need to break a rule, open an issue first. Architecture drift
is the largest risk to a project like this; we trade a little
convenience for a lot of testability.
