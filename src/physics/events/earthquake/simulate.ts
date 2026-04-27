import { nehrpClassFromVs30, type NEHRPClass } from '../../elevation/index.js';
import type { Meters, MetersPerSecondSquared, NewtonMeters } from '../../units.js';
import { m } from '../../units.js';
import { generateAftershockSequence, type AftershockSequenceResult } from './aftershocks.js';
import {
  distanceForPga,
  peakGroundAcceleration,
  peakGroundAccelerationNGAWest2,
  type NGAFaultType,
} from './attenuation.js';
import {
  mmiFromPgaEuropean,
  modifiedMercalliIntensity,
  pgaFromMercalliIntensity,
} from './intensity.js';
import { liquefactionRadius } from './liquefaction.js';
import {
  megathrustRuptureLength,
  megathrustRuptureWidth,
  surfaceRuptureLength,
  surfaceRuptureWidth,
  type FaultType,
} from './ruptureLength.js';
import { seismicMomentFromMagnitude } from './seismicMoment.js';
import { seismicTsunamiFromMegathrust, type SeismicTsunamiResult } from './seismicTsunami.js';

/**
 * Free inputs for an earthquake scenario. `depth` is informational for
 * now: the Joyner–Boore fit embeds a fixed 7.3 km saturation depth, so
 * passing a user depth does not re-tune the attenuation. Kept on the
 * API so a future GMPE swap (e.g. ASK14 with a depth term) can honour
 * it without breaking callers.
 */
export interface EarthquakeScenarioInput {
  magnitude: number;
  depth?: Meters;
  faultType?: FaultType;
  /** Vs30 (m/s) — upper-30 m shear-wave velocity at the reference
   *  site. Defaults to 760 (rock). Soft soils amplify PGA ~1.5×. */
  vs30?: number;
  /** When true, use the Strasser 2010 interface rupture-length
   *  scaling instead of Wells & Coppersmith. */
  subductionInterface?: boolean;
  /** Water depth at the epicentre (m). 0 or omitted → continental /
   *  intra-plate scenario. Any positive value flags the event as
   *  submarine: the felt-intensity contours are still emitted (a
   *  shoreline at 100 km still shakes), but the result carries an
   *  `isSubmarine` flag the renderer uses to fade them out and the
   *  tsunami auto-trigger fires for any shallow thrust/normal event
   *  with Mw ≥ 6.5 — without forcing the user to manually toggle
   *  `subductionInterface`. */
  waterDepth?: Meters;
  /** Beach slope (rad) for the Synolakis (1987) coastal run-up in
   *  the seismic-source tsunami block. Defaults to `atan(0.01)`
   *  (1:100 plane beach) when omitted. The store auto-derives a
   *  DEM-driven value when the click point is on land with a
   *  meaningful slope. */
  coastalBeachSlopeRad?: number;
  /** Strike azimuth (degrees clockwise from geographic North). Drives
   *  the orientation of the extended-source rupture rectangle used by
   *  the stadium MMI contours for Mw ≥ 7.5 / megathrust events. When
   *  omitted, defaults to 0 (rupture aligned N–S) — fine for the small
   *  point-source events where the stadium degenerates to a circle. */
  strikeAzimuthDeg?: number;
}

/**
 * Felt-intensity and PGA summary emitted for every earthquake scenario.
 * The three `mmi*` radii collapse to 0 m when the magnitude is too low
 * to sustain that intensity at the epicentre — callers should hide
 * rings with a zero radius.
 */
export interface EarthquakeShakingResult {
  /** Peak ground acceleration 20 km from the epicentre (m/s²). */
  pgaAt20km: MetersPerSecondSquared;
  /** Peak ground acceleration 100 km from the epicentre (m/s²). */
  pgaAt100km: MetersPerSecondSquared;
  /** BSSA14 PGA @ 20 km (NGA-West2 modern estimator, Vs30 aware). */
  pgaAt20kmNGA: MetersPerSecondSquared;
  /** BSSA14 PGA @ 100 km. */
  pgaAt100kmNGA: MetersPerSecondSquared;
  /** Epicentral MMI (Worden 2012 California fit), clamped to [1, 12]. */
  mmiAtEpicenter: number;
  /** Epicentral MMI using the Faenza & Michelini (2010) Italian /
   *  European calibration — use this for events on the Eurasian plate. */
  mmiAtEpicenterEurope: number;
  /** Ground range to the MMI VII contour (strong shaking). */
  mmi7Radius: Meters;
  /** Ground range to the MMI VIII contour (severe shaking). */
  mmi8Radius: Meters;
  /** Ground range to the MMI IX contour (violent shaking). */
  mmi9Radius: Meters;
  /** Ground-range radius within which liquefaction on saturated sandy
   *  soil is likely (Youd & Idriss 2001 magnitude-scaling threshold). */
  liquefactionRadius: Meters;
  /** Vs30 (m/s) used for the NGA-West2 site factor. Echoes the user's
   *  override when set, otherwise the default rock reference (760). */
  siteVs30: number;
  /** NEHRP site class corresponding to {@link siteVs30}. */
  siteClass: NEHRPClass;
}

