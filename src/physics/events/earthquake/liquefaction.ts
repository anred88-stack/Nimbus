import { STANDARD_GRAVITY } from '../../constants.js';
import type { Meters, MetersPerSecondSquared } from '../../units.js';
import { mps2 } from '../../units.js';
import { distanceForPga } from './attenuation.js';

/**
 * Soil-liquefaction potential thresholds following:
 *   Youd, T. L. & Idriss, I. M. (2001). "Liquefaction resistance of
 *    soils: Summary report from the 1996 NCEER and 1998 NCEER/NSF
 *    workshops on evaluation of liquefaction resistance of soils."
 *    ASCE Journal of Geotechnical and Geoenvironmental Engineering
 *    127 (4): 297–313. DOI: 10.1061/(ASCE)1090-0241(2001)127:4(297).
 *   Idriss, I. M. (1999). "An update of the Seed-Idriss simplified
 *    procedure for evaluating liquefaction potential." TRB Workshop
 *    Paper, MSF from Eq. 6.
 *
 * The engineering procedure is complex (CSR vs. CRR curves, fines
 * content correction, effective-stress reduction with depth). This
 * module condenses the headline outcome into a single "PGA threshold
 * for liquefaction on susceptible saturated sandy soil" plus the
 * magnitude scaling factor.
 */

/** Reference PGA threshold for liquefaction at Mw 7.5 (g units). */
const PGA_THRESHOLD_M75_G = 0.1;

/** Idriss (1999) magnitude scaling factor: accounts for the longer
 *  shaking duration of larger events triggering liquefaction at lower
 *  PGA. MSF(7.5) = 1 by construction. */
export function liquefactionMagnitudeScalingFactor(magnitude: number): number {
  if (!Number.isFinite(magnitude) || magnitude <= 0) return 1;
  return Math.pow(magnitude / 7.5, -2.56);
}

/** PGA threshold (m/s²) above which liquefaction is likely on a
 *  susceptible saturated sandy soil, for a given magnitude. */
export function liquefactionPgaThreshold(magnitude: number): MetersPerSecondSquared {
  const msf = liquefactionMagnitudeScalingFactor(magnitude);
  return mps2(PGA_THRESHOLD_M75_G * msf * STANDARD_GRAVITY);
}

/** Ground-range radius (m) within which liquefaction is likely on
 *  saturated sandy soil for a given magnitude, using the legacy
 *  Joyner–Boore PGA attenuation as the ground-motion model. */
export function liquefactionRadius(magnitude: number): Meters {
  const threshold = liquefactionPgaThreshold(magnitude);
  return distanceForPga(magnitude, threshold);
}
