import {
  FIRST_DEGREE_BURN_FLUENCE,
  NUCLEAR_THERMAL_PARTITION,
  SECOND_DEGREE_BURN_FLUENCE,
  THIRD_DEGREE_BURN_FLUENCE,
} from '../../constants.js';
import type { Joules, Meters } from '../../units.js';
import { m } from '../../units.js';

/**
 * Inputs for {@link thermalFluence}.
 */
export interface ThermalFluenceInput {
  /** Slant range from the fireball centre (m). */
  distance: Meters;
  /** Total explosive yield (J). */
  yieldEnergy: Joules;
  /**
   * Fraction of total yield emitted as thermal radiation. Defaults to
   * 0.35 — Glasstone & Dolan's representative value for low-altitude
   * nuclear bursts.
   */
  thermalPartition?: number;
  /**
   * Fractional atmospheric transmission between the fireball and the
   * receiver. 1 = vacuum/clear line of sight; real clear-air values fall
   * to ~0.7 at ~10 km and ~0.3 at ~100 km. Supply a distance-dependent
   * value from the caller when modelling attenuation; defaults to 1 so
   * the bare formula returns the unshielded inverse-square envelope.
   */
  atmosphericTransmission?: number;
}

/**
 * Thermal radiation fluence (energy per unit receiver area) from a point
 * source, assuming isotropic emission and a user-supplied atmospheric
 * transmission factor:
 *
 *     Q = f · τ · W / (4π · R²)
 *
 * where f is the thermal partition and τ the transmission factor.
 *
 * Source: Glasstone & Dolan (1977), "The Effects of Nuclear Weapons"
 * (3rd ed.), §7.03–§7.35. The inverse-square form is exact for a point
 * source; the partition and transmission factors bundle the real
 * spectrum, geometry, and atmospheric attenuation.
 *
 * Returns: fluence in J/m². (No dedicated branded unit — fluence is the
 * reference quantity used to evaluate burn thresholds downstream.)
 */
export function thermalFluence(input: ThermalFluenceInput): number {
  const R = input.distance as number;
  const W = input.yieldEnergy as number;
  const f = input.thermalPartition ?? NUCLEAR_THERMAL_PARTITION;
  const tau = input.atmosphericTransmission ?? 1;
  return (f * tau * W) / (4 * Math.PI * R ** 2);
}

/**
 * Inputs for {@link thirdDegreeBurnRadius}.
 */
export interface BurnRadiusInput {
  /** Total explosive yield (J). */
  yieldEnergy: Joules;
  /** Thermal partition; defaults to 0.35 (low-altitude nuclear burst). */
  thermalPartition?: number;
  /** Atmospheric transmission factor; defaults to 1 (unshielded). */
  atmosphericTransmission?: number;
  /**
   * Fluence threshold (J/m²). Defaults to 3.35 × 10⁵ J/m² — Glasstone &
   * Dolan's 8 cal/cm² third-degree burn line on exposed skin. Pass 1.26 ×
   * 10⁵ J/m² (3 cal/cm²) for second-degree, 4.19 × 10⁴ (1 cal/cm²) for
   * first-degree, etc.
   */
  fluenceThreshold?: number;
}

/**
 * Slant distance at which the thermal fluence equals a given threshold —
 * the "burn radius". Inversion of {@link thermalFluence} for R:
 *
 *     R = √[ f · τ · W / (4π · Q_threshold) ]
 *
 * Default threshold is the third-degree-burn line (8 cal/cm² on exposed
 * skin, Glasstone & Dolan 1977 Table 7.41).
 *
 * Atmospheric transmission is passed as a single scalar; real-world
 * thermal reach is 50–70 % of the unshielded value at continent scale
 * because τ drops with range. For Tsar-Bomba-scale yields the caller
 * should pass τ ≈ 0.3–0.5 (or call {@link thermalFluence} iteratively
 * with a distance-dependent τ) rather than trusting the default.
 */
export function thirdDegreeBurnRadius(input: BurnRadiusInput): Meters {
  const W = input.yieldEnergy as number;
  const f = input.thermalPartition ?? NUCLEAR_THERMAL_PARTITION;
  const tau = input.atmosphericTransmission ?? 1;
  const Q = input.fluenceThreshold ?? THIRD_DEGREE_BURN_FLUENCE;
  return m(Math.sqrt((f * tau * W) / (4 * Math.PI * Q)));
}

/**
 * Slant distance at which the thermal fluence equals the second-degree
 * burn threshold (5 cal/cm² ≈ 2.09 × 10⁵ J/m²) on exposed skin —
 * full-thickness dermal blistering, painful but typically survivable
 * without grafting in a healthy adult. Same inverse-square inversion
 * as {@link thirdDegreeBurnRadius}, with the lower fluence threshold
 * pre-baked.
 *
 * Source: Glasstone & Dolan (1977), Table 7.41.
 */
export function secondDegreeBurnRadius(input: BurnRadiusInput): Meters {
  return thirdDegreeBurnRadius({ ...input, fluenceThreshold: SECOND_DEGREE_BURN_FLUENCE });
}

/**
 * Slant distance at which the thermal fluence equals the first-degree
 * burn threshold (2 cal/cm² ≈ 8.37 × 10⁴ J/m²) on exposed skin —
 * sunburn-like erythema, no blistering. Outermost burn contour in the
 * three-tier Glasstone & Dolan thermal-injury palette.
 */
export function firstDegreeBurnRadius(input: BurnRadiusInput): Meters {
  return thirdDegreeBurnRadius({ ...input, fluenceThreshold: FIRST_DEGREE_BURN_FLUENCE });
}
