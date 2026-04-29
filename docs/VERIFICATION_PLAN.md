# Nimbus V&V plan

Target: verify formulas, numerics, units, geometry and rendering — with custom user inputs as a first-class risk surface.

## Six invariant categories (I1–I6)

| ID | Category | Owns | Test file |
|----|----------|------|-----------|
| **I1** | Syntactic validity | NaN/Inf reject, mandatory fields, type-correct | `customInput.invariants.test.ts` |
| **I2** | Normalization | azimuth wrap [0,360), lon wrap [-180,180), lat clamp [-90,90] | `customInput.invariants.test.ts` |
| **I3** | Unit coherence | branded types respected, m vs km, deg vs rad, Mt vs J | `customInput.invariants.test.ts` |
| **I4** | Physical plausibility | yield > 0, density ∈ [600, 8000], Mw ∈ [0, 10], etc. | `customInput.invariants.test.ts` + `monotonicity.property.test.ts` |
| **I5** | Geometric coherence | finite positive radii, bbox correct, antimeridian RFC 7946 | `geometry.crs.test.ts` |
| **I6** | Rendering coherence | bbox calculated == bbox passed to globe; geometry isomorphic | `geometry.crs.test.ts` (data-side); E2E for visual |

## Four severity levels (S1–S4)

| ID | Severity | Behavior | Where logged |
|----|----------|----------|--------------|
| **S1** | BLOCKING error | input rejected, no simulation runs | store setter or throws |
| **S2** | NORMALIZATION warning | input accepted after silent normalization (azimuth wrap, etc.) | console.warn (dev) |
| **S3** | PHYSICAL PLAUSIBILITY warning | input accepted but flagged as out-of-typical (e.g., Mw 11) | result `_warnings` array (proposed) |
| **S4** | ACCEPTED | input simulated as-is, no warning | nothing |

Test must explicitly assert which severity applies. Pattern:
```ts
expect(setterResult.severity).toBe('S1' | 'S2' | 'S3' | 'S4');
```

## Tolerance discipline

| Domain | Tolerance | Justification |
|--------|-----------|---------------|
| Pure math (analytic) | ±5% | Synolakis 1987 lab data scatter |
| Engineering scaling laws (Wells-Coppersmith, Strasser, Hanks-Kanamori) | ±20% | Original regression scatter |
| 2D AMR vs closed-form (GeoClaw fixtures) | factor 3-5 per source class | `DEFAULT_TOLERANCE_BY_TYPE` in `scripts/geoclaw/run_scenario.py` |
| Geometry (haversine, bbox) | ±0.1% on Earth-scale (km) | Float64 round-off + WGS84 ellipsoid eccentricity ignored |
| Snapshot (rendering) | exact equality on structured data | only relax with documented reason |

Centralized: `src/physics/validation/tolerances.ts` (created in this PR).

## Replay harness

`pnpm simulate` (`scripts/simulate-impact.ts`) is the canonical CLI. Every bug becomes:
1. A reproducer command in `BUG_REGISTRY.md` (e.g. `pnpm simulate --event=explosion --yield=50 --hob=500 --water-depth=3500`)
2. A permanent test in `regressionRegistry.test.ts` exercising the same code path
3. A short "Why this fails" comment

## Test files

Verification (runtime-pure, formula-level):
- `customInput.invariants.test.ts` — I1–I4 for all 5 event types via store setters + simulate*()
- `monotonicity.property.test.ts` — I4 monotonicity invariants, multi-quantity, randomized inputs
- `geometry.crs.test.ts` — I5/I6 lat-lon, antimeridian, bbox
- `regressionRegistry.test.ts` — historical bugs as named tests, indexed by `BUG_REGISTRY.md`

Validation (real-world scenarios end-to-end through `safeRun*`):
- `replay.test.ts` + `replayFixtures/*.json` — drop-in fixture corpus
- `goldenDataset.test.ts` + `goldenDataset.ts` — executable canonical cases
- `crossEntrypoint.equivalence.test.ts` — schema vs safeRun vs replay-harness on shared input matrix
- `validationCodes.stability.test.ts` — pin canonical error/warning code set
- `replayFixtureIntegrity.test.ts` — JSON structure / naming / orphan checks
- `goldenDataset.consistency.test.ts` — uniqueness / coverage / linkedBug invariants

Shared:
- `tolerances.ts` — centralized tolerance constants

## What this plan deliberately does NOT cover (out of scope this PR)

- E2E rendering screenshots (existing Playwright suite covers this; we add data-side bbox checks here)
- New physics formulas
- UI input validation refactor (we test the existing behavior; bugs found get filed)
- WorldPop / external API mocking (already handled gracefully by population disable)

## Acceptance for "test added"

Each new test must:
1. State the invariant being checked (in test name or `// I3:` comment)
2. State the severity expected
3. Use centralized tolerance (no inline magic numbers)
4. Fail with a message that explains the bug, not just `expected X to equal Y`
5. Not be conditionally skipped without an issue link
