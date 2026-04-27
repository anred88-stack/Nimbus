/**
 * Client-side population-exposure lookup, backed by a Cloud-Optimised
 * GeoTIFF (COG) served over HTTPS with CORS enabled.
 *
 * Architecture:
 *   The browser issues HTTP Range requests against a single global
 *   population raster (e.g. WorldPop 1 km Aggregated 2020), letting
 *   geotiff.js fetch only the bytes covering the bounding box of the
 *   damage circle. The pixels inside the geographic radius are summed
 *   and returned as a single "population exposed to ≥ threshold X"
 *   number — the headline figure shown next to the simulation result.
 *
 *   Crucially, we ship NO population data inside the bundle. The
 *   raster URL is configured via the `VITE_POPULATION_COG_URL` env
 *   var at build time; if unset we fall back to the WorldPop 2020
 *   1 km mosaic.
 *
 * IMPORTANT — CORS reality:
 *   `data.worldpop.org` does NOT currently emit
 *   `Access-Control-Allow-Origin` headers, so the fallback URL fails
 *   with a `TypeError("Failed to fetch")` from any browser context.
 *   To make this lookup actually work in production, operators must
 *   set `VITE_POPULATION_COG_URL` to a CORS-enabled mirror — e.g. a
 *   Cloudflare Worker proxy in front of WorldPop, or a re-host on
 *   R2/S3 with the `Access-Control-Allow-Origin: *` header set.
 *
 *   When the lookup fails on its very first call we increment a
 *   `failureCount` for the rest of the session. Subsequent calls
 *   short-circuit to `null` without retrying — that suppresses the
 *   30+ failed-fetch entries the dev console used to print on every
 *   simulation, while keeping the graceful "—" UX in place.
 *
 *   "Exposed" ≠ "casualties". The reported number is the sum of
 *   population-density × cell-area inside the circle. To convert to
 *   casualties we would need a vulnerability function (Glasstone
 *   §12 for blast, Wald & Quitoriano 1999 for shaking) — explicitly
 *   out of scope for this layer to avoid the "neal.fun rainbow
 *   numbers" effect where a precise figure conceals an unsupported
 *   model. Callers must label the figure as exposure.
 *
 * Datasets that work today (CC-BY 4.0 except where noted):
 *   - WorldPop 2020 1 km Aggregated COG (default).
 *     URL: https://data.worldpop.org/GIS/Population/Global_2000_2020/2020/0_Mosaicked/ppp_2020_1km_Aggregated.tif
 *   - JRC GHSL POP 100 m on AWS Open Data (s3://copernicus-gisco-public-data/...).
 *     CORS-enabled per the AWS Open Data policy; verify per-bucket.
 *
 * References:
 *   Tatem, A. J. (2017). "WorldPop, open data for spatial demography."
 *     Scientific Data 4: 170004. DOI: 10.1038/sdata.2017.4.
 *   Schiavina, M., Freire, S., MacManus, K. (2023). "GHS-POP R2023A —
 *     GHS population grid multitemporal (1975–2030)." European
 *     Commission, Joint Research Centre. DOI: 10.2905/2FF68A52-5B5B-4A22-8F40-C41DA8332CFE.
 */

import { fromUrl, type GeoTIFF } from 'geotiff';

/** Default raster — WorldPop 2020 global mosaic at ≈ 1 km resolution.
 *  Operators can override via the VITE_POPULATION_COG_URL env var at
 *  build time. */
const DEFAULT_POPULATION_COG_URL =
  'https://data.worldpop.org/GIS/Population/Global_2000_2020/2020/0_Mosaicked/ppp_2020_1km_Aggregated.tif';

/** Hard cap on the geographic radius the lookup is allowed to query.
 *  Beyond this the raster window grows large enough to overwhelm both
 *  the HTTP Range fetch and the in-browser pixel sum (millions of
 *  cells), and the resulting number stops being meaningful as
 *  "exposed to a single damage threshold" anyway. */
const MAX_QUERY_RADIUS_M = 5_000_000;

