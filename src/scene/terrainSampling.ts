/**
 * On-demand terrain sampler that feeds the ElevationGrid pipeline.
 * Replaces the "ship a decimated ETOPO binary at app boot" strategy
 * with per-click fetch of the public AWS Terrain Tiles dataset
 * (terrarium PNG format, global coverage, CC0 licence, no API key).
 *
 * The tile at zoom 8 covers ≈ 156 km × 156 km near the equator with
 * 256 × 256 pixels — so slope at the event coordinates is computed
 * over a ≈ 0.6 km sample spacing, which is adequate for the
 * Wald & Allen (2007) slope-to-Vs30 proxy (originally calibrated on
 * 30 arc-second ≈ 1 km DEMs).
 *
 * Terrarium encoding: each RGB pixel encodes elevation in metres as
 *     elev = (R · 256 + G + B / 256) − 32 768
 *
 * Reference: https://github.com/tilezen/joerd/blob/master/docs/formats.md
 *
 * This module lives in Layer-4 (UI/scene) and writes into the store
 * via `setElevationGrid`. The physics layer still never touches
 * fetch/PNG APIs; it only sees the parsed {@link ElevationGrid}.
 */

import { makeElevationGrid, type ElevationGrid } from '../physics/elevation/index.js';

const TERRAIN_TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const TILE_ZOOM = 8;
const TILE_PIXELS = 256;
const MAX_CACHE = 16;

/** (lat, lon) → tile (x, y) at a given OSM zoom level. */
function lonLatToTile(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x: ((x % n) + n) % n, y: Math.max(0, Math.min(n - 1, y)) };
}

/** Tile (x, y) → geographic bounds at a given zoom. */
function tileBounds(
  x: number,
  y: number,
  z: number
): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
  const n = 2 ** z;
  const lonLeft = (x / n) * 360 - 180;
  const lonRight = ((x + 1) / n) * 360 - 180;
  const latTop = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  const latBottom = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI;
  return {
    minLat: Math.min(latTop, latBottom),
    maxLat: Math.max(latTop, latBottom),
    minLon: lonLeft,
    maxLon: lonRight,
  };
}

interface CachedTile {
  key: string;
  grid: ElevationGrid;
}

const cache: CachedTile[] = [];

function lookupCache(key: string): ElevationGrid | null {
  const hit = cache.find((t) => t.key === key);
  return hit ? hit.grid : null;
}

function pushCache(key: string, grid: ElevationGrid): void {
  cache.unshift({ key, grid });
  if (cache.length > MAX_CACHE) cache.pop();
}

/**
 * Decode a 256 × 256 terrarium PNG into a Float32Array of elevations.
 * Uses the browser ImageBitmap + OffscreenCanvas path — no need to
 * ship a PNG decoder, the engine already has one.
 */
async function decodeTerrariumTile(url: string): Promise<Float32Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`terrain tile fetch failed: ${response.status.toString()} ${url}`);
  }
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(TILE_PIXELS, TILE_PIXELS);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('terrain tile: 2D context unavailable');
    ctx.drawImage(bitmap, 0, 0);
    const img = ctx.getImageData(0, 0, TILE_PIXELS, TILE_PIXELS);
    const samples = new Float32Array(TILE_PIXELS * TILE_PIXELS);
    for (let i = 0; i < TILE_PIXELS * TILE_PIXELS; i++) {
      const r = img.data[i * 4] ?? 0;
      const g = img.data[i * 4 + 1] ?? 0;
      const b = img.data[i * 4 + 2] ?? 0;
      samples[i] = r * 256 + g + b / 256 - 32_768;
    }
    return samples;
  } finally {
    bitmap.close();
  }
}

/**
 * Fetch + decode the terrarium tile containing (lat, lon) and return
 * an ElevationGrid ready to feed the store's `setElevationGrid`.
 * Results are LRU-cached so repeated clicks in the same region don't
 * refetch; the Wald & Allen Vs30 lookup sees <10 ms latency after
 * the first hit.
 */
