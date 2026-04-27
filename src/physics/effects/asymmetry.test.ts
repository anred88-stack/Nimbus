import { describe, expect, it } from 'vitest';
import { m, mps } from '../units.js';
import {
  ISOTROPIC_RING,
  compose,
  craterAsymmetry,
  ejectaButterflyAsymmetry,
  obliqueImpactCentreOffset,
  obliqueImpactRingAsymmetry,
  windDriftAsymmetry,
} from './asymmetry.js';

describe('ISOTROPIC_RING', () => {
  it('describes a unit-multiplier, zero-offset circle', () => {
    expect(ISOTROPIC_RING.semiMajorMultiplier).toBe(1);
    expect(ISOTROPIC_RING.semiMinorMultiplier).toBe(1);
    expect(ISOTROPIC_RING.centerOffsetMeters).toBe(0);
  });
});

describe('craterAsymmetry — Pierazzo & Melosh / Gault & Wedekind envelope', () => {
  it('returns a circle for vertical (90°) impacts', () => {
    const asym = craterAsymmetry(90, 45);
    expect(asym.semiMajorMultiplier).toBe(1);
    expect(asym.semiMinorMultiplier).toBe(1);
    expect(asym.centerOffsetMeters).toBe(0);
  });

  it('still elongates measurably at the canonical 45° preset angle', () => {
    // Earlier revisions snapped this to a pure circle above 45°, which
    // hid the physically real ≈ 11 % cross-range compression; the
    // smooth envelope keeps Chicxulub / Meteor Crater visibly oblique.
    const asym = craterAsymmetry(45, 90);
    // sin(45°)^(1/3) ≈ 0.891 → 11 % compression on the cross-range axis.
    expect(asym.semiMinorMultiplier).toBeCloseTo(0.891, 3);
    expect(asym.semiMajorMultiplier).toBe(1);
  });

  it('shows only mild compression at θ = 60° (within Gault & Wedekind scatter)', () => {
    const asym = craterAsymmetry(60, 0);
    // sin(60°)^(1/3) ≈ 0.953 → b/a still ≥ 0.95 — within experimental scatter of 1.0
    expect(asym.semiMinorMultiplier).toBeGreaterThanOrEqual(0.94);
    expect(asym.semiMinorMultiplier).toBeLessThan(1);
  });

  it('elongates downrange below 45° per the cube-root sin envelope', () => {
    const asym30 = craterAsymmetry(30, 0);
    // sin(30°)^(1/3) = 0.5^(1/3) ≈ 0.7937
    expect(asym30.semiMinorMultiplier).toBeCloseTo(0.7937, 3);
    expect(asym30.semiMajorMultiplier).toBe(1);
  });

  it('matches Gault & Wedekind 1978 Fig. 5 within ±0.06 across 5°–60°', () => {
    // Approximate b/a values read from Gault & Wedekind 1978 Fig. 5
    // for impactor angles near 5°, 15°, 30°, 45°, 60° (within ±0.05 of
    // the published curve — that is the data scatter band).
    const expected: { angle: number; ba: number }[] = [
      { angle: 5, ba: 0.45 }, // floored at 0.40 in our envelope
      { angle: 15, ba: 0.65 },
      { angle: 30, ba: 0.79 },
      { angle: 45, ba: 0.89 },
      { angle: 60, ba: 0.95 },
    ];
    for (const { angle, ba } of expected) {
      const asym = craterAsymmetry(angle, 0);
      expect(Math.abs(asym.semiMinorMultiplier - ba)).toBeLessThanOrEqual(0.06);
    }
  });

  it('clamps the semi-minor multiplier at 0.40 to avoid degenerate ellipses', () => {
    const grazing = craterAsymmetry(1, 0);
    expect(grazing.semiMinorMultiplier).toBe(0.4);
  });

  it('normalises the azimuth to [0, 360)', () => {
    expect(craterAsymmetry(30, 720).azimuthDeg).toBe(0);
    expect(craterAsymmetry(30, -90).azimuthDeg).toBe(270);
    expect(craterAsymmetry(30, 359.5).azimuthDeg).toBeCloseTo(359.5, 1);
  });

  it('handles invalid inputs by returning the isotropic ring', () => {
    expect(craterAsymmetry(NaN, 90)).toEqual({ ...ISOTROPIC_RING, azimuthDeg: 90 });
    expect(craterAsymmetry(0, 90)).toEqual({ ...ISOTROPIC_RING, azimuthDeg: 90 });
    expect(craterAsymmetry(-15, 90)).toEqual({ ...ISOTROPIC_RING, azimuthDeg: 90 });
  });
});

