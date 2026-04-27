import { DRE_DENSITY } from '../../constants.js';
import type { Meters, SquareMeters } from '../../units.js';
import { m } from '../../units.js';
import { ashFootprint } from './ashfall.js';
import {
  ashfallArea1mm,
  climateCoolingFromVEI,
  laharRunout,
  pdcRunoutEnergyLine,
} from './extendedEffects.js';
import { plumeHeight } from './plumeHeight.js';
import { pyroclasticRunout } from './pyroclasticRunout.js';
import { volcanoTsunami, type VolcanoTsunamiResult } from './tsunami.js';
import { volcanicExplosivityIndex } from './vei.js';

export interface VolcanoScenarioInput {
  /** Volume eruption rate V̇ (m³/s) — Mastin et al. 2009 input for the
   *  Plinian plume-height scaling. */
  volumeEruptionRate: number;
  /** Total bulk ejecta volume deposited in the event (m³). Drives VEI
   *  and pyroclastic-runout scaling. */
  totalEjectaVolume: number;
  /** Optional lahar / debris-flow total volume (m³). When > 0 the
   *  result exposes an Iverson 1997 runout estimate. */
  laharVolume?: number;
  /** Optional wind speed at plume-top altitude (m/s). When > 0 the
   *  Suzuki-Bonadonna advection-diffusion ashfall model runs and the
   *  result exposes a wind-oriented 1-mm isopach footprint. */
  windSpeed?: number;
  /** Optional wind direction in degrees clockwise from geographic
   *  North (0° = northbound, 90° = eastbound). Used by the renderer
   *  to orient the isopach polygon on the globe. */
  windDirectionDegrees?: number;
  /** Optional directional lateral-blast envelope (sector flank
   *  collapse). When present the result exposes a runout ≈ 4× the
   *  axisymmetric pyroclastic runout (Glicken 1996 fit for the 18 May
   *  1980 Mt St Helens event), oriented along {@link
   *  lateralBlast.directionDeg} with the supplied opening angle. */
  lateralBlast?: {
    /** Compass azimuth of the blast axis (° clockwise from N). */
    directionDeg: number;
    /** Opening angle of the affected sector (°). Defaults to 180. */
    sectorAngleDeg?: number;
  };
  /** Optional flank- or caldera-collapse tsunami source. When present
   *  the result exposes a Watts-class wave amplitude derived from the
   *  collapsed-block volume and the failure-plane slope angle. */
  flankCollapse?: {
    /** Volume of the collapsed block (m³). */
    volumeM3: number;
    /** Slope of the failure plane (°). Defaults to 30°. */
    slopeAngleDeg?: number;
    /** Mean basin depth used for tsunami travel time (m). Defaults
     *  to 1 000 m, appropriate for the shelf around most volcanic
     *  islands. */
    meanOceanDepth?: Meters;
  };
}

/**
 * Directional lateral-blast envelope produced by a flank collapse —
 * the Mt St Helens 18 May 1980 archetype. Glicken (1996) "Rockslide-
 * debris avalanche of May 18, 1980, Mount St. Helens Volcano,
 * Washington" USGS OFR 96-677 documents a 27 km runout against a
 * standard pyroclastic-flow reach of ≈ 7 km — a ratio of ≈ 3.8 we
 * round to 4 for the popular-science display envelope. The sector is
 * an oriented elliptical cap; the inner downrange axis stretches
 * with `sectorAngleDeg` to approximate the wedge-shaped deposit
 * mapped on the ground.
 */
export interface LateralBlastResult {
  /** Reach of the lateral blast along its axis (m). */
  runout: Meters;
  /** Compass azimuth of the blast axis (° from N). */
  directionDeg: number;
  /** Opening angle of the affected sector (°). */
  sectorAngleDeg: number;
  /** Affected ground area (m²). Computed as a circular sector
   *  π · runout² · (sectorAngleDeg / 360). */
  area: SquareMeters;
}

export interface WindAdvectedAshfall {
  /** Downwind extent of the 1-mm isopach (m). */
  downwindRange: Meters;
  /** Maximum crosswind half-width of the 1-mm isopach (m). */
  crosswindHalfWidth: Meters;
  /** Downwind position of the widest crosswind half-width (m). */
  widestPointDownwind: Meters;
  /** Enclosed isopach area (m², elliptical approximation). */
  area: SquareMeters;
  /** Echo of the wind speed that drove the model (m/s). */
  windSpeed: number;
  /** Echo of the wind direction (° clockwise from North). */
  windDirectionDegrees: number;
}

