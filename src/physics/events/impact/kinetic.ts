import type {
  Joules,
  KilogramPerCubicMeter,
  Kilograms,
  Meters,
  MetersPerSecond,
} from '../../units.js';
import { J, kg } from '../../units.js';

/**
 * Mass of a spherical impactor from its diameter and bulk density.
 *
 *     m = (π / 6) · ρ · L³
 *
 * Source: Collins, Melosh & Marcus (2005), "Earth Impact Effects Program",
 * Meteoritics & Planetary Science 40(6), pp. 817–840, Eq. 1.
 * DOI: 10.1111/j.1945-5100.2005.tb00157.x.
 *
 * @param diameter impactor diameter L
 * @param density  bulk density ρ
 */
export function impactorMass(diameter: Meters, density: KilogramPerCubicMeter): Kilograms {
  const L = diameter as number;
  const rho = density as number;
  return kg((Math.PI / 6) * rho * L ** 3);
}

/**
 * Translational kinetic energy of a point mass.
 *
 *     E = ½ · m · v²
 *
 * Source: Collins, Melosh & Marcus (2005), Eq. 3 — elementary mechanics.
 * DOI: 10.1111/j.1945-5100.2005.tb00157.x.
 *
 * @param mass     impactor mass m
 * @param velocity impact velocity v (relative to the target surface)
 */
export function kineticEnergy(mass: Kilograms, velocity: MetersPerSecond): Joules {
  const massValue = mass as number;
  const v = velocity as number;
  return J(0.5 * massValue * v ** 2);
}
