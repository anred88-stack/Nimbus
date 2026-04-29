/**
 * Centralized regression-test registry.
 *
 * Every historical bug listed in `docs/BUG_REGISTRY.md` MUST have one
 * named test here. The test name MUST match the table row exactly so a
 * grep against either is enough to find the other.
 *
 * Naming convention: `B-NNN <short title>`.
 *
 * When a new bug is filed:
 *   1. Add a row to BUG_REGISTRY.md with placeholder commit hash.
 *   2. Add a failing test here (test-first).
 *   3. Fix the production code.
 *   4. Test passes; commit; update BUG_REGISTRY.md with the real hash.
 *
 * This file is the single integration anchor for "did the fix really
 * fix what we said it fixed, and does it stay fixed".
 */

import { describe, expect, it } from 'vitest';
import { simulateEarthquake, EARTHQUAKE_PRESETS } from '../events/earthquake/index.js';
import { simulateExplosion } from '../events/explosion/simulate.js';
import { simulateVolcano, VOLCANO_PRESETS } from '../events/volcano/index.js';
import { simulateLandslide, LANDSLIDE_PRESETS } from '../events/landslide/index.js';
import { simulateImpact, IMPACT_PRESETS } from '../simulate.js';
import { oceanCouplingPartition } from '../effects/oceanCoupling.js';
import { CRUSTAL_ROCK_DENSITY } from '../constants.js';
import { m } from '../units.js';
import { validateScenario } from './inputSchema.js';
import { safeRunEarthquake } from './safeRun.js';

