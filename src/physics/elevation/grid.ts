/**
 * Elevation / bathymetry grid model — the data structure the physics
 * pipeline uses whenever it needs a ground elevation or water depth
 * at an arbitrary WGS84 lat/lon. Layer 2 declares the *interface*
 * and a pure bilinear sampler; the actual raster (ETOPO-derived or
 * Cesium-terrain-sampled) is loaded by Layer 4 at app startup and
 * injected as a frozen ElevationGrid instance.
 *
 * Conventions:
 *   - Samples are stored row-major, north-to-south, west-to-east.
 *   - `samples[i * nLon + j]` is elevation at lat[i], lon[j].
 *   - Elevation is in metres, positive above sea level, negative below.
 *   - Land: z > 0; ocean: z < 0; coast = contour z = 0.
 *
 * References:
 *   NOAA ETOPO 2022 (2022). "ETOPO 2022 15 Arc-Second Global Relief
 *    Model." NOAA National Centers for Environmental Information.
 *    DOI: 10.25921/fd45-gt74.
 *   Cesium Terrain Provider API (when sampling client-side).
 */

export interface ElevationGrid {
  /** Minimum latitude (° WGS84, south boundary). */
  readonly minLat: number;
  /** Maximum latitude (° WGS84, north boundary). */
  readonly maxLat: number;
  /** Minimum longitude (° WGS84, west boundary). */
  readonly minLon: number;
  /** Maximum longitude (° WGS84, east boundary). */
  readonly maxLon: number;
  /** Number of samples along the latitude axis. */
  readonly nLat: number;
  /** Number of samples along the longitude axis. */
  readonly nLon: number;
  /** Flat sample array, length nLat × nLon, row-major north-to-south. */
  readonly samples: Float32Array | Int16Array;
}

export interface ElevationSample {
  /** Ground elevation (m, positive = land, negative = ocean). */
  elevation: number;
  /** Local terrain slope magnitude (rad), computed from the grid via
   *  central finite differences. 0 means flat. */
  slope: number;
}

/**
 * Build an ElevationGrid from a regular lat/lon sample array.
 * No interpolation happens at construction — the grid is just the
 * raw raster ready for bilinear sampling.
 *
 * Throws when the sample count disagrees with nLat × nLon to catch
 * swapped-axis bugs at injection time.
 */
export function makeElevationGrid(params: ElevationGrid): ElevationGrid {
  const { minLat, maxLat, minLon, maxLon, nLat, nLon, samples } = params;
  if (!(maxLat > minLat) || !(maxLon > minLon)) {
    throw new Error(
      `ElevationGrid: bounds must be strictly ordered (got lat [${minLat.toString()}, ${maxLat.toString()}], lon [${minLon.toString()}, ${maxLon.toString()}])`
    );
  }
  if (nLat < 2 || nLon < 2) {
    throw new Error(
      `ElevationGrid: need ≥ 2 samples per axis (got ${nLat.toString()} × ${nLon.toString()})`
    );
  }
  if (samples.length !== nLat * nLon) {
    throw new Error(
      `ElevationGrid: sample length ${samples.length.toString()} ≠ nLat · nLon = ${(nLat * nLon).toString()}`
    );
  }
  return { minLat, maxLat, minLon, maxLon, nLat, nLon, samples };
}

/**
 * Bilinear elevation lookup at (lat, lon). Clamps to the grid bounds;
 * callers that need cyclic longitude handling should wrap the lon
 * before calling (we do not assume a global 360° grid by default).
 */
export function sampleElevation(grid: ElevationGrid, lat: number, lon: number): number {
  const latClamp = Math.max(grid.minLat, Math.min(grid.maxLat, lat));
  const lonClamp = Math.max(grid.minLon, Math.min(grid.maxLon, lon));

  // Fractional indices. Row index runs north-to-south: i = 0 at maxLat.
  const di = ((grid.maxLat - latClamp) / (grid.maxLat - grid.minLat)) * (grid.nLat - 1);
  const dj = ((lonClamp - grid.minLon) / (grid.maxLon - grid.minLon)) * (grid.nLon - 1);

  const i0 = Math.floor(di);
  const j0 = Math.floor(dj);
  const i1 = Math.min(i0 + 1, grid.nLat - 1);
  const j1 = Math.min(j0 + 1, grid.nLon - 1);
  const fi = di - i0;
  const fj = dj - j0;

  const s = grid.samples;
  const nLon = grid.nLon;
  const z00 = s[i0 * nLon + j0] ?? 0;
  const z01 = s[i0 * nLon + j1] ?? 0;
  const z10 = s[i1 * nLon + j0] ?? 0;
  const z11 = s[i1 * nLon + j1] ?? 0;

  const top = z00 * (1 - fj) + z01 * fj;
  const bot = z10 * (1 - fj) + z11 * fj;
  return top * (1 - fi) + bot * fi;
}

/** Earth mean radius used for the great-circle spacing between grid
 *  nodes (matches {@link EARTH_RADIUS} in earthScale.ts). */
const EARTH_RADIUS_M = 6_371_000;

/**
 * Topographic slope magnitude at (lat, lon), in radians, via central
 * finite differences on the elevation grid. The slope vector has
 * north and east components — here we return the magnitude, which is
 * the input Wald & Allen 2007 Vs30 proxy expects.
 *
 *   ∂z/∂x_east  ≈ (z(lon + Δ) − z(lon − Δ)) / (2 · Δ_east)
 *   ∂z/∂x_north ≈ (z(lat + Δ) − z(lat − Δ)) / (2 · Δ_north)
 *   slope = atan(√((∂z/∂x_east)² + (∂z/∂x_north)²))
 *
 * Δ is one grid spacing. Δ_east scales with cos(lat) to account for
 * the Earth's curvature; Δ_north is constant at any latitude.
 */