/** Mean Earth radius for the great-circle bbox conversion. Matches
 *  src/physics/earthScale.ts. */
const EARTH_RADIUS_M = 6_371_000;

export interface PopulationLookupResult {
  /** Sum of population (people) inside the supplied circle. */
  exposed: number;
  /** Echo of the COG URL queried — useful for the report tooltip. */
  source: string;
  /** Echo of the radius in metres for which this exposure was
   *  computed. */
  radiusM: number;
  /** Bounding box actually fetched (lat/lon degrees). Lets the report
   *  show "queried 1.4° × 0.9°" so the user can sanity-check. */
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number };
}

let cachedTiff: GeoTIFF | null = null;
let cachedUrl: string | null = null;
/** Counts CORS / network failures observed during this session.
 *  When `> 0` the lookup short-circuits to `null` so the console
 *  doesn't fill with failed-fetch entries on every simulation. We
 *  use an integer instead of a boolean so the catch-block guard
 *  `if (failureCount === 0)` survives the no-unnecessary-condition
 *  ESLint rule (a `let lookupDisabled = false` flag would be
 *  flow-narrowed to a `false` literal). Reset by
 *  `_resetPopulationLookupCache()` in tests. */
let failureCount = 0;

function resolveCogUrl(): string {
  // Vite replaces `import.meta.env.VITE_POPULATION_COG_URL` at build
  // time with the static string the operator put in `.env`. Empty or
  // undefined → fall back to the default WorldPop mosaic.
  const fromEnv = import.meta.env.VITE_POPULATION_COG_URL as string | undefined;
  return fromEnv !== undefined && fromEnv.length > 0 ? fromEnv : DEFAULT_POPULATION_COG_URL;
}

async function getTiff(): Promise<GeoTIFF> {
  const url = resolveCogUrl();
  if (cachedTiff !== null && cachedUrl === url) return cachedTiff;
  cachedTiff = await fromUrl(url);
  cachedUrl = url;
  return cachedTiff;
}

/**
 * Convert a geographic-radius circle into a [west, south, east, north]
 * bbox in degrees. Δlat = r / R_E, Δlon = r / (R_E · cos φ); standard
 * spherical-Earth approximation, accurate to ≤ 0.5 % below the polar
 * circles which is well inside the population-data scatter.
 */
function circleBoundingBox(
  lat: number,
  lon: number,
  radiusM: number
): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
  const dLat = ((radiusM / EARTH_RADIUS_M) * 180) / Math.PI;
  const dLon =
    ((radiusM / (EARTH_RADIUS_M * Math.max(Math.cos((lat * Math.PI) / 180), 1e-6))) * 180) /
    Math.PI;
  return {
    minLat: Math.max(-90, lat - dLat),
    maxLat: Math.min(90, lat + dLat),
    minLon: lon - dLon,
    maxLon: lon + dLon,
  };
}

/**
 * Sum the population inside a circle on the loaded COG. Returns null
 * when the lookup cannot proceed (network failure, unconfigured COG,
 * radius out of range). The store / UI consumes that null as
 * "population data unavailable" and renders an em-dash, leaving the
 * scientific simulation untouched.
 */
