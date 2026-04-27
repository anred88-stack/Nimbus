import { describe, expect, it } from 'vitest';
import { m as meters } from '../../units.js';
import { shallowWaterWaveSpeed, shoalingAmplitude, tsunamiTravelTime } from './propagation.js';

describe('shallowWaterWaveSpeed (c = √(gh))', () => {
  it('deep-ocean speed at h = 4 km ≈ 198 m/s (≈ 713 km/h)', () => {
    const c = shallowWaterWaveSpeed(meters(4_000)) as number;
    expect(c).toBeCloseTo(Math.sqrt(9.80665 * 4_000), 6);
    expect(c).toBeGreaterThan(195);
    expect(c).toBeLessThan(200);
  });

  it('continental-shelf speed at h = 100 m ≈ 31 m/s (≈ 113 km/h)', () => {
    const c = shallowWaterWaveSpeed(meters(100)) as number;
    expect(c).toBeGreaterThan(30);
    expect(c).toBeLessThan(32);
  });

  it('scales with √h (quadrupling depth doubles speed)', () => {
    const c1 = shallowWaterWaveSpeed(meters(1_000)) as number;
    const c4 = shallowWaterWaveSpeed(meters(4_000)) as number;
    expect(c4 / c1).toBeCloseTo(2, 10);
  });
});

describe('tsunamiTravelTime', () => {
  it('1 000 km across a 4 km basin takes ≈ 84 minutes', () => {
    const t = tsunamiTravelTime(meters(1_000_000), meters(4_000)) as number;
    const minutes = t / 60;
    expect(minutes).toBeGreaterThan(80);
    expect(minutes).toBeLessThan(90);
  });
});

describe('shoalingAmplitude (Green 1838)', () => {
  it("Green's law: 1 m wave on 4 km depth → ≈ 2.5 m on 10 m shelf", () => {
    const A_shallow = shoalingAmplitude({
      deepAmplitude: meters(1),
      deepDepth: meters(4_000),
      shallowDepth: meters(10),
    }) as number;
    expect(A_shallow).toBeCloseTo((4_000 / 10) ** 0.25, 3);
  });

  it('grows as the fourth root of the depth ratio', () => {
    const A = shoalingAmplitude({
      deepAmplitude: meters(1),
      deepDepth: meters(256),
      shallowDepth: meters(1),
    }) as number;
    // 256^(1/4) = 4.
    expect(A).toBeCloseTo(4, 10);
  });

  it('is the identity when the two depths match', () => {
    const A = shoalingAmplitude({
      deepAmplitude: meters(2),
      deepDepth: meters(500),
      shallowDepth: meters(500),
    }) as number;
    expect(A).toBe(2);
  });
});
