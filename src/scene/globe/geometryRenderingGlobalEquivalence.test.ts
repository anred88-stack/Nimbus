/**
 * Global geometry → rendering equivalence.
 *
 * Sister suite to `geometryRenderingEquivalence.test.ts`. The first
 * suite covers the well-behaved core cases (mid-latitude, wide
 * footprint near equator, antimeridian-adjacent). This one extends
 * coverage to the *globally extreme* cases that the renderer must
 * still handle without distorting geography:
 *
 *   - antimeridian-CROSSING with the GeoJSON-mandated split (RFC 7946
 *     §3.1.9): the bbox flag is the first signal; downstream layers
 *     consume `splitBboxAtAntimeridian` to produce the two halves.
 *   - pole-adjacent footprints (lat→±90°): the lat-extent is clamped,
 *     and consumers must treat the footprint as a polar cap, not a
 *     rectangle. `polarClamp()` reports the affected pole.
 *   - high-latitude wide footprint: combined lat stretching + close
 *     proximity to a pole (e.g. r=500 km at lat=85° N).
 *   - rupture stadium centred on the antimeridian: proves the
 *     polygon path is treated coherently with the circle path.
 *   - degenerate input (lat exactly ±90°): renderer must still
 *     produce a sensible bbox (cap at the pole) without NaNs.
 *
 * What we deliberately do NOT do here:
 *   - render to a canvas — this stays a pure structural check;
 *   - introduce a separate normalizer/formatter — splitting and clamp
 *     detection live in `geometryDebug.ts` so the renderer reads them
 *     without re-implementation.
 *
 * Closes Phase 3 of the final-hardening batch (global geometry).
 */

import { describe, expect, it } from 'vitest';
import {
  buildDamageRingsPayload,
  circleBbox,
  polarClamp,
  polygonBbox,
  splitBboxAtAntimeridian,
} from './geometryDebug.js';
import { buildRuptureStadiumLatLon } from '../stadiumPolygon.js';

describe('Antimeridian split (RFC 7946 §3.1.9)', () => {
  it('non-crossing bbox is returned unchanged in a single-element array', () => {
    const bbox = circleBbox(0, 0, 100_000); // small circle at equator
    expect(bbox.crossesAntimeridian).toBe(false);
    const parts = splitBboxAtAntimeridian(bbox);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toBe(bbox);
  });

  it('eastern overflow (maxLon > 180) splits into [minLon, 180] ∪ [-180, maxLon-360]', () => {
    // A 500 km circle at lon=178° at the equator overflows east.
    const bbox = circleBbox(0, 178, 500_000);
    expect(bbox.crossesAntimeridian).toBe(true);
    expect(bbox.maxLon).toBeGreaterThan(180);
    const parts = splitBboxAtAntimeridian(bbox);
    expect(parts).toHaveLength(2);
    const [east, west] = parts;
    if (!east || !west) throw new Error('split failed');
    // East part is anchored at the original minLon and capped at 180.
    expect(east.minLon).toBeCloseTo(bbox.minLon, 12);
    expect(east.maxLon).toBe(180);
    // West part is anchored at -180 and ends at (maxLon - 360).
    expect(west.minLon).toBe(-180);
    expect(west.maxLon).toBeCloseTo(bbox.maxLon - 360, 12);
    // Both halves carry the same lat extent.
    expect(east.minLat).toBeCloseTo(bbox.minLat, 12);
    expect(east.maxLat).toBeCloseTo(bbox.maxLat, 12);
    expect(west.minLat).toBeCloseTo(bbox.minLat, 12);
    expect(west.maxLat).toBeCloseTo(bbox.maxLat, 12);
    // Neither half should report itself as antimeridian-crossing — they
    // are the GeoJSON-compliant pieces.
    expect(east.crossesAntimeridian).toBe(false);
    expect(west.crossesAntimeridian).toBe(false);
  });

  it('western overflow (minLon < -180) splits symmetrically', () => {
    const bbox = circleBbox(0, -178, 500_000);
    expect(bbox.crossesAntimeridian).toBe(true);
    expect(bbox.minLon).toBeLessThan(-180);
    const parts = splitBboxAtAntimeridian(bbox);
    expect(parts).toHaveLength(2);
    const [west, east] = parts;
    if (!west || !east) throw new Error('split failed');
    // West part starts at -180 and ends at the original (negative) maxLon.
    expect(west.minLon).toBe(-180);
    expect(west.maxLon).toBeCloseTo(bbox.maxLon, 12);
    // East part wraps the underflow into [+ε, 180].
    expect(east.minLon).toBeCloseTo(bbox.minLon + 360, 12);
    expect(east.maxLon).toBe(180);
    expect(west.crossesAntimeridian).toBe(false);
    expect(east.crossesAntimeridian).toBe(false);
  });

  it('split halves cover the same lon-extent (mod 360) as the original bbox', () => {
    const bbox = circleBbox(20, 179, 800_000); // overflows east at mid-lat
    const parts = splitBboxAtAntimeridian(bbox);
    if (parts.length !== 2) throw new Error('expected 2 parts');
    const [a, b] = parts;
    if (!a || !b) throw new Error('split failed');
    const widthA = a.maxLon - a.minLon;
    const widthB = b.maxLon - b.minLon;
    const widthOriginal = bbox.maxLon - bbox.minLon;
    expect(widthA + widthB).toBeCloseTo(widthOriginal, 9);
  });

  it('damage-rings payload at lon=180° produces split-eligible halves', () => {
    // Damage rings exactly on the dateline: every ring crosses, and
    // the split-bbox helper produces two halves per ring.
    const payload = buildDamageRingsPayload(0, 180, {
      r1: 200_000,
      r2: 500_000,
    });
    expect(payload.featureCount).toBe(2);
    expect(payload.outerBbox.crossesAntimeridian).toBe(true);
    for (const r of payload.rings) {
      expect(r.bbox.crossesAntimeridian).toBe(true);
      const halves = splitBboxAtAntimeridian(r.bbox);
      expect(halves).toHaveLength(2);
      // Each half is a strip touching the dateline at one edge.
      const touching = halves.filter((h) => h.minLon === -180 || h.maxLon === 180);
      expect(touching).toHaveLength(2);
    }
  });
});

