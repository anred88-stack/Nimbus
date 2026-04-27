import { ussaDensity } from '../../atmosphere/ussa1976.js';
import { STANDARD_GRAVITY } from '../../constants.js';
import type { Meters, SquareMeters } from '../../units.js';
import { m, sqm } from '../../units.js';

/**
 * Wind-advected tephra fallout model — the popular-science version of
 * Suzuki (1983) / Bonadonna & Phillips (2003) analytical advection-
 * diffusion. Given a Plinian plume height, a vertical release-height
 * profile, a set of particle size classes with Ganser (1993) terminal
 * velocities, and a constant wind vector, the model returns the ground
 * deposit thickness at an arbitrary (downwind, crosswind) point and
 * derives a 1-mm isopach footprint.
 *
 * This is not a full-blown ATM (HYSPLIT / PUFF / FALL3D). It is a
 * closed-form analytical envelope that reproduces the right
 * qualitative features — elongated downwind lobe, crosswind Gaussian
 * spread, coarse fraction deposited near the vent, fine ash carried
 * hundreds of kilometres — with zero I/O and full determinism. The
 * output is suitable for headline educational display; real hazard
 * mapping still needs HYSPLIT or equivalent.
 *
 * References:
 *   Suzuki, T. (1983). "A theoretical model for dispersion of tephra."
 *    In Arc Volcanism: Physics and Tectonics (Shimozuru & Yokoyama,
 *    eds.), Terra Scientific Publishing, Tokyo, pp. 95–113.
 *    Fundamental release-height distribution f(z) = A·((1-z/H)·
 *    exp(λ(z/H-1)))^k  — the Suzuki column.
 *   Bonadonna, C. & Phillips, J. C. (2003). "Sedimentation from
 *    strong volcanic plumes." Journal of Geophysical Research
 *    108 (B7), 2340. DOI: 10.1029/2002JB002034.
 *   Ganser, G. H. (1993). "A rational approach to drag prediction
 *    of spherical and nonspherical particles." Powder Technology
 *    77 (2): 143–152. DOI: 10.1016/0032-5910(93)80051-B.
 *   Pyle, D. M. (1989). "The thickness, volume and grainsize of
 *    tephra fall deposits." Bulletin of Volcanology 51 (1): 1–15.
 *    (used for the deposit → isopach area sanity check).
 *
 * Coordinate convention: origin at the vent, +x aligned with the
 * wind direction (downwind), +y is crosswind. All ranges in metres.
 */

/** Atmospheric kinematic viscosity near the tropopause. Sutherland's
 *  formula gives a slow temperature dependence; the popular-science
 *  ash-settling envelope is dominated by density variation, so we
 *  hold viscosity constant and let {@link ussaDensity} carry the
 *  altitude profile. */
const TROPOPAUSE_AIR_VISCOSITY = 1.5e-5; // m²/s
/** Tephra particle density (vesicular pumice mean). */
const TEPHRA_DENSITY = 1_000; // kg/m³
/** Suzuki column peak-release parameter λ — higher λ concentrates
 *  release near the plume top. λ = 4 matches the Bonadonna 2003
 *  recommended value for sub-Plinian to Plinian columns. */
export const SUZUKI_LAMBDA = 4;
/** Suzuki column exponent k — Bonadonna 2003 default. */
export const SUZUKI_K = 1;
/** Along-wind Gaussian source-scale factor. σ_x = ALONG_WIND_SOURCE ·
 *  plumeHeight and does NOT grow with wind, because the spread along
 *  the wind direction is set by the vertical thickness of the source
 *  column (Suzuki 1983 §5). Fixing σ_x is what lets stronger winds
 *  extend the 1-mm isopach downwind instead of diluting it. */
export const ALONG_WIND_SOURCE_FACTOR = 0.5;
/** Crosswind Gaussian turbulent-diffusion factor. σ_y(x) grows as
 *  √(1 + x / (diffusion length)) — Pasquill-Gifford D-class profile
 *  truncated to the far field. CROSSWIND_BASE · H is the initial
 *  source width; CROSSWIND_DIFFUSION_SCALE is the downwind distance
 *  at which σ_y has doubled from source width. */
export const CROSSWIND_BASE_FACTOR = 0.3;
export const CROSSWIND_DIFFUSION_SCALE_OVER_H = 10;

