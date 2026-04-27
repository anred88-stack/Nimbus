import { describe, expect, it } from 'vitest';
import { momentMagnitudeFromSeismicMoment, seismicMomentFromMagnitude } from './seismicMoment.js';

describe('seismicMomentFromMagnitude (Hanks & Kanamori 1979)', () => {
  it('Tohoku Mw 9.1 → M₀ ≈ 5.6 × 10²² N·m (within 15 % of observed)', () => {
    const M0 = seismicMomentFromMagnitude(9.1) as number;
    const expected = 5.6e22;
    expect(Math.abs(M0 - expected) / expected).toBeLessThan(0.15);
  });

  it('one magnitude unit multiplies moment by ≈ 31.62× (factor of 10^1.5)', () => {
    const small = seismicMomentFromMagnitude(5) as number;
    const big = seismicMomentFromMagnitude(6) as number;
    expect(big / small).toBeCloseTo(10 ** 1.5, 10);
  });

  it('produces a classic "1 N·m at Mw −6.07" reference point', () => {
    // 10^(1.5·−6.07 + 9.1) = 10^(−0.005) ≈ 0.989 ≈ 1 N·m.
    const M0 = seismicMomentFromMagnitude(-6.07) as number;
    expect(M0).toBeCloseTo(1, 1);
  });
});

describe('momentMagnitudeFromSeismicMoment (inverse)', () => {
  it('round-trips: Mw → M₀ → Mw within floating-point epsilon', () => {
    for (const mw of [3, 5.5, 6.7, 7.0, 9.1]) {
      const back = momentMagnitudeFromSeismicMoment(seismicMomentFromMagnitude(mw));
      expect(back).toBeCloseTo(mw, 10);
    }
  });
});
