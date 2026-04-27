import { describe, expect, it } from 'vitest';
import {
  validateImpactInputs,
  validateExplosionInputs,
  validateEarthquakeInputs,
  validateVolcanoInputs,
  validateLandslideInputs,
} from './inputValidity.js';

describe('validateImpactInputs', () => {
  it('returns no warnings for a Tunguska-class input inside calibration', () => {
    const w = validateImpactInputs({
      impactorDiameterM: 60,
      impactVelocityMs: 15_000,
      impactorDensityKgM3: 3_000,
      impactAngleRad: Math.PI / 4,
    });
    expect(w).toEqual([]);
  });

  it('flags sub-meter impactors as extrapolation (strength regime)', () => {
    const w = validateImpactInputs({
      impactorDiameterM: 0.5,
      impactVelocityMs: 15_000,
      impactorDensityKgM3: 3_000,
      impactAngleRad: Math.PI / 4,
    });
    expect(w.some((x) => x.parameter === 'impactorDiameter')).toBe(true);
  });

  it('flags planetary-class impactors > 30 km', () => {
    const w = validateImpactInputs({
      impactorDiameterM: 50_000,
      impactVelocityMs: 15_000,
      impactorDensityKgM3: 3_000,
      impactAngleRad: Math.PI / 4,
    });
    expect(w.some((x) => x.parameter === 'impactorDiameter')).toBe(true);
  });

  it('flags subsonic and ultra-cometary velocities', () => {
    const slow = validateImpactInputs({
      impactorDiameterM: 100,
      impactVelocityMs: 1_000,
      impactorDensityKgM3: 3_000,
      impactAngleRad: Math.PI / 4,
    });
    const fast = validateImpactInputs({
      impactorDiameterM: 100,
      impactVelocityMs: 100_000,
      impactorDensityKgM3: 3_000,
      impactAngleRad: Math.PI / 4,
    });
    expect(slow.some((x) => x.parameter === 'impactVelocity')).toBe(true);
    expect(fast.some((x) => x.parameter === 'impactVelocity')).toBe(true);
  });

  it('flags shallow ocean (depth < L) for impact-tsunami formula', () => {
    const w = validateImpactInputs({
      impactorDiameterM: 100,
      impactVelocityMs: 15_000,
      impactorDensityKgM3: 3_000,
      impactAngleRad: Math.PI / 4,
      waterDepthM: 50,
    });
    expect(w.some((x) => x.parameter === 'waterDepth')).toBe(true);
  });
});

describe('validateExplosionInputs', () => {
  it('Tsar Bomba 50 Mt: no warning', () => {
    const w = validateExplosionInputs({ yieldMegatons: 50, heightOfBurstM: 4_000 });
    expect(w).toEqual([]);
  });

  it('flags > 200 Mt as above Sublette envelope', () => {
    const w = validateExplosionInputs({ yieldMegatons: 500, heightOfBurstM: 0 });
    expect(w.some((x) => x.parameter === 'yieldMegatons')).toBe(true);
  });

  it('flags exoatmospheric HOB > 50 km', () => {
    const w = validateExplosionInputs({ yieldMegatons: 1, heightOfBurstM: 100_000 });
    expect(w.some((x) => x.parameter === 'heightOfBurst')).toBe(true);
  });
});

describe('validateEarthquakeInputs', () => {
  it('Tōhoku Mw 9.1 / 30 km depth: no warning', () => {
    const w = validateEarthquakeInputs({ magnitude: 9.1, depthM: 30_000 });
    expect(w).toEqual([]);
  });

  it('flags Mw > 9.5 (above largest observed)', () => {
    const w = validateEarthquakeInputs({ magnitude: 10.0, depthM: 30_000 });
    expect(w.some((x) => x.parameter === 'magnitude')).toBe(true);
  });

  it('flags Mw < 4 (below W&C calibration)', () => {
    const w = validateEarthquakeInputs({ magnitude: 3.5, depthM: 10_000 });
    expect(w.some((x) => x.parameter === 'magnitude')).toBe(true);
  });

  it('flags deep-focus events > 100 km', () => {
    const w = validateEarthquakeInputs({ magnitude: 7.0, depthM: 200_000 });
    expect(w.some((x) => x.parameter === 'depth')).toBe(true);
  });
});

describe('validateVolcanoInputs', () => {
  it('Pinatubo V̇ 2e5 / V 1e10: no warning', () => {
    const w = validateVolcanoInputs({
      volumeEruptionRateM3s: 2e5,
      totalEjectaVolumeM3: 1e10,
    });
    expect(w).toEqual([]);
  });

  it('flags V̇ < 1 m³/s (lava fountain regime)', () => {
    const w = validateVolcanoInputs({
      volumeEruptionRateM3s: 0.1,
      totalEjectaVolumeM3: 1e8,
    });
    expect(w.some((x) => x.parameter === 'volumeEruptionRate')).toBe(true);
  });

  it('flags supereruption V > 10¹³ m³', () => {
    const w = validateVolcanoInputs({
      volumeEruptionRateM3s: 1e6,
      totalEjectaVolumeM3: 1e14,
    });
    expect(w.some((x) => x.parameter === 'totalEjectaVolume')).toBe(true);
  });
});

describe('validateLandslideInputs', () => {
  it('Storegga (V=3e12, θ=5°): no warning', () => {
    const w = validateLandslideInputs({
      volumeM3: 3e12,
      slopeAngleDeg: 5,
      meanOceanDepthM: 1500,
    });
    expect(w).toEqual([]);
  });

  it('flags V > 10¹³ m³ above Storegga', () => {
    const w = validateLandslideInputs({
      volumeM3: 5e13,
      slopeAngleDeg: 10,
      meanOceanDepthM: 2000,
    });
    expect(w.some((x) => x.parameter === 'volumeM3')).toBe(true);
  });

  it('flags ultra-flat or near-vertical slopes', () => {
    const flat = validateLandslideInputs({
      volumeM3: 1e9,
      slopeAngleDeg: 0.5,
      meanOceanDepthM: 500,
    });
    const cliff = validateLandslideInputs({
      volumeM3: 1e9,
      slopeAngleDeg: 85,
      meanOceanDepthM: 500,
    });
    expect(flat.some((x) => x.parameter === 'slopeAngleDeg')).toBe(true);
    expect(cliff.some((x) => x.parameter === 'slopeAngleDeg')).toBe(true);
  });
});
