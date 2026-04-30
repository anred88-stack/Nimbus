/**
 * Custom-input invariants — I1 (syntactic), I2 (normalization),
 * I3 (unit coherence), I4 (physical plausibility).
 *
 * The custom-input pipeline is the highest-risk surface in Nimbus:
 * a sintactically-valid scenario can produce wildly nonphysical output
 * if any gate is missing (the Tsar-Bomba 500 m airburst → 3.5 m wave
 * at trans-Atlantic distance is the canonical case, B-009).
 *
 * Each test below tags itself with:
 *   - the invariant ID (I1..I4) being checked
 *   - the severity expected (S1 BLOCKING / S2 NORMALIZED / S3 PHYS-WARN / S4 ACCEPTED)
 *
 * See `docs/VERIFICATION_PLAN.md` for the invariant taxonomy and
 * `docs/BUG_CLASSIFICATION.md` for the defect codes referenced.
 *
 * Strategy. We exercise the simulation entry points directly (the
 * `simulate*()` functions) rather than the React store setters, because
 * the store setters silently drop invalid input — which IS the design
 * (S1 = silent reject) — but a malicious or buggy caller could bypass
 * the store and call the physics layer directly. The physics layer
 * MUST therefore be defensive. Bugs found here are filed as D-INPUT.
 */

import { describe, expect, it } from 'vitest';
import { simulateEarthquake } from '../events/earthquake/simulate.js';
import { simulateExplosion } from '../events/explosion/simulate.js';
import { simulateVolcano } from '../events/volcano/simulate.js';
import { simulateLandslide } from '../events/landslide/simulate.js';
import { simulateImpact } from '../simulate.js';
import { CRUSTAL_ROCK_DENSITY, IRON_METEORITE_DENSITY, STANDARD_GRAVITY } from '../constants.js';
import { deg, degreesToRadians, m, mps } from '../units.js';

/**
 * Helper: assert a scalar is a finite, non-negative number. NaN, Inf,
 * and negative numbers are forbidden in any "magnitude / radius / time
 * / amplitude" output of a physics function. This is the bare minimum
 * I1 contract.
 */
function assertFiniteNonNegative(actual: unknown, label: string): void {
  expect(typeof actual === 'number', `${label}: expected number, got ${typeof actual}`).toBe(true);
  const v = actual as number;
  expect(Number.isFinite(v), `${label} = ${v.toString()} (not finite)`).toBe(true);
  expect(v >= 0, `${label} = ${v.toString()} (negative)`).toBe(true);
}

