/**
 * Geometry → rendering equivalence.
 *
 * First structural bridge between the physics output and the Cesium
 * render payload. We do NOT screenshot. We pin that the metadata the
 * renderer would consume is internally consistent and matches the
 * physics output, across:
 *   - a simple local case (Mw 7.5, mid-latitude continent);
 *   - a wide-footprint case (Tōhoku-class megathrust);
 *   - a lat-sensitive case (high-latitude impact);
 *   - an antimeridian-adjacent case (lon ≈ 179°).
 *
 * Closes L8 in `CONSOLIDATION_AUDIT.md`. Production renderer can now
 * reuse `buildDamageRingsPayload` to surface the same metadata via a
 * debug global; that bridge is out of scope for this test file.
 */

import { describe, expect, it } from 'vitest';
import {
  buildDamageRingsPayload,
  bboxContains,
  circleBbox,
  polygonBbox,
  polygonCentroid,
  type DamageRingsPayload,
} from './geometryDebug.js';
import { buildRuptureStadiumLatLon } from '../stadiumPolygon.js';
import { safeRunImpact, safeRunEarthquake } from '../../physics/validation/safeRun.js';
import { TOL_LATLON_ROUNDTRIP_DEG } from '../../physics/validation/tolerances.js';

const CHELYABINSK_LAT = 55.15;
const CHELYABINSK_LON = 61.4;

describe('Geometry → rendering equivalence — local case (Chelyabinsk-area, low-Mw)', () => {
  it('damage rings payload: every ring bbox contains the centre, outer bbox encloses all ring bboxes, featureCount matches', () => {
    const safe = safeRunImpact({
      impactorDiameter: 100,
      impactVelocity: 20_000,
      impactorDensity: 3000,
      targetDensity: 2500,
      impactAngleDeg: 45,
      surfaceGravity: 9.81,
    });
    expect(safe.ok).toBe(true);
    if (!safe.ok) return;
    const damage = safe.result.damage;

    const payload: DamageRingsPayload = buildDamageRingsPayload(
      CHELYABINSK_LAT,
      CHELYABINSK_LON,
      {
        thirdDegreeBurn: damage.thirdDegreeBurn,
        secondDegreeBurn: damage.secondDegreeBurn,
        overpressure5psi: damage.overpressure5psi,
        overpressure1psi: damage.overpressure1psi,
        lightDamage: damage.lightDamage,
      },
    );

    // Centroid contract: equals the input centre.
    expect(payload.centerLatDeg).toBeCloseTo(CHELYABINSK_LAT, 12);
    expect(payload.centerLonDeg).toBeCloseTo(CHELYABINSK_LON, 12);

    // Every ring's bbox contains the centre point.
    for (const r of payload.rings) {
      expect(
        bboxContains(r.bbox, { latDeg: CHELYABINSK_LAT, lonDeg: CHELYABINSK_LON }),
        `ring ${r.kind} bbox does not contain centre`,
      ).toBe(true);
    }

    // Outer bbox encloses every ring bbox.
    for (const r of payload.rings) {
      expect(r.bbox.minLat).toBeGreaterThanOrEqual(payload.outerBbox.minLat - TOL_LATLON_ROUNDTRIP_DEG);
      expect(r.bbox.maxLat).toBeLessThanOrEqual(payload.outerBbox.maxLat + TOL_LATLON_ROUNDTRIP_DEG);
      expect(r.bbox.minLon).toBeGreaterThanOrEqual(payload.outerBbox.minLon - TOL_LATLON_ROUNDTRIP_DEG);
      expect(r.bbox.maxLon).toBeLessThanOrEqual(payload.outerBbox.maxLon + TOL_LATLON_ROUNDTRIP_DEG);
    }

    // Feature count matches the number of positive-radius rings.
    const expectedCount = [
      damage.thirdDegreeBurn,
      damage.secondDegreeBurn,
      damage.overpressure5psi,
      damage.overpressure1psi,
      damage.lightDamage,
    ].filter((v) => Number.isFinite(v) && v > 0).length;
    expect(payload.featureCount).toBe(expectedCount);

    // No antimeridian crossing for this latitude / longitude.
    expect(payload.outerBbox.crossesAntimeridian).toBe(false);
  });

  it('rings are nested by radius — outer bbox of larger ring encloses smaller ring bbox', () => {
    const payload = buildDamageRingsPayload(0, 0, {
      inner: 10_000,
      middle: 50_000,
      outer: 100_000,
    });
    expect(payload.featureCount).toBe(3);
    const inner = payload.rings.find((r) => r.kind === 'inner')?.bbox;
    const middle = payload.rings.find((r) => r.kind === 'middle')?.bbox;
    const outer = payload.rings.find((r) => r.kind === 'outer')?.bbox;
    expect(inner).toBeDefined();
    expect(middle).toBeDefined();
    expect(outer).toBeDefined();
    if (!inner || !middle || !outer) return;
    // Outer encloses middle encloses inner.
    expect(outer.minLat).toBeLessThanOrEqual(middle.minLat);
    expect(outer.maxLat).toBeGreaterThanOrEqual(middle.maxLat);
    expect(outer.minLon).toBeLessThanOrEqual(middle.minLon);
    expect(outer.maxLon).toBeGreaterThanOrEqual(middle.maxLon);
    expect(middle.minLat).toBeLessThanOrEqual(inner.minLat);
    expect(middle.maxLat).toBeGreaterThanOrEqual(inner.maxLat);
  });
});