/**
 * Particle size class definition. Diameter is the representative
 * diameter of the class (m), massFraction the share of the total
 * ejecta volume this class carries. The default four-class
 * distribution below is the Pyle 1989 lognormal fit for a typical
 * Plinian grain-size spectrum: 40 % coarse, 30 % medium, 20 % fine,
 * 10 % very-fine (aerosol-like).
 */
export interface GrainSizeClass {
  /** Representative diameter (m). */
  diameter: number;
  /** Fraction of the total deposit mass carried by this class, [0, 1]. */
  massFraction: number;
}

export const DEFAULT_GRAIN_SPECTRUM: GrainSizeClass[] = [
  { diameter: 8e-3, massFraction: 0.4 }, // 8 mm lapilli / coarse ash
  { diameter: 1e-3, massFraction: 0.3 }, // 1 mm coarse ash
  { diameter: 125e-6, massFraction: 0.2 }, // 125 µm medium ash
  { diameter: 32e-6, massFraction: 0.1 }, // 32 µm fine ash
];

/**
 * Ganser (1993) terminal fall velocity for a spherical particle in a
 * Newtonian fluid. Combines Stokes (Re < 1) and Newton (Re > 1000)
 * regimes via a continuous drag coefficient. Spherical assumption is
 * a first-order approximation; real tephra drag coefficients differ
 * by up to 50 % due to irregular shapes — absorbed in the overall
 * ±factor-2 uncertainty budget on the ashfall map.
 */
export function ganserTerminalVelocity(
  diameter: number,
  particleDensity: number = TEPHRA_DENSITY,
  // Default at the USSA-76 tropopause base (≈ 0.36 kg/m³) — the
  // altitude band where most Plinian fall deposits drift before
  // settling. Replaces the previous hard-coded 0.4 kg/m³ constant.
  airDensity: number = ussaDensity(11_000),
  airKinematicViscosity: number = TROPOPAUSE_AIR_VISCOSITY,
  surfaceGravity: number = STANDARD_GRAVITY
): number {
  if (!Number.isFinite(diameter) || diameter <= 0) return 0;
  const g = surfaceGravity;
  const d = diameter;
  const rhoP = particleDensity;
  const rhoA = airDensity;
  const nu = airKinematicViscosity;

  // Stokes law for starting guess: v = g·d²·(ρ_p − ρ_a) / (18·ρ_a·ν).
  let v = (g * d * d * (rhoP - rhoA)) / (18 * rhoA * nu);

  // Iterate 8× against the Ganser drag law to converge for any Re.
  for (let i = 0; i < 8; i++) {
    const Re = Math.max((v * d) / nu, 1e-6);
    // Ganser 1993 Eq. 18 (spherical): Cd = 24/Re·(1+0.1118·Re^0.6567) + 0.4305/(1+3305/Re)
    const Cd = (24 / Re) * (1 + 0.1118 * Math.pow(Re, 0.6567)) + 0.4305 / (1 + 3_305 / Re);
    v = Math.sqrt((4 * g * d * (rhoP - rhoA)) / (3 * Cd * rhoA));
  }
  return v;
}

export interface AshDepositInput {
  /** Plume height above the vent (m). */
  plumeHeight: Meters;
  /** Total bulk ejecta volume (m³) carried as fall deposit. */
  totalEjectaVolume: number;
  /** Downwind distance from vent (m). */
  downwindDistance: number;
  /** Crosswind distance from plume axis (m). */
  crosswindDistance: number;
  /** Horizontal wind speed (m/s). Must be > 0 for advection to occur. */
  windSpeed: number;
  /** Grain-size spectrum. Defaults to the Pyle 1989 4-class fit. */
  grainSpectrum?: GrainSizeClass[];
  /** Bulk deposit density (kg/m³). Defaults to 1 000 (loose tephra). */
  depositDensity?: number;
}

/**
 * Suzuki 1983 vertical-release weighting at fractional height
 * z̃ = z / H. Normalised numerically so ∫f(z̃) dz̃ = 1 over [0, 1].
 *
 *   f(z̃) = A · [(1 − z̃) · exp(λ · (z̃ − 1))]^k
 *
 * The factor A is computed by trapezoidal integration below.
 */
function suzukiWeight(zTilde: number): number {
  if (zTilde < 0 || zTilde > 1) return 0;
  const base = (1 - zTilde) * Math.exp(SUZUKI_LAMBDA * (zTilde - 1));
  return Math.pow(Math.max(base, 0), SUZUKI_K);
}

