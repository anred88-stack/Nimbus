import type { ElevationGrid } from '../elevation/index.js';
import { computeAmplitudeField, type AmplitudeField } from './amplitudeField.js';
import { coastalBeachSlope } from './coastalSlope.js';
import { computeTsunamiArrivalField, type FastMarchingResult } from './fastMarching.js';
import { extractIsochrones, type IsochroneBand } from './isochrones.js';
import { computeRunupField, type RunupField } from './runupField.js';

/**
 * High-level orchestrator that runs the Fast-Marching arrival-time
 * field, extracts the headline isochrones (1 h / 2 h / 4 h / 8 h),
 * and returns everything the UI needs to draw bathymetric-aware
 * tsunami propagation on the globe.
 *
 * When the app has no bathymetric grid loaded this is never called;
 * callers stay on the uniform-depth 1/r or cylindrical-spread model
 * (Ward & Asphaug 2000 for impact sources; seismicTsunami for
 * megathrust sources). The FMM branch activates only when a real
 * ETOPO raster is injected at startup.
 */

/** Default isochrone set — 1, 2, 4, 8 h — the NOAA tsunami-bulletin
 *  standard cadence. Callers can override per run. */
export const DEFAULT_ISOCHRONE_HOURS = [1, 2, 4, 8] as const;

export interface BathymetricTsunamiInput {
  grid: ElevationGrid;
  sourceLatitude: number;
  sourceLongitude: number;
  /** Isochrone thresholds (hours). Defaults to 1/2/4/8 h. */
  isochroneHours?: readonly number[];
  /** Optional source-amplitude metadata. When supplied, the result
   *  carries an {@link AmplitudeField} for renderers that want to
   *  show the wave-height heatmap on top of the arrival contours. */
  sourceAmplitudeM?: number;
  /** Companion to sourceAmplitudeM — the cavity radius that seeded
   *  the wave. Together they parameterise the Green-law + 1/√r
   *  amplitude propagation. */
  sourceCavityRadiusM?: number;
  /** Mean depth at the source (m). Falls through to the amplitude
   *  module's default (1 000 m) when omitted. */
  sourceDepthM?: number;
}

export interface BathymetricTsunamiResult {
  /** Raw arrival-time field. Mostly useful for debugging / R&D. */
  field: FastMarchingResult;
  /** Marching-squares isochrone polylines for each threshold. */
  isochrones: IsochroneBand[];
  /** Echo of the source coordinates used. */
  sourceLatitude: number;
  sourceLongitude: number;
  /** Optional Green-law + 1/√r amplitude field on the same grid as
   *  `field`. Present only when the caller passed sourceAmplitudeM
   *  and sourceCavityRadiusM. */
  amplitude?: AmplitudeField;
  /** Optional Synolakis 1987 run-up field — vertical run-up height at
   *  each coastal cell. Present only when an amplitude field was
   *  produced (depends on sourceAmplitudeM + sourceCavityRadiusM). */
  runup?: RunupField;
}

export function computeBathymetricTsunami(
  input: BathymetricTsunamiInput
): BathymetricTsunamiResult {
  const hours = input.isochroneHours ?? DEFAULT_ISOCHRONE_HOURS;
  const field = computeTsunamiArrivalField({
    grid: input.grid,
    sourceLatitude: input.sourceLatitude,
    sourceLongitude: input.sourceLongitude,
  });
  const isochrones = extractIsochrones({
    field,
    minLat: input.grid.minLat,
    maxLat: input.grid.maxLat,
    minLon: input.grid.minLon,
    maxLon: input.grid.maxLon,
    thresholds: hours.map((h) => h * 3_600),
  });
  const result: BathymetricTsunamiResult = {
    field,
    isochrones,
    sourceLatitude: input.sourceLatitude,
    sourceLongitude: input.sourceLongitude,
  };
  if (
    input.sourceAmplitudeM !== undefined &&
    input.sourceCavityRadiusM !== undefined &&
    input.sourceAmplitudeM > 0 &&
    input.sourceCavityRadiusM > 0
  ) {
    const amplitude = computeAmplitudeField({
      arrivalField: field,
      grid: input.grid,
      sourceAmplitudeM: input.sourceAmplitudeM,
      sourceCavityRadiusM: input.sourceCavityRadiusM,
      ...(input.sourceDepthM !== undefined && { sourceDepthM: input.sourceDepthM }),
    });
    result.amplitude = amplitude;
    result.runup = computeRunupField({ amplitudeField: amplitude, grid: input.grid });
  }
  return result;
}

export { coastalBeachSlope, extractIsochrones, computeTsunamiArrivalField };
export { computeAmplitudeField, type AmplitudeField } from './amplitudeField.js';
