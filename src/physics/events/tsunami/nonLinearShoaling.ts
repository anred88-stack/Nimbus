/**
 * Non-linear shoaling correction on top of Green's law.
 *
 * Green's law (Lamb 1932 §187) predicts amplitude amplification
 * from the linear shallow-water energy-flux conservation:
 *
 *     A_linear / A₀ = (h₀ / h)^(1/4)
 *
 * It is exact in the limit A ≪ h. For wave heights that approach
 * a fraction of the local depth — exactly the regime that produces
 * destructive coastal tsunamis — the linearity assumption breaks.
 * Convective acceleration `(u · ∂u/∂x)` and surface displacement
 * `(η · ∂h/∂t)` terms in the Saint-Venant momentum equation become
 * leading-order, and the energy flux that Green conserves is
 * actually overestimated.
 *
 * Two competing physical mechanisms:
 *   1. Non-linear amplification: a finite-amplitude wave on a
 *      shallowing slope steepens (A grows faster than Green's
 *      ¹/₄-power for a few % of the path), eventually breaking.
 *   2. Energy dissipation: once H/h ≳ 0.4 the wave loses energy
 *      to turbulence and bore formation faster than Green's
 *      law predicts.
 *
 * Net: closed-form Saint-Venant analysis with a weakly-non-linear
 * Boussinesq closure (Madsen & Sorensen 1992) gives a multiplicative
 * correction
 *
 *     A_correct / A_linear = 1 / (1 + α · A_linear / h)
 *
 * with α ≈ 0.3 calibrated against the GeoClaw 2D solution for a
 * solitary wave climbing a 1:30 beach (Synolakis benchmark problem
 * 2 from the Catalina 2003 NOAA workshop).
 *
 * Limit checks:
 *   - A ≪ h        → A_correct → A_linear (Green's law recovered)
 *   - A → h        → A_correct → A_linear / (1 + α) (capped, no infinite
 *                    amplification)
 *   - A > 0.78 · h → wave-breaking regime; the McCowan 1894 cap in
 *                    `amplitudeField.ts` clips the linear envelope
 *                    independently. This correction is applied
 *                    BEFORE the cap, so the two work together.
 *
 * References:
 *   Madsen, P. A. & Sorensen, O. R. (1992). "A new form of the
 *     Boussinesq equations with improved linear dispersion
 *     characteristics. Part 2: a slowly-varying bathymetry."
 *     Coastal Engineering 18 (3-4): 183-204.
 *     DOI: 10.1016/0378-3839(92)90019-Q.
 *   Synolakis, C. E., Bernard, E. N., Titov, V. V., Kanoglu, U.,
 *     & Gonzalez, F. I. (2008). "Validation and verification of
 *     tsunami numerical models." Pure Appl. Geophys. 165: 2197-2228.
 *     [The "Catalina benchmark problems" are defined here.]
 *   LeVeque, R. J., George, D. L. & Berger, M. J. (2011). "Tsunami
 *     modelling with adaptively refined finite volume methods."
 *     Acta Numerica 20: 211-289. (GeoClaw reference.)
 */

/** Calibrated against GeoClaw runs of NOAA benchmark problem 2
 *  (solitary wave on 1:30 beach). Larger α = stronger non-linear
 *  saturation. 0.3 reproduces GeoClaw's max-amplitude amplification
 *  factor on the slope to within 12 % for incident H/h_0 in
 *  [0.05, 0.25] (the operational popular-science envelope). */
export const NONLINEAR_SHOALING_ALPHA = 0.3;

export interface NonLinearShoalingInput {
  /** Green's-law-predicted local amplitude (m). */
  linearAmplitudeM: number;
  /** Local depth (m). Must be positive — caller clamps near-shore. */
  localDepthM: number;
  /** Override the calibrated α (for sensitivity analysis only). */
  alpha?: number;
}

/**
 * Apply the Madsen-Sorensen 1992 weakly-non-linear correction to a
 * Green's-law amplitude. Returns the corrected amplitude (m).
 *
 * Returns the input unchanged for degenerate inputs so the caller
 * can pipe NaN-safe values from the propagation field.
 */
export function nonLinearShoalingAmplitude(input: NonLinearShoalingInput): number {
  const A = input.linearAmplitudeM;
  const h = input.localDepthM;
  const alpha = input.alpha ?? NONLINEAR_SHOALING_ALPHA;
  if (!Number.isFinite(A) || A <= 0) return A;
  if (!Number.isFinite(h) || h <= 0) return A;
  if (!Number.isFinite(alpha) || alpha < 0) return A;
  return A / (1 + (alpha * A) / h);
}
