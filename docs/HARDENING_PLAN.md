# Nimbus hardening plan

Actionable list of gaps left after the consolidation batch. Each entry
has an owner-friendly proposal, the file(s) affected, and an estimated
effort tier (S = ≤1 hour, M = 1-4 hours, L = ≥4 hours / multi-PR).

The current state is intentionally captured in `CONSOLIDATION_AUDIT.md`
(boundaries) and `VALIDATION_REPORT.md` (live status). This plan is
forward-looking only.

## H1 — Fold inline guards in store setters into the validator [M]

**Problem.** `set*Input` helpers in `src/store/useAppStore.ts` apply
inline `if (override > 0)` checks BEFORE calling `auditStoreInput`.
The validator therefore never observes individual rejected fields
(L1 in `CONSOLIDATION_AUDIT.md`). Behavior is correct (silent drop is
the design) but observability is degraded.

**Action.**
1. Replace each `set*Input` body with a single pattern:
   ```ts
   const merged = mergeOverrides(state.<event>.input, overrides);
   const v = validateScenario('<event>', merged);
   if (v.result.status === 'invalid') {
     console.warn('[store] rejected:', v.result.errors);
     return state; // no-op
   }
   return { ...stateReset, <event>: { preset: 'CUSTOM', input: v.result.input } };
   ```
2. Drop the inline `> 0` / `>= 0` guards (the validator covers them).
3. Update `useAppStore.test.ts` if any test relied on silent partial drops.

**Files**: `src/store/useAppStore.ts`, `src/store/useAppStore.test.ts`.

## H2 — Validate nested fields (flankCollapse, etc.) [S]

**Problem.** The volcano `flankCollapse` block carries
`{ volumeM3, slopeAngleDeg, meanOceanDepth, sourceWaterDepth }` but
the schema treats it as `unknown`. A NaN inside `flankCollapse` would
not be caught.

**Action.** Add a `validateFlankCollapse(raw)` helper called from
`validateVolcanoInput` when `raw.flankCollapse !== undefined`.
Errors get the field path `flankCollapse.<name>`.

**Files**: `src/physics/validation/inputSchema.ts`,
`src/physics/validation/customInput.invariants.test.ts` (add a case).

## H3 — Property-based generation with fast-check (or a thin shim) [M]

**Problem.** Today's "property tests" iterate hand-picked sample
points (`monotonicity.property.test.ts`). Real property-based testing
shrinks counterexamples and explores the boundary; this batch
deliberately avoided adding a dependency.

**Action.** Add `fast-check` as a dev dependency. Convert two of the
existing monotonicity tests (yield → blast radius, Mw → seismic
moment) into proper `fc.property` tests with `fc.double` arbitraries
filtered to the valid domain. Keep the rest as deterministic sweeps.

**Files**: `package.json` (devDep), one new
`monotonicity.fc.test.ts` next to the current sample-based file.

## H4 — Auto-capture replay fixtures from the running app [M]

**Problem.** The user spotted B-009 by manually running a scenario in
the browser. Turning that into a fixture required hand-writing JSON.

**Action.** Add a "Capture as fixture" button in dev mode that
serializes the current scenario input + result + a hash and prompts
the user to download a JSON file ready to drop into `replayFixtures/`.
The fixture-integrity test already validates the structure.

**Files**: `src/ui/components/SimulatorPanel.tsx`,
`src/physics/validation/replayCapture.ts` (new helper).

## H5 — CRS / antimeridian regression suite for global isochrones [L]

**Problem.** `geometry.crs.test.ts` covers the rupture-stadium
polygon; the bathymetric tsunami pipeline emits global isochrones
that wrap the antimeridian and are NOT pinned by any data-side test.
A trans-Pacific scenario could render correctly but have wrong bbox.

**Action.** Two-phase:
1. Synthesize a fake bathymetric grid covering the date line, run
   `computeBathymetricTsunami` headlessly, and assert that emitted
   isochrones either split at lon=180° or have explicit
   `bboxCrossesAntimeridian: true` metadata.
2. Add a Playwright test that loads a Tōhoku-class scenario and
   compares the rendered isochrone GeoJSON against the calculated
   polygons.