export interface VolcanoScenarioResult {
  inputs: VolcanoScenarioInput;
  plumeHeight: Meters;
  vei: number;
  /** Sheridan (1979) H/L ≈ 0.1 mobility fit — statistical average. */
  pyroclasticRunout: Meters;
  /** Dade & Huppert (1998) energy-line runout — upper bound from
   *  plume-height / column-collapse mobility. */
  pyroclasticRunoutEnergyLine: Meters;
  /** Mass eruption rate (kg/s), using DRE density to convert V̇. */
  massEruptionRate: number;
  /** Peak global ΔT from stratospheric aerosol loading (K; negative
   *  = cooling). Robock 2000 / Sato 1993 VEI scaling. */
  climateCoolingK: number;
  /** Estimated 1-mm ashfall isopach area (m²). Walker 1980 / Pyle 1989. */
  ashfallArea1mm: number;
  /** Optional lahar runout (m). Present only when laharVolume > 0. */
  laharRunout?: Meters;
  /** Optional wind-advected 1-mm isopach footprint. Present only when
   *  `inputs.windSpeed > 0`. Replaces the circular ashfallArea1mm for
   *  the globe rendering; the circular envelope is retained as a
   *  rotation-invariant total-area reference. */
  windAdvectedAshfall?: WindAdvectedAshfall;
  /** Optional directional lateral-blast envelope. Present only when
   *  `inputs.lateralBlast` is supplied. */
  lateralBlast?: LateralBlastResult;
  /** Optional flank/caldera collapse tsunami source. Present only
   *  when `inputs.flankCollapse` is supplied. */
  tsunami?: VolcanoTsunamiResult;
}

/** Empirical multiplier on the axisymmetric pyroclastic runout
 *  used to estimate lateral-blast reach. Calibrated to Mt St Helens
 *  1980 (27 km blast vs ≈ 7 km PDC). */
const LATERAL_BLAST_RUNOUT_MULTIPLIER = 4;

/**
 * Composite volcano scenario — wraps the volcanic primitives into a
 * single deterministic snapshot. No new physics in this layer; see the
 * individual modules for equation-level citations.
 */
export function simulateVolcano(input: VolcanoScenarioInput): VolcanoScenarioResult {
  const H = plumeHeight({ volumeEruptionRate: input.volumeEruptionRate });
  const vei = volcanicExplosivityIndex(input.totalEjectaVolume);
  const result: VolcanoScenarioResult = {
    inputs: input,
    plumeHeight: H,
    vei,
    pyroclasticRunout: pyroclasticRunout({ ejectaVolume: input.totalEjectaVolume }),
    pyroclasticRunoutEnergyLine: pdcRunoutEnergyLine(H),
    massEruptionRate: input.volumeEruptionRate * (DRE_DENSITY as number),
    climateCoolingK: climateCoolingFromVEI(vei),
    ashfallArea1mm: ashfallArea1mm(input.totalEjectaVolume),
  };
  if (input.laharVolume !== undefined && input.laharVolume > 0) {
    result.laharRunout = laharRunout(input.laharVolume);
  }
  if (input.windSpeed !== undefined && input.windSpeed > 0) {
    const footprint = ashFootprint({
      plumeHeight: H,
      totalEjectaVolume: input.totalEjectaVolume,
      windSpeed: input.windSpeed,
    });
    result.windAdvectedAshfall = {
      downwindRange: footprint.downwindRange,
      crosswindHalfWidth: footprint.crosswindHalfWidth,
      widestPointDownwind: footprint.widestPointDownwind,
      area: footprint.area,
      windSpeed: input.windSpeed,
      windDirectionDegrees: input.windDirectionDegrees ?? 90, // eastbound default
    };
  }
  if (input.lateralBlast !== undefined) {
    const sectorAngleDeg = input.lateralBlast.sectorAngleDeg ?? 180;
    const runoutMeters = (result.pyroclasticRunout as number) * LATERAL_BLAST_RUNOUT_MULTIPLIER;
    const sectorAreaM2 = Math.PI * runoutMeters * runoutMeters * (sectorAngleDeg / 360);
    result.lateralBlast = {
      runout: m(runoutMeters),
      directionDeg: input.lateralBlast.directionDeg,
      sectorAngleDeg,
      area: sectorAreaM2 as SquareMeters,
    };
  }
  if (input.flankCollapse !== undefined) {
    const slopeDeg = input.flankCollapse.slopeAngleDeg ?? 30;
    const tsunami = volcanoTsunami({
      collapseVolumeM3: input.flankCollapse.volumeM3,
      slopeAngleRad: (slopeDeg * Math.PI) / 180,
      ...(input.flankCollapse.meanOceanDepth !== undefined && {
        meanOceanDepth: input.flankCollapse.meanOceanDepth,
      }),
    });
    if (tsunami !== null) result.tsunami = tsunami;
  }
  return result;
}