export async function fetchTerrainGridForLocation(
  latitude: number,
  longitude: number
): Promise<ElevationGrid> {
  const { x, y } = lonLatToTile(latitude, longitude, TILE_ZOOM);
  const key = `${TILE_ZOOM.toString()}/${x.toString()}/${y.toString()}`;
  const cached = lookupCache(key);
  if (cached !== null) return cached;

  const url = TERRAIN_TILE_URL.replace('{z}', TILE_ZOOM.toString())
    .replace('{x}', x.toString())
    .replace('{y}', y.toString());

  const samples = await decodeTerrariumTile(url);
  const bounds = tileBounds(x, y, TILE_ZOOM);
  // The terrarium PNG is north-to-south row-major, same convention
  // as ElevationGrid — no transpose needed.
  const grid = makeElevationGrid({
    minLat: bounds.minLat,
    maxLat: bounds.maxLat,
    minLon: bounds.minLon,
    maxLon: bounds.maxLon,
    nLat: TILE_PIXELS,
    nLon: TILE_PIXELS,
    samples,
  });
  pushCache(key, grid);
  return grid;
}

/**
 * Phase 11 — global low-resolution bathymetric mosaic.
 *
 * Fetches the 16 zoom-2 terrarium tiles that cover the whole planet
 * and stitches them into a single 1024 × 1024 ElevationGrid spanning
 * (-85°, +85°) latitude and (-180°, +180°) longitude.
 *
 * Resolution: ~40 km/pixel at the equator — coarse compared to the
 * zoom-8 local tiles (~600 m/pixel) but sufficient for trans-oceanic
 * tsunami propagation (typical wavelengths 100–1000 km in deep
 * water; coastline topology resolved at continental scale).
 *
 * Bandwidth: ~16 × 50 KB = 800 KB total, fetched in parallel and
 * decoded once at app startup. Subsequent simulations reuse the
 * cached grid; per-click banwdith is unchanged.
 *
 * The global grid is the engine that finally lets a Chicxulub-class
 * tsunami draw its 5 m / 1 m / 0.3 m iso-amplitude contours over
 * thousands of kilometres without truncating at the local tile
 * boundary. Without this layer the Phase 7a iso-contours were
 * cosmetically correct but truncated at ~75 km from the source.
 */

const GLOBAL_ZOOM = 2;
const GLOBAL_GRID_DIMENSION = 4 * TILE_PIXELS; // 1024 × 1024
let globalMosaicCache: ElevationGrid | null = null;
let globalMosaicInflight: Promise<ElevationGrid> | null = null;

export function getCachedGlobalBathymetricMosaic(): ElevationGrid | null {
  return globalMosaicCache;
}

/**
 * Phase 16 — reproject a Web-Mercator-aligned raster (rows spaced
 * uniformly in Mercator Y) into an equirectangular raster (rows
 * spaced uniformly in geographic latitude). Pure: no I/O, no Cesium,
 * unit-testable from Node.
 *
 * Why this matters: every Terrarium tile arrives in Web Mercator (the
 * standard XYZ tile scheme), so the row index of a stitched mosaic is
 * linear in Mercator Y, NOT in latitude. Downstream pipeline
 * (`computeTsunamiArrivalField`, `sampleElevation`, the Globe.tsx
 * arrow loop) all assume `samples[i * nLon + j]` is at lat = maxLat −
 * i · (maxLat − minLat) / (nLat − 1) — i.e. linear in latitude. On a
 * 170°-tall global mosaic that mismatch puts the FMM source up to 24°
 * off in latitude (a Chicxulub source at lat 44° gets sampled in
 * Greenland), so the FMM bails on land and produces an empty
 * arrival-time field. Reprojecting once at load time fixes the
 * mismatch for every consumer.
 *
 * Implementation: for each output row in lat-linear space, compute
 * the corresponding Mercator-Y fractional row, bilinear-interpolate
 * along the Mercator column. Longitude is linear in both projections,
 * so columns map 1:1.
 */
