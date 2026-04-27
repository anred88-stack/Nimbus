import {
  CHONDRITIC_DENSITY,
  CRUSTAL_ROCK_DENSITY,
  IRON_METEORITE_DENSITY,
  SIMPLE_COMPLEX_TRANSITION_EARTH,
  STANDARD_GRAVITY,
} from './constants.js';
import {
  craterDepth,
  finalCraterDiameter,
  transientCraterDiameter,
} from './events/impact/crater.js';
import { IMPACT_LUMINOUS_EFFICIENCY } from './constants.js';
import {
  climateTier,
  shockAcidRainMass,
  stratosphericDustMass,
  type ClimateTier,
} from './effects/atmosphere.js';
import {
  IMPACTOR_STRENGTH,
  atmosphericEntry,
  type AtmosphericEntryResult,
} from './effects/atmosphericEntry.js';
import {
  craterAsymmetry,
  ejectaButterflyAsymmetry,
  obliqueImpactCentreOffset,
  obliqueImpactRingAsymmetry,
  type RingAsymmetry,
} from './effects/asymmetry.js';
import {
  ejectaBlanketOuterEdge,
  ejectaThicknessAt10R,
  ejectaThicknessAt2R,
} from './effects/ejecta.js';
import {
  firestormArea,
  firestormSustainRadius,
  flammableIgnitionArea,
  flammableIgnitionRadius,
} from './effects/firestorm.js';
import { liquefactionRadius } from './events/earthquake/liquefaction.js';
import { impactDamageRadii, type ImpactDamageRadii } from './events/impact/damageRings.js';
import { impactorMass, kineticEnergy } from './events/impact/kinetic.js';
import { seismicMagnitude, seismicMagnitudeTeanbyWookey } from './events/impact/seismic.js';
import { dispersionAmplitudeFactor, synolakisRunup } from './events/tsunami/extendedEffects.js';
import {
  impactAmplitudeAtDistance,
  impactAmplitudeWunnemann,
  impactCavityRadius,
  impactSourceAmplitude,
} from './events/tsunami/impact.js';
import { shallowWaterWaveSpeed, tsunamiTravelTime } from './events/tsunami/propagation.js';
import type {
  Joules,
  KilogramPerCubicMeter,
  Kilograms,
  Megatons,
  Meters,
  MetersPerSecond,
  Pascals,
  Radians,
  Seconds,
  SquareMeters,
} from './units.js';
import { deg, degreesToRadians, J, joulesToMegatons, kgPerM3, m, mps } from './units.js';

/** Default basin depth used to propagate impact-generated tsunamis when
 *  the caller doesn't override it. 4 km is the rough global-ocean mean. */
const DEFAULT_MEAN_OCEAN_DEPTH = 4_000;

/**
 * Full set of inputs for an atmospheric-entry-to-ground impact scenario.
 * Every value crosses the physics boundary as a branded unit.
 */
export interface ImpactScenarioInput {
  impactorDiameter: Meters;
  impactVelocity: MetersPerSecond;
  impactorDensity: KilogramPerCubicMeter;
  targetDensity: KilogramPerCubicMeter;
  impactAngle: Radians;
  /** Defaults to Earth's standard gravity when omitted. */
  surfaceGravity?: number;
  /** Water depth at the impact site (m). `0` or omitted → land impact
   *  and no tsunami cascade; any positive value triggers the
   *  Ward–Asphaug water-column cavity and far-field amplitude outputs. */
  waterDepth?: Meters;
  /** Mean basin depth used to propagate the tsunami (m). Defaults to
   *  4 000 m (global-ocean mean) — matters only for the tsunami travel
   *  time, not the 1/r amplitude decay. */
  meanOceanDepth?: Meters;
  /** Impactor tensile strength (Pa) — drives the Chyba/Collins airburst
   *  classifier. Defaults to STONY (1 MPa, ordinary chondrite). */
  impactorStrength?: Pascals;
  /** Compass azimuth (° clockwise from geographic North) the impactor
   *  is travelling toward at the moment of contact. Drives the down-
   *  range orientation of the asymmetric ejecta blanket for oblique
   *  impacts (Schultz & Anderson 1996). Defaults to 90° (east-bound)
   *  when omitted. Has no effect on circular damage rings. */
  impactAzimuthDeg?: number;
  /** Beach slope (rad) to use for the Synolakis (1987) coastal run-up
   *  inside the tsunami branch. When omitted the simulator falls back
   *  to the textbook 1:100 plane beach (`atan(0.01) ≈ 0.573°`). The
   *  store auto-derives a value from the local DEM whenever the click
   *  point sits on land with a meaningful slope (≥ 1:1000 and ≤ 1:3,
   *  the "beach to dune face" envelope) — see `evaluate()`. Bypassing
   *  this from the CLI is fine: the test suite passes the default. */
  coastalBeachSlopeRad?: number;
}

