# Bug classification taxonomy

Every defect found in Nimbus is classified into ONE of these 9 categories so we can spot patterns and direct V&V effort.

| Code         | Category                     | Symptom                                                                 | Where caught                                            |
| ------------ | ---------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------- |
| **D-FORM**   | Defect — formula             | wrong equation, wrong constant, wrong exponent                          | unit tests, peer-reviewed citation check                |
| **D-IMPL**   | Defect — implementation      | correct formula coded wrong (sign flip, off-by-one, wrong arg)          | unit tests + property tests                             |
| **D-NUM**    | Defect — numerical stability | NaN/Inf on valid input, divergence near zero, catastrophic cancellation | property + edge-case tests                              |
| **D-UNIT**   | Defect — unit conversion     | metres vs km, deg vs rad, Mt vs J, raw `as number` cast on branded type | invariant tests                                         |
| **D-INPUT**  | Defect — input validation    | NaN/Inf passes, negative passes where forbidden, defaults not applied   | `customInput.invariants.test.ts`                        |
| **D-CRS**    | Defect — coordinate / CRS    | lat/lon swap, antimeridian wrap missing, EPSG mismatch                  | `geometry.crs.test.ts`                                  |
| **D-GEOM**   | Defect — geometry derivation | bbox wrong, polygon orientation wrong, ring not closed, area wrong sign | `geometry.crs.test.ts`                                  |
| **D-RENDER** | Defect — rendering           | calculated geometry ≠ rendered geometry (offset/mirror/scale/clipping)  | E2E + bbox isomorphism check                            |
| **D-GAP**    | Test gap                     | bug existed in production but no test failed                            | `regressionRegistry.test.ts` (the bug becomes the test) |

## Application to the 10 known historical bugs

| #   | Commit                                                            | Code             | One-line root cause                                                                                             |
| --- | ----------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | [216b6d2](https://github.com/anred88-stack/Nimbus/commit/216b6d2) | D-FORM + D-INPUT | `cavityRadius = 2·η₀` wrong dimensionally for slope failures; `sourceWaterDepth` not separable from shelf depth |
| 2   | [88fd964](https://github.com/anred88-stack/Nimbus/commit/88fd964) | D-FORM           | `V^(1/3)` cavity under-counts elongated slumps (Storegga 290×100 km footprint)                                  |
| 3   | [2b06388](https://github.com/anred88-stack/Nimbus/commit/2b06388) | D-FORM           | open-ocean Watts spreading wrong physics for confined basin (Vaiont reservoir)                                  |
| 4   | [854edd4](https://github.com/anred88-stack/Nimbus/commit/854edd4) | D-IMPL           | Chyba single-strength criterion ignores Krinov 1966 pre-existing fractures in iron meteorites                   |
| 5   | [3b50967](https://github.com/anred88-stack/Nimbus/commit/3b50967) | D-FORM           | Strasser 2010 median fit saturates above Mw 9.0 (Sumatra outlier)                                               |
| 6   | [467f74a](https://github.com/anred88-stack/Nimbus/commit/467f74a) | D-FORM + D-IMPL  | aspect ratio 2 (Strasser) under-counts vs Hayes 2017 finite-fault 2.5; coupling 0.9 was a hack to compensate    |
| 7   | [b75a35e](https://github.com/anred88-stack/Nimbus/commit/b75a35e) | D-RENDER         | Schultz-Gault Mw 10 displayed as headline above Teanby-Wookey Mw 7 (UI ordering)                                |
| 8   | [d164395](https://github.com/anred88-stack/Nimbus/commit/d164395) | D-FORM           | Crawford-Mader exponential never reaches 0; missing hard cutoff for full water-column disruption                |
| 9   | [0ec0fda](https://github.com/anred88-stack/Nimbus/commit/0ec0fda) | D-INPUT          | scaled-HOB gate alone lets 50 Mt × 500 m HOB through as "SURFACE", inflating tsunami source by 100×             |

**Pattern recognition** from this set:

- 5 of 9 bugs are **D-FORM** (formula didn't match observation envelope) → priority: pin every preset against citation
- 2 of 9 are **D-INPUT** (gate too permissive) → priority: tighten custom-input invariant tests
- 1 D-RENDER, 1 D-IMPL, 0 D-NUM, 0 D-UNIT, 0 D-CRS, 0 D-GEOM
- The 0-counts are NOT proof of absence; they're proof of test gaps. Hence priority: add D-CRS, D-GEOM, D-UNIT property tests in this PR.

## Filing protocol

When a new bug is found:

1. Reproduce with `pnpm simulate ...` (record exact command in `BUG_REGISTRY.md`)
2. Classify with one code above
3. Add a test in `regressionRegistry.test.ts` that fails on the buggy code
4. Fix the code
5. Test now passes; commit with `fix(physics|ui): <code> — <one line>`
