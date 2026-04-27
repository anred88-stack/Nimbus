/**
 * Unified σ conventions for every uncertain input across the simulator.
 *
 * The audit (NUM-003) flagged that scatter parameters were duplicated
 * across the Monte-Carlo wrappers (one σ in `impactMonteCarlo.ts`,
 * another in `explosionMonteCarlo.ts`, etc.) with no shared traceability
 * back to the source paper. This module is the single source of truth
 * — every Monte-Carlo wrapper imports its σ from here, and this is the
 * file the methodology page (Phase 6) cites.
 *
 * **σ semantics.** Each entry declares whether the underlying scatter
 * is *linear* (a normal distribution on the value, σ in absolute units
 * or as a fraction of the median) or *log-normal* (a normal distribution
 * on ln(value), σ in natural-log units — what the original papers
 * report for energy-like and magnitude-like quantities).
 *
 *   - `kind: 'linear-fraction'` — sample from N(median, σ · median).
 *     Use for moderately scattered, near-symmetric quantities.
 *   - `kind: 'linear-absolute'` — sample from N(median, σ_abs).
 *     Use when σ is reported as an absolute floor (e.g. 50 m on HOB).
 *   - `kind: 'lognormal'` — sample from log-normal with σ_log = σ.
 *     Use for scale-spanning quantities (densities, energies, plume
 *     heights) where the published scatter is "factor of N" or σ_log.
 *
 * Each entry also carries a citation so an external reviewer can check
 * the σ value against the source paper without reading the simulator.
 */

export type SigmaConvention =
  | { kind: 'linear-fraction'; sigma: number; source: string }
  | { kind: 'linear-absolute'; sigma: number; unit: string; source: string }
  | { kind: 'lognormal'; sigma: number; source: string };

/** Cosmic-impact input scatter — see Mainzer 2019 / Britt & Consolmagno 2003. */
export const IMPACT_INPUT_SIGMA = {
  /** Impactor diameter — log-normal σ_log = 0.15. NEOWISE-class
   *  survey data (Mainzer 2019), factor-1.16 spread on the median. */
  diameter: { kind: 'lognormal', sigma: 0.15, source: 'Mainzer 2019' },
  /** Impactor velocity — linear σ = 10 % of nominal. Typical orbital-
   *  solution uncertainty for a well-observed NEO (JPL Sentry). */
  velocity: { kind: 'linear-fraction', sigma: 0.1, source: 'JPL Sentry orbital fits' },
  /** Impactor density — log-normal σ_log = 0.15. Taxonomy-class
   *  spread (Britt & Consolmagno 2003 Table 2). */
  density: { kind: 'lognormal', sigma: 0.15, source: 'Britt & Consolmagno 2003 Table 2' },
} as const satisfies Record<string, SigmaConvention>;

/** Explosion input scatter — see Penney 1970 / Sublette nuclear FAQ. */
export const EXPLOSION_INPUT_SIGMA = {
  /** Yield — log-normal σ_log = 0.1. Cold-War weapons tests showed
   *  ~10 % spread between design yield and observed (Castle Bravo's
   *  15 Mt from a 6 Mt design is the *outlier*, not the rule;
   *  Sublette FAQ reports σ ≈ 0.1 for production-line devices). */
  yield: { kind: 'lognormal', sigma: 0.1, source: 'Sublette nuclear FAQ' },
  /** Height of burst — linear absolute σ = 50 m (or 5 % of the
   *  nominal HOB, whichever is larger). Reconstruction error band
   *  on Hiroshima's 580 m HOB per Penney et al. 1970. */
  heightOfBurst: {
    kind: 'linear-absolute',
    sigma: 50,
    unit: 'm',
    source: 'Penney et al. 1970',
  },
} as const satisfies Record<string, SigmaConvention>;

