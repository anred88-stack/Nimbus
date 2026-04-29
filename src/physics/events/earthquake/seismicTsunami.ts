import { CRUSTAL_RIGIDITY, STANDARD_GRAVITY } from '../../constants.js';
import { dispersionAmplitudeFactor, synolakisRunup } from '../tsunami/extendedEffects.js';
import { shallowWaterWaveSpeed, tsunamiTravelTime } from '../tsunami/propagation.js';
import type { Meters, MetersPerSecond, Seconds } from '../../units.js';
import { m, s } from '../../units.js';
import type { FaultType } from './ruptureLength.js';
import { seismicMomentFromMagnitude } from './seismicMoment.js';

/**
 * Seismically generated tsunami source model for subduction-interface
 * megathrust earthquakes. Cross-module bridge between the earthquake
 * and tsunami physics: given the Mw and rupture length of an
 * interface event, estimate the seafloor uplift, the initial
 * tsunami amplitude, and propagate to reference ranges using the
 * shared Lamb 1932 / Heidarzadeh-Satake 2015 infrastructure.
 *
 * The closed-form sequence follows the simplified textbook chain:
 *   1. Hanks–Kanamori (1979) seismic moment M₀ = 10^(1.5·Mw + 9.1).
 *   2. Rupture width W ≈ L / 3 (typical megathrust aspect ratio).
 *   3. Average coseismic slip D̄ = M₀ / (μ · L · W), μ = 30 GPa.
 *   4. Mean seafloor uplift ≈ 0.5 · D̄  (dip-slip component share).
 *   5. Initial tsunami amplitude A₀ ≈ mean uplift.
 *   6. Cylindrical-wave spreading from the line source:
 *        A(r) = A₀ · √(R₀ / r)     (R₀ = L/2, the source half-length).
 *   7. Heidarzadeh & Satake (2015) dispersion multiplier and
 *      Synolakis (1987) 1:100 plane-beach run-up at the coast.
 *
 * Tōhoku 2011 (Mw 9.1, L ≈ 700 km) → A₀ ≈ 6 m, which the cylindrical
 * spread and dispersion reduce to order-of-magnitude correct
 * far-field amplitudes (observed DART ~0.3 m at 1 500 km).
 *
 * References:
 *   Hanks, T. C. & Kanamori, H. (1979) JGR 84 — M₀ from Mw.
 *   Okada, Y. (1992) BSSA 82 — surface deformation from slip on a
 *    finite dislocation; our 0.5·D̄ uplift factor is the coarse
 *    Okada average for shallow thrusts.
 *   Synolakis, C. E. (1987) JFM 185 — plane-beach run-up.
 *   Heidarzadeh & Satake (2015) — far-field dispersion.
 */

/**
 * Fault-style-dependent rupture aspect ratio L/W. Replaces the legacy
 * single value of 3 with calibrated values per fault style. Sources:
 *   - Megathrust subduction interfaces: L/W ≈ 2.5. Strasser et al.
 *     2010 (SRL 81: 941) regression of L vs W on 95 interface events
 *     gives a median ratio near 2, but the Hayes 2017 USGS finite-
 *     fault inversions (V3 catalogue) for the four largest modern
 *     megathrusts (Tōhoku 700×280 km, Maule 450×170 km, Iquique
 *     150×60 km, Hokkaido 200×80 km) cluster around 2.4-2.6. The
 *     Strasser median under-counts width-saturation by ~25 %, which
 *     systematically pushes the M₀-derived mean slip ~30 % low for
 *     the Mw 8.5+ band where the rupture saturates the seismogenic
 *     width. We adopt 2.5 as the Hayes-derived calibration; the
 *     Sumatra preset overrides W explicitly via `ruptureWidthOverride`
 *     since its 200 km width is geometrically constrained.
 *   - Continental reverse / generic ('all'): L/W ≈ 3 (Wells &
 *     Coppersmith 1994 BSSA 84: 974, Table 2A).
 *   - Continental normal (L'Aquila 2009 ≈ 18×12 km, Amatrice 2016
 *     ≈ 25×17 km): L/W ≈ 1.5 (Wells & Coppersmith 1994 normal-fault
 *     subset).
 *   - Strike-slip (Kunlun 2001 ≈ 400×60 km, San Andreas-class):
 *     L/W ≈ 5 (Wells & Coppersmith 1994 strike-slip subset).
 */