describe('obliqueImpactRingAsymmetry — Pierazzo & Artemieva 2003 envelope', () => {
  it('returns a circle for vertical impacts', () => {
    const op = obliqueImpactRingAsymmetry(90, 0, 'overpressure');
    const th = obliqueImpactRingAsymmetry(90, 0, 'thermal');
    expect(op).toEqual({ ...ISOTROPIC_RING, azimuthDeg: 0 });
    expect(th).toEqual({ ...ISOTROPIC_RING, azimuthDeg: 0 });
  });

  it('elongates the thermal contour more than the overpressure (Pierazzo & Artemieva 2003)', () => {
    const op = obliqueImpactRingAsymmetry(15, 90, 'overpressure');
    const th = obliqueImpactRingAsymmetry(15, 90, 'thermal');
    expect(th.semiMajorMultiplier).toBeGreaterThan(op.semiMajorMultiplier);
  });

  it('caps the overpressure boost at ≤ 30 % even at extreme grazing', () => {
    const op = obliqueImpactRingAsymmetry(1, 0, 'overpressure');
    expect(op.semiMajorMultiplier).toBeLessThanOrEqual(1.3 + 1e-9);
  });

  it('caps the thermal boost at ≤ 40 %', () => {
    const th = obliqueImpactRingAsymmetry(1, 0, 'thermal');
    expect(th.semiMajorMultiplier).toBeLessThanOrEqual(1.4 + 1e-9);
  });

  it('produces visible boost at the canonical 45° preset angle', () => {
    // sin(45°) ≈ 0.707, obliquity = 0.293
    // overpressure: 0.30 * 0.293 ≈ 0.088 (~8.8 % boost)
    // thermal:      0.40 * 0.293 ≈ 0.117 (~11.7 % boost)
    const op = obliqueImpactRingAsymmetry(45, 0, 'overpressure');
    const th = obliqueImpactRingAsymmetry(45, 0, 'thermal');
    expect(op.semiMajorMultiplier).toBeGreaterThan(1.07);
    expect(th.semiMajorMultiplier).toBeGreaterThan(1.1);
  });

  it('compresses the cross-range axis (semi-minor < 1) at non-vertical angles', () => {
    const op30 = obliqueImpactRingAsymmetry(30, 0, 'overpressure');
    expect(op30.semiMinorMultiplier).toBeLessThan(1);
    expect(op30.semiMinorMultiplier).toBeGreaterThanOrEqual(0.5);
  });

  it('floors the cross-range compression at 0.50 to keep a recognisable ellipse', () => {
    const grazing = obliqueImpactRingAsymmetry(1, 0, 'thermal');
    expect(grazing.semiMinorMultiplier).toBeGreaterThanOrEqual(0.5);
  });
});

describe('obliqueImpactCentreOffset', () => {
  it('returns 0 for vertical impacts', () => {
    expect(obliqueImpactCentreOffset(90, 1_000)).toBe(0);
  });

  it('returns 0 for invalid inputs', () => {
    expect(obliqueImpactCentreOffset(NaN, 1_000)).toBe(0);
    expect(obliqueImpactCentreOffset(30, 0)).toBe(0);
    expect(obliqueImpactCentreOffset(30, -500)).toBe(0);
  });

  it('shifts the centre downrange by ≈ 10 % of R at θ = 30°', () => {
    // 0.2 · (1 − sin 30°) · R = 0.2 · 0.5 · R = 0.10 R
    expect(obliqueImpactCentreOffset(30, 1_000)).toBeCloseTo(100, 3);
  });

  it('caps the offset at ≤ 20 % of R for grazing impacts', () => {
    expect(obliqueImpactCentreOffset(1, 1_000)).toBeLessThanOrEqual(200 + 1e-9);
  });
});

