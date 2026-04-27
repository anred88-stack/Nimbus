/**
 * One-at-a-time (OAT) local sensitivity analysis for any deterministic
 * simulator built on this codebase. The audit (UQ-002) flagged that
 * the simulator emitted percentiles via Monte-Carlo without ever
 * answering the more diagnostic question: *which input drives which
 * output*?
 *
 * The OAT method holds every input at its nominal value and perturbs
 * one variable by ±1σ at a time, recording the resulting change in
 * each output. The result is a per-(input, output) pair of finite-
 * difference sensitivity coefficients:
 *
 *   S_ij = (output_i^+ − output_i^−) / (2 · σ_j)
 *
 * Normalised to a dimensionless elasticity:
 *
 *   e_ij = (S_ij · σ_j) / output_i^nominal
 *
 * which directly answers: "if input j varies by 1σ, what fractional
 * change does output i see?". Elasticity is the single number an
 * external reviewer wants to see — values |e| > 1 mean the output is
 * non-linearly sensitive to that input, |e| < 0.1 means the input is
 * effectively a constant for this scenario.
 *
 * OAT is a *local* method — it captures only the gradient at the
 * nominal point and misses interaction effects between inputs. For a
 * full variance-based decomposition (Sobol indices) we would need
 * quasi-random sequences and ~10⁴ simulator calls per input; that's
 * out of scope for the in-app sensitivity feature, but the OAT output
 * is enough to point the reviewer at the dominant input(s).
 *
 * Reference:
 *   Saltelli, A., Tarantola, S., Campolongo, F., & Ratto, M. (2004).
 *    "Sensitivity Analysis in Practice." Wiley, Ch. 2 "One-at-a-time
 *    methods" — including the elasticity normalisation used here.
 */

export interface OatSensitivityInput<TParams extends Record<string, number>> {
  /** Names + nominal values of every uncertain input. */
  nominal: TParams;
  /** Half-range to perturb each input at — same units as the input. */
  sigmas: TParams;
  /** Deterministic simulator: nominal-shaped params → output dictionary. */
  simulate: (params: TParams) => Record<string, number>;
}

export interface OatSensitivityRow {
  /** Output metric this row reports on. */
  output: string;
  /** Output value at the nominal point. */
  nominalValue: number;
  /** Per-input elasticity e_ij = (Δoutput / σ) / output_nominal. */
  elasticity: Record<string, number>;
}

export interface OatSensitivityResult {
  rows: OatSensitivityRow[];
  /** Output metrics ranked by their largest |elasticity|. */
  rankedByMaxAbsElasticity: { output: string; driver: string; elasticity: number }[];
}

export function oatSensitivity<TParams extends Record<string, number>>(
  input: OatSensitivityInput<TParams>
): OatSensitivityResult {
  const nominalOut = input.simulate(input.nominal);
  const outputs = Object.keys(nominalOut);
  const inputs = Object.keys(input.nominal);

  const rows: OatSensitivityRow[] = outputs.map((o) => ({
    output: o,
    nominalValue: nominalOut[o] ?? 0,
    elasticity: {},
  }));

  for (const v of inputs) {
    const sigma = input.sigmas[v as keyof TParams] ?? 0;
    if (sigma === 0) {
      for (const r of rows) r.elasticity[v] = 0;
      continue;
    }
    const baseValue = input.nominal[v as keyof TParams] ?? 0;
    const high = { ...input.nominal, [v]: baseValue + sigma };
    const low = { ...input.nominal, [v]: baseValue - sigma };
    const outHigh = input.simulate(high);
    const outLow = input.simulate(low);
    for (const r of rows) {
      const oH = outHigh[r.output] ?? 0;
      const oL = outLow[r.output] ?? 0;
      const dOdSigma = (oH - oL) / 2;
      // Elasticity: dimensionless fractional change per 1σ of the input.
      // sigma is the half-range; (dOdSigma / nominal) * 1 = elasticity.
      const e = r.nominalValue !== 0 ? dOdSigma / r.nominalValue : 0;
      r.elasticity[v] = e;
    }
  }

  // Rank outputs by their dominant input driver.
  const rankedByMaxAbsElasticity = rows
    .map((r) => {
      let bestVar = '';
      let bestAbs = 0;
      let bestSigned = 0;
      for (const v of inputs) {
        const e = r.elasticity[v] ?? 0;
        if (Math.abs(e) > bestAbs) {
          bestAbs = Math.abs(e);
          bestVar = v;
          bestSigned = e;
        }
      }
      return { output: r.output, driver: bestVar, elasticity: bestSigned };
    })
    .sort((a, b) => Math.abs(b.elasticity) - Math.abs(a.elasticity));

  return { rows, rankedByMaxAbsElasticity };
}