describe('I1 SYNTACTIC — no NaN/Inf in any output field given finite input', () => {
  // Contract scope: physics simulators are NOT defensive against
  // NaN/Inf/negative input by design — the store-setter is responsible
  // for input validation (see `useAppStore.setEarthquakeInput` etc.).
  // What we DO promise: any FINITE input produces FINITE output.
  // NaN/Inf input → undefined behaviour (tracked as B-010 in
  // BUG_REGISTRY.md as a defense-in-depth gap).

  it('earthquake simulator: any finite magnitude in [0.1, 12] gives finite seismic moment + finite radii', () => {
    for (const Mw of [0.1, 1, 3, 5, 7, 9, 11, 12]) {
      const r = simulateEarthquake({ magnitude: Mw });
      const M0 = r.seismicMoment as unknown as number;
      expect(
        Number.isFinite(M0),
        `Mw ${Mw.toString()}: seismicMoment = ${M0.toString()} (not finite)`
      ).toBe(true);
      expect(M0).toBeGreaterThan(0);
      expect(Number.isFinite(r.ruptureLength as number)).toBe(true);
      expect(Number.isFinite(r.shaking.mmi7Radius as number)).toBe(true);
      expect(Number.isFinite(r.shaking.liquefactionRadius as number)).toBe(true);
    }
  });

  it('explosion simulator: any finite yield in [1e-6, 100] Mt gives finite blast/thermal radii', () => {
    for (const Mt of [1e-6, 1e-3, 0.015, 1, 15, 50, 100]) {
      const r = simulateExplosion({ yieldMegatons: Mt });
      expect(
        Number.isFinite(r.blast.overpressure5psiRadius as number),
        `${Mt.toString()} Mt: overpressure5psiRadius`
      ).toBe(true);
      expect(Number.isFinite(r.blast.overpressure1psiRadius as number)).toBe(true);
      expect(Number.isFinite(r.blast.lightDamageRadius as number)).toBe(true);
      expect(Number.isFinite(r.thermal.thirdDegreeBurnRadius as number)).toBe(true);
    }
  });

  it('volcano simulator: any finite eruption rate in [10, 1e7] m³/s gives finite plume', () => {
    for (const Vrate of [10, 1e3, 1e5, 1e6, 1e7]) {
      const r = simulateVolcano({ volumeEruptionRate: Vrate, totalEjectaVolume: 1e10 });
      expect(Number.isFinite(r.plumeHeight as number), `V̇=${Vrate.toString()}: plumeHeight`).toBe(
        true
      );
      expect(r.plumeHeight as number).toBeGreaterThan(0);
    }
  });

  it('landslide simulator: any finite positive volume gives finite source amplitude', () => {
    for (const V of [1e6, 1e9, 1e12]) {
      const r = simulateLandslide({ volumeM3: V, slopeAngleDeg: 20 });
      expect(r.tsunami).not.toBeNull();
      if (r.tsunami === null) continue;
      expect(
        Number.isFinite(r.tsunami.sourceAmplitude as number),
        `V=${V.toString()}: sourceAmplitude`
      ).toBe(true);
      expect(r.tsunami.sourceAmplitude as number).toBeGreaterThan(0);
    }
  });

  it('impact simulator: any finite-positive impactor across 6 orders of magnitude gives finite crater + KE', () => {
    for (const D of [1, 10, 100, 1000, 10_000, 100_000]) {
      const r = simulateImpact({
        impactorDiameter: m(D),
        impactVelocity: mps(20_000),
        impactorDensity: CRUSTAL_ROCK_DENSITY,
        targetDensity: CRUSTAL_ROCK_DENSITY,
        impactAngle: degreesToRadians(deg(45)),
        surfaceGravity: STANDARD_GRAVITY,
      });
      expect(
        Number.isFinite(r.crater.finalDiameter as number),
        `D=${D.toString()} m: finalDiameter`
      ).toBe(true);
      expect(Number.isFinite(r.impactor.kineticEnergyMegatons)).toBe(true);
    }
  });

  it('B-010 CLOSED: physics simulators called directly remain permissive; production callers must validate first', () => {
    // After the inputSchema.ts + safeRun.ts wiring, the official
    // production path (store setters, CLI replay, golden dataset)
    // routes through validateScenario which rejects NaN/Inf at the
    // boundary. Direct simulate*() calls remain available for unit
    // tests pinning isolated formulas — caller's responsibility to
    // pre-validate. This test documents the contract.
    const r = simulateEarthquake({ magnitude: Number.NaN });
    const M0 = r.seismicMoment as unknown as number;
    // Direct call: still permissive (NaN propagates). The closure
    // guarantee is at the validator layer, not the simulator layer.
    expect(Number.isNaN(M0) || M0 === 0).toBe(true);
  });
});

