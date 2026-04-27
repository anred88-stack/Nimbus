import {
  FLAMMABLE_IGNITION_FLUENCE,
  NUCLEAR_THERMAL_PARTITION,
  URBAN_FIRESTORM_FLUENCE,
} from '../constants.js';
import type { Joules, Meters, SquareMeters } from '../units.js';
import { m, sqm } from '../units.js';

/**
 * Thermal-pulse fire-hazard metrics shared between nuclear explosions
 * and cosmic impacts. Both events emit a brief bright pulse whose
 * fluence falls with 1/r²; the receiver thresholds are the same.
 *
 * Source: Glasstone & Dolan (1977), "The Effects of Nuclear Weapons"
 * (3rd ed.), U.S. DoD/DoE, §7.03–§7.42. The thermal partition f is
 * the fraction of total event energy emitted as light in the
 * thermal-pulse band; 0.35 (default) is G&D's nominal value for
 * low-altitude nuclear bursts. For cosmic impacts the partition is
 * closer to ~0.003–0.01 (Toon et al. 1997); callers must supply the
 * impact-specific value explicitly.
 */

export interface FirestormInput {
  /** Total event yield — nuclear J or impact kinetic-energy J. */
  yieldEnergy: Joules;
  /** Fraction emitted as thermal radiation. Defaults to 0.35 (nuclear). */
  thermalPartition?: number;
  /** Atmospheric transmission factor τ ∈ (0, 1]. Defaults to 1. */
  atmosphericTransmission?: number;
}

/** Radius at which the incident thermal fluence drops to the dry-
 *  kindling ignition threshold (~10 cal/cm²). Invert Q = f·τ·W/(4πR²). */
export function flammableIgnitionRadius(input: FirestormInput): Meters {
  return thresholdRadius(input, FLAMMABLE_IGNITION_FLUENCE);
}

/** Radius at which the incident fluence drops to the firestorm
 *  sustainability threshold (~6 cal/cm²). Beyond this, fires still
 *  start but rarely merge into a self-sustaining column. */
export function firestormSustainRadius(input: FirestormInput): Meters {
  return thresholdRadius(input, URBAN_FIRESTORM_FLUENCE);
}

/** Ground-projected area enclosed by the flammable-ignition radius. */
export function flammableIgnitionArea(input: FirestormInput): SquareMeters {
  const r = flammableIgnitionRadius(input) as number;
  return sqm(Math.PI * r * r);
}

/** Ground-projected area enclosed by the firestorm-sustainability
 *  radius. Realistic firestorm-prone area is the intersection of
 *  this disc with flammable urban land, which the caller must apply. */
export function firestormArea(input: FirestormInput): SquareMeters {
  const r = firestormSustainRadius(input) as number;
  return sqm(Math.PI * r * r);
}

function thresholdRadius(input: FirestormInput, fluenceThreshold: number): Meters {
  const W = input.yieldEnergy as number;
  const f = input.thermalPartition ?? NUCLEAR_THERMAL_PARTITION;
  const tau = input.atmosphericTransmission ?? 1;
  if (!Number.isFinite(W) || W <= 0 || fluenceThreshold <= 0) return m(0);
  return m(Math.sqrt((f * tau * W) / (4 * Math.PI * fluenceThreshold)));
}
