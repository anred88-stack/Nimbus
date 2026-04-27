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

  it('Hiroshima-class (15 kt) produces ≈ 2–3 km burn radius and ≈ 3 km 1 psi ring', () => {
    const r = impactDamageRadii(megatonsToJoules(Mt(0.015)), meters(200));
    // Unshielded 3rd-degree burn radius ≈ 2.3 km (see thermal.test.ts).
    expect(r.thirdDegreeBurn as number).toBeGreaterThan(2_000);
    expect(r.thirdDegreeBurn as number).toBeLessThan(3_000);
    // 1 psi (window-break) ring for a 15 kt surface burst ≈ 3.3 km —
    // the oft-cited ≈4 km figure belongs to optimum-height airbursts
    // with Mach-stem boost, not our contact-burst envelope.
    expect(r.overpressure1psi as number).toBeGreaterThan(2_500);
    expect(r.overpressure1psi as number).toBeLessThan(4_500);
  });
});