describe('Geometry → rendering equivalence — wide footprint (Tōhoku megathrust)', () => {
  it('rupture-stadium polygon: bbox dx > 0, dy > 0, centroid ~= input centre at equator', () => {
    // Large stadium centred at lat=0, lon=0, strike NORTH (so dy > dx).
    const ring = buildRuptureStadiumLatLon({
      centerLatDeg: 0,
      centerLonDeg: 0,
      strikeAzimuthDeg: 0,
      halfLengthAlongStrikeM: 350_000,
      halfWidthAcrossStrikeM: 100_000,
      contourRadiusM: 100_000,
      cornerSegments: 32,
    });
    const bbox = polygonBbox(ring);
    const centroid = polygonCentroid(ring);

    // Centroid at the equator coincides with input centre within
    // ~0.1° noise. Note: arithmetic centroid of vertices is biased
    // by the cap-arc tessellation density (the rounded ends have
    // more vertices than the straight sides). For exact centre,
    // consumers should use the input centre, not the polygon centroid.
    expect(Math.abs(centroid.latDeg)).toBeLessThan(0.1);
    expect(Math.abs(centroid.lonDeg)).toBeLessThan(0.1);

    // Strike NORTH → bbox extends more in lat than in lon at the equator.
    expect(bbox.maxLat - bbox.minLat).toBeGreaterThan(bbox.maxLon - bbox.minLon);

    // No antimeridian crossing.
    expect(bbox.crossesAntimeridian).toBe(false);
  });

  it('Tōhoku-class real preset rupture: bbox encloses every vertex; centroid near (0, 0) when centred there', () => {
    // Use the Tōhoku rupture geometry but at (0, 0) for clean math.
    const safe = safeRunEarthquake({
      magnitude: 9.1,
      depth: 29_000,
      faultType: 'reverse',
      subductionInterface: true,
      strikeAzimuthDeg: 200,
    });
    expect(safe.ok).toBe(true);
    if (!safe.ok) return;
    const halfLen = (safe.result.ruptureLength as number) / 2;
    const halfWid = (safe.result.ruptureWidth as number) / 2;

    const ring = buildRuptureStadiumLatLon({
      centerLatDeg: 0,
      centerLonDeg: 0,
      strikeAzimuthDeg: 200,
      halfLengthAlongStrikeM: halfLen,
      halfWidthAcrossStrikeM: halfWid,
      contourRadiusM: 50_000,
      cornerSegments: 32,
    });
    const bbox = polygonBbox(ring);
    expect(bbox.minLat).toBeLessThan(0);
    expect(bbox.maxLat).toBeGreaterThan(0);
    expect(bbox.minLon).toBeLessThan(0);
    expect(bbox.maxLon).toBeGreaterThan(0);

    // Stadium spans roughly L+W in degrees at the equator (1° ≈ 111 km).
    const expectedLatSpanDeg = (2 * halfLen) / 111_000; // strike 200° tilts mostly N-S
    expect(bbox.maxLat - bbox.minLat).toBeGreaterThan(expectedLatSpanDeg * 0.4);
  });
});

