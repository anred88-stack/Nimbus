import { SEAWATER_DENSITY } from '../constants.js';
import type { KilogramPerCubicMeter, Meters } from '../units.js';

/**
 * Hydrodynamic absorption of impactor kinetic energy in the water
 * column before it reaches the seafloor.
 *
 * The problem. Pre-Phase-18 the simulator passed the same
 * post-atmospheric kinetic energy `ke · gf` to BOTH the seafloor
 * crater scaling AND the Ward-Asphaug cavity formation, double-
 * counting the impact energy whenever the click sat over water.
 * For shallow shelves (Chicxulub on 100 m carbonate) the error was
 * negligible because the water column is small compared to the
 * impactor; for deep-ocean strikes (1 km asteroid in 4 km basin)
 * the model drew a phantom seafloor crater AND a full Ward cavity
 * from the same joules, contradicting both Gisler 2011 hydrocode
 * results and the Eltanin geological record (1-4 km asteroid in
 * 5 km Pacific deep ocean, 2.5 Ma, NO observable seafloor crater).
 *
 * The fix. Crawford & Mader 1998 derived an exponential absorption
 * profile for the impactor's kinetic energy as it traverses the
 * water column. The fraction reaching the seafloor scales as
 *
 *     f_seafloor = exp(−d_water / d_critical)
 *     d_critical = β · L · sqrt(ρ_i / ρ_water)
 *
 * with β ≈ 0.5 calibrated against Gisler et al. (2011) RAGE
 * hydrocode runs. The complementary fraction f_water = 1 − f_seafloor
 * is what couples into the water cavity / tsunami source.
 *
 * Calibration anchors (β = 0.5, ρ_water = 1025 kg/m³):
 *   - Chicxulub on 100 m shelf  → f_seafloor ≈ 0.99 (crater intact)
 *   - 1 km asteroid in 4 km basin → f_seafloor ≈ 0.01 (crater suppressed)
 *   - Eltanin (1 km, 5 km basin)  → f_seafloor ≈ 0.003 (no crater) ✓
 *   - 100 m bolide in 4 km basin  → f_seafloor ≈ 0     (no crater)
 *
 * The Gisler 2011 hydrocode regime boundary is "seafloor crater
 * suppressed once d_water > 5-7 × L"; the exponential form recovers
 * this transition at d_water/L ≈ 5 → f_seafloor ≈ 6 % (for
 * stony-density bodies), inside the Gisler envelope.
 *
 * References:
 *   Crawford, D.A. & Mader, C.L. (1998). "Modeling Asteroid Impact
 *     and Tsunami." Sci. Tsunami Hazards 16 (1), 21-30.
 *   Wuennemann, K., Weiss, R. & Hofmann, K. (2007). "Characteristics
 *     of oceanic impact-induced large water waves: re-evaluation of
 *     the tsunami hazard." Meteoritics & Planetary Science 42 (11),
 *     1893-1903. DOI: 10.1111/j.1945-5100.2007.tb00548.x.
 *   Wuennemann, K., Collins, G.S. & Weiss, R. (2010). "Impact of a
 *     cosmic body into Earth's ocean and the generation of large
 *     tsunami waves: insight from numerical modeling." Reviews of
 *     Geophysics 48 (4), RG4006. DOI: 10.1029/2009RG000308.
 *   Gisler, G., Weaver, R. & Mader, C. (2011). "Two and three
 *     dimensional simulations of asteroid ocean impacts." Sci.
 *     Tsunami Hazards 30 (1), 14-30.
 *   Range, M.M. et al. (2022). "The Chicxulub impact produced a
 *     powerful global tsunami." AGU Advances 3, e2021AV000627.
 *     DOI: 10.1029/2021AV000627.
 */

/** Crawford-Mader 1998 calibration coefficient. β = 0.5 fits the
 *  Gisler 2011 RAGE-hydrocode "5–7 × L" suppression threshold for
 *  stony asteroids in deep water. Iron bodies (ρ_i / ρ_water ≈ 7.6)
 *  reach the seafloor through proportionally deeper water columns,
 *  matching the empirical Meteor-Crater regime. */
export const WATER_COLUMN_COUPLING_BETA = 0.5;

