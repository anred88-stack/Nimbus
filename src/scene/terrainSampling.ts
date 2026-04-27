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
