import { simulateEarthquake, type EarthquakeScenarioInput } from '../events/earthquake/index.js';
import { m } from '../units.js';
import { EARTHQUAKE_INPUT_SIGMA } from '../uq/conventions.js';
import type { MonteCarloOutput } from './engine.js';
import { runMonteCarlo } from './engine.js';
import { sampleNormal, type Rng } from './sampling.js';

/**
 * Monte-Carlo wrapper for the earthquake pipeline. The three
 * physically-uncertain inputs are:
 *
 *   magnitude  — reporting uncertainty on Mw is ±0.1 for
 *                modern USGS solutions, stretched to ±0.2 for
 *                older events. We sample N(Mw, 0.15).
 *   depth      — ISC-GEM hypocentre depths carry σ ≈ ±5 km for
 *                intermediate/deep events; we use 20 % of the
 *                nominal depth with a 2 km minimum.
 *   vs30       — N(760, 300) on the rock-reference baseline; or
 *                ±30 % lognormal when the caller supplied one.
 *
 * We do not re-sample the fault type — it's a categorical input
 * picked by the user from a dropdown, not an uncertain measurement.
 */

const DEFAULT_ITERATIONS = 200;

export interface EarthquakeMonteCarloInput {
  nominal: EarthquakeScenarioInput;
  rng: Rng;
  iterations?: number;
}

export interface EarthquakeMonteCarloMetrics extends Record<string, number> {
  /** Moment magnitude Mw (echoed — sanity check). */
  magnitude: number;
  /** Rupture length (m). */
  ruptureLength: number;
  /** NGA-West2 PGA @ 20 km (m/s²). */
  pgaAt20kmNGA: number;
  /** MMI at the epicentre (Worden 2012 California). */
  mmiAtEpicenter: number;
  /** MMI VIII ring radius (m). */
  mmi8Radius: number;
  /** Liquefaction radius (m). */
  liquefactionRadius: number;
}

function earthquakeSampler(
  nominal: EarthquakeScenarioInput
): (rng: Rng) => EarthquakeScenarioInput {
  return (rng: Rng): EarthquakeScenarioInput => {
    const magnitude = Math.max(
      sampleNormal(rng, nominal.magnitude, EARTHQUAKE_INPUT_SIGMA.magnitude.sigma),
      1
    );
    const depthNominal = nominal.depth === undefined ? 15_000 : (nominal.depth as number);
    const depthSigma = Math.max(2_000, EARTHQUAKE_INPUT_SIGMA.depth.sigma * depthNominal);
    const depth = Math.max(sampleNormal(rng, depthNominal, depthSigma), 1_000);
    const vs30Nominal = nominal.vs30 ?? 760;
    const vs30Sigma = EARTHQUAKE_INPUT_SIGMA.vs30.sigma * vs30Nominal;
    const vs30 = Math.max(sampleNormal(rng, vs30Nominal, vs30Sigma), 100);
    const out: EarthquakeScenarioInput = {
      magnitude,
      depth: m(depth),
      vs30,
    };
    if (nominal.faultType !== undefined) out.faultType = nominal.faultType;
    if (nominal.subductionInterface !== undefined)
      out.subductionInterface = nominal.subductionInterface;
    return out;
  };
}

export function runEarthquakeMonteCarlo(
  input: EarthquakeMonteCarloInput
): MonteCarloOutput<EarthquakeMonteCarloMetrics> {
  return runMonteCarlo<
    EarthquakeScenarioInput,
    ReturnType<typeof simulateEarthquake>,
    EarthquakeMonteCarloMetrics
  >({
    iterations: input.iterations ?? DEFAULT_ITERATIONS,
    rng: input.rng,
    sampler: earthquakeSampler(input.nominal),
    simulate: simulateEarthquake,
    extractMetrics: (r) => ({
      magnitude: r.inputs.magnitude,
      ruptureLength: r.ruptureLength,
      pgaAt20kmNGA: r.shaking.pgaAt20kmNGA,
      mmiAtEpicenter: r.shaking.mmiAtEpicenter,
      mmi8Radius: r.shaking.mmi8Radius,
      liquefactionRadius: r.shaking.liquefactionRadius,
    }),
  });
}
