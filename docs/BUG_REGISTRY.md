# Bug registry

Centralized index of every defect found in production. Each entry has:
- ID (`B-NNN`)
- Category (`D-FORM`/`D-IMPL`/`D-NUM`/`D-UNIT`/`D-INPUT`/`D-CRS`/`D-GEOM`/`D-RENDER`/`D-GAP` per `BUG_CLASSIFICATION.md`)
- Reproducer command (when reproducible via `pnpm simulate`)
- Permanent test (`regressionRegistry.test.ts:<test-name>`)
- Fix commit

When a new bug is found, add a row here AND a test in `regressionRegistry.test.ts` BEFORE fixing the code.

## Index

| ID | Category | Title | Reproducer | Test name | Fix |
|----|----------|-------|------------|-----------|-----|
| B-001 | D-FORM + D-INPUT | Krakatau 1883 caldera tsunami source 20 m, far-field 0.0008 m | `pnpm simulate --event=volcano --preset=KRAKATAU_1883` | `B-001 Krakatau caldera-collapse near-field amplitude` | [216b6d2](https://github.com/anred88-stack/Nimbus/commit/216b6d2) |
| B-002 | D-FORM | Storegga submarine landslide far-field amplitude < 0.1 mm at 1000 km | n/a (landslide preset) | `B-002 Storegga slump-footprint cavity` | [88fd964](https://github.com/anred88-stack/Nimbus/commit/88fd964) |
| B-003 | D-FORM | Vaiont 1963 reservoir wave 56 m vs 250 m observed | n/a (landslide preset) | `B-003 Vaiont confined-basin source` | [2b06388](https://github.com/anred88-stack/Nimbus/commit/2b06388) |
| B-004 | D-IMPL | Sikhote-Alin 1947 single 178 m crater vs observed 26 m largest in strewn field | `pnpm simulate --event=impact --preset=SIKHOTE_ALIN_1947` | `B-004 Sikhote-Alin iron strewn-field largest crater` | [854edd4](https://github.com/anred88-stack/Nimbus/commit/854edd4) |
| B-005 | D-FORM | Sumatra 2004 rupture length 803 km vs 1300 km observed | n/a (earthquake preset) | `B-005 Sumatra rupture override` | [3b50967](https://github.com/anred88-stack/Nimbus/commit/3b50967) |
| B-006 | D-FORM + D-IMPL | Tōhoku 2011 mean slip 6.78 m vs Hayes 2017 8-10 m | n/a (earthquake preset) | `B-006 Megathrust slip aspect-ratio 2.5` | [467f74a](https://github.com/anred88-stack/Nimbus/commit/467f74a) |
| B-007 | D-RENDER | Chicxulub Schultz-Gault Mw 10.2 displayed as headline above Teanby-Wookey 7.3 | UI inspection only | `B-007 Chicxulub Teanby-Wookey is headline (UI ordering)` | [b75a35e](https://github.com/anred88-stack/Nimbus/commit/b75a35e) |
| B-008 | D-FORM | Eltanin 5.96 km synthetic crater vs Gersonde 1997 no-crater | n/a (test fixture only) | `B-008 Eltanin deep-water disruption cutoff` | [d164395](https://github.com/anred88-stack/Nimbus/commit/d164395) |
| B-009 | D-INPUT | Tsar Bomba 50 Mt × 500 m HOB → 3.5 m wave at trans-Atlantic distance | `pnpm simulate --event=explosion --preset=TSAR_BOMBA_1961 --hob=500 --water-depth=3500` | `B-009 Tsar Bomba airburst absolute-HOB gate` | [0ec0fda](https://github.com/anred88-stack/Nimbus/commit/0ec0fda) |

## How a new bug enters this registry

1. **Reproduce** the bug via `pnpm simulate ...` if possible. Record the exact command.
2. **Classify** with one of the 9 codes in `BUG_CLASSIFICATION.md`.
3. **Add a row to the table above** with a placeholder commit hash like `pending`.
4. **Add a failing test** in `src/physics/validation/regressionRegistry.test.ts` with the same name as the table.
5. **Fix the code** until the test passes.
6. **Update the row** with the real commit hash.

The test name and table row are the single source of truth — they must match exactly so a reader can search either way.
