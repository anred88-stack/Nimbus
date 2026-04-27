import type { Meters } from '../units.js';
import { m } from '../units.js';

/**
 * Continuous ejecta-blanket thickness vs. radial distance from an
 * impact crater.
 *
 * Reference:
 *   McGetchin, T. R., Settle, M., & Head, J. W. (1973).
 *   "Radial thickness variation in impact crater ejecta: Implications
 *   for lunar basin deposits."
 *   Earth and Planetary Science Letters 20 (2): 226–236.
 *   DOI: 10.1016/0012-821X(73)90162-3
 *
 * Also cited as Eq. 28 of Collins, Melosh & Marcus (2005), "Earth
 * Impact Effects Program", with pre-exponential 0.14 appropriate for
 * Earth-gravity simple-to-complex craters.
 *
 * T(r) = 0.14 · R · (R / r)^3   for r ≥ R   (r in same units as T)
 *
 * where R is the final-crater rim radius. Inside the crater the
 * formula is not defined; the caller should treat r < R as "inside
 * the cavity, no sensible thickness".
 */

/** Pre-exponential in Eq. 28 (Collins et al. 2005, Earth gravity). */
const MCGETCHIN_COEFFICIENT = 0.14;

/** Ejecta-blanket thickness at ground range `distance` from the
 *  impact center, for a crater of rim radius `craterRimRadius`.
 *  Returns 0 for r ≤ R (inside the crater) by convention. */
export function ejectaThickness(distance: Meters, craterRimRadius: Meters): Meters {
  const r = distance as number;
  const R = craterRimRadius as number;
  if (!Number.isFinite(r) || !Number.isFinite(R) || R <= 0) return m(0);
  if (r <= R) return m(0);
  const ratio = R / r;
  return m(MCGETCHIN_COEFFICIENT * R * ratio * ratio * ratio);
}

/** The outer edge of the "continuous" ejecta blanket — the distance
 *  at which thickness drops to `minThickness` (default 1 mm). Invert
 *  T = 0.14 R (R/r)^3 to r = R · (0.14 R / T_min)^(1/3). */
export function ejectaBlanketOuterEdge(
  craterRimRadius: Meters,
  minThickness: Meters = m(0.001)
): Meters {
  const R = craterRimRadius as number;
  const Tmin = minThickness as number;
  if (!Number.isFinite(R) || R <= 0 || !Number.isFinite(Tmin) || Tmin <= 0) return m(0);
  return m(R * Math.cbrt((MCGETCHIN_COEFFICIENT * R) / Tmin));
}

/** Convenience: ejecta thickness at the standard reference distance
 *  of 2 crater radii (where most "proximal" deposits live). */
export function ejectaThicknessAt2R(craterRimRadius: Meters): Meters {
  return ejectaThickness(m((craterRimRadius as number) * 2), craterRimRadius);
}

/** Ejecta thickness at 10 crater radii — a common "far-field" probe
 *  where the continuous blanket grades into discontinuous deposits. */
export function ejectaThicknessAt10R(craterRimRadius: Meters): Meters {
  return ejectaThickness(m((craterRimRadius as number) * 10), craterRimRadius);
}
