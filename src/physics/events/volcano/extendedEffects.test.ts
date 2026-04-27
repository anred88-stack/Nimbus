import { describe, expect, it } from 'vitest';
import { m } from '../../units.js';
import {
  ashfallArea1mm,
  climateCoolingFromVEI,
  laharRunout,
  pdcRunoutEnergyLine,
} from './extendedEffects.js';

describe('pdcRunoutEnergyLine (Dade & Huppert 1998)', () => {
  it('VEI 6 Krakatoa plume 37 km → energy-line runout ≈ 370 km (upper bound)', () => {
    const L = pdcRunoutEnergyLine(m(37_000)) as number;
    expect(L).toBeCloseTo(370_000, -3);
  });

  it('scales linearly with plume height at fixed slope', () => {
    const a = pdcRunoutEnergyLine(m(10_000)) as number;
    const b = pdcRunoutEnergyLine(m(20_000)) as number;
    expect(b / a).toBeCloseTo(2, 6);
  });

  it('custom slope 0.08 (very mobile) gives longer runout than 0.15', () => {
    const mobile = pdcRunoutEnergyLine(m(20_000), 0.08) as number;
    const dense = pdcRunoutEnergyLine(m(20_000), 0.15) as number;
    expect(mobile).toBeGreaterThan(dense);
  });

  it('returns 0 for zero or negative inputs', () => {
    expect(pdcRunoutEnergyLine(m(0))).toBe(0);
    expect(pdcRunoutEnergyLine(m(10_000), 0)).toBe(0);
  });
});

describe('climateCoolingFromVEI (Robock 2000 / Toohey & Sigl 2017)', () => {
  it('VEI 6 Pinatubo / Krakatau-class → ΔT ≈ −0.5 K (observed −0.5)', () => {
    // Calibration target: the Pinatubo 1991 value of −0.5 K, which
    // the formula now lands within ~10 %. Same-VEI variance is
    // real (Krakatau 1883 ≈ −0.55 K, Pinatubo 1991 ≈ −0.5 K) and
    // is meant to be read off the published ±70 % band, not the
    // point estimate.
    const dT = climateCoolingFromVEI(6);
    expect(dT).toBeGreaterThan(-0.7);
    expect(dT).toBeLessThan(-0.4);
  });

  it('VEI 7 Tambora-class → ΔT ≈ −1.2 K (observed −1.5, wide uncertainty)', () => {
    const dT = climateCoolingFromVEI(7);
    expect(dT).toBeGreaterThan(-1.5);
    expect(dT).toBeLessThan(-0.7);
  });

  it('VEI 8 Toba-class → saturated ΔT around −2.5 K (observed band −3…−5 K)', () => {
    // Hard saturation at −5 K kicks in for super-eruptions; the
    // formula returns ~−2.58 K at VEI 8, well above the floor.
    const dT = climateCoolingFromVEI(8);
    expect(dT).toBeGreaterThan(-5);
    expect(dT).toBeLessThan(-2);
  });

  it('hard-floors at −5 K for arbitrarily large VEI', () => {
    expect(climateCoolingFromVEI(10)).toBe(-5);
    expect(climateCoolingFromVEI(15)).toBe(-5);
  });

  it('grows ≈ 2.2× per unit VEI within the unsaturated regime', () => {
    expect(climateCoolingFromVEI(5) / climateCoolingFromVEI(4)).toBeCloseTo(2.2, 3);
  });

  it('returns 0 for VEI < 1', () => {
    expect(climateCoolingFromVEI(0)).toBe(0);
  });
});

describe('ashfallArea1mm (Walker 1980 / Pyle 1989 simplified)', () => {
  it('VEI 5 (1 km³) → ~50 000-70 000 km² (MSH 1980 calibration)', () => {
    // Phase 10 audit: prefactor was 3 000 (off by factor 25);
    // re-calibrated to 60 000 against MSH 1980 (V≈1 km³, observed
    // ~50 000 km²) and Pinatubo 1991 (Pyle 1989 dataset).
    const areaM2 = ashfallArea1mm(1e9); // 1 km³
    const areaKm2 = areaM2 / 1e6;
    expect(areaKm2).toBeGreaterThan(45_000);
    expect(areaKm2).toBeLessThan(75_000);
  });

  it('VEI 6 (10 km³) → ~300 000-500 000 km² (Pinatubo-class)', () => {
    // Pinatubo 1991 (V ≈ 10 km³ DRE) observed ~500 000 km² 1mm
    // isopach. K=60 000 with V^0.8 gives 379 000 km² — within ±factor-2.
    const areaKm2 = ashfallArea1mm(10e9) / 1e6;
    expect(areaKm2).toBeGreaterThan(300_000);
    expect(areaKm2).toBeLessThan(500_000);
  });

  it('returns 0 for zero volume', () => {
    expect(ashfallArea1mm(0)).toBe(0);
  });
});

describe('laharRunout (Iverson 1997 / Vallance & Iverson 2015)', () => {
  it('Mt St Helens lahar V = 5 × 10⁷ m³ → L ~ 20–80 km (observed 50 km)', () => {
    const L = laharRunout(5e7) as number;
    expect(L / 1_000).toBeGreaterThan(20);
    expect(L / 1_000).toBeLessThan(80);
  });

  it('grows sub-linearly with volume (V^0.38)', () => {
    const a = laharRunout(1e7) as number;
    const b = laharRunout(1e9) as number;
    // V increases 100× → L increases (100)^0.38 ≈ 5.75×
    expect(b / a).toBeCloseTo(Math.pow(100, 0.38), 2);
  });

  it('returns 0 for zero or negative volume', () => {
    expect(laharRunout(0)).toBe(0);
    expect(laharRunout(-1)).toBe(0);
  });
});
