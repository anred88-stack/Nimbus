import { describe, expect, it } from 'vitest';
import { Pa, m, mps } from '../../units.js';
import { TNT_SPECIFIC_ENERGY } from '../../constants.js';
import { distanceForPeakWind, peakWindAtRange, peakWindFromOverpressure } from './peakWind.js';

/**
 * Reference values from Glasstone & Dolan (1977), Table 3.66 — peak
 * particle velocity behind a sea-level shock front. Tolerances of
 * ±10 % match the experimental scatter quoted in the source.
 */
describe('peakWindFromOverpressure — Glasstone & Dolan 1977 §3.55 / Table 3.66', () => {
  it('returns 0 for zero or negative overpressure', () => {
    expect(peakWindFromOverpressure(Pa(0)) as number).toBe(0);
    expect(peakWindFromOverpressure(Pa(-100)) as number).toBe(0);
  });

  it('matches the 1 psi reference of ≈ 17 m/s within ±10 %', () => {
    const u = peakWindFromOverpressure(Pa(6_895)) as number;
    expect(u).toBeGreaterThan(15);
    expect(u).toBeLessThan(19);
  });

  it('matches the 5 psi reference of ≈ 73 m/s within ±10 %', () => {
    const u = peakWindFromOverpressure(Pa(34_474)) as number;
    expect(u).toBeGreaterThan(65);
    expect(u).toBeLessThan(81);
  });

  it('matches the 10 psi reference of ≈ 131 m/s within ±10 %', () => {
    const u = peakWindFromOverpressure(Pa(68_948)) as number;
    expect(u).toBeGreaterThan(118);
    expect(u).toBeLessThan(145);
  });

  it('matches the 20 psi reference of ≈ 224 m/s within ±10 %', () => {
    const u = peakWindFromOverpressure(Pa(137_895)) as number;
    expect(u).toBeGreaterThan(200);
    expect(u).toBeLessThan(245);
  });
});

describe('peakWindAtRange', () => {
  it('drops monotonically with distance for a fixed yield', () => {
    const yieldJ = (1_000 * TNT_SPECIFIC_ENERGY) as never; // 1 kt
    const u500 = peakWindAtRange({
      distance: m(500),
      yieldEnergy: yieldJ,
    }) as number;
    const u2000 = peakWindAtRange({
      distance: m(2_000),
      yieldEnergy: yieldJ,
    }) as number;
    expect(u500).toBeGreaterThan(u2000);
    expect(u2000).toBeGreaterThan(0);
  });
});

describe('distanceForPeakWind', () => {
  it('round-trips with peakWindAtRange to within ±5 % at 1 kt', () => {
    const yieldJ = (1_000 * TNT_SPECIFIC_ENERGY) as never;
    // Pick a wind speed clearly inside the inversion bracket.
    const targetWind = mps(50);
    const r = distanceForPeakWind(yieldJ, targetWind) as number;
    expect(Number.isFinite(r)).toBe(true);
    const back = peakWindAtRange({ distance: m(r), yieldEnergy: yieldJ }) as number;
    const targetN = targetWind as number;
    expect(Math.abs(back - targetN) / targetN).toBeLessThan(0.05);
  });

  it('returns NaN for non-positive thresholds', () => {
    const yieldJ = (1_000 * TNT_SPECIFIC_ENERGY) as never;
    expect(Number.isNaN(distanceForPeakWind(yieldJ, mps(0)) as number)).toBe(true);
    expect(Number.isNaN(distanceForPeakWind(yieldJ, mps(-5)) as number)).toBe(true);
  });
});
