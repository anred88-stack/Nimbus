import { describe, expect, it } from 'vitest';
import { STANDARD_GRAVITY } from '../../constants.js';
import {
  liquefactionMagnitudeScalingFactor,
  liquefactionPgaThreshold,
  liquefactionRadius,
} from './liquefaction.js';

describe('liquefactionMagnitudeScalingFactor (Idriss 1999)', () => {
  it('equals 1 exactly at the Mw 7.5 reference', () => {
    expect(liquefactionMagnitudeScalingFactor(7.5)).toBeCloseTo(1, 6);
  });

  it('is > 1 for smaller events (higher threshold needed)', () => {
    expect(liquefactionMagnitudeScalingFactor(6.5)).toBeGreaterThan(1.3);
  });

  it('is < 1 for larger events (lower threshold; longer shaking)', () => {
    expect(liquefactionMagnitudeScalingFactor(9.0)).toBeLessThan(0.7);
  });

  it('clamps to 1 for non-finite / non-positive input', () => {
    expect(liquefactionMagnitudeScalingFactor(0)).toBe(1);
    expect(liquefactionMagnitudeScalingFactor(Number.NaN)).toBe(1);
  });
});

describe('liquefactionPgaThreshold', () => {
  it('Mw 7.5 threshold ≈ 0.10 g', () => {
    const pga = liquefactionPgaThreshold(7.5) as number;
    expect(pga / STANDARD_GRAVITY).toBeCloseTo(0.1, 2);
  });

  it('is lower at Mw 9 than at Mw 6.5', () => {
    expect(liquefactionPgaThreshold(9.0)).toBeLessThan(liquefactionPgaThreshold(6.5));
  });
});

describe('liquefactionRadius', () => {
  it('is zero at Mw 5 (saturation PGA below the liquefaction threshold)', () => {
    expect(liquefactionRadius(5.0) as number).toBe(0);
  });

  it('grows monotonically with magnitude at fixed soil susceptibility', () => {
    const r7 = liquefactionRadius(7.0) as number;
    const r9 = liquefactionRadius(9.0) as number;
    expect(r9).toBeGreaterThan(r7);
  });

  it('Tōhoku-scale Mw 9 produces a regional-scale (≥ 100 km) radius', () => {
    const r = liquefactionRadius(9.0) as number;
    expect(r).toBeGreaterThan(100_000);
  });
});
