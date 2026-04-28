import { describe, it, expect } from 'vitest';
import { reprojectMercatorToLinearLat } from './terrainSampling.js';

describe('reprojectMercatorToLinearLat — Phase 16 Mercator fix', () => {
  const MERCATOR_LIMIT_LAT = 85.05112878;

  /**
   * Build a Mercator-aligned raster whose value at row i is the
   * actual latitude of that Mercator row. After reprojection, the
   * value at output row i should equal `maxLat − i · dLat` (i.e. the
   * grid is now linear in lat). This isolates the resampling math
   * from any tile-loading or I/O concern.
   */
  function mercatorYToLat(yNorm: number): number {
    return (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - 2 * yNorm)));
  }

  it('maps a Mercator-Y-linear raster to a lat-linear raster', () => {
    const N = 1024;
    // One column, value = lat at that Mercator-Y row.
    const merc = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const yNorm = i / (N - 1);
      merc[i] = mercatorYToLat(yNorm);
    }
    const linear = reprojectMercatorToLinearLat(
      merc,
      N,
      1,
      -MERCATOR_LIMIT_LAT,
      MERCATOR_LIMIT_LAT
    );
    // After reprojection, output row i should hold the LAT at that
    // linear-lat row, i.e. `maxLat − (i / (N-1)) · (maxLat − minLat)`.
    for (let i = 0; i < N; i += 64) {
      const expectedLat = MERCATOR_LIMIT_LAT - (i / (N - 1)) * 2 * MERCATOR_LIMIT_LAT;
      const actual = linear[i] ?? Number.NaN;
      // Allow a small interpolation error near the poles where
      // Mercator stretches infinitely. Mid-latitudes should be tight.
      const tolerance = Math.abs(expectedLat) > 70 ? 1.5 : 0.3;
      expect(Math.abs(actual - expectedLat)).toBeLessThan(tolerance);
    }
  });

  it('reproduces the user-reported 23.6° lat error at lat=44.20° BEFORE fix', () => {
    // Sanity reproduction of the bug: in a Mercator raster, the row
    // computed from a lat-linear formula points to a different
    // physical latitude. This isn't testing reprojectMercatorToLinearLat
    // — it's documenting what was wrong with the original loader.
    const N = 1024;
    const linearLatRow = Math.round(
      ((MERCATOR_LIMIT_LAT - 44.2) / (2 * MERCATOR_LIMIT_LAT)) * (N - 1)
    );
    const actualLatAtThatMercatorRow = mercatorYToLat(linearLatRow / (N - 1));
    expect(Math.abs(actualLatAtThatMercatorRow - 44.2)).toBeGreaterThan(20);
    expect(Math.abs(actualLatAtThatMercatorRow - 44.2)).toBeLessThan(25);
  });

  it('preserves the equator: row at lat=0 maps to mid mercator row', () => {
    const N = 1024;
    // Build a synthetic raster: zero everywhere except a "marker" at
    // the mid Mercator row (corresponding to lat=0).
    const merc = new Float32Array(N * 4);
    const midMercRow = Math.round((N - 1) * 0.5);
    for (let j = 0; j < 4; j++) merc[midMercRow * 4 + j] = -5000; // ocean depth
    const linear = reprojectMercatorToLinearLat(
      merc,
      N,
      4,
      -MERCATOR_LIMIT_LAT,
      MERCATOR_LIMIT_LAT
    );
    // The mid output row (lat=0) should pick up the ocean marker.
    const midOutRow = Math.round((N - 1) * 0.5);
    expect(linear[midOutRow * 4]).toBeLessThan(-2000);
    // Far-from-equator rows should NOT pick it up.
    expect(linear[10 * 4] ?? 0).toBeGreaterThan(-100);
  });

  it('puts a north-Atlantic ocean cell where lat=44.2°N expects it', () => {
    // Build a synthetic raster: mark every column at lat=44.2°N (in
    // Mercator-Y) as deep ocean (-5000), everything else as 0.
    const N = 1024;
    // What Mercator-Y row corresponds to lat=44.2°?
    const yNormAt44 =
      (Math.PI - Math.log(Math.tan((Math.PI / 4) * (1 + 44.2 / 90)))) / (2 * Math.PI);
    const mercRowAt44 = Math.round(yNormAt44 * (N - 1));
    const merc = new Float32Array(N * N);
    for (let j = 0; j < N; j++) merc[mercRowAt44 * N + j] = -5000;

    const linear = reprojectMercatorToLinearLat(
      merc,
      N,
      N,
      -MERCATOR_LIMIT_LAT,
      MERCATOR_LIMIT_LAT
    );
    // After fix: the cell at the LINEAR-LAT row corresponding to
    // lat=44.2° should be deep ocean.
    const linearRowAt44 = Math.round(
      ((MERCATOR_LIMIT_LAT - 44.2) / (2 * MERCATOR_LIMIT_LAT)) * (N - 1)
    );
    const valueThere = linear[linearRowAt44 * N + 512] ?? 0;
    expect(valueThere).toBeLessThan(-1000);
    // And the Mercator-row's old position (linearRow that USED to be
    // wrong) should NOT show ocean — confirms the fix actually
    // moved the data.
    const oldWrongLinearRow = mercRowAt44;
    if (oldWrongLinearRow !== linearRowAt44) {
      const valueOldRow = linear[oldWrongLinearRow * N + 512] ?? 0;
      expect(valueOldRow).toBeGreaterThan(-100);
    }
  });
});
