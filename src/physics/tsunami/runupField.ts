import { synolakisRunup } from '../events/tsunami/extendedEffects.js';
import type { ElevationGrid } from '../elevation/index.js';
import { m } from '../units.js';
import type { AmplitudeField } from './amplitudeField.js';

/**
 * Coastal run-up field — Synolakis 1987 plane-beach run-up applied
 * cell-by-cell along the coastline.
 *
 * Given the bathymetric amplitude field (Phase 7a/7b) and the
 * elevation grid, this module identifies every "coastal cell" — an
 * ocean cell with at least one land neighbour — and computes the
 * vertical run-up height the wave would reach at that point on the
 * local beach slope.
 *
 *     R_max = 2.831 · H · √(cot β) · (H / d)^(1/4)
 *
 * with H the local amplitude (from the FMM-shoaled field), β the
 * local beach slope (estimated from the four-neighbour elevation
 * gradient), and d the local depth at the coastal cell.
 *
 * Caveats — exactly the ones we declare in docs/methodology
 * Limitations:
 *   - This is run-up *height* (vertical metres on the slope), not
 *     inundation extent. To know "where Genova floods" you need a
 *     non-linear Boussinesq solver and a high-resolution land DEM.
 *   - Synolakis is a 1-D plane-beach approximation; real coasts
 *     refract, focus, and embayments resonate. Per-cell scatter
 *     ±factor-2 is realistic.
 *   - We clamp R to [0, 4·H] to honour the McCowan 1894 wave-
 *     breaking ceiling (same cap used in {@link amplitudeField}).
 *
 * References:
 *   Synolakis, C. E. (1987). "The runup of solitary waves." J. Fluid
 *    Mech. 185, 523–545. DOI: 10.1017/S002211208700329X.
 *   McCowan, J. (1894). "On the highest wave of permanent type."
 *    Phil. Mag. (5) 38, 351–358 — wave-breaking ceiling.
 */

/** Minimum beach-slope angle (rad). Below this — tidal flat scale —
 *  the Synolakis fit returns runup factors of 8-15× which break
 *  even the McCowan cap. The atan(1/2000) floor matches the bound
 *  used in {@link coastalSlope.coastalBeachSlope}. */
const MIN_BEACH_SLOPE_RAD = Math.atan(1 / 2_000);

/** Maximum beach-slope angle (rad) — coastal cliff cutoff. Above
 *  this Synolakis predicts vanishing runup; matches coastalSlope's
 *  bound. */
const MAX_BEACH_SLOPE_RAD = Math.atan(1 / 2);

/** Wave-breaking ceiling — runup never exceeds 4× the incoming
 *  amplitude. Mirror of `SHOALING_CAP` in amplitudeField.ts. */
const RUNUP_CAP_FACTOR = 4;

export interface RunupFieldInput {
  /** FMM-shoaled amplitude field on the same grid as `grid`. */
  amplitudeField: AmplitudeField;
  /** Bathymetric / topographic grid that produced the FMM field. */
  grid: ElevationGrid;
  /** Minimum offshore depth (m) at which to evaluate Synolakis.
   *  Defaults to 50 m — the same floor used by amplitudeField for
   *  the Green's-law cap, kept consistent here so the two modules
   *  pin the breakdown of shallow-water theory at the same depth. */
  minOffshoreDepthM?: number;
}

export interface RunupCell {
  /** Latitude of the coastal cell (°, WGS84). */
  latitude: number;
  /** Longitude of the coastal cell (°, WGS84). */
  longitude: number;
  /** Run-up height at this cell (m, vertical above mean sea level). */
  runupM: number;
}

export interface RunupField {
  /** Coastal cells with their per-cell run-up. Sparse — only cells
   *  adjacent to land contribute, so on a typical Pacific simulation
   *  the array length is O(perimeter) not O(area). */
  cells: RunupCell[];
  /** Maximum run-up across the entire field (m). Useful for legend
   *  normalisation. */
  maxRunupM: number;
}

/**
 * Estimate the local beach slope at coastal cell (i, j). Uses the
 * elevation gradient between the coastal cell and its adjacent land
 * neighbour; falls back to the textbook 1:100 plane-beach default
 * when the configuration is degenerate (no clear inland direction).
 */