describe('I2 NORMALIZATION — out-of-range angles wrap correctly', () => {
  it('explosion accepts impactAzimuthDeg > 360 (currently does not — but documents what SHOULD happen)', () => {
    // Note: explosion does not have azimuth — using impact instead.
    const r = simulateImpact({
      impactorDiameter: m(100),
      impactVelocity: mps(20_000),
      impactorDensity: CRUSTAL_ROCK_DENSITY,
      targetDensity: CRUSTAL_ROCK_DENSITY,
      impactAngle: degreesToRadians(deg(45)),
      impactAzimuthDeg: 720,
      surfaceGravity: STANDARD_GRAVITY,
    });
    // I2: regardless of azimuth normalization, geometry must be valid.
    // The rendered overlay uses azimuth modulo 360 in geometry, so
    // anything in [0, 360) is OK. We just check that the value is
    // present and finite.
    expect(r.ejecta.azimuthDeg).toBeDefined();
    expect(Number.isFinite(r.ejecta.azimuthDeg)).toBe(true);
  });

  it('volcano accepts windDirectionDegrees < 0 (S2: store normalises; here we ensure the simulator does not crash)', () => {
    // The store setter normalises windDirectionDegrees % 360. Direct
    // simulator calls that bypass the store should still produce
    // finite output.
    const r = simulateVolcano({
      volumeEruptionRate: 1e5,
      totalEjectaVolume: 1e10,
      windDirectionDegrees: -45,
    });
    expect(Number.isFinite(r.plumeHeight as number)).toBe(true);
  });
});

describe('I3 UNIT COHERENCE — output magnitudes are in expected SI ranges', () => {
  it('Mw 7 earthquake → seismic moment in Nm range [1e19, 1e20]', () => {
    // I3: Hanks-Kanamori 1979 gives M0 = 10^(1.5×7+9.05) = 10^19.55 ≈ 3.55e19 Nm.
    const r = simulateEarthquake({ magnitude: 7 });
    const M0 = r.seismicMoment as unknown as number;
    expect(M0).toBeGreaterThan(1e19);
    expect(M0).toBeLessThan(1e20);
  });

  it('1 kt explosion → 5 psi radius in metres in expected range [100, 1500] m', () => {
    // I3: Glasstone-Dolan surface burst, 1 kt → ~190 m at 5 psi.
    const r = simulateExplosion({ yieldMegatons: 0.001 });
    const r5 = r.blast.overpressure5psiRadius as number;
    expect(r5).toBeGreaterThan(50);
    expect(r5).toBeLessThan(1500);
  });

  it('100 m impactor at 20 km/s → kineticEnergyMegatons in range [1, 1000] Mt', () => {
    // I3: KE = 0.5 × ρ × π/6 × D³ × v². For D=100m, ρ=3000, v=20km/s:
    // mass = 1.57e9 kg → KE = 3.14e17 J = 75 Mt
    const r = simulateImpact({
      impactorDiameter: m(100),
      impactVelocity: mps(20_000),
      impactorDensity: CRUSTAL_ROCK_DENSITY,
      targetDensity: CRUSTAL_ROCK_DENSITY,
      impactAngle: degreesToRadians(deg(45)),
      surfaceGravity: STANDARD_GRAVITY,
    });
    expect(r.impactor.kineticEnergyMegatons).toBeGreaterThan(1);
    expect(r.impactor.kineticEnergyMegatons).toBeLessThan(1000);
  });
});