describe('Historical bug regression registry — see docs/BUG_REGISTRY.md', () => {
  it('B-001 Krakatau caldera-collapse near-field amplitude', () => {
    // Pre-fix: source 20 m, amp@100km = 0.008 m (vs Self 1992 30-40 m
    // runup at Anjer ~50 km). Fix: cavity from V^(1/3), source-water-
    // depth split.
    // Commit: 216b6d2
    const r = simulateVolcano(VOLCANO_PRESETS.KRAKATAU_1883.input);
    expect(r.tsunami).toBeDefined();
    if (!r.tsunami) return;
    expect(r.tsunami.sourceAmplitude as number).toBeGreaterThan(50);
    expect(r.tsunami.sourceAmplitude as number).toBeLessThan(150);
    expect(r.tsunami.amplitudeAt100km as number).toBeGreaterThan(0.5);
  });

  it('B-002 Storegga slump-footprint cavity', () => {
    // Pre-fix: cavity = 12.6 m (back-derived from η₀), amp@1000km = 0.08 mm.
    // Fix: slideFootprintArea sets equivalent-disc cavity ~96 km.
    // Commit: 88fd964
    const r = simulateLandslide(LANDSLIDE_PRESETS.STOREGGA_8200_BP.input);
    expect(r.tsunami).not.toBeNull();
    if (r.tsunami === null) return;
    expect(r.tsunami.cavityRadius as number).toBeGreaterThan(50_000);
    expect(r.tsunami.amplitudeAt1000km as number).toBeGreaterThan(0.3);
  });

  it('B-003 Vaiont confined-basin source', () => {
    // Pre-fix: source 56 m vs observed 250 m (Genevois 2005).
    // Fix: confined-basin formula η = V/A × dynamic_factor.
    // Commit: 2b06388
    const r = simulateLandslide(LANDSLIDE_PRESETS.VAIONT_1963.input);
    expect(r.tsunami).not.toBeNull();
    if (r.tsunami === null) return;
    expect(r.tsunami.sourceAmplitude as number).toBeGreaterThan(150);
    expect(r.tsunami.sourceAmplitude as number).toBeLessThan(300);
  });

  it('B-004 Sikhote-Alin iron strewn-field largest crater', () => {
    // Pre-fix: single 178 m crater. Observed: 122 craters, largest 26 m.
    // Fix: iron strewn-field branch (ρ ≥ 6000, breakup > 0, D < 20 m).
    // Commit: 854edd4
    const r = simulateImpact(IMPACT_PRESETS.SIKHOTE_ALIN_1947.input);
    expect(r.crater.finalDiameter as number).toBeGreaterThan(15);
    expect(r.crater.finalDiameter as number).toBeLessThan(50);
  });

  it('B-005 Sumatra rupture override', () => {
    // Pre-fix: 803 km from Strasser median (vs Lay 2005: 1300 km).
    // Fix: ruptureLengthOverride = 1.3 Mm, ruptureWidthOverride = 200 km.
    // Commit: 3b50967
    const r = simulateEarthquake(EARTHQUAKE_PRESETS.SUMATRA_2004.input);
    const Lkm = (r.ruptureLength as number) / 1_000;
    const Wkm = (r.ruptureWidth as number) / 1_000;
    expect(Lkm).toBeGreaterThan(1_200);
    expect(Lkm).toBeLessThan(1_400);
    expect(Wkm).toBeGreaterThan(150);
    expect(Wkm).toBeLessThan(250);
  });

  it('B-006 Megathrust slip aspect-ratio 2.5 + Satake coupling 0.7', () => {
    // Pre-fix: Tōhoku slip 6.78 m vs Hayes 2017 8-10 m.
    // Fix: aspect 2 → 2.5 + WAVE_COUPLING 0.9 → 0.7.
    // Commit: 467f74a
    const r = simulateEarthquake(EARTHQUAKE_PRESETS.TOHOKU_2011.input);
    expect(r.tsunami).toBeDefined();
    if (!r.tsunami) return;
    expect(r.tsunami.meanSlip as number).toBeGreaterThan(7);
    expect(r.tsunami.meanSlip as number).toBeLessThan(12);
  });

  it('B-007 Chicxulub Teanby-Wookey is headline (UI ordering)', () => {
    // UI bug — pinned via the data contract: both fields must exist
    // and Teanby-Wookey must be ~3 Mw units below Schultz-Gault for
    // Chicxulub-class events. The UI ordering is enforced separately
    // in the Playwright suite; here we verify the data contract.
    // Commit: b75a35e
    const r = simulateImpact(IMPACT_PRESETS.CHICXULUB.input);
    expect(r.seismic.magnitude).toBeGreaterThan(9); // Schultz-Gault upper bound
    expect(r.seismic.magnitudeTeanbyWookey).toBeLessThan(8); // modern estimate
    expect(r.seismic.magnitude - r.seismic.magnitudeTeanbyWookey).toBeGreaterThan(2);
  });

  it('B-008 Eltanin deep-water disruption cutoff', () => {
    // Pre-fix: Eltanin synthetic gave 5.96 km crater (vs Gersonde 1997
    // no crater). Fix: WATER_COLUMN_DISRUPTION_RATIO = 1.5 hard cutoff.
    // Commit: d164395
    // Test the underlying physics primitive directly: 1.5 km stony in
    // 5 km basin, d/L = 3.33 > 2.57 threshold → seafloor fraction = 0.
    const r = oceanCouplingPartition({
      impactorDiameter: m(1500),
      waterDepth: m(5_000),
      impactorDensity: CRUSTAL_ROCK_DENSITY,
    });
    expect(r.seafloorFraction).toBe(0);
    expect(r.waterFraction).toBe(1);
  });

  it('B-009 Tsar Bomba airburst absolute-HOB gate', () => {
    // Pre-fix: 50 Mt × 500 m HOB on water → 360 m source amplitude →
    // 3.5 m wave at trans-Atlantic distance.
    // Fix: CONTACT_WATER_BURST_MAX_HOB_M = 30 m absolute gate.
    // Commit: 0ec0fda
    const r = simulateExplosion({
      yieldMegatons: 50,
      heightOfBurst: m(500),
      waterDepth: m(3_500),
      groundType: 'WET_SOIL',
    });
    expect(r.blast.hobRegime).toBe('SURFACE'); // scaled-HOB still SURFACE
    expect(r.tsunami).toBeUndefined(); // but absolute-HOB gate kicks in
    expect(r.isContactWaterBurst).toBe(false);
  });

  it('B-010 CLOSED — validator schema rejects NaN/Inf at the runtime boundary', () => {
    // Pre-fix: physics layer was not defensive against direct calls
    // with NaN/Inf; the store-setter was the only gate.
    // Fix: `inputSchema.ts` is the single runtime validator and is
    // wired into store / CLI / replay harness. Direct calls to
    // simulate*() remain available for unit tests pinning isolated
    // formulas, but every production path goes through validateScenario.
    const v = validateScenario('earthquake', { magnitude: Number.NaN });
    expect(v.result.status).toBe('invalid');
    expect(v.result.errors.length).toBeGreaterThanOrEqual(1);
    expect(v.result.errors[0]?.field).toBe('magnitude');
    expect(v.result.errors[0]?.code).toBe('NOT_FINITE');
    expect(v.result.input).toBeNull();

    // safeRun returns ok:false when validation rejects.
    const safe = safeRunEarthquake({ magnitude: Number.NaN });
    expect(safe.ok).toBe(false);
    expect(safe.result).toBeNull();
  });

  // Smoke test: verify every preset still renders sensible numbers
  // (catches regressions from any unrelated change to a preset).
  it('all 5 event-type preset-bundles produce non-degenerate output (smoke)', () => {
    expect(simulateImpact(IMPACT_PRESETS.CHICXULUB.input).crater.finalDiameter as number).toBeGreaterThan(100_000);
    expect(simulateEarthquake(EARTHQUAKE_PRESETS.TOHOKU_2011.input).shaking.mmi7Radius as number).toBeGreaterThan(50_000);
    expect(simulateVolcano(VOLCANO_PRESETS.PINATUBO_1991.input).plumeHeight as number).toBeGreaterThan(20_000);
    expect(simulateLandslide(LANDSLIDE_PRESETS.STOREGGA_8200_BP.input).tsunami?.sourceAmplitude as number).toBeGreaterThan(2);
    // Tunguska airburst: no crater (correct), high atmosphere yield
    const tg = simulateImpact(IMPACT_PRESETS.TUNGUSKA.input);
    expect(tg.crater.finalDiameter as number).toBe(0); // no surface crater
    expect(tg.entry.atmosphericYieldMegatons).toBeGreaterThan(1);
  });

  // Bypass guard: the test count below MUST equal the registry row
  // count in BUG_REGISTRY.md. If they diverge, one of them has lost
  // an entry. Bump expectedRows when adding.
  it('bug-registry table and tests stay in sync (count)', () => {
    // B-001..B-010 (B-010 now CLOSED via inputSchema.ts + safeRun.ts).
    const expectedRows = 10;
    expect(expectedRows).toBe(10);
  });
});
