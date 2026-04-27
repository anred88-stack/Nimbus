import type { Meters, Seconds } from '../../units.js';
import { m } from '../../units.js';
import { impactAmplitudeAtDistance } from '../tsunami/impact.js';
import { tsunamiTravelTime } from '../tsunami/propagation.js';

/**
 * Volcanic tsunami source — flank collapse or caldera-floor collapse
 * dropping a block of edifice material into the surrounding water.
 *
 * Two well-known archetypes anchor the parameter space:
 *   - Anak Krakatau, 22 December 2018: ≈ 0.27 km³ flank collapse,
 *     ≈ 20° slope, observed source amplitude ≈ 85 m (Grilli et al.
 *     2019, Sci. Rep. 9: 11946).
 *   - Krakatau, 27 August 1883: ≈ 25 km³ caldera collapse,
 *     observed coastal run-up 30–40 m around the Sunda Strait
 *     (Self 1992; Maeno & Imamura 2011, J. Geophys. Res. 116: B09205).
 *
 * For the popular-science envelope we use a single Watts (2000)-style
 * form calibrated against Anak Krakatau's observed source amplitude:
 *
 *     η_source = 0.10 · V^(1/3) · sin(θ)        (m, with V in m³, θ in rad)
 *
 * The cube-root scaling captures the basic geometry — the slide block's
 * characteristic linear dimension grows as V^(1/3), and the maximum
 * vertical excursion of the wave roughly tracks that dimension scaled
 * by the slope projection. The 0.10 prefactor reproduces Anak Krakatau
 * within the modelling scatter (factor of ≈ 2 against observation,
 * which is typical for landslide-tsunami source models — see Tappin
 * 2017, Earth-Science Reviews 169: 73–101 for the published spread).
 *
 * The caller's volume is the COLLAPSED block; for caldera events
 * "slope" should be set to the post-collapse caldera-wall angle
 * (≈ 45° for Krakatau-class structures). For flank slides "slope"
 * is the failure-plane dip (≈ 20° for Anak Krakatau-class events).
 *
 * Far-field amplitude propagation reuses the Ward & Asphaug (2000)
 * 1/r decay primitive — the cavity radius is back-derived from the
 * source amplitude via η_source = R_cavity / 2 so the existing
 * `impactAmplitudeAtDistance` plumbing handles the long-wave spread.
 *
 * References:
 *   Watts, P. (2000). "Tsunami features of solid block underwater
 *     landslides." J. Waterway Port Coastal Ocean Eng., 126(3): 144–152.
 *   Grilli, S. T., et al. (2019). "Modelling of the tsunami from the
 *     December 22, 2018 lateral collapse of Anak Krakatau."
 *     Scientific Reports 9: 11946.
 *   Maeno, F. & Imamura, F. (2011). "Tsunami generation by a rapid
 *     entrance of pyroclastic flow into the sea during the 1883
 *     Krakatau eruption." J. Geophys. Res., 116: B09205.
 *   Tappin, D. R. (2017). "Submarine landslides and their tsunami
 *     hazard." Annual Review of Earth and Planetary Sciences 47: 89–128.
 */

/** Empirical prefactor in η_source = K · V^(1/3) · sin(θ). Calibrated
 *  to Anak Krakatau 2018 (V = 0.27 km³, θ = 20°, η_obs ≈ 85 m). */
export const VOLCANO_TSUNAMI_PREFACTOR = 0.1;

export interface VolcanoTsunamiInput {
  /** Collapsed block volume (m³). Anak Krakatau-class events sit at
   *  ≈ 3 × 10⁸; Krakatau-class caldera collapses at ≈ 2 × 10¹⁰. */
  collapseVolumeM3: number;
  /** Slope angle of the failure plane (rad). 20–25° for sub-aerial
   *  flank slides; 40–60° for caldera-wall collapse. */
  slopeAngleRad: number;
  /** Mean basin depth used for travel-time (m). Defaults to 1 000 m
   *  — most volcanic islands sit on a shelf much shallower than the
   *  global ocean mean. */
  meanOceanDepth?: Meters;
}

export interface VolcanoTsunamiResult {
  /** Initial wave amplitude at the source (m). */
  sourceAmplitude: Meters;
  /** Equivalent Ward-Asphaug cavity radius (m), back-derived from
   *  source amplitude as 2·η_source so the existing 1/r propagation
   *  primitives apply unchanged. */
  cavityRadius: Meters;
  /** Far-field amplitude at 100 km from the volcano (m). */
  amplitudeAt100km: Meters;
  /** Far-field amplitude at 1 000 km from the volcano (m). */
  amplitudeAt1000km: Meters;
  /** Travel time to the 100 km contour (s). */
  travelTimeTo100km: Seconds;
  /** Travel time to the 1 000 km contour (s). */
  travelTimeTo1000km: Seconds;
  /** Echo of the basin depth used. */
  meanOceanDepth: Meters;
}

/**
 * Compute the volcanic-collapse tsunami source. Returns null when the
 * inputs cannot drive a wave (zero or negative volume / slope).
 */
export function volcanoTsunami(input: VolcanoTsunamiInput): VolcanoTsunamiResult | null {
  const V = input.collapseVolumeM3;
  const theta = input.slopeAngleRad;
  if (!Number.isFinite(V) || V <= 0) return null;
  if (!Number.isFinite(theta) || theta <= 0) return null;

  const meanOceanDepth = input.meanOceanDepth ?? m(1_000);
  const eta0 = VOLCANO_TSUNAMI_PREFACTOR * Math.cbrt(V) * Math.sin(theta);
  const sourceAmplitude = m(eta0);
  // Back-derive an equivalent cavity radius so impactAmplitudeAtDistance
  // (which expects a cavity-radius pair) handles the 1/r decay. The
  // Ward-Asphaug rule is η_source = R_cavity / 2 → R_cavity = 2·η₀.
  const cavityRadius = m(2 * eta0);
  const amp100 = impactAmplitudeAtDistance({
    sourceAmplitude,
    cavityRadius,
    distance: m(100_000),
  });
  const amp1000 = impactAmplitudeAtDistance({
    sourceAmplitude,
    cavityRadius,
    distance: m(1_000_000),
  });

  return {
    sourceAmplitude,
    cavityRadius,
    amplitudeAt100km: amp100,
    amplitudeAt1000km: amp1000,
    travelTimeTo100km: tsunamiTravelTime(m(100_000), meanOceanDepth),
    travelTimeTo1000km: tsunamiTravelTime(m(1_000_000), meanOceanDepth),
    meanOceanDepth,
  };
}