/** Pre-computed normalisation constant for {@link suzukiWeight}. */
const SUZUKI_NORMALISATION = (() => {
  const N = 256;
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const z = (i + 0.5) / N;
    sum += suzukiWeight(z);
  }
  return 1 / (sum / N); // so ∫ normalised f dz̃ = 1
})();

/**
 * Deposit mass loading (kg/m²) at the point (downwindDistance,
 * crosswindDistance) from the vent, summed over the full grain-size
 * spectrum and the Suzuki release-height profile.
 *
 * Each (grain class, release height) pair deposits its mass at the
 * downwind range where the fall time at that height equals the wind
 * advection time — a lateral Gaussian spreads the mass crosswind
 * with σ_y(x) = 0.2·x (Pyle 1989 isopach aspect).
 */
export function ashfallMassLoading(input: AshDepositInput): number {
  const H = input.plumeHeight as number;
  const V = input.totalEjectaVolume;
  const x = input.downwindDistance;
  const y = input.crosswindDistance;
  const u = input.windSpeed;
  if (!Number.isFinite(H) || H <= 0) return 0;
  if (!Number.isFinite(V) || V <= 0) return 0;
  if (!Number.isFinite(u) || u <= 0) return 0;
  if (!Number.isFinite(x)) return 0;
  if (x <= 0) return 0; // upwind of the vent — no deposit

  const depositDensity = input.depositDensity ?? TEPHRA_DENSITY;
  const totalMass = V * depositDensity;
  const spectrum = input.grainSpectrum ?? DEFAULT_GRAIN_SPECTRUM;

  // Integrate over N_z release-height points and sum grain classes.
  const N_z = 24;
  let loading = 0;
  for (const grain of spectrum) {
    const vt = ganserTerminalVelocity(grain.diameter);
    if (vt <= 0) continue;
    const massClass = totalMass * grain.massFraction;
    for (let i = 0; i < N_z; i++) {
      const zTilde = (i + 0.5) / N_z;
      const z = zTilde * H;
      const weight = (suzukiWeight(zTilde) * SUZUKI_NORMALISATION) / N_z;
      const fallTime = z / vt;
      const xCentre = u * fallTime;
      // Along-wind σ is set by the source-column vertical extent (not
      // by wind speed or downwind range). This is what lets stronger
      // winds extend the isopach downwind instead of diluting it.
      const sigmaX = Math.max(H * ALONG_WIND_SOURCE_FACTOR, 500);
      // Crosswind σ grows sub-linearly with downwind range via a
      // Pasquill-Gifford-style diffusion term.
      const diffusionScale = H * CROSSWIND_DIFFUSION_SCALE_OVER_H;
      const sigmaY =
        Math.max(H * CROSSWIND_BASE_FACTOR, 500) *
        Math.sqrt(1 + xCentre / Math.max(diffusionScale, 1));
      const dx = (x - xCentre) / sigmaX;
      const dy = y / sigmaY;
      const lateral = Math.exp(-(dx * dx + dy * dy) / 2);
      // Per-cell deposit: mass_slice · lateral_Gauss / (2π σ_x σ_y).
      loading += (massClass * weight * lateral) / (2 * Math.PI * sigmaX * sigmaY);
    }
  }
  return loading; // kg/m²
}

/**
 * Convert a mass loading (kg/m²) to a deposit thickness (m) using
 * the bulk density. Default 1 000 kg/m³ is Pyle 1989's median value
 * for compacted-but-uncemented Plinian fall units.
 */
export function massLoadingToThickness(
  loading: number,
  depositDensity: number = TEPHRA_DENSITY
): number {
  if (!Number.isFinite(loading) || loading <= 0) return 0;
  return loading / depositDensity;
}

export interface AshFootprintInput {
  /** Plume height above the vent (m). */
  plumeHeight: Meters;
  /** Total bulk ejecta volume (m³) carried as fall deposit. */
  totalEjectaVolume: number;
  /** Horizontal wind speed (m/s). */
  windSpeed: number;
  /** Threshold thickness for the isopach (m). Defaults to 1 mm. */
  thicknessThreshold?: Meters;
  /** Grain-size spectrum. Defaults to the Pyle 1989 4-class fit. */
  grainSpectrum?: GrainSizeClass[];
  /** Bulk deposit density (kg/m³). Defaults to 1 000. */
  depositDensity?: number;
}