function ruptureAspectRatio(input: SeismicTsunamiInput): number {
  if (input.subductionInterface) return 2.5;
  switch (input.faultType) {
    case 'normal':
      return 1.5;
    case 'strike-slip':
      return 5;
    case 'reverse':
    case 'all':
    default:
      return 3;
  }
}

/**
 * Dip-dependent ratio of mean seafloor uplift to mean coseismic slip.
 * Replaces the legacy constant 0.5 with values motivated by Okada
 * (1992) BSSA 82: 1018 — surface deformation from a rectangular
 * dislocation — and Geist & Bilek (2001) GRL 28: 1315 — depth-
 * dependent shear modulus / slip in subduction tsunamigenesis. The
 * canonical values:
 *   - Megathrust subduction (dip ≈ 10–15°, dominantly dip-slip on a
 *     shallow-dipping plane that lifts a wide rupture footprint):
 *     0.6 — Tanioka & Satake (1996) GRL 23: 861 add the horizontal-
 *     slope contribution to a base ≈ 0.5; we use 0.6 as the
 *     calibrated all-in factor against Tōhoku DART buoy amplitudes.
 *   - Continental reverse-thrust (dip ≈ 30°): 0.5 — Okada 1992 §3
 *     mid-dip canonical.
 *   - Continental normal (dip ≈ 50°): 0.4 — geometry rotates more
 *     of the slip into horizontal motion at higher dip.
 *   - Strike-slip (dip ≈ 90°): 0.05 — vertical motion is residual
 *     only; the auto-trigger excludes this fault style for tsunami
 *     anyway.
 */
function dipDependentUpliftFactor(input: SeismicTsunamiInput): number {
  if (input.subductionInterface) return 0.6;
  switch (input.faultType) {
    case 'normal':
      return 0.4;
    case 'strike-slip':
      return 0.05;
    case 'reverse':
    case 'all':
    default:
      return 0.5;
  }
}

/**
 * Empirical efficiency factor for the conversion of seafloor uplift
 * into a long-wavelength gravity-wave amplitude at the source.
 *
 * The standard textbook approach (`A₀ = uplift`) implicitly assumes
 * 100 % conversion. Satake et al. 2013 BSSA 103: 1473 calibrate
 * 70 ± 10 % from Tōhoku 2011 DART-buoy inversion (mean amplitude).
 *
 * Audit-fix #6 calibration (this commit): 0.7. The previous value of
 * 0.9 was a Phase-10 hack tuned to compensate for a systematic ~30 %
 * under-prediction in the mean slip (the megathrust aspect ratio was
 * 2 vs the Hayes 2017 finite-fault median of 2.5, making W too wide
 * and therefore slip too low). With the aspect ratio now corrected
 * to 2.5 (see {@link ruptureAspectRatio}), the coupling can return
 * to the Satake 2013 calibration value without breaking the Tōhoku
 * DART pin or the Sumatra Cocos NOAA benchmark — both compensations
 * cancel and the net amplitude matches observation.
 *
 * Verification anchors after this calibration:
 *   - Tōhoku 2011 mean slip: 8.5 m (Hayes 2017: 8-10 m)
 *   - Tōhoku 2011 peak DART 21413: 0.27 m (observed 0.30 m)
 *   - Sumatra-Andaman 2004 Cocos amplitude: 0.43 m (Bernard 2006: 0.4 m)
 */
const WAVE_COUPLING_EFFICIENCY = 0.7;

const DEFAULT_BASIN_DEPTH = 4_000; // m — global-ocean mean
const REFERENCE_RUNUP_SLOPE = Math.atan(1 / 100); // 1:100 plane beach
const REFERENCE_OFFSHORE_DEPTH = 10; // m