describe('Pole-adjacent footprints', () => {
  it('500 km circle at lat=88° N clamps maxLat to 90° → polarClamp reports "north"', () => {
    const bbox = circleBbox(88, 0, 500_000);
    // dLat for 500 km ≈ 4.5°, so maxLat would be 92.5° pre-clamp;
    // circleBbox clamps it.
    expect(bbox.maxLat).toBe(90);
    expect(polarClamp(bbox, 88, 500_000)).toBe('north');
  });

  it('500 km circle at lat=-88° clamps minLat to -90° → polarClamp reports "south"', () => {
    const bbox = circleBbox(-88, 0, 500_000);
    expect(bbox.minLat).toBe(-90);
    expect(polarClamp(bbox, -88, 500_000)).toBe('south');
  });

  it('mid-latitude footprint reports "none" (no polar clamp)', () => {
    const bbox = circleBbox(40, 0, 500_000);
    expect(bbox.minLat).toBeGreaterThan(-90);
    expect(bbox.maxLat).toBeLessThan(90);
    expect(polarClamp(bbox, 40, 500_000)).toBe('none');
  });

  it('damage-rings payload around 89° N: outer bbox clamps to lat=90°, no antimeridian flag', () => {
    const payload = buildDamageRingsPayload(89, 0, {
      r1: 100_000,
      r2: 300_000,
    });
    // Both rings reach the pole.
    expect(payload.outerBbox.maxLat).toBe(90);
    // Antimeridian flag tracks lon, not lat — pole proximity does not
    // automatically trigger the antimeridian split.
    expect(payload.outerBbox.crossesAntimeridian).toBe(false);
  });

  it('degenerate centre at lat=90° still produces a sensible (clamped) bbox without NaN', () => {
    const bbox = circleBbox(90, 0, 100_000);
    expect(Number.isFinite(bbox.minLat)).toBe(true);
    expect(Number.isFinite(bbox.maxLat)).toBe(true);
    expect(Number.isFinite(bbox.minLon)).toBe(true);
    expect(Number.isFinite(bbox.maxLon)).toBe(true);
    expect(bbox.maxLat).toBe(90);
    // dLon at lat=90° is huge (cosPhi → 0). Our circleBbox uses
    // cosPhi = max(cos(lat), 1e-6) so dLon is finite but extremely
    // large (~9×10^7). Renderers should treat polar caps specially;
    // polarClamp signals the condition.
    expect(polarClamp(bbox, 90, 100_000)).toBe('north');
  });
});