describe('windDriftAsymmetry — Glasstone & Dolan 1977 §7.20', () => {
  it('returns the isotropic ring with no wind', () => {
    const asym = windDriftAsymmetry({
      nominalRadius: m(10_000),
      yieldKilotons: 1_000,
      windSpeed: mps(0),
      windDirectionDeg: 90,
    });
    expect(asym).toEqual(ISOTROPIC_RING);
  });

  it('reproduces the Glasstone Eq. 7.20.1 thermal pulse duration (1 Mt → ≈ 1 s)', () => {
    // t_max ≈ 0.032 · W^0.5 s, W in kilotons. 1 Mt = 1000 kt → t ≈ 1.012 s.
    // For 10 m/s wind, drift ≈ 10 m. Against a 10 km radius, that is
    // 0.001 of R → tiny but non-zero offset.
    const asym = windDriftAsymmetry({
      nominalRadius: m(10_000),
      yieldKilotons: 1_000,
      windSpeed: mps(10),
      windDirectionDeg: 90,
    });
    expect(asym.centerOffsetMeters).toBeCloseTo(10.12, 1);
    expect(asym.semiMajorMultiplier).toBeGreaterThan(1);
    expect(asym.semiMajorMultiplier).toBeLessThan(1.01);
  });

  it('produces ≈ 200 m drift for a 50 Mt jet-stream scenario (sanity)', () => {
    // 50 Mt = 50_000 kt → t ≈ 0.032 · 223.6 ≈ 7.16 s
    // 30 m/s wind → drift ≈ 215 m
    const asym = windDriftAsymmetry({
      nominalRadius: m(50_000),
      yieldKilotons: 50_000,
      windSpeed: mps(30),
      windDirectionDeg: 270,
    });
    expect(asym.centerOffsetMeters).toBeGreaterThan(150);
    expect(asym.centerOffsetMeters).toBeLessThan(300);
    expect(asym.azimuthDeg).toBe(270);
  });

  it('saturates the major-axis boost at ≤ 25 % even for absurd winds', () => {
    const asym = windDriftAsymmetry({
      nominalRadius: m(100),
      yieldKilotons: 50_000,
      windSpeed: mps(200),
      windDirectionDeg: 0,
    });
    expect(asym.semiMajorMultiplier).toBeLessThanOrEqual(1.25 + 1e-9);
  });

  it('rejects invalid inputs', () => {
    const calm = windDriftAsymmetry({
      nominalRadius: m(0),
      yieldKilotons: 1,
      windSpeed: mps(10),
      windDirectionDeg: 0,
    });
    expect(calm).toEqual(ISOTROPIC_RING);
  });
});

describe('ejectaButterflyAsymmetry — Schultz & Anderson 1996', () => {
  it('returns the isotropic ring for symmetric (steep) impacts', () => {
    const asym = ejectaButterflyAsymmetry(0, 90, m(1_000));
    expect(asym).toEqual({ ...ISOTROPIC_RING, azimuthDeg: 90 });
  });

  it('reproduces the inline factors (1 + 0.4 f, 1 − 0.25 f, 0.3 R · f)', () => {
    const f = 0.5;
    const R = 10_000;
    const asym = ejectaButterflyAsymmetry(f, 0, m(R));
    expect(asym.semiMajorMultiplier).toBeCloseTo(1 + 0.4 * f, 6);
    expect(asym.semiMinorMultiplier).toBeCloseTo(1 - 0.25 * f, 6);
    expect(asym.centerOffsetMeters).toBeCloseTo(0.3 * R * f, 6);
  });

  it('clamps the asymmetry factor to [0, 1]', () => {
    const above = ejectaButterflyAsymmetry(2, 0, m(1_000));
    expect(above.semiMajorMultiplier).toBeCloseTo(1.4, 6);
    const below = ejectaButterflyAsymmetry(-0.5, 0, m(1_000));
    expect(below).toEqual({ ...ISOTROPIC_RING, azimuthDeg: 0 });
  });
});

describe('compose', () => {
  it('multiplies multipliers and sums offsets', () => {
    const a = {
      semiMajorMultiplier: 1.1,
      semiMinorMultiplier: 0.9,
      azimuthDeg: 45,
      centerOffsetMeters: 100,
    };
    const b = {
      semiMajorMultiplier: 1.2,
      semiMinorMultiplier: 0.8,
      azimuthDeg: 45,
      centerOffsetMeters: 50,
    };
    const composed = compose(a, b);
    expect(composed.semiMajorMultiplier).toBeCloseTo(1.32, 6);
    expect(composed.semiMinorMultiplier).toBeCloseTo(0.72, 6);
    expect(composed.centerOffsetMeters).toBe(150);
    expect(composed.azimuthDeg).toBe(45);
  });
});