export interface EarthquakeScenarioResult {
  inputs: EarthquakeScenarioInput;
  seismicMoment: NewtonMeters;
  ruptureLength: Meters;
  /** Down-dip rupture width W (m) — Wells & Coppersmith 1994 Table 2A
   *  for crustal events, Strasser 2010 for explicit megathrusts. The
   *  globe renderer uses (L, W, strikeAzimuthDeg) to lay out the
   *  surface-projection rectangle that the stadium MMI contours
   *  inflate around. */
  ruptureWidth: Meters;
  /** True when the renderer should treat this event as an extended
   *  source (rupture rectangle ≫ point) for the MMI contours. Set
   *  whenever Mw ≥ 7.5 OR the user toggled `subductionInterface`.
   *  At smaller magnitudes the rupture is inside the MMI VII
   *  point-source radius and the stadium degenerates to a circle, so
   *  the existing point-source ring is kept. */
  isExtendedSource: boolean;
  shaking: EarthquakeShakingResult;
  /** Cross-module bridge: when the event is a subduction-interface
   *  megathrust OR a shallow submarine thrust/normal at Mw ≥ 6.5,
   *  the earthquake feeds the tsunami pipeline and emits a
   *  seismic-source tsunami block. Omitted otherwise. */
  tsunami?: SeismicTsunamiResult;
  /** True when {@link EarthquakeScenarioInput.waterDepth} was
   *  supplied positive — i.e. the epicentre lies on the seafloor.
   *  The renderer uses this to fade the on-globe MMI contour rings
   *  (felt-intensity is a land-coupled scale; the contour radii
   *  remain physically valid where they cross the shoreline, but
   *  must NOT be read as ground-shaking levels on open water). */
  isSubmarine: boolean;
  /** Echo of the water depth at the epicentre (m), or 0 when the
   *  scenario is continental. Surfaces in the report panel as the
   *  "submarine epicentre" detail. */
  submarineDepth: Meters;
  /** Reasenberg-Jones / Båth / Omori-Utsu / Gutenberg-Richter
   *  aftershock catalogue. Generated for every result with a seed
   *  derived from the inputs so the same scenario produces the same
   *  sequence (URL-shareable contract). */
  aftershocks: AftershockSequenceResult;
}

/**
 * Deterministic Layer-2 earthquake scenario: bundles the Hanks–Kanamori
 * seismic moment, Wells–Coppersmith rupture length, and Joyner–Boore +
 * Worden ground-motion pipeline into a single snapshot for the UI.
 *
 * No randomness, no I/O, no framework imports — runs unchanged from
 * the Node CLI, a Comlink worker, or a Vitest unit. See the individual
 * formula modules for equation-level citations.
 */
