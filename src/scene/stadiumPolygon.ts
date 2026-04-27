import { Cartesian3 } from 'cesium';

/**
 * Build the Cesium polygon vertices for an "extended-source" MMI
 * contour around an earthquake rupture.
 *
 * The shape is a **rounded rectangle** ("stadium" when the rupture
 * width collapses to zero): the surface projection of the rupture
 * rectangle (L along strike × W across strike) inflated by the
 * Joyner-Boore distance r_jb at which the chosen MMI level is
 * reached. This is the geometrically correct contour for an extended
 * line/area seismic source — replacing the point-source disk that
 * the simulator used pre-Phase 13b for big events.
 *
 * The contract this helper fulfils is `mmi{7,8,9}Stadium` in
 * {@link ../scene/visualContracts.ts}.
 *
 * Why this matters visually: a Mw 9 megathrust ruptures a
 * 500 × 200 km patch. A 110 km MMI VII contour sits closer to that
 * rectangle than the rectangle is wide, so the stadium has
 * dramatically different aspect ratio than the point-source circle
 * the renderer used to draw — and the user can finally read the
 * rupture orientation directly from the shaking footprint instead of
 * a misleading concentric disk.
 *
 * Inputs use SI metres and decimal degrees. Output is a closed loop
 * of {@link Cartesian3} vertices ready for `polygon.hierarchy`.
 *
 * Geometry uses the spherical-Earth great-circle projection
 * (R = 6 371 008 m, IUGG mean radius). For ruptures up to ~1 500 km
 * the WGS-84 / sphere mismatch on the polygon vertex positions is
 * < 0.3 % — well below the rendering precision and the inherent
 * scatter in W&C 1994 itself (~0.23 log-units).
 */

const EARTH_MEAN_RADIUS_M = 6_371_008;

/** Convert a (lat, lon, azimuth, distance) move on the sphere into a
 *  destination (lat, lon). Inputs in degrees, output in degrees.
 *  Standard great-circle "direct" formula (Vincenty 1975 Eq. 1 in
 *  the spherical limit). */
function projectAlongAzimuth(
  lat0Deg: number,
  lon0Deg: number,
  azimuthRadFromN: number,
  distM: number
): { latDeg: number; lonDeg: number } {
  const lat0 = (lat0Deg * Math.PI) / 180;
  const lon0 = (lon0Deg * Math.PI) / 180;
  const angDist = distM / EARTH_MEAN_RADIUS_M;

  const sinLat =
    Math.sin(lat0) * Math.cos(angDist) +
    Math.cos(lat0) * Math.sin(angDist) * Math.cos(azimuthRadFromN);
  const lat = Math.asin(sinLat);
  const lon =
    lon0 +
    Math.atan2(
      Math.sin(azimuthRadFromN) * Math.sin(angDist) * Math.cos(lat0),
      Math.cos(angDist) - Math.sin(lat0) * sinLat
    );
  return { latDeg: (lat * 180) / Math.PI, lonDeg: (lon * 180) / Math.PI };
}

export interface RuptureStadiumInput {
  centerLatDeg: number;
  centerLonDeg: number;
  /** Strike azimuth in degrees clockwise from geographic North. */
  strikeAzimuthDeg: number;
  /** Half-rupture-length L/2 along strike (m). */
  halfLengthAlongStrikeM: number;
  /** Half-rupture-width W/2 across strike (m), measured on the surface
   *  projection. Pass 0 for a 1D line source — the polygon collapses
   *  to a true stadium (capsule) shape. */
  halfWidthAcrossStrikeM: number;
  /** Inflation radius — the Joyner-Boore distance at which the chosen
   *  MMI level is reached (m). The polygon hugs this contour around
   *  the rupture rectangle. */
  contourRadiusM: number;
  /** Number of polygon vertices PER 90° corner cap. Total vertex count
   *  is 4 × cornerSegments. Defaults to 16 (~6° per segment): smooth
   *  enough that the cap reads as circular at a megathrust's angular
   *  scale, light enough that 5+ rendered MMI bands stay under
   *  ~250 vertices total. */
  cornerSegments?: number;
}

/**
 * Build a closed-loop polygon (rounded rectangle / stadium) around a
 * rupture rectangle. The first and last vertices intentionally
 * coincide so that downstream renderers that expect a closed
 * polyline (the Cesium polygon `hierarchy` API tolerates an open
 * loop, but we return the closed form for portability).
 */
