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
 *
 * Phase 11 — hierarchical multi-resolution grid. The orchestrator
 * accepts an optional `globalGrid` (low-res ~40 km/pixel mosaic)
 * alongside the high-res `grid` (zoom-8 tile, ~600 m/pixel). When
 * both are present:
 *
 *   - Local layer: high-res FMM + amplitude field + run-up over the
 *     ~150 km source-tile bbox. Used for accurate near-source detail.
 *   - Global layer: low-res FMM + amplitude field over the entire
 *     planet. Used for trans-oceanic iso-contour rendering.
 *
 * Without the global layer, Chicxulub-class tsunamis truncated their
 * iso-contours at ~75 km from source; with it, the same scenario
 * draws correct iso-contours all the way to the antipodes.
 */

/** Default isochrone set — 1, 2, 4, 8 h — the NOAA tsunami-bulletin
 *  standard cadence. Callers can override per run. */
export const DEFAULT_ISOCHRONE_HOURS = [1, 2, 4, 8] as const;

export interface BathymetricTsunamiInput {
  /** High-resolution local grid covering the source area (~150 km
   *  bbox at zoom-8, ~600 m/pixel). Drives near-source detail. */
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
  /** Phase 11 — optional low-resolution global grid (~40 km/pixel,
   *  full planet). When provided alongside `grid`, the orchestrator
   *  emits an additional global FMM + amplitude pair so the renderer
   *  can draw trans-oceanic iso-contours that follow real coastlines
   *  outside the local tile. */
  globalGrid?: ElevationGrid;
}

export interface BathymetricLayer {
  field: FastMarchingResult;
  isochrones: IsochroneBand[];
  amplitude?: AmplitudeField;
}

export interface BathymetricTsunamiResult {
  /** Raw arrival-time field on the local high-res grid. Mostly
   *  useful for debugging / R&D. */
  field: FastMarchingResult;
  /** Marching-squares isochrone polylines for each threshold. */
  isochrones: IsochroneBand[];
  /** Echo of the source coordinates used. */
  sourceLatitude: number;
  sourceLongitude: number;
  /** Optional Green-law + 1/√r amplitude field on the local grid.
   *  Present only when the caller passed sourceAmplitudeM and
   *  sourceCavityRadiusM. */
  amplitude?: AmplitudeField;
  /** Optional Synolakis 1987 run-up field — vertical run-up height at
   *  each coastal cell. Present only when an amplitude field was
   *  produced (depends on sourceAmplitudeM + sourceCavityRadiusM). */
  runup?: RunupField;
  /** Phase 11 — optional global low-res layer for trans-oceanic
   *  iso-contour rendering. Same structure as the local layer but
   *  computed against the planet-wide bathymetric mosaic. */
  global?: BathymetricLayer;
}

export function computeBathymetricTsunami(
  input: BathymetricTsunamiInput
): BathymetricTsunamiResult {
  const hours = input.isochroneHours ?? DEFAULT_ISOCHRONE_HOURS;
  const thresholds = hours.map((h) => h * 3_600);

  // ---- Local high-res layer (always computed) -------------------
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
    thresholds,
  });
  const result: BathymetricTsunamiResult = {
    field,
    isochrones,
    sourceLatitude: input.sourceLatitude,
    sourceLongitude: input.sourceLongitude,
  };
  const hasSourceMeta =
    input.sourceAmplitudeM !== undefined &&
    input.sourceCavityRadiusM !== undefined &&
    input.sourceAmplitudeM > 0 &&
    input.sourceCavityRadiusM > 0;
  if (
    hasSourceMeta &&
    input.sourceAmplitudeM !== undefined &&
    input.sourceCavityRadiusM !== undefined
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

  // ---- Phase 11 global low-res layer (optional) -----------------
  if (input.globalGrid !== undefined) {
    const globalField = computeTsunamiArrivalField({
      grid: input.globalGrid,
      sourceLatitude: input.sourceLatitude,
      sourceLongitude: input.sourceLongitude,
    });
    // Long isochrone thresholds for trans-oceanic propagation —
    // 4/8/12/24 h instead of the local 1/2/4/8 h cadence so the
    // global layer's contours don't crowd the high-res near-source
    // bands when both are rendered together.
    const globalIsochrones = extractIsochrones({
      field: globalField,
      minLat: input.globalGrid.minLat,
      maxLat: input.globalGrid.maxLat,
      minLon: input.globalGrid.minLon,
      maxLon: input.globalGrid.maxLon,
      thresholds: [4, 8, 12, 24].map((h) => h * 3_600),
    });
    const globalLayer: BathymetricLayer = {
      field: globalField,
      isochrones: globalIsochrones,
    };
    if (
      hasSourceMeta &&
      input.sourceAmplitudeM !== undefined &&
      input.sourceCavityRadiusM !== undefined
    ) {
      globalLayer.amplitude = computeAmplitudeField({
        arrivalField: globalField,
        grid: input.globalGrid,
        sourceAmplitudeM: input.sourceAmplitudeM,
        sourceCavityRadiusM: input.sourceCavityRadiusM,
        ...(input.sourceDepthM !== undefined && { sourceDepthM: input.sourceDepthM }),
      });
    }
    result.global = globalLayer;
  }

  return result;
}

export { coastalBeachSlope, extractIsochrones, computeTsunamiArrivalField };
export { computeAmplitudeField, type AmplitudeField } from './amplitudeField.js';
