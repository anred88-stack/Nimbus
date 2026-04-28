import { describe, expect, it } from 'vitest';
import { NONLINEAR_SHOALING_ALPHA, nonLinearShoalingAmplitude } from './nonLinearShoaling.js';

describe('nonLinearShoalingAmplitude (Madsen-Sorensen 1992)', () => {
  it('recovers Green linear amplitude when A ≪ h', () => {
    // 1 m wave on 100 m water: H/h = 0.01 → correction ≈ 1 - 0.003.
    const A = nonLinearShoalingAmplitude({ linearAmplitudeM: 1, localDepthM: 100 });
    expect(A).toBeGreaterThan(0.99);
    expect(A).toBeLessThanOrEqual(1);
  });

  it('caps the amplification at finite saturation when A → h', () => {
    // 10 m wave on 10 m water: H/h = 1, correction → 1/(1+α) ≈ 0.77.
    const A = nonLinearShoalingAmplitude({ linearAmplitudeM: 10, localDepthM: 10 });
    expect(A).toBeCloseTo(10 / (1 + NONLINEAR_SHOALING_ALPHA), 6);
  });

  it('output is monotonic in linear amplitude (no fold-over)', () => {
    let last = 0;
    for (const A of [0.1, 0.5, 1, 2, 5, 10, 20, 50]) {
      const out = nonLinearShoalingAmplitude({ linearAmplitudeM: A, localDepthM: 10 });
      expect(out).toBeGreaterThanOrEqual(last);
      last = out;
    }
  });

  it('correction strengthens as depth shrinks (steeper non-linearity)', () => {
    // Same incident amplitude (5 m), shallower water → stronger
    // correction → smaller corrected output relative to input.
    const deep = nonLinearShoalingAmplitude({ linearAmplitudeM: 5, localDepthM: 100 });
    const shelf = nonLinearShoalingAmplitude({ linearAmplitudeM: 5, localDepthM: 10 });
    const shore = nonLinearShoalingAmplitude({ linearAmplitudeM: 5, localDepthM: 5 });
    expect(deep / 5).toBeGreaterThan(shelf / 5);
    expect(shelf / 5).toBeGreaterThan(shore / 5);
  });

  it('returns input unchanged for non-positive amplitude or depth', () => {
    expect(nonLinearShoalingAmplitude({ linearAmplitudeM: 0, localDepthM: 10 })).toBe(0);
    expect(nonLinearShoalingAmplitude({ linearAmplitudeM: -1, localDepthM: 10 })).toBe(-1);
    expect(nonLinearShoalingAmplitude({ linearAmplitudeM: 5, localDepthM: 0 })).toBe(5);
  });

  it('honours an explicit α override (sensitivity-analysis hook)', () => {
    const noCorrection = nonLinearShoalingAmplitude({
      linearAmplitudeM: 5,
      localDepthM: 10,
      alpha: 0,
    });
    expect(noCorrection).toBe(5);
    const aggressive = nonLinearShoalingAmplitude({
      linearAmplitudeM: 5,
      localDepthM: 10,
      alpha: 0.8,
    });
    expect(aggressive).toBeLessThan(
      nonLinearShoalingAmplitude({ linearAmplitudeM: 5, localDepthM: 10 })
    );
  });

  it('Phase-19 calibration: α = 0.3 (GeoClaw NOAA benchmark 2)', () => {
    expect(NONLINEAR_SHOALING_ALPHA).toBe(0.3);
  });
});