export async function populationInRadius(
  lat: number,
  lon: number,
  radiusM: number
): Promise<PopulationLookupResult | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(radiusM)) return null;
  if (radiusM <= 0 || radiusM > MAX_QUERY_RADIUS_M) return null;
  // Once a CORS / network failure has been observed in this session,
  // skip the network round-trip entirely. The console-spam this used
  // to produce (one failed-fetch entry per damage ring per simulation)
  // is the headline reason this short-circuit exists.
  if (failureCount > 0) return null;

  const bbox = circleBoundingBox(lat, lon, radiusM);
  // Antimeridian: callers near 180°E/W can produce a bbox that
  // spans the dateline. Splitting into two range fetches is real
  // engineering work; the popular-science envelope here just
  // returns null and lets the UI show a graceful "—" instead.
  if (bbox.minLon < -180 || bbox.maxLon > 180) return null;

  let tiff: GeoTIFF;
  try {
    tiff = await getTiff();
  } catch (err) {
    // Concurrent callers (one population query per damage ring per
    // simulation) all reach this catch in the same microtask tick.
    // The flag-then-log order matters: the first to enter sets the
    // flag, the rest see it set and skip the log. Without this guard
    // the original symptom — dozens of identical console entries on
    // every simulation — comes back.
    const wasFirst = failureCount === 0;
    failureCount += 1;
    if (wasFirst) {
      console.info(
        '[populationLookup] disabled for this session — initial COG fetch failed ' +
          '(likely missing CORS headers on the upstream origin). ' +
          'Set VITE_POPULATION_COG_URL to a CORS-enabled WorldPop / GHSL mirror ' +
          '(e.g. a Cloudflare Worker proxy or an R2/S3 re-host with ' +
          'Access-Control-Allow-Origin: *) to re-enable. Underlying error:',
        err
      );
    }
    return null;
  }

  let sum = 0;
  try {
    const image = await tiff.getImage();
    const [originX, originY] = image.getOrigin();
    const [resX, resY] = image.getResolution();
    const width = image.getWidth();
    const height = image.getHeight();
    if (
      typeof originX !== 'number' ||
      typeof originY !== 'number' ||
      typeof resX !== 'number' ||
      typeof resY !== 'number'
    ) {
      console.warn('[populationLookup] COG geometry missing');
      return null;
    }

    // Pixel-coordinate window for the bbox. resY is typically
    // negative on geographic COGs (north-up convention).
    const x0 = Math.max(0, Math.floor((bbox.minLon - originX) / resX));
    const x1 = Math.min(width, Math.ceil((bbox.maxLon - originX) / resX));
    const y0 = Math.max(0, Math.floor((bbox.maxLat - originY) / resY));
    const y1 = Math.min(height, Math.ceil((bbox.minLat - originY) / resY));
    if (x1 <= x0 || y1 <= y0) return null;

    const rasters = await image.readRasters({
      window: [x0, y0, x1, y1],
      samples: [0],
    });
    const band = Array.isArray(rasters) ? rasters[0] : rasters;
    if (band === undefined) return null;
    const flat = band as ArrayLike<number>;
    const cellW = x1 - x0;
    const cellH = y1 - y0;
    const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 1e-6);
    const cellWidthM = Math.abs(resX) * 111_000 * cosLat;
    const cellHeightM = Math.abs(resY) * 111_000;

    for (let yi = 0; yi < cellH; yi++) {
      const cellLat = bbox.maxLat - (yi + 0.5) * Math.abs(resY);
      for (let xi = 0; xi < cellW; xi++) {
        const cellLon = bbox.minLon + (xi + 0.5) * Math.abs(resX);
        // Crude great-circle approximation (cell distances ≪ Earth radius).
        const dLatM = (cellLat - lat) * 111_000;
        const dLonM = (cellLon - lon) * 111_000 * cosLat;
        const distM = Math.sqrt(dLatM * dLatM + dLonM * dLonM);
        if (distM > radiusM) continue;
        const idx = yi * cellW + xi;
        const v = flat[idx];
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) continue;
        // WorldPop / GHSL deliver per-pixel population counts (not
        // densities), so summing is the right operation. We multiply
        // by 1 here to keep the formula explicit; future support for
        // density rasters can divide by cell area first.
        sum += v;
        void cellWidthM;
        void cellHeightM;
      }
    }
  } catch (err) {
    console.warn('[populationLookup] raster read failed:', err);
    return null;
  }

  return {
    exposed: Math.round(sum),
    source: cachedUrl ?? resolveCogUrl(),
    radiusM,
    bbox,
  };
}

/** Test helper — clears the cached COG handle and re-enables the
 *  lookup so a new URL takes effect on the next call. Not exported
 *  in production usage paths. */
export function _resetPopulationLookupCache(): void {
  cachedTiff = null;
  cachedUrl = null;
  failureCount = 0;
}
