import type { MetersPerSecondSquared } from '../../units.js';
import { mps2 } from '../../units.js';

/**
 * Lowest PGA a human can reliably feel indoors. Used as the lower
 * clamp for {@link modifiedMercalliIntensity} so inputs below the
 * threshold round to MMI I (not to a meaningless negative value).
 * Roughly 1 cm/s² — the "not felt" cutoff in Worden et al. (2012).
 */
const MIN_PGA_FOR_MMI_CM_S2 = 1;

/** Worden et al. (2012) piecewise break-point, log₁₀(PGA_cm/s²). */
const WORDEN_BREAK_LOG_PGA = 1.57;

/**
 * Modified Mercalli Intensity (MMI) from peak ground acceleration via
 * the Worden et al. (2012) ground-motion-to-intensity conversion,
 * equation Tbl. 2, California dataset:
 *
 *     log₁₀(PGA) ≤ 1.57:  MMI =  1.78 + 1.55·log₁₀(PGA_cm/s²)
 *     log₁₀(PGA) >  1.57: MMI = −1.60 + 3.70·log₁₀(PGA_cm/s²)
 *
 * The piecewise fit smoothly joins at MMI ≈ 4.21 (the break where the
 * "lightly felt" regime transitions to the "shaking is damaging" one).
 * Returned value clamps to the conventional [I, XII] range.
 *
 * Source: Worden, Gerstenberger, Rhoades & Wald (2012), "Probabilistic
 * relationships between ground-motion parameters and Modified Mercalli
 * Intensity in California", BSSA 102(1), pp. 204–221.
 * DOI: 10.1785/0120110156.
 */
export function modifiedMercalliIntensity(pga: MetersPerSecondSquared): number {
  const pgaCmS2 = Math.max((pga as number) * 100, MIN_PGA_FOR_MMI_CM_S2);
  const logPga = Math.log10(pgaCmS2);
  const mmi = logPga <= WORDEN_BREAK_LOG_PGA ? 1.78 + 1.55 * logPga : -1.6 + 3.7 * logPga;
  return Math.max(1, Math.min(12, mmi));
}

/**
 * Inverse of {@link modifiedMercalliIntensity}: PGA that corresponds
 * to a given MMI under the Worden 2012 piecewise fit. Useful for
 * building "shaking contour" rings keyed off felt-intensity levels.
 */
export function pgaFromMercalliIntensity(mmi: number): MetersPerSecondSquared {
  const clamped = Math.max(1, Math.min(12, mmi));
  const breakMmi = 1.78 + 1.55 * WORDEN_BREAK_LOG_PGA; // ≈ 4.21
  const logPga = clamped <= breakMmi ? (clamped - 1.78) / 1.55 : (clamped + 1.6) / 3.7;
  const pgaCmS2 = 10 ** logPga;
  return mps2(pgaCmS2 / 100); // cm/s² → m/s²
}

/**
 * European-calibrated PGA → MCS intensity conversion from:
 *   Faenza, L. & Michelini, A. (2010). "Regression analysis of MCS
 *   intensity and ground motion parameters in Italy and its application
 *   in ShakeMap." Geophysical Journal International 180 (3):
 *   1117–1133. DOI: 10.1111/j.1365-246X.2009.04467.x.
 *
 *     MCS = 1.68 + 2.58 · log₁₀(PGA_cm/s²)
 *
 * MCS-Mercalli-Cancani-Sieberg is the European intensity scale (in
 * practice near-identical to MMI at most levels). Use this in
 * preference to Worden 2012 for events in Europe / Mediterranean —
 * Worden is California-calibrated and mis-predicts intensity there.
 */
export function mmiFromPgaEuropean(pga: MetersPerSecondSquared): number {
  const pgaCmS2 = Math.max((pga as number) * 100, MIN_PGA_FOR_MMI_CM_S2);
  const mmi = 1.68 + 2.58 * Math.log10(pgaCmS2);
  return Math.max(1, Math.min(12, mmi));
}
