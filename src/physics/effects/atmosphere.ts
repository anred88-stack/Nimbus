import type { Joules, Kilograms } from '../units.js';
import { kg } from '../units.js';

/**
 * Long-range atmospheric consequences of a large cosmic impact.
 * The formulas here are deliberately simple — linear energy-scaling
 * around benchmark published values for the Chicxulub event — so the
 * caller gets order-of-magnitude numbers without committing to any
 * single detailed atmospheric model.
 *
 * Chicxulub reference point (E ≈ 4 × 10²³ J):
 *   - stratospheric sub-µm dust injection ≈ 5 × 10¹⁶ kg
 *     (Toon et al. 1997, Table 3)
 *   - atmospheric-shock NOₓ production ≈ 1 × 10¹⁶ kg as HNO₃-equivalent
 *     (Prinn & Fegley 1987, globally integrated)
 *
 * These are linear extrapolations and should not be taken as a
 * climate-model substitute. Classification tiers below 10²² J
 * correspond to events where the formulas return effectively zero —
 * the UI treats them as "no climate-scale effect".
 */

/** Chicxulub kinetic-energy benchmark in joules. */
export const CHICXULUB_REFERENCE_ENERGY: Joules = 4e23 as Joules;

/** Stratospheric sub-micron dust mass injected by the Chicxulub
 *  impactor, per Toon et al. (1997) Table 3. */
export const CHICXULUB_STRATOSPHERIC_DUST: Kilograms = 5e16 as Kilograms;

/** Globally-integrated HNO₃-equivalent mass from Prinn & Fegley (1987)
 *  shock-heated atmosphere chemistry for Chicxulub. */
export const CHICXULUB_ACID_RAIN_MASS: Kilograms = 1e16 as Kilograms;

/**
 * Sub-micron dust mass lofted to the stratosphere, linearly scaled
 * against the Chicxulub benchmark. Real-world scaling is closer to
 * E^0.75 but the benchmark window spans only three decades on each
 * side so a linear fit is accurate to a factor of ~3.
 *
 * Reference:
 *   Toon, O. B., Zahnle, K., Morrison, D., Turco, R. P., &
 *   Covey, C. (1997). "Environmental perturbations caused by the
 *   impacts of asteroids and comets." Reviews of Geophysics 35 (1):
 *   41–78. DOI: 10.1029/96RG03038. See Table 3.
 */
export function stratosphericDustMass(kineticEnergy: Joules): Kilograms {
  const E = kineticEnergy as number;
  if (!Number.isFinite(E) || E <= 0) return kg(0);
  const ratio = E / (CHICXULUB_REFERENCE_ENERGY as number);
  return kg((CHICXULUB_STRATOSPHERIC_DUST as number) * ratio);
}

/**
 * Atmospheric-shock nitric-acid mass produced by a large impact,
 * linearly scaled against Prinn & Fegley (1987)'s Chicxulub
 * global-average estimate.
 *
 * Reference:
 *   Prinn, R. G. & Fegley, B. Jr. (1987). "Bolide impacts, acid
 *   rain, and biospheric traumas at the Cretaceous-Tertiary
 *   boundary." Earth and Planetary Science Letters 83 (1–4): 1–15.
 *   DOI: 10.1016/0012-821X(87)90046-X.
 */
export function shockAcidRainMass(kineticEnergy: Joules): Kilograms {
  const E = kineticEnergy as number;
  if (!Number.isFinite(E) || E <= 0) return kg(0);
  const ratio = E / (CHICXULUB_REFERENCE_ENERGY as number);
  return kg((CHICXULUB_ACID_RAIN_MASS as number) * ratio);
}

/**
 * Qualitative classification of an event's footprint by kinetic
 * energy. Thresholds loosely follow the Toon et al. (1997) regime
 * boundaries:
 *
 *   LOCAL       : below 10¹⁸ J — contained fireball, no regional effect.
 *   REGIONAL    : 10¹⁸ – 10²⁰ J — Tunguska-class, city-scale damage.
 *   CONTINENTAL : 10²⁰ – 10²² J — sub-continent firestorm + seismic.
 *   GLOBAL      : 10²² – 10²⁴ J — hemispheric climate perturbation.
 *   EXTINCTION  : above 10²⁴ J — Chicxulub-class; mass-extinction
 *                                potential over multi-year darkness.
 */
export type ClimateTier = 'LOCAL' | 'REGIONAL' | 'CONTINENTAL' | 'GLOBAL' | 'EXTINCTION';

export function climateTier(kineticEnergy: Joules): ClimateTier {
  const E = kineticEnergy as number;
  if (!Number.isFinite(E) || E <= 0) return 'LOCAL';
  if (E < 1e18) return 'LOCAL';
  if (E < 1e20) return 'REGIONAL';
  if (E < 1e22) return 'CONTINENTAL';
  if (E < 1e24) return 'GLOBAL';
  return 'EXTINCTION';
}
