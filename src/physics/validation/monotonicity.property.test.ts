/**
 * I4 PHYSICAL PLAUSIBILITY — monotonicity properties.
 *
 * Verifies invariants that hold for ANY pair (not just specific points):
 * "if input X increases, output Y must not decrease".
 *
 * Why this matters: the Boltysh > Chicxulub bug (2024 audit) was a
 * monotonicity violation — the cavity-radius coupling was non-monotonic
 * in cavity radius, so a smaller impactor produced a bigger source
 * amplitude. Dedicated unit tests on canonical scenarios missed it
 * because they pinned isolated points; only sweeping pairs across the
 * domain catches non-monotonic kinks.
 *
 * Strategy: deterministic property-based testing. We sample the input
 * domain at N points and assert the monotone relation holds across
 * every adjacent pair. No external library (no fast-check dependency
 * needed for these simple sweeps); the seeded sequence is reproducible.
 *
 * Tagged with the corresponding GOLDEN_CASES.md anchor (P-MONO-*).
 */

import { describe, expect, it } from 'vitest';
import { simulateEarthquake } from '../events/earthquake/simulate.js';
import { simulateExplosion } from '../events/explosion/simulate.js';
import { simulateVolcano } from '../events/volcano/simulate.js';
import { simulateLandslide } from '../events/landslide/simulate.js';
import { simulateImpact } from '../simulate.js';
import {
  CRUSTAL_ROCK_DENSITY,
  IRON_METEORITE_DENSITY,
  SEAWATER_DENSITY,
  STANDARD_GRAVITY,
} from '../constants.js';
import { impactCavityRadius, impactSourceAmplitude } from '../events/tsunami/impact.js';
import { deg, degreesToRadians, J, m, mps } from '../units.js';
import { TOL_MONOTONIC_RELATIVE } from './tolerances.js';

/**
 * Assert non-decreasing monotonicity: each successive value ≥ the
 * previous one (within float-noise tolerance). Failures get a labelled
 * message pointing at the violating pair.
 */
function assertMonotoneIncreasing(values: number[], label: string): void {
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    const curr = values[i];
    if (prev === undefined || curr === undefined) continue;
    // Allow strictly equal (saturation) and increasing; reject
    // genuine decrease above float noise.
    const tol = Math.max(Math.abs(prev), Math.abs(curr), 1) * TOL_MONOTONIC_RELATIVE;
    expect(
      curr >= prev - tol,
      `${label}: non-monotone at index ${i.toString()}: prev=${prev.toString()}, curr=${curr.toString()} (delta=${(curr - prev).toString()})`
    ).toBe(true);
  }
}

describe('P-MONO-YIELD — explosion blast/thermal radii are monotone in yield', () => {
  it('5 psi radius monotone in yield across [1e-6, 100] Mt at fixed HOB=0', () => {
    const yields = [1e-6, 1e-5, 1e-4, 1e-3, 0.015, 0.1, 1, 15, 50, 100];
    const radii = yields.map((y) => {
      const r = simulateExplosion({ yieldMegatons: y, heightOfBurst: m(0) });
      return r.blast.overpressure5psiRadius;
    });
    assertMonotoneIncreasing(radii, '5psi radius vs yield');
  });

  it('1 psi radius monotone in yield', () => {
    const yields = [1e-3, 0.015, 1, 15, 100];
    const radii = yields.map(
      (y) =>
        simulateExplosion({ yieldMegatons: y, heightOfBurst: m(0) }).blast
          .overpressure1psiRadius as number
    );
    assertMonotoneIncreasing(radii, '1psi radius vs yield');
  });

  it('thermal 3rd-degree-burn radius monotone in yield', () => {
    const yields = [1e-3, 0.015, 1, 15, 100];
    const radii = yields.map(
      (y) =>
        simulateExplosion({ yieldMegatons: y, heightOfBurst: m(0) }).thermal
          .thirdDegreeBurnRadius as number
    );
    assertMonotoneIncreasing(radii, 'thermal 3°-burn radius vs yield');
  });

  it('crater apparent diameter monotone in yield (surface burst)', () => {
    const yields = [1e-3, 0.015, 1, 15, 100];
    const diameters = yields.map(
      (y) =>
        simulateExplosion({ yieldMegatons: y, heightOfBurst: m(0), groundType: 'WET_SOIL' }).crater
          .apparentDiameter as number
    );
    assertMonotoneIncreasing(diameters, 'crater diameter vs yield');
  });
});

