import { describe, expect, it } from 'vitest';
import { Mt, megatonsToJoules, m as meters } from '../../units.js';
import { peakOverpressure } from '../explosion/overpressure.js';
import {
  OVERPRESSURE_BUILDING_COLLAPSE,
  OVERPRESSURE_WINDOW_BREAK,
  distanceForOverpressure,
  impactDamageRadii,
} from './damageRings.js';

describe('distanceForOverpressure (Kinney–Graham inversion)', () => {
  it('round-trips to the target within 1 Pa', () => {
    const yieldEnergy = megatonsToJoules(Mt(1));
    const R = distanceForOverpressure(yieldEnergy, OVERPRESSURE_BUILDING_COLLAPSE);
    const P = peakOverpressure({ distance: R, yieldEnergy }) as number;
    expect(Math.abs(P - (OVERPRESSURE_BUILDING_COLLAPSE as number))).toBeLessThan(1);
  });

  it('larger yields push the ring farther out (cube-root scaling)', () => {
    const small = distanceForOverpressure(megatonsToJoules(Mt(0.015)), OVERPRESSURE_WINDOW_BREAK);
    const big = distanceForOverpressure(megatonsToJoules(Mt(15)), OVERPRESSURE_WINDOW_BREAK);
    // Yield ratio 1000 → range ratio ≈ 1000^(1/3) = 10. Kinney–Graham
    // is not pure cube-root at high yields (the 1 + (Z/4.5)² term bends
    // the curve), so we check the range ratio is within ±15 % of 10.
    const ratio = (big as number) / (small as number);
    expect(ratio).toBeGreaterThan(8.5);
    expect(ratio).toBeLessThan(11.5);
  });

  it('throws when the yield is too small to reach the target', () => {
    // 1 J yield cannot produce 5 psi of overpressure anywhere.
    expect(() => {
      distanceForOverpressure(megatonsToJoules(Mt(1e-18)), OVERPRESSURE_BUILDING_COLLAPSE);
    }).toThrow(/yield too small/);
  });
});

describe('impactDamageRadii', () => {
  it('blast rings order monotonically outward (1 psi > 5 psi > crater rim)', () => {
    // Overpressure decays with distance: the wider ring is the one with
    // the *lower* threshold. Thermal radius has a different physics and
    // can fall either side of the blast rings depending on yield scale.
    const E = megatonsToJoules(Mt(1));
    const r = impactDamageRadii(E, meters(500));
    expect(r.craterRim).toBeLessThan(r.overpressure5psi);
    expect(r.overpressure5psi).toBeLessThan(r.overpressure1psi);
  });

  it('crater rim equals half the final crater diameter', () => {
    const E = megatonsToJoules(Mt(1));
    const r = impactDamageRadii(E, meters(2_000));
    expect(r.craterRim as number).toBe(1_000);
  });

  it('15 kt impact produces ≈ 200 m thermal-burn radius and ≈ 3 km 1 psi ring', () => {
    const r = impactDamageRadii(megatonsToJoules(Mt(0.015)), meters(200));
    // Phase-17 thermal calibration. A 15 kt IMPACT (not a 15 kt
    // nuclear bomb) produces a much smaller thermal flash because the
    // impact luminous efficiency is ≈ 3 × 10⁻³ (Collins-Melosh-Marcus
    // 2005) rather than the 0.35 of a low-altitude nuclear burst —
    // most of the impactor's kinetic energy goes into shock waves,
    // crater excavation and ejecta, not radiated heat. Inverting
    // R = √(f·W / (4π·Q)) with f = 3e-3, W = 15 kt × 4.184 × 10¹² J,
    // Q = 3.35 × 10⁵ J/m² (3rd-burn fluence) gives ≈ 211 m. The
    // earlier 2–3 km expectation was the symptom of the bug we just
    // fixed: the impact pipeline was incorrectly inheriting the
    // nuclear thermal partition through a default argument.
    expect(r.thirdDegreeBurn as number).toBeGreaterThan(150);
    expect(r.thirdDegreeBurn as number).toBeLessThan(300);
    // Blast pipeline is unchanged — Kinney-Graham overpressure scaling
    // doesn't care whether the energy was nuclear or kinetic, so the
    // 1 psi reach for a 15 kt yield stays at ≈ 3.3 km.
    expect(r.overpressure1psi as number).toBeGreaterThan(2_500);
    expect(r.overpressure1psi as number).toBeLessThan(4_500);
  });
});
