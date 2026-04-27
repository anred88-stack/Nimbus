import { describe, expect, it } from 'vitest';
import { nehrpClassFromVs30, waldAllen2007Vs30FromSlope } from './waldAllen.js';

describe('waldAllen2007Vs30FromSlope', () => {
  it('rock outcrops (slope ≥ 0.14 m/m) give Vs30 ≥ 685 m/s', () => {
    // 0.2 m/m slope is about 11°, a steep hillside.
    const vs30 = waldAllen2007Vs30FromSlope(Math.atan(0.2));
    expect(vs30).toBeGreaterThanOrEqual(685);
    expect(vs30).toBeLessThanOrEqual(760);
  });

  it('soft alluvial basins (slope ≤ 0.007) give Vs30 ≤ 240 m/s', () => {
    // 0.003 m/m slope — essentially flat.
    const vs30 = waldAllen2007Vs30FromSlope(Math.atan(0.003));
    expect(vs30).toBeLessThanOrEqual(240);
    expect(vs30).toBeGreaterThanOrEqual(100);
  });

  it('intermediate slope (0.025 m/m) falls in the Vs30 365–425 band', () => {
    const vs30 = waldAllen2007Vs30FromSlope(Math.atan(0.025));
    expect(vs30).toBeGreaterThanOrEqual(300);
    expect(vs30).toBeLessThanOrEqual(500);
  });

  it('monotonically increasing in slope', () => {
    const slopes = [0.003, 0.01, 0.02, 0.05, 0.1, 0.25];
    const vs30s = slopes.map((s) => waldAllen2007Vs30FromSlope(Math.atan(s)));
    for (let i = 1; i < vs30s.length; i++) {
      expect(vs30s[i]).toBeGreaterThanOrEqual(vs30s[i - 1]!);
    }
  });

  it('zero slope is mapped to the softest Vs30 (180 m/s)', () => {
    expect(waldAllen2007Vs30FromSlope(0)).toBe(180);
  });

  it('handles NaN and negative slopes defensively (defaults to 760)', () => {
    expect(waldAllen2007Vs30FromSlope(Number.NaN)).toBe(760);
    expect(waldAllen2007Vs30FromSlope(-0.1)).toBe(760);
  });

  it('log-interpolates smoothly within a bin (no step-function jump)', () => {
    // Two slopes very close together in the same bin (0.07–0.098)
    // should give two Vs30 values very close together.
    const v1 = waldAllen2007Vs30FromSlope(Math.atan(0.075));
    const v2 = waldAllen2007Vs30FromSlope(Math.atan(0.08));
    expect(Math.abs(v1 - v2)).toBeLessThan(30);
  });
});

describe('nehrpClassFromVs30', () => {
  it('classifies the canonical FEMA 2015 bins correctly', () => {
    expect(nehrpClassFromVs30(1_800)).toBe('A'); // Hard rock
    expect(nehrpClassFromVs30(760)).toBe('B'); // Rock boundary
    expect(nehrpClassFromVs30(500)).toBe('C'); // Very dense soil
    expect(nehrpClassFromVs30(250)).toBe('D'); // Stiff soil
    expect(nehrpClassFromVs30(150)).toBe('E'); // Soft clay
  });

  it('defaults to the softest class on invalid inputs', () => {
    expect(nehrpClassFromVs30(-1)).toBe('E');
    expect(nehrpClassFromVs30(Number.NaN)).toBe('E');
  });
});
