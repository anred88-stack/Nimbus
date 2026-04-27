import type { Meters } from '../../units.js';
import { m } from '../../units.js';

/**
 * Electromagnetic-pulse (EMP) estimator for nuclear bursts.
 *
 * References:
 *   Glasstone & Dolan (1977), "The Effects of Nuclear Weapons"
 *    (3rd ed.), §11 — "EMP and its effects".
 *   IEC 61000-2-9, "Electromagnetic compatibility (EMC) — Part 2-9:
 *    Environment — Description of HEMP environment — Radiated
 *    disturbance." (1996) defines the canonical double-exponential
 *    waveform with peak 50 kV/m for a 1 Mt-class reference event.
 *   Longmire, C. L. (1978). "On the electromagnetic pulse produced
 *    by nuclear explosions." IEEE Transactions on Antennas and
 *    Propagation AP-26 (1): 3–13.
 *
 * The physics is dominated by Compton-scattered electrons driven out
 * of the fireball by the initial gamma burst. For high-altitude
 * (> 30 km) bursts the resulting current sheet radiates the canonical
 * E1 HEMP pulse; the ground footprint is the tangent-line geometry
 * from the burst point to Earth's horizon. Peak field scales with
 * the cube root of yield (Longmire 1978, Fig. 3 — gamma production
 * roughly tracks W, but the Compton deflection geometry softens the
 * field-vs-yield dependence to ≈ W^(1/3) in the saturated regime).
 * Anchor: 50 kV/m at 1 Mt reference (IEC 61000-2-9).
 *
 * For low-altitude bursts most of the gammas are absorbed close to
 * the source, so the ground EMP is a local ~0.1·√(W/kt) kV/m field.
 *
 * The implementation below returns headline values only — peak field
 * and an affected-ground-footprint radius — at order-of-magnitude
 * accuracy suitable for educational display.
 */

export type EmpRegime = 'NEGLIGIBLE' | 'SOURCE_REGION' | 'HEMP_HIGH_ALTITUDE';

export interface EmpResult {
  regime: EmpRegime;
  /** Peak electric field at ground zero (V/m). */
  peakField: number;
  /** Ground-range radius at which the field exceeds 1 kV/m — the
   *  rough damage threshold for unshielded modern electronics. */
  affectedRadius: Meters;
}

const EARTH_RADIUS_M = 6_371_000;
const HEMP_ALTITUDE_THRESHOLD = 30_000; // 30 km
/** IEC 61000-2-9 canonical peak for a reference 1 Mt HEMP. */
const HEMP_PEAK_FIELD_REFERENCE = 50_000; // 50 kV/m @ 1 Mt
/** Reference yield anchor for {@link HEMP_PEAK_FIELD_REFERENCE} (kilotonnes). */
const HEMP_REFERENCE_YIELD_KT = 1_000;
const HEMP_DAMAGE_THRESHOLD = 1_000; // 1 kV/m

export function electromagneticPulse(
  yieldMegatons: number,
  heightOfBurstMeters: number
): EmpResult {
  const W = Math.max(yieldMegatons * 1_000, 0); // kt
  const hob = Math.max(heightOfBurstMeters, 0);

  if (!Number.isFinite(W) || W === 0) {
    return { regime: 'NEGLIGIBLE', peakField: 0, affectedRadius: m(0) };
  }

  if (hob < 1_000) {
    // Low-altitude burst: EMP is absorbed quickly. Negligible
    // ground-level field beyond a few km.
    return { regime: 'NEGLIGIBLE', peakField: 0, affectedRadius: m(0) };
  }

  if (hob < HEMP_ALTITUDE_THRESHOLD) {
    // Source-region regime — local E-field scales as √W / r, peak
    // within a few km of the burst. Roughly 100 V/m per √kt at 1 km.
    const peak = 100 * Math.sqrt(W);
    // Affected radius: solve peak · (1 km / r) = HEMP_DAMAGE_THRESHOLD
    // → r = peak / threshold · 1 000 (m). Saturated at 50 km.
    const r = Math.min((peak / HEMP_DAMAGE_THRESHOLD) * 1_000, 50_000);
    return { regime: 'SOURCE_REGION', peakField: peak, affectedRadius: m(r) };
  }

  // High-altitude exo-atmospheric regime: HEMP. Peak field scales
  // with the cube root of yield below the saturation plateau — the
  // Compton-current source region saturates at yields above ~1 Mt
  // because the gamma-photon flux at the ionising layer is already
  // intense enough to fully ionise every available air molecule.
  // Above that anchor the IEC 61000-2-9 50 kV/m value caps the
  // radiated peak; below it the field drops as W^(1/3) (Longmire
  // 1978, Fig. 3). A 10 kt exoatmospheric burst therefore radiates
  // ~10× weaker than Starfish Prime's 1.4 Mt.
  const tangent = Math.sqrt(2 * EARTH_RADIUS_M * hob + hob * hob);
  const unsaturated = HEMP_PEAK_FIELD_REFERENCE * Math.cbrt(W / HEMP_REFERENCE_YIELD_KT);
  const peakField = Math.min(HEMP_PEAK_FIELD_REFERENCE, unsaturated);
  return {
    regime: 'HEMP_HIGH_ALTITUDE',
    peakField,
    affectedRadius: m(tangent),
  };
}
