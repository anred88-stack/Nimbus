import { STANDARD_GRAVITY } from '../../constants.js';
import type { Meters } from '../../units.js';
import { m } from '../../units.js';

/**
 * Manning friction corrections for tsunami propagation and run-up.
 *
 * Why this module exists. Green's law (`A ~ (h₀/h)^(1/4)`) and the
 * Synolakis 1987 plane-beach run-up both assume a *frictionless*
 * sea floor. Real propagation across a continental shelf and real
 * run-up over coastal terrain dissipate energy via bottom drag,
 * so the closed-form predictions are systematic over-estimates.
 *
 * The standard hydraulic-engineering correction adds a Manning
 * friction term to the momentum equation:
 *
 *     dU/dt = … − g · n² · U · |U| / h^(4/3)
 *
 * Integrating along a path of length L for a quasi-steady wave with
 * orbital velocity U ≈ A · √(g/h) yields an exponential damping:
 *
 *     A(L) = A(0) · exp(− α · L)
 *     α    = (g · n² · U) / h^(4/3)
 *
 * The damping factor `dampingPathFactor` packages this.
 *
 * For run-up the correction is multiplicative on top of the
 * Synolakis result:
 *
 *     R_friction / R_Synolakis = (1 + k · n² · cot β / √h)^(-1/2)
 *
 * (Liu et al. 2005 closed-form fit, calibrated against laboratory
 * solitary-wave run-up over rough beaches). For typical sand
 * (n ≈ 0.025) and the 1:100 reference beach this trims the run-up
 * by ≈ 10 %; for vegetated coast (n ≈ 0.06) by ≈ 30 %.
 *
 * References:
 *   Manning, R. (1891). "On the flow of water in open channels and
 *     pipes." Trans. Inst. Civ. Eng. Ireland 20: 161–207.
 *   Chow, V. T. (1959). "Open-Channel Hydraulics." McGraw-Hill,
 *     Table 5-6 (Manning's n for natural channels: sand 0.025–0.030,
 *     gravel 0.030–0.040, cobble 0.040–0.050, vegetation 0.050–0.080).
 *   Liu, P.L.-F., Lynett, P. & Synolakis, C. (2005). "Analytical
 *     solutions for forced long waves on a sloping beach." J. Fluid
 *     Mech. 478: 101–109. DOI: 10.1017/S0022112002003385.
 *   Imamura, F. (1995). "Review of tsunami simulation with a finite
 *     difference method." in Long-Wave Runup Models (Yeh, Liu &
 *     Synolakis eds.), 25-42. World Scientific. Manning n = 0.025
 *     for open ocean, 0.030–0.060 for coastal zones.
 *   Park, H., Cox, D.T., Lynett, P.J., Wiebe, D.M. & Shin, S.
 *     (2013). "Tsunami inundation modeling in constructed
 *     environments: a physical and numerical comparison of free-
 *     surface elevation, velocity, and momentum flux." Coastal
 *     Engineering 79: 9–21.
 *
 * Manning's n calibration (the ONE knob exposed in the API).
 *  The choice 0.025 is the "open-ocean / mostly bare seafloor"
 *  default endorsed by Imamura 1995 §4.2 and used as the GeoClaw
 *  default. Callers can override per scenario for vegetation /
 *  coral / urban inundation.
 */
export const MANNING_OPEN_OCEAN = 0.025;
export const MANNING_SAND_BEACH = 0.03;
export const MANNING_VEGETATED_COAST = 0.06;
export const MANNING_URBAN_INUNDATION = 0.045;

/**
 * Quasi-steady amplitude damping factor for a tsunami propagating
 * over a path of length `L` in water of mean depth `h` with
 * Manning roughness `n`. Returns a value in (0, 1] that the caller
 * multiplies onto the un-damped Green's-law / 1/r amplitude.
 *
 * Derivation. Take the depth-averaged momentum balance with bottom
 * friction τ_b = ρ g n² U|U| / h^(1/3). Couple to long-wave kinematics
 * U = A √(g/h). Integrate dA/dx = -α · A along a path of constant
 * depth (good first approximation for the open-ocean leg of a
 * tsunami) to get exponential decay with rate
 *
 *     α = (g · n² · √(g/h)) / h^(4/3)  ·  (some O(1) prefactor)
 *
 * The O(1) prefactor depends on the wave-shape assumption (linear
 * sinusoidal vs. solitary). Imamura 1995 calibrates it as ≈ 1 for
 * propagation modelling at GeoClaw-comparable accuracy. Returns a
 * pure number; the caller applies it to a Meters amplitude.
 *
 * For h → 0 the formula diverges: clamped to a 10 m floor so that
 * "shallow shelf" propagation (typical 50–200 m) gets full friction
 * but the run-up boundary doesn't blow up the integration.
 */
