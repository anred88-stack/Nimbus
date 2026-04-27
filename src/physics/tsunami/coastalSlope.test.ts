import { describe, expect, it } from 'vitest';
import { makeElevationGrid } from '../elevation/index.js';
import { coastalBeachSlope } from './coastalSlope.js';

/** Build a simple coastline grid: ocean to the west, land rising
 *  linearly to the east over a distance of `landRunDeg` degrees. */
function simpleCoastGrid(
  peakElevationMeters: number,
  landRunDeg = 2
): ReturnType<typeof makeElevationGrid> {
  const nLat = 11;
  const nLon = 21;
  const minLon = -10;
  const maxLon = 10;
  const samples = new Float32Array(nLat * nLon);
  for (let i = 0; i < nLat; i++) {
    for (let j = 0; j < nLon; j++) {
      const lon = minLon + ((maxLon - minLon) * j) / (nLon - 1);
      if (lon < 0) {
        samples[i * nLon + j] = -4_000; // deep ocean west of 0° lon
      } else if (lon <= landRunDeg) {
        // Linear ramp 0 → peak over `landRunDeg` degrees.
        samples[i * nLon + j] = (lon / landRunDeg) * peakElevationMeters;
      } else {
        samples[i * nLon + j] = peakElevationMeters;
      }
    }
  }
  return makeElevationGrid({
    minLat: -5,
    maxLat: 5,
    minLon,
    maxLon,
    nLat,
    nLon,
    samples,
  });
}

describe('coastalBeachSlope', () => {
  it('returns a shallow angle for a gentle plain coast (Romagna-like)', () => {
    // 10 m peak over 2° ≈ 222 km → slope tan⁻¹(10 / 222000) ≈ 2.6e-3 rad.
    const g = simpleCoastGrid(10);
    const slope = coastalBeachSlope({ grid: g, latitude: 0, longitude: 0 });
    // Log the actual atan(10/222000) ≈ 4.5e-5 rad — but the clamp
    // lower bound is atan(1/2000) = 5.0e-4 rad. Check we stay in the
    // "very flat" regime.
    expect(slope).toBeLessThan(Math.atan(1 / 50));
  });

  it('returns a steep angle for a cliff coast (Sardinia-like)', () => {
    // 1 500 m peak over 2° — steep cliff.
    const g = simpleCoastGrid(1_500);
    const slope = coastalBeachSlope({ grid: g, latitude: 0, longitude: 0 });
    expect(slope).toBeGreaterThan(Math.atan(1 / 200));
  });

  it('clamps to the physical band and never returns a pathological cliff (> atan(1/2))', () => {
    // Sharp cliff: 3 000 m peak over 0.5°.
    const g = simpleCoastGrid(3_000, 0.5);
    const slope = coastalBeachSlope({ grid: g, latitude: 0, longitude: 0 });
    expect(slope).toBeLessThanOrEqual(Math.atan(1 / 2));
  });

  it('falls back to the 1:100 textbook default when sampling an open-ocean point', () => {
    const samples = new Float32Array(11 * 21).fill(-4_000);
    const g = makeElevationGrid({
      minLat: -5,
      maxLat: 5,
      minLon: -10,
      maxLon: 10,
      nLat: 11,
      nLon: 21,
      samples,
    });
    const slope = coastalBeachSlope({ grid: g, latitude: 0, longitude: 0 });
    expect(slope).toBeCloseTo(Math.atan(1 / 100), 4);
  });

  it('steeper coast → larger slope angle (monotonicity)', () => {
    const gentle = simpleCoastGrid(50);
    const moderate = simpleCoastGrid(200);
    const steep = simpleCoastGrid(1_000);
    const sGentle = coastalBeachSlope({ grid: gentle, latitude: 0, longitude: 0 });
    const sModerate = coastalBeachSlope({ grid: moderate, latitude: 0, longitude: 0 });
    const sSteep = coastalBeachSlope({ grid: steep, latitude: 0, longitude: 0 });
    expect(sModerate).toBeGreaterThan(sGentle);
    expect(sSteep).toBeGreaterThan(sModerate);
  });
});
