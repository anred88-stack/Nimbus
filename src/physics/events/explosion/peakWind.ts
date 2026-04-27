import { SEA_LEVEL_PRESSURE } from '../../constants.js';
import type { Joules, Meters, MetersPerSecond, Pascals } from '../../units.js';
import { m, mps } from '../../units.js';
import { peakOverpressure } from './overpressure.js';
import { distanceForOverpressure } from '../impact/damageRings.js';

/**
 * Peak particle (wind) velocity behind a planar shock front, given the
 * peak incident overpressure and the ambient atmospheric pressure.
 *
 * Glasstone & Dolan (1977), "The Effects of Nuclear Weapons" (3rd ed.),
 * §3.55, derive the Rankine–Hugoniot relation for an ideal-gas shock
 * with adiabatic index γ = 1.4 (air) into the closed form:
 *
 *     u_peak = (5 P_s) / (7 P_0) ·  c_0
 *              ───────────────────────────
 *              √[ 1 + (6 P_s) / (7 P_0) ]
 *
 * where P_s is the peak overpressure, P_0 the ambient pressure, and
 * c_0 ≈ √(γ P_0 / ρ_0) the ambient speed of sound. At sea level
 * c_0 ≈ 340 m s⁻¹.
 *
 * Sanity reference (Glasstone Table 3.66, sea-level surface burst):
 *   - 1 psi (6.9 kPa)  → ≈ 38 mph ≈ 17 m/s
 *   - 5 psi (34.5 kPa) → ≈ 163 mph ≈ 73 m/s
 *   - 10 psi (69 kPa)  → ≈ 294 mph ≈ 131 m/s
 *   - 20 psi (138 kPa) → ≈ 502 mph ≈ 224 m/s
 *
 * For positive overpressures the formula returns a positive wind
 * speed; for non-positive inputs (or non-finite ambient pressure) it
 * returns zero so callers do not have to special-case "no shock here".
 */
export function peakWindFromOverpressure(
  overpressure: Pascals,
  ambientPressure: Pascals = SEA_LEVEL_PRESSURE
): MetersPerSecond {
  const Ps = overpressure as number;
  const P0 = ambientPressure as number;
  if (!Number.isFinite(Ps) || Ps <= 0 || !Number.isFinite(P0) || P0 <= 0) {
    return mps(0);
  }
  // Sea-level air, γ = 1.4, R_specific = 287 J/(kg·K), T = 288.15 K →
  //   c_0 = √(γ R T) ≈ 340.3 m/s. Compute it from P_0 against the same
  //   ISA reference density (1.225 kg/m³) so non-sea-level callers are
  //   self-consistent.
  const RHO_0 = 1.225; // kg / m³ at ISA sea level
  const c0 = Math.sqrt((1.4 * P0) / RHO_0);
  const numerator = (5 * Ps) / (7 * P0);
  const denominator = Math.sqrt(1 + (6 * Ps) / (7 * P0));
  return mps((numerator * c0) / denominator);
}

/**
 * Peak wind speed (m s⁻¹) at a given ground range from a TNT-equivalent
 * explosion of total energy `yieldEnergy`. Convenience composition of
 * {@link peakOverpressure} and {@link peakWindFromOverpressure}.
 */
export function peakWindAtRange(input: {
  /** Ground-range distance from burst point (m). */
  distance: Meters;
  /** Total explosive yield (J). */
  yieldEnergy: Joules;
  /** Ambient pressure (Pa). Defaults to sea-level. */
  ambientPressure?: Pascals;
}): MetersPerSecond {
  const Ps = peakOverpressure({
    distance: input.distance,
    yieldEnergy: input.yieldEnergy,
    ...(input.ambientPressure !== undefined && { ambientPressure: input.ambientPressure }),
  });
  return peakWindFromOverpressure(Ps, input.ambientPressure);
}

/**
 * Inverse helper — ground range at which the peak wind drops to a given
 * threshold. Uses {@link distanceForOverpressure} after converting the
 * threshold wind back to its overpressure analogue. Returns `m(NaN)`
 * for non-positive thresholds; the caller should range-check.
 */
export function distanceForPeakWind(
  yieldEnergy: Joules,
  windThreshold: MetersPerSecond,
  ambientPressure: Pascals = SEA_LEVEL_PRESSURE
): Meters {
  const u = windThreshold as number;
  if (!Number.isFinite(u) || u <= 0) return m(Number.NaN);
  // Invert the Rankine–Hugoniot relation for P_s. With x = 6 P_s / (7 P_0)
  // and α = u² · ρ_0 / (P_0 · γ · (5/7)²), the relation rearranges to a
  // quadratic in x:  α (1 + x) = ((5/7) P_s · c_0 / P_0)² / c_0² ⇒ algebra
  // works out to the form below.
  const RHO_0 = 1.225;
  const P0 = ambientPressure as number;
  const c0 = Math.sqrt((1.4 * P0) / RHO_0);
  // u = (5 P_s)/(7 P_0) · c_0 / √(1 + 6 P_s/(7 P_0))
  // Let y = P_s / P_0. Then u = (5 y c_0 / 7) / √(1 + 6 y / 7).
  // Square: u² = (25 y² c_0² / 49) / (1 + 6 y / 7).
  // Rearrange: u² (1 + 6 y / 7) = 25 y² c_0² / 49.
  // → 49 u² + 42 u² y = 25 c_0² y².
  // → 25 c_0² y² − 42 u² y − 49 u² = 0.
  const a = 25 * c0 * c0;
  const b = -42 * u * u;
  const c = -49 * u * u;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return m(Number.NaN);
  // Take the positive root.
  const y = (-b + Math.sqrt(disc)) / (2 * a);
  if (!Number.isFinite(y) || y <= 0) return m(Number.NaN);
  return distanceForOverpressure(yieldEnergy, (y * P0) as Pascals);
}