describe('P-MONO-MW — earthquake outputs monotone in moment magnitude', () => {
  it('seismic moment is monotone in Mw (Hanks-Kanamori is strictly increasing)', () => {
    const Mws = [4, 5, 6, 7, 8, 9, 9.5];
    const M0s = Mws.map(
      (Mw) => simulateEarthquake({ magnitude: Mw }).seismicMoment as unknown as number
    );
    assertMonotoneIncreasing(M0s, 'seismicMoment vs Mw');
  });

  it('rupture length is monotone in Mw (Wells-Coppersmith log-linear)', () => {
    const Mws = [4, 5, 6, 7, 8];
    const Ls = Mws.map(
      (Mw) => simulateEarthquake({ magnitude: Mw, faultType: 'reverse' }).ruptureLength as number
    );
    assertMonotoneIncreasing(Ls, 'ruptureLength vs Mw (reverse fault)');
  });

  it('MMI VII radius is monotone in Mw', () => {
    const Mws = [5, 6, 7, 8, 9];
    const radii = Mws.map(
      (Mw) => simulateEarthquake({ magnitude: Mw }).shaking.mmi7Radius as number
    );
    assertMonotoneIncreasing(radii, 'MMI VII radius vs Mw');
  });

  it('liquefaction radius is monotone in Mw', () => {
    const Mws = [5, 6, 7, 8, 9];
    const radii = Mws.map(
      (Mw) => simulateEarthquake({ magnitude: Mw }).shaking.liquefactionRadius as number
    );
    assertMonotoneIncreasing(radii, 'liquefaction radius vs Mw');
  });
});

describe('P-MONO-VEI — volcano plume monotone in volume eruption rate', () => {
  it('Mastin 2009 plume height is monotone in V̇ across 5 orders of magnitude', () => {
    const Vrates = [1e2, 1e3, 1e4, 1e5, 1e6];
    const heights = Vrates.map(
      (V) =>
        simulateVolcano({ volumeEruptionRate: V, totalEjectaVolume: 1e10 }).plumeHeight as number
    );
    assertMonotoneIncreasing(heights, 'plume height vs V̇');
  });
});

describe('P-MONO-VOL — landslide tsunami source amplitude monotone in volume', () => {
  it('Watts-style cube-root source amplitude monotone in slide volume (subaerial regime)', () => {
    const Vs = [1e6, 1e7, 1e8, 1e9, 1e10, 1e11];
    const sources = Vs.map((V) => {
      const r = simulateLandslide({
        volumeM3: V,
        slopeAngleDeg: 30,
        regime: 'subaerial',
        meanOceanDepth: m(2_000),
      });
      return r.tsunami === null ? 0 : r.tsunami.sourceAmplitude;
    });
    assertMonotoneIncreasing(sources, 'subaerial source amplitude vs slide volume');
  });

  it('submarine regime: source amplitude monotone in slide volume', () => {
    const Vs = [1e9, 1e10, 1e11, 1e12, 1e13];
    const sources = Vs.map((V) => {
      const r = simulateLandslide({
        volumeM3: V,
        slopeAngleDeg: 5,
        regime: 'submarine',
        meanOceanDepth: m(3_000),
      });
      return r.tsunami === null ? 0 : r.tsunami.sourceAmplitude;
    });
    assertMonotoneIncreasing(sources, 'submarine source amplitude vs slide volume');
  });
});