export function simulateEarthquake(input: EarthquakeScenarioInput): EarthquakeScenarioResult {
  const faultType = input.faultType ?? 'all';
  const vs30 = input.vs30 ?? 760;
  const seismicMoment = seismicMomentFromMagnitude(input.magnitude);
  const ruptureLength = input.subductionInterface
    ? megathrustRuptureLength(input.magnitude)
    : surfaceRuptureLength({ magnitude: input.magnitude, faultType });
  const ruptureWidth = input.subductionInterface
    ? megathrustRuptureWidth(input.magnitude)
    : surfaceRuptureWidth({ magnitude: input.magnitude, faultType });
  // Extended-source threshold: 7.5 sits at the elbow where the W&C
  // surface-rupture length (≈ 50 km) starts to exceed the MMI VII
  // point-source attenuation radius (≈ 35–55 km depending on faultType
  // & Vs30). Below 7.5 the stadium contour collapses inside the
  // existing point-source ring, so there is nothing to gain by
  // upgrading the geometry; we keep the simpler renderer in that
  // regime to avoid spurious "the circle squashed itself" visuals on
  // small events. Subduction interface always upgrades regardless of
  // Mw because the rupture rectangle is genuinely 2D (L≫W is rarely
  // true for shallow megathrusts: Tōhoku 500×200 km).
  const isExtendedSource = input.magnitude >= 7.5 || input.subductionInterface === true;

  const pgaAt20km = peakGroundAcceleration({ magnitude: input.magnitude, distance: m(20_000) });
  const pgaAt100km = peakGroundAcceleration({ magnitude: input.magnitude, distance: m(100_000) });
  const epicentralPga = peakGroundAcceleration({
    magnitude: input.magnitude,
    distance: m(0),
  });

  const ngaFault: NGAFaultType =
    faultType === 'strike-slip' || faultType === 'normal' || faultType === 'reverse'
      ? faultType
      : 'unspecified';
  const pgaAt20kmNGA = peakGroundAccelerationNGAWest2({
    magnitude: input.magnitude,
    distance: m(20_000),
    faultType: ngaFault,
    vs30,
  });
  const pgaAt100kmNGA = peakGroundAccelerationNGAWest2({
    magnitude: input.magnitude,
    distance: m(100_000),
    faultType: ngaFault,
    vs30,
  });

  const mmi7Radius = distanceForPga(input.magnitude, pgaFromMercalliIntensity(7));
  const mmi8Radius = distanceForPga(input.magnitude, pgaFromMercalliIntensity(8));
  const mmi9Radius = distanceForPga(input.magnitude, pgaFromMercalliIntensity(9));

  const waterDepthM = (input.waterDepth as number | undefined) ?? 0;
  const isSubmarine = Number.isFinite(waterDepthM) && waterDepthM > 0;

  const result: EarthquakeScenarioResult = {
    inputs: input,
    seismicMoment,
    ruptureLength,
    ruptureWidth,
    isExtendedSource,
    shaking: {
      pgaAt20km,
      pgaAt100km,
      pgaAt20kmNGA,
      pgaAt100kmNGA,
      mmiAtEpicenter: modifiedMercalliIntensity(epicentralPga),
      mmiAtEpicenterEurope: mmiFromPgaEuropean(epicentralPga),
      mmi7Radius,
      mmi8Radius,
      mmi9Radius,
      liquefactionRadius: liquefactionRadius(input.magnitude),
      siteVs30: vs30,
      siteClass: nehrpClassFromVs30(vs30),
    },
    isSubmarine,
    submarineDepth: m(isSubmarine ? waterDepthM : 0),
    // Seed derived from the deterministic input set so the URL-
    // sharing contract holds: same scenario → same catalogue.
    aftershocks: generateAftershockSequence({
      magnitude: input.magnitude,
      ruptureLength,
      seed: `eq:${input.magnitude.toString()}:${faultType}:${(input.depth as number | undefined)?.toString() ?? 'd?'}`,
    }),
  };

  // Cross-module bridge: tsunami source. Three trigger paths share
  // the same {@link seismicTsunamiFromMegathrust} closed-form chain:
  //   1. Explicit subduction-interface megathrust flag (Tōhoku,
  //      Sumatra, Lisbon presets).
  //   2. Submarine epicentre with Mw ≥ 6.5 on a thrust or normal
  //      fault — the dip-slip component lifts the seafloor and
  //      generates a wave even without the megathrust label.
  //      Strike-slip events at this scale tend to displace the
  //      seafloor laterally and only marginally vertically, so we
  //      conservatively skip them (Bryant 2014 §3.4).
  //   3. (Future) shallow large normal-fault on flexural bulge.
  const submarineTsunamiTrigger =
    isSubmarine && input.magnitude >= 6.5 && (faultType === 'reverse' || faultType === 'normal');
  if (input.subductionInterface || submarineTsunamiTrigger) {
    result.tsunami = seismicTsunamiFromMegathrust({
      magnitude: input.magnitude,
      ruptureLength,
      faultType,
      ...(input.subductionInterface !== undefined && {
        subductionInterface: input.subductionInterface,
      }),
      ...(isSubmarine ? { basinDepth: m(waterDepthM) } : {}),
      ...(input.coastalBeachSlopeRad !== undefined && {
        coastalBeachSlopeRad: input.coastalBeachSlopeRad,
      }),
    });
  }

  return result;
}

/**
 * Canonical earthquake presets used for the UI gallery and CLI.
 */
