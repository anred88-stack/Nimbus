import { simulateImpact, type ImpactScenarioInput } from '../simulate.js';
import { kgPerM3, m, mps } from '../units.js';
import { IMPACT_INPUT_SIGMA } from '../uq/conventions.js';
import type { MonteCarloOutput } from './engine.js';
import { runMonteCarlo } from './engine.js';
import { sampleImpactAngle, sampleLognormal, sampleNormal, type Rng } from './sampling.js';

/**
 * Monte-Carlo wrapper for the cosmic-impact pipeline. Samples the
 * known-uncertain inputs from published distributions and reports
 * P10/P50/P90 bands on the headline outputs: kinetic energy, final
 * crater, ejecta-blanket edge, and firestorm ignition reach.
 *
 * Input distributions (all centred on the caller's nominal input,
 * so the median of the MC run closely tracks the deterministic
 * {@link simulateImpact} output):
 *
 *   impactorDiameter  — log-normal with σ_log = 0.15 (~±15 % around
 *                       the central guess; stays within the factor-1.4
 *                       size-estimation band for NEOWISE-class survey
 *                       data, Mainzer 2019).
 *   impactVelocity    — normal, σ = 10 % of the nominal velocity
 *                       (typical orbital-solution uncertainty for a
 *                       well-observed NEO).
 *   impactorDensity   — log-normal with σ_log = 0.15 (taxonomy-class
 *                       spread from Britt & Consolmagno 2003 Table 2).
 *   impactAngle       — Melosh 1989 sin(2θ) distribution, independent
 *                       of the caller's nominal angle. Shallow grazing
 *                       and near-vertical are both under-weighted.
 *
 * We deliberately do NOT re-sample `surfaceGravity`, `waterDepth`,
 * or `impactorStrength`: gravity is known exactly for a chosen
 * body, water depth is a site property the user picks, and
 * strength is absorbed into the atmospheric-entry classifier's
 * already-coarse INTACT/AIRBURST branches.
 */

const DEFAULT_ITERATIONS = 200;

export interface ImpactMonteCarloInput {
  /** Nominal inputs — the distribution medians. */
  nominal: ImpactScenarioInput;
  /** Seeded PRNG. Same seed ⇒ same percentiles. */
  rng: Rng;
  /** Number of iterations to run. Defaults to 200. */
  iterations?: number;
}

export interface ImpactMonteCarloMetrics extends Record<string, number> {
  /** Impactor kinetic energy (J). */
  kineticEnergy: number;
  /** Kinetic energy in TNT megatons. */
  kineticEnergyMt: number;
  /** Final crater diameter (m). */
  finalCraterDiameter: number;
  /** Ejecta blanket outer-edge @ 1 m thickness (m). */
  ejectaEdge1m: number;
  /** Firestorm ignition radius (m). */
  firestormIgnition: number;
  /** Teanby-Wookey seismic Mw. */
  seismicMw: number;
}

function impactSampler(nominal: ImpactScenarioInput): (rng: Rng) => ImpactScenarioInput {
  return (rng: Rng): ImpactScenarioInput => {
    const diameter = sampleLognormal(
      rng,
      nominal.impactorDiameter,
      IMPACT_INPUT_SIGMA.diameter.sigma
    );
    const velocity = Math.max(
      sampleNormal(
        rng,
        nominal.impactVelocity,
        IMPACT_INPUT_SIGMA.velocity.sigma * (nominal.impactVelocity as number)
      ),
      500 // physical lower bound — below ~500 m/s we leave the hypervelocity regime
    );
    const impactorDensity = sampleLognormal(
      rng,
      nominal.impactorDensity,
      IMPACT_INPUT_SIGMA.density.sigma
    );
    const targetDensity = nominal.targetDensity; // ground-fixed, not sampled
    const angleRad = sampleImpactAngle(rng);
    const out: ImpactScenarioInput = {
      impactorDiameter: m(diameter),
      impactVelocity: mps(velocity),
      impactorDensity: kgPerM3(impactorDensity),
      targetDensity,
      impactAngle: angleRad as ImpactScenarioInput['impactAngle'],
    };
    if (nominal.surfaceGravity !== undefined) out.surfaceGravity = nominal.surfaceGravity;
    if (nominal.waterDepth !== undefined) out.waterDepth = nominal.waterDepth;
    if (nominal.meanOceanDepth !== undefined) out.meanOceanDepth = nominal.meanOceanDepth;
    if (nominal.impactorStrength !== undefined) out.impactorStrength = nominal.impactorStrength;
    return out;
  };
}

export function runImpactMonteCarlo(
  input: ImpactMonteCarloInput
): MonteCarloOutput<ImpactMonteCarloMetrics> {
  return runMonteCarlo<
    ImpactScenarioInput,
    ReturnType<typeof simulateImpact>,
    ImpactMonteCarloMetrics
  >({
    iterations: input.iterations ?? DEFAULT_ITERATIONS,
    rng: input.rng,
    sampler: impactSampler(input.nominal),
    simulate: simulateImpact,
    extractMetrics: (r) => ({
      kineticEnergy: r.impactor.kineticEnergy,
      kineticEnergyMt: r.impactor.kineticEnergyMegatons,
      finalCraterDiameter: r.crater.finalDiameter,
      ejectaEdge1m: r.ejecta.blanketEdge1m,
      firestormIgnition: r.firestorm.ignitionRadius,
      seismicMw: r.seismic.magnitudeTeanbyWookey,
    }),
  });
}
