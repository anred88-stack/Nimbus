import { SIMPLE_COMPLEX_TRANSITION_EARTH, STANDARD_GRAVITY } from '../../constants.js';
import type { KilogramPerCubicMeter, Meters, MetersPerSecond, Radians } from '../../units.js';
import { m } from '../../units.js';

/**
 * Crater morphology pipeline (Collins, Melosh & Marcus 2005, "Earth Impact
 * Effects Program", MAPS 40 (6)). The simulator applies the three stages
 * strictly in this order — every other physics module that consumes a
 * crater diameter expects the *final* (Eq. 22 / 27) value, not the
 * transient bowl:
 *
 *   1. {@link transientCraterDiameter}  — Eq. 21, pi-group transient bowl
 *   2. {@link finalCraterDiameter}       — Eq. 22 (simple) or Eq. 27 (complex)
 *   3. {@link craterDepth}               — Pike 1980 morphometry on final D
 *
 * The "apparent" depth used by the UI is `craterDepth(finalCraterDiameter(
 * transientCraterDiameter(input)))`. Skipping the final-modification step
 * (collapse, central peak, terraces) under-predicts the real crater rim
 * diameter by ~25 % for simple bowls and over-predicts complex craters by
 * up to a factor of two — both already-known historical mistakes in the
 * pre-2005 literature.
 *
 * Inputs for the transient-bowl scaling. Angles are measured from the
 * target horizontal (0° = grazing, 90° = vertical). `surfaceGravity`
 * defaults to Earth's standard gravity; override for other bodies.
 */
export interface TransientCraterInput {
  impactorDiameter: Meters;
  impactVelocity: MetersPerSecond;
  impactorDensity: KilogramPerCubicMeter;
  targetDensity: KilogramPerCubicMeter;
  impactAngle: Radians;
  surfaceGravity?: number;
}

/**
 * Transient (bowl-shaped) crater rim-to-rim diameter from pi-group scaling.
 *
 *     D_tc = 1.161 · (ρ_i / ρ_t)^(1/3) · L^0.78 · v^0.44 · g^(−0.22) · sin(θ)^(1/3)
 *
 * Derived by Schmidt & Housen (1987) from laboratory impact experiments and
 * adopted (with the same coefficients) by Collins, Melosh & Marcus (2005)
 * for the "Earth Impact Effects Program". Valid for competent-rock targets
 * and hypervelocity (v ≳ a few km/s) impacts.
 *
 * Source: Collins, Melosh & Marcus (2005), Meteoritics & Planetary Science
 * 40(6), pp. 817–840, Eq. 21. DOI: 10.1111/j.1945-5100.2005.tb00157.x.
 */
export function transientCraterDiameter(input: TransientCraterInput): Meters {
  const L = input.impactorDiameter as number;
  const v = input.impactVelocity as number;
  const rhoI = input.impactorDensity as number;
  const rhoT = input.targetDensity as number;
  const theta = input.impactAngle as number;
  const g = input.surfaceGravity ?? STANDARD_GRAVITY;

  const diameter =
    1.161 *
    (rhoI / rhoT) ** (1 / 3) *
    L ** 0.78 *
    v ** 0.44 *
    g ** -0.22 *
    Math.sin(theta) ** (1 / 3);

  return m(diameter);
}

/**
 * Final (post-modification) crater rim-to-rim diameter.
 *
 * Branches by morphology at the simple-to-complex transition diameter:
 *
 *   - If the simple-morphology prediction (1.25 · D_tc) stays below D_c,
 *     the crater keeps its bowl shape:
 *        D_fr = 1.25 · D_tc          (Eq. 22)
 *
 *   - Otherwise the bowl collapses into a complex crater (central peak,
 *     terraces, shallower floor):
 *        D_fr = 1.17 · D_tc^1.13 · D_c^(−0.13)   (Eq. 27)
 *
 * The coefficients are fitted and do not join continuously at the
 * transition — Collins et al. (2005) document the ~5 % discontinuity as
 * acceptable for popular-science use.
 *
 * Source: Collins, Melosh & Marcus (2005), Eqs. 22 & 27.
 * DOI: 10.1111/j.1945-5100.2005.tb00157.x.
 *
 * @param transient          transient crater diameter D_tc
 * @param transitionDiameter simple-to-complex transition diameter D_c
 *                           (defaults to Earth, competent rock)
 */
export function finalCraterDiameter(
  transient: Meters,
  transitionDiameter: Meters = SIMPLE_COMPLEX_TRANSITION_EARTH
): Meters {
  const Dtc = transient as number;
  const Dc = transitionDiameter as number;
  const simple = 1.25 * Dtc;
  if (simple < Dc) {
    return m(simple);
  }
  return m((1.17 * Dtc ** 1.13) / Dc ** 0.13);
}

/**
 * Rim-to-floor depth of a final crater, using Pike (1980) lunar morphometry
 * extrapolated to competent-rock targets on Earth.
 *
 *   - Simple craters (D < D_c): d ≈ 0.196 · D   — near-parabolic bowl.
 *   - Complex craters (D ≥ D_c): d = 1.044 · D^0.301  (Pike 1980, lunar
 *     complex-crater fit; both in km — scaled here to SI metres).
 *
 * Source: Pike (1980), "Formation of complex impact craters: Evidence
 * from Mars and other planets", Icarus 43(1), pp. 1–19, Table III.
 * DOI: 10.1016/0019-1035(80)90244-4.
 *
 * Used for popular-science depth display; real craters show ±30 %
 * scatter around these fits, and post-impact erosion further modifies
 * the preserved profile.
 */
export function craterDepth(
  diameter: Meters,
  transitionDiameter: Meters = SIMPLE_COMPLEX_TRANSITION_EARTH
): Meters {
  const D = diameter as number;
  const Dc = transitionDiameter as number;
  if (D < Dc) {
    return m(0.196 * D);
  }
  // Pike (1980): d (km) = 1.044 · D (km)^0.301.
  // Converted to metres: d = 1000 · 1.044 · (D / 1000)^0.301.
  return m(1000 * 1.044 * (D / 1000) ** 0.301);
}