export function reprojectMercatorToLinearLat(
  mercatorSamples: Float32Array,
  nLat: number,
  nLon: number,
  minLat: number,
  maxLat: number
): Float32Array {
  const out = new Float32Array(nLat * nLon);
  // Web Mercator: y_norm = (1 − asinh(tan(lat·π/180)) / π) / 2,
  // 0 at the top (latMax), 1 at the bottom (latMin). Inverse:
  //   lat = atan(sinh(π · (1 − 2·y_norm))).
  for (let outI = 0; outI < nLat; outI++) {
    const lat = maxLat - (outI / (nLat - 1)) * (maxLat - minLat);
    // Mercator-Y normalised in [0, 1] (0 = north).
    const tanArg = Math.tan((Math.PI / 4) * (1 + lat / 90));
    const yNorm = (Math.PI - Math.log(tanArg)) / (2 * Math.PI);
    const mercFrac = yNorm * (nLat - 1);
    const m0 = Math.max(0, Math.min(nLat - 1, Math.floor(mercFrac)));
    const m1 = Math.max(0, Math.min(nLat - 1, m0 + 1));
    const t = mercFrac - m0;
    for (let j = 0; j < nLon; j++) {
      const v0 = mercatorSamples[m0 * nLon + j] ?? 0;
      const v1 = mercatorSamples[m1 * nLon + j] ?? 0;
      out[outI * nLon + j] = v0 * (1 - t) + v1 * t;
    }
  }
  return out;
}

export async function fetchGlobalBathymetricMosaic(): Promise<ElevationGrid> {
  if (globalMosaicCache !== null) return globalMosaicCache;
  if (globalMosaicInflight !== null) return globalMosaicInflight;

  globalMosaicInflight = (async (): Promise<ElevationGrid> => {
    const n = 2 ** GLOBAL_ZOOM;
    const mercatorSamples = new Float32Array(GLOBAL_GRID_DIMENSION * GLOBAL_GRID_DIMENSION);

    const tilePromises: Promise<{ x: number; y: number; tile: Float32Array }>[] = [];
    for (let ty = 0; ty < n; ty++) {
      for (let tx = 0; tx < n; tx++) {
        const url = TERRAIN_TILE_URL.replace('{z}', GLOBAL_ZOOM.toString())
          .replace('{x}', tx.toString())
          .replace('{y}', ty.toString());
        tilePromises.push(decodeTerrariumTile(url).then((tile) => ({ x: tx, y: ty, tile })));
      }
    }

    const results = await Promise.all(tilePromises);

    // Splice each tile into its quadrant of the Mercator-aligned
    // mosaic. Rows are uniform in Web Mercator Y at this stage.
    for (const { x: tx, y: ty, tile } of results) {
      for (let py = 0; py < TILE_PIXELS; py++) {
        for (let px = 0; px < TILE_PIXELS; px++) {
          const mosaicRow = ty * TILE_PIXELS + py;
          const mosaicCol = tx * TILE_PIXELS + px;
          mercatorSamples[mosaicRow * GLOBAL_GRID_DIMENSION + mosaicCol] =
            tile[py * TILE_PIXELS + px] ?? 0;
        }
      }
    }

    // Reproject to a lat-linear grid so every downstream consumer
    // (FMM, elevation sampler, Globe arrows) can use the standard
    // `lat → row` linear formula. See `reprojectMercatorToLinearLat`
    // for the bug rationale.
    const MERCATOR_LIMIT_LAT = 85.05112878;
    const samples = reprojectMercatorToLinearLat(
      mercatorSamples,
      GLOBAL_GRID_DIMENSION,
      GLOBAL_GRID_DIMENSION,
      -MERCATOR_LIMIT_LAT,
      MERCATOR_LIMIT_LAT
    );

    const grid = makeElevationGrid({
      minLat: -MERCATOR_LIMIT_LAT,
      maxLat: MERCATOR_LIMIT_LAT,
      minLon: -180,
      maxLon: 180,
      nLat: GLOBAL_GRID_DIMENSION,
      nLon: GLOBAL_GRID_DIMENSION,
      samples,
    });
    globalMosaicCache = grid;
    globalMosaicInflight = null;
    return grid;
  })();

  return globalMosaicInflight;
}