export interface AshFootprint {
  /** Downwind extent of the threshold isopach (m). */
  downwindRange: Meters;
  /** Maximum crosswind half-width of the threshold isopach (m). */
  crosswindHalfWidth: Meters;
  /** Downwind position of maximum crosswind half-width (m). */
  widestPointDownwind: Meters;
  /** Enclosed area (m²). Approximated as an ellipse with axes equal
   *  to the downwind extent and twice the crosswind half-width. */
  area: SquareMeters;
}

/**
 * Compute the wind-advected 1-mm isopach footprint of a Plinian
 * ashfall. Binary searches along the downwind axis for the farthest
 * point where the deposit thickness drops below the threshold, and
 * measures the maximum crosswind half-width.
 */
export function ashFootprint(input: AshFootprintInput): AshFootprint {
  const threshold = (input.thicknessThreshold ?? m(1e-3)) as number;
  const depositDensity = input.depositDensity ?? TEPHRA_DENSITY;
  const loadingThreshold = threshold * depositDensity;

  const baseInput: AshDepositInput = {
    plumeHeight: input.plumeHeight,
    totalEjectaVolume: input.totalEjectaVolume,
    windSpeed: input.windSpeed,
    downwindDistance: 0,
    crosswindDistance: 0,
    ...(input.grainSpectrum !== undefined ? { grainSpectrum: input.grainSpectrum } : {}),
    ...(input.depositDensity !== undefined ? { depositDensity: input.depositDensity } : {}),
  };

  if (input.windSpeed <= 0 || input.totalEjectaVolume <= 0) {
    return {
      downwindRange: m(0),
      crosswindHalfWidth: m(0),
      widestPointDownwind: m(0),
      area: sqm(0),
    };
  }

  // Bisection on x to find the downwind isopach edge.
  const atAxis = (x: number): number =>
    ashfallMassLoading({ ...baseInput, downwindDistance: x, crosswindDistance: 0 });
  let lo = 0;
  let hi = 5_000_000; // 5 000 km upper bracket
  if (atAxis(hi) >= loadingThreshold) {
    // Grew beyond bracket — clamp.
    return {
      downwindRange: m(hi),
      crosswindHalfWidth: m(0),
      widestPointDownwind: m(0),
      area: sqm(0),
    };
  }
  if (atAxis(lo + 1) < loadingThreshold) {
    return {
      downwindRange: m(0),
      crosswindHalfWidth: m(0),
      widestPointDownwind: m(0),
      area: sqm(0),
    };
  }
  for (let i = 0; i < 40; i++) {
    const mid = 0.5 * (lo + hi);
    if (atAxis(mid) >= loadingThreshold) lo = mid;
    else hi = mid;
  }
  const downwindRange = 0.5 * (lo + hi);

  // Sweep crosswind half-width in ~20 downwind samples.
  let maxHalfWidth = 0;
  let widestX = 0;
  const N = 24;
  for (let i = 1; i <= N; i++) {
    const x = (i / N) * downwindRange;
    // Bisection in y.
    let yLo = 0;
    let yHi = Math.max(downwindRange * 0.5, 5_000);
    const atXY = (y: number): number =>
      ashfallMassLoading({ ...baseInput, downwindDistance: x, crosswindDistance: y });
    if (atXY(yHi) >= loadingThreshold) {
      // widen
      yHi = downwindRange * 2;
    }
    if (atXY(yLo) < loadingThreshold) continue;
    for (let j = 0; j < 30; j++) {
      const mid = 0.5 * (yLo + yHi);
      if (atXY(mid) >= loadingThreshold) yLo = mid;
      else yHi = mid;
    }
    const halfWidth = 0.5 * (yLo + yHi);
    if (halfWidth > maxHalfWidth) {
      maxHalfWidth = halfWidth;
      widestX = x;
    }
  }

  // Ellipse area approximation: π · (downwindRange/2) · crosswindHalfWidth.
  const area = Math.PI * (downwindRange / 2) * maxHalfWidth;

  return {
    downwindRange: m(downwindRange),
    crosswindHalfWidth: m(maxHalfWidth),
    widestPointDownwind: m(widestX),
    area: sqm(area),
  };
}
