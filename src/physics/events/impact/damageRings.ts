import { peakOverpressure } from '../explosion/overpressure.js';
import { secondDegreeBurnRadius, thirdDegreeBurnRadius } from '../explosion/thermal.js';
import type { Joules, Meters, Pascals } from '../../units.js';
import { m, Pa } from '../../units.js';

/**
 * Overpressure threshold: scattered window breakage and shop-front damage.
 * Source: Glasstone & Dolan (1977), Table 5.139 — 0.5 psi ≈ 3.45 kPa.
 */
export const OVERPRESSURE_LIGHT_DAMAGE = Pa(3_447);

/**
 * Overpressure threshold: window breakage and light injuries.
 * Source: Glasstone & Dolan (1977), §5.139 and Table 5.139 — 1 psi ≈ 6.9 kPa.
 */
export const OVERPRESSURE_WINDOW_BREAK = Pa(6_895);

/**
 * Overpressure threshold: residential-building collapse / heavy damage.
 * Source: Glasstone & Dolan (1977), §5.129 and Table 5.139 — 5 psi ≈ 34.5 kPa.
 */
export const OVERPRESSURE_BUILDING_COLLAPSE = Pa(34_474);

/**
 * Ground-range damage radii (metres from the detonation point) for the
 * 2D damage-zone rings drawn on top of the Cesium globe. Every radius
 * lives at the same abstraction level: "how far out does phenomenon X
 * persist?".
 *
 *   craterRim                — final crater rim-to-rim half-diameter.
 *   thirdDegreeBurn          — 8 cal/cm² thermal fluence.
 *   secondDegreeBurn         — 5 cal/cm² thermal fluence (full-thickness
 *                              dermal blistering, painful but typically
 *                              survivable). Always > thirdDegreeBurn.
 *   overpressure5psi         — 34.5 kPa, residential-building collapse.
 *   overpressure1psi         — 6.9 kPa, window breakage / light injury.
 *   lightDamage              — 3.45 kPa (0.5 psi), scattered windows /
 *                              shopfront damage. Always > overpressure1psi.
 *
 * All six are comparable (rings centred on the same lat/lon, ranked
 * outward by radius). Callers decide rendering — colours, labels,
 * translation keys — Layer 2 only provides the numbers.
 */
export interface ImpactDamageRadii {
  craterRim: Meters;
  thirdDegreeBurn: Meters;
  secondDegreeBurn: Meters;
  overpressure5psi: Meters;
  overpressure1psi: Meters;
  lightDamage: Meters;
}

/**
 * Compute the canonical four-ring damage footprint from the pre-computed
 * scenario outputs. The impact kinetic energy feeds the Kinney–Graham
 * surface-burst overpressure curve and the Glasstone point-source
 * thermal model directly, treating the impactor's mechanical energy as
 * a TNT-equivalent yield.
 *
 * This is a deliberately simple coupling: real impacts radiate a
 * different time-pulse than chemical/nuclear detonations and couple to
 * the ground with different efficiency, so the overpressure rings here
 * are an order-of-magnitude envelope rather than a rigorous prediction.
 */
export function impactDamageRadii(
  kineticEnergy: Joules,
  finalCraterDiameter: Meters
): ImpactDamageRadii {
  return {
    craterRim: m((finalCraterDiameter as number) / 2),
    thirdDegreeBurn: thirdDegreeBurnRadius({ yieldEnergy: kineticEnergy }),
    secondDegreeBurn: secondDegreeBurnRadius({ yieldEnergy: kineticEnergy }),
    overpressure5psi: distanceForOverpressure(kineticEnergy, OVERPRESSURE_BUILDING_COLLAPSE),
    overpressure1psi: distanceForOverpressure(kineticEnergy, OVERPRESSURE_WINDOW_BREAK),
    lightDamage: distanceForOverpressure(kineticEnergy, OVERPRESSURE_LIGHT_DAMAGE),
  };
}

/**
 * Invert the Kinney–Graham surface-burst overpressure curve by bisection:
 * return the ground range at which peak overpressure equals `target`.
 *
 * Bracket [1 m, 10⁸ m] covers every yield from small explosives to
 * dinosaur-killer impacts; 60 iterations give better than 10 cm
 * precision anywhere in that range. Monotonic decay of peakOverpressure
 * in R guarantees convergence.
 *
 * Edge handling — Phase 14:
 *
 *   - If `target` exceeds the overpressure at 1 m, the device would
 *     need a receiver inside the fireball. Throws (no physically
 *     meaningful answer).
 *   - If `target` is still BELOW the overpressure at 10⁸ m, the
 *     wavefront physically wraps the planet — every receiver is
 *     "within the threshold" because the air shock travels several
 *     times around the Earth before damping below `target`. We
 *     return the half-great-circle cap (~ 2.0 × 10⁷ m) so the
 *     simulator degrades gracefully on continent-scale impactors
 *     (e.g. a 100 km bolide) instead of throwing. The caller / UI
 *     reads "saturation at planetary scale" via the `isPlanetary`
 *     helper in src/physics/earthScale.ts; the visual contract for
 *     the ring renders an extra "saturated" badge.
 */
export function distanceForOverpressure(yieldEnergy: Joules, target: Pascals): Meters {
  const targetPa = target as number;
  let lo = 1;
  // Half-great-circle on Earth ≈ 20 015 km. The bisection uses this
  // as the upper bracket so a 100 km bolide saturates at planetary
  // scale instead of throwing on a search outside [1, 10⁸] m.
  const EARTH_HALF_GREAT_CIRCLE = Math.PI * 6_371_000;
  let hi = EARTH_HALF_GREAT_CIRCLE;

  const pLo = peakOverpressure({ distance: m(lo), yieldEnergy }) as number;
  const pHi = peakOverpressure({ distance: m(hi), yieldEnergy }) as number;
  if (pLo < targetPa) {
    throw new Error(
      `Target overpressure ${targetPa.toFixed(0)} Pa exceeds the value at ${lo.toFixed(0)} m (${pLo.toFixed(0)} Pa); yield too small for this threshold.`
    );
  }
  if (pHi > targetPa) {
    // Wavefront still above target at the half-great-circle cap.
    // Return the cap — the simulator's caller knows to flag this
    // as "planetary saturation".
    return m(EARTH_HALF_GREAT_CIRCLE);
  }

  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    const p = peakOverpressure({ distance: m(mid), yieldEnergy }) as number;
    if (p > targetPa) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return m(0.5 * (lo + hi));
}
