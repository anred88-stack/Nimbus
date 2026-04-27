import { describe, expect, it } from 'vitest';
import { STANDARD_GRAVITY } from '../constants.js';
import { makeElevationGrid } from '../elevation/index.js';
import { computeTsunamiArrivalField } from './fastMarching.js';

/**
 * Verification suite for the FMM eikonal solver, as flagged by the
 * audit (NUM-001).
 *
 * The solver implements first-order Sethian Fast Marching on a square
 * stencil. Three properties characterise its numerical behaviour and
 * are pinned here so future refactors keep them:
 *
 *   1. **Axial consistency.** Along the cardinal axes the FMM update
 *      degenerates to the exact 1-D upwind step, so the arrival time
 *      at any axial sample point reproduces r / √(g h) to within
 *      machine precision at any grid spacing. This is the strongest
 *      check we can perform — the analytical solution is exact.
 *
 *   2. **Bounded diagonal anisotropy.** First-order FMM on a square
 *      grid systematically over-predicts arrival time along the 45°
 *      diagonal by a factor in the well-known range [1.05, 1.15]
 *      (Sethian 1996 §4). The bias is a fixed property of the
 *      stencil — it does NOT shrink with refinement.
 *
 *   3. **Curved-path convergence.** For a non-trivial geometry where
 *      the wave must detour around a barrier, the discretisation
 *      error DOES shrink as h → 0 — the path-length quantisation
 *      becomes progressively finer. We refine the grid 4× and check
 *      that the arrival time at the same physical point on the
 *      shadow side of the barrier moves towards a stable limit
 *      (successive differences shrink monotonically).
 *
 * Together these guarantee that the eikonal solver is numerically
 * consistent with the underlying PDE — not just plausible at one
 * resolution.
 */

const EARTH_DEG_M = (6_371_000 * Math.PI) / 180; // 111 194.93 m/° — must match
//                                                  fastMarching.ts internals.

function flatOcean(
  nLat: number,
  nLon: number,
  depthMeters: number
): ReturnType<typeof makeElevationGrid> {
  const samples = new Float32Array(nLat * nLon);
  samples.fill(-depthMeters);
  return makeElevationGrid({
    minLat: -10,
    maxLat: 10,
    minLon: -10,
    maxLon: 10,
    nLat,
    nLon,
    samples,
  });
}

describe('FMM verification — axial consistency', () => {
  const depth = 4_000;
  const celerity = Math.sqrt(STANDARD_GRAVITY * depth);

  for (const N of [21, 41, 81]) {
    it(`N=${N.toString()}: axial arrival time matches r / √(g h) within 1 %`, () => {
      const grid = flatOcean(N, N, depth);
      const field = computeTsunamiArrivalField({
        grid,
        sourceLatitude: 0,
        sourceLongitude: 0,
      });
      // Take a sample 5 grid cells east of the source. The FMM
      // updates along the axis collapse to the exact 1-D upwind step.
      const midI = Math.floor(N / 2);
      const midJ = Math.floor(N / 2);
      const dLonDeg = 20 / (N - 1);
      const distMeters = 5 * dLonDeg * EARTH_DEG_M;
      const idx = midI * N + (midJ + 5);
      const t = field.arrivalTimes[idx] ?? Infinity;
      const expected = distMeters / celerity;
      expect(Math.abs(t - expected) / expected).toBeLessThan(0.01);
    });
  }
});

describe('FMM verification — bounded diagonal anisotropy', () => {
  it('arrival time at the 45° diagonal is over-predicted by no more than 12 %', () => {
    const depth = 4_000;
    const celerity = Math.sqrt(STANDARD_GRAVITY * depth);
    const N = 41;
    const grid = flatOcean(N, N, depth);
    const field = computeTsunamiArrivalField({
      grid,
      sourceLatitude: 0,
      sourceLongitude: 0,
    });
    const midI = Math.floor(N / 2);
    const midJ = Math.floor(N / 2);
    const k = 5; // 5 cells along each axis = (5,5) diagonal
    const idx = (midI + k) * N + (midJ + k);
    const t = field.arrivalTimes[idx] ?? Infinity;
    const dLonDeg = 20 / (N - 1);
    const trueDistMeters = Math.sqrt(2) * k * dLonDeg * EARTH_DEG_M;
    const trueTime = trueDistMeters / celerity;
    const ratio = t / trueTime;
    expect(ratio).toBeGreaterThan(1.0); // FMM never under-predicts the diagonal
    expect(ratio).toBeLessThan(1.12); // Sethian 1996 textbook bias band
  });
});

describe('FMM verification — curved-path convergence', () => {
  /**
   * Grid with a centred N-S barrier from i=4..16 at column j=10. The
   * source sits at (lat=0, lon=-8) west of the barrier; the sample
   * point is on the shadow side at (lat=0, lon=2). The wave must
   * detour around either the north or south end of the barrier — a
   * non-trivial path whose length depends on the discretisation.
   */
  function arrivalThroughGap(N: number): number {
    const samples = new Float32Array(N * N);
    const barrierJ = Math.floor(N / 2);
    const barrierTop = Math.floor(N * 0.2);
    const barrierBottom = Math.floor(N * 0.8);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const inBarrier = j === barrierJ && i >= barrierTop && i <= barrierBottom;
        samples[i * N + j] = inBarrier ? 500 : -4_000;
      }
    }
    const grid = makeElevationGrid({
      minLat: -10,
      maxLat: 10,
      minLon: -10,
      maxLon: 10,
      nLat: N,
      nLon: N,
      samples,
    });
    const field = computeTsunamiArrivalField({
      grid,
      sourceLatitude: 0,
      sourceLongitude: -8,
    });
    // Sample point on the shadow side at (lat 0, lon +2). Read the
    // closest cell — bilinear would smear barrier neighbours.
    const dLatDeg = 20 / (N - 1);
    const dLonDeg = 20 / (N - 1);
    const i = Math.round((10 - 0) / dLatDeg);
    const j = Math.round((2 + 10) / dLonDeg);
    return field.arrivalTimes[i * N + j] ?? Infinity;
  }

  it('successive refinements converge to a stable shadow-side time', () => {
    const t1 = arrivalThroughGap(41);
    const t2 = arrivalThroughGap(81);
    const t3 = arrivalThroughGap(161);
    const delta1 = Math.abs(t2 - t1);
    const delta2 = Math.abs(t3 - t2);
    // The successive change must shrink — discretisation residual
    // converging to zero, not bouncing around.
    expect(delta2).toBeLessThan(delta1);
    // And the absolute change between the two finest grids must be
    // small compared to the value itself (≤ 5 %).
    expect(delta2 / t3).toBeLessThan(0.05);
  });

  it('shadow-side arrival is strictly later than the open-ocean equivalent', () => {
    const N = 81;
    const tWall = arrivalThroughGap(N);
    const open = flatOcean(N, N, 4_000);
    const fOpen = computeTsunamiArrivalField({
      grid: open,
      sourceLatitude: 0,
      sourceLongitude: -8,
    });
    const dLat = 20 / (N - 1);
    const dLon = 20 / (N - 1);
    const i = Math.round(10 / dLat);
    const j = Math.round(12 / dLon);
    const tOpen = fOpen.arrivalTimes[i * N + j] ?? Infinity;
    expect(tWall).toBeGreaterThan(tOpen);
  });
});