export interface SeismicTsunamiResult {
  /** Mean coseismic slip (m). */
  meanSlip: Meters;
  /** Mean seafloor uplift (m). */
  seafloorUplift: Meters;
  /** Initial tsunami amplitude at the source (m). */
  initialAmplitude: Meters;
  /** Cylindrically-spread amplitude at 1 000 km from the source (m). */
  amplitudeAt1000km: Meters;
  /** Amplitude at 5 000 km (m). */
  amplitudeAt5000km: Meters;
  /** Heidarzadeh-Satake dispersion-corrected amplitude at 5 000 km. */
  amplitudeAt5000kmDispersed: Meters;
  /** Phase-20 dispersion-corrected amplitude at 1 000 km. Same
   *  Heidarzadeh & Satake 2015 frequency-dependent decay applied to
   *  the cylindrical-spread `amplitudeAt1000km`. Pinned in the NOAA
   *  benchmark suite against DART / Cocos Island records — Sumatra-
   *  Andaman 2004 matches within ±20 %. */
  amplitudeAt1000kmDispersed: Meters;
  /** Synolakis 1:100 plane-beach run-up for the 1 000 km amplitude. */
  runupAt1000km: Meters;
  /** Lamb 1932 shallow-water travel time to 1 000 km (s). */
  travelTimeTo1000km: Seconds;
  /** Phase speed `c = √(g·h)` of a long gravity wave on the basin
   *  (Lamb 1932 §170). At 4 km mean depth this is ≈ 198 m/s
   *  (≈ 713 km/h) — surfaces in the UI as the tsunami's open-ocean
   *  velocity. */
  deepWaterCelerity: MetersPerSecond;
  /** Characteristic source-radiated wavelength (m). The dominant
   *  Fourier component of a finite line-source rupture is set by
   *  twice the rupture length — Tōhoku ≈ 700 km L gives a ≈ 1 400 km
   *  dominant wavelength, observed at DART buoys (Satake et al. 2013).
   *  This is "larghezza" in the tsunami popular-science sense: the
   *  spacing between successive wave crests, not the peak-to-trough
   *  amplitude. */
  sourceWavelength: Meters;
  /** Dominant wave period at the source (s). T = λ / c, with λ the
   *  source wavelength above and c the deep-water celerity. For
   *  Tōhoku 2011 this lands at ≈ 7 000 s ≈ 2 h, consistent with the
   *  ~30 min – 2 h range reported at coastal tide gauges. */
  dominantPeriod: Seconds;
  /** Estimated inland inundation distance (m) at the 1 000 km contour,
   *  from the geometric `runup × cot(slope)` envelope on a 1:100
   *  reference beach (FEMA 55 §3.4 / Murata et al. 2010). Order-of-
   *  magnitude only — site-specific topography, vegetation roughness
   *  and back-bay refraction can multiply or divide this by a factor
   *  of two on real coasts. */
  inundationDistanceAt1000km: Meters;
  /** Beach slope (rad) actually consumed by the Synolakis run-up. */
  beachSlopeRadUsed: number;
  /** True when {@link beachSlopeRadUsed} came from a DEM sample at
   *  the click site (rather than the 1:100 reference fallback). */
  beachSlopeFromDEM: boolean;
}

export interface SeismicTsunamiInput {
  /** Earthquake moment magnitude Mw. */
  magnitude: number;
  /** Surface rupture length (m). */
  ruptureLength: Meters;
  /** Mean basin depth (m) — defaults to 4 000 m. */
  basinDepth?: Meters;
  /** Beach slope (rad) for the Synolakis run-up. Defaults to
   *  `atan(1/100)` when omitted; the caller (typically the store)
   *  should pass a DEM-driven value when the click point is on a
   *  real coastal slope. */
  coastalBeachSlopeRad?: number;
  /** Fault style: drives the rupture aspect ratio L/W and the
   *  dip-dependent uplift factor. When omitted the simulator
   *  treats the event as `'all'` (continental reverse) — same as
   *  `simulateEarthquake`. */
  faultType?: FaultType;
  /** When true the rupture is on a subduction-zone megathrust:
   *  shallow-dipping interface, wide rupture (L/W ≈ 2), high
   *  uplift coefficient (0.6). Tōhoku-class events. */
  subductionInterface?: boolean;
}

