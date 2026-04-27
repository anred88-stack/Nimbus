import { describe, expect, it } from 'vitest';
import { STANDARD_GRAVITY } from '../constants.js';
import { makeElevationGrid } from '../elevation/index.js';
import { computeTsunamiArrivalField } from './fastMarching.js';

/** Build a flat-ocean grid at a given uniform depth. */
function flatOcean(
  depthMeters: number,
  nLat = 21,
  nLon = 21
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

describe('computeTsunamiArrivalField — uniform depth', () => {
  it('arrival time at the source itself is zero', () => {
    const g = flatOcean(4_000);
    const r = computeTsunamiArrivalField({ grid: g, sourceLatitude: 0, sourceLongitude: 0 });
    const mid = Math.floor(r.nLat / 2) * r.nLon + Math.floor(r.nLon / 2);
    expect(r.arrivalTimes[mid]).toBe(0);
  });

  it('travel-time radius matches r / √(g·h) on uniform deep ocean', () => {
    const depth = 4_000;
    const g = flatOcean(depth);
    const r = computeTsunamiArrivalField({ grid: g, sourceLatitude: 0, sourceLongitude: 0 });
    // Sample due east of the source, 5 grid cells away (1 cell = 1° ≈ 111 km).
    const midI = Math.floor(r.nLat / 2);
    const midJ = Math.floor(r.nLon / 2);
    const idx = midI * r.nLon + (midJ + 5);
    const t = r.arrivalTimes[idx] ?? Infinity;
    const celerity = Math.sqrt(STANDARD_GRAVITY * depth);
    const distanceMeters = 5 * 111_000; // 5° @ equator
    const expectedTime = distanceMeters / celerity;
    // FMM on a square grid underestimates diagonal travel by ~15 %
    // (classic first-order FMM bias). Bracket loosely.
    expect(t / expectedTime).toBeGreaterThan(0.85);
    expect(t / expectedTime).toBeLessThan(1.2);
  });

  it('shallower ocean arrives slower than deeper ocean at the same range', () => {
    const deep = flatOcean(4_000);
    const shelf = flatOcean(100);
    const rDeep = computeTsunamiArrivalField({ grid: deep, sourceLatitude: 0, sourceLongitude: 0 });
    const rShelf = computeTsunamiArrivalField({
      grid: shelf,
      sourceLatitude: 0,
      sourceLongitude: 0,
    });
    const sampleIdx = Math.floor(rDeep.nLat / 2) * rDeep.nLon + Math.floor(rDeep.nLon / 2) + 5;
    expect(rShelf.arrivalTimes[sampleIdx]).toBeGreaterThan(
      rDeep.arrivalTimes[sampleIdx] ?? Infinity
    );
  });

  it('fills every cell in a uniform ocean', () => {
    const g = flatOcean(4_000, 11, 11);
    const r = computeTsunamiArrivalField({ grid: g, sourceLatitude: 0, sourceLongitude: 0 });
    expect(r.reachableCount).toBe(11 * 11);
    for (const t of r.arrivalTimes) {
      expect(Number.isFinite(t)).toBe(true);
    }
  });
});

describe('computeTsunamiArrivalField — land blockage', () => {
  it('cells inside a continent are unreachable (Infinity)', () => {
    // Build a grid with a thick land strip running N-S through the
    // eastern half — the tsunami cannot propagate past it.
    const nLat = 21;
    const nLon = 21;
    const samples = new Float32Array(nLat * nLon);
    for (let i = 0; i < nLat; i++) {
      for (let j = 0; j < nLon; j++) {
        if (j >= 14) {
          samples[i * nLon + j] = 500; // dry land east of column 14
        } else {
          samples[i * nLon + j] = -4_000; // deep ocean
        }
      }
    }
    const g = makeElevationGrid({
      minLat: -10,
      maxLat: 10,
      minLon: -10,
      maxLon: 10,
      nLat,
      nLon,
      samples,
    });
    const r = computeTsunamiArrivalField({ grid: g, sourceLatitude: 0, sourceLongitude: -8 });
    // Deep-interior land cell should be unreachable.
    const landIdx = 10 * nLon + 18;
    expect(r.arrivalTimes[landIdx]).toBe(Infinity);
    // Ocean cells on the source side remain reachable.
    const oceanIdx = 10 * nLon + 5;
    expect(Number.isFinite(r.arrivalTimes[oceanIdx] ?? Infinity)).toBe(true);
  });

  it('a point immediately downwind of a thin barrier is reachable via detour', () => {
    // Single-column wall at j = 10, leaving j=0..9 (source side) and
    // j=11..20 (shadow side) connected only through the north and
    // south boundaries.
    const nLat = 21;
    const nLon = 21;
    const samples = new Float32Array(nLat * nLon);
    for (let i = 0; i < nLat; i++) {
      for (let j = 0; j < nLon; j++) {
        samples[i * nLon + j] = j === 10 && i > 2 && i < 18 ? 500 : -4_000;
      }
    }
    const g = makeElevationGrid({
      minLat: -10,
      maxLat: 10,
      minLon: -10,
      maxLon: 10,
      nLat,
      nLon,
      samples,
    });
    const r = computeTsunamiArrivalField({ grid: g, sourceLatitude: 0, sourceLongitude: -8 });
    // Shadow-side cell at (i=10, j=15) is reachable but by a detour,
    // so arrival time must be STRICTLY greater than the straight-line
    // equivalent through a gap-less ocean.
    const shadowIdx = 10 * nLon + 15;
    const openIdx = 10 * nLon + 15;
    const gOpen = makeElevationGrid({
      minLat: -10,
      maxLat: 10,
      minLon: -10,
      maxLon: 10,
      nLat,
      nLon,
      samples: new Float32Array(nLat * nLon).fill(-4_000),
    });
    const rOpen = computeTsunamiArrivalField({
      grid: gOpen,
      sourceLatitude: 0,
      sourceLongitude: -8,
    });
    const tShadow = r.arrivalTimes[shadowIdx] ?? Infinity;
    const tOpen = rOpen.arrivalTimes[openIdx] ?? Infinity;
    expect(Number.isFinite(tShadow)).toBe(true);
    expect(tShadow).toBeGreaterThan(tOpen);
  });
});

describe('computeTsunamiArrivalField — shallow-water refraction', () => {
  it('continental-shelf cell arrives slower than a deep-ocean cell at the same range', () => {
    // Deep ocean everywhere EXCEPT a shelf strip on the eastern edge
    // (j ≥ 14). Source on the west. Along the row, j=13 is still deep,
    // j=17 is on the 100 m shelf — same range difference from the
    // source but the shelf leg is traversed at √(g·100) not √(g·4000).
    const nLat = 21;
    const nLon = 21;
    const samples = new Float32Array(nLat * nLon);
    for (let i = 0; i < nLat; i++) {
      for (let j = 0; j < nLon; j++) {
        samples[i * nLon + j] = j >= 14 ? -100 : -4_000;
      }
    }
    const g = makeElevationGrid({
      minLat: -10,
      maxLat: 10,
      minLon: -10,
      maxLon: 10,
      nLat,
      nLon,
      samples,
    });
    const rShelf = computeTsunamiArrivalField({
      grid: g,
      sourceLatitude: 0,
      sourceLongitude: -8,
    });
    // Deep-only reference.
    const deep = new Float32Array(nLat * nLon).fill(-4_000);
    const gDeep = makeElevationGrid({
      minLat: -10,
      maxLat: 10,
      minLon: -10,
      maxLon: 10,
      nLat,
      nLon,
      samples: deep,
    });
    const rDeep = computeTsunamiArrivalField({
      grid: gDeep,
      sourceLatitude: 0,
      sourceLongitude: -8,
    });
    const idxFar = 10 * nLon + 18; // on the shelf strip in shelf grid
    expect(rShelf.arrivalTimes[idxFar]).toBeGreaterThan(rDeep.arrivalTimes[idxFar] ?? Infinity);
  });
});
