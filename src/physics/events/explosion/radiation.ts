import type { Meters } from '../../units.js';
import { m } from '../../units.js';

/**
 * Initial nuclear-radiation (gamma + neutron) lethal-dose contours.
 *
 * References:
 *   Glasstone & Dolan (1977), "The Effects of Nuclear Weapons"
 *    (3rd ed.), §8.21–§8.50 and Table 8.50.
 *   UNSCEAR 2000 Report, "Sources and Effects of Ionizing Radiation",
 *    Annex C — Dose responses for lethality.
 *   BEIR VII Phase 2 (2006), "Health Risks from Exposure to Low Levels
 *    of Ionizing Radiation", National Research Council.
 *
 * LD₅₀/60 for acute whole-body gamma exposure is about 4–4.5 Gy; LD₁₀₀
 * sits near 8 Gy. At these dose levels, the death window is 30–60 d
 * post-exposure without intensive medical support.
 *
 * The headline radii implemented here scale with yield^0.4, matching
 * Glasstone Fig. 8.46 in the low-yield regime. Atmospheric scattering
 * and terrain shadowing are ignored; the radii should be read as
 * nominal upper envelopes on a flat, unshielded target at sea level.
 */

/** Reference LD₅₀/60 radius for a 1 kt burst (Glasstone Fig. 8.46 fit). */
const LD50_REFERENCE_RADIUS_KT1 = 700;
/** LD₁₀₀ sits at roughly 70 % of the LD₅₀ distance. */
const LD100_TO_LD50_RATIO = 0.7;
/** Yield-scaling exponent for the initial radiation envelope. */
const YIELD_EXPONENT = 0.4;

export interface RadiationDoseResult {
  /** Ground range at which the initial gamma + neutron dose reaches
   *  ≈4.5 Gy (LD₅₀/60 for unshielded adults). */
  ld50Radius: Meters;
  /** Ground range at which the initial dose reaches ≈8 Gy (LD₁₀₀). */
  ld100Radius: Meters;
  /** Ground range at which the dose drops to 1 Gy — the acute-
   *  radiation-syndrome threshold (ARS "mild" symptoms). */
  arsThresholdRadius: Meters;
}

/** Headline initial-radiation radii for a given TNT-equivalent yield
 *  (megatons). See module header for references. */
export function initialRadiationRadii(yieldMegatons: number): RadiationDoseResult {
  const yieldKt = yieldMegatons * 1_000;
  if (!Number.isFinite(yieldKt) || yieldKt <= 0) {
    return { ld50Radius: m(0), ld100Radius: m(0), arsThresholdRadius: m(0) };
  }
  const ld50 = LD50_REFERENCE_RADIUS_KT1 * Math.pow(yieldKt, YIELD_EXPONENT);
  const ld100 = ld50 * LD100_TO_LD50_RATIO;
  // ARS-threshold (1 Gy) sits ~1.4× the LD₅₀ distance (log-linear fit
  // to Glasstone Fig. 8.46 in the sub-lethal dose band).
  const ars = ld50 * 1.4;
  return {
    ld50Radius: m(ld50),
    ld100Radius: m(ld100),
    arsThresholdRadius: m(ars),
  };
}