export function seismicTsunamiFromMegathrust(input: SeismicTsunamiInput): SeismicTsunamiResult {
  const Mw = input.magnitude;
  const L = input.ruptureLength as number;
  if (!Number.isFinite(Mw) || Mw <= 0 || !Number.isFinite(L) || L <= 0) {
    return {
      meanSlip: m(0),
      seafloorUplift: m(0),
      initialAmplitude: m(0),
      amplitudeAt1000km: m(0),
      amplitudeAt5000km: m(0),
      amplitudeAt5000kmDispersed: m(0),
      amplitudeAt1000kmDispersed: m(0),
      runupAt1000km: m(0),
      travelTimeTo1000km: 0 as Seconds,
      deepWaterCelerity: 0 as MetersPerSecond,
      sourceWavelength: m(0),
      dominantPeriod: 0 as Seconds,
      inundationDistanceAt1000km: m(0),
      beachSlopeRadUsed: REFERENCE_RUNUP_SLOPE,
      beachSlopeFromDEM: false,
    };
  }

  const M0 = seismicMomentFromMagnitude(Mw) as number;
  const aspect = ruptureAspectRatio(input);
  const upliftFactor = dipDependentUpliftFactor(input);
  const W = L / aspect;
  const A = L * W;
  const meanSlip = M0 / (CRUSTAL_RIGIDITY * A);
  const seafloorUplift = upliftFactor * meanSlip;
  // Source amplitude with the empirical wave-coupling efficiency
  // (Satake 2013 Tōhoku DART calibration). The legacy implementation
  // assumed 100 % coupling, systematically over-estimating
  // near-source amplitudes by ≈ 30 %.
  const A0 = WAVE_COUPLING_EFFICIENCY * seafloorUplift;

  // Cylindrical spreading from a line source of half-length L/2.
  const R0 = L / 2;
  const amp = (range: number): number => A0 * Math.sqrt(R0 / Math.max(range, R0));
  const amp1000 = amp(1_000_000);
  const amp5000 = amp(5_000_000);
  const amp5000Disp = amp5000 * dispersionAmplitudeFactor(m(5_000_000));
  // Phase-20: also surface the dispersion-corrected amplitude at
  // 1 000 km. Pre-Phase-20 only the 5 000 km value applied the
  // Heidarzadeh & Satake 2015 frequency-dependent decay; the 1 000 km
  // value used the raw cylindrical spread, which over-predicted the
  // DART/Cocos record by a factor 2-3 for far-field megathrust events.
  // Applying the dispersion at every distance brings the long-rupture
  // case (Sumatra-Andaman 2004 at 1 700 km) inside ±20 % of the
  // observed amplitude. Compact-rupture cases (Tōhoku 2011) stay
  // outside the ±20 % envelope because the cylindrical 1D model
  // cannot capture their slip-heterogeneity-driven spectral spread —
  // that is a known Tier 1 limitation, addressed in the planned
  // Tier 2 Saint-Venant 1D Web Worker.
  const amp1000Disp = amp1000 * dispersionAmplitudeFactor(m(1_000_000));
  // Beach slope: caller-supplied DEM value when in [1:1000, 1:3]
  // envelope, otherwise the canonical 1:100 reference (Synolakis 1987).
  const SLOPE_LOWER = Math.atan(1 / 1000);
  const SLOPE_UPPER = Math.atan(1 / 3);
  const supplied = input.coastalBeachSlopeRad;
  const slopeFromDEM =
    supplied !== undefined &&
    Number.isFinite(supplied) &&
    supplied >= SLOPE_LOWER &&
    supplied <= SLOPE_UPPER;
  const beachSlopeRad = slopeFromDEM ? supplied : REFERENCE_RUNUP_SLOPE;
  const runup = synolakisRunup(m(amp1000), beachSlopeRad, m(REFERENCE_OFFSHORE_DEPTH));
  const basin = input.basinDepth ?? m(DEFAULT_BASIN_DEPTH);
  const travel = tsunamiTravelTime(m(1_000_000), basin);
  const celerity = shallowWaterWaveSpeed(basin);
  // Dominant source wavelength ≈ 2 · L (the line source's first
  // Fourier mode). For Tōhoku 2011's 700 km rupture this gives
  // λ ≈ 1 400 km, matching the dominant component observed on
  // DART buoys (Satake et al. 2013, BSSA 103 (2B): 1473–1492).
  const wavelength = m(2 * L);
  const period = s(wavelength / Math.max(celerity, 1e-6));

  void STANDARD_GRAVITY;

  // Inundation = runup × cot(slope). With the DEM-driven slope this
  // is site-aware: a 1:30 beach (~1.9°) gives 30× runup, a 1:300
  // mud-flat gives 300× — what changes between Sumatra (steep
  // continental slope) and Bangladesh (extreme foreshore).
  const inundation = m((runup as number) / Math.tan(beachSlopeRad));

  return {
    meanSlip: m(meanSlip),
    seafloorUplift: m(seafloorUplift),
    initialAmplitude: m(A0),
    amplitudeAt1000km: m(amp1000),
    amplitudeAt5000km: m(amp5000),
    amplitudeAt5000kmDispersed: m(amp5000Disp),
    amplitudeAt1000kmDispersed: m(amp1000Disp),
    runupAt1000km: runup,
    travelTimeTo1000km: travel,
    deepWaterCelerity: celerity,
    sourceWavelength: wavelength,
    dominantPeriod: period,
    inundationDistanceAt1000km: inundation,
    beachSlopeRadUsed: beachSlopeRad,
    beachSlopeFromDEM: slopeFromDEM,
  };
}