export function sampleSlope(grid: ElevationGrid, lat: number, lon: number): number {
  const dLat = (grid.maxLat - grid.minLat) / (grid.nLat - 1);
  const dLon = (grid.maxLon - grid.minLon) / (grid.nLon - 1);
  const latRad = (lat * Math.PI) / 180;
  const metersPerDegLat = (EARTH_RADIUS_M * Math.PI) / 180;
  const metersPerDegLon = metersPerDegLat * Math.max(Math.cos(latRad), 1e-6);
  const dxEast = dLon * metersPerDegLon;
  const dxNorth = dLat * metersPerDegLat;

  const zEast = sampleElevation(grid, lat, lon + dLon);
  const zWest = sampleElevation(grid, lat, lon - dLon);
  const zNorth = sampleElevation(grid, lat + dLat, lon);
  const zSouth = sampleElevation(grid, lat - dLat, lon);

  const gradEast = (zEast - zWest) / (2 * dxEast);
  const gradNorth = (zNorth - zSouth) / (2 * dxNorth);
  const magnitude = Math.sqrt(gradEast * gradEast + gradNorth * gradNorth);
  return Math.atan(magnitude);
}

/** Convenience: elevation + slope in a single call. */
export function sampleElevationAndSlope(
  grid: ElevationGrid,
  lat: number,
  lon: number
): ElevationSample {
  return {
    elevation: sampleElevation(grid, lat, lon),
    slope: sampleSlope(grid, lat, lon),
  };
}

/**
 * Search a square neighbourhood of the elevation grid for the nearest
 * ocean cell — i.e. one with elevation below {@link OCEAN_FLOOR_M}
 * (default −10 m, the same foreshore floor used by the explosion and
 * earthquake auto-bathymetry branches). Returns the median absolute
 * depth across every ocean cell found inside the radius, or `null`
 * when the click sits on contiguous land.
 *
 * Why median: a single sample close to the shore can land on a
 * surf-cell with a near-zero depth that does not seed a meaningful
 * tsunami. The median of every ocean cell within the search radius
 * reads as "the typical depth of the basin we are coupling into",
 * matches the canonical "shallow-water tsunami over an h-deep ocean"
 * setup of Lamb 1932, and is robust to outliers like a deep trench
 * within the radius.
 *
 * Why this matters: a coastal SURFACE-burst at sea level routinely
 * sits on a cell whose nominal elevation is +0–10 m (a quay, a beach,
 * a reclaimed pier — Hangar 12 in Beirut, the Castle Bravo platform
 * on Bikini Atoll). The explosion physics already triggers the
 * underwater-burst tsunami source whenever `waterDepth > 0` AND the
 * burst is SURFACE; without this helper, the store auto-derivation
 * reads the cell as land, sets no `waterDepth`, and the cascade
 * silently drops the wave that a real-world coastal observer would
 * see — see e.g. the small wave train recorded after Beirut 2020.
 */
export const OCEAN_FLOOR_M = -10;

export function findNearbyOceanDepth(
  grid: ElevationGrid,
  lat: number,
  lon: number,
  searchRadiusM: number
): number | null {
  if (searchRadiusM <= 0 || !Number.isFinite(searchRadiusM)) return null;

  const latRad = (lat * Math.PI) / 180;
  const metersPerDegLat = (EARTH_RADIUS_M * Math.PI) / 180;
  const metersPerDegLon = metersPerDegLat * Math.max(Math.cos(latRad), 1e-6);
  const dLat = searchRadiusM / metersPerDegLat;
  const dLon = searchRadiusM / metersPerDegLon;

  // Walk a fixed 9 × 9 lattice over the search square. The grid is
  // typically zoom-8 Terrarium (≈ 305 m / cell at the equator), so an
  // 81-sample sweep covers ≈ 2.5 km at the tightest packing — enough
  // to detect any neighbouring ocean cell within a 5–10 km radius.
  const N = 9;
  const depths: number[] = [];
  for (let ii = 0; ii < N; ii++) {
    for (let jj = 0; jj < N; jj++) {
      const sLat = lat + ((ii / (N - 1)) * 2 - 1) * dLat;
      const sLon = lon + ((jj / (N - 1)) * 2 - 1) * dLon;
      // Clamp to the grid bounds — out-of-bounds cells return the
      // edge value, which would skew the median if the grid does
      // not cover the entire search square. We rely on the caller
      // having already verified `gridCoversLocation` for the click
      // point itself.
      if (sLat < grid.minLat || sLat > grid.maxLat || sLon < grid.minLon || sLon > grid.maxLon) {
        continue;
      }
      const z = sampleElevation(grid, sLat, sLon);
      if (z < OCEAN_FLOOR_M) depths.push(-z);
    }
  }
  if (depths.length === 0) return null;
  depths.sort((a, b) => a - b);
  const mid = Math.floor(depths.length / 2);
  if (depths.length % 2 === 0) {
    const lo = depths[mid - 1] ?? 0;
    const hi = depths[mid] ?? 0;
    return (lo + hi) / 2;
  }
  return depths[mid] ?? null;
}
