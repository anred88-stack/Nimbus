import { describe, expect, it } from 'vitest';
import { CHONDRITIC_DENSITY } from '../../constants.js';
import { kgPerM3, m as meters, mps } from '../../units.js';
import { impactorMass, kineticEnergy } from './kinetic.js';

/**
 * Chicxulub-class reference case, per Collins, Melosh & Marcus (2005)
 * sample inputs (Section 5, Chicxulub impactor): L = 10 km, v = 20 km/s,
 * ρ_i = 3000 kg/m³ (ordinary chondrite).
 *
 *   m  = (π/6) · 3000 · (10 000)³   ≈ 1.5708 × 10¹⁵ kg
 *   E  = ½ · 1.5708 × 10¹⁵ · 20 000² ≈ 3.1416 × 10²³ J
 *
 * The published 4–5 × 10²³ J figure for Chicxulub comes from a larger
 * assumed impactor (≈12–15 km); our test pins the formula against its
 * own exact algebraic result for the chosen inputs.
 */
const L_CHICXULUB = meters(10_000);
const V_CHICXULUB = mps(20_000);

describe('impactorMass', () => {
  it('computes the sphere-volume mass of a 10 km chondritic body', () => {
    const mass = impactorMass(L_CHICXULUB, CHONDRITIC_DENSITY) as number;
    const expected = (Math.PI / 6) * 3000 * 10_000 ** 3;
    expect(mass).toBeCloseTo(expected, -5);
  });

  it('is zero when diameter is zero, regardless of density', () => {
    expect(impactorMass(meters(0), kgPerM3(7800)) as number).toBe(0);
  });

  it('scales with L³ (doubling diameter multiplies mass by 8)', () => {
    const small = impactorMass(meters(100), CHONDRITIC_DENSITY) as number;
    const doubled = impactorMass(meters(200), CHONDRITIC_DENSITY) as number;
    expect(doubled / small).toBeCloseTo(8, 10);
  });
});

describe('kineticEnergy', () => {
  it('reproduces the Chicxulub-class kinetic energy (10 km / 20 km/s / chondritic)', () => {
    const mass = impactorMass(L_CHICXULUB, CHONDRITIC_DENSITY);
    const energy = kineticEnergy(mass, V_CHICXULUB) as number;
    const expected = 3.1416e23;
    expect(Math.abs(energy - expected) / expected).toBeLessThan(1e-3);
  });

  it('is zero when velocity is zero', () => {
    const mass = impactorMass(meters(50), CHONDRITIC_DENSITY);
    expect(kineticEnergy(mass, mps(0)) as number).toBe(0);
  });

  it('scales with v² (doubling velocity quadruples energy)', () => {
    const mass = impactorMass(meters(50), CHONDRITIC_DENSITY);
    const slow = kineticEnergy(mass, mps(15_000)) as number;
    const fast = kineticEnergy(mass, mps(30_000)) as number;
    expect(fast / slow).toBeCloseTo(4, 10);
  });
});
