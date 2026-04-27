import { describe, expect, it } from 'vitest';
import { NUCLEAR_THERMAL_PARTITION, THIRD_DEGREE_BURN_FLUENCE } from '../../constants.js';
import { Mt, m as meters, megatonsToJoules } from '../../units.js';
import { thermalFluence, thirdDegreeBurnRadius } from './thermal.js';

/** Hiroshima ≈ 15 kt = 6.276 × 10¹³ J; Tsar Bomba ≈ 50 Mt = 2.092 × 10¹⁷ J. */
const HIROSHIMA_YIELD = megatonsToJoules(Mt(0.015));
const TSAR_BOMBA_YIELD = megatonsToJoules(Mt(50));

describe('thermalFluence (Glasstone & Dolan 1977, §7.03)', () => {
  it('follows inverse-square decay', () => {
    const near = thermalFluence({ distance: meters(1_000), yieldEnergy: HIROSHIMA_YIELD });
    const far = thermalFluence({ distance: meters(2_000), yieldEnergy: HIROSHIMA_YIELD });
    // Q ∝ 1/R²: doubling R should quarter Q.
    expect(near / far).toBeCloseTo(4, 10);
  });

  it('scales linearly with yield and thermal partition at fixed distance', () => {
    const base = thermalFluence({
      distance: meters(1_000),
      yieldEnergy: HIROSHIMA_YIELD,
      thermalPartition: 0.35,
    });
    const doubled = thermalFluence({
      distance: meters(1_000),
      yieldEnergy: HIROSHIMA_YIELD,
      thermalPartition: 0.7,
    });
    expect(doubled / base).toBeCloseTo(2, 10);
  });

  it('Hiroshima exposure at 1 km ≈ 1.7 MJ/m² (unshielded)', () => {
    // Q = 0.35 × 6.276e13 / (4π × 10⁶) = 1.748 × 10⁶ J/m². Published
    // Hiroshima thermal exposure at ground zero ≈ 4 MJ/m², decaying
    // steeply with distance; 1.7 MJ/m² at 1 km is the canonical
    // popular-science figure at this range.
    const Q = thermalFluence({ distance: meters(1_000), yieldEnergy: HIROSHIMA_YIELD });
    expect(Math.abs(Q - 1.748e6) / 1.748e6).toBeLessThan(1e-3);
  });
});

describe('thirdDegreeBurnRadius (Glasstone & Dolan 1977, Table 7.41)', () => {
  it('inverts thermalFluence: fluence at the burn radius equals the threshold', () => {
    const R = thirdDegreeBurnRadius({ yieldEnergy: HIROSHIMA_YIELD });
    const Q = thermalFluence({ distance: R, yieldEnergy: HIROSHIMA_YIELD });
    expect(Math.abs(Q - THIRD_DEGREE_BURN_FLUENCE) / THIRD_DEGREE_BURN_FLUENCE).toBeLessThan(1e-9);
  });

  it('Hiroshima 3rd-degree burn radius ≈ 2.4 km (unshielded)', () => {
    // R = √(0.35 × 6.276e13 / (4π × 3.35e5)) = √(5.22e6) ≈ 2 285 m.
    // Published Hiroshima thermal-burn radius: ~2–3 km.
    const R = thirdDegreeBurnRadius({ yieldEnergy: HIROSHIMA_YIELD }) as number;
    expect(R).toBeGreaterThan(2_000);
    expect(R).toBeLessThan(3_000);
  });

  it('Tsar Bomba unshielded burn radius is >100 km; drops below at τ ≈ 0.3', () => {
    // Without atmospheric attenuation: ≈132 km. Real reach is shorter
    // because τ drops to ~0.3 at ~100 km over clear air.
    const unshielded = thirdDegreeBurnRadius({ yieldEnergy: TSAR_BOMBA_YIELD }) as number;
    expect(unshielded).toBeGreaterThan(130_000);

    const attenuated = thirdDegreeBurnRadius({
      yieldEnergy: TSAR_BOMBA_YIELD,
      atmosphericTransmission: 0.3,
    }) as number;
    expect(attenuated).toBeLessThan(unshielded);
    expect(attenuated / unshielded).toBeCloseTo(Math.sqrt(0.3), 10);
  });

  it('scales with √W at fixed threshold and partition', () => {
    const r15 = thirdDegreeBurnRadius({ yieldEnergy: HIROSHIMA_YIELD }) as number;
    const r60 = thirdDegreeBurnRadius({ yieldEnergy: megatonsToJoules(Mt(0.06)) }) as number;
    // Four times the yield ⇒ twice the radius.
    expect(r60 / r15).toBeCloseTo(2, 10);
  });

  it('uses the default thermal partition 0.35 when unspecified', () => {
    const rDefault = thirdDegreeBurnRadius({ yieldEnergy: HIROSHIMA_YIELD }) as number;
    const rExplicit = thirdDegreeBurnRadius({
      yieldEnergy: HIROSHIMA_YIELD,
      thermalPartition: NUCLEAR_THERMAL_PARTITION,
    }) as number;
    expect(rDefault).toBe(rExplicit);
  });
});