/** Hard cutoff: above this water-depth-to-impactor-diameter ratio
 *  (density-corrected), the impactor fragments completely in the
 *  water column and the seafloor crater is fully suppressed. The
 *  Crawford-Mader exponential alone gives non-zero seafloor energy
 *  even at d_water ≫ L (because the exponential never quite reaches
 *  zero) — that residual energy still drives a 5-6 km Schultz-Pike
 *  crater for the Eltanin canonical case (1.5 km stony in 5 km
 *  basin), contradicting the Gersonde et al. 1997 (Nature 390:357)
 *  geological "no crater" finding for the actual 2.5 Ma South
 *  Pacific event. The hard cutoff models complete projectile
 *  disruption — no coherent impactor reaches the seafloor, so even
 *  if energy gets there it is spread over a wide area and no
 *  cratering takes place.
 *
 *  Threshold value 1.5 calibrated against Gersonde 1997 and
 *  Wuennemann et al. 2010 hydrocode "no crater" boundary:
 *    - Eltanin 1.5 km stony, 5 km basin: d/L = 3.33, threshold
 *      1.5·√(3000/1025) = 2.57 → cutoff active, no crater ✓
 *    - Eltanin 1 km stony, 5 km basin (Gersonde-canonical):
 *      d/L = 5 → cutoff active, no crater ✓
 *    - Chicxulub 10 km stony, 100 m carbonate shelf: d/L = 0.01
 *      → cutoff inactive, Crawford-Mader takes over (f ≈ 0.99) ✓
 *    - Meteor Crater 50 m iron, 0 m water: d/L = 0 → cutoff
 *      inactive, full intact crater ✓
 *    - 4 km stony in 4 km basin: d/L = 1 → cutoff inactive,
 *      Crawford-Mader gives partial crater (~30 % of nominal)
 *    - 100 m stony in 4 km basin: d/L = 40 → cutoff active,
 *      no crater (correct — small bolides in deep ocean don't
 *      mark the seabed) */
export const WATER_COLUMN_DISRUPTION_RATIO = 1.5;

export interface OceanCouplingInput {
  /** Impactor diameter (m). */
  impactorDiameter: Meters;
  /** Water depth at the impact point (m). 0 = land impact. */
  waterDepth: Meters;
  /** Impactor bulk density (kg/m³). Drives d_critical via the
   *  density ratio sqrt(ρ_i / ρ_water): denser bodies (iron, 7800)
   *  push through proportionally deeper water columns than stony
   *  ones (3000) at the same diameter. */
  impactorDensity: KilogramPerCubicMeter;
  /** Water density. Defaults to SEAWATER_DENSITY (1025 kg/m³). */
  waterDensity?: KilogramPerCubicMeter;
}

export interface OceanCouplingResult {
  /** Fraction of post-atmospheric KE that reaches the seafloor as
   *  a coherent impactor body. Scales the seafloor crater + ground-
   *  coupled blast. 1 for waterDepth = 0; → 0 for d_water ≫ L. */
  seafloorFraction: number;
  /** Complementary fraction that drives the water-cavity formation
   *  (Ward-Asphaug source) and ultimately the tsunami. f_water +
   *  f_seafloor = 1. */
  waterFraction: number;
  /** Characteristic absorption depth d_critical = β · L · √(ρ_i/ρ_w),
   *  surfaced for diagnostics / tooltip transparency. */
  characteristicDepth: Meters;
}

/**
 * Compute the seafloor / water-cavity energy partition for an ocean
 * impact. See module header for the physics derivation and citations.
 *
 * Returns f_seafloor = 1 (and f_water = 0) for any non-positive water
 * depth, so land impacts route 100 % of the post-atmospheric KE into
 * the regular crater pipeline. Symmetric for non-positive impactor
 * diameter (defensive: should be caught upstream).
 */
export function oceanCouplingPartition(input: OceanCouplingInput): OceanCouplingResult {
  const L = input.impactorDiameter as number;
  const dWater = input.waterDepth as number;
  const rhoI = input.impactorDensity as number;
  const rhoW = (input.waterDensity ?? SEAWATER_DENSITY) as number;

  if (!Number.isFinite(L) || L <= 0 || !Number.isFinite(dWater) || dWater <= 0) {
    return {
      seafloorFraction: 1,
      waterFraction: 0,
      characteristicDepth: 0 as Meters,
    };
  }

  const dCritical = WATER_COLUMN_COUPLING_BETA * L * Math.sqrt(rhoI / rhoW);
  // Defensive: dCritical can never be ≤ 0 given the guards above,
  // but Number.isFinite check costs nothing and protects against
  // pathological density inputs.
  if (!Number.isFinite(dCritical) || dCritical <= 0) {
    return {
      seafloorFraction: 1,
      waterFraction: 0,
      characteristicDepth: 0 as Meters,
    };
  }

  // Deep-water disruption hard cutoff (audit fix #8). Above
  // d_water > WATER_COLUMN_DISRUPTION_RATIO · L · √(ρ_i/ρ_w) the
  // impactor fragments completely in the water column and no
  // coherent body reaches the seafloor — Wuennemann 2010 + Gersonde
  // 1997 Eltanin "no crater" calibration. Crawford-Mader's
  // exponential alone leaves a non-zero residual that produces
  // 5-6 km cratering for canonical Eltanin (1.5 km stony, 5 km
  // basin), contradicting the geological record. The hard cutoff
  // routes 100 % of the post-atmospheric KE into the water-cavity
  // tsunami source, giving a clean energy-conservation accounting.
  const disruptionDepth = WATER_COLUMN_DISRUPTION_RATIO * L * Math.sqrt(rhoI / rhoW);
  if (dWater > disruptionDepth) {
    return {
      seafloorFraction: 0,
      waterFraction: 1,
      characteristicDepth: dCritical as Meters,
    };
  }

  const seafloorFraction = Math.exp(-dWater / dCritical);
  return {
    seafloorFraction,
    waterFraction: 1 - seafloorFraction,
    characteristicDepth: dCritical as Meters,
  };
}
