import type { ElevationGrid } from '../elevation/index.js';
import { sampleElevation } from '../elevation/index.js';

/**
 * Coastal-slope extractor for the Synolakis 1987 plane-beach run-up
 * model. Given a DEM and a coastal (lat, lon), estimate the slope β
 * of the sea-to-land transect by walking a short distance inland
 * from the 0 m isobath and differencing elevations.
 *
 * The Synolakis formula R_max ∝ √(cot β) · (H/d)^(1/4) is very
 * sensitive to β — a flat Romagna beach (β ≈ 1/200) produces ~4× the
 * run-up of a Sardinian cliff (β ≈ 1/10). The previous implementation
 * used a constant 1:100 default everywhere; this helper replaces it
 * with a site-specific measurement when a bathymetric grid is loaded.
 *
 * Algorithm:
 *   1. Sample the shoreline point (the DEM cell closest to elevation 0).
 *   2. Step inland `stepMeters` (default 5 km) along the steepest
 *      ascent direction.
 *   3. Return the average slope over that inland leg, clamped to a
 *      physically reasonable band [1/2000, 1/2] so pathological cells
 *      (cliffs, sinkholes, DEM noise) don't produce unphysical run-ups.
 *
 * The returned value is the beach slope angle in radians, the same
 * unit {@link synolakisRunup} already expects.
 */

const EARTH_RADIUS_M = 6_371_000;
const DEFAULT_INLAND_STEP_M = 5_000;
const MIN_SLOPE_RAD = Math.atan(1 / 2_000); // very flat tidal flat
const MAX_SLOPE_RAD = Math.atan(1 / 2); // 27° — coastal cliff cutoff

export interface CoastalSlopeInput {
  /** Bathymetric grid with ocean cells < 0 and land cells > 0. */
  grid: ElevationGrid;
  /** Nominal coastal latitude (°, WGS84). */
  latitude: number;
  /** Nominal coastal longitude (°, WGS84). */
  longitude: number;
  /** Distance inland over which to average slope (m). Defaults to 5 km. */
  inlandStepMeters?: number;
}

/**
 * Estimate the plane-beach slope angle (radians) at the given coastal
 * coordinate. Falls back to the textbook 1:100 default if the site is
 * not a coastline (entirely land or entirely ocean in the sampled
 * window).
 */
export function coastalBeachSlope(input: CoastalSlopeInput): number {
  const { grid, latitude, longitude } = input;
  const inland = input.inlandStepMeters ?? DEFAULT_INLAND_STEP_M;

  const shoreElev = sampleElevation(grid, latitude, longitude);
  // Convert the requested inland step into lat/lon deltas.
  const metersPerDegLat = (EARTH_RADIUS_M * Math.PI) / 180;
  const dLat = inland / metersPerDegLat;
  const metersPerDegLon = metersPerDegLat * Math.max(Math.cos((latitude * Math.PI) / 180), 1e-6);
  const dLon = inland / metersPerDegLon;

  // Probe four compass directions a full step inland, pick the one
  // that delivers the highest positive elevation difference (steepest
  // ascent — i.e. "most inland").
  const probes: { dLatOffset: number; dLonOffset: number }[] = [
    { dLatOffset: dLat, dLonOffset: 0 },
    { dLatOffset: -dLat, dLonOffset: 0 },
    { dLatOffset: 0, dLonOffset: dLon },
    { dLatOffset: 0, dLonOffset: -dLon },
  ];
  let bestRise = -Infinity;
  for (const p of probes) {
    const elev = sampleElevation(grid, latitude + p.dLatOffset, longitude + p.dLonOffset);
    const rise = elev - shoreElev;
    if (rise > bestRise) bestRise = rise;
  }

  // All probes landed on ocean (or lower) → not a coastline. Fall
  // back to the 1:100 plane-beach textbook default.
  if (!Number.isFinite(bestRise) || bestRise <= 0) {
    return Math.atan(1 / 100);
  }

  // slope = atan(rise / inland run), clamped to the physical band.
  const raw = Math.atan(bestRise / inland);
  return Math.max(MIN_SLOPE_RAD, Math.min(MAX_SLOPE_RAD, raw));
}