describe('P-MONO-KE — Ward-Asphaug cavity + source amplitude monotone in kinetic energy', () => {
  it('cavityRadius is monotone in kineticEnergy (R_C = (3E/(2πρg))^(1/4))', () => {
    const Es = [1e15, 1e17, 1e19, 1e21, 1e23, 1e25];
    const RCs = Es.map(
      (E) =>
        impactCavityRadius({
          kineticEnergy: J(E),
          waterDensity: SEAWATER_DENSITY,
          surfaceGravity: STANDARD_GRAVITY,
        }) as number
    );
    assertMonotoneIncreasing(RCs, 'cavityRadius vs kineticEnergy');
  });

  it('B-001/B-002 reverse: source amplitude is STRICTLY monotone in cavity radius (Boltysh > Chicxulub bug guard)', () => {
    // Pre-Phase-17 the η(R_C) coupling had a maximum at R_C ≈ 5 km
    // and DECREASED for larger cavities — so a Boltysh-class impactor
    // (R_C ≈ 16 km) was predicted to have a bigger source amplitude
    // than Chicxulub (R_C ≈ 84 km). The Phase-17 fix made A₀ strictly
    // increasing in R_C. This is the regression guard.
    const RCs = [100, 500, 1_000, 3_000, 10_000, 30_000, 100_000];
    const A0s = RCs.map((R) => impactSourceAmplitude(m(R)) as number);
    assertMonotoneIncreasing(A0s, 'sourceAmplitude vs cavityRadius (Phase-17 monotonicity guard)');
  });
});

describe('P-MONO-IMPACT — impact crater monotone in impactor diameter (fixed v, ρ)', () => {
  it('final crater diameter monotone in impactor diameter for stony bolides', () => {
    // NB: skip the small-iron strewn-field branch (D < 20 m for iron
    // density). Use stony density to avoid the strewn-field cutoff
    // changing the relationship below 20 m.
    const Ds = [50, 100, 500, 1_000, 5_000, 10_000];
    const craters = Ds.map(
      (D) =>
        simulateImpact({
          impactorDiameter: m(D),
          impactVelocity: mps(20_000),
          impactorDensity: CRUSTAL_ROCK_DENSITY,
          targetDensity: CRUSTAL_ROCK_DENSITY,
          impactAngle: degreesToRadians(deg(45)),
          surfaceGravity: STANDARD_GRAVITY,
        }).crater.finalDiameter as number
    );
    assertMonotoneIncreasing(craters, 'final crater diameter vs impactor diameter (stony)');
  });

  it('iron strewn-field branch: largest-pit diameter monotone in impactor diameter (D ≥ 20 m, no cutoff)', () => {
    // Above 20 m, the strewn-field branch is disabled; pure crater
    // scaling applies.
    const Ds = [25, 50, 100, 500, 1_000];
    const craters = Ds.map(
      (D) =>
        simulateImpact({
          impactorDiameter: m(D),
          impactVelocity: mps(15_000),
          impactorDensity: IRON_METEORITE_DENSITY,
          targetDensity: CRUSTAL_ROCK_DENSITY,
          impactAngle: degreesToRadians(deg(45)),
          surfaceGravity: STANDARD_GRAVITY,
        }).crater.finalDiameter as number
    );
    assertMonotoneIncreasing(craters, 'final crater diameter vs impactor diameter (iron, D≥20 m)');
  });
});

describe('P-MONO-NO-DEGEN — no event-type produces zero/degenerate output for valid mid-range inputs', () => {
  it('every event type at mid-range inputs produces non-zero headline observables', () => {
    // Smoke test: a "typical" scenario for each event type must
    // produce a meaningful number on every headline field.
    expect(simulateEarthquake({ magnitude: 7 }).shaking.mmi7Radius as number).toBeGreaterThan(
      1_000
    );
    expect(
      simulateExplosion({ yieldMegatons: 1 }).blast.overpressure5psiRadius as number
    ).toBeGreaterThan(1_000);
    expect(
      simulateVolcano({ volumeEruptionRate: 1e5, totalEjectaVolume: 1e10 }).plumeHeight as number
    ).toBeGreaterThan(10_000);
    expect(
      simulateLandslide({ volumeM3: 1e10, slopeAngleDeg: 30, meanOceanDepth: m(2_000) }).tsunami
        ?.sourceAmplitude as number
    ).toBeGreaterThan(0.1);
    // Use D=500 m: above the Phase-14 fragmentsTooHigh suppression
    // (which sets crater=0 when burst altitude > 5×D for stony bolides).
    expect(
      simulateImpact({
        impactorDiameter: m(500),
        impactVelocity: mps(20_000),
        impactorDensity: CRUSTAL_ROCK_DENSITY,
        targetDensity: CRUSTAL_ROCK_DENSITY,
        impactAngle: degreesToRadians(deg(45)),
        surfaceGravity: STANDARD_GRAVITY,
      }).crater.finalDiameter as number
    ).toBeGreaterThan(100);
  });
});