/**
 * Tsunami block of an {@link ImpactScenarioResult}. Present only when
 * the input specifies `waterDepth > 0`; omitted otherwise so the CLI
 * JSON stays clean for land events.
 */
export interface ImpactTsunamiResult {
  /** Ward–Asphaug initial water-column cavity radius (m). */
  cavityRadius: Meters;
  /** Initial wave amplitude at the cavity rim (m). */
  sourceAmplitude: Meters;
  /** Far-field 1/r-decayed amplitude at 1 000 km from the impact (m). */
  amplitudeAt1000km: Meters;
  /** Far-field amplitude at 5 000 km from the impact (m). */
  amplitudeAt5000km: Meters;
  /** Wünnemann 2007 / Melosh 2003 hydrocode-corrected amplitude at
   *  1 000 km — the "best-estimate" over the Ward–Asphaug envelope. */
  amplitudeAt1000kmWunnemann: Meters;
  /** Wünnemann-corrected amplitude at 5 000 km. */
  amplitudeAt5000kmWunnemann: Meters;
  /** Travel time from the impact point to the 1 000 km contour (s). */
  travelTimeTo1000km: Seconds;
  /** Basin depth used for the travel-time calculation (m). */
  meanOceanDepth: Meters;
  /** Synolakis (1987) run-up on a 1:100 beach with 10 m offshore depth,
   *  using the Wünnemann-damped amplitude at 1 000 km as the incident
   *  wave. Illustrative coastal-inundation estimate. */
  runupAt1000km: Meters;
  /** Heidarzadeh & Satake (2015) dispersion-corrected amplitude at
   *  5 000 km from the source. */
  amplitudeAt5000kmDispersed: Meters;
  /** Open-ocean phase speed `c = √(g·h)` of a long gravity wave on the
   *  basin (Lamb 1932 §170). At 4 km mean depth this is ≈ 198 m/s
   *  ≈ 713 km/h — the popular-science "speed of a jet airliner". */
  deepWaterCelerity: MetersPerSecond;
  /** Characteristic source-radiated wavelength (m). For a Ward & Asphaug
   *  cavity the collapse seeds waves with λ ≈ 2 × R_C (the cavity
   *  diameter); for a Chicxulub-scale impact this is ≈ 200 km, well
   *  inside the long-wave regime where the shallow-water approximation
   *  used elsewhere in this block applies. */
  sourceWavelength: Meters;
  /** Dominant wave period at the source (s). T = λ / c, with the basin
   *  depth at the impact point. */
  dominantPeriod: Seconds;
  /** Estimated inland inundation distance (m) at the 1 000 km contour,
   *  from the simple geometric `runup / tan(slope)` envelope on a
   *  1:100 reference beach (FEMA 55 §3.4 / Murata et al. 2010). For
   *  the Synolakis run-up this gives the coastal "how far inland does
   *  the water push" headline number — order-of-magnitude only. */
  inundationDistanceAt1000km: Meters;
  /** Beach slope (rad) actually consumed by the Synolakis run-up.
   *  Echoes either {@link ImpactScenarioInput.coastalBeachSlopeRad}
   *  when supplied or the textbook `atan(0.01)` fallback. Surfaced
   *  in the UI alongside the run-up so the user reads "slope:
   *  0.6° — local DEM" or "slope: 0.6° — 1:100 reference". */
  beachSlopeRadUsed: number;
  /** True when {@link beachSlopeRadUsed} came from a DEM sample at
   *  the click site (rather than the 1:100 reference fallback). */
  beachSlopeFromDEM: boolean;
}

/**
 * Shape of a complete scenario result. Deterministic: identical inputs
 * produce an identical snapshot. All branded numbers are preserved so
 * that downstream UI code never has to re-guess units.
 *
 * `damage` collapses the four headline ring radii (crater rim, 3rd-deg
 * burn, 5 psi, 1 psi) into the result itself so the Globe renderer
 * stays a pure reader. `tsunami` only appears when the input was an
 * ocean impact.
 */
