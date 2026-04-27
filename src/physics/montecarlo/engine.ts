import type { Rng } from './sampling.js';

/**
 * Generic Monte-Carlo engine. Given a deterministic simulator, a
 * parameter sampler, and one or more output-metric extractors, run
 * the simulator N times with sampled inputs and return the P10/P50
 * /P90 percentiles plus the mean of each metric.
 *
 * The engine is intentionally agnostic about the event type — the
 * same code serves impact, explosion, earthquake, and volcano flows.
 * Each event module supplies its own `sampler` and `metrics` in a
 * thin wrapper (see {@link ./impactMonteCarlo.ts} etc).
 *
 * Reference (not a citation for this pattern — MC is textbook — but
 * an anchor for the engineering tradeoffs):
 *   Koonin, S. E. (1986). "Computational Physics." Addison-Wesley,
 *    Ch. 7 "Monte Carlo Methods". We implement the simplest
 *    variance-unweighted percentile estimator because the 200-run
 *    budget is well above the 30-sample rule-of-thumb where the
 *    weighted estimators start paying off.
 */

export interface PercentileSummary {
  /** 10th percentile (optimistic). */
  p10: number;
  /** 50th percentile (median, best single estimate). */
  p50: number;
  /** 90th percentile (pessimistic). */
  p90: number;
  /** Arithmetic mean across the sample set. */
  mean: number;
}

export interface MonteCarloOutput<TMetrics extends Record<string, number>> {
  /** Number of iterations actually run (may be less than the
   *  requested N if individual runs threw and were filtered out). */
  iterations: number;
  /** Per-metric percentile summaries. */
  metrics: { [K in keyof TMetrics]: PercentileSummary };
}

export interface MonteCarloInput<TInput, TOutput, TMetrics extends Record<string, number>> {
  /** How many samples to draw. 200 is the popular-science default —
   *  tight percentiles without noticeable UI lag. */
  iterations: number;
  /** Seeded PRNG — the only randomness source. Reproducibility
   *  across runs is delivered by passing the same {@link Rng}. */
  rng: Rng;
  /** Produce a sampled input from the RNG. Called N times. */
  sampler: (rng: Rng) => TInput;
  /** Deterministic simulator that turns an input into an output. */
  simulate: (input: TInput) => TOutput;
  /** Extract one record of named metrics from a simulator output.
   *  Keys must be consistent across iterations — the engine
   *  aggregates column-wise. */
  extractMetrics: (output: TOutput) => TMetrics;
}

/**
 * Compute P10/P50/P90 + mean of a 1-D sample. Samples are sorted in
 * place — pass a disposable buffer if mutation matters. Non-finite
 * values are filtered out before the percentile computation.
 */
export function percentileSummary(samples: number[]): PercentileSummary {
  const finite = samples.filter((x) => Number.isFinite(x));
  if (finite.length === 0) {
    return { p10: 0, p50: 0, p90: 0, mean: 0 };
  }
  finite.sort((a, b) => a - b);
  const pick = (p: number): number => {
    const idx = Math.min(finite.length - 1, Math.max(0, Math.floor(p * finite.length)));
    return finite[idx] ?? 0;
  };
  const mean = finite.reduce((s, x) => s + x, 0) / finite.length;
  return { p10: pick(0.1), p50: pick(0.5), p90: pick(0.9), mean };
}

/**
 * Run the Monte-Carlo engine. Returns N-sample percentile bands per
 * metric, suitable for rendering as a P10–P90 error bar or a small
 * violin plot in the UI.
 */
export function runMonteCarlo<TInput, TOutput, TMetrics extends Record<string, number>>(
  input: MonteCarloInput<TInput, TOutput, TMetrics>
): MonteCarloOutput<TMetrics> {
  const { iterations, rng, sampler, simulate, extractMetrics } = input;
  const columns = new Map<string, number[]>();
  let successful = 0;
  for (let i = 0; i < iterations; i++) {
    try {
      const sampled = sampler(rng);
      const out = simulate(sampled);
      const metrics = extractMetrics(out);
      for (const key of Object.keys(metrics)) {
        const col = columns.get(key) ?? [];
        const v = metrics[key as keyof TMetrics];
        if (typeof v === 'number' && Number.isFinite(v)) {
          col.push(v);
          columns.set(key, col);
        }
      }
      successful++;
    } catch {
      // Individual failed iterations are dropped — the engine keeps
      // going so a few pathological samples don't kill the whole run.
    }
  }
  const summary = {} as { [K in keyof TMetrics]: PercentileSummary };
  for (const [key, values] of columns.entries()) {
    (summary as Record<string, PercentileSummary>)[key] = percentileSummary(values);
  }
  return { iterations: successful, metrics: summary };
}
