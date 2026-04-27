import type { FastMarchingResult } from './fastMarching.js';

/**
 * Marching-squares contour extractor — produces polyline iso-contours
 * from any 2-D scalar field on a regular lat/lon grid. Used by the
 * tsunami pipeline in two places:
 *
 *   1. Arrival-time isochrones (1/2/4/8 h) on the FMM travel-time
 *      field — the classic NOAA bulletin contours.
 *   2. Iso-amplitude wave fronts (5/1/0.3 m) on the Green-shoaled
 *      amplitude field — the bathymetrically-correct replacement for
 *      the naive 1/r concentric circles, so the contour follows the
 *      coastline instead of cutting across continents.
 *
 * Standard marching squares (Lorensen & Cline 1987, no tie-breaking):
 * each cell has 4 corners classified "inside" or "outside" relative
 * to the threshold → 2⁴ = 16 cases. Cases 0 and 15 produce no
 * segment; the other 14 produce one or two line segments
 * interpolated linearly along the crossing edges.
 *
 * For arrival-time fields, "inside" means t ≤ threshold (the wave
 * has reached this cell by time threshold). For amplitude fields,
 * "inside" means A ≥ threshold (amplitude exceeds the level). The
 * `direction` parameter selects the comparison.
 *
 * NaN cells (land / unreachable) are treated as "outside" for both
 * directions — never reached, never above any positive threshold.
 *
 * Output is a flat array of segments per threshold — callers decide
 * whether to join them into closed polygons or render as short
 * polylines. We do not attempt to join because contours on a real
 * coastline can have disconnected branches (e.g. behind an island).
 */

export interface IsochroneSegment {
  /** Start latitude of the segment (°). */
  lat1: number;
  /** Start longitude of the segment (°). */
  lon1: number;
  /** End latitude of the segment (°). */
  lat2: number;
  /** End longitude of the segment (°). */
  lon2: number;
}

export interface IsochroneBand {
  /** Threshold arrival time (s). */
  timeSeconds: number;
  /** Polyline segments making up the isochrone. */
  segments: IsochroneSegment[];
}

export interface IsochroneInput {
  /** Arrival-time field produced by FMM. */
  field: FastMarchingResult;
  /** Grid geographic bounds (same as the FMM input grid). */
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  /** Desired isochrone thresholds (s). */
  thresholds: number[];
}

/** Interpolate the position where a grid edge crosses the threshold. */
function interpolateCrossing(
  t1: number,
  t2: number,
  threshold: number,
  latA: number,
  lonA: number,
  latB: number,
  lonB: number
): { lat: number; lon: number } {
  // Standard linear interpolation. Guards for t1 === t2 and Infinity
  // (at least one side must be finite for marching squares to emit
  // a segment here).
  if (!Number.isFinite(t1) && !Number.isFinite(t2)) {
    return { lat: (latA + latB) / 2, lon: (lonA + lonB) / 2 };
  }
  if (!Number.isFinite(t1)) return { lat: latB, lon: lonB };
  if (!Number.isFinite(t2)) return { lat: latA, lon: lonA };
  const denom = t2 - t1;
  if (Math.abs(denom) < 1e-12) return { lat: (latA + latB) / 2, lon: (lonA + lonB) / 2 };
  const t = (threshold - t1) / denom;
  const clamped = Math.max(0, Math.min(1, t));
  return {
    lat: latA + clamped * (latB - latA),
    lon: lonA + clamped * (lonB - lonA),
  };
}

/**
 * Generic marching-squares contour extractor on a regular lat/lon
 * grid. The `direction` selector flips the comparison: 'below' for
 * arrival-time isochrones (cell is "inside" when t ≤ threshold),
 * 'above' for iso-amplitude contours (cell is "inside" when A ≥
 * threshold). NaN cells are always classified "outside" so land /
 * unreachable cells never contribute a segment.
 */
export type ContourDirection = 'below' | 'above';

export interface ContourInput {
  values: ArrayLike<number>;
  nLat: number;
  nLon: number;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  thresholds: number[];
  direction: ContourDirection;
}

export interface ContourBand {
  threshold: number;
  segments: IsochroneSegment[];
}

