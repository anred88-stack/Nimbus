import { describe, expect, it } from 'vitest';
import { vEILowerBoundVolume, volcanicExplosivityIndex } from './vei.js';

describe('volcanicExplosivityIndex (Newhall & Self 1982)', () => {
  it('classifies reference historical eruptions', () => {
    // Mt St Helens 1980: ≈1.2 km³ = 1.2 × 10⁹ m³ → VEI 5.
    expect(volcanicExplosivityIndex(1.2e9)).toBe(5);
    // Krakatoa 1883: ≈20 km³ = 2 × 10¹⁰ m³ → VEI 6.
    expect(volcanicExplosivityIndex(2e10)).toBe(6);
    // Tambora 1815: ≈140 km³ = 1.4 × 10¹¹ m³ → VEI 7.
    expect(volcanicExplosivityIndex(1.4e11)).toBe(7);
    // Toba ≈74 ka: ≈2 800 km³ = 2.8 × 10¹² m³ → VEI 8.
    expect(volcanicExplosivityIndex(2.8e12)).toBe(8);
  });

  it('respects the VEI 0 / 1 / 2 transition thresholds', () => {
    expect(volcanicExplosivityIndex(1e3)).toBe(0); // <10⁴ → VEI 0
    expect(volcanicExplosivityIndex(1e5)).toBe(1); // 10⁴–10⁶ → VEI 1
    expect(volcanicExplosivityIndex(5e6)).toBe(2); // 10⁶–10⁷ → VEI 2
  });

  it('clamps to VEI 8 for impossibly large super-eruptions', () => {
    expect(volcanicExplosivityIndex(1e20)).toBe(8);
  });

  it('rejects negative or non-finite volumes', () => {
    expect(() => volcanicExplosivityIndex(-1)).toThrow(/non-negative/);
    expect(() => volcanicExplosivityIndex(Number.NaN)).toThrow(/non-negative/);
  });
});

describe('vEILowerBoundVolume', () => {
  it('VEI 0 → 0 m³ (no explosive threshold)', () => {
    expect(vEILowerBoundVolume(0)).toBe(0);
  });

  it('VEI 1 → 10⁴ m³, VEI 6 → 10¹⁰ m³, VEI 8 → 10¹² m³', () => {
    expect(vEILowerBoundVolume(1)).toBe(1e4);
    expect(vEILowerBoundVolume(6)).toBe(1e10);
    expect(vEILowerBoundVolume(8)).toBe(1e12);
  });
});
