import { describe, expect, it } from 'vitest';
import { CHONDRITIC_DENSITY, IRON_METEORITE_DENSITY } from '../constants.js';
import { kgPerM3, m as meters } from '../units.js';
import { oceanCouplingPartition, WATER_COLUMN_COUPLING_BETA } from './oceanCoupling.js';

describe('oceanCouplingPartition (Crawford-Mader 1998 / Gisler 2011)', () => {
  it('returns full seafloor coupling for land impacts (waterDepth = 0)', () => {
    const r = oceanCouplingPartition({
      impactorDiameter: meters(15_000),
      waterDepth: meters(0),
      impactorDensity: CHONDRITIC_DENSITY,
    });
    expect(r.seafloorFraction).toBe(1);
    expect(r.waterFraction).toBe(0);
  });

  it('partitions sum to 1 by construction', () => {
    for (const dWater of [10, 100, 1_000, 4_000, 10_000]) {
      const r = oceanCouplingPartition({
        impactorDiameter: meters(1_000),
        waterDepth: meters(dWater),
        impactorDensity: CHONDRITIC_DENSITY,
      });
      expect(r.seafloorFraction + r.waterFraction).toBeCloseTo(1, 12);
    }
  });

  it('Chicxulub on a 100 m carbonate shelf: f_seafloor ≈ 0.99 (crater intact)', () => {
    // L = 15 km, ρ_i = 3000, d_water = 100 m
    // d_critical = 0.5 · 15 000 · √(3000/1025) ≈ 12 832 m
    // f_seafloor = exp(-100 / 12 832) ≈ 0.992
    const r = oceanCouplingPartition({
      impactorDiameter: meters(15_000),
      waterDepth: meters(100),
      impactorDensity: CHONDRITIC_DENSITY,
    });
    expect(r.seafloorFraction).toBeGreaterThan(0.99);
    expect(r.seafloorFraction).toBeLessThan(1);
    expect((r.characteristicDepth as number) / 1_000).toBeGreaterThan(12);
    expect((r.characteristicDepth as number) / 1_000).toBeLessThan(14);
  });

  it('1 km stony asteroid in 4 km open ocean: f_water ≫ f_seafloor (Gisler regime)', () => {
    // d_critical ≈ 856 m, d_water/d_critical ≈ 4.67 → f_seafloor ≈ 0.009
    const r = oceanCouplingPartition({
      impactorDiameter: meters(1_000),
      waterDepth: meters(4_000),
      impactorDensity: CHONDRITIC_DENSITY,
    });
    expect(r.seafloorFraction).toBeLessThan(0.05);
    expect(r.waterFraction).toBeGreaterThan(0.95);
  });

  it('Eltanin regime (1 km, 5 km Pacific deep ocean): seafloor crater suppressed', () => {
    // d_critical ≈ 856 m, d_water/d_critical ≈ 5.84 → f_seafloor ≈ 0.003
    // Matches the Eltanin geological record (no observable crater
    // despite a 1-4 km asteroid; Gersonde et al. 1997).
    const r = oceanCouplingPartition({
      impactorDiameter: meters(1_000),
      waterDepth: meters(5_000),
      impactorDensity: CHONDRITIC_DENSITY,
    });
    expect(r.seafloorFraction).toBeLessThan(0.01);
  });

  it('iron-density bodies penetrate proportionally deeper water columns', () => {
    // Compare 200 m bodies in 200 m water — both stay below the
    // deep-water disruption cutoff (d/L = 1, threshold ≈ 4 for iron,
    // 2.6 for stony) so Crawford-Mader applies for both. Iron has
    // √(ρ_i/ρ_water) ≈ 2.76 vs ≈ 1.71 for stony, so its
    // characteristic absorption depth is ~60 % larger and its
    // seafloor coupling correspondingly higher.
    const stony = oceanCouplingPartition({
      impactorDiameter: meters(200),
      waterDepth: meters(200),
      impactorDensity: CHONDRITIC_DENSITY,
    });
    const iron = oceanCouplingPartition({
      impactorDiameter: meters(200),
      waterDepth: meters(200),
      impactorDensity: IRON_METEORITE_DENSITY,
    });
    expect(
      (iron.characteristicDepth as number) / (stony.characteristicDepth as number)
    ).toBeCloseTo(Math.sqrt(IRON_METEORITE_DENSITY / CHONDRITIC_DENSITY), 6);
    expect(iron.seafloorFraction).toBeGreaterThan(stony.seafloorFraction);
  });

  it('seafloorFraction decreases monotonically with water depth (with hard cutoff to 0 in deep water)', () => {
    // With audit fix #8 the deep-water disruption cutoff sets
    // f_seafloor = 0 once d_water > 1.5 · L · √(ρ_i/ρ_w). For the
    // 1 km stony body this kicks in at d_water ≈ 2570 m. The
    // sequence below transitions through that boundary; both regimes
    // are strictly monotone (Crawford-Mader exponential, then a
    // single step to 0, then 0 again).
    let last = 1;
    for (const dWater of [10, 100, 500, 1_000, 2_000, 5_000, 10_000]) {
      const r = oceanCouplingPartition({
        impactorDiameter: meters(1_000),
        waterDepth: meters(dWater),
        impactorDensity: CHONDRITIC_DENSITY,
      });
      expect(r.seafloorFraction).toBeLessThanOrEqual(last);
      last = r.seafloorFraction;
    }
    // Last few entries are in the disruption regime → exactly 0.
    expect(last).toBe(0);
  });

  it('seafloorFraction increases monotonically with impactor diameter (large enough to clear cutoff)', () => {
    // Below the disruption threshold (~2.57 km diameter for stony in
    // 4 km water) the cutoff is active and f_seafloor = 0. Above it
    // Crawford-Mader's exponential takes over and grows with L. The
    // sequence below stays in the Crawford-Mader regime throughout
    // (smallest L = 3 km gives d/L = 1.33 < 2.57) so we get strict
    // monotonic growth.
    let last = 0;
    for (const L of [3_000, 5_000, 8_000, 12_000, 20_000]) {
      const r = oceanCouplingPartition({
        impactorDiameter: meters(L),
        waterDepth: meters(4_000),
        impactorDensity: CHONDRITIC_DENSITY,
      });
      expect(r.seafloorFraction).toBeGreaterThan(last);
      last = r.seafloorFraction;
    }
  });

  it('deep-water disruption cutoff: 1.5 km stony in 5 km basin gives f_seafloor = 0 (Eltanin synthetic)', () => {
    // d/L = 3.33, threshold 1.5·√(3000/1025) = 2.57 → cutoff active.
    // Pre-fix Crawford-Mader gave 0.020 → 5.8 km Schultz-Pike crater,
    // contradicting Gersonde 1997 (Nature 390:357).
    const r = oceanCouplingPartition({
      impactorDiameter: meters(1_500),
      waterDepth: meters(5_000),
      impactorDensity: CHONDRITIC_DENSITY,
    });
    expect(r.seafloorFraction).toBe(0);
    expect(r.waterFraction).toBe(1);
  });

  it('handles defensive edge cases without throwing', () => {
    expect(
      oceanCouplingPartition({
        impactorDiameter: meters(0),
        waterDepth: meters(1_000),
        impactorDensity: CHONDRITIC_DENSITY,
      }).seafloorFraction
    ).toBe(1);
    expect(
      oceanCouplingPartition({
        impactorDiameter: meters(-1),
        waterDepth: meters(1_000),
        impactorDensity: CHONDRITIC_DENSITY,
      }).seafloorFraction
    ).toBe(1);
    expect(
      oceanCouplingPartition({
        impactorDiameter: meters(1_000),
        waterDepth: meters(-100),
        impactorDensity: CHONDRITIC_DENSITY,
      }).seafloorFraction
    ).toBe(1);
  });

  it('β coefficient is the calibrated Crawford-Mader 1998 value', () => {
    expect(WATER_COLUMN_COUPLING_BETA).toBe(0.5);
  });

  it('honours an explicit waterDensity override (lake / brackish water)', () => {
    // Hypothetical fresh-water lake (ρ_w = 1000 vs default 1025): the
    // density ratio ρ_i/ρ_water increases by ~2.5 %, so d_critical
    // grows by √(1.025) ≈ 1.012 and seafloorFraction nudges up.
    const sea = oceanCouplingPartition({
      impactorDiameter: meters(1_000),
      waterDepth: meters(2_000),
      impactorDensity: CHONDRITIC_DENSITY,
    });
    const lake = oceanCouplingPartition({
      impactorDiameter: meters(1_000),
      waterDepth: meters(2_000),
      impactorDensity: CHONDRITIC_DENSITY,
      waterDensity: kgPerM3(1_000),
    });
    expect(lake.seafloorFraction).toBeGreaterThan(sea.seafloorFraction);
  });
});
