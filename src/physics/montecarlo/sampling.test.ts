import { describe, expect, it } from 'vitest';
import {
  mulberry32,
  sampleDiscrete,
  sampleImpactAngle,
  sampleLognormal,
  sampleNormal,
  sampleUniform,
} from './sampling.js';

describe('mulberry32', () => {
  it('produces deterministic sequences for a given seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 32; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('different seeds diverge after the first draw', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 16 }, () => a.next());
    const seqB = Array.from({ length: 16 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('accepts string seeds (hashed deterministically)', () => {
    const a = mulberry32('chicxulub');
    const b = mulberry32('chicxulub');
    const c = mulberry32('tunguska');
    expect(a.next()).toBe(b.next());
    expect(a.next()).not.toBe(c.next());
  });

  it('outputs are bounded in [0, 1)', () => {
    const rng = mulberry32(123);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('sampleNormal', () => {
  it('produces values clustered around the mean with ~1σ spread', () => {
    const rng = mulberry32('normal');
    const mean = 5;
    const std = 1;
    const samples = Array.from({ length: 5_000 }, () => sampleNormal(rng, mean, std));
    const actualMean = samples.reduce((s, x) => s + x, 0) / samples.length;
    const variance = samples.reduce((s, x) => s + (x - actualMean) ** 2, 0) / samples.length;
    expect(actualMean).toBeCloseTo(mean, 0);
    expect(Math.sqrt(variance)).toBeCloseTo(std, 0);
  });

  it('handles σ = 0 as a degenerate delta at the mean', () => {
    const rng = mulberry32(1);
    const v = sampleNormal(rng, 42, 0);
    expect(v).toBe(42);
  });
});

describe('sampleLognormal', () => {
  it('median of the draws is close to the requested median', () => {
    const rng = mulberry32('ln');
    const median = 100;
    const samples = Array.from({ length: 5_000 }, () => sampleLognormal(rng, median, 0.5));
    samples.sort((a, b) => a - b);
    const p50 = samples[Math.floor(samples.length / 2)];
    expect(p50).toBeGreaterThan(80);
    expect(p50).toBeLessThan(130);
  });

  it('all draws are positive', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 1_000; i++) {
      expect(sampleLognormal(rng, 50, 0.8)).toBeGreaterThan(0);
    }
  });
});

describe('sampleUniform', () => {
  it('stays within [min, max]', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 1_000; i++) {
      const v = sampleUniform(rng, 10, 20);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThanOrEqual(20);
    }
  });
});

describe('sampleImpactAngle', () => {
  it('returns radians in [0, π/2]', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 1_000; i++) {
      const a = sampleImpactAngle(rng);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(Math.PI / 2);
    }
  });

  it('peaks near 45° (sin(2θ) weighting)', () => {
    const rng = mulberry32('angle');
    const samples = Array.from({ length: 10_000 }, () => sampleImpactAngle(rng));
    const near45 = samples.filter((a) => {
      const deg = (a * 180) / Math.PI;
      return deg > 30 && deg < 60;
    }).length;
    // Expected fraction near 45°: ~49 % (analytical — cos(60°) − cos(120°) = 1)
    // divided by the full [0, π/2] integral of 2 sin(2θ) = 2.
    expect(near45 / samples.length).toBeGreaterThan(0.4);
  });
});

describe('sampleDiscrete', () => {
  it('samples uniformly when weights are omitted', () => {
    const rng = mulberry32('disc');
    const choices = ['a', 'b', 'c'] as const;
    const counts = new Map<string, number>();
    for (let i = 0; i < 6_000; i++) {
      const c = sampleDiscrete(rng, choices);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    for (const c of choices) {
      const n = counts.get(c) ?? 0;
      expect(n).toBeGreaterThan(1_800);
      expect(n).toBeLessThan(2_200);
    }
  });

  it('honours explicit weights (10× likelier branch dominates)', () => {
    const rng = mulberry32('w');
    const picks: string[] = [];
    for (let i = 0; i < 1_000; i++) {
      picks.push(sampleDiscrete(rng, ['rare', 'common'], [1, 10]));
    }
    const common = picks.filter((p) => p === 'common').length;
    expect(common / picks.length).toBeGreaterThan(0.8);
  });

  it('throws on empty choices', () => {
    expect(() => sampleDiscrete(mulberry32(1), [])).toThrow();
  });
});
