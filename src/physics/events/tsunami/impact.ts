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
 * Energy-partition coupling efficiency η for an impact-driven water
 * cavity. The Ward & Asphaug 2000 rule of thumb A₀ = R_C/2 assumes
 * 100 % of the impact energy goes into water displacement — the
 * idealised hemispherical cavity collapse.
 *
 * Real impacts deliver only a fraction of their energy to coherent
 * water displacement: vapor plume formation, atmospheric ejecta,
 * crater excavation in the ocean floor, and shock dissipation
 * absorb the rest. Hydrocode reconstructions of the K-Pg event
 * (Range et al. 2022 GeoLogica, Bralower et al. 2018) settle on
 * source amplitudes 100–1500 m for a ~80 km cavity, NOT the 42 km
 * Ward's raw 0.5·R would imply.
 *
 * Phase-17 audit. The previous fit
 *
 *     η(R_C) = 0.5 / (1 + (R_C / 5 km)²)
 *
 * had a fatal monotonicity bug: A₀(R_C) = R_C · η(R_C) reaches a
 * maximum at R_C = 5 km (≈ 1.25 km source amplitude) and then
 * *decreases* for larger cavities. So a Boltysh-class impact
 * (R_C ≈ 16 km) was predicted to make a bigger source amplitude
 * than a Chicxulub-class one (R_C ≈ 84 km) — physically backwards.
 *
 * Replacement: linear damping at the denominator instead of
 * quadratic.
 *
 *     η(R_C) = 0.5 / (1 + R_C / R_ref)
 *     A₀(R_C) = 0.5 · R_C · R_ref / (R_ref + R_C)
 *
 * dA₀/dR_C = 0.5 · R_ref² / (R_ref + R_C)² > 0 for every R_C > 0,
 * so the source amplitude is now strictly monotonic in cavity
 * radius. A₀ asymptotes to 0.5 · R_ref for very large impacts.
 *
 * R_ref = 3 km is the calibration that lands K-Pg-class events at
 * the upper end of the Range et al. 2022 envelope while still
 * recovering Ward's small-impact limit:
 *
 *   R_C =  1 km → η ≈ 0.375 → A₀ ≈ 375 m  (Eltanin-class)
 *   R_C =  3 km → η = 0.250 → A₀ = 750 m
 *   R_C = 11 km → η ≈ 0.107 → A₀ ≈ 1.18 km (Boltysh-on-water)
 *   R_C = 53 km → η ≈ 0.027 → A₀ ≈ 1.42 km (Popigai-on-water)
 *   R_C = 84 km → η ≈ 0.017 → A₀ ≈ 1.45 km (Chicxulub-on-water)
 *   R_C → ∞     → A₀ → 1.5 km                (asymptote)
 */
const WARD_REFERENCE_CAVITY_M = 3_000;

export function impactSourceAmplitude(cavityRadius: Meters): Meters {
  const RC = cavityRadius as number;
  if (!Number.isFinite(RC) || RC <= 0) return m(0);
  // η(R_C) = 0.5 / (1 + R_C / R_ref) — linearly damped coupling
  // produces A₀(R_C) = 0.5·R_C·R_ref/(R_ref+R_C), monotonically
  // increasing and asymptoting to 0.5·R_ref for large cavities.
  return m((0.5 * RC * WARD_REFERENCE_CAVITY_M) / (WARD_REFERENCE_CAVITY_M + RC));
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