describe('Wide footprint at high latitude (combined regime)', () => {
  it('500 km circle at lat=87° both stretches lon AND clamps lat', () => {
    // r=500 km → dLat ≈ 4.5°. At lat=87° → 87+4.5=91.5° (clamped to 90°).
    // (At lat=85° the same radius would land at 89.5° — no clamp; the
    // intent of this test is the *combined* regime so we stay above
    // the threshold.)
    const bbox = circleBbox(87, 0, 500_000);
    const dLat = bbox.maxLat - bbox.minLat;
    const dLon = bbox.maxLon - bbox.minLon;
    expect(bbox.maxLat).toBe(90);
    // dLon stretches by 1/cos(87°) ≈ 19×, making the bbox far wider
    // in lon than in lat.
    expect(dLon).toBeGreaterThan(dLat);
    expect(polarClamp(bbox, 87, 500_000)).toBe('north');
  });
});

describe('Rupture stadium polygon — antimeridian regimes', () => {
  it('stadium centred on the dateline produces a bbox flagged as crossing', () => {
    const ring = buildRuptureStadiumLatLon({
      centerLatDeg: 0,
      centerLonDeg: 180,
      strikeAzimuthDeg: 90, // strike east-west → spans lon
      halfLengthAlongStrikeM: 200_000,
      halfWidthAcrossStrikeM: 50_000,
      contourRadiusM: 50_000,
      cornerSegments: 32,
    });
    const bbox = polygonBbox(ring);
    // The stadium polygon's vertices may use lon > 180 OR < -180 (it
    // is the consumer's job to wrap). Either way, the bbox must
    // detect the crossing.
    expect(bbox.crossesAntimeridian).toBe(true);
    // The split helper produces two non-crossing halves.
    const halves = splitBboxAtAntimeridian(bbox);
    expect(halves).toHaveLength(2);
    for (const h of halves) {
      expect(h.crossesAntimeridian).toBe(false);
      expect(h.minLon).toBeGreaterThanOrEqual(-180);
      expect(h.maxLon).toBeLessThanOrEqual(180);
    }
  });

  it('stadium far from the dateline is unaffected (no false-positive crossing)', () => {
    const ring = buildRuptureStadiumLatLon({
      centerLatDeg: 35,
      centerLonDeg: 0,
      strikeAzimuthDeg: 0,
      halfLengthAlongStrikeM: 100_000,
      halfWidthAcrossStrikeM: 30_000,
      contourRadiusM: 30_000,
      cornerSegments: 32,
    });
    const bbox = polygonBbox(ring);
    expect(bbox.crossesAntimeridian).toBe(false);
    expect(splitBboxAtAntimeridian(bbox)).toHaveLength(1);
  });
});

describe('Symmetry: northern + southern hemisphere mirror', () => {
  it('500 km circle at lat=±60° has equal lon-stretch (cosine is even)', () => {
    const north = circleBbox(60, 0, 500_000);
    const south = circleBbox(-60, 0, 500_000);
    const dLonN = north.maxLon - north.minLon;
    const dLonS = south.maxLon - south.minLon;
    expect(dLonN).toBeCloseTo(dLonS, 9);
    // Lat extent symmetric.
    expect(north.maxLat - north.minLat).toBeCloseTo(south.maxLat - south.minLat, 9);
  });

  it('500 km circle at lat=±88° clamps the same way (one to +90, one to -90)', () => {
    const north = circleBbox(88, 0, 500_000);
    const south = circleBbox(-88, 0, 500_000);
    expect(north.maxLat).toBe(90);
    expect(south.minLat).toBe(-90);
    expect(polarClamp(north, 88, 500_000)).toBe('north');
    expect(polarClamp(south, -88, 500_000)).toBe('south');
  });
});