**Files**: `src/physics/tsunami/bathymetricTsunami.test.ts` (extend),
`tests/e2e/antimeridian.spec.ts` (new).

## H6 — UI-component validation surface [M]

**Problem.** `EarthquakeCustomInputs.tsx` and siblings re-implement
`Number.isFinite() && > 0` checks inline. They should consume the
same schema rules as the store / replay path so the user sees the
same error messages everywhere.

**Action.** Wrap each input control with a validator-driven helper
that surfaces `errors` and `warnings` for the bound field. The
schema already returns `{ field, code, message }` tuples; just plumb
them into the per-field UI state.

**Files**: `src/ui/components/EarthquakeCustomInputs.tsx`,
`ExplosionCustomInputs.tsx`, `VolcanoCustomInputs.tsx`, etc.

## H7 — Strict-mode CI integration [S]

**Problem.** `pnpm validation-report` exits 0 unless replay/golden
tests fail; the strict mode is a runtime flag but nothing currently
enforces it in CI.

**Action.** Add a CI step:
```yaml
- run: pnpm validation-report --mode=strict
- run: pnpm test
- run: pnpm typecheck
- run: pnpm lint
```
in `.github/workflows/ci.yml` (or wherever the existing CI lives;
discoverable via `gh workflow list`).

## H8 — Coverage of ground-types and impactor-strength variants [S]

**Problem.** The golden dataset has no entry for cometary impactors
(ρ ≈ 600 kg/m³), no normal-fault earthquake, no STRATOSPHERIC
explosion regime. These regimes exist in the model but lack a
"reference" anchor.

**Action.** Add 3 cases:
- `G-CHELYABINSK-AIRBURST` (cometary-class, COMPLETE_AIRBURST)
- `G-LAQUILA-NORMAL` (Mw 6.3 normal-fault, MMI VII envelope)
- `G-STARFISH-HEMP` (50 Mt, HOB > 100 km, HEMP regime — already in
  GOLDEN_CASES.md but not in the executable dataset)

**Files**: `src/physics/validation/goldenDataset.ts`.

## H9 — Versioning the schema [S]

**Problem.** Replay fixtures will become incompatible as the schema
evolves. Today there's no version field.

**Action.** Add `schemaVersion: 1` to `ValidationResult` and to every
fixture / golden case JSON. Bump on any breaking change to codes /
states. The fixture-integrity test verifies the version matches the
current `INPUT_SCHEMA_VERSION` constant.

**Files**: `src/physics/validation/inputSchema.ts`, every
`replayFixtures/*.json`, `goldenDataset.ts`,
`replayFixtureIntegrity.test.ts`.

## H10 — Geometry → rendering equivalence [L]

**Problem.** `geometry.crs.test.ts` pins data-side correctness but
nothing verifies that the bbox calculated for a Cesium overlay equals
the bbox actually drawn (D-RENDER class in `BUG_CLASSIFICATION.md`).
Today this is implicit in Playwright screenshots — fragile.

**Action.** Add a structured assertion in Globe.tsx test harness:
- After every overlay update, expose `lastRenderedBbox`,
  `lastRenderedCentroid`, `lastRenderedFeatureCount` on a debug
  global (gated by `import.meta.env.DEV`).
- Playwright reads those globals via `page.evaluate` and asserts
  they match the calculated values from the headless `simulate*`
  outputs.

**Files**: `src/scene/globe/Globe.tsx`, new
`tests/e2e/geometry-rendering-equivalence.spec.ts`.

## Release-gate criteria for the next milestone

Adopt the following in addition to the strict default of
`pnpm validation-report`:

- All H1–H4 closed before tagging M8.
- H5–H7 closed before tagging M8.5.
- H8–H10 closed before tagging M9.
- New scenarios opened by users must land as replay fixtures within
  the same week they're reported.

## Out of scope (explicit non-goals for this hardening cycle)

- Re-running every GeoClaw fixture at finer grid resolution. The
  current factor-3-5 per-source-class tolerance is honest given
  Nimbus is a 1D-radial model.
- Building a new 2D propagation engine in the browser worker.
- Adding ML-based bug detection.
- Replacing Zustand with a different state library.

These would each be major efforts and are not justified by current
data.
