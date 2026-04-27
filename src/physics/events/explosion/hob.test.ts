import { describe, expect, it } from 'vitest';
import { m } from '../../units.js';
import { correctRadiusForHob, hobBlastFactor, hobRegime, scaledHeightOfBurst } from './hob.js';

describe('scaledHeightOfBurst', () => {
  it('Hiroshima (580 m, 15 kt) → ≈ 235 m·kt⁻¹ᐟ³', () => {
    const z = scaledHeightOfBurst(580, 15);
    expect(z).toBeGreaterThan(230);
    expect(z).toBeLessThan(240);
  });

  it('Tsar Bomba (4 000 m, 50 000 kt) → ≈ 108 m·kt⁻¹ᐟ³', () => {
    const z = scaledHeightOfBurst(4_000, 50_000);
    expect(z).toBeGreaterThan(100);
    expect(z).toBeLessThan(120);
  });

  it('returns 0 for zero or negative yield', () => {
    expect(scaledHeightOfBurst(1_000, 0)).toBe(0);
    expect(scaledHeightOfBurst(1_000, -1)).toBe(0);
  });
});

describe('hobRegime', () => {
  it('surface burst: z = 0', () => expect(hobRegime(0)).toBe('SURFACE'));
  it('near-optimum: z = 200', () => expect(hobRegime(200)).toBe('OPTIMUM'));
  it('high airburst: z = 500', () => expect(hobRegime(500)).toBe('HIGH_AIRBURST'));
  it('stratospheric: z = 2000', () => expect(hobRegime(2_000)).toBe('STRATOSPHERIC'));
});

describe('hobBlastFactor (Needham 2018 / Glasstone Fig. 3.73)', () => {
  it('surface burst reduces 5 psi ring to ~85 % of the optimum-HOB baseline', () => {
    expect(hobBlastFactor(0)).toBeCloseTo(0.85, 2);
    expect(hobBlastFactor(49)).toBeCloseTo(0.85, 2);
  });

  it('optimum airburst band (150–300 m/kt^(1/3)) returns 1.50 — Mach-stem amplification', () => {
    // Phase 9 calibration: the surface-burst Kinney-Graham fit must
    // be amplified by the Mach-stem reflection factor at the optimum
    // HOB to recover the Glasstone Fig 3.74a observed airburst reach.
    expect(hobBlastFactor(200)).toBe(1.5);
    expect(hobBlastFactor(250)).toBe(1.5);
  });

  it('high-airburst band declines linearly to ~0.70 at 700 m/kt^(1/3)', () => {
    expect(hobBlastFactor(700)).toBeCloseTo(0.7, 2);
  });

  it('stratospheric burst collapses to ~0.25', () => {
    expect(hobBlastFactor(2_000)).toBeCloseTo(0.25, 2);
  });

  it('factor is monotonic non-increasing after the optimum band', () => {
    const samples = [300, 400, 500, 700, 1_000, 1_500, 2_000];
    for (let i = 1; i < samples.length; i += 1) {
      expect(hobBlastFactor(samples[i]!)).toBeLessThanOrEqual(hobBlastFactor(samples[i - 1]!));
    }
  });
});

describe('correctRadiusForHob', () => {
  it('Hiroshima-scaled HOB returns Mach-stem amplification (×1.5)', () => {
    const r = correctRadiusForHob(m(2_000), 580, 15);
    expect(r as number).toBeGreaterThan(2_900);
    expect(r as number).toBeLessThanOrEqual(3_100);
  });

  it('Surface burst cuts the radius by ~15 %', () => {
    const r = correctRadiusForHob(m(2_000), 0, 15);
    expect(r as number).toBeCloseTo(1_700, -1);
  });

  it('Stratospheric burst collapses the radius to ~25 %', () => {
    const r = correctRadiusForHob(m(2_000), 50_000, 1);
    expect(r as number).toBeLessThan(600);
  });
});