/**
 * Canonical volcano presets used for the UI gallery and CLI. Figures
 * reconstructed from the standard historical references (Self 1992 for
 * Krakatoa; Glicken 1996 for Mt St Helens; Oppenheimer 2003 for Tambora).
 */
export const VOLCANO_PRESETS = {
  /** 26–27 August 1883 Krakatau, Sunda Strait — VEI 6, ≈ 20 km³ bulk.
   *  The caldera-floor collapse on the second day drained ≈ 25 km³
   *  of edifice into the Sunda Strait, generating the basin-scale
   *  tsunami that killed 36 000 people on the surrounding coasts
   *  (Self 1992; Maeno & Imamura 2011). */
  KRAKATAU_1883: {
    name: 'Krakatau 1883',
    note: 'Sunda Strait paroxysmal eruption + caldera-collapse tsunami, VEI 6',
    input: {
      volumeEruptionRate: 2e5,
      totalEjectaVolume: 2e10,
      flankCollapse: { volumeM3: 2.5e10, slopeAngleDeg: 45, meanOceanDepth: m(50) },
    } satisfies VolcanoScenarioInput,
  },
  /** 18 May 1980 Mount St. Helens, Washington — VEI 5, ≈ 1.2 km³.
   *  The cryptodome bulge slid northward and decompressed into a
   *  ≈ 180° lateral blast that scoured ≈ 600 km² in the first
   *  minutes of the eruption (Glicken 1996, USGS OFR 96-677). */
  MT_ST_HELENS_1980: {
    name: 'Mount St. Helens 1980',
    note: 'Cascade-arc lateral blast + Plinian column, VEI 5',
    input: {
      volumeEruptionRate: 4e3,
      totalEjectaVolume: 1.2e9,
      lateralBlast: { directionDeg: 0, sectorAngleDeg: 180 }, // due-N flank
    } satisfies VolcanoScenarioInput,
  },
  /** April 1815 Tambora, Sumbawa — VEI 7, ≈ 140 km³, "year without
   *  a summer" climate event. */
  TAMBORA_1815: {
    name: 'Tambora 1815',
    note: 'Largest eruption in recorded history, VEI 7',
    input: {
      volumeEruptionRate: 5e5,
      totalEjectaVolume: 1.4e11,
    } satisfies VolcanoScenarioInput,
  },
  /** 22 December 2018 Anak Krakatau — flank collapse archetype.
   *  ≈ 0.27 km³ of the south-western edifice slid into the Sunda
   *  Strait, generating an ≈ 85 m source-amplitude tsunami that
   *  killed 437 people on Sumatra and Java. VEI 3 eruption itself
   *  but the secondary tsunami is the headline event. */
  ANAK_KRAKATAU_2018: {
    name: 'Anak Krakatau 2018',
    note: 'Flank-collapse tsunami, ≈ 0.27 km³ block — Grilli et al. 2019',
    input: {
      volumeEruptionRate: 1e3,
      totalEjectaVolume: 1e7,
      flankCollapse: { volumeM3: 2.7e8, slopeAngleDeg: 20, meanOceanDepth: m(200) },
    } satisfies VolcanoScenarioInput,
  },
  /** 15 June 1991 Pinatubo, Philippines — VEI 6, ≈ 10 km³ bulk.
   *  Best-instrumented large eruption to date; observed ΔT ≈ −0.5 K
   *  globally for 1991–1993. */
  PINATUBO_1991: {
    name: 'Pinatubo 1991',
    note: 'Best-instrumented VEI 6 eruption — Koyaguchi & Tokuno 1993',
    input: {
      volumeEruptionRate: 2e5,
      totalEjectaVolume: 1e10,
      laharVolume: 5e8,
    } satisfies VolcanoScenarioInput,
  },
  /** 24 August 79 CE Vesuvius, Campania — VEI 5, ≈ 4 km³ bulk DRE.
   *  The Plinian column rose to ≈ 32 km, the cap collapse generated
   *  pyroclastic density currents that buried Pompeii (16 km SE),
   *  Herculaneum (7 km W) and Stabiae. The Pompeii archive is the
   *  type locality for "Plinian eruption" naming. References:
   *  Sigurdsson et al. (1985) "The Eruption of Vesuvius in A.D. 79."
   *  National Geographic Research 1: 332-387; Cioni et al. (1992)
   *  "The Plinian eruption of Vesuvius (A.D. 79): a model for the
   *  generation of pyroclastic density currents." J. Volcanol.
   *  Geotherm. Res. 51: 89-115. DOI: 10.1016/0377-0273(92)90061-H. */
  VESUVIUS_79_CE: {
    name: 'Vesuvius 79 CE',
    note: 'Plinian eruption that buried Pompeii and Herculaneum — Cioni et al. 1992, JVGR 51: 89. Type locality for the "Plinian" classification.',
    input: {
      volumeEruptionRate: 1.5e5,
      totalEjectaVolume: 4e9,
    } satisfies VolcanoScenarioInput,
  },
  /** 8 March – 11 July 1669 Etna, Sicily — VEI 4 effusive-explosive
   *  eruption, ≈ 0.6 km³ DRE lava and ≈ 0.05 km³ DRE tephra. The
   *  Monti Rossi cinder cone formed near Nicolosi; the Mongibello-
   *  type lava flow reached the city of Catania (≈ 17 km from the
   *  vent) and breached the city walls, destroying ~17 villages and
   *  rebuilding the Sicilian eastern coastline. Reference: Branca
   *  et al. (2013) "Mount Etna's 1669 eruption." Bull. Volcanol. 75:
   *  694. DOI: 10.1007/s00445-012-0694-x. */
  ETNA_1669: {
    name: 'Etna 1669',
    note: '5-month flank eruption that reached Catania — Branca et al. 2013, Bull. Volcanol. 75: 694. Largest historical Etna event.',
    input: {
      volumeEruptionRate: 5e2,
      totalEjectaVolume: 6.5e8,
    } satisfies VolcanoScenarioInput,
  },
  /** 15 January 2022 Hunga Tonga–Hunga Haʻapai, Tonga — VEI 5–6
   *  paroxysmal phreatomagmatic explosion. The eruption column
   *  reached ≈ 57 km altitude (highest ever observed by satellite,
   *  penetrating the mesosphere), the atmospheric pressure wave
   *  travelled around the globe four times, and the seafloor
   *  caldera-collapse tsunami was registered worldwide. Reference:
   *  Carr et al. (2022) "Mesospheric ash and water vapor from the
   *  Hunga Tonga eruption." Science 378 (6622): 1257-1262.
   *  DOI: 10.1126/science.abq2299. */
  HUNGA_TONGA_2022: {
    name: 'Hunga Tonga 2022',
    note: '57 km plume into the mesosphere — Carr et al. 2022, Science 378: 1257. Tsunami registered globally; only event reaching the upper atmosphere on instrumental record.',
    input: {
      volumeEruptionRate: 8e5,
      totalEjectaVolume: 1.9e9,
      flankCollapse: { volumeM3: 6.5e9, slopeAngleDeg: 30, meanOceanDepth: m(150) },
    } satisfies VolcanoScenarioInput,
  },
  /** 14 April – 23 May 2010 Eyjafjallajökull, Iceland — VEI 4
   *  subglacial eruption, ≈ 0.27 km³ DRE. The fine ash dispersed by
   *  high-altitude jet-stream winds caused the largest-scale air-
   *  traffic shutdown in European history (≈ 100 000 cancelled
   *  flights, six-day no-fly across northern Europe). Reference:
   *  Gudmundsson et al. (2012) "Ash generation and distribution from
   *  the April-May 2010 eruption of Eyjafjallajökull, Iceland."
   *  Sci. Rep. 2: 572. DOI: 10.1038/srep00572. */
  EYJAFJALLAJOKULL_2010: {
    name: 'Eyjafjallajökull 2010',
    note: 'Subglacial eruption that grounded European aviation — Gudmundsson et al. 2012, Sci. Rep. 2: 572. Showcases the ashfall hazard for aviation.',
    input: {
      volumeEruptionRate: 5e3,
      totalEjectaVolume: 2.7e8,
    } satisfies VolcanoScenarioInput,
  },
  /** 8 May 1902 Mt Pelée, Martinique — VEI 4, ≈ 0.5 km³ ejected.
   *  Type locality for the "Peléan" eruption: a glowing nuée
   *  ardente (pyroclastic density current) descended the southern
   *  flank and incinerated Saint-Pierre, killing ≈ 28 000 people in
   *  three minutes. The Lacroix description of the event founded
   *  modern volcanology of pyroclastic flows. Reference: Lacroix
   *  (1904) "La Montagne Pelée et ses Éruptions." Masson, Paris;
   *  Tanguy (1994) "Rapid dome growth at Montagne Pelée during the
   *  early stages of the 1902-1905 eruption." Bull. Volcanol. 56:
   *  269-285. DOI: 10.1007/BF00302079. */
  MOUNT_PELEE_1902: {
    name: 'Mount Pelée 1902',
    note: 'Type locality for "nuée ardente" — Lacroix 1904; Tanguy 1994, Bull. Volcanol. 56: 269. ≈ 28 000 fatalities in Saint-Pierre.',
    input: {
      volumeEruptionRate: 1e4,
      totalEjectaVolume: 5e8,
      lateralBlast: { directionDeg: 180, sectorAngleDeg: 90 },
    } satisfies VolcanoScenarioInput,
  },
} as const;

export type VolcanoPresetId = keyof typeof VOLCANO_PRESETS;
