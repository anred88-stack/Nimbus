import { simulateExplosion, type ExplosionScenarioInput } from '../events/explosion/index.js';
import { m } from '../units.js';
import { EXPLOSION_INPUT_SIGMA } from '../uq/conventions.js';
import type { MonteCarloOutput } from './engine.js';
import { runMonteCarlo } from './engine.js';
import { sampleLognormal, sampleNormal, type Rng } from './sampling.js';

/**
 * Monte-Carlo wrapper for the nuclear / conventional-explosion
 * pipeline. The two physically-uncertain inputs are:
 *
 *   yieldMegatons   — design-stated yield ±10 % (Cold War weapons
 *                     tests have ~±10 % actual/design spread, e.g.
 *                     Castle Bravo's 15 Mt came from a 6 Mt design).
 *   heightOfBurst   — normal, σ = 50 m or 5 % whichever is larger
 *                     (Hiroshima's HOB was 580 ± 40 m per Penney
 *                     et al. 1970 reconstruction).
 *
 * Ground type is NOT sampled — it's a site property, not a random
 * variable. Nordyke 1977's 30 % K scatter is captured separately
 * via the fixed-K coefficient in the physics; we don't double-count
 * that uncertainty here.
 */

const DEFAULT_ITERATIONS = 200;

export interface ExplosionMonteCarloInput {
  nominal: ExplosionScenarioInput;
  rng: Rng;
  iterations?: number;
}

export interface ExplosionMonteCarloMetrics extends Record<string, number> {
  /** Yield in megatons (echoed — should match nominal within σ=10 %). */
  yieldMt: number;
  /** HOB-corrected 5 psi ring radius (m). */
  fivePsiRadius: number;
  /** HOB-corrected 1 psi ring radius (m). */
  onePsiRadius: number;
  /** Third-degree burn radius (m). */
  burn3rdDegree: number;
  /** Firestorm ignition radius (m). */
  firestormIgnition: number;
  /** Apparent surface-burst crater (m). */
  craterDiameter: number;
  /** LD50 initial-radiation radius (m). */
  ld50Radius: number;
}

function explosionSampler(nominal: ExplosionScenarioInput): (rng: Rng) => ExplosionScenarioInput {
  return (rng: Rng): ExplosionScenarioInput => {
    const yieldMt = Math.max(
      sampleLognormal(rng, nominal.yieldMegatons, EXPLOSION_INPUT_SIGMA.yield.sigma),
      1e-6
    );
    const hobNominal = nominal.heightOfBurst === undefined ? 0 : (nominal.heightOfBurst as number);
    const hobSigma = Math.max(EXPLOSION_INPUT_SIGMA.heightOfBurst.sigma, 0.05 * hobNominal);
    const hob = Math.max(sampleNormal(rng, hobNominal, hobSigma), 0);
    const out: ExplosionScenarioInput = {
      yieldMegatons: yieldMt,
      heightOfBurst: m(hob),
    };
    if (nominal.groundType !== undefined) out.groundType = nominal.groundType;
    return out;
  };
}

export function runExplosionMonteCarlo(
  input: ExplosionMonteCarloInput
): MonteCarloOutput<ExplosionMonteCarloMetrics> {
  return runMonteCarlo<
    ExplosionScenarioInput,
    ReturnType<typeof simulateExplosion>,
    ExplosionMonteCarloMetrics
  >({
    iterations: input.iterations ?? DEFAULT_ITERATIONS,
    rng: input.rng,
    sampler: explosionSampler(input.nominal),
    simulate: simulateExplosion,
    extractMetrics: (r) => ({
      yieldMt: r.yield.megatons,
      fivePsiRadius: r.blast.overpressure5psiRadiusHob,
      onePsiRadius: r.blast.overpressure1psiRadiusHob,
      burn3rdDegree: r.thermal.thirdDegreeBurnRadius,
      firestormIgnition: r.firestorm.ignitionRadius,
      craterDiameter: r.crater.apparentDiameter,
      ld50Radius: r.radiation.ld50Radius,
    }),
  });
}
