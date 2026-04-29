import type { Meters, SquareMeters } from '../../units.js';
import { m } from '../../units.js';
import { volcanoTsunami, type VolcanoTsunamiResult } from '../volcano/tsunami.js';

/**
 * Submarine / sub-aerial landslide tsunami source.
 *
 * Mass-failure events on coastal slopes and continental margins are
 * the third major tsunami-generation pathway alongside seismic uplift
 * and volcanic collapse. The same Watts (2000) cube-root scaling that
 * the volcano module uses applies here — the landslide block volume,
 * combined with the failure-plane slope, sets the initial wave
 * amplitude. We reuse {@link volcanoTsunami} verbatim so the two
 * cascades share calibration and the report numbers stay comparable.
 *
 * Three benchmark events anchor the parameter space:
 *   - Lituya Bay 1958 (Alaska, sub-aerial fjord rockfall): observed
 *     run-up of 524 m on the opposite shore. The fjord geometry and
 *     reflection/focusing effects mean this scenario CANNOT be
 *     reproduced by an open-ocean Watts source — the popular-science
 *     model under-predicts by ≈ an order of magnitude. We ship the
 *     preset for educational comparison, NOT as a validation case.
 *   - Storegga ~8 200 BP (Norwegian continental slope, ≈ 3 000 km³
 *     submarine slide): trans-Atlantic tsunami, observed coastal
 *     run-up 10–25 m. (Bondevik et al. 2005, Marine Geology 215.)
 *   - Anak Krakatau 22 Dec 2018 (sub-aerial flank collapse, ≈ 0.27
 *     km³): also surfaced as a volcano preset; included here so
 *     users can compare the "landslide" framing to the "volcanic
 *     collapse" framing of the same physical event.
 *
 * References:
 *   Watts, P. (2000). "Tsunami features of solid block underwater
 *     landslides." J. Waterway Port Coastal Ocean Eng., 126(3): 144–152.
 *   Synolakis, C. E. et al. (2008). "Validation and verification of
 *     tsunami numerical models." Pure Appl. Geophys. 165, 2197–2228.
 *   Bondevik, S. et al. (2005). "The Storegga slide tsunami —
 *     comparing field observations with numerical simulations."
 *     Marine and Petroleum Geology 22 (1–2), 195–208.
 */

export type LandslideRegime = 'submarine' | 'subaerial';

export interface LandslideScenarioInput {
  /** Volume of the failed block (m³). Sub-aerial events sit at
   *  ≈ 10⁵ – 10⁹; submarine continental-margin events at ≈ 10⁹ – 10¹². */
  volumeM3: number;
  /** Slope of the failure plane (°). 5–15° for submarine slumps,
   *  20–40° for sub-aerial flank collapses. Defaults to 20°. */
  slopeAngleDeg?: number;
  /** Mean basin depth used for tsunami travel-time (m). Defaults to
   *  1 000 m (continental shelf); set to a larger value for open-
   *  ocean submarine slides. */
  meanOceanDepth?: Meters;
  /** Optional planform area of the slide footprint (m²). When set,
   *  the equivalent cavity radius driving the 1/r far-field decay is
   *  sqrt(A/π) instead of the V^(1/3) generic estimate — important
   *  for elongated slumps (e.g. Storegga, 290 × 100 km footprint
   *  gives 96 km vs V^(1/3) = 14 km, a 7× difference at trans-basin
   *  ranges). For compact rockfalls and flank collapses (Anak
   *  Krakatau, Lituya, Vaiont), V^(1/3) is already a good estimate
   *  and this field can be omitted. */
  slideFootprintArea?: SquareMeters;
  /** Optional planform area of the CONFINED BASIN the slide enters
   *  (m²). When set, source amplitude is computed as the basin-fill
   *  formula `η = V/A × dynamic_factor` capped at `meanOceanDepth`,
   *  instead of the open-ocean Watts cube-root form. Use this for
   *  reservoirs, fjords, and other geometrically confined cases
   *  where 2D radial spreading does not apply (Vaiont 1963 is the
   *  textbook case; Lituya Bay 1958 partially). */
  confinedBasinArea?: SquareMeters;
  /** Optional dynamic-amplification factor for the confined-basin
   *  formula above. Defaults to 3.0 (calibrated against Vaiont). */
  confinementDynamicFactor?: number;
  /** Qualitative tag: 'submarine' (sliding sediment on the seafloor)
   *  vs 'subaerial' (rockfall or flank collapse entering water).
   *  Currently used only as metadata in the report; both regimes use
   *  the same Watts source formula in this layer. */
  regime?: LandslideRegime;
}

