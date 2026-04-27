import { describe, expect, it } from 'vitest';
import {
  findNearbyOceanDepth,
  makeElevationGrid,
  sampleElevation,
  sampleElevationAndSlope,
  sampleSlope,
} from './grid.js';

/** Build a small 3×3 grid covering ±10° in lat/lon with a given
 *  sample array (row-major north-to-south). */
function tinyGrid(samples: number[]): ReturnType<typeof makeElevationGrid> {
  return makeElevationGrid({
    minLat: -10,
    maxLat: 10,
    minLon: -10,
    maxLon: 10,
    nLat: 3,
    nLon: 3,
    samples: Float32Array.from(samples),
  });
}

describe('makeElevationGrid', () => {
  it('rejects reversed bounds', () => {
    expect(() =>
      makeElevationGrid({
        minLat: 10,
        maxLat: -10,
        minLon: -10,
        maxLon: 10,
        nLat: 3,
        nLon: 3,
        samples: new Float32Array(9),
      })
    ).toThrow(/bounds must be strictly ordered/);
  });

  it('rejects sample-count mismatch', () => {
    expect(() =>
      makeElevationGrid({
        minLat: -1,
        maxLat: 1,
        minLon: -1,
        maxLon: 1,
        nLat: 3,
        nLon: 3,
        samples: new Float32Array(8), // should be 9
      })
    ).toThrow(/sample length/);
  });

  it('rejects too-small grids', () => {
    expect(() =>
      makeElevationGrid({
        minLat: -1,
        maxLat: 1,
        minLon: -1,
        maxLon: 1,
        nLat: 1,
        nLon: 3,
        samples: new Float32Array(3),
      })
    ).toThrow(/≥ 2 samples per axis/);
  });
});

describe('sampleElevation (bilinear)', () => {
  // Grid layout:
  //   (lat=+10): 0  1  2   ← north row, row index 0
  //   (lat=  0): 3  4  5
  //   (lat=-10): 6  7  8   ← south row
  //   lon:     -10  0 +10
  const g = tinyGrid([0, 1, 2, 3, 4, 5, 6, 7, 8]);

  it('returns the grid value at exact nodes', () => {
    expect(sampleElevation(g, 10, -10)).toBe(0);
    expect(sampleElevation(g, 10, 10)).toBe(2);
    expect(sampleElevation(g, -10, -10)).toBe(6);
    expect(sampleElevation(g, -10, 10)).toBe(8);
    expect(sampleElevation(g, 0, 0)).toBe(4);
  });

  it('bilinearly interpolates at the midpoints', () => {
    // Midpoint between (10, -10) = 0 and (10, 10) = 2 is 1.
    expect(sampleElevation(g, 10, 0)).toBe(1);
    // Midpoint of the whole grid is 4 by construction.
    expect(sampleElevation(g, 0, 0)).toBe(4);
    // Midpoint between (0, 0) = 4 and (-10, 0) = 7 is 5.5.
    expect(sampleElevation(g, -5, 0)).toBeCloseTo(5.5, 5);
  });

  it('clamps to the grid bounds on out-of-range inputs', () => {
    expect(sampleElevation(g, 100, 0)).toBe(sampleElevation(g, 10, 0));
    expect(sampleElevation(g, 0, -100)).toBe(sampleElevation(g, 0, -10));
  });
});

describe('sampleSlope', () => {
  it('returns ≈ 0 on a perfectly flat grid', () => {
    const flat = tinyGrid([100, 100, 100, 100, 100, 100, 100, 100, 100]);
    const slope = sampleSlope(flat, 0, 0);
    expect(slope).toBeCloseTo(0, 10);
  });

  it('returns a positive slope on a tilted ramp grid', () => {
    // Ramp rising eastward (higher longitude = higher elevation).
    // Grid spans 20° lon = 2 225 km at equator, elevation rises from 0
    // to 1 000 m → slope ≈ 4.5e-4 rad.
    const ramp = tinyGrid([0, 500, 1_000, 0, 500, 1_000, 0, 500, 1_000]);
    const slope = sampleSlope(ramp, 0, 0);
    expect(slope).toBeGreaterThan(0);
    // Expected magnitude: ~4.5e-4 rad (atan(1000 m / 2.22M m)).
    expect(slope).toBeCloseTo(4.5e-4, 4);
  });

  it('returns the same slope magnitude regardless of aspect', () => {
    // North-rising ramp (higher latitude = higher elevation).
    const nRamp = tinyGrid([1_000, 1_000, 1_000, 500, 500, 500, 0, 0, 0]);
    // East-rising ramp.
    const eRamp = tinyGrid([0, 500, 1_000, 0, 500, 1_000, 0, 500, 1_000]);
    const sN = sampleSlope(nRamp, 0, 0);
    const sE = sampleSlope(eRamp, 0, 0);
    expect(sN).toBeCloseTo(sE, 5);
  });

  it('sampleElevationAndSlope returns both in one call', () => {
    const ramp = tinyGrid([0, 500, 1_000, 0, 500, 1_000, 0, 500, 1_000]);
    const s = sampleElevationAndSlope(ramp, 0, 0);
    expect(s.elevation).toBe(500);
    expect(s.slope).toBeGreaterThan(0);
  });
});

