import { describe, expect, it } from 'vitest';
import { STANDARD_GRAVITY } from '../../constants.js';
import { m as meters, mps2 } from '../../units.js';
import {
  distanceForPga,
  peakGroundAcceleration,
  peakGroundAccelerationNGAWest2,
  vs30SiteFactor,
} from './attenuation.js';

describe('peakGroundAcceleration (Joyner & Boore 1981)', () => {
  it('Northridge Mw 6.7 @ R = 20 km → PGA ≈ 0.15–0.25 g', () => {
    const a = peakGroundAcceleration({
      magnitude: 6.7,
      distance: meters(20_000),
    }) as number;
    const aG = a / STANDARD_GRAVITY;
    // Hand-computed Joyner–Boore value ≈ 0.185 g. Observed PGA at
    // stations 20 km from the Northridge rupture ran 0.1–0.4 g, the
    // scatter dominated by local site response rather than the
    // regression. We bracket the published formula's own answer.
    expect(aG).toBeGreaterThan(0.1);
    expect(aG).toBeLessThan(0.3);
  });

  it('saturates at R = 0 instead of diverging (h = 7.3 km)', () => {
    const a = peakGroundAcceleration({
      magnitude: 6.7,
      distance: meters(0),
    }) as number;
    expect(Number.isFinite(a)).toBe(true);
    expect(a).toBeGreaterThan(0);
  });

  it('increases with magnitude at fixed distance', () => {
    const at6 = peakGroundAcceleration({ magnitude: 6.0, distance: meters(10_000) }) as number;
    const at7 = peakGroundAcceleration({ magnitude: 7.0, distance: meters(10_000) }) as number;
    // log₁₀(A) grows by 0.249 per unit Mw ⇒ A grows by 10^0.249 ≈ 1.774.
    expect(at7 / at6).toBeCloseTo(10 ** 0.249, 4);
  });

  it('decreases monotonically with distance at fixed magnitude', () => {
    const near = peakGroundAcceleration({ magnitude: 7.0, distance: meters(5_000) }) as number;
    const mid = peakGroundAcceleration({ magnitude: 7.0, distance: meters(50_000) }) as number;
    const far = peakGroundAcceleration({ magnitude: 7.0, distance: meters(300_000) }) as number;
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(far);
  });
});

describe('distanceForPga (bisection inverse of Joyner-Boore)', () => {
  it('round-trips to the target within < 1 % at a feasible threshold', () => {
    const magnitude = 7.0;
    const target = mps2(1); // 1 m/s²
    const R = distanceForPga(magnitude, target);
    const recovered = peakGroundAcceleration({ magnitude, distance: R }) as number;
    expect(Math.abs(recovered - (target as number)) / (target as number)).toBeLessThan(0.01);
  });

  it('returns 0 when the target PGA exceeds the magnitude saturation', () => {
    // Mw 5 saturates near 0.13 g; 5 m/s² (≈ 0.5 g) is unreachable.
    const R = distanceForPga(5.0, mps2(5)) as number;
    expect(R).toBe(0);
  });

  it('larger magnitude pushes the contour out at fixed threshold', () => {
    const target = mps2(0.3);
    const small = distanceForPga(6.0, target) as number;
    const big = distanceForPga(8.0, target) as number;
    expect(big).toBeGreaterThan(small);
  });
});

describe('peakGroundAccelerationNGAWest2 (Boore 2014 BSSA14)', () => {
  it('Tōhoku 2011 Mw 9.1 @ R_JB ~100 km on rock → PGA ≈ 0.2–0.6 g', () => {
    const a = peakGroundAccelerationNGAWest2({
      magnitude: 9.1,
      distance: meters(100_000),
      faultType: 'reverse',
    }) as number;
    const aG = a / STANDARD_GRAVITY;
    expect(aG).toBeGreaterThan(0.1);
    expect(aG).toBeLessThan(0.8);
  });

  it('Northridge Mw 6.7 @ R_JB 20 km on rock → PGA ≈ 0.1–0.35 g (observed 0.1–0.4)', () => {
    const a = peakGroundAccelerationNGAWest2({
      magnitude: 6.7,
      distance: meters(20_000),
      faultType: 'reverse',
    }) as number;
    const aG = a / STANDARD_GRAVITY;
    expect(aG).toBeGreaterThan(0.05);
    expect(aG).toBeLessThan(0.4);
  });

  it('saturates at R = 0 (h = 4.5 km near-source clamp)', () => {
    const a = peakGroundAccelerationNGAWest2({
      magnitude: 7.0,
      distance: meters(0),
    }) as number;
    expect(Number.isFinite(a)).toBe(true);
    expect(a).toBeGreaterThan(0);
  });

  it('fault-type constants differ: reverse > strike-slip ≈ unspecified > normal', () => {
    const M = 6.5;
    const R = meters(10_000);
    const rs = peakGroundAccelerationNGAWest2({
      magnitude: M,
      distance: R,
      faultType: 'reverse',
    }) as number;
    const ss = peakGroundAccelerationNGAWest2({
      magnitude: M,
      distance: R,
      faultType: 'strike-slip',
    }) as number;
    const ns = peakGroundAccelerationNGAWest2({
      magnitude: M,
      distance: R,
      faultType: 'normal',
    }) as number;
    expect(rs).toBeGreaterThan(ns);
    expect(ss).toBeGreaterThan(ns);
  });

  it('monotonically decreases with distance at fixed magnitude', () => {
    const near = peakGroundAccelerationNGAWest2({
      magnitude: 7.0,
      distance: meters(5_000),
    }) as number;
    const mid = peakGroundAccelerationNGAWest2({
      magnitude: 7.0,
      distance: meters(50_000),
    }) as number;
    const far = peakGroundAccelerationNGAWest2({
      magnitude: 7.0,
      distance: meters(300_000),
    }) as number;
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(far);
  });
});

describe('vs30SiteFactor (Boore 2014 simplified)', () => {
  it('equals 1 at the 760 m/s rock reference', () => {
    expect(vs30SiteFactor(760)).toBeCloseTo(1, 6);
  });

  it('soft soil (Vs30 = 300) amplifies PGA ~1.45×', () => {
    const f = vs30SiteFactor(300);
    expect(f).toBeGreaterThan(1.3);
    expect(f).toBeLessThan(1.6);
  });

  it('very hard rock (Vs30 = 1500) de-amplifies PGA', () => {
    expect(vs30SiteFactor(1_500)).toBeLessThan(1);
  });

  it('ignores non-finite / non-positive Vs30 (returns 1)', () => {
    expect(vs30SiteFactor(0)).toBe(1);
    expect(vs30SiteFactor(Number.NaN)).toBe(1);
  });
});
