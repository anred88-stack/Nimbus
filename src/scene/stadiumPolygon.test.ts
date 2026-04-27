import { describe, expect, it } from 'vitest';
import { buildRuptureStadiumLatLon } from './stadiumPolygon.js';

describe('buildRuptureStadiumPolygon', () => {
  it('point-source rupture + radius collapses to a circle', () => {
    // L = 0, W = 0 → stadium reduces to a circle of radius r around
    // the centre. Every vertex should sit at the same great-circle
    // distance from (0, 0).
    const radius = 100_000;
    const ring = buildRuptureStadiumLatLon({
      centerLatDeg: 0,
      centerLonDeg: 0,
      strikeAzimuthDeg: 45,
      halfLengthAlongStrikeM: 0,
      halfWidthAcrossStrikeM: 0,
      contourRadiusM: radius,
      cornerSegments: 16,
    });
    expect(ring.length).toBe(4 * 17 + 1); // 4 caps × 17 verts + close
    // Distance from origin (haversine) should be radius for every vertex.
    const R = 6_371_008;
    for (const { latDeg, lonDeg } of ring) {
      const lat = (latDeg * Math.PI) / 180;
      const lon = (lonDeg * Math.PI) / 180;
      const ang = Math.acos(
        Math.cos(lat) * Math.cos(lon) // sin(0)*sin(lat)=0; cos(0)*cos(lat)*cos(lon-0)
      );
      const dist = ang * R;
      expect(dist).toBeCloseTo(radius, -2); // ±100 m on a 100 km radius
    }
  });

  it('strike-slip rupture (W=0) produces a stadium of correct length', () => {
    // Half-length 200 km, perpendicular contour radius 50 km, strike
    // due North. Furthest northern vertex should be at ~250 km north.
    const halfL = 200_000;
    const r = 50_000;
    const ring = buildRuptureStadiumLatLon({
      centerLatDeg: 0,
      centerLonDeg: 0,
      strikeAzimuthDeg: 0, // strike North
      halfLengthAlongStrikeM: halfL,
      halfWidthAcrossStrikeM: 0,
      contourRadiusM: r,
      cornerSegments: 16,
    });
    // Find the northernmost vertex (max latDeg).
    const maxLat = Math.max(...ring.map((p) => p.latDeg));
    // 250 km / R rad ≈ 250 / 6371 = 0.0392 rad = 2.249°.
    expect(maxLat).toBeCloseTo(2.249, 2);

    // The east-west extent at the equator should be 2r km on either
    // side, i.e. maxLon - minLon ≈ 2r/R rad.
    const maxLon = Math.max(...ring.map((p) => p.lonDeg));
    const minLon = Math.min(...ring.map((p) => p.lonDeg));
    const lonExtentDeg = maxLon - minLon;
    const expectedLonDeg = ((2 * r) / 6_371_008) * (180 / Math.PI);
    expect(lonExtentDeg).toBeCloseTo(expectedLonDeg, 2);
  });

  it('Tōhoku megathrust geometry — ~500 km × 200 km rupture, MMI VII at 110 km r_jb', () => {
    // Sanity-check the stadium scale that Phase 13b is meant to fix.
    const halfL = 250_000;
    const halfW = 100_000;
    const r = 110_000;
    const ring = buildRuptureStadiumLatLon({
      centerLatDeg: 38, // offshore Sendai
      centerLonDeg: 143,
      strikeAzimuthDeg: 200,
      halfLengthAlongStrikeM: halfL,
      halfWidthAcrossStrikeM: halfW,
      contourRadiusM: r,
      cornerSegments: 16,
    });
    // The polygon's bounding box in metres along strike should be
    // ≈ 2(halfL + r) = 720 km. We use a haversine on the closest two
    // vertices that lie roughly along the strike axis to estimate.
    // Simple bound: the great-circle diameter of the bbox should not
    // exceed 2 (halfL + r + halfW) = 920 km, and not be smaller than
    // 2 (halfL + r) − some slack = 700 km.
    const maxLat = Math.max(...ring.map((p) => p.latDeg));
    const minLat = Math.min(...ring.map((p) => p.latDeg));
    const latExtentKm = ((((maxLat - minLat) * Math.PI) / 180) * 6_371_008) / 1_000;
    // Strike 200° tilts the rectangle ≈ 20° west of N–S so the lat
    // extent should sit between the across-strike total (2 (halfW+r)) =
    // 420 km and the along-strike total (2 (halfL+r)) = 720 km. Most of
    // the lat budget is along strike → expect lat extent close to
    // 720 km × cos(20°) ≈ 676 km, with the across-strike contribution
    // adding sin(20°) × 420 ≈ 144 km → 820 km total.
    expect(latExtentKm).toBeGreaterThan(600);
    expect(latExtentKm).toBeLessThan(900);
  });

  it('rotates with strikeAzimuthDeg', () => {
    // Same rupture geometry but two different strike azimuths should
    // produce different polygons (no longer a circle when L > 0).
    const inputs = {
      centerLatDeg: 0,
      centerLonDeg: 0,
      halfLengthAlongStrikeM: 100_000,
      halfWidthAcrossStrikeM: 0,
      contourRadiusM: 30_000,
      cornerSegments: 8,
    };
    const ringN = buildRuptureStadiumLatLon({ ...inputs, strikeAzimuthDeg: 0 });
    const ringE = buildRuptureStadiumLatLon({ ...inputs, strikeAzimuthDeg: 90 });
    // For strike N: largest |lat| extent. For strike E: largest |lon|.
    const ringN_latExtent =
      Math.max(...ringN.map((p) => p.latDeg)) - Math.min(...ringN.map((p) => p.latDeg));
    const ringE_latExtent =
      Math.max(...ringE.map((p) => p.latDeg)) - Math.min(...ringE.map((p) => p.latDeg));
    expect(ringN_latExtent).toBeGreaterThan(ringE_latExtent);
  });

  it('returns a closed polygon (first vertex repeated at the end)', () => {
    const ring = buildRuptureStadiumLatLon({
      centerLatDeg: 0,
      centerLonDeg: 0,
      strikeAzimuthDeg: 0,
      halfLengthAlongStrikeM: 50_000,
      halfWidthAcrossStrikeM: 0,
      contourRadiusM: 10_000,
      cornerSegments: 4,
    });
    const first = ring[0];
    const last = ring[ring.length - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    if (first === undefined || last === undefined) return;
    expect(first.latDeg).toBeCloseTo(last.latDeg, 9);
    expect(first.lonDeg).toBeCloseTo(last.lonDeg, 9);
  });
});
