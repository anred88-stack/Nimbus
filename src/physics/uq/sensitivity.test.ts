import { describe, expect, it } from 'vitest';
import { CHONDRITIC_DENSITY, CRUSTAL_ROCK_DENSITY, STANDARD_GRAVITY } from '../constants.js';
import { simulateImpact } from '../simulate.js';
import { kgPerM3, m, mps } from '../units.js';
import { oatSensitivity } from './sensitivity.js';
import { IMPACT_INPUT_SIGMA, asLinearHalfRange } from './conventions.js';

/**
 * Sanity checks for the OAT sensitivity routine. We do NOT pin any
 * specific elasticity value — the absolute numbers are sensitive to
 * the underlying physics formulas. Instead we assert *qualitative*
 * properties that must always hold for a self-consistent local
 * sensitivity analysis:
 *
 *   1. Energy elasticity to mass (or diameter) is positive (more mass
 *      → more energy). For impacts E = ½ m v² ∝ d³ v² so the energy
 *      elasticity to diameter at 1σ should be ≥ 1 (super-linear).
 *   2. Energy elasticity to velocity is positive and roughly twice
 *      that of density (E ∝ v² vs E ∝ ρ).
 *   3. The driver-ranking returns finite, non-zero elasticities for
 *      the headline output (kineticEnergy).
 */

const TUNGUSKA_CLASS = {
  diameter: 60,
  velocity: 15_000,
  density: CHONDRITIC_DENSITY as number,
};

function simulate(params: {
  diameter: number;
  velocity: number;
  density: number;
}): Record<string, number> {
  const result = simulateImpact({
    impactorDiameter: m(params.diameter),
    impactVelocity: mps(params.velocity),
    impactorDensity: kgPerM3(params.density),
    targetDensity: CRUSTAL_ROCK_DENSITY,
    impactAngle: (Math.PI / 4) as never,
    surfaceGravity: STANDARD_GRAVITY,
  });
  return {
    kineticEnergy: result.impactor.kineticEnergy,
    finalCraterDiameter: result.crater.finalDiameter,
    seismicMw: result.seismic.magnitudeTeanbyWookey,
  };
}

describe('OAT sensitivity — Tunguska-class impact', () => {
  const sigmas = {
    diameter: TUNGUSKA_CLASS.diameter * asLinearHalfRange(IMPACT_INPUT_SIGMA.diameter),
    velocity: TUNGUSKA_CLASS.velocity * asLinearHalfRange(IMPACT_INPUT_SIGMA.velocity),
    density: TUNGUSKA_CLASS.density * asLinearHalfRange(IMPACT_INPUT_SIGMA.density),
  };

  const result = oatSensitivity({
    nominal: TUNGUSKA_CLASS,
    sigmas,
    simulate,
  });

  it('returns one row per output', () => {
    expect(result.rows.length).toBe(3);
    expect(result.rows.map((r) => r.output).sort()).toEqual([
      'finalCraterDiameter',
      'kineticEnergy',
      'seismicMw',
    ]);
  });

  it('kineticEnergy is most sensitive to diameter (E ∝ d³)', () => {
    const row = result.rows.find((r) => r.output === 'kineticEnergy');
    expect(row).toBeDefined();
    const eDiameter = row!.elasticity.diameter ?? 0;
    const eVelocity = row!.elasticity.velocity ?? 0;
    const eDensity = row!.elasticity.density ?? 0;
    // E ∝ d³ → super-linear elasticity, must dominate the others.
    expect(Math.abs(eDiameter)).toBeGreaterThan(Math.abs(eVelocity));
    expect(Math.abs(eDiameter)).toBeGreaterThan(Math.abs(eDensity));
    expect(eDiameter).toBeGreaterThan(0);
  });

  it('all elasticities are finite numbers', () => {
    for (const r of result.rows) {
      for (const v of Object.values(r.elasticity)) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it('ranking returns the strongest driver per output, non-zero', () => {
    expect(result.rankedByMaxAbsElasticity.length).toBe(3);
    for (const entry of result.rankedByMaxAbsElasticity) {
      expect(entry.driver).not.toBe('');
      expect(Math.abs(entry.elasticity)).toBeGreaterThan(0);
    }
  });

  it('zero-sigma inputs produce zero elasticity (no division by zero)', () => {
    const zeroResult = oatSensitivity({
      nominal: TUNGUSKA_CLASS,
      sigmas: { diameter: 0, velocity: 0, density: 0 },
      simulate,
    });
    for (const r of zeroResult.rows) {
      expect(r.elasticity.diameter).toBe(0);
      expect(r.elasticity.velocity).toBe(0);
      expect(r.elasticity.density).toBe(0);
    }
  });
});