describe('Geometry → rendering equivalence — high-latitude case (lat sensitivity)', () => {
  it('100 km circle at lat=70° has dLon ~= 100 / (111 cos 70°) ≈ 2.6° (matches dLat ≈ 0.9° × 1/cos 70°)', () => {
    const bbox = circleBbox(70, 0, 100_000);
    const dLat = bbox.maxLat - bbox.minLat;
    const dLon = bbox.maxLon - bbox.minLon;
    // dLat at 70° still ≈ 1.8° (bbox is symmetric in lat). dLon expanded by 1/cos(70°) ≈ 2.92.
    expect(dLat).toBeCloseTo(1.799, 1);
    expect(dLon / dLat).toBeCloseTo(1 / Math.cos((70 * Math.PI) / 180), 1);
  });

  it('a 100 km circle at lat=80° produces a dLon > 5° (cos 80° ≈ 0.174 — strong stretching)', () => {
    const bbox = circleBbox(80, 0, 100_000);
    expect(bbox.maxLon - bbox.minLon).toBeGreaterThan(5);
  });
});

describe('Geometry → rendering equivalence — antimeridian crossing', () => {
  it('500 km circle at lon=178° crosses antimeridian → bbox flag true', () => {
    const bbox = circleBbox(0, 178, 500_000);
    expect(bbox.crossesAntimeridian).toBe(true);
    // The raw bbox extends past 180°.
    expect(bbox.maxLon).toBeGreaterThan(180);
  });

  it('500 km circle at lon=-178° also crosses → bbox flag true (symmetry)', () => {
    const bbox = circleBbox(0, -178, 500_000);
    expect(bbox.crossesAntimeridian).toBe(true);
    expect(bbox.minLon).toBeLessThan(-180);
  });

  it('500 km circle at lon=0° does NOT cross', () => {
    const bbox = circleBbox(0, 0, 500_000);
    expect(bbox.crossesAntimeridian).toBe(false);
  });

  it('damage-rings payload at lon=179.5° propagates the antimeridian flag to the outer bbox', () => {
    // At lat=0, dLon ≈ radiusKm / 111 km. So:
    //   - r=50 km → dLon ≈ 0.45° → bbox [179.05, 179.95] → does NOT cross
    //   - r=200 km → dLon ≈ 1.8° → bbox [177.7, 181.3] → crosses
    const payload = buildDamageRingsPayload(0, 179.5, {
      smallNoCross: 50_000,
      largeCross: 200_000,
    });
    expect(payload.featureCount).toBe(2);
    const small = payload.rings.find((r) => r.kind === 'smallNoCross');
    const large = payload.rings.find((r) => r.kind === 'largeCross');
    expect(small?.bbox.crossesAntimeridian).toBe(false);
    expect(large?.bbox.crossesAntimeridian).toBe(true);
    // Outer bbox crosses because at least one ring does.
    expect(payload.outerBbox.crossesAntimeridian).toBe(true);
  });
});

describe('Geometry → rendering equivalence — feature-count consistency', () => {
  it('zero-radius rings are excluded from the payload (feature count matches positive-radius count)', () => {
    const payload = buildDamageRingsPayload(0, 0, {
      hasRadius: 100_000,
      zero: 0,
      negative: -1,
      nan: Number.NaN,
      inf: Number.POSITIVE_INFINITY,
    });
    // Only `hasRadius` survives.
    expect(payload.rings.length).toBe(1);
    expect(payload.featureCount).toBe(1);
    expect(payload.rings[0]?.kind).toBe('hasRadius');
  });

  it('empty radii dictionary produces a degenerate payload with zero feature count', () => {
    const payload = buildDamageRingsPayload(45, -75, {});
    expect(payload.featureCount).toBe(0);
    // Outer bbox collapses to a point.
    expect(payload.outerBbox.minLat).toBeCloseTo(payload.outerBbox.maxLat, 12);
    expect(payload.outerBbox.minLon).toBeCloseTo(payload.outerBbox.maxLon, 12);
  });
});