export interface ImpactScenarioResult {
  inputs: ImpactScenarioInput;
  impactor: {
    mass: Kilograms;
    kineticEnergy: Joules;
    kineticEnergyMegatons: Megatons;
  };
  crater: {
    transientDiameter: Meters;
    finalDiameter: Meters;
    depth: Meters;
    morphology: 'simple' | 'complex';
  };
  seismic: {
    /** Schultz & Gault (1975) estimate — upper-envelope Mw coupling. */
    magnitude: number;
    /** Teanby & Wookey (2011) modern k-scaling estimate (k = 10⁻⁴). */
    magnitudeTeanbyWookey: number;
    /** Impact-induced liquefaction radius on saturated sandy soil —
     *  cross-bridge to the earthquake module's Youd & Idriss (2001)
     *  threshold, fed by the Teanby-Wookey Mw. 0 when the Mw is too
     *  low to liquefy susceptible soils anywhere. */
    liquefactionRadius: Meters;
  };
  damage: ImpactDamageRadii;
  /** Per-ring rendering asymmetry (semi-major / semi-minor multipliers,
   *  azimuth, centre offset) so the renderer can draw a physically
   *  honest ellipse rather than a perfect concentric circle.
   *
   *  - `craterRim`: Pierazzo & Melosh 2000 / Gault & Wedekind 1978
   *    cube-root sin envelope — circular at θ ≥ 45°, progressive
   *    cross-range compression below.
   *  - `thirdDegreeBurn`, `overpressure5psi`, `overpressure1psi`:
   *    Pierazzo & Artemieva 2003 conservative envelope — small
   *    downrange elongation + centre offset for oblique entries.
   *  - `ejectaBlanket`: Schultz & Anderson 1996 butterfly pattern,
   *    repackaging the existing inline computation through the unified
   *    {@link RingAsymmetry} interface.
   *
   *  All five share the impactor's downrange compass azimuth, so a
   *  single rotation/offset family applies cleanly to the whole
   *  cascade. Vertical (θ ≥ 45°) impacts collapse all entries to the
   *  isotropic ring within experimental scatter. */
  damageAsymmetry: {
    craterRim: RingAsymmetry;
    thirdDegreeBurn: RingAsymmetry;
    secondDegreeBurn: RingAsymmetry;
    overpressure5psi: RingAsymmetry;
    overpressure1psi: RingAsymmetry;
    lightDamage: RingAsymmetry;
    ejectaBlanket: RingAsymmetry;
  };
  /** Ejecta-blanket metrics — ground-range from impact centre at which
   *  the deposit drops to the labelled thickness (McGetchin 1973 /
   *  Collins et al. 2005 Eq. 28). */
  ejecta: {
    /** Outer edge of the continuous blanket (T ≥ 1 mm). */
    blanketEdge1mm: Meters;
    /** Outer edge of the thicker proximal blanket (T ≥ 1 m). */
    blanketEdge1m: Meters;
    /** Thickness at 2 crater radii — proximal reference. */
    thicknessAt2R: Meters;
    /** Thickness at 10 crater radii — far-field reference. */
    thicknessAt10R: Meters;
    /** Schultz & Anderson (1996) downrange-asymmetry coefficient, in
     *  [0, 1]. 0 = symmetric blanket (impact angle ≥ 45°), 1 = maximum
     *  butterfly pattern with a near-empty uprange "forbidden zone"
     *  (impact angle → 0°, grazing). The renderer uses this to
     *  stretch the blanket ellipse along the downrange axis. */
    asymmetryFactor: number;
    /** Compass azimuth (° from N) along which the asymmetric blanket
     *  is elongated. Echoes input.impactAzimuthDeg (default 90°). */
    azimuthDeg: number;
    /** Distance the asymmetric-ellipse centre is shifted downrange
     *  from the impact point (m). Zero for symmetric impacts. */
    downrangeOffset: Meters;
  };
  /** Thermal-pulse firestorm metrics — applied with the impact
   *  luminous efficiency η ≈ 3 × 10⁻³ (Collins et al. 2005, Toon
   *  et al. 1997) rather than the nuclear 0.35 partition. */
  firestorm: {
    ignitionRadius: Meters;
    sustainRadius: Meters;
    ignitionArea: SquareMeters;
    sustainArea: SquareMeters;
  };
  /** Chyba–Collins airburst classifier output; see
   *  `src/physics/effects/atmosphericEntry.ts`. */
  entry: AtmosphericEntryResult;
  /** Long-range atmospheric consequences: dust injection into the
   *  stratosphere (Toon et al. 1997), nitric-acid mass from shock
   *  heating (Prinn & Fegley 1987), and a qualitative climate tier. */
  atmosphere: {
    stratosphericDust: Kilograms;
    acidRainMass: Kilograms;
    climateTier: ClimateTier;
  };
  tsunami?: ImpactTsunamiResult;
}

