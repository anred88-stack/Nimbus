/**
 * Empirical cumulative distribution function (ECDF) helpers for the
 * Monte-Carlo ensemble — the foundation for Phase 8c probability-
 * driven ring rendering.
 *
 * Given a set of N realisations of a damage radius (e.g. 200 Monte
 * Carlo samples of the firestorm-ignition radius), the ECDF gives,
 * for any threshold r:
 *
 *     P(R ≥ r) = (#samples_with_R_geq_r) / N
 *
 * Concretely:
 *   - At r = min(samples) the function reads ~1.0 (every realisation
 *     reaches at least this far).
 *   - At r = max(samples) it reads ~1/N (only the worst realisation
 *     reaches that far).
 *   - The midpoint is ~0.5 at the median.
 *
 * Two consumers in the simulator:
 *
 *   1. **Visual rendering (Phase 8c).** The damage ring's alpha at
 *      ground-range r should be proportional to P(R ≥ r) so the
 *      observer reads "darker = more likely, fading = rare-tail
 *      worst case". This module gives a smooth piecewise-linear
 *      ECDF interpolated against radius, suitable for direct use
 *      as a Cesium material's alpha lookup.
 *
 *   2. **Per-quantile percentile alignment.** {@link percentileFromEcdf}
 *      lets a caller ask "at what radius does the 90 % exceedance
 *      probability fall?" — the inverse of the function above. The
 *      MC engine already exports P10/P50/P90 summary values, but
 *      callers occasionally need an arbitrary percentile.
 *
 * Reference: Wasserman, L. (2004). "All of Statistics", Springer,
 * Ch. 7 "The Bootstrap and the Jackknife" — empirical-distribution
 * convergence and Glivenko-Cantelli theorem.
 */

export interface ExceedanceProbability {
  /** Sorted samples (ascending). The constructor returns this to the
   *  caller for re-use across multiple lookups without re-sorting. */
  sortedSamples: readonly number[];
  /** P(R ≥ threshold). 1 when threshold ≤ smallest sample,
   *  ~1/N when threshold ≥ largest sample. */
  exceedanceAt: (threshold: number) => number;
  /** Inverse: smallest radius r such that P(R ≥ r) ≤ probability.
   *  Useful for "draw the 90 % ring" without re-deriving the
   *  percentile from scratch. */
  percentileAt: (probability: number) => number;
}

/**
 * Build an exceedance-probability oracle from a finite Monte-Carlo
 * sample set. Caller-friendly: pass raw samples once, query as many
 * thresholds / probabilities as needed without re-sorting.
 *
 * Non-finite values (NaN / ±∞) are filtered out — they correspond to
 * "the simulator could not produce a value" (e.g. cratering on a
 * gas-giant target body) and should not bias the ECDF.
 */
export function buildExceedanceProbability(samples: ArrayLike<number>): ExceedanceProbability {
  const finite: number[] = [];
  for (const v of Array.from(samples)) {
    if (typeof v === 'number' && Number.isFinite(v)) finite.push(v);
  }
  finite.sort((a, b) => a - b);
  const n = finite.length;

  // Linear-interpolated ECDF over the sorted sample positions.
  const exceedanceAt = (threshold: number): number => {
    if (n === 0) return 0;
    if (threshold <= (finite[0] ?? 0)) return 1;
    const last = finite[n - 1] ?? 0;
    if (threshold >= last) return 1 / n;
    // Binary search for the first sample ≥ threshold.
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const v = finite[mid] ?? 0;
      if (v < threshold) lo = mid + 1;
      else hi = mid;
    }
    // (n - lo) samples are ≥ threshold. Linear-interpolate between
    // the discrete steps so callers get a smooth function.
    const above = finite[lo] ?? threshold;
    const below = finite[Math.max(0, lo - 1)] ?? threshold;
    const denom = above - below;
    const t = denom > 0 ? (threshold - below) / denom : 0;
    const stepHigh = (n - lo) / n;
    const stepLow = (n - lo + 1) / n;
    return stepLow * (1 - t) + stepHigh * t;
  };

  const percentileAt = (probability: number): number => {
    if (n === 0) return 0;
    const p = Math.max(0, Math.min(1, probability));
    // P(R ≥ r) = p ⇒ r is the (1-p)·N-th order statistic.
    const idx = Math.min(n - 1, Math.max(0, Math.floor((1 - p) * n)));
    return finite[idx] ?? 0;
  };

  return { sortedSamples: finite, exceedanceAt, percentileAt };
}