export const EARTHQUAKE_PRESETS = {
  /** 17 January 1994 Northridge, California — blind-thrust (reverse),
   *  Mw 6.7, hypocenter ≈19 km. */
  NORTHRIDGE_1994: {
    name: 'Northridge 1994',
    note: 'Blind-thrust rupture beneath the San Fernando Valley',
    input: {
      magnitude: 6.7,
      depth: m(19_000),
      faultType: 'reverse',
    } satisfies EarthquakeScenarioInput,
  },
  /** 11 March 2011 Tōhoku-Oki — subduction megathrust, Mw 9.1,
   *  hypocenter ≈29 km below the Japan Trench. */
  TOHOKU_2011: {
    name: 'Tōhoku 2011',
    note: 'Subduction megathrust rupture offshore northeast Honshū',
    input: {
      magnitude: 9.1,
      depth: m(29_000),
      faultType: 'reverse',
      subductionInterface: true,
      // Japan Trench strike ≈ 200° (NNE-SSW), Hayes USGS finite-fault.
      strikeAzimuthDeg: 200,
    } satisfies EarthquakeScenarioInput,
  },
  /** 14 November 2001 Kokoxili, Tibet — strike-slip, Mw 7.8, shallow. */
  KUNLUN_2001: {
    name: 'Kokoxili (Kunlun) 2001',
    note: 'Strike-slip rupture on the Kunlun Fault, Tibetan Plateau',
    input: {
      magnitude: 7.8,
      depth: m(10_000),
      faultType: 'strike-slip',
      // Kunlun fault trace strikes ≈ 95° (almost due E–W). 400 km
      // surface rupture documented by Lin et al. 2002, Science 296.
      strikeAzimuthDeg: 95,
    } satisfies EarthquakeScenarioInput,
  },
  /** 26 December 2004 Sumatra–Andaman — Sunda subduction megathrust,
   *  Mw 9.1–9.3, hypocentre ≈ 30 km. Generated the deadliest tsunami
   *  in modern record (≈ 230 000 fatalities Indian-Ocean basin-wide).
   *  Lay et al. 2005 Science 308 (5725): 1127–1133. */
  SUMATRA_2004: {
    name: 'Sumatra–Andaman 2004',
    note: 'Sunda megathrust rupture; basin-wide tsunami across the Indian Ocean',
    input: {
      magnitude: 9.2,
      depth: m(30_000),
      faultType: 'reverse',
      subductionInterface: true,
      // Sunda Trench strike ≈ 330° (NW–SE), 1300 km rupture from
      // northern Sumatra into the Andaman Islands (Lay 2005, Science).
      strikeAzimuthDeg: 330,
    } satisfies EarthquakeScenarioInput,
  },
  /** 1 November 1755 Lisbon — Mw ≈ 8.5–9.0, source debated between
   *  the Gorringe Bank thrust and a deeper Azores–Gibraltar fracture-
   *  zone segment. Triggered the trans-Atlantic tsunami documented
   *  on Iberian, Moroccan, and West-Indies coasts (Baptista & Miranda
   *  2009 Nat. Hazards Earth Syst. Sci. 9: 25–42). */
  LISBON_1755: {
    name: 'Lisbon 1755',
    note: 'Atlantic megathrust on the Azores–Gibraltar fracture zone; trans-oceanic tsunami',
    input: {
      magnitude: 8.7,
      depth: m(20_000),
      faultType: 'reverse',
      subductionInterface: true,
      // Azores–Gibraltar fracture zone strikes ≈ 70° (ENE-WSW;
      // Baptista & Miranda 2009, NHESS 9: 25, Fig. 5).
      strikeAzimuthDeg: 70,
    } satisfies EarthquakeScenarioInput,
  },
  /** Valdivia, Chile — 22 May 1960. The largest earthquake ever
   *  recorded by instruments: Mw 9.5, Nazca-South America subduction
   *  interface, ≈ 1 000 km rupture length. Triggered a Pacific-wide
   *  tsunami (16 m at Hilo HI, 5 m at Sendai JP — 22 hours after
   *  the rupture). Reference: Cifuentes (1989) "The 1960 Chilean
   *  earthquakes." JGR 94 (B1): 665–680. DOI: 10.1029/JB094iB01p00665. */
  VALDIVIA_1960: {
    name: 'Valdivia 1960',
    note: 'Largest instrumentally recorded earthquake (Mw 9.5). Chilean subduction megathrust; Pacific-wide tsunami (Cifuentes 1989, JGR 94: 665).',
    input: {
      magnitude: 9.5,
      depth: m(33_000),
      faultType: 'reverse',
      subductionInterface: true,
      // Chile Trench strikes ≈ 10° (almost due N–S), 1000 km rupture
      // from Concepción south to the Taitao Peninsula.
      strikeAzimuthDeg: 10,
    } satisfies EarthquakeScenarioInput,
  },
  /** Great Alaska earthquake, 27 March 1964 — Mw 9.2, Aleutian
   *  megathrust, ≈ 700 km rupture, 5–11 m of interface slip. Second-
   *  largest recorded earthquake. Triggered the most damaging tsunami
   *  in North-American history (10 m runup at Valdez AK, 4.5 m at
   *  Crescent City CA). Reference: Plafker (1965) "Tectonic
   *  deformation associated with the 1964 Alaska earthquake."
   *  Science 148 (3678): 1675–1687. DOI: 10.1126/science.148.3678.1675. */
  ALASKA_1964: {
    name: 'Great Alaska 1964',
    note: 'Mw 9.2 megathrust, Good Friday earthquake — Plafker 1965, Science 148: 1675. 10 m tsunami runup at Valdez; the simulator reproduces the basin-crossing wave train.',
    input: {
      magnitude: 9.2,
      depth: m(25_000),
      faultType: 'reverse',
      subductionInterface: true,
      // Aleutian Megathrust strike ≈ 245° (W-SW from Prince William
      // Sound to Kodiak), Plafker 1965 Fig. 2.
      strikeAzimuthDeg: 245,
    } satisfies EarthquakeScenarioInput,
  },
  /** L'Aquila, Italy — 6 April 2009. Mw 6.3 normal-fault earthquake
   *  on the Paganica fault, central Apennines. Hypocentre ≈ 9 km;
   *  309 fatalities, ≈ 60 000 displaced; one of the most extensively
   *  instrumented Italian crustal events. Notable for the criminal-
   *  trial controversy over earthquake-prediction communication.
   *  Reference: Chiarabba et al. (2009) "The 2009 L'Aquila (central
   *  Italy) MW 6.3 earthquake: main shock and aftershocks."
   *  Geophys. Res. Lett. 36, L18308. DOI: 10.1029/2009GL039627. */
  L_AQUILA_2009: {
    name: "L'Aquila 2009",
    note: 'Mw 6.3 normal-fault rupture, central Apennines — Chiarabba et al. 2009, GRL 36: L18308. Reference Italian crustal event.',
    input: {
      magnitude: 6.3,
      depth: m(9_000),
      faultType: 'normal',
    } satisfies EarthquakeScenarioInput,
  },
  /** Amatrice (Norcia sequence), Italy — 24 August 2016. Mw 6.2
   *  normal-fault earthquake on the Mt Vettore-Laga system, central
   *  Apennines. Followed by the Mw 6.6 Norcia event on 30 October
   *  (the largest Italian earthquake since Irpinia 1980). The August
   *  shock killed 299, the sequence destroyed Amatrice and Accumoli.
   *  Reference: Chiaraluce et al. (2017) "The 2016 Central Italy
   *  Seismic Sequence." Seismol. Res. Lett. 88 (3): 757–771.
   *  DOI: 10.1785/0220160221. */
  AMATRICE_2016: {
    name: 'Amatrice 2016',
    note: 'Mw 6.2 normal-fault rupture, Mt Vettore-Laga system — Chiaraluce et al. 2017, SRL 88: 757. First main shock of the 2016 central-Italy sequence.',
    input: {
      magnitude: 6.2,
      depth: m(8_000),
      faultType: 'normal',
    } satisfies EarthquakeScenarioInput,
  },
  /** Gorkha (Nepal) earthquake — 25 April 2015. Mw 7.8 on the Main
   *  Himalayan Thrust beneath the Lesser Himalaya, ≈ 150 km rupture
   *  with 3–6 m of slip. ≈ 9 000 fatalities, severe damage in
   *  Kathmandu valley; followed by the Mw 7.3 Dolakha aftershock on
   *  12 May. Reference: Avouac et al. (2015) "Lower edge of locked
   *  Main Himalayan Thrust unzipped by the 2015 Gorkha earthquake."
   *  Nat. Geosci. 8 (9): 708–711. DOI: 10.1038/ngeo2518. */
  NEPAL_2015: {
    name: 'Nepal Gorkha 2015',
    note: 'Mw 7.8 megathrust rupture, Main Himalayan Thrust — Avouac et al. 2015, Nat. Geosci. 8: 708. Continental thrust without a tsunami branch.',
    input: {
      magnitude: 7.8,
      depth: m(8_000),
      faultType: 'reverse',
      // Main Himalayan Thrust strikes ≈ 290° (WNW–ESE) along the
      // arc; rupture propagated ~150 km eastward (Avouac 2015 Fig. 2).
      strikeAzimuthDeg: 290,
    } satisfies EarthquakeScenarioInput,
  },
} as const;

export type EarthquakePresetId = keyof typeof EARTHQUAKE_PRESETS;
