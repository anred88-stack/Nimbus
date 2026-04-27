import { describe, expect, it } from 'vitest';
import { buildExceedanceProbability } from './ecdf.js';

describe('buildExceedanceProbability', () => {
  it('returns 1 below the smallest sample, ~1/N at the largest', () => {
    const ecdf = buildExceedanceProbability([1, 2, 3, 4, 5]);
    expect(ecdf.exceedanceAt(0.5)).toBe(1);
    expect(ecdf.exceedanceAt(5)).toBeCloseTo(1 / 5, 6);
    expect(ecdf.exceedanceAt(10)).toBeCloseTo(1 / 5, 6);
  });

  it('reads ~0.5 at the median for an odd-N sample', () => {
    const ecdf = buildExceedanceProbability([1, 2, 3, 4, 5]);
    // Threshold = 3 (the median). 3 samples are ≥ 3 → P = 3/5 = 0.6.
    // Linear-interpolated ECDF returns somewhere in [0.4, 0.6].
    const p = ecdf.exceedanceAt(3);
    expect(p).toBeGreaterThan(0.4);
    expect(p).toBeLessThan(0.7);
  });

  it('is monotone non-increasing in the threshold', () => {
    const samples = Array.from({ length: 100 }, () => Math.random() * 100);
    const ecdf = buildExceedanceProbability(samples);
    let prev = Infinity;
    for (let r = 0; r <= 100; r += 5) {
      const p = ecdf.exceedanceAt(r);
      expect(p).toBeLessThanOrEqual(prev + 1e-9);
      prev = p;
    }
  });

  it('drops non-finite values from the ECDF (NaN, Infinity)', () => {
    const ecdf = buildExceedanceProbability([1, NaN, 2, Infinity, 3, -Infinity]);
    // Effective sample is [1, 2, 3]. Threshold = 0 → 1 (all 3 are ≥).
    expect(ecdf.exceedanceAt(0)).toBe(1);
    // Threshold = 4 → 1/3 (only the largest finite passes).
    expect(ecdf.exceedanceAt(4)).toBeCloseTo(1 / 3, 6);
  });

  it('percentileAt inverts exceedanceAt at the published percentiles', () => {
    const samples: number[] = [];
    for (let i = 0; i < 100; i++) samples.push(i);
    const ecdf = buildExceedanceProbability(samples);
    // P(R ≥ r) = 0.10 ⇒ r should be near the 90th percentile (= 90).
    const r10 = ecdf.percentileAt(0.1);
    expect(r10).toBeGreaterThan(85);
    expect(r10).toBeLessThan(95);
    // P(R ≥ r) = 0.90 ⇒ r should be near the 10th percentile (= 10).
    const r90 = ecdf.percentileAt(0.9);
    expect(r90).toBeGreaterThan(5);
    expect(r90).toBeLessThan(15);
  });

  it('handles empty sample sets gracefully', () => {
    const ecdf = buildExceedanceProbability([]);
    expect(ecdf.exceedanceAt(0)).toBe(0);
    expect(ecdf.percentileAt(0.5)).toBe(0);
  });
});
