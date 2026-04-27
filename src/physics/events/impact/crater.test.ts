import { describe, expect, it } from 'vitest';
import {
  CHONDRITIC_DENSITY,
  CRUSTAL_ROCK_DENSITY,
  SIMPLE_COMPLEX_TRANSITION_EARTH,
  STANDARD_GRAVITY,
} from '../../constants.js';
import { deg, degreesToRadians, m as meters, mps } from '../../units.js';
import { craterDepth, finalCraterDiameter, transientCraterDiameter } from './crater.js';

const FORTY_FIVE_DEG = degreesToRadians(deg(45));

describe('transientCraterDiameter (Collins et al. 2005, Eq. 21)', () => {
  it('matches hand-computed pi-group value for a Chicxulub-class impactor', () => {
    const Dtc = transientCraterDiameter({
      impactorDiameter: meters(15_000),
      impactVelocity: mps(20_000),
      impactorDensity: CHONDRITIC_DENSITY,
      targetDensity: CRUSTAL_ROCK_DENSITY,
      impactAngle: FORTY_FIVE_DEG,
    }) as number;
    const expected =
      1.161 *
      (3000 / 2700) ** (1 / 3) *
      15_000 ** 0.78 *
      20_000 ** 0.44 *
      STANDARD_GRAVITY ** -0.22 *
      Math.sin(Math.PI / 4) ** (1 / 3);
    // Expected ≈ 9.17 × 10⁴ m. Pin to the algebraic value at 1 cm.
    expect(Dtc).toBeCloseTo(expected, 2);
  });

  it('scales with sin(θ)^(1/3): vertical impact is larger than 45°', () => {
    const base = {
      impactorDiameter: meters(1_000),
      impactVelocity: mps(20_000),
      impactorDensity: CHONDRITIC_DENSITY,
      targetDensity: CRUSTAL_ROCK_DENSITY,
    };
    const vertical = transientCraterDiameter({
      ...base,
      impactAngle: degreesToRadians(deg(90)),
    }) as number;
    const oblique = transientCraterDiameter({
      ...base,
      impactAngle: FORTY_FIVE_DEG,
    }) as number;
    // Ratio predicted by the formula: 1 / sin(45°)^(1/3) = 2^(1/6) ≈ 1.1225.
    expect(vertical / oblique).toBeCloseTo(2 ** (1 / 6), 10);
  });

  it('accepts a non-Earth surface gravity (denser lunar target, same inputs → larger crater)', () => {
    const earth = transientCraterDiameter({
      impactorDiameter: meters(1_000),
      impactVelocity: mps(15_000),
      impactorDensity: CHONDRITIC_DENSITY,
      targetDensity: CRUSTAL_ROCK_DENSITY,
      impactAngle: FORTY_FIVE_DEG,
    }) as number;
    const moon = transientCraterDiameter({
      impactorDiameter: meters(1_000),
      impactVelocity: mps(15_000),
      impactorDensity: CHONDRITIC_DENSITY,
      targetDensity: CRUSTAL_ROCK_DENSITY,
      impactAngle: FORTY_FIVE_DEG,
      surfaceGravity: 1.62,
    }) as number;
    // Pi-scaling: D ∝ g^(−0.22); lower g gives a larger transient crater.
    expect(moon).toBeGreaterThan(earth);
    expect(moon / earth).toBeCloseTo((1.62 / STANDARD_GRAVITY) ** -0.22, 6);
  });
});

describe('finalCraterDiameter (Collins et al. 2005, Eqs. 22 & 27)', () => {
  it('uses the simple-crater branch below the transition', () => {
    const tiny = meters(1_000); // 1.25 × 1000 = 1250 m < 3200 m
    expect(finalCraterDiameter(tiny) as number).toBeCloseTo(1250, 8);
  });

  it('uses the complex-crater branch above the transition', () => {
    const large = meters(50_000);
    const expected = (1.17 * 50_000 ** 1.13) / 3200 ** 0.13;
    expect(finalCraterDiameter(large) as number).toBeCloseTo(expected, 2);
  });

  it('reproduces the Chicxulub final crater within 10 % (L = 15 km, v = 20 km/s)', () => {
    const Dtc = transientCraterDiameter({
      impactorDiameter: meters(15_000),
      impactVelocity: mps(20_000),
      impactorDensity: CHONDRITIC_DENSITY,
      targetDensity: CRUSTAL_ROCK_DENSITY,
      impactAngle: FORTY_FIVE_DEG,
    });
    const Dfr = finalCraterDiameter(Dtc) as number;
    // Chicxulub crater rim-to-rim: ≈180 km (Morgan et al. 2016, IODP/ICDP
    // drilling campaign). The formula predicts ≈166 km; within 10 %.
    const expected = 180_000;
    expect(Math.abs(Dfr - expected) / expected).toBeLessThan(0.1);
  });
});

describe('craterDepth (Pike 1980)', () => {
  it('gives ≈ 1/5 of diameter for simple craters', () => {
    const D = meters(1_000);
    expect(craterDepth(D) as number).toBeCloseTo(196, 3);
  });

  it('gives the Pike (1980) complex-crater depth above the transition', () => {
    const D = meters(100_000); // 100 km
    const expected = 1000 * 1.044 * (100_000 / 1000) ** 0.301;
    // ≈ 4167 m; complex craters are much shallower than simple ones of the
    // same diameter (would have been 19 600 m under the simple rule).
    expect(craterDepth(D) as number).toBeCloseTo(expected, 3);
  });

  it('Chicxulub complex crater depth is on the order of 5 km', () => {
    const depth = craterDepth(meters(180_000)) as number;
    expect(depth).toBeGreaterThan(4_000);
    expect(depth).toBeLessThan(6_000);
  });

  it('accepts a custom transition (e.g. Mars ≈ 7 km)', () => {
    const D = meters(4_000); // simple on Mars, complex on Earth
    const earthDepth = craterDepth(D, SIMPLE_COMPLEX_TRANSITION_EARTH) as number;
    const marsDepth = craterDepth(D, meters(7_000)) as number;
    // On Earth (complex branch): 1044 × 4^0.301 = 1044 × 1.232 = 1287 m.
    // On Mars (still simple):    0.196 × 4000 = 784 m.
    expect(marsDepth).toBeLessThan(earthDepth);
  });
});
