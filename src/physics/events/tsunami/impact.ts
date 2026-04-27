import { SEAWATER_DENSITY, STANDARD_GRAVITY } from '../../constants.js';
import type { Joules, KilogramPerCubicMeter, Meters } from '../../units.js';
import { m } from '../../units.js';

export interface ImpactCavityInput {
  /** Impactor kinetic energy (J). */
  kineticEnergy: Joules;
  /** Seawater density; defaults to 1 025 kg/m³. */
  waterDensity?: KilogramPerCubicMeter;
  /** Surface gravity; defaults to Earth standard. */
  surfaceGravity?: number;
}

/**
 * Initial cavity radius left in the water column by a deep-water
 * impact, from the Ward & Asphaug (2000) energy-partitioning form:
 *
 *     R_C = (3 · E_k / (2π · ρ_w · g))^(1/4)
 *
 * where E_k is the impactor kinetic energy, ρ_w the water density
 * and g the surface gravity. Applies in the "deep water" regime
 * where water depth exceeds the impactor size; the simulator uses it
 * as the source-cavity radius when propagating the resulting tsunami.
 *
 * Source: Ward & Asphaug (2000), "Asteroid Impact Tsunami:
 * A Probabilistic Hazard Assessment", Icarus 145(1), pp. 64–78,
 * Eq. 3. DOI: 10.1006/icar.1999.6336.
 */
export function impactCavityRadius(input: ImpactCavityInput): Meters {
  const E = input.kineticEnergy as number;
  const rhoW = (input.waterDensity ?? SEAWATER_DENSITY) as number;
  const g = input.surfaceGravity ?? STANDARD_GRAVITY;
  return m(((3 * E) / (2 * Math.PI * rhoW * g)) ** 0.25);
}

/**
 * Initial wave amplitude at the cavity rim — Ward & Asphaug's rule of
 * thumb that the collapse wave's peak amplitude is roughly half the
 * cavity radius (a deep, roughly hemispherical depression fills back
 * in, splashing the excavated volume up as a wavefront).
 *
 * Source: Ward & Asphaug (2000), Section 3 scaling arguments.
 */
export function impactSourceAmplitude(cavityRadius: Meters): Meters {
  return m((cavityRadius as number) / 2);
}

export interface ImpactAmplitudeAtDistanceInput {
  /** Ward–Asphaug source amplitude (m). */
  sourceAmplitude: Meters;
  /** Cavity radius that seeded the wave (m). */
  cavityRadius: Meters;
  /** Ground-range distance from the impact point (m). */
  distance: Meters;
}

/**
 * Far-field tsunami amplitude from a Ward–Asphaug impact source, using
 * the 1/r geometric decay that holds for shallow-water waves on an
 * otherwise undisturbed ocean:
 *
 *     A(r) = A₀ · R_C / r        (r ≥ R_C)
 *
 * Inside the cavity (r < R_C) we clamp to the source amplitude — the
 * simulator is not interested in the near-field detail there.
 *
 * Source: Ward & Asphaug (2000), Section 4 (cylindrical spreading of
 * gravity waves in shallow water, with mean-depth cancellation).
 */
export function impactAmplitudeAtDistance(input: ImpactAmplitudeAtDistanceInput): Meters {
  const A0 = input.sourceAmplitude as number;
  const RC = input.cavityRadius as number;
  const r = input.distance as number;
  if (r <= RC) return m(A0);
  return m((A0 * RC) / r);
}

/**
 * Hydrocode-informed damping factor that scales down the Ward–Asphaug
 * 1/r far-field amplitude. The linear analytic model systematically
 * over-predicts impact-tsunami amplitudes because short-wavelength
 * waves dissipate faster than classical shallow-water tsunamis, and
 * near-source non-linearities partition energy into many modes.
 *
 * Reference:
 *   Wünnemann, K., Weiss, R., & Hofmann, K. (2007).
 *   "Characteristics of oceanic impact-induced large water waves —
 *    Re-evaluation of the tsunami hazard."
 *   Meteoritics & Planetary Science 42 (11): 1893–1903.
 *   DOI: 10.1111/j.1945-5100.2007.tb00548.x.
 *   Melosh, H. J. (2003). "Impact-generated tsunamis: An over-rated
 *    hazard." Lunar & Planetary Science 34, Abstract 2013.
 *
 * Simplified fit to their Fig. 6 hydrocode curves:
 *   damping(r) = min(1, 0.8 · sqrt(100 km / r))
 * → 0.8 at 100 km; 0.25 at 1 000 km; 0.11 at 5 000 km.
 */
export function wunnemannDampingFactor(distance: Meters): number {
  const r = distance as number;
  if (!Number.isFinite(r) || r <= 0) return 1;
  const reference = 100_000; // 100 km anchor
  return Math.min(1, 0.8 * Math.sqrt(reference / r));
}

/**
 * Wünnemann/Melosh-corrected far-field amplitude — the honest,
 * hydrocode-informed replacement for the unconstrained Ward–Asphaug
 * 1/r reach. Used as the "best-estimate" row in the UI next to the
 * unmodified Ward–Asphaug envelope.
 */
export function impactAmplitudeWunnemann(input: ImpactAmplitudeAtDistanceInput): Meters {
  const ward = impactAmplitudeAtDistance(input) as number;
  return m(ward * wunnemannDampingFactor(input.distance));
}
