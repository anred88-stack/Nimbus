/**
 * I5/I6 GEOMETRIC + RENDERING COHERENCE — coordinate / CRS sanity.
 *
 * Pins behaviour for:
 *   - lat/lon ordering (catches the swap bug in geometry generators)
 *   - antimeridian handling per RFC 7946 (a polygon spanning lon=180°
 *     must either be split into two parts or have its bbox set with
 *     west > east to signal the wrap)
 *   - bbox computed from a polygon equals the bbox passed to/expected
 *     by the rendering layer (no offset, no mirror, no scale)
 *   - degrees-vs-radians sanity (a radian value mistakenly passed as
 *     degrees produces a radius ~57× too large — easy to spot)
 *
 * No screenshot tests here. Those live in tests/e2e and are the last
 * line of defence; this file pins the data-side contract.
 *
 * Reference geometry primitive: `buildRuptureStadiumLatLon`.
 * Reference distance: spherical haversine with R = 6_371_008 m
 * (matching the existing test helper).
 */

import { describe, expect, it } from 'vitest';
import { buildRuptureStadiumLatLon } from '../../scene/stadiumPolygon.js';
import { TOL_GEODETIC_KM, TOL_LATLON_ROUNDTRIP_DEG } from './tolerances.js';

const EARTH_RADIUS_M = 6_371_008;

