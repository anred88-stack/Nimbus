import type { Meters } from './units.js';
import { m } from './units.js';

/**
 * Earth-scale clamping helpers. Several physics formulas used in this
 * repo — thermal-fluence reach for a Chicxulub-class impactor, blast
 * radii for a Tsar-Bomba-scale surface burst — return unshielded,
 * flat-Earth values that can exceed the planet. Past the antipode
 * (half-circumference = π·R) a ground-range disc no longer has a
 * meaningful edge: the damage ring "closes" onto itself. The UI
 * clamps at that bound and annotates the value as global.
 *
 * Earth mean radius from CODATA 2018 / IERS 2010, 6 371 000 m.
 */

/** Earth mean radius (spherical approximation). */
export const EARTH_RADIUS: Meters = m(6_371_000);

/** Great-circle distance from ground zero to the antipode — the
 *  furthest any ground-range damage ring can physically reach. */
export const EARTH_GREAT_CIRCLE_MAX: Meters = m(Math.PI * 6_371_000);

/** Whole-Earth surface area (4πR²), reported in m². */
export const EARTH_SURFACE_AREA_M2 = 4 * Math.PI * 6_371_000 * 6_371_000;

/**
 * Clamp a surface-range distance to the antipodal limit. Anything
 * beyond this is physically meaningless as a ring radius — the ring
 * wraps around and covers the whole sphere.
 */
export function clampToGreatCircle(distance: number): Meters {
  if (Number.isNaN(distance) || distance < 0) return m(0);
  if (distance === Number.POSITIVE_INFINITY) return EARTH_GREAT_CIRCLE_MAX;
  return m(Math.min(distance, EARTH_GREAT_CIRCLE_MAX));
}

/**
 * A radius is "global" when it reaches ≥ 90 % of the antipodal
 * distance — at that point the affected cap covers over 95 % of the
 * Earth's surface and "radius" stops being the right unit.
 */
export function isGlobalReach(distance: number): boolean {
  return Number.isFinite(distance) && distance >= 0.9 * (EARTH_GREAT_CIRCLE_MAX as number);
}

/**
 * Fraction of Earth's surface covered by a spherical cap of given
 * great-circle radius. Cap area = 2πR²·(1 − cos(r/R)); divide by 4πR²
 * to get the fraction. Returns a number in [0, 1].
 */
export function surfaceCoverageFraction(distance: number): number {
  if (!Number.isFinite(distance) || distance <= 0) return 0;
  const clamped = Math.min(distance, EARTH_GREAT_CIRCLE_MAX);
  const angularRadius = clamped / (EARTH_RADIUS as number);
  return (1 - Math.cos(angularRadius)) / 2;
}