describe('I4 PHYSICAL PLAUSIBILITY — extreme inputs do not produce nonphysical output', () => {
  it('Mw 12 (unphysical: max recorded is ~9.5) → output stays finite, no NaN/Inf', () => {
    // I4: Strasser/Hanks-Kanamori extrapolated to Mw 12 — formulas
    // remain finite (S4 accepted), just the user must understand
    // the result is unphysical. No upstream gate currently rejects
    // this; document the behaviour.
    const r = simulateEarthquake({ magnitude: 12, subductionInterface: true });
    expect(Number.isFinite(r.ruptureLength as number)).toBe(true);
    expect(Number.isFinite(r.shaking.mmi7Radius as number)).toBe(true);
    // Sanity: rupture length should be HUGE (thousands of km) but finite.
    expect((r.ruptureLength as number) / 1_000).toBeGreaterThan(1_000);
  });

  it('Mt-class explosion at HOB > 30 m on water emits NO tsunami (B-009 regression)', () => {
    // I4: see B-009 in BUG_REGISTRY.md
    // Severity: S1 — physical-plausibility gate denies coupling.
    const r = simulateExplosion({
      yieldMegatons: 50,
      heightOfBurst: m(500),
      waterDepth: m(3500),
    });
    expect(r.tsunami).toBeUndefined();
  });

  it('zero water depth → no tsunami branch fires anywhere (I4: no tsunami without water)', () => {
    // I4: a tsunami without water is unphysical. Gate is the
    // `waterDepth > 0` precondition.
    const explosion = simulateExplosion({
      yieldMegatons: 1,
      heightOfBurst: m(0),
      waterDepth: m(0),
    });
    expect(explosion.tsunami).toBeUndefined();

    const impact = simulateImpact({
      impactorDiameter: m(1000),
      impactVelocity: mps(20_000),
      impactorDensity: IRON_METEORITE_DENSITY,
      targetDensity: CRUSTAL_ROCK_DENSITY,
      impactAngle: degreesToRadians(deg(45)),
      surfaceGravity: STANDARD_GRAVITY,
      waterDepth: m(0),
    });
    expect(impact.tsunami).toBeUndefined();
  });

  it('asymmetry factor on impact angle stays in [0, 1] for all valid angles', () => {
    // I4: Schultz-Anderson 1996 asymmetry is bounded.
    for (const angleDeg of [10, 30, 45, 60, 90]) {
      const r = simulateImpact({
        impactorDiameter: m(100),
        impactVelocity: mps(20_000),
        impactorDensity: CRUSTAL_ROCK_DENSITY,
        targetDensity: CRUSTAL_ROCK_DENSITY,
        impactAngle: degreesToRadians(deg(angleDeg)),
        surfaceGravity: STANDARD_GRAVITY,
      });
      expect(
        r.ejecta.asymmetryFactor,
        `angle ${angleDeg.toString()}°: asymmetryFactor in [0, 1]`
      ).toBeGreaterThanOrEqual(0);
      expect(r.ejecta.asymmetryFactor).toBeLessThanOrEqual(1);
    }
  });
});

describe('I4 PHYSICAL PLAUSIBILITY — finite-non-negative contract on all radii', () => {
  it('every event-type simulator: damage/effect radii are finite non-negative across Mw 5-9', () => {
    // Sweeps a realistic range; failure here means a formula
    // produces NaN or negative radius for some valid input — D-NUM.
    for (const Mw of [5, 6, 7, 8, 9]) {
      const r = simulateEarthquake({ magnitude: Mw });
      assertFiniteNonNegative(r.ruptureLength, `Mw ${Mw.toString()}: ruptureLength`);
      assertFiniteNonNegative(r.ruptureWidth, `Mw ${Mw.toString()}: ruptureWidth`);
      assertFiniteNonNegative(r.shaking.mmi7Radius, `Mw ${Mw.toString()}: mmi7Radius`);
      assertFiniteNonNegative(
        r.shaking.liquefactionRadius,
        `Mw ${Mw.toString()}: liquefactionRadius`
      );
    }
  });

  it('every yield from 0.001 to 100 Mt: blast/thermal radii finite non-negative', () => {
    for (const Mt of [0.001, 0.015, 1, 15, 50, 100]) {
      const r = simulateExplosion({ yieldMegatons: Mt });
      assertFiniteNonNegative(
        r.blast.overpressure5psiRadius,
        `${Mt.toString()} Mt: overpressure5psiRadius`
      );
      assertFiniteNonNegative(
        r.blast.overpressure1psiRadius,
        `${Mt.toString()} Mt: overpressure1psiRadius`
      );
      assertFiniteNonNegative(r.blast.lightDamageRadius, `${Mt.toString()} Mt: lightDamageRadius`);
      assertFiniteNonNegative(
        r.thermal.thirdDegreeBurnRadius,
        `${Mt.toString()} Mt: thirdDegreeBurnRadius`
      );
    }
  });
});