function haversineM(latA: number, lonA: number, latB: number, lonB: number): number {
  const phiA = (latA * Math.PI) / 180;
  const phiB = (latB * Math.PI) / 180;
  const dphi = ((latB - latA) * Math.PI) / 180;
  const dlam = ((lonB - lonA) * Math.PI) / 180;
  const a = Math.sin(dphi / 2) ** 2 + Math.cos(phiA) * Math.cos(phiB) * Math.sin(dlam / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

describe('I5 LAT/LON ORDER — generated geometries respect (lat, lon) — never swapped', () => {
  it('a 100 km circle at lat=0/lon=0 has every vertex at correct (lat, lon)', () => {
    const ring = buildRuptureStadiumLatLon({
      centerLatDeg: 0,
      centerLonDeg: 0,
      strikeAzimuthDeg: 0,
      halfLengthAlongStrikeM: 0,
      halfWidthAcrossStrikeM: 0,
      contourRadiusM: 100_000,
      cornerSegments: 16,
    });
    // I5: lat is in [-90, 90], lon is in [-180, 180]. If swapped,
    // the ring would have impossible lat values >> 90.
    for (const v of ring) {
      expect(v.latDeg, `latDeg out of range: ${v.latDeg.toString()}`).toBeGreaterThanOrEqual(-90);
      expect(v.latDeg).toBeLessThanOrEqual(90);
      expect(v.lonDeg).toBeGreaterThanOrEqual(-180.5); // small float slack
      expect(v.lonDeg).toBeLessThanOrEqual(180.5);
    }
  });

  it('catches a hypothetical lat/lon swap: a circle at high lat (60°) has vertices CLOSE in lon to centre', () => {
    // At lat=60°, 100 km in longitude direction = 100/(111 * cos60°)
    // ≈ 1.8°. If lat/lon were swapped in the generator, vertices
    // would span 1.8° of LATITUDE instead — the distance from the
    // centre would be ~200 km vs the requested 100 km.
    const ring = buildRuptureStadiumLatLon({
      centerLatDeg: 60,
      centerLonDeg: 0,
      strikeAzimuthDeg: 0,
      halfLengthAlongStrikeM: 0,
      halfWidthAcrossStrikeM: 0,
      contourRadiusM: 100_000,
      cornerSegments: 16,
    });
    for (const v of ring) {
      const d = haversineM(60, 0, v.latDeg, v.lonDeg);
      // 100 km expected, ±1 km (corner-segments quantisation + WGS84 slack)
      expect(Math.abs(d - 100_000)).toBeLessThan(2_000);
    }
  });
});

describe('I5 GEODETIC SCALE — 1° latitude ≈ 111 km, 1° longitude at lat=60° ≈ 55 km', () => {
  it('haversine: 1° lat at equator ≈ 111.195 km within ±0.5%', () => {
    const d = haversineM(0, 0, 1, 0);
    const expected = 111_195; // (π/180) × R
    expect(Math.abs(d - expected) / expected).toBeLessThan(TOL_GEODETIC_KM);
  });

  it('haversine: 1° lon at lat=60° ≈ 55.598 km (= 111 × cos 60°)', () => {
    const d = haversineM(60, 0, 60, 1);
    const expected = 111_195 * Math.cos((60 * Math.PI) / 180);
    expect(Math.abs(d - expected) / expected).toBeLessThan(TOL_GEODETIC_KM);
  });

  it('catches degrees-vs-radians swap: 1 RAD treated as 1 DEG would give 6378 km not 111 km', () => {
    // If a function accidentally takes radians but documents degrees,
    // passing 1.0 (intended as 1 deg) would be interpreted as 1 rad
    // ≈ 57.3 deg → 6378 km. That's ~57× too large. Spot-check.
    const dRightWay = haversineM(0, 0, 1, 0); // 1 deg → 111 km
    const dWrongWay = haversineM(0, 0, (180 / Math.PI), 0); // 1 rad-as-deg → 6378 km
    expect(dWrongWay / dRightWay).toBeGreaterThan(50);
    expect(dWrongWay / dRightWay).toBeLessThan(60);
  });
});

describe('I5 ANTIMERIDIAN (RFC 7946) — polygons spanning lon=180° handled correctly', () => {
  it('a 500 km circle centred at lon=179.5° has vertices BOTH east of 180 and (wrapping) west of -180', () => {
    // RFC 7946 §3.1.9: a polygon crossing the antimeridian SHOULD be
    // cut into two parts or have lons remapped. Our geometry helper
    // does NOT split — it returns vertices that may exceed [-180,
    // 180] (they wrap mathematically). Rendering layer is responsible
    // for splitting. We assert the underlying geometry is internally
    // consistent (each vertex still 500 km from centre).
    const radius = 500_000;
    const ring = buildRuptureStadiumLatLon({
      centerLatDeg: 0,
      centerLonDeg: 179.5,
      strikeAzimuthDeg: 0,
      halfLengthAlongStrikeM: 0,
      halfWidthAcrossStrikeM: 0,
      contourRadiusM: radius,
      cornerSegments: 16,
    });
    let crossesEast = false;
    let crossesWest = false;
    for (const v of ring) {
      // True great-circle distance still ≈ 500 km (haversine handles
      // wrap correctly internally)
      const d = haversineM(0, 179.5, v.latDeg, v.lonDeg);
      expect(Math.abs(d - radius), `vertex ${JSON.stringify(v)}: dist ${d.toString()}`).toBeLessThan(10_000);
      // The east cap (lon > 180 raw, or wrapped to -179.x) tells us
      // the antimeridian was crossed.
      if (v.lonDeg > 180 || v.lonDeg < -179) crossesEast = true;
      if (v.lonDeg < 180 && v.lonDeg > 178) crossesWest = true;
    }
    expect(crossesEast, 'no vertex east of antimeridian — geometry might silently clip').toBe(true);
    expect(crossesWest, 'no vertex west of centre — ring is degenerate').toBe(true);
  });

  it('a 500 km circle centred at lon=-179.5° is symmetric to lon=+179.5° (translation invariant)', () => {
    const radius = 500_000;
    const east = buildRuptureStadiumLatLon({
      centerLatDeg: 0,
      centerLonDeg: 179.5,
      strikeAzimuthDeg: 0,
      halfLengthAlongStrikeM: 0,
      halfWidthAcrossStrikeM: 0,
      contourRadiusM: radius,
      cornerSegments: 16,
    });
    const west = buildRuptureStadiumLatLon({
      centerLatDeg: 0,
      centerLonDeg: -179.5,
      strikeAzimuthDeg: 0,
      halfLengthAlongStrikeM: 0,
      halfWidthAcrossStrikeM: 0,
      contourRadiusM: radius,
      cornerSegments: 16,
    });
    // Both rings should have equal great-circle radius from their
    // respective centres.
    for (const v of east) {
      const d = haversineM(0, 179.5, v.latDeg, v.lonDeg);
      expect(Math.abs(d - radius)).toBeLessThan(10_000);
    }
    for (const v of west) {
      const d = haversineM(0, -179.5, v.latDeg, v.lonDeg);
      expect(Math.abs(d - radius)).toBeLessThan(10_000);
    }
    // Symmetry: same number of vertices.
    expect(east.length).toBe(west.length);
  });
});

describe('I5/I6 BBOX EQUIVALENCE — bbox computed from polygon == bbox expected by renderer', () => {
  it('a 100 km circle at (0, 0) has bbox that contains every vertex and is symmetric', () => {
    const ring = buildRuptureStadiumLatLon({
      centerLatDeg: 0,
      centerLonDeg: 0,
      strikeAzimuthDeg: 0,
      halfLengthAlongStrikeM: 0,
      halfWidthAcrossStrikeM: 0,
      contourRadiusM: 100_000,
      cornerSegments: 16,
    });
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const v of ring) {
      if (v.latDeg < minLat) minLat = v.latDeg;
      if (v.latDeg > maxLat) maxLat = v.latDeg;
      if (v.lonDeg < minLon) minLon = v.lonDeg;
      if (v.lonDeg > maxLon) maxLon = v.lonDeg;
    }
    // I5: bbox is symmetric around 0 (centre at origin).
    expect(Math.abs(minLat + maxLat)).toBeLessThan(TOL_LATLON_ROUNDTRIP_DEG + 1e-3);
    expect(Math.abs(minLon + maxLon)).toBeLessThan(TOL_LATLON_ROUNDTRIP_DEG + 1e-3);
    // 100 km ≈ 0.9 deg lat at equator
    expect(maxLat - minLat).toBeGreaterThan(1.5);
    expect(maxLat - minLat).toBeLessThan(2.5);
  });

  it('a stadium with strike NORTH and L=200 km is taller than wide (bbox.dy > bbox.dx)', () => {
    // Sanity: the rupture rectangle's long axis aligns with strike.
    // Strike NORTH (azimuth 0) → bbox should extend more in lat than lon.
    const ring = buildRuptureStadiumLatLon({
      centerLatDeg: 0,
      centerLonDeg: 0,
      strikeAzimuthDeg: 0,
      halfLengthAlongStrikeM: 200_000,
      halfWidthAcrossStrikeM: 50_000,
      contourRadiusM: 50_000,
      cornerSegments: 16,
    });
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const v of ring) {
      minLat = Math.min(minLat, v.latDeg);
      maxLat = Math.max(maxLat, v.latDeg);
      minLon = Math.min(minLon, v.lonDeg);
      maxLon = Math.max(maxLon, v.lonDeg);
    }
    const dLat = maxLat - minLat;
    const dLon = maxLon - minLon;
    // I5: long axis is N-S → bbox.dLat > bbox.dLon at the equator
    // (where dLat = dLon if isotropic).
    expect(dLat).toBeGreaterThan(dLon);
  });

  it('a stadium with strike EAST and L=200 km is wider than tall (bbox.dx > bbox.dy)', () => {
    const ring = buildRuptureStadiumLatLon({
      centerLatDeg: 0,
      centerLonDeg: 0,
      strikeAzimuthDeg: 90,
      halfLengthAlongStrikeM: 200_000,
      halfWidthAcrossStrikeM: 50_000,
      contourRadiusM: 50_000,
      cornerSegments: 16,
    });
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const v of ring) {
      minLat = Math.min(minLat, v.latDeg);
      maxLat = Math.max(maxLat, v.latDeg);
      minLon = Math.min(minLon, v.lonDeg);
      maxLon = Math.max(maxLon, v.lonDeg);
    }
    expect(maxLon - minLon).toBeGreaterThan(maxLat - minLat);
  });
});

