/**
 * Geometry-payload debug helpers.
 *
 * Pure, dependency-free functions that compute the structured
 * metadata the Cesium renderer would consume for damage-rings, rupture
 * stadiums, and circle overlays. Used exclusively by tests and
 * diagnostics — the production renderer can read these to expose
 * `lastRenderedGeometryDebug` on a debug global, but the helpers
 * themselves never import Cesium.
 *
 * Goal: make the contract "data → render payload" verifiable without
 * relying on screenshots. Pin invariants like:
 *   - bbox contains the centre point (with a tolerance for floats);
 *   - centroid of a polygon ring equals the centre passed in;
 *   - feature count matches the number of damage rings the simulator
 *     produced;
 *   - bbox dimensions align with strike orientation.
 *
 * Antimeridian: when a circle / polygon spans lon=180°, the bbox
 * carries `crossesAntimeridian: true`; consumers (Cesium, GeoJSON
 * export, etc.) must split per RFC 7946 §3.1.9.
 */

const EARTH_RADIUS_M = 6_371_008;

export interface LatLon {
  /** Latitude in degrees, [-90, 90]. */
  latDeg: number;
  /** Longitude in degrees. May exceed [-180, 180] when a polygon
   *  crosses the antimeridian — caller is responsible for wrapping
   *  before display. */
  lonDeg: number;
}

export interface GeometryBbox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  /** True when the bbox would wrap around lon=±180°. Consumers MUST
   *  split into two parts in this case. */
  crossesAntimeridian: boolean;
}

/** Bbox of a great-circle radius around a centre, on a spherical Earth. */
export function circleBbox(centerLat: number, centerLon: number, radiusM: number): GeometryBbox {
  const dLatDeg = ((radiusM / EARTH_RADIUS_M) * 180) / Math.PI;
  const cosPhi = Math.max(Math.cos((centerLat * Math.PI) / 180), 1e-6);
  const dLonDeg = ((radiusM / (EARTH_RADIUS_M * cosPhi)) * 180) / Math.PI;
  const minLat = Math.max(-90, centerLat - dLatDeg);
  const maxLat = Math.min(90, centerLat + dLatDeg);
  const minLon = centerLon - dLonDeg;
  const maxLon = centerLon + dLonDeg;
  const crossesAntimeridian = minLon < -180 || maxLon > 180;
  return { minLat, maxLat, minLon, maxLon, crossesAntimeridian };
}

/** Bbox of a polygon ring (lat/lon vertices). */
export function polygonBbox(ring: readonly LatLon[]): GeometryBbox {
  if (ring.length === 0) {
    return { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0, crossesAntimeridian: false };
  }
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const v of ring) {
    if (v.latDeg < minLat) minLat = v.latDeg;
    if (v.latDeg > maxLat) maxLat = v.latDeg;
    if (v.lonDeg < minLon) minLon = v.lonDeg;
    if (v.lonDeg > maxLon) maxLon = v.lonDeg;
  }
  const crossesAntimeridian = minLon < -180 || maxLon > 180;
  return { minLat, maxLat, minLon, maxLon, crossesAntimeridian };
}

/** Arithmetic centroid of a polygon ring. Best for compact rings; for
 *  long stadium polygons use the input centre instead. */
export function polygonCentroid(ring: readonly LatLon[]): LatLon {
  if (ring.length === 0) return { latDeg: 0, lonDeg: 0 };
  let sumLat = 0;
  let sumLon = 0;
  for (const v of ring) {
    sumLat += v.latDeg;
    sumLon += v.lonDeg;
  }
  return { latDeg: sumLat / ring.length, lonDeg: sumLon / ring.length };
}

/** True iff the bbox contains the lat/lon point (tolerance in degrees). */
export function bboxContains(bbox: GeometryBbox, point: LatLon, tolDeg = 1e-6): boolean {
  return (
    point.latDeg >= bbox.minLat - tolDeg &&
    point.latDeg <= bbox.maxLat + tolDeg &&
    point.lonDeg >= bbox.minLon - tolDeg &&
    point.lonDeg <= bbox.maxLon + tolDeg
  );
}

export interface DamageRing {
  /** Stable ID per ring (e.g. 'overpressure5psi', 'thirdDegreeBurn'). */
  kind: string;
  /** Geographic radius at the centre (m). */
  radiusM: number;
  /** Bbox derived from circleBbox(centerLat, centerLon, radiusM). */
  bbox: GeometryBbox;
}

/** Rendering-payload metadata that the Cesium overlay layer derives
 *  from a list of named radii at a centre point. The renderer reads
 *  exactly these fields; pinning them in tests is equivalent to
 *  pinning the geometry visible on the globe. */
export interface DamageRingsPayload {
  centerLatDeg: number;
  centerLonDeg: number;
  rings: DamageRing[];
  /** Outer bbox enclosing every ring's bbox (the layer's overall
   *  extent). */
  outerBbox: GeometryBbox;
  /** Number of rings with positive radius (skips zero-radius cases). */
  featureCount: number;
}

/** Build a damage-rings payload from a centre point and a name → radius map.
 *  Excludes rings with zero or non-finite radius. */
export function buildDamageRingsPayload(
  centerLat: number,
  centerLon: number,
  radii: Readonly<Record<string, number>>,
): DamageRingsPayload {
  const rings: DamageRing[] = [];
  let outerMinLat = Infinity, outerMaxLat = -Infinity, outerMinLon = Infinity, outerMaxLon = -Infinity;
  let outerCrosses = false;
  for (const [kind, r] of Object.entries(radii)) {
    if (!Number.isFinite(r) || r <= 0) continue;
    const bbox = circleBbox(centerLat, centerLon, r);
    rings.push({ kind, radiusM: r, bbox });
    if (bbox.minLat < outerMinLat) outerMinLat = bbox.minLat;
    if (bbox.maxLat > outerMaxLat) outerMaxLat = bbox.maxLat;
    if (bbox.minLon < outerMinLon) outerMinLon = bbox.minLon;
    if (bbox.maxLon > outerMaxLon) outerMaxLon = bbox.maxLon;
    outerCrosses = outerCrosses || bbox.crossesAntimeridian;
  }
  if (rings.length === 0) {
    return {
      centerLatDeg: centerLat,
      centerLonDeg: centerLon,
      rings: [],
      outerBbox: {
        minLat: centerLat,
        maxLat: centerLat,
        minLon: centerLon,
        maxLon: centerLon,
        crossesAntimeridian: false,
      },
      featureCount: 0,
    };
  }
  return {
    centerLatDeg: centerLat,
    centerLonDeg: centerLon,
    rings,
    outerBbox: {
      minLat: outerMinLat,
      maxLat: outerMaxLat,
      minLon: outerMinLon,
      maxLon: outerMaxLon,
      crossesAntimeridian: outerCrosses,
    },
    featureCount: rings.length,
  };
}