/** Volcano input scatter — see Mastin 2009 / Iverson 1997. */
export const VOLCANO_INPUT_SIGMA = {
  /** Volume eruption rate V̇ — log-normal σ_log = 0.5 (factor-2
   *  scatter on Mastin 2009 Fig. 2). */
  volumeEruptionRate: { kind: 'lognormal', sigma: 0.5, source: 'Mastin 2009 Fig. 2' },
  /** Total ejecta volume — log-normal σ_log = 0.3 (deposit
   *  reconstructions agree to ±factor-1.5×). */
  totalEjectaVolume: { kind: 'lognormal', sigma: 0.3, source: 'Self & Rampino 1981 ejecta' },
  /** Lahar volume — log-normal σ_log = 0.5 (Iverson 1997 runout). */
  laharVolume: { kind: 'lognormal', sigma: 0.5, source: 'Iverson 1997 runout' },
} as const satisfies Record<string, SigmaConvention>;

/** Earthquake input scatter — see USGS COMCAT spread. */
export const EARTHQUAKE_INPUT_SIGMA = {
  /** Moment magnitude — linear absolute σ = 0.15 Mw. USGS COMCAT
   *  spread between agencies on a single event. */
  magnitude: {
    kind: 'linear-absolute',
    sigma: 0.15,
    unit: 'Mw',
    source: 'USGS COMCAT cross-agency spread',
  },
  /** Hypocentre depth — fraction-relative σ = 20 %. ISC-GEM spread
   *  for intermediate-depth events (5 km absolute floor enforced by
   *  the wrapper). */
  depth: { kind: 'linear-fraction', sigma: 0.2, source: 'ISC-GEM hypocentre catalog' },
  /** Vs30 site velocity — fraction-relative σ = 30 %. Wald & Allen
   *  2007 topographic-slope proxy uncertainty (their Fig. 6). */
  vs30: { kind: 'linear-fraction', sigma: 0.3, source: 'Wald & Allen 2007 Fig. 6' },
} as const satisfies Record<string, SigmaConvention>;

/**
 * Output 1σ scatter — used by `confidence.ts` to draw static error
 * bars next to point estimates. These come from the source paper's
 * own published scatter, NOT from the input-side σ above.
 *
 * Mirror of `CONFIDENCE_SIGMA` in confidence.ts — kept here so the
 * methodology page can cite both the input-side and output-side σ
 * from a single import.
 */
export const OUTPUT_SIGMA = {
  firestormIgnition: {
    kind: 'linear-fraction',
    sigma: 0.3,
    source: 'Glasstone & Dolan 1977 §7.40',
  },
  firestormSustain: { kind: 'linear-fraction', sigma: 0.3, source: 'Glasstone & Dolan 1977 §7.40' },
  plumeHeight: { kind: 'lognormal', sigma: 0.5, source: 'Mastin 2009 Fig. 2 + Aubry 2023' },
  pyroclasticRunout: {
    kind: 'linear-fraction',
    sigma: 0.7,
    source: 'Sheridan 1979 vs Dade & Huppert 1998',
  },
  ashfallArea: { kind: 'lognormal', sigma: 0.69, source: 'Walker 1980 / Pyle 1989' }, // ln(2) ≈ 0.69
  laharRunout: { kind: 'lognormal', sigma: 0.69, source: 'Iverson 1997 volume-runout' },
  tsunamiRunup: { kind: 'linear-fraction', sigma: 0.3, source: 'Synolakis 1987 run-up' },
  tsunamiWunnemannFarField: {
    kind: 'lognormal',
    sigma: 1.1,
    source: 'Wünnemann et al. 2007 Fig. 6',
  }, // ln(3) ≈ 1.1
} as const satisfies Record<string, SigmaConvention>;

/**
 * Convenience dictionary for the OAT sensitivity script — maps each
 * uncertain input to the half-range to perturb at, in the input's
 * native units. For log-normal σ we convert to a linear ±1σ swing
 * via exp(σ_log) − 1.
 */
export function asLinearHalfRange(c: SigmaConvention): number {
  if (c.kind === 'linear-fraction') return c.sigma;
  if (c.kind === 'linear-absolute') return c.sigma;
  // log-normal: a 1σ excursion in ln-space corresponds to a multiplicative
  // factor exp(σ_log). The equivalent linear half-range is therefore
  // (exp(σ_log) − 1) on the high side and (1 − exp(−σ_log)) on the low.
  return Math.exp(c.sigma) - 1;
}