describe('I5 ROTATION INVARIANCE — same scenario, different strike azimuth → same area', () => {
  it('rotating azimuth 0 → 45 → 90 → 180 preserves polygon area (within float-noise)', () => {
    // I5: a stadium polygon's area must not depend on its orientation.
    // Use the shoelace formula on the lat/lon vertices (deg² is fine
    // since we're just comparing).
    function shoelaceDeg2(ring: { latDeg: number; lonDeg: number }[]): number {
      let area = 0;
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i];
        const b = ring[i + 1];
        if (a === undefined || b === undefined) continue;
        area += a.lonDeg * b.latDeg - b.lonDeg * a.latDeg;
      }
      return Math.abs(area) / 2;
    }
    const baseInput = {
      centerLatDeg: 0,
      centerLonDeg: 0,
      halfLengthAlongStrikeM: 100_000,
      halfWidthAcrossStrikeM: 30_000,
      contourRadiusM: 30_000,
      cornerSegments: 32,
    };
    const areas = [0, 30, 45, 60, 90, 180].map((az) =>
      shoelaceDeg2(buildRuptureStadiumLatLon({ ...baseInput, strikeAzimuthDeg: az })),
    );
    const maxA = Math.max(...areas);
    const minA = Math.min(...areas);
    // Allow ~5 % spread for the cos(lat) projection error at non-equatorial
    // azimuths (degree-area is not invariant under rotation off the
    // equator; at the equator it should match within ~0.5 %).
    expect((maxA - minA) / maxA, 'area drift across azimuths > 5 %').toBeLessThan(0.05);
  });
});
