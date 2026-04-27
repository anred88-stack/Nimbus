import { describe, expect, it } from 'vitest';
import { SEA_LEVEL_PRESSURE } from '../../constants.js';
import { J, Mt, Pa, m as meters, megatonsToJoules } from '../../units.js';
import { peakOverpressure, scaledDistance } from './overpressure.js';

/** Hiroshima: ≈15 kt TNT-equivalent = 0.015 Mt = 6.276 × 10¹³ J. */
const HIROSHIMA_YIELD = megatonsToJoules(Mt(0.015));
/** Tsar Bomba test (1961): ≈50 Mt TNT-equivalent = 2.092 × 10¹⁷ J. */
const TSAR_BOMBA_YIELD = megatonsToJoules(Mt(50));

describe('scaledDistance (Hopkinson–Cranz)', () => {
  it('returns R / W^(1/3) in m·kg^(-1/3) with W in kg TNT', () => {
    // 15 kt = 1.5 × 10⁷ kg TNT → W^(1/3) ≈ 246.62 kg^(1/3).
    const Z = scaledDistance(meters(1_000), HIROSHIMA_YIELD);
    expect(Z).toBeCloseTo(1_000 / 1.5e7 ** (1 / 3), 6);
  });

  it('is invariant under yield scaling at fixed scaled distance', () => {
    // Same Z = 5 m·kg^(-1/3): R scales as W^(1/3).
    // 1 kg TNT = 4.184 × 10⁶ J; 1 Mt TNT = 10⁹ kg TNT = 4.184 × 10¹⁵ J.
    const E_small = J(4.184e6); // 1 kg TNT
    const E_large = megatonsToJoules(Mt(1)); // 10⁹ kg TNT
    const R_small = meters(5 * 1 ** (1 / 3));
    const R_large = meters(5 * 1_000_000_000 ** (1 / 3));
    expect(scaledDistance(R_small, E_small)).toBeCloseTo(5, 10);
    expect(scaledDistance(R_large, E_large)).toBeCloseTo(5, 10);
  });
});

describe('peakOverpressure (Kinney–Graham surface burst)', () => {
  it('reproduces the algebraic value at Z = 5 m·kg^(-1/3)', () => {
    // Pick any R,W that give Z = 5; using 1 Mt (10⁹ kg TNT):
    //   R = 5 × (10⁹)^(1/3) = 5 × 1000 = 5000 m.
    const Ps = peakOverpressure({
      distance: meters(5_000),
      yieldEnergy: megatonsToJoules(Mt(1)),
    }) as number;
    // Algebraic value of K–G at Z = 5, P_0 = 101 325 Pa → ≈29.3 kPa.
    const Z = 5;
    const num = 808 * (1 + (Z / 4.5) ** 2);
    const den =
      Math.sqrt(1 + (Z / 0.048) ** 2) *
      Math.sqrt(1 + (Z / 0.32) ** 2) *
      Math.sqrt(1 + (Z / 1.35) ** 2);
    const expected = (num / den) * (SEA_LEVEL_PRESSURE as number);
    expect(Ps).toBeCloseTo(expected, 3);
  });

  it('Hiroshima 15 kt at 1 km surface-burst equivalent ≈ 30–50 kPa', () => {
    // The Kinney–Graham surface-burst formula predicts ≈44 kPa at the
    // Hiroshima scaled distance of Z ≈ 4.055 m·kg^(-1/3). The oft-cited
    // Hiroshima airburst figure (≈32 kPa ≈ 4.6 psi at 1 km) is lower
    // because the 580 m burst height moved the 5-psi contour outward;
    // this surface-burst envelope is the appropriate popular-science
    // comparison for contact detonations.
    const Ps = peakOverpressure({
      distance: meters(1_000),
      yieldEnergy: HIROSHIMA_YIELD,
    }) as number;
    expect(Ps).toBeGreaterThan(30_000);
    expect(Ps).toBeLessThan(50_000);
  });

  it('decreases monotonically with distance at fixed yield', () => {
    const p1 = peakOverpressure({ distance: meters(500), yieldEnergy: HIROSHIMA_YIELD }) as number;
    const p2 = peakOverpressure({
      distance: meters(1_000),
      yieldEnergy: HIROSHIMA_YIELD,
    }) as number;
    const p3 = peakOverpressure({
      distance: meters(5_000),
      yieldEnergy: HIROSHIMA_YIELD,
    }) as number;
    expect(p1).toBeGreaterThan(p2);
    expect(p2).toBeGreaterThan(p3);
  });

  it('is invariant in scaled distance: same Z → same overpressure', () => {
    // Hiroshima 15 kt at 1 km, vs Tsar Bomba 50 Mt at the scaled-equivalent
    // range. W_ratio^(1/3) = (50 000 / 15)^(1/3) ≈ 14.90.
    const R_equiv = meters(1_000 * (50_000 / 15) ** (1 / 3));
    const p_hiro = peakOverpressure({
      distance: meters(1_000),
      yieldEnergy: HIROSHIMA_YIELD,
    }) as number;
    const p_tsar = peakOverpressure({
      distance: R_equiv,
      yieldEnergy: TSAR_BOMBA_YIELD,
    }) as number;
    expect(p_tsar / p_hiro).toBeCloseTo(1, 6);
  });

  it('scales linearly with ambient pressure', () => {
    const sea = peakOverpressure({
      distance: meters(2_000),
      yieldEnergy: HIROSHIMA_YIELD,
    }) as number;
    const halved = peakOverpressure({
      distance: meters(2_000),
      yieldEnergy: HIROSHIMA_YIELD,
      ambientPressure: Pa((SEA_LEVEL_PRESSURE as number) * 0.5),
    }) as number;
    expect(halved / sea).toBeCloseTo(0.5, 10);
  });
});