export function extractContours(input: ContourInput): ContourBand[] {
  const { values, nLat, nLon, minLat, maxLat, minLon, maxLon, thresholds, direction } = input;
  const dLat = (maxLat - minLat) / (nLat - 1);
  const dLon = (maxLon - minLon) / (nLon - 1);

  const bands: ContourBand[] = thresholds.map((t) => ({ threshold: t, segments: [] }));

  /** "inside" predicate: returns true when the cell value is on the
   *  threshold side that should produce contour fill. NaN is always
   *  outside so land / unreachable never contribute a segment. */
  const isInside = (value: number, threshold: number): boolean => {
    if (!Number.isFinite(value)) return false;
    return direction === 'below' ? value < threshold : value > threshold;
  };

  for (let i = 0; i < nLat - 1; i++) {
    const latNorth = maxLat - i * dLat;
    const latSouth = latNorth - dLat;
    for (let j = 0; j < nLon - 1; j++) {
      const lonWest = minLon + j * dLon;
      const lonEast = lonWest + dLon;
      const vNW = values[i * nLon + j] ?? Number.NaN;
      const vNE = values[i * nLon + (j + 1)] ?? Number.NaN;
      const vSE = values[(i + 1) * nLon + (j + 1)] ?? Number.NaN;
      const vSW = values[(i + 1) * nLon + j] ?? Number.NaN;

      for (let b = 0; b < thresholds.length; b++) {
        const threshold = thresholds[b];
        const band = bands[b];
        if (threshold === undefined || band === undefined) continue;
        const mask =
          (isInside(vNW, threshold) ? 1 : 0) |
          ((isInside(vNE, threshold) ? 1 : 0) << 1) |
          ((isInside(vSE, threshold) ? 1 : 0) << 2) |
          ((isInside(vSW, threshold) ? 1 : 0) << 3);
        if (mask === 0 || mask === 15) continue;

        const N = interpolateCrossing(vNW, vNE, threshold, latNorth, lonWest, latNorth, lonEast);
        const E = interpolateCrossing(vNE, vSE, threshold, latNorth, lonEast, latSouth, lonEast);
        const S = interpolateCrossing(vSE, vSW, threshold, latSouth, lonEast, latSouth, lonWest);
        const W = interpolateCrossing(vSW, vNW, threshold, latSouth, lonWest, latNorth, lonWest);

        switch (mask) {
          case 1:
          case 14:
            band.segments.push({ lat1: W.lat, lon1: W.lon, lat2: N.lat, lon2: N.lon });
            break;
          case 2:
          case 13:
            band.segments.push({ lat1: N.lat, lon1: N.lon, lat2: E.lat, lon2: E.lon });
            break;
          case 3:
          case 12:
            band.segments.push({ lat1: W.lat, lon1: W.lon, lat2: E.lat, lon2: E.lon });
            break;
          case 4:
          case 11:
            band.segments.push({ lat1: E.lat, lon1: E.lon, lat2: S.lat, lon2: S.lon });
            break;
          case 5:
            band.segments.push({ lat1: W.lat, lon1: W.lon, lat2: N.lat, lon2: N.lon });
            band.segments.push({ lat1: E.lat, lon1: E.lon, lat2: S.lat, lon2: S.lon });
            break;
          case 6:
          case 9:
            band.segments.push({ lat1: N.lat, lon1: N.lon, lat2: S.lat, lon2: S.lon });
            break;
          case 7:
          case 8:
            band.segments.push({ lat1: W.lat, lon1: W.lon, lat2: S.lat, lon2: S.lon });
            break;
          case 10:
            band.segments.push({ lat1: N.lat, lon1: N.lon, lat2: E.lat, lon2: E.lon });
            band.segments.push({ lat1: S.lat, lon1: S.lon, lat2: W.lat, lon2: W.lon });
            break;
          default:
            break;
        }
      }
    }
  }

  return bands;
}

/**
 * Iso-amplitude contours for a tsunami amplitude field. Convenience
 * wrapper around extractContours that targets the wave-front display.
 */
export function extractAmplitudeContours(input: {
  amplitudes: Float32Array;
  nLat: number;
  nLon: number;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  thresholds: number[];
}): ContourBand[] {
  return extractContours({ ...input, values: input.amplitudes, direction: 'above' });
}

/**
 * Extract isochrone polylines at each requested threshold.
 * Returns an array parallel to `thresholds`.
 */
