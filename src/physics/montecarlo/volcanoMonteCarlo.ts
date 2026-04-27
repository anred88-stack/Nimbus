import { simulateVolcano, type VolcanoScenarioInput } from '../events/volcano/index.js';
import { VOLCANO_INPUT_SIGMA } from '../uq/conventions.js';
import type { MonteCarloOutput } from './engine.js';
import { runMonteCarlo } from './engine.js';
import { sampleLognormal, type Rng } from './sampling.js';

/**
 * Monte-Carlo wrapper for the volcano pipeline. Two uncertain
 * inputs dominate: volume eruption rate V̇ and total ejecta volume
 * V. Both are log-normally distributed because the published
 * scatter on Mastin 2009 plume heights and PDC runouts is ~factor-2
 * in linear units — σ_log ≈ 0.5 captures it cleanly.
 *
 *   volumeEruptionRate — log-normal σ_log = 0.5 (±factor-2,
 *                        matching Mastin 2009 Fig. 2 scatter).
 *   totalEjectaVolume  — log-normal σ_log = 0.3 (observed
 *                        historical-eruption volumes are known to
 *                        ±factor-1.5× from deposit reconstructions).
 *
 * Lahar volume (when supplied) is also sampled with σ_log = 0.5 to
 * propagate Iverson 1997's ±factor-2 runout scatter.
 */

const DEFAULT_ITERATIONS = 200;

export interface VolcanoMonteCarloInput {
  nominal: VolcanoScenarioInput;
  rng: Rng;
  iterations?: number;
}

export interface VolcanoMonteCarloMetrics extends Record<string, number> {
  /** Plinian plume height (m). */
  plumeHeight: number;
  /** Volcanic Explosivity Index. */
  vei: number;
  /** Pyroclastic-flow runout — energy-line upper bound (m). */
  pyroclasticRunout: number;
  /** Peak global ΔT (K, negative = cooling). */
  climateCoolingK: number;
  /** Ashfall 1 mm isopach area (m²). */
  ashfallArea: number;
}

function volcanoSampler(nominal: VolcanoScenarioInput): (rng: Rng) => VolcanoScenarioInput {
  return (rng: Rng): VolcanoScenarioInput => {
    const vDot = sampleLognormal(
      rng,
      nominal.volumeEruptionRate,
      VOLCANO_INPUT_SIGMA.volumeEruptionRate.sigma
    );
    const totalV = sampleLognormal(
      rng,
      nominal.totalEjectaVolume,
      VOLCANO_INPUT_SIGMA.totalEjectaVolume.sigma
    );
    const out: VolcanoScenarioInput = {
      volumeEruptionRate: Math.max(vDot, 1),
      totalEjectaVolume: Math.max(totalV, 1),
    };
    if (nominal.laharVolume !== undefined && nominal.laharVolume > 0) {
      out.laharVolume = sampleLognormal(
        rng,
        nominal.laharVolume,
        VOLCANO_INPUT_SIGMA.laharVolume.sigma
      );
    }
    if (nominal.windSpeed !== undefined) out.windSpeed = nominal.windSpeed;
    if (nominal.windDirectionDegrees !== undefined)
      out.windDirectionDegrees = nominal.windDirectionDegrees;
    return out;
  };
}

export function runVolcanoMonteCarlo(
  input: VolcanoMonteCarloInput
): MonteCarloOutput<VolcanoMonteCarloMetrics> {
  return runMonteCarlo<
    VolcanoScenarioInput,
    ReturnType<typeof simulateVolcano>,
    VolcanoMonteCarloMetrics
  >({
    iterations: input.iterations ?? DEFAULT_ITERATIONS,
    rng: input.rng,
    sampler: volcanoSampler(input.nominal),
    simulate: simulateVolcano,
    extractMetrics: (r) => ({
      plumeHeight: r.plumeHeight,
      vei: r.vei,
      pyroclasticRunout: r.pyroclasticRunoutEnergyLine,
      climateCoolingK: r.climateCoolingK,
      ashfallArea: r.ashfallArea1mm,
    }),
  });
}
