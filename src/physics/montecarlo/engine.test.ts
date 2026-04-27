import { describe, expect, it } from 'vitest';
import { percentileSummary, runMonteCarlo } from './engine.js';
import { mulberry32, sampleNormal } from './sampling.js';

describe('percentileSummary', () => {
  it('P10/P50/P90 on a uniform grid matches the expected index', () => {
    const samples = Array.from({ length: 101 }, (_, i) => i); // 0..100
    const s = percentileSummary(samples);
    expect(s.p10).toBeCloseTo(10, 0);
    expect(s.p50).toBeCloseTo(50, 0);
    expect(s.p90).toBeCloseTo(90, 0);
    expect(s.mean).toBeCloseTo(50, 0);
  });

  it('filters out non-finite values', () => {
    const samples = [1, 2, 3, Number.NaN, Number.POSITIVE_INFINITY, 4];
    const s = percentileSummary(samples);
    expect(Number.isFinite(s.p50)).toBe(true);
    expect(s.mean).toBeCloseTo(2.5, 0);
  });

  it('returns zeros on an empty input', () => {
    const s = percentileSummary([]);
    expect(s.p10).toBe(0);
    expect(s.p90).toBe(0);
  });
});

describe('runMonteCarlo', () => {
  it('aggregates metrics across iterations', () => {
    // Mock simulator: return input × 2. Sample input from N(10, 1).
    const rng = mulberry32('mc');
    const result = runMonteCarlo<
      { x: number },
      { doubled: number },
      { doubled: number; quadrupled: number }
    >({
      iterations: 500,
      rng,
      sampler: (r) => ({ x: sampleNormal(r, 10, 1) }),
      simulate: (input) => ({ doubled: input.x * 2 }),
      extractMetrics: (out) => ({
        doubled: out.doubled,
        quadrupled: out.doubled * 2,
      }),
    });
    expect(result.iterations).toBe(500);
    expect(result.metrics.doubled.p50).toBeCloseTo(20, 0);
    expect(result.metrics.doubled.p90).toBeGreaterThan(result.metrics.doubled.p10);
    expect(result.metrics.quadrupled.mean).toBeCloseTo(40, 0);
  });

  it('is reproducible across runs with the same seed', () => {
    const run = (
      seed: number
    ): ReturnType<typeof runMonteCarlo<{ x: number }, { y: number }, { y: number }>> =>
      runMonteCarlo({
        iterations: 100,
        rng: mulberry32(seed),
        sampler: (r) => ({ x: sampleNormal(r, 1, 0.1) }),
        simulate: (input) => ({ y: Math.sin(input.x) }),
        extractMetrics: (out) => ({ y: out.y }),
      });
    const a = run(42);
    const b = run(42);
    expect(a.metrics.y.p50).toBe(b.metrics.y.p50);
    expect(a.metrics.y.p10).toBe(b.metrics.y.p10);
  });

  it('survives individual iterations that throw', () => {
    const rng = mulberry32(1);
    const result = runMonteCarlo<{ x: number }, { y: number }, { y: number }>({
      iterations: 50,
      rng,
      sampler: () => ({ x: Math.random() }),
      simulate: (input) => {
        // Throw on ~half the inputs.
        if (input.x < 0.5) throw new Error('unlucky');
        return { y: input.x };
      },
      extractMetrics: (out) => ({ y: out.y }),
    });
    // Should have at least some successful iterations but less than 50.
    expect(result.iterations).toBeGreaterThan(0);
    expect(result.iterations).toBeLessThan(50);
  });
});