function localSlope(grid: ElevationGrid, i: number, j: number): number {
  const { samples, nLat, nLon } = grid;
  const seaElev = samples[i * nLon + j] ?? 0;
  // Per-row east-west spacing in metres (varies with latitude).
  const dLatDeg = (grid.maxLat - grid.minLat) / (nLat - 1);
  const lat = grid.maxLat - i * dLatDeg;
  const metersPerDegLat = 111_194.93; // 6 371 000 · π / 180
  const metersPerDegLon = metersPerDegLat * Math.max(Math.cos((lat * Math.PI) / 180), 1e-6);
  const dLonDeg = (grid.maxLon - grid.minLon) / (nLon - 1);
  const dxLat = dLatDeg * metersPerDegLat;
  const dxLon = dLonDeg * metersPerDegLon;

  const probes: { di: number; dj: number; dist: number }[] = [
    { di: -1, dj: 0, dist: dxLat },
    { di: 1, dj: 0, dist: dxLat },
    { di: 0, dj: -1, dist: dxLon },
    { di: 0, dj: 1, dist: dxLon },
  ];
  let bestRise = -Infinity;
  let bestDist = 1;
  for (const p of probes) {
    const ni = i + p.di;
    const nj = j + p.dj;
    if (ni < 0 || ni >= nLat || nj < 0 || nj >= nLon) continue;
    const elev = samples[ni * nLon + nj] ?? 0;
    if (elev <= 0) continue; // skip water neighbours
    const rise = elev - seaElev;
    if (rise > bestRise) {
      bestRise = rise;
      bestDist = p.dist;
    }
  }
  if (!Number.isFinite(bestRise) || bestRise <= 0) {
    return Math.atan(1 / 100); // textbook default
  }
  const raw = Math.atan(bestRise / bestDist);
  return Math.max(MIN_BEACH_SLOPE_RAD, Math.min(MAX_BEACH_SLOPE_RAD, raw));
}

/**
 * Detect whether (i, j) is a coastal cell — ocean (elevation < 0)
 * with at least one land (elevation > 0) neighbour.
 */
function isCoastal(grid: ElevationGrid, i: number, j: number): boolean {
  const { samples, nLat, nLon } = grid;
  const elev = samples[i * nLon + j] ?? 0;
  if (elev >= 0) return false; // not ocean
  for (const [di, dj] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const) {
    const ni = i + di;
    const nj = j + dj;
    if (ni < 0 || ni >= nLat || nj < 0 || nj >= nLon) continue;
    const ne = samples[ni * nLon + nj] ?? 0;
    if (ne > 0) return true;
  }
  return false;
}

export function computeRunupField(input: RunupFieldInput): RunupField {
  const { amplitudeField, grid } = input;
  const { nLat, nLon, amplitudes } = amplitudeField;
  const minDepth = input.minOffshoreDepthM ?? 50;
  const dLatDeg = (grid.maxLat - grid.minLat) / (nLat - 1);
  const dLonDeg = (grid.maxLon - grid.minLon) / (nLon - 1);

  const cells: RunupCell[] = [];
  let maxRunupM = 0;

  for (let i = 0; i < nLat; i++) {
    const lat = grid.maxLat - i * dLatDeg;
    for (let j = 0; j < nLon; j++) {
      if (!isCoastal(grid, i, j)) continue;
      const idx = i * nLon + j;
      const A = amplitudes[idx];
      if (A === undefined || !Number.isFinite(A) || A <= 0) continue;
      const elev = grid.samples[idx] ?? 0;
      const depth = Math.max(-elev, minDepth);
      const beta = localSlope(grid, i, j);
      const R = synolakisRunup(m(A), beta, m(depth)) as number;
      const Rcapped = Math.min(R, RUNUP_CAP_FACTOR * A);
      if (!Number.isFinite(Rcapped) || Rcapped <= 0) continue;
      const lon = grid.minLon + j * dLonDeg;
      cells.push({ latitude: lat, longitude: lon, runupM: Rcapped });
      if (Rcapped > maxRunupM) maxRunupM = Rcapped;
    }
  }

  return { cells, maxRunupM };
}
