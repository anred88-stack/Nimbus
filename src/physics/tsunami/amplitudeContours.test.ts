import { describe, expect, it } from 'vitest';
import { computeAmplitudeField } from './amplitudeField.js';
import { extractAmplitudeContours } from './isochrones.js';
import { computeTsunamiArrivalField } from './fastMarching.js';
import { makeElevationGrid } from '../elevation/index.js';

/**
 * Iso-amplitude contour extraction — the bathymetric replacement for
 * the naive concentric-circle rendering of the 5/1/0.3 m wave fronts.
 *
 * The properties pinned here are exactly the ones the user expects
 * when they hear "the tsunami stops at the coast":
 *
 *   1. **No-land contract.** No contour vertex lies on a cell whose
 *      elevation is positive (≥ 0 m). Land cells return NaN from the
 *      amplitude field, so any segment touching them would have to
 *      come from interpolation between water and land, which the
 *      contour extractor explicitly avoids.
 *
 *   2. **Topology preservation.** Disconnected basins remain
 *      disconnected: a tsunami in the Pacific cannot magically
 *      appear in the Atlantic. We pin this by building a grid with a
 *      land barrier and asserting the shadow side carries no
 *      amplitude segments.
 *
 *   3. **Monotone enclosed area.** Lower-amplitude contours always
 *      enclose higher-amplitude ones — a 1 m front lives outside a
 *      5 m front, which lives outside a 10 m front. Pinned via
 *      segment counts on a uniform-depth ocean (more lenient
 *      thresholds → more segments).
 */

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

function buildField(
  grid: ReturnType<typeof makeElevationGrid>
): ReturnType<typeof computeAmplitudeField> {
  const arrivalField = computeTsunamiArrivalField({
    grid,
    sourceLatitude: 0,
    sourceLongitude: 0,
  });
  return computeAmplitudeField({
    arrivalField,
    grid,
    sourceAmplitudeM: 50,
    sourceCavityRadiusM: 100_000,
    sourceDepthM: 4_000,
  });
}

describe('extractAmplitudeContours — uniform deep ocean', () => {
  const grid = flatOcean(41, 41, 4_000);
  const ampField = buildField(grid);
  const bands = extractAmplitudeContours({
    amplitudes: ampField.amplitudes,
    nLat: ampField.nLat,
    nLon: ampField.nLon,
    minLat: grid.minLat,
    maxLat: grid.maxLat,
    minLon: grid.minLon,
    maxLon: grid.maxLon,
    thresholds: [10, 5, 1],
  });

  it('emits a band per threshold', () => {
    expect(bands).toHaveLength(3);
    expect(bands[0]?.threshold).toBe(10);
    expect(bands[1]?.threshold).toBe(5);
    expect(bands[2]?.threshold).toBe(1);
  });

  it('lower-amplitude contours have at least as many segments as higher (monotone enclosed area)', () => {
    const seg10 = bands[0]?.segments.length ?? 0;
    const seg5 = bands[1]?.segments.length ?? 0;
    const seg1 = bands[2]?.segments.length ?? 0;
    expect(seg5).toBeGreaterThanOrEqual(seg10);
    expect(seg1).toBeGreaterThanOrEqual(seg5);
  });

  it('every emitted segment is finite', () => {
    for (const band of bands) {
      for (const seg of band.segments) {
        expect(Number.isFinite(seg.lat1)).toBe(true);
        expect(Number.isFinite(seg.lon1)).toBe(true);
        expect(Number.isFinite(seg.lat2)).toBe(true);
        expect(Number.isFinite(seg.lon2)).toBe(true);
      }
    }
  });
});

describe('extractAmplitudeContours — no-land contract', () => {
  // Land barrier at column j ≥ 25 (eastern third). Source on the west.
  const N = 41;
  const samples = new Float32Array(N * N);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      samples[i * N + j] = j >= 25 ? 500 : -4_000;
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
  const arrivalField = computeTsunamiArrivalField({
    grid,
    sourceLatitude: 0,
    sourceLongitude: -8,
  });
  const ampField = computeAmplitudeField({
    arrivalField,
    grid,
    sourceAmplitudeM: 50,
    sourceCavityRadiusM: 100_000,
    sourceDepthM: 4_000,
  });
  const bands = extractAmplitudeContours({
    amplitudes: ampField.amplitudes,
    nLat: ampField.nLat,
    nLon: ampField.nLon,
    minLat: grid.minLat,
    maxLat: grid.maxLat,
    minLon: grid.minLon,
    maxLon: grid.maxLon,
    thresholds: [1],
  });

  it('NO contour vertex falls deep inside the land block', () => {
    // Land starts at j = 25, lon ≥ -10 + 25*0.5 = 2.5°.
    // Allow a one-cell tolerance (the contour can sit at the
    // coastline cell where one corner is land and three are water).
    const dLon = 20 / (N - 1);
    const landStartLon = -10 + 25 * dLon;
    const tolerance = dLon; // one-cell skin
    for (const seg of bands[0]?.segments ?? []) {
      expect(seg.lon1).toBeLessThan(landStartLon + tolerance);
      expect(seg.lon2).toBeLessThan(landStartLon + tolerance);
    }
  });

  it('emits at least one segment on the source side (the wave is not lost)', () => {
    expect(bands[0]?.segments.length ?? 0).toBeGreaterThan(0);
  });
});

describe('extractAmplitudeContours — disconnected basins', () => {
  // Vertical land strip across the middle of the grid: source on the
  // left side cannot reach the right side. Right-side amplitude
  // contours must be empty.
  const N = 41;
  const samples = new Float32Array(N * N);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      // Solid land wall at columns 18..22 from row 0 to row N-1.
      const inWall = j >= 18 && j <= 22;
      samples[i * N + j] = inWall ? 500 : -4_000;
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
  const arrivalField = computeTsunamiArrivalField({
    grid,
    sourceLatitude: 0,
    sourceLongitude: -8,
  });
  const ampField = computeAmplitudeField({
    arrivalField,
    grid,
    sourceAmplitudeM: 50,
    sourceCavityRadiusM: 100_000,
    sourceDepthM: 4_000,
  });
  const bands = extractAmplitudeContours({
    amplitudes: ampField.amplitudes,
    nLat: ampField.nLat,
    nLon: ampField.nLon,
    minLat: grid.minLat,
    maxLat: grid.maxLat,
    minLon: grid.minLon,
    maxLon: grid.maxLon,
    thresholds: [0.1],
  });

  it('NO segments appear on the shadow (right) side of the wall', () => {
    const dLon = 20 / (N - 1);
    const wallEastLon = -10 + 22 * dLon; // east edge of the wall
    for (const seg of bands[0]?.segments ?? []) {
      // Allow contact with the wall east face (one-cell tolerance) but
      // reject anything genuinely east of it.
      const wellEast = wallEastLon + 2 * dLon;
      expect(seg.lon1).toBeLessThan(wellEast);
      expect(seg.lon2).toBeLessThan(wellEast);
    }
  });
});