export function buildRuptureStadiumPolygon(input: RuptureStadiumInput): Cartesian3[] {
  const cornerSegments = Math.max(4, input.cornerSegments ?? 16);
  const a = Math.max(0, input.halfLengthAlongStrikeM);
  const b = Math.max(0, input.halfWidthAcrossStrikeM);
  const r = Math.max(0, input.contourRadiusM);
  const θ = (input.strikeAzimuthDeg * Math.PI) / 180;

  // Corners of the rupture rectangle in the local strike frame
  // (xL = along strike, yL = across strike, +yL to the right of
  //  the strike direction). Order them so that walking corners in
  // sequence (TR, TL, BL, BR) traces the perimeter counter-clockwise
  // when viewed from above the local frame.
  const corners: { xL: number; yL: number; baseAngle: number }[] = [
    { xL: a, yL: b, baseAngle: 0 }, // top-right (front-right of rupture)
    { xL: -a, yL: b, baseAngle: Math.PI / 2 }, // top-left (back-right)
    { xL: -a, yL: -b, baseAngle: Math.PI }, // bottom-left (back-left)
    { xL: a, yL: -b, baseAngle: -Math.PI / 2 }, // bottom-right (front-left)
  ];

  const ring: Cartesian3[] = [];
  for (const corner of corners) {
    // Quarter-circle cap at this corner. The cap sweeps a 90° arc
    // outward; `baseAngle` is the local-frame direction of the OUTSIDE
    // perpendicular at the START of this corner's quarter (so the
    // cap goes from `baseAngle` to `baseAngle + π/2`).
    for (let s = 0; s <= cornerSegments; s += 1) {
      const t = s / cornerSegments; // 0 → 1
      const localAngle = corner.baseAngle + (t * Math.PI) / 2;
      // Local-frame offset: corner position + r * (cosθ, sinθ).
      // Because the local angle is measured from the +xL axis, the
      // x-component is `cos(localAngle)` and the y-component is
      // `sin(localAngle)`. A localAngle of 0 → +xL direction (front),
      // π/2 → +yL direction (right), and so on.
      const xLocal = corner.xL + r * Math.cos(localAngle);
      const yLocal = corner.yL + r * Math.sin(localAngle);
      // Convert local (xL, yL) to (azimuth-from-N, distance-from-center).
      const dist = Math.hypot(xLocal, yLocal);
      if (dist === 0) {
        ring.push(Cartesian3.fromDegrees(input.centerLonDeg, input.centerLatDeg));
        continue;
      }
      // azimuth-from-strike = atan2(yL, xL); azimuth-from-N = θ + that.
      const azFromN = θ + Math.atan2(yLocal, xLocal);
      const proj = projectAlongAzimuth(input.centerLatDeg, input.centerLonDeg, azFromN, dist);
      ring.push(Cartesian3.fromDegrees(proj.lonDeg, proj.latDeg));
    }
  }
  // Close the ring explicitly — first vertex repeated at the end.
  if (ring.length > 0) {
    const first = ring[0];
    if (first !== undefined) ring.push(first);
  }
  return ring;
}

/**
 * Slim companion that returns the polygon vertices in (lat, lon)
 * pairs instead of {@link Cartesian3}. Used by tests and by any
 * non-Cesium consumer (e.g. the GeoJSON export path).
 */
export function buildRuptureStadiumLatLon(
  input: RuptureStadiumInput
): { latDeg: number; lonDeg: number }[] {
  const cornerSegments = Math.max(4, input.cornerSegments ?? 16);
  const a = Math.max(0, input.halfLengthAlongStrikeM);
  const b = Math.max(0, input.halfWidthAcrossStrikeM);
  const r = Math.max(0, input.contourRadiusM);
  const θ = (input.strikeAzimuthDeg * Math.PI) / 180;
  const corners = [
    { xL: a, yL: b, baseAngle: 0 },
    { xL: -a, yL: b, baseAngle: Math.PI / 2 },
    { xL: -a, yL: -b, baseAngle: Math.PI },
    { xL: a, yL: -b, baseAngle: -Math.PI / 2 },
  ];
  const out: { latDeg: number; lonDeg: number }[] = [];
  for (const corner of corners) {
    for (let s = 0; s <= cornerSegments; s += 1) {
      const t = s / cornerSegments;
      const localAngle = corner.baseAngle + (t * Math.PI) / 2;
      const xLocal = corner.xL + r * Math.cos(localAngle);
      const yLocal = corner.yL + r * Math.sin(localAngle);
      const dist = Math.hypot(xLocal, yLocal);
      if (dist === 0) {
        out.push({ latDeg: input.centerLatDeg, lonDeg: input.centerLonDeg });
        continue;
      }
      const azFromN = θ + Math.atan2(yLocal, xLocal);
      out.push(projectAlongAzimuth(input.centerLatDeg, input.centerLonDeg, azFromN, dist));
    }
  }
  if (out.length > 0) {
    const first = out[0];
    if (first !== undefined) out.push(first);
  }
  return out;
}