/**
 * Deterministic Layer-2 scenario evaluator: takes an impact configuration
 * and returns the full derived-quantity snapshot. No framework imports,
 * no I/O, no randomness — safe to call from a Web Worker, a Node CLI, or
 * a Vitest unit.
 *
 * Cascade logic (M3): when `input.waterDepth > 0` the evaluator also
 * invokes the Ward & Asphaug (2000) impact-tsunami chain to produce
 * a `tsunami` sub-result. Nothing else in the pipeline changes — the
 * seabed crater and seismic magnitude are unaffected by the overlying
 * water column for the popular-science display envelope.
 *
 * Cites Collins, Melosh & Marcus (2005), Pike (1980), Schultz & Gault
 * (1975), Glasstone & Dolan (1977), Kinney & Graham (1985), and
 * Ward & Asphaug (2000); see the individual formula modules for
 * equation-level citations.
 */
export function simulateImpact(input: ImpactScenarioInput): ImpactScenarioResult {
  const mass = impactorMass(input.impactorDiameter, input.impactorDensity);
  const ke = kineticEnergy(mass, input.impactVelocity);

  const entry = atmosphericEntry(
    input.impactorDiameter,
    input.impactVelocity,
    input.impactorStrength ?? IMPACTOR_STRENGTH.STONY,
    input.impactorDensity,
    ke
  );
  // Crater and ejecta scale with the kinetic energy delivered to the
  // ground, not the pre-entry total. For airbursts the fragments
  // dump most of their KE as a high-altitude thermal + blast pulse,
  // which this layer treats by scaling the ground-work quantities by
  // energyFractionToGround^(1/3.4) (Collins 2005 Eq. 22 exponent).
  const gf = entry.energyFractionToGround;
  const craterScale = gf > 0 ? Math.pow(gf, 1 / 3.4) : 0;

  const Dtc = m((transientCraterDiameter(input) as number) * craterScale);
  const Dfr = m(finalCraterDiameter(Dtc));
  const depth = m(craterDepth(Dfr));
  const morphology: 'simple' | 'complex' =
    (Dfr as number) < (SIMPLE_COMPLEX_TRANSITION_EARTH as number) ? 'simple' : 'complex';

  // Damage rings = max(ground-coupled surface burst, atmospheric
  // airburst). The two physical components target the same observer
  // on the ground but originate from different sources:
  //
  //   - Ground-coupled component: gf · KE deposited at the surface
  //     produces the cratering fireball + ground-level Kinney-Graham
  //     shock. For INTACT events (Chicxulub, gf = 1) this is the
  //     full kinetic energy and dominates everything else.
  //
  //   - Atmospheric component: (1 − gf) · KE released in the airburst
  //     fireball at the burst altitude, lifted by the
  //     Whitham + Sachs + USSA amplification factor before reaching
  //     the ground (see {@link atmosphericEntry}). Dominates the
  //     damage rings for COMPLETE_AIRBURST events (Tunguska,
  //     Chelyabinsk) where the surface fireball is essentially
  //     absent.
  //
  // The risk to a person at the ground is the union of both shocks
  // and both flashes — taking the max is the simplest scientifically
  // honest combiner. Pre-fix the simulator passed the FULL `ke` here
  // regardless of regime, which mis-attributed Tunguska's 7 Mt to a
  // surface burst and over-stated the ring radii by an order of
  // magnitude.
  const groundCoupledKe = J((ke as number) * Math.max(gf, 0));
  const surfaceDamage = impactDamageRadii(groundCoupledKe, Dfr);
  const damage: ImpactDamageRadii = {
    craterRim: surfaceDamage.craterRim,
    thirdDegreeBurn: m(Math.max(surfaceDamage.thirdDegreeBurn, entry.flashBurnRadii.thirdDegree)),
    secondDegreeBurn: m(
      Math.max(surfaceDamage.secondDegreeBurn, entry.flashBurnRadii.secondDegree)
    ),
    overpressure5psi: m(Math.max(surfaceDamage.overpressure5psi, entry.shockWaveRadii.fivePsi)),
    overpressure1psi: m(Math.max(surfaceDamage.overpressure1psi, entry.shockWaveRadii.onePsi)),
    lightDamage: m(Math.max(surfaceDamage.lightDamage, entry.shockWaveRadii.lightDamage)),
  };

  const craterRimRadius = m((Dfr as number) / 2);
  const blanketEdge1mm = ejectaBlanketOuterEdge(craterRimRadius, m(0.001));
  // Schultz & Anderson (1996) "Asymmetry of ejecta and target damage
  // in oblique impacts," LPSC XXVII: smooth ramp from 0 (symmetric)
  // at θ ≥ 45° to 1 (forbidden uprange zone) at θ = 0°. Linear in
  // angle is a popular-science simplification of the actual
  // experimental fit, which has scatter of ±0.2 around this line.
  const angleDeg = (input.impactAngle as number) * (180 / Math.PI);
  const asymmetryFactor = Math.max(0, Math.min(1, 1 - angleDeg / 45));
  const azimuthDeg = input.impactAzimuthDeg ?? 90;
  const downrangeOffset = m((blanketEdge1mm as number) * 0.3 * asymmetryFactor);
  const ejecta = {
    blanketEdge1mm,
    blanketEdge1m: ejectaBlanketOuterEdge(craterRimRadius, m(1)),
    thicknessAt2R: ejectaThicknessAt2R(craterRimRadius),
    thicknessAt10R: ejectaThicknessAt10R(craterRimRadius),
    asymmetryFactor,
    azimuthDeg,
    downrangeOffset,
  };

  // Per-ring rendering asymmetry. The crater rim follows the cube-root
  // sin envelope of Gault & Wedekind 1978 / Pierazzo & Melosh 2000;
  // the thermal and overpressure rings follow the (smaller) Pierazzo
  // & Artemieva 2003 envelope plus a centre-offset that scales with
  // the ring's own nominal radius. The ejecta-blanket entry reuses
  // the Schultz & Anderson 1996 butterfly factors that have governed
  // the rendered overlay since M3, now exposed through the unified
  // RingAsymmetry interface.
  const thermal3Nominal = damage.thirdDegreeBurn as number;
  const thermal2Nominal = damage.secondDegreeBurn as number;
  const op5psiNominal = damage.overpressure5psi as number;
  const op1psiNominal = damage.overpressure1psi as number;
  const lightDamageNominal = damage.lightDamage as number;
  const damageAsymmetry = {
    craterRim: craterAsymmetry(angleDeg, azimuthDeg),
    thirdDegreeBurn: {
      ...obliqueImpactRingAsymmetry(angleDeg, azimuthDeg, 'thermal'),
      centerOffsetMeters: obliqueImpactCentreOffset(angleDeg, thermal3Nominal),
    },
    secondDegreeBurn: {
      ...obliqueImpactRingAsymmetry(angleDeg, azimuthDeg, 'thermal'),
      centerOffsetMeters: obliqueImpactCentreOffset(angleDeg, thermal2Nominal),
    },
    overpressure5psi: {
      ...obliqueImpactRingAsymmetry(angleDeg, azimuthDeg, 'overpressure'),
      centerOffsetMeters: obliqueImpactCentreOffset(angleDeg, op5psiNominal),
    },
    overpressure1psi: {
      ...obliqueImpactRingAsymmetry(angleDeg, azimuthDeg, 'overpressure'),
      centerOffsetMeters: obliqueImpactCentreOffset(angleDeg, op1psiNominal),
    },
    lightDamage: {
      ...obliqueImpactRingAsymmetry(angleDeg, azimuthDeg, 'overpressure'),
      centerOffsetMeters: obliqueImpactCentreOffset(angleDeg, lightDamageNominal),
    },
    ejectaBlanket: ejectaButterflyAsymmetry(asymmetryFactor, azimuthDeg, blanketEdge1mm),
  };

  const firestormInputs = {
    yieldEnergy: ke,
    thermalPartition: IMPACT_LUMINOUS_EFFICIENCY,
  };
  const firestorm = {
    ignitionRadius: flammableIgnitionRadius(firestormInputs),
    sustainRadius: firestormSustainRadius(firestormInputs),
    ignitionArea: flammableIgnitionArea(firestormInputs),
    sustainArea: firestormArea(firestormInputs),
  };

  const atmosphere = {
    stratosphericDust: stratosphericDustMass(ke),
    acidRainMass: shockAcidRainMass(ke),
    climateTier: climateTier(ke),
  };

  const result: ImpactScenarioResult = {
    inputs: input,
    impactor: {
      mass,
      kineticEnergy: ke,
      kineticEnergyMegatons: joulesToMegatons(ke),
    },
    crater: {
      transientDiameter: Dtc,
      finalDiameter: Dfr,
      depth,
      morphology,
    },
    seismic: {
      magnitude: seismicMagnitude(ke),
      magnitudeTeanbyWookey: seismicMagnitudeTeanbyWookey(ke),
      liquefactionRadius: liquefactionRadius(seismicMagnitudeTeanbyWookey(ke)),
    },
    damage,
    damageAsymmetry,
    ejecta,
    firestorm,
    entry,
    atmosphere,
  };

  const waterDepth = (input.waterDepth as number | undefined) ?? 0;
  // Tsunami cascade is emitted only when the impactor delivers a
  // meaningful fraction of its kinetic energy to the water surface
  // (gf > 0.10). Below that threshold the bolide deposits the bulk of
  // its KE as a high-altitude blast pulse — a Tunguska-class airburst
  // over the open ocean does not piston the water column the way the
  // Ward & Asphaug (2000) cavity model assumes, so emitting a tsunami
  // block would overstate the wave by 1–2 orders of magnitude. The
  // cavity itself is computed from the *surface-coupled* energy
  // (ke · gf), matching the same scaling already applied to the
  // ground crater above.
  if (waterDepth > 0 && gf > 0.1) {
    const meanOceanDepth = input.meanOceanDepth ?? m(DEFAULT_MEAN_OCEAN_DEPTH);
    const surfaceCoupledKe = J((ke as number) * gf);
    const cavityRadius = impactCavityRadius({ kineticEnergy: surfaceCoupledKe });
    const sourceAmplitude = impactSourceAmplitude(cavityRadius);
    const amp1000 = impactAmplitudeAtDistance({
      sourceAmplitude,
      cavityRadius,
      distance: m(1_000_000),
    });
    const amp5000 = impactAmplitudeAtDistance({
      sourceAmplitude,
      cavityRadius,
      distance: m(5_000_000),
    });
    const amp1000W = impactAmplitudeWunnemann({
      sourceAmplitude,
      cavityRadius,
      distance: m(1_000_000),
    });
    const amp5000W = impactAmplitudeWunnemann({
      sourceAmplitude,
      cavityRadius,
      distance: m(5_000_000),
    });
    // Pick the beach slope: caller-supplied DEM slope when the store
    // sampled one at the click site, otherwise the textbook 1:100
    // plane-beach reference. Below the lower bound (1:1000, ~0.057°)
    // a beach is so flat that Synolakis' analytical fit no longer
    // applies; above the upper bound (1:3, ~18°) we are looking at a
    // cliff face, not a beach. Either out-of-range value collapses
    // back to the reference.
    const FALLBACK_SLOPE_RAD = Math.atan(1 / 100);
    const SLOPE_LOWER = Math.atan(1 / 1000);
    const SLOPE_UPPER = Math.atan(1 / 3);
    const supplied = input.coastalBeachSlopeRad;
    const slopeFromDEM =
      supplied !== undefined &&
      Number.isFinite(supplied) &&
      supplied >= SLOPE_LOWER &&
      supplied <= SLOPE_UPPER;
    const beachSlopeRad = slopeFromDEM ? supplied : FALLBACK_SLOPE_RAD;
    const runup = synolakisRunup(amp1000W, beachSlopeRad, m(10));
    const amp5000Dispersed = m((amp5000W as number) * dispersionAmplitudeFactor(m(5_000_000)));
    const celerity = shallowWaterWaveSpeed(meanOceanDepth);
    const wavelength = m(2 * (cavityRadius as number));
    const period = (wavelength / Math.max(celerity, 1e-6)) as Seconds;
    // Inundation distance ≈ runup × cot(slope). On a 1:100 beach
    // cot(slope) = 100, so inundation ≈ 100 × runup. On a real DEM
    // slope the cot factor scales accordingly — a 1:30 beach (~1.9°)
    // gives 30× runup, a 1:300 mud-flat (~0.19°) gives 300×.
    // FEMA 55 §3.4 uses this geometric envelope for first-order
    // coastal hazard mapping.
    const inundation = m((runup as number) / Math.tan(beachSlopeRad));
    result.tsunami = {
      cavityRadius,
      sourceAmplitude,
      amplitudeAt1000km: amp1000,
      amplitudeAt5000km: amp5000,
      amplitudeAt1000kmWunnemann: amp1000W,
      amplitudeAt5000kmWunnemann: amp5000W,
      travelTimeTo1000km: tsunamiTravelTime(m(1_000_000), meanOceanDepth),
      meanOceanDepth,
      runupAt1000km: runup,
      amplitudeAt5000kmDispersed: amp5000Dispersed,
      deepWaterCelerity: celerity,
      sourceWavelength: wavelength,
      dominantPeriod: period,
      inundationDistanceAt1000km: inundation,
      beachSlopeRadUsed: beachSlopeRad,
      beachSlopeFromDEM: slopeFromDEM,
    };
  }

  return result;
}

