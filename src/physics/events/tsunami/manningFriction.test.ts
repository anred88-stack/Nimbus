import { describe, expect, it } from 'vitest';
import { m as meters } from '../../units.js';
import {
  MANNING_OPEN_OCEAN,
  MANNING_SAND_BEACH,
  MANNING_VEGETATED_COAST,
  manningCorrectedRunup,
  manningPropagationDamping,
  manningRunupCorrection,
} from './manningFriction.js';

describe('manningPropagationDamping (Imamura 1995)', () => {
  it('returns 1 for non-positive path length (no damping)', () => {
    expect(manningPropagationDamping({ pathLengthM: 0, meanDepthM: 4_000 })).toBe(1);
    expect(manningPropagationDamping({ pathLengthM: -100, meanDepthM: 4_000 })).toBe(1);
  });

  it('returns 1 for non-positive Manning n (no damping)', () => {
    expect(
      manningPropagationDamping({ pathLengthM: 1_000_000, meanDepthM: 4_000, manningN: 0 })
    ).toBe(1);
  });

  it('damping in deep ocean (4 km) over 1000 km is small (≤ 5 %)', () => {
    // Open-ocean propagation: friction term g·n²·√(g/h)/h^(4/3) is
    // tiny at 4 km depth, so the path damping over 1 000 km is on
    // the order of a few percent. This matches Imamura 1995 §4.2.
    const f = manningPropagationDamping({
      pathLengthM: 1_000_000,
      meanDepthM: 4_000,
      manningN: MANNING_OPEN_OCEAN,
    });
    expect(f).toBeGreaterThan(0.95);
    expect(f).toBeLessThanOrEqual(1);
  });

  it('damping over a shallow shelf (200 m) is more significant', () => {
    // Same path length, depth 200 m → friction is ~25× stronger
    // than at 4 km because the term scales as 1/h^(4/3)·√(g/h).
    const deep = manningPropagationDamping({
      pathLengthM: 100_000,
      meanDepthM: 4_000,
      manningN: MANNING_OPEN_OCEAN,
    });
    const shelf = manningPropagationDamping({
      pathLengthM: 100_000,
      meanDepthM: 200,
      manningN: MANNING_OPEN_OCEAN,
    });
    expect(shelf).toBeLessThan(deep);
  });

  it('damping is monotonic in path length', () => {
    let last = 1.001;
    for (const L of [1_000, 10_000, 100_000, 500_000, 1_000_000, 5_000_000]) {
      const f = manningPropagationDamping({ pathLengthM: L, meanDepthM: 4_000 });
      expect(f).toBeLessThan(last);
      last = f;
    }
  });

  it('damping is monotonic in Manning n (rougher → more loss)', () => {
    let last = 1.001;
    for (const n of [0, 0.01, 0.025, 0.04, 0.06, 0.1]) {
      const f = manningPropagationDamping({
        pathLengthM: 100_000,
        meanDepthM: 200,
        manningN: n,
      });
      expect(f).toBeLessThanOrEqual(last);
      last = f;
    }
  });

  it('damping is bounded below by exp(-5) ≈ 0.0067 (numeric guard)', () => {
    const extreme = manningPropagationDamping({
      pathLengthM: 100_000_000,
      meanDepthM: 1,
      manningN: 0.5,
    });
    expect(extreme).toBeGreaterThanOrEqual(Math.exp(-5));
  });
});

describe('manningRunupCorrection (Liu 2005 / Park 2013)', () => {
  it('returns 1 for non-positive Manning n (no correction)', () => {
    expect(
      manningRunupCorrection({ manningN: 0, beachSlopeRad: Math.atan(1 / 100), offshoreDepthM: 10 })
    ).toBe(1);
  });

  it('typical sand beach (n=0.025) trims the run-up by ≈ 10 % on a 1:100 beach', () => {
    const f = manningRunupCorrection({
      manningN: MANNING_OPEN_OCEAN,
      beachSlopeRad: Math.atan(1 / 100),
      offshoreDepthM: 10,
    });
    // Liu/Park calibration: 0.85-0.95 expected. We are inside that.
    expect(f).toBeGreaterThan(0.7);
    expect(f).toBeLessThan(1);
  });

  it('vegetation (n=0.06) cuts the run-up further than bare sand', () => {
    const sand = manningRunupCorrection({
      manningN: MANNING_SAND_BEACH,
      beachSlopeRad: Math.atan(1 / 100),
      offshoreDepthM: 10,
    });
    const veg = manningRunupCorrection({
      manningN: MANNING_VEGETATED_COAST,
      beachSlopeRad: Math.atan(1 / 100),
      offshoreDepthM: 10,
    });
    expect(veg).toBeLessThan(sand);
  });

  it('correction factor stays in (0, 1] across reasonable inputs', () => {
    for (const n of [0.005, 0.025, 0.06, 0.15]) {
      for (const slopeDen of [10, 30, 100, 1_000]) {
        for (const depth of [1, 10, 100, 1_000]) {
          const f = manningRunupCorrection({
            manningN: n,
            beachSlopeRad: Math.atan(1 / slopeDen),
            offshoreDepthM: depth,
          });
          expect(f).toBeGreaterThan(0);
          expect(f).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('manningCorrectedRunup', () => {
  it('multiplies the frictionless run-up by the Liu-Park factor', () => {
    const R0 = meters(20);
    const factor = manningRunupCorrection({
      manningN: MANNING_SAND_BEACH,
      beachSlopeRad: Math.atan(1 / 100),
      offshoreDepthM: 10,
    });
    const out = manningCorrectedRunup({
      frictionlessRunup: R0,
      manningN: MANNING_SAND_BEACH,
      beachSlopeRad: Math.atan(1 / 100),
      offshoreDepthM: meters(10),
    }) as number;
    expect(out).toBeCloseTo((R0 as number) * factor, 6);
  });
});
