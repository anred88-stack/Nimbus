import { STANDARD_GRAVITY } from '../../constants.js';
import type { Meters, MetersPerSecond, Seconds } from '../../units.js';
import { m, mps, s } from '../../units.js';

/**
 * Phase speed of a long (shallow-water) gravity wave over an ocean of
 * uniform depth h:
 *
 *     c = √(g · h)
 *
 * Valid when the wavelength is much larger than h — the regime
 * tsunamis live in. At h = 4 km (deep ocean) gives ≈ 198 m/s, ≈ 713
 * km/h; at h = 100 m (continental shelf) ≈ 31 m/s, ≈ 113 km/h.
 *
 * Source: Lamb (1932), "Hydrodynamics" (6th ed.), §170; reproduced in
 * every modern physical-oceanography textbook (e.g. Gill 1982, §6.5).
 */
export function shallowWaterWaveSpeed(
  waterDepth: Meters,
  surfaceGravity: number = STANDARD_GRAVITY
): MetersPerSecond {
  return mps(Math.sqrt(surfaceGravity * (waterDepth as number)));
}

/**
 * Travel time of a shallow-water tsunami across a given distance at
 * the specified mean depth. Ignores refraction, dispersion, and
 * bathymetric steering — fine for headline "arrival in X hours"
 * display, not for evacuation timing (which is real ops work).
 */
export function tsunamiTravelTime(
  distance: Meters,
  meanDepth: Meters,
  surfaceGravity: number = STANDARD_GRAVITY
): Seconds {
  const c = Math.sqrt(surfaceGravity * (meanDepth as number));
  return s((distance as number) / c);
}

export interface ShoalingInput {
  /** Deep-ocean wave amplitude (m). */
  deepAmplitude: Meters;
  /** Depth where `deepAmplitude` was measured (m). */
  deepDepth: Meters;
  /** Coastal-shelf depth into which the wave is shoaling (m). */
  shallowDepth: Meters;
}

/**
 * Green's law for amplitude amplification as a long wave climbs onto
 * a shallower shelf:
 *
 *     A_shallow = A_deep · (h_deep / h_shallow)^(1/4)
 *
 * Energy-flux conservation argument: the product A² · √h stays
 * constant as the wave slows, so the amplitude grows as h decreases.
 * This is the canonical first-order approximation for tsunami
 * shoaling — a 1 m deep-ocean wave steepens to ≈ 4 m by the time it
 * reaches a 15 m shelf.
 *
 * Breaks down at the shore itself (the "runup" problem, which needs
 * a different scaling, e.g. Synolakis 1987).
 *
 * Source: Green (1838), "On the motion of waves in a variable canal
 * of small depth and width", Trans. Camb. Philos. Soc. 6, pp. 457–462.
 */
export function shoalingAmplitude(input: ShoalingInput): Meters {
  const A = input.deepAmplitude as number;
  const hDeep = input.deepDepth as number;
  const hShallow = input.shallowDepth as number;
  return m(A * (hDeep / hShallow) ** 0.25);
}