export function extractIsochrones(input: IsochroneInput): IsochroneBand[] {
  const { field, minLat, maxLat, minLon, maxLon, thresholds } = input;
  const { nLat, nLon, arrivalTimes } = field;
  const dLat = (maxLat - minLat) / (nLat - 1);
  const dLon = (maxLon - minLon) / (nLon - 1);

  const bands: IsochroneBand[] = thresholds.map((t) => ({
    timeSeconds: t,
    segments: [],
  }));

  for (let i = 0; i < nLat - 1; i++) {
    // Row i is the NORTH edge of the cell; row i+1 is SOUTH.
    const latNorth = maxLat - i * dLat;
    const latSouth = latNorth - dLat;
    for (let j = 0; j < nLon - 1; j++) {
      const lonWest = minLon + j * dLon;
      const lonEast = lonWest + dLon;
      // Cell corners, clockwise from NW. Out-of-range reads collapse
      // to Infinity so the cell is classified "above threshold" — no
      // segment is emitted, which matches the physical "unreachable".
      const tNW = arrivalTimes[i * nLon + j] ?? Infinity;
      const tNE = arrivalTimes[i * nLon + (j + 1)] ?? Infinity;
      const tSE = arrivalTimes[(i + 1) * nLon + (j + 1)] ?? Infinity;
      const tSW = arrivalTimes[(i + 1) * nLon + j] ?? Infinity;

      for (let b = 0; b < thresholds.length; b++) {
        const threshold = thresholds[b];
        const band = bands[b];
        if (threshold === undefined || band === undefined) continue;
        // Classify corners as above (1) or below (0) the threshold.
        const mask =
          (tNW < threshold ? 1 : 0) |
          ((tNE < threshold ? 1 : 0) << 1) |
          ((tSE < threshold ? 1 : 0) << 2) |
          ((tSW < threshold ? 1 : 0) << 3);
        if (mask === 0 || mask === 15) continue;

        // Edge crossing interpolation. Edges labelled N (NW-NE), E
        // (NE-SE), S (SE-SW), W (SW-NW).
        const N = interpolateCrossing(tNW, tNE, threshold, latNorth, lonWest, latNorth, lonEast);
        const E = interpolateCrossing(tNE, tSE, threshold, latNorth, lonEast, latSouth, lonEast);
        const S = interpolateCrossing(tSE, tSW, threshold, latSouth, lonEast, latSouth, lonWest);
        const W = interpolateCrossing(tSW, tNW, threshold, latSouth, lonWest, latNorth, lonWest);

        switch (mask) {
          case 1: // NW
          case 14:
            band.segments.push({ lat1: W.lat, lon1: W.lon, lat2: N.lat, lon2: N.lon });
            break;
          case 2: // NE
          case 13:
            band.segments.push({ lat1: N.lat, lon1: N.lon, lat2: E.lat, lon2: E.lon });
            break;
          case 3: // NW + NE
          case 12:
            band.segments.push({ lat1: W.lat, lon1: W.lon, lat2: E.lat, lon2: E.lon });
            break;
          case 4: // SE
          case 11:
            band.segments.push({ lat1: E.lat, lon1: E.lon, lat2: S.lat, lon2: S.lon });
            break;
          case 5: {
            // Saddle point: NW + SE (ambiguous). Emit both segments
            // joining NW-N and SE-S, without tie-breaking — fine for
            // educational display.
            band.segments.push({ lat1: W.lat, lon1: W.lon, lat2: N.lat, lon2: N.lon });
            band.segments.push({ lat1: E.lat, lon1: E.lon, lat2: S.lat, lon2: S.lon });
            break;
          }
          case 6: // NE + SE
          case 9:
            band.segments.push({ lat1: N.lat, lon1: N.lon, lat2: S.lat, lon2: S.lon });
            break;
          case 7: // NW + NE + SE
          case 8:
            band.segments.push({ lat1: W.lat, lon1: W.lon, lat2: S.lat, lon2: S.lon });
            break;
          case 10: {
            // Saddle point: NE + SW.
            band.segments.push({ lat1: N.lat, lon1: N.lon, lat2: E.lat, lon2: E.lon });
            band.segments.push({ lat1: S.lat, lon1: S.lon, lat2: W.lat, lon2: W.lon });
            break;
          }
          default:
            break;
        }
      }
    }
  }

  return bands;
}