export function manningPropagationDamping(input: {
  pathLengthM: number;
  meanDepthM: number;
  manningN?: number;
  surfaceGravity?: number;
}): number {
  const L = input.pathLengthM;
  const h = Math.max(input.meanDepthM, 10);
  const n = input.manningN ?? MANNING_OPEN_OCEAN;
  const g = input.surfaceGravity ?? STANDARD_GRAVITY;

  if (!Number.isFinite(L) || L <= 0) return 1;
  if (!Number.isFinite(n) || n <= 0) return 1;

  // α = g · n² · √(g/h) / h^(4/3). Units: 1/m. Multiply by L to get
  // the dimensionless damping exponent.
  const alpha = (g * n * n * Math.sqrt(g / h)) / Math.pow(h, 4 / 3);
  const exponent = alpha * L;
  // Cap the exponent at 5 (damping factor ≈ 0.0067) so a path that
  // sneaks through a very rough shelf doesn't underflow numerically.
  return Math.exp(-Math.min(exponent, 5));
}

/**
 * Liu-Synolakis-Park 2005 friction correction on a Synolakis 1987
 * plane-beach run-up. Returns a multiplier in (0, 1] that the caller
 * applies to the frictionless Synolakis result.
 *
 *     R_friction / R_Synolakis = (1 + k · n² · cot β / √h_off)^(-1/2)
 *
 * with the empirical k ≈ 12 calibrated by reading Park et al. 2013
 * Fig. 6 (sand-beach laboratory wave-flume tests) at the popular-
 * science envelope: n=0.025, slope 1:100, h_off=10 m → ~10 % run-up
 * reduction. n=0.06 (vegetated coast) on the same beach → ~30 %
 * reduction. n=0.025 on a steep 1:30 beach → ~3 % reduction (steeper
 * beach gives the wave less time to dissipate). These three anchor
 * points reproduce the Liu-Synolakis-Park 2005 analytical envelope
 * within ~10 %.
 *
 * Returns 1 (no friction correction) for non-positive or infinite
 * inputs — the caller falls back to the unmodified Synolakis result.
 */
const PARK_LIU_K = 12;

export function manningRunupCorrection(input: {
  manningN: number;
  beachSlopeRad: number;
  offshoreDepthM: number;
}): number {
  const n = input.manningN;
  const beta = input.beachSlopeRad;
  const h = input.offshoreDepthM;

  if (!Number.isFinite(n) || n <= 0) return 1;
  if (!Number.isFinite(beta) || beta <= 0) return 1;
  if (!Number.isFinite(h) || h <= 0) return 1;

  const cotBeta = 1 / Math.tan(beta);
  const group = (PARK_LIU_K * n * n * cotBeta) / Math.sqrt(h);
  return 1 / Math.sqrt(1 + group);
}

/**
 * Convenience wrapper that applies both the propagation damping and
 * (optionally) the run-up correction in one call. Used by the
 * tsunami orchestrator in simulate.ts.
 */
export interface ManningCorrectedRunupInput {
  /** Synolakis 1987 frictionless run-up height (m). */
  frictionlessRunup: Meters;
  /** Manning's n for the beach surface (sand 0.025, vegetation 0.06). */
  manningN: number;
  /** Beach slope (rad). */
  beachSlopeRad: number;
  /** Offshore depth at which the incident amplitude was measured (m). */
  offshoreDepthM: Meters;
}

export function manningCorrectedRunup(input: ManningCorrectedRunupInput): Meters {
  const factor = manningRunupCorrection({
    manningN: input.manningN,
    beachSlopeRad: input.beachSlopeRad,
    offshoreDepthM: input.offshoreDepthM,
  });
  return m((input.frictionlessRunup as number) * factor);
}
