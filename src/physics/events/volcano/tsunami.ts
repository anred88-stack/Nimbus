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

/** Per-regime empirical prefactor in η_source = K · V^(1/3) · sin(θ).
 *
 * The Watts 2000 form has a single linear K, but real-world calibration
 * targets force two distinct values:
 *
 *   - **Subaerial / fast / rigid block** (volcanic flank collapse,
 *     rockfall into water, Anak Krakatau 2018): K ≈ 0.40, calibrated
 *     against Grilli et al. 2019 hydrocode reconstruction giving
 *     ≈ 85 m source amplitude for the 0.27 km³ flank slide at 20°.
 *
 *   - **Submarine / slow / soft sediment** (continental-margin slumps,
 *     Storegga 8 200 BP): K ≈ 0.005, calibrated against Bondevik
 *     et al. 2005 giving 5–10 m source amplitude for the 3 000 km³
 *     Norwegian slope failure at 5°. Soft-sediment slides decouple
 *     from the water column much more efficiently than a rigid block
 *     would — the V^(1/3) scaling alone over-predicts by factor 70+.
 *
 * Choosing the wrong regime drifts the source amplitude by two orders
 * of magnitude. Volcanic and rockfall callers should pass 'subaerial';
 * trans-basin submarine slides 'submarine'.
 *
 * Reference: Murty 2003 (Mar. Geol. 199) reviews regime-dependent
 * coupling efficiency; Synolakis et al. 2008 (Pageoph 165) tabulates
 * observed-vs-predicted source amplitudes across both regimes.
 */
export const VOLCANO_TSUNAMI_PREFACTOR_SUBAERIAL = 0.4;
export const VOLCANO_TSUNAMI_PREFACTOR_SUBMARINE = 0.005;

/**
 * Default prefactor — kept for back-compat with callers that did not
 * specify a regime. Resolves to the subaerial value because every
 * pre-existing caller (volcano caldera + flank slides) is in that
 * regime; the submarine path is opt-in via the new `regime` field.
 */
export const VOLCANO_TSUNAMI_PREFACTOR = VOLCANO_TSUNAMI_PREFACTOR_SUBAERIAL;

export type LandslideTsunamiRegime = 'subaerial' | 'submarine';

export interface VolcanoTsunamiInput {
  /** Collapsed block volume (m³). Anak Krakatau-class events sit at
   *  ≈ 3 × 10⁸; Krakatau-class caldera collapses at ≈ 2 × 10¹⁰. */
  collapseVolumeM3: number;
  /** Slope angle of the failure plane (rad). 20–25° for sub-aerial
   *  flank slides; 40–60° for caldera-wall collapse. */
  slopeAngleRad: number;
  /** Mean basin depth used for travel-time AND for the breaking cap
   *  unless `sourceWaterDepth` is set (m). Defaults to 1 000 m — most
   *  volcanic islands sit on a shelf much shallower than the global
   *  ocean mean. */
  meanOceanDepth?: Meters;
  /** Optional: depth of the water column AT THE SOURCE where the
   *  collapse occurs (m). When set, this controls the McCowan-style
   *  breaking cap on the source amplitude — distinct from the depth
   *  the wave PROPAGATES through (`meanOceanDepth`).
   *
   *  For Krakatau 1883 this is the post-collapse caldera depth (~250 m),
   *  NOT the surrounding shelf shallows (~50 m). Without this split,
   *  the cap on a 50 m shelf saturates a 25 km³ caldera collapse to a
   *  20 m source amplitude — physically wrong for a depression that
   *  sinks hundreds of metres. Defaults to `meanOceanDepth` for
   *  back-compat with callers that don't make the distinction. */
  sourceWaterDepth?: Meters;
  /** Regime selects the per-style prefactor. Defaults to 'subaerial'
   *  for back-compat with the volcano-collapse callers. */
  regime?: LandslideTsunamiRegime;
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
 * inputs cannot drive a wave (zero or negative volume / slope, or no
 * water column for the slide to displace — Elm 1881 sturzstrom in the
 * Glarus Alps is the canonical "subaerial, dry" archetype).
 */
export function volcanoTsunami(input: VolcanoTsunamiInput): VolcanoTsunamiResult | null {
  const V = input.collapseVolumeM3;
  const theta = input.slopeAngleRad;
  if (!Number.isFinite(V) || V <= 0) return null;
  if (!Number.isFinite(theta) || theta <= 0) return null;

  const meanOceanDepth = input.meanOceanDepth ?? m(1_000);
  // No water → no Watts source. Catches the dry-runout flank failure
  // case where a caller plumbs meanOceanDepth = 0 to flag "no basin".
  if ((meanOceanDepth as number) <= 0) return null;
  const sourceWaterDepth = input.sourceWaterDepth ?? meanOceanDepth;
  if ((sourceWaterDepth as number) <= 0) return null;
  const K =
    input.regime === 'submarine'
      ? VOLCANO_TSUNAMI_PREFACTOR_SUBMARINE
      : VOLCANO_TSUNAMI_PREFACTOR_SUBAERIAL;
  // Watts-style cube-root displacement, then saturate at 40 % of the
  // SOURCE water column to honour the McCowan 1894 wave-breaking
  // ceiling applied at the generation site. The cap uses the source
  // depth (e.g. post-collapse caldera depth ~250 m for Krakatau 1883)
  // rather than the shelf depth used for wave propagation, so that a
  // large caldera collapse on a shallow surrounding shelf is not
  // artificially clipped to the shelf height.
  const wattsAmplitude = K * Math.cbrt(V) * Math.sin(theta);
  const breakingCap = (sourceWaterDepth as number) * 0.4;
  const eta0 = Math.min(wattsAmplitude, breakingCap);
  const sourceAmplitude = m(eta0);
  // Cavity radius from collapse geometry (V^(1/3) ≈ characteristic
  // linear scale of the slide footprint), NOT from 2·η₀ as a previous
  // implementation did. The Ward-Asphaug back-derivation R_cavity =
  // 2·η₀ is correct for impact craters where the cavity is set by the
  // wave amplitude, but for slope failures the cavity is set by the
  // displaced volume — and 2·η₀ produces tens-of-metres cavities for
  // kilometres-of-collapse events, which then under-predicts far-field
  // amplitudes by 10²-10³× via the impactAmplitudeAtDistance 1/r decay.
  // For Krakatau 1883 (V = 2.5 × 10¹⁰ m³) the geometric cavity is
  // 2.9 km, which is consistent with the ~5 km caldera footprint
  // (Pelinovsky et al. 2005). For Anak Krakatau 2018 (V = 2.7 × 10⁸)
  // it is 0.65 km, consistent with the ~1 km observed slide footprint
  // (Grilli et al. 2019, Fig. 2).
  const cavityRadius = m(Math.cbrt(V));
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
