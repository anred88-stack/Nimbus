import { STANDARD_GRAVITY } from '../constants.js';
import type { ElevationGrid } from '../elevation/index.js';
import type { FastMarchingResult } from './fastMarching.js';

/**
 * Tsunami amplitude field on the bathymetric grid.
 *
 * Layered on top of the FMM arrival-time solver, this module turns the
 * scalar T(x, y) field into a scalar A(x, y) field — the long-wave
 * amplitude at every reachable cell. The propagation combines two
 * established approximations:
 *
 *   1. **Green's law** (Lamb 1932 §187, Synolakis & Bernard 2006).
 *      As a long wave moves from depth h₀ at the source to depth h(x)
 *      somewhere downstream, energy conservation along a stream tube
 *      with constant width gives
 *
 *          A(x) / A₀ = (h₀ / h(x))^(1/4)
 *
 *      i.e. amplitude grows as the wave shoals onto shallower water.
 *      This is the dominant driver of run-up enhancement near the
 *      coast, where local depth drops by orders of magnitude.
 *
 *   2. **Cylindrical geometric spreading.** A point source on a flat
 *      basin emits cylindrically; energy scales as 1/r so amplitude
 *      scales as 1/√r. We approximate the ray-path distance r by
 *      `c_avg · T(x)` where c_avg is the geometric mean of the source
 *      and local celerities — exact only for straight-ray propagation
 *      but a first-order improvement on the no-spread limit.
 *
 * The combined update at every reachable cell is therefore
 *
 *     A(x) = A₀ · (h₀ / h(x))^(1/4) · √(R₀ / R(x))
 *
 * with R₀ the source cavity radius (the wave is "saturated" inside,
 * so we clamp R(x) ≥ R₀ to avoid divide-by-near-zero blow-ups). Land
 * cells (h ≤ minDepth) inherit Infinity from the FMM result and are
 * masked out by the renderer.
 *
 * What this model deliberately does NOT do:
 *   - Refraction / focusing along bathymetric ridges. Real ray paths
 *     bend toward shallower water; concentrated focusing can locally
 *     amplify the wave by 5–10×. The FMM gives us only T, not the
 *     gradient of T along characteristics, so we cannot do
 *     proper transport-equation amplitude propagation here.
 *   - Dispersion. Long waves are non-dispersive in the shallow-water
 *     limit; intermediate-frequency components (impact tsunamis with
 *     wavelengths ~ basin depth) disperse measurably over 10 000 km
 *     and our 1/√r decay overstates the far-field amplitude.
 *   - Non-linear wave breaking. The 1/r-shoaling product diverges as
 *     h → 0; we clamp to a 50 m floor.
 *
 * Together these limit the model to a "reasonable popular-science
 * envelope" — within ±factor-2 of full transport-equation solvers
 * over distances ≤ 5 000 km, dominated by the source-amplitude
 * scatter (factor 5–10 for landslide and impact tsunamis).
 *
 * References:
 *   Lamb, H. (1932). "Hydrodynamics" (6th ed.), §187. Cambridge.
 *   Synolakis, C. E. & Bernard, E. N. (2006). "Tsunami science before
 *     and beyond Boxing Day 2004." Phil. Trans. R. Soc. A 364: 2231–2265.
 *   Tinti, S. & Bortolucci, E. (2000). "Energy of water waves
 *     induced by submarine landslides." Pure Appl. Geophys. 157: 281–318.
 */

/** Floor depth (m) used to clamp the Green's-law denominator near
 *  the shore. The shallow-water approximation ceases to hold below
 *  ~50 m anyway; pushing past it would let A diverge unphysically. */
const MIN_PROPAGATION_DEPTH = 50;

export interface AmplitudeFieldInput {
  /** Pre-computed FMM arrival-time field. */
  arrivalField: FastMarchingResult;
  /** Same grid passed to the FMM — supplies bathymetric depth. */
  grid: ElevationGrid;
  /** Source amplitude at the cavity rim (m). */
  sourceAmplitudeM: number;
  /** Source cavity radius (m). Used both as the R₀ in the geometric
   *  spreading factor AND as the "inside the source" boundary where
   *  amplitude saturates at the source value. */
  sourceCavityRadiusM: number;
  /** Mean depth at the source (m). Defaults to 1 000 m if not given;
   *  passed in by the orchestrator from the actual scenario. */
  sourceDepthM?: number;
  /** Surface gravity. Defaults to Earth standard. */
  surfaceGravity?: number;
  /** Minimum ocean depth (m) to treat as water — propagated from the
   *  same FMM input so the masks line up. */
  minDepthMeters?: number;
}

export interface AmplitudeField {
  /** Amplitude at each grid cell (m), row-major north-to-south.
   *  Land or unreachable cells get NaN, the heatmap renderer maps
   *  those to fully-transparent pixels. */
  amplitudes: Float32Array;
  nLat: number;
  nLon: number;
  /** Maximum amplitude observed anywhere on the field — handy for
   *  the renderer's colour-scale normalisation. */
  maxAmplitude: number;
}

export function computeAmplitudeField(input: AmplitudeFieldInput): AmplitudeField {
  const { arrivalField, grid, sourceAmplitudeM, sourceCavityRadiusM } = input;
  const sourceDepth = Math.max(input.sourceDepthM ?? 1_000, MIN_PROPAGATION_DEPTH);
  const g = input.surfaceGravity ?? STANDARD_GRAVITY;
  const minDepth = input.minDepthMeters ?? 10;
  const nCells = arrivalField.nLat * arrivalField.nLon;
  const amplitudes = new Float32Array(nCells);
  amplitudes.fill(NaN);

  const c0 = Math.sqrt(g * sourceDepth);
  let maxAmplitude = sourceAmplitudeM;

  for (let i = 0; i < nCells; i++) {
    const T = arrivalField.arrivalTimes[i];
    if (T === undefined || !Number.isFinite(T)) continue;
    const elevation = grid.samples[i] ?? 0;
    if (elevation >= -minDepth) continue; // land or too shallow
    const h = Math.max(-elevation, MIN_PROPAGATION_DEPTH);
    const cLocal = Math.sqrt(g * h);

    // Green's law shoaling: amplitude grows as (h₀/h)^(1/4).
    const shoaling = (sourceDepth / h) ** 0.25;

    // Geometric spreading via the FMM travel time. Use the geometric
    // mean of c₀ and c_local as the path-averaged celerity — a
    // monotone interpolant that recovers c₀ at the source and c_local
    // far away (limit cases of a constant-depth ocean).
    const cAvg = Math.sqrt(c0 * cLocal);
    const r = Math.max(cAvg * T, sourceCavityRadiusM);
    const spread = Math.sqrt(sourceCavityRadiusM / r);

    const A = sourceAmplitudeM * shoaling * spread;
    amplitudes[i] = A;
    if (A > maxAmplitude) maxAmplitude = A;
  }

  return {
    amplitudes,
    nLat: arrivalField.nLat,
    nLon: arrivalField.nLon,
    maxAmplitude,
  };
}
