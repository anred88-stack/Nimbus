import type { Meters } from '../../units.js';

/**
 * Height-of-burst (HOB) correction to the default surface-burst /
 * Kinney–Graham blast radii.
 *
 * References:
 *   Needham, C. E. (2018). "Blast Waves" (Springer), Chapters 3–5.
 *   Brode, H. L. (1970). "Height of burst effects at high
 *    overpressures." RAND RM-6301-DASA.
 *   Glasstone & Dolan (1977), §3.73 and Fig. 3.73.
 *
 * The simulator's default Kinney–Graham fit represents an optimum-HOB
 * airburst envelope. Real events depart from this baseline:
 *   - Contact surface bursts lose ~15–25 % of the 5 psi ring to
 *     ground-coupling absorption.
 *   - Near-optimum airbursts (scaled HOB ≈ 150–300 m·kt⁻¹ᐟ³) get Mach
 *     reflection enhancement.
 *   - High-altitude bursts above ~700 m·kt⁻¹ᐟ³ decouple from the
 *     ground: thermal dominates, blast radii collapse.
 *
 * The correction factor here is a piecewise fit to Fig. 3.73 of G&D /
 * Fig. 3-3 of Needham, parameterised on the scaled HOB.
 */

/** Scaled height-of-burst z = HOB / W^(1/3), in metres per cube-root
 *  kilotonne. A unit-independent HOB classifier. */
export function scaledHeightOfBurst(hobMeters: number, yieldKilotons: number): number {
  if (!Number.isFinite(hobMeters) || !Number.isFinite(yieldKilotons) || yieldKilotons <= 0) {
    return 0;
  }
  return hobMeters / Math.cbrt(yieldKilotons);
}

/** HOB regime classifier. */
export type HobRegime = 'SURFACE' | 'LOW_AIRBURST' | 'OPTIMUM' | 'HIGH_AIRBURST' | 'STRATOSPHERIC';

export function hobRegime(scaled: number): HobRegime {
  if (!Number.isFinite(scaled) || scaled < 50) return 'SURFACE';
  if (scaled < 150) return 'LOW_AIRBURST';
  if (scaled < 300) return 'OPTIMUM';
  if (scaled < 700) return 'HIGH_AIRBURST';
  return 'STRATOSPHERIC';
}

/**
 * Dimensionless correction factor applied to the Kinney–Graham 5 psi /
 * 1 psi ground-range radius. 1.0 = no change (near-optimum airburst);
 * < 1.0 = reduction (surface or stratospheric).
 *
 * Piecewise fit (scaled HOB in m/kt^(1/3)):
 *   z < 50     → 0.85   (surface, ground coupling absorbs ~15 %)
 *   50–150     → 0.85 + 0.15·(z−50)/100 (linear to 1.0 at z=150)
 *   150–300    → 1.00   (Mach reflection sweet spot)
 *   300–700    → 1.00 − 0.3·(z−300)/400 (linear decline to 0.70)
 *   700–1500   → 0.70 · exp(−(z−700)/1500) (exponential roll-off)
 *   z ≥ 1500   → 0.25   (stratospheric; thermal/gamma dominate)
 */
export function hobBlastFactor(scaled: number): number {
  if (!Number.isFinite(scaled) || scaled <= 0) return 0.85;
  if (scaled < 50) return 0.85;
  if (scaled < 150) return 0.85 + (0.15 * (scaled - 50)) / 100;
  if (scaled < 300) return 1.0;
  if (scaled < 700) return 1.0 - (0.3 * (scaled - 300)) / 400;
  if (scaled < 1500) return 0.7 * Math.exp(-(scaled - 700) / 1500);
  return 0.25;
}

/** Apply the HOB correction to an existing ground-range radius (m). */
export function correctRadiusForHob(
  radius: Meters,
  hobMeters: number,
  yieldKilotons: number
): Meters {
  const factor = hobBlastFactor(scaledHeightOfBurst(hobMeters, yieldKilotons));
  return ((radius as number) * factor) as Meters;
}
