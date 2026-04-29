import type { Meters, Seconds, SquareMeters } from '../../units.js';
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
  /** Optional: planform area of the slide footprint (m²). When set,
   *  the equivalent cavity radius is sqrt(area/π) — appropriate for
   *  elongated submarine slumps where the V^(1/3) generic estimate
   *  under-counts the line-source character.
   *
   *  Storegga ~8 200 BP is the canonical case: ≈ 290 km long × ≈ 100 km
   *  wide footprint over 250 m thickness gives V^(1/3) = 14 km but a
   *  proper equivalent-disc radius of ≈ 96 km. The 1/r far-field decay
   *  over 14 km vs 96 km is a ~7× under-prediction at trans-Atlantic
   *  ranges, which matters for Bondevik 2005 Sula / Shetland comparison.
   *  For compact volcanic flank collapses (Anak Krakatau ~1 km block),
   *  V^(1/3) is already a good approximation; the field is opt-in. */
  slideFootprintArea?: SquareMeters;
  /** Optional: planform area of the CONFINED BASIN (reservoir, fjord)
   *  the slide enters (m²). When set, the source amplitude is
   *  computed as the basin-fill formula
   *
   *      η_source = min(V / A_basin × confinementDynamicFactor,
   *                     sourceWaterDepth)
   *
   *  instead of the open-ocean Watts cube-root form. Confined-basin
   *  slides cannot dissipate energy by 2D radial spreading — the
   *  displaced volume raises the basin water level uniformly to first
   *  order, and the dynamic (impulsive-entry) amplification multiplies
   *  that static rise by ~2-4. Cap is the basin depth (the wave
   *  cannot exceed the water column it lives in).
   *
   *  Calibration anchors (with `confinementDynamicFactor` defaulting
   *  to 3, calibrated below):
   *    - Vaiont 1963 (V = 2.7 × 10⁸ m³, A_res ≈ 3 × 10⁶ m², depth ≈
   *      250 m at the dam): η_static = 90 m, dynamic ×3 = 270 m,
   *      capped at 250 m — matches the observed 250 m wave height
   *      that overtopped the dam (Genevois & Ghirotti 2005, Giorn.
   *      Geol. Appl. 1: 41).
   *    - Lituya Bay 1958 still acknowledged as out-of-model: even
   *      the basin-fill formula under-predicts the 524 m run-up
   *      because the steep fjord walls produce splash-up effects
   *      Watts-class models cannot capture (Walder et al. 2003,
   *      Pure Appl. Geophys. 160). */
  confinedBasinArea?: SquareMeters;
  /** Optional dynamic-amplification factor applied on top of the
   *  static V/A basin rise when `confinedBasinArea` is set. Defaults
   *  to 3.0 (calibrated against Vaiont). Values 2-4 are physically
   *  defensible for impulsive slide entries; higher values capture
   *  resonant sloshing modes specific to certain basin geometries. */
  confinementDynamicFactor?: number;
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
  // Source amplitude: two-branch logic.
  //
  // (a) Confined basin (Vaiont reservoir, fjord rockfalls). When the
  // caller passes `confinedBasinArea` we use the basin-fill formula
  //
  //     η_source = min(V / A_basin × confinementDynamicFactor,
  //                    sourceWaterDepth)
  //
  // The slide volume raises the basin level uniformly (V/A static
  // rise) and the impulsive entry amplifies that by a calibrated
  // factor (default 3, matching Vaiont 1963). The cap is the basin
  // depth — wave cannot exceed the water column it lives in, but is
  // NOT subject to the McCowan 0.4·h breaking cap because confined-
  // basin sloshing modes can transiently exceed solitary-wave limits.
  //
  // (b) Open-ocean (every existing caller). The Watts (2000)
  // cube-root form K · V^(1/3) · sin(θ) saturated at 40 % of the
  // SOURCE water column to honour the McCowan 1894 wave-breaking
  // ceiling applied at the generation site.
  const basinArea = input.confinedBasinArea as number | undefined;
  const confinementFactor = input.confinementDynamicFactor ?? 3.0;
  let eta0: number;
  if (basinArea !== undefined && Number.isFinite(basinArea) && basinArea > 0) {
    const staticRise = V / basinArea;
    const dynamicAmp = staticRise * confinementFactor;
    eta0 = Math.min(dynamicAmp, sourceWaterDepth);
  } else {
    const wattsAmplitude = K * Math.cbrt(V) * Math.sin(theta);
    const breakingCap = (sourceWaterDepth as number) * 0.4;
    eta0 = Math.min(wattsAmplitude, breakingCap);
  }
  const sourceAmplitude = m(eta0);
  // Cavity radius from collapse geometry (V^(1/3) ≈ characteristic
  // linear scale of the slide footprint), NOT from 2·η₀ as a previous
  // implementation did. The Ward-Asphaug back-derivation R_cavity =
  // 2·η₀ is correct for impact craters where the cavity is set by the
  // wave amplitude, but for slope failures the cavity is set by the
  // displaced volume — and 2·η₀ produces tens-of-metres cavities for
  // kilometres-of-collapse events, which then under-predicts far-field
  // amplitudes by 10²-10³× via the impactAmplitudeAtDistance 1/r decay.
  //
  // For elongated slumps (Storegga 290×100 km footprint) the V^(1/3)
  // generic estimate under-counts the line-source character; callers
  // can pass `slideFootprintArea` for an equivalent-disc radius
  // sqrt(A/π) that captures the actual planform spread.
  //
  // Calibration anchors: Krakatau 1883 (V = 2.5 × 10¹⁰ m³) → 2.9 km
  // ≈ 5 km caldera footprint (Pelinovsky et al. 2005); Anak Krakatau
  // 2018 (V = 2.7 × 10⁸) → 0.65 km ≈ 1 km observed slide footprint
  // (Grilli et al. 2019); Storegga (V = 3 × 10¹², A = 2.9 × 10¹⁰ m²)
  // → 96 km vs V^(1/3) = 14 km, matching Bondevik 2005 Fig. 1.
  const footprintArea = input.slideFootprintArea as number | undefined;
  const cavityRadius = m(
    footprintArea !== undefined && Number.isFinite(footprintArea) && footprintArea > 0
      ? Math.sqrt(footprintArea / Math.PI)
      : Math.cbrt(V),
  );
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
