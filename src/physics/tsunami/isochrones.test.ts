import { describe, expect, it } from 'vitest';
import { makeElevationGrid } from '../elevation/index.js';
import { computeTsunamiArrivalField } from './fastMarching.js';
import { extractIsochrones } from './isochrones.js';

function flatOcean(depth: number, n = 21): ReturnType<typeof makeElevationGrid> {
  const samples = new Float32Array(n * n);
  samples.fill(-depth);
  return makeElevationGrid({
    minLat: -10,
    maxLat: 10,
    minLon: -10,
    maxLon: 10,
    nLat: n,
    nLon: n,
    samples,
  });
}

describe('extractIsochrones', () => {
  it('returns one band per requested threshold', () => {
    const g = flatOcean(4_000);
    const field = computeTsunamiArrivalField({ grid: g, sourceLatitude: 0, sourceLongitude: 0 });
    const bands = extractIsochrones({
      field,
      minLat: -10,
      maxLat: 10,
      minLon: -10,
      maxLon: 10,
      thresholds: [600, 1_200, 2_400],
    });
    expect(bands).toHaveLength(3);
    expect(bands.map((b) => b.timeSeconds)).toEqual([600, 1_200, 2_400]);
  });

  it('later thresholds have larger isochrones on uniform ocean', () => {
    const g = flatOcean(4_000);
    const field = computeTsunamiArrivalField({ grid: g, sourceLatitude: 0, sourceLongitude: 0 });
    const bands = extractIsochrones({
      field,
      minLat: -10,
      maxLat: 10,
      minLon: -10,
      maxLon: 10,
      thresholds: [600, 1_800, 3_600],
    });
    // Count segments as a proxy for isochrone perimeter — later times
    // have longer isochrones on a uniform grid.
    expect(bands[0]!.segments.length).toBeLessThanOrEqual(bands[1]!.segments.length);
    expect(bands[1]!.segments.length).toBeLessThanOrEqual(bands[2]!.segments.length);
  });

  it('isochrone segments stay inside the grid bounds', () => {
    const g = flatOcean(4_000);
    const field = computeTsunamiArrivalField({ grid: g, sourceLatitude: 0, sourceLongitude: 0 });
    const bands = extractIsochrones({
      field,
      minLat: -10,
      maxLat: 10,
      minLon: -10,
      maxLon: 10,
      thresholds: [1_800],
    });
    for (const seg of bands[0]!.segments) {
      expect(seg.lat1).toBeGreaterThanOrEqual(-10);
      expect(seg.lat1).toBeLessThanOrEqual(10);
      expect(seg.lat2).toBeGreaterThanOrEqual(-10);
      expect(seg.lat2).toBeLessThanOrEqual(10);
      expect(seg.lon1).toBeGreaterThanOrEqual(-10);
      expect(seg.lon1).toBeLessThanOrEqual(10);
      expect(seg.lon2).toBeGreaterThanOrEqual(-10);
      expect(seg.lon2).toBeLessThanOrEqual(10);
    }
  });

  it('returns zero segments if no cell crosses the threshold', () => {
    const g = flatOcean(4_000);
    const field = computeTsunamiArrivalField({ grid: g, sourceLatitude: 0, sourceLongitude: 0 });
    // 0.01 s threshold: entire grid is above this (even the cell
    // next to the source). Actually the source cell is at t=0 so
    // the threshold 0.01 lies between 0 and the first neighbour's
    // time → expect SOME segments but few.
    const bands = extractIsochrones({
      field,
      minLat: -10,
      maxLat: 10,
      minLon: -10,
      maxLon: 10,
      thresholds: [1e8], // ~3 years — beyond any possible arrival
    });
    expect(bands[0]!.segments).toHaveLength(0);
  });
});