export interface LandslideScenarioResult {
  inputs: LandslideScenarioInput;
  /** Linear extent of the failed block, V^(1/3) (m). Useful as a
   *  "how big is the slide" sanity check in the report. */
  characteristicLength: Meters;
  /** Effective failure-plane area (m²), V^(2/3). Cosmetic for the
   *  report; not consumed downstream. */
  characteristicArea: SquareMeters;
  /** Tsunami source produced by the slide. Always present for a
   *  positive volume + slope; null only when the inputs are
   *  ill-formed. */
  tsunami: VolcanoTsunamiResult | null;
  /** Echo of the regime tag for the report. Defaults to 'submarine'. */
  regime: LandslideRegime;
}

/**
 * Deterministic Layer-2 landslide-tsunami evaluator. No randomness,
 * no I/O, no framework imports.
 */
export function simulateLandslide(input: LandslideScenarioInput): LandslideScenarioResult {
  const slopeDeg = input.slopeAngleDeg ?? 20;
  const regime = input.regime ?? 'submarine';
  const sideLength = Math.cbrt(Math.max(input.volumeM3, 0));
  const tsunami = volcanoTsunami({
    collapseVolumeM3: input.volumeM3,
    slopeAngleRad: (slopeDeg * Math.PI) / 180,
    regime,
    ...(input.meanOceanDepth !== undefined && { meanOceanDepth: input.meanOceanDepth }),
    ...(input.slideFootprintArea !== undefined && {
      slideFootprintArea: input.slideFootprintArea,
    }),
    ...(input.confinedBasinArea !== undefined && {
      confinedBasinArea: input.confinedBasinArea,
    }),
    ...(input.confinementDynamicFactor !== undefined && {
      confinementDynamicFactor: input.confinementDynamicFactor,
    }),
  });
  return {
    inputs: input,
    characteristicLength: m(sideLength),
    characteristicArea: (sideLength * sideLength) as SquareMeters,
    tsunami,
    regime,
  };
}

/**
 * Canonical landslide-tsunami presets used for the UI gallery and CLI.
 * See the module header for caveats — Lituya in particular is included
 * for educational comparison, not as a validation target.
 */