/**
 * Canonical impact presets used for tests, CLI snapshots, and the in-app
 * preset gallery planned for M6. Each preset is a best-fit "textbook"
 * reconstruction; see {@link simulateImpact} for the formulas applied.
 */
export const IMPACT_PRESETS = {
  /** K-Pg asteroid strike on Yucatán ≈66 Ma — Hildebrand et al. (1991). */
  CHICXULUB: {
    name: 'Chicxulub',
    note: 'K-Pg impactor, 66 Ma — Hildebrand et al. 1991; Morgan et al. 2016',
    input: {
      impactorDiameter: m(15_000),
      impactVelocity: mps(20_000),
      impactorDensity: CHONDRITIC_DENSITY,
      targetDensity: CRUSTAL_ROCK_DENSITY,
      impactAngle: degreesToRadians(deg(45)),
      surfaceGravity: STANDARD_GRAVITY,
    } satisfies ImpactScenarioInput,
  },
  /** K-Pg asteroid, ocean-variant: same impactor on a 100 m carbonate-
   *  platform shelf-sea, propagated across a 3 000 m mean basin. */
  CHICXULUB_OCEAN: {
    name: 'Chicxulub (ocean variant)',
    note: 'K-Pg impactor on 100 m carbonate shelf, Ward & Asphaug tsunami cascade',
    input: {
      impactorDiameter: m(15_000),
      impactVelocity: mps(20_000),
      impactorDensity: CHONDRITIC_DENSITY,
      targetDensity: CRUSTAL_ROCK_DENSITY,
      impactAngle: degreesToRadians(deg(45)),
      surfaceGravity: STANDARD_GRAVITY,
      waterDepth: m(100),
      meanOceanDepth: m(3_000),
    } satisfies ImpactScenarioInput,
  },
  /** Siberian airburst, 30 June 1908 — representative stony-bolide inputs. */
  TUNGUSKA: {
    name: 'Tunguska',
    note: 'Stony bolide airburst at 30°, 30 June 1908 — Boslough & Crawford 2008. Notice the asymmetric ejecta footprint downrange of the entry direction.',
    input: {
      impactorDiameter: m(60),
      impactVelocity: mps(15_000),
      impactorDensity: CHONDRITIC_DENSITY,
      targetDensity: CRUSTAL_ROCK_DENSITY,
      impactAngle: degreesToRadians(deg(30)),
      surfaceGravity: STANDARD_GRAVITY,
    } satisfies ImpactScenarioInput,
  },
  /** Meteor Crater (Barringer), Arizona ≈50 ka — iron-meteorite impactor. */
  METEOR_CRATER: {
    name: 'Meteor Crater (Barringer)',
    note: 'Iron meteorite, ≈50 ka — Kring 2007',
    input: {
      impactorDiameter: m(50),
      impactVelocity: mps(12_800),
      impactorDensity: IRON_METEORITE_DENSITY,
      targetDensity: kgPerM3(2_500),
      impactAngle: degreesToRadians(deg(45)),
      surfaceGravity: STANDARD_GRAVITY,
      impactorStrength: IMPACTOR_STRENGTH.IRON,
    } satisfies ImpactScenarioInput,
  },
  /** Chelyabinsk superbolide, 15 February 2013 — the best-instrumented
   *  airburst in history (Popova et al. 2013, Science 342). */
  CHELYABINSK: {
    name: 'Chelyabinsk 2013',
    note: 'S-type bolide airburst at 18°, 15 Feb 2013 — Popova et al. 2013 Science. Pronounced butterfly-pattern asymmetry from the very shallow entry angle (Schultz & Anderson 1996).',
    input: {
      impactorDiameter: m(17),
      impactVelocity: mps(19_000),
      impactorDensity: CHONDRITIC_DENSITY,
      targetDensity: CRUSTAL_ROCK_DENSITY,
      impactAngle: degreesToRadians(deg(18)),
      surfaceGravity: STANDARD_GRAVITY,
      impactorStrength: IMPACTOR_STRENGTH.S_TYPE,
    } satisfies ImpactScenarioInput,
  },
  /** Popigai impact structure, north-central Siberia — 35.7 Ma late
   *  Eocene crater, ≈ 100 km final diameter. The chondritic projectile
   *  identification (L-chondrite, ≈ 7 km diameter) comes from Cr-isotope
   *  and Pt-group-element fingerprinting in the impactites (Tagle &
   *  Hecht 2006). One of the largest Phanerozoic terrestrial impacts;
   *  contemporaneous with the Chesapeake Bay impact and a candidate
   *  trigger for the Eocene-Oligocene cooling (Bottke et al. 2015,
   *  PNAS 112: 11542). */
  POPIGAI: {
    name: 'Popigai 35.7 Ma',
    note: '≈ 100 km crater in northern Siberia. L-chondrite projectile (Tagle & Hecht 2006, MAPS 41: 1721); contemporary with the Chesapeake-Bay impact and a candidate trigger for the late-Eocene climate shift.',
    input: {
      impactorDiameter: m(7_000),
      impactVelocity: mps(20_000),
      impactorDensity: CHONDRITIC_DENSITY,
      targetDensity: CRUSTAL_ROCK_DENSITY,
      impactAngle: degreesToRadians(deg(45)),
      surfaceGravity: STANDARD_GRAVITY,
    } satisfies ImpactScenarioInput,
  },
  /** Boltysh impact, central Ukraine — 24 km crater, 65.39 ± 0.16 Ma
   *  (Kelley & Gurov 2002). Strikingly contemporaneous with Chicxulub
   *  to within isotopic dating resolution; the "second K-Pg impactor"
   *  hypothesis remains debated. Useful pedagogically as a "what a
   *  much smaller K-Pg-era impact would have produced on its own"
   *  comparison alongside CHICXULUB. */
  BOLTYSH: {
    name: 'Boltysh 65.4 Ma',
    note: '≈ 24 km crater, central Ukraine. Within dating uncertainty of Chicxulub (Kelley & Gurov 2002, MAPS 37: 1031); illustrates a regional-scale impact rather than a mass-extinction trigger.',
    input: {
      impactorDiameter: m(600),
      impactVelocity: mps(17_000),
      impactorDensity: CHONDRITIC_DENSITY,
      targetDensity: CRUSTAL_ROCK_DENSITY,
      impactAngle: degreesToRadians(deg(45)),
      surfaceGravity: STANDARD_GRAVITY,
    } satisfies ImpactScenarioInput,
  },
  /** Sikhote-Alin iron-meteorite shower, Russian Far East, 12 February
   *  1947 — the largest iron-meteorite fall in recorded history. The
   *  ≈ 70-tonne iron mass fragmented in the upper atmosphere into a
   *  shower of metallic projectiles that excavated 122 craters (the
   *  largest 26 m across) over a ≈ 1.6 km² ellipse. Inputs use the
   *  pre-fragmentation effective diameter (≈ 3 m for an iron sphere
   *  of ≈ 100 t total mass at ρ_iron = 7 800 kg/m³); the simulator's
   *  airburst pipeline reproduces the fragmentation altitude where
   *  the integrated dynamic pressure exceeds IMPACTOR_STRENGTH.IRON.
   *  Reference: Krinov 1966, "Giant Meteorites" (Pergamon Press). */
  SIKHOTE_ALIN_1947: {
    name: 'Sikhote-Alin 1947',
    note: '≈ 70 t iron meteorite shower, Far-Eastern Russia. Krinov 1966; Bronshten 1976. Largest iron-meteorite fall on record — fragmented in the upper atmosphere and excavated 122 craters over ≈ 1.6 km².',
    input: {
      impactorDiameter: m(3),
      impactVelocity: mps(14_500),
      impactorDensity: IRON_METEORITE_DENSITY,
      targetDensity: CRUSTAL_ROCK_DENSITY,
      impactAngle: degreesToRadians(deg(45)),
      surfaceGravity: STANDARD_GRAVITY,
      impactorStrength: IMPACTOR_STRENGTH.IRON,
    } satisfies ImpactScenarioInput,
  },
} as const;

export type ImpactPresetId = keyof typeof IMPACT_PRESETS;
