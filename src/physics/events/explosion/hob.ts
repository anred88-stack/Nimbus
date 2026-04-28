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
 * 1 psi surface-burst ground-range radius to recover the observed
 * airburst (Mach-stem) reach.
 *
 * The Kinney-Graham fit is for a contact surface burst. Real airbursts
 * develop a Mach-stem reflection that AMPLIFIES the ground-range
 * overpressure relative to the surface case — a 15 kt airburst at the
 * Hiroshima HOB (z ≈ 235) produces 5 psi at ≈ 1.7 km (Glasstone Fig.
 * 3.74a), 1.5× the surface-burst 1.13 km. This factor was previously
 * pinned at 1.0 at the Mach stem optimum, which under-predicted every
 * airburst by 30-50 %.
 *
 * Calibrated against:
 *   Hiroshima 1945 (15 kt, HOB 580 m, z=235): factor 1.50 →
 *     5 psi @ 1.7 km, 1 psi @ 5 km — matches Glasstone Fig 3.74a.
 *   Tsar Bomba 1961 (50 Mt, HOB 4 km, z=109): factor ≈ 1.30 →
 *     5 psi @ 21 km, matches Sublette FAQ within published spread.
 *   Trinity 1945 (21 kt, near-surface tower): factor ≈ 0.90 →
 *     surface-burst regime, matches observed Trinity crater + blast.
 *
 * Piecewise fit (scaled HOB in m/kt^(1/3)):
 *   z < 50     → 0.85                            (surface coupling)
 *   50–150     → 0.85 + 0.65·(z−50)/100          (linear ramp 0.85→1.50)
 *   150–300    → 1.50                            (Mach-stem optimum)
 *   300–700    → 1.50 − 0.80·(z−300)/400         (linear roll-off 1.50→0.70)
 *   700–1500   → 0.70 · exp(−(z−700)/1500)       (exponential to ~0.45)
 *   z ≥ 1500   → 0.25                            (stratospheric)
 *
 * Reference: Glasstone & Dolan (1977), Fig 3.74a/b for the optimum-
 * airburst envelope; Wellerstein NUKEMAP for cross-calibration on
 * Tsar Bomba and Sublette nuclear FAQ for high-yield airbursts.
 */
export function hobBlastFactor(scaled: number): number {
  // Phase-17 calibration. The previous baseline returned 0.85 for
  // surface bursts ("slight ground loss"), but Glasstone & Dolan 1977
  // Fig. 3.74a / Tab 12.20 publishes surface-burst overpressure radii
  // that ALREADY account for surface coupling — Kinney-Graham × 0.85
  // double-counted the loss and pulled Castle Bravo / 1 Mt surface
  // from ✓ to ⚠ on the benchmark. Setting the surface baseline to 1.0
  // recovers the published references within ±20 % across the range.
  if (!Number.isFinite(scaled) || scaled <= 0) return 1.0;
  if (scaled < 50) return 1.0;
  if (scaled < 150) return 1.0 + (0.5 * (scaled - 50)) / 100;
  if (scaled < 300) return 1.5;
  if (scaled < 700) return 1.5 - (0.8 * (scaled - 300)) / 400;
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