describe('findNearbyOceanDepth', () => {
  /** A coastal grid: westernmost column is 1 km of ocean, the rest is
   *  land. The columns alternate: -1000 (ocean) | 0 | 100 | 200 | 300
   *  (rising land away from the shore). */
  function coastalGrid(): ReturnType<typeof makeElevationGrid> {
    return makeElevationGrid({
      minLat: -10,
      maxLat: 10,
      minLon: -10,
      maxLon: 10,
      nLat: 5,
      nLon: 5,
      // 5 × 5 grid: row-major, ocean in col 0 (lon = −10°), land elsewhere.
      // Each row is identical so latitude is irrelevant for this fixture.
      samples: Float32Array.from([
        -1_000, 0, 100, 200, 300, -1_000, 0, 100, 200, 300, -1_000, 0, 100, 200, 300, -1_000, 0,
        100, 200, 300, -1_000, 0, 100, 200, 300,
      ]),
    });
  }

  it('returns null on contiguous-land clicks far from the shore', () => {
    const grid = coastalGrid();
    // Click at lon = +5° (central interior) — every nearby cell is
    // land. With a 100 km search radius the helper still finds no
    // ocean cell because the nearest ocean column is at lon = −10°
    // (≈ 1 670 km away at the equator).
    const depth = findNearbyOceanDepth(grid, 0, 5, 100_000);
    expect(depth).toBeNull();
  });

  it('finds an ocean depth for a coastal click that the click cell itself misses', () => {
    const grid = coastalGrid();
    // Click sits at lon = −9.5° — bilinear sampling at this exact
    // point reads the interpolation between the −1 000 m ocean
    // column (lon = −10°) and the 0 m shore column (lon = −5°), so
    // the click cell looks "land-like" without the helper. The
    // 200 km neighbourhood walks west into the ocean cells and
    // returns a positive depth, which is what the coastal-tsunami
    // branch needs to fire.
    const depth = findNearbyOceanDepth(grid, 0, -9.5, 200_000);
    expect(depth).not.toBeNull();
    if (depth !== null) {
      // Bilinear gradients across the shoreline mean the median sits
      // between 100 m (interpolated near-shore samples) and the full
      // 1 000 m basin depth. Any value ≥ 100 m is enough to seed the
      // Glasstone underwater-burst tsunami branch.
      expect(depth).toBeGreaterThan(100);
      expect(depth).toBeLessThanOrEqual(1_000);
    }
  });

  it('returns null when the search radius is non-positive', () => {
    const grid = coastalGrid();
    expect(findNearbyOceanDepth(grid, 0, -9.5, 0)).toBeNull();
    expect(findNearbyOceanDepth(grid, 0, -9.5, -100)).toBeNull();
  });

  it('skips cells that fall outside the grid bounds', () => {
    // Tiny one-cell grid covering −1 .. 1° with deep ocean. A search
    // radius bigger than the grid would walk into the clamp; the
    // helper must not double-count by reading the edge value through
    // the bilinear sampler.
    const oceanGrid = makeElevationGrid({
      minLat: -1,
      maxLat: 1,
      minLon: -1,
      maxLon: 1,
      nLat: 3,
      nLon: 3,
      samples: Float32Array.from([
        -1_000, -1_000, -1_000, -1_000, -1_000, -1_000, -1_000, -1_000, -1_000,
      ]),
    });
    const depth = findNearbyOceanDepth(oceanGrid, 0, 0, 5_000_000);
    // Some cells are inside the bounds and contribute; the median is
    // still 1 000 m. Just check we got a sensible non-null answer
    // rather than blowing past the grid edges silently.
    expect(depth).toBe(1_000);
  });
});
