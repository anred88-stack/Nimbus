# Nimbus validation report

_Generated: 2026-04-30T09:44:56.739Z_

This report is produced by `pnpm validation-report`. Do not edit by
hand. Re-run after every change to the V&V suite to refresh.

A machine-readable summary (same data, no Markdown) is also emitted
to `docs/VALIDATION_REPORT.json` for CI consumption.

## Release gate

| Mode | Decision | Exit code |
|------|----------|-----------|
| **strict** | PASS | 0 |




**Policy:**

- `strict` (default for CI): any replay or golden failure blocks the
  release. Suspicious-but-valid scenarios (S3) are reported but do
  NOT block — they're explicit accept-with-flag.
- `advisory`: only structural failures of the harness block; replay
  and golden assertions are downgraded to warnings. Use when
  iterating on a branch.

Switch via `pnpm validation-report --mode=advisory` or
`VALIDATION_MODE=advisory`.

## Verification vs validation

- **Verification** (does the code do what we said it does?) is the
  static unit-test layer: `customInput.invariants`,
  `monotonicity.property`, `geometry.crs`, `regressionRegistry`,
  plus per-formula tests scattered alongside each module.
- **Validation** (does the code reproduce real-world observation?) is
  what this report measures: replay fixtures + executable golden
  dataset, both routed through the centralized `inputSchema.ts` and
  the `safeRun*()` wrappers (the same path UI / store / CLI use).

## Replay fixtures

| Total | Passed | Failed |
|-------|--------|--------|
| 3 | 3 | 0 |

**By category:**

| Category | Count |
|----------|-------|
| edge | 1 |
| reference | 1 |
| regression | 1 |

**By validation status:**

| Status | Count |
|--------|-------|
| accepted | 2 |
| normalized | 0 |
| suspicious | 0 |
| invalid | 1 |

**Top error codes:**

| Code | Count |
|------|-------|
| NOT_FINITE | 1 |

### Replay failures

All passed.


## Golden dataset

| Total | Passed | Failed |
|-------|--------|--------|
| 12 | 12 | 0 |

**By category:**

| Category | Count |
|----------|-------|
| custom-user | 1 |
| edge | 2 |
| physical-sanity | 1 |
| reference | 6 |
| regression | 2 |

**By validation status:**

| Status | Count |
|--------|-------|
| accepted | 9 |
| normalized | 0 |
| suspicious | 1 |
| invalid | 2 |

**Top error codes:**

| Code | Count |
|------|-------|
| NOT_FINITE | 1 |
| ZERO_FORBIDDEN | 1 |

**Top warning codes:**

| Code | Count |
|------|-------|
| PHYS_SUSPICIOUS_HIGH | 1 |

### Golden case failures

All passed.


## Remaining gaps (manually curated)

- 7 GeoClaw fixture probes are below the AMR base-grid noise floor (< 1 cm) and run as `it.skip` in `geoclawComparison.test.ts`. See `BUG_REGISTRY.md` "skipped" notes — these are sub-grid sources, not regressions.
- Closed-form / 1D-radial Saint-Venant amplitude predictions for elongated megathrusts have factor-3 scatter vs 2D AMR GeoClaw (per `DEFAULT_TOLERANCE_BY_TYPE` in `scripts/geoclaw/run_scenario.py`). Pinning tighter would require a 2D propagation engine in the browser worker.
- The bathymetric tsunami pipeline is not directly exercised by the replay harness — it depends on async ETOPO grid fetches that are not part of the synchronous `safeRun*()` path. E2E coverage lives in `tests/e2e/`.
- Custom-user GeoClaw fixtures cover only 8 parameter-grid samples per source class (3 seismic, 2 volcanic, 2 landslide, 1 impact). Adding more is a fixed-cost compute job; see `docs/GEOCLAW_SETUP.md`.

## Scenarios covered

- **Reference / scaling** (peer-reviewed observation envelope): 6 golden cases
- **Regression** (linked to BUG_REGISTRY rows): 2 golden cases + 1 replay fixtures
- **Custom-user** (user-input archetype): 1 golden cases
- **Edge** (validator stress): 2 golden cases + 1 replay fixtures
- **Physical-sanity** (S3 plausibility warnings): 1 golden cases

## Scenarios still untrusted

- Volcanic flank-collapse with explicit `flankCollapse` nested input (validator does not yet recurse into the nested object).
- Earthquake aftershocks pipeline (deterministic but not pinned by replay fixtures).
- Population-exposure pipeline (depends on disabled WorldPop COG).
- Atmospheric Comlink worker round-trip (covered by store smoke tests, not by harness).

## How to add a fixture

1. Drop a JSON file into `src/physics/validation/replayFixtures/` matching the `ReplayFixture` shape.
2. `pnpm test src/physics/validation/replay` will pick it up automatically.
3. `pnpm validation-report` will include it in the next regenerated report.

## How to add a golden case

1. Append an entry to `GOLDEN_DATASET` in `src/physics/validation/goldenDataset.ts`.
2. Append the corresponding row to `docs/GOLDEN_CASES.md`.
3. Re-run the test suite + this report.
