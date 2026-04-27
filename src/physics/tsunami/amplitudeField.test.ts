import { describe, expect, it } from 'vitest';
import { makeElevationGrid } from '../elevation/grid.js';
import { computeAmplitudeField } from './amplitudeField.js';
import { computeTsunamiArrivalField } from './fastMarching.js';

/**
 * Build a flat-bottom open-ocean test grid centred on the equator.
 * Constant depth means Green's law contributes a factor of 1 and we
 * isolate the geometric-spreading 1/√r decay for clean assertions.
 */
function flatOceanGrid(depthM: number): ReturnType<typeof makeElevationGrid> {
  const N = 41;
  const samples = new Float32Array(N * N);
  samples.fill(-depthM);
  return makeElevationGrid({
    minLat: -2,
    maxLat: 2,
    minLon: -2,
    maxLon: 2,
    nLat: N,
    nLon: N,
    samples,
  });
}

describe('computeAmplitudeField', () => {
  it('saturates at the source amplitude inside the cavity radius', () => {
    const grid = flatOceanGrid(4_000);
    const arrival = computeTsunamiArrivalField({
      grid,
      sourceLatitude: 0,
      sourceLongitude: 0,
    });
    const field = computeAmplitudeField({
      arrivalField: arrival,
      grid,
      sourceAmplitudeM: 30,
      sourceCavityRadiusM: 50_000,
      sourceDepthM: 4_000,
    });
    // The source cell's amplitude should be very close to the source
    // amplitude — c_avg·T ≪ R_cavity so spread = √1 = 1, and on a
    // constant-depth grid Green's shoaling is exactly 1.
    const sourceIdx = Math.floor(field.nLat / 2) * field.nLon + Math.floor(field.nLon / 2);
    const A = field.amplitudes[sourceIdx];
    expect(A).toBeGreaterThan(29);
    expect(A).toBeLessThan(31);
  });

  it('decays as 1/√r far from the source on a flat ocean', () => {
    // Use a wider 200 km grid so the decay envelope spans well beyond
    // the cavity radius.
    const N = 81;
    const span = 4; // degrees on each side
    const samples = new Float32Array(N * N);
    samples.fill(-4_000);
    const grid = makeElevationGrid({
      minLat: -span,
      maxLat: span,
      minLon: -span,
      maxLon: span,
      nLat: N,
      nLon: N,
      samples,
    });
    const arrival = computeTsunamiArrivalField({
      grid,
      sourceLatitude: 0,
      sourceLongitude: 0,
    });
    const field = computeAmplitudeField({
      arrivalField: arrival,
      grid,
      sourceAmplitudeM: 30,
      sourceCavityRadiusM: 10_000,
      sourceDepthM: 4_000,
    });
    // Sample the eastern equator at +1° (~111 km) and +2° (~222 km).
    const midRow = Math.floor(field.nLat / 2);
    const midCol = Math.floor(field.nLon / 2);
    const colsPerDeg = (field.nLon - 1) / (2 * span);
    const idx111 = midRow * field.nLon + midCol + Math.round(colsPerDeg);
    const idx222 = midRow * field.nLon + midCol + Math.round(2 * colsPerDeg);
    const A111 = field.amplitudes[idx111];
    const A222 = field.amplitudes[idx222];
    if (A111 === undefined || A222 === undefined) {
      expect.fail('expected amplitudes at sampled cells');
      return;
    }
    expect(Number.isFinite(A111)).toBe(true);
    expect(Number.isFinite(A222)).toBe(true);
    // Ratio A111/A222 ≈ √(222/111) = √2 ≈ 1.41 (within ±20 % for the
    // FMM grid discretisation noise).
    const ratio = A111 / A222;
    expect(ratio).toBeGreaterThan(1.15);
    expect(ratio).toBeLessThan(1.7);
  });

  it("Green's law amplifies the wave when it shoals onto shallow water", () => {
    // Half-and-half basin: 4 000 m to the west of the source, 100 m
    // to the east. Equal great-circle distance, so the only difference
    // between east and west cells is the shoaling factor.
    const N = 41;
    const samples = new Float32Array(N * N);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        // West (j < N/2) is deep; east is shallow.
        samples[i * N + j] = j < N / 2 ? -4_000 : -100;
      }
    }
    const grid = makeElevationGrid({
      minLat: -2,
      maxLat: 2,
      minLon: -2,
      maxLon: 2,
      nLat: N,
      nLon: N,
      samples,
    });
    const arrival = computeTsunamiArrivalField({
      grid,
      sourceLatitude: 0,
      sourceLongitude: 0,
    });
    const field = computeAmplitudeField({
      arrivalField: arrival,
      grid,
      sourceAmplitudeM: 5,
      sourceCavityRadiusM: 5_000,
      sourceDepthM: 4_000,
    });
    // Sample symmetric cells: same row, +1°/-1° from source.
    const midRow = Math.floor(N / 2);
    const cellsPerDeg = (N - 1) / 4;
    const eastIdx = midRow * N + (midRow + Math.round(cellsPerDeg));
    const westIdx = midRow * N + (midRow - Math.round(cellsPerDeg));
    const eastA = field.amplitudes[eastIdx];
    const westA = field.amplitudes[westIdx];
    if (eastA === undefined || westA === undefined) {
      expect.fail('expected amplitudes at sampled cells');
      return;
    }
    // Green's law: (4 000 / 100)^(1/4) = √(20) ≈ 2.51× amplitude
    // gain. Geometric spread offsets by (c_west_avg / c_east_avg)
    // ≈ √(2 000 / 1 050) ≈ 1.38 → net east/west ≈ 2.51 / 1.38 ≈ 1.8.
    expect(eastA).toBeGreaterThan(westA);
  });
});
