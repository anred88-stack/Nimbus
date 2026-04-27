import { describe, expect, it } from 'vitest';
import { computeBathymetricTsunami } from './bathymetricTsunami.js';
import { extractAmplitudeContours } from './isochrones.js';
import { makeElevationGrid } from '../elevation/index.js';

/**
 * Phase 11 — hierarchical multi-resolution bathymetric grid.
 *
 * The orchestrator now accepts an optional `globalGrid` alongside the
 * high-res `grid`. When both are supplied the result carries a `global`
 * layer with its own FMM + amplitude + isochrones, computed against the
 * low-resolution mosaic. This is what lets a Chicxulub-class tsunami
 * draw iso-amplitude contours all the way to the antipodes instead of
 * truncating at the local tile bbox.
 *
 * Tests below pin:
 *   1. Backward compatibility: passing only `grid` works unchanged.
 *   2. Dual-grid path: `result.global` is populated, with its own FMM
 *      field whose dimensions match the global grid (not the local one).
 *   3. Trans-oceanic reach: amplitude > 0 at distances FAR beyond the
 *      local tile bbox when the global grid is provided.
 *   4. No-land contract holds on the global grid (continents block the
 *      wave just like on the local one).
 */

const flatOcean = (
  N: number,
  span: number,
  depth: number
): ReturnType<typeof makeElevationGrid> => {
  const samples = new Float32Array(N * N);
  samples.fill(-depth);
  return makeElevationGrid({
    minLat: -span,
    maxLat: span,
    minLon: -span,
    maxLon: span,
    nLat: N,
    nLon: N,
    samples,
  });
};

describe('computeBathymetricTsunami — Phase 11 hierarchical grid', () => {
  it('emits no global layer when only the local grid is supplied (back-compat)', () => {
    const local = flatOcean(41, 1, 4_000); // ~110 × 110 km
    const r = computeBathymetricTsunami({
      grid: local,
      sourceLatitude: 0,
      sourceLongitude: 0,
      sourceAmplitudeM: 50,
      sourceCavityRadiusM: 100_000,
      sourceDepthM: 4_000,
    });
    expect(r.global).toBeUndefined();
    expect(r.amplitude).toBeDefined();
  });

  it('emits a global layer with its own FMM dimensions when both grids are supplied', () => {
    const local = flatOcean(41, 1, 4_000);
    const global = flatOcean(81, 50, 4_000); // ~5500 × 5500 km
    const r = computeBathymetricTsunami({
      grid: local,
      globalGrid: global,
      sourceLatitude: 0,
      sourceLongitude: 0,
      sourceAmplitudeM: 50,
      sourceCavityRadiusM: 100_000,
      sourceDepthM: 4_000,
    });
    expect(r.global).toBeDefined();
    if (r.global !== undefined) {
      expect(r.global.field.nLat).toBe(81);
      expect(r.global.field.nLon).toBe(81);
      // Local field still uses the local grid's dimensions.
      expect(r.field.nLat).toBe(41);
      expect(r.field.nLon).toBe(41);
    }
  });

  it('global amplitude reaches cells far outside the local tile bbox', () => {
    const local = flatOcean(41, 1, 4_000);
    const global = flatOcean(81, 50, 4_000);
    const r = computeBathymetricTsunami({
      grid: local,
      globalGrid: global,
      sourceLatitude: 0,
      sourceLongitude: 0,
      sourceAmplitudeM: 100,
      sourceCavityRadiusM: 100_000,
      sourceDepthM: 4_000,
    });
    expect(r.global?.amplitude).toBeDefined();
    if (r.global?.amplitude === undefined) return;

    // Sample a cell at lat 30°, lon 30° — well outside the local
    // ±1° tile but inside the ±50° global mosaic.
    const farLat = 30;
    const farLon = 30;
    const dLat = 100 / (81 - 1); // 100°/80 = 1.25°/cell
    const dLon = 100 / (81 - 1);
    const i = Math.round((50 - farLat) / dLat);
    const j = Math.round((farLon + 50) / dLon);
    const ampFar = r.global.amplitude.amplitudes[i * 81 + j];
    expect(Number.isFinite(ampFar)).toBe(true);
    expect(ampFar).toBeGreaterThan(0.01);
  });

  it('emits global iso-amplitude contour segments far beyond the local tile', () => {
    const local = flatOcean(41, 1, 4_000);
    const global = flatOcean(81, 50, 4_000);
    const r = computeBathymetricTsunami({
      grid: local,
      globalGrid: global,
      sourceLatitude: 0,
      sourceLongitude: 0,
      sourceAmplitudeM: 100,
      sourceCavityRadiusM: 100_000,
      sourceDepthM: 4_000,
    });
    if (r.global?.amplitude === undefined) {
      expect.fail('expected global amplitude field');
      return;
    }
    const bands = extractAmplitudeContours({
      amplitudes: r.global.amplitude.amplitudes,
      nLat: r.global.amplitude.nLat,
      nLon: r.global.amplitude.nLon,
      minLat: -50,
      maxLat: 50,
      minLon: -50,
      maxLon: 50,
      // 20 m amplitude lives at ~2 500 km from source on a flat 4 km
      // basin (1/√r decay from A₀=100m, R_C=100km). Threshold chosen
      // so the contour falls comfortably inside the global mosaic
      // bbox AND outside the ±1° local tile.
      thresholds: [20],
    });
    const segs = bands[0]?.segments ?? [];
    expect(segs.length).toBeGreaterThan(0);
    // At least one segment must lie outside the local tile (|lat| or
    // |lon| > 1°) — that is the whole point of the hierarchical layer.
    const hasFarSegment = segs.some(
      (s) =>
        Math.abs(s.lat1) > 1 || Math.abs(s.lon1) > 1 || Math.abs(s.lat2) > 1 || Math.abs(s.lon2) > 1
    );
    expect(hasFarSegment).toBe(true);
  });

  it('global layer respects the no-land contract (a continental barrier blocks propagation)', () => {
    const local = flatOcean(41, 1, 4_000);
    const N = 81;
    const samples = new Float32Array(N * N);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        // Vertical land wall at j = 60 (east side), source on the west
        samples[i * N + j] = j >= 60 ? 1_000 : -4_000;
      }
    }
    const global = makeElevationGrid({
      minLat: -50,
      maxLat: 50,
      minLon: -50,
      maxLon: 50,
      nLat: N,
      nLon: N,
      samples,
    });
    const r = computeBathymetricTsunami({
      grid: local,
      globalGrid: global,
      sourceLatitude: 0,
      sourceLongitude: -25,
      sourceAmplitudeM: 100,
      sourceCavityRadiusM: 100_000,
      sourceDepthM: 4_000,
    });
    expect(r.global?.amplitude).toBeDefined();
    if (r.global?.amplitude === undefined) return;
    // Count cells east of the wall (j > 60) with amplitude > 0.01.
    let east = 0;
    for (let i = 0; i < N; i++) {
      for (let j = 62; j < N; j++) {
        const a = r.global.amplitude.amplitudes[i * N + j] ?? Number.NaN;
        if (Number.isFinite(a) && a > 0.01) east++;
      }
    }
    expect(east).toBe(0);
  });
});