export const LANDSLIDE_PRESETS = {
  /** 9 July 1958 Lituya Bay, Alaska — ≈ 30 × 10⁶ m³ rockfall into a
   *  fjord. The reference 524 m run-up cannot be reproduced by an
   *  open-ocean Watts source (Walder et al. 2003). */
  LITUYA_BAY_1958: {
    name: 'Lituya Bay 1958',
    note: 'Sub-aerial fjord rockfall; open-ocean model under-predicts the 524 m run-up',
    input: {
      volumeM3: 3e7,
      slopeAngleDeg: 35,
      meanOceanDepth: m(120),
      regime: 'subaerial',
    } satisfies LandslideScenarioInput,
  },
  /** ≈ 8 200 BP Storegga submarine slide, Norwegian continental
   *  slope — ≈ 3 000 km³ of sediment, basin-scale tsunami.
   *  Slide footprint ≈ 290 km long × 100 km wide along the slope
   *  (Bondevik et al. 2005 Fig. 1; Bryn et al. 2005 MPGS 22:11),
   *  yielding an equivalent-disc cavity radius of ≈ 96 km — far
   *  larger than the V^(1/3) = 14 km generic estimate, so we set
   *  `slideFootprintArea` explicitly. Without this, the 1/r decay
   *  at trans-Atlantic ranges (Sula 600 km, Shetland 950 km)
   *  under-predicts by ~7×. */
  STOREGGA_8200_BP: {
    name: 'Storegga ≈ 8 200 BP',
    note: 'Norwegian continental-margin submarine slide; trans-Atlantic tsunami',
    input: {
      volumeM3: 3e12,
      slopeAngleDeg: 5,
      meanOceanDepth: m(1_500),
      slideFootprintArea: 2.9e10 as SquareMeters,
      regime: 'submarine',
    } satisfies LandslideScenarioInput,
  },
  /** 22 December 2018 Anak Krakatau flank collapse (also exposed as
   *  a volcano preset for cross-comparison). */
  ANAK_KRAKATAU_2018: {
    name: 'Anak Krakatau 2018 (slide framing)',
    note: 'Sub-aerial flank collapse — same physical event as the volcano preset, framed as a slide',
    input: {
      volumeM3: 2.7e8,
      slopeAngleDeg: 20,
      meanOceanDepth: m(200),
      regime: 'subaerial',
    } satisfies LandslideScenarioInput,
  },
  /** 9 October 1963 Vaiont reservoir, Dolomites (Friuli, Italy) —
   *  ≈ 270 × 10⁶ m³ of Mt Toc detached and slid into the just-filled
   *  reservoir behind the Vaiont dam at ≈ 30 m/s. The displaced
   *  reservoir water generated a ≈ 250 m wave that overtopped the
   *  263 m double-curvature dam (which itself survived intact) and
   *  swept down the Piave valley, destroying Longarone, Pirago,
   *  Rivalta and Villanova in minutes; ≈ 1 917 fatalities. The dam-
   *  failure-without-failure remains the textbook case study for
   *  reservoir-triggered landslides and engineering ethics in
   *  geotechnical practice. References: Müller (1964) "The rock
   *  slide in the Vajont valley." Rock Mech. Eng. Geol. 2: 148-212;
   *  Genevois & Ghirotti (2005) "The 1963 Vajont landslide."
   *  Giorn. Geol. Appl. 1: 41-52. DOI: 10.1474/GGA.2005-01.0-05.0005. */
  VAIONT_1963: {
    name: 'Vaiont 1963',
    note: '≈ 270 Mm³ rockslide into the Vaiont reservoir; ≈ 250 m wave overtopped the dam, ≈ 1 917 fatalities — Genevois & Ghirotti 2005, GGA 1: 41. Type case for reservoir-triggered landslides; uses the confined-basin formula because open-ocean Watts spreading does not apply to a 3 km² reservoir.',
    input: {
      volumeM3: 2.7e8,
      slopeAngleDeg: 35,
      // meanOceanDepth = 250 m: maximum reservoir depth at the dam,
      //   used as the source-amplitude cap (a wave can't be taller
      //   than the basin it sloshes in).
      // confinedBasinArea = 3 × 10⁶ m²: reservoir surface area
      //   (Müller 1964 Rock Mech. Eng. Geol. 2: 148, Fig. 3). Triggers
      //   the basin-fill formula η = V/A × 3 = 270 m, capped to 250 m
      //   — matches the observed wave height at the dam.
      meanOceanDepth: m(250),
      confinedBasinArea: 3e6 as SquareMeters,
      regime: 'subaerial',
    } satisfies LandslideScenarioInput,
  },
  /** 11 September 1881 Elm rockslide, Glarus Alps, Switzerland —
   *  ≈ 10 × 10⁶ m³ of slate-quarry detritus failed catastrophically
   *  on a steep cliff face, descended ≈ 600 m vertically and ran out
   *  ≈ 2 km across the village of Elm with mean fragment-debris
   *  velocity ≈ 70 m/s; ≈ 115 fatalities. Heim's first-hand account
   *  of the runout founded the modern understanding of long-runout
   *  ("sturzstrom") rock avalanches. Reference: Heim (1932)
   *  "Bergsturz und Menschenleben." Vierteljahrsschrift Naturf.
   *  Ges. Zürich 77: 1-218; Hsü (1975) "Catastrophic debris
   *  streams." GSA Bull. 86: 129-140. DOI: 10.1130/0016-7606(1975)86. */
  ELM_1881: {
    name: 'Elm 1881',
    note: '≈ 10 Mm³ rock avalanche, Glarus Alps — Heim 1932; Hsü 1975, GSA Bull. 86: 129. Founding case study for long-runout "sturzstrom" mobility.',
    input: {
      volumeM3: 1e7,
      slopeAngleDeg: 60,
      meanOceanDepth: m(0),
      regime: 'subaerial',
    } satisfies LandslideScenarioInput,
  },
} as const;

export type LandslidePresetId = keyof typeof LANDSLIDE_PRESETS;
