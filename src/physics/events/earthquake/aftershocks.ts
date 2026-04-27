import { mulberry32 } from '../../montecarlo/sampling.js';
import type { Meters, Seconds } from '../../units.js';
import { m, s } from '../../units.js';
import { distanceForPga } from './attenuation.js';
import { pgaFromMercalliIntensity } from './intensity.js';

/**
 * Aftershock sequence generator — Reasenberg-Jones / Båth / Omori-Utsu /
 * Gutenberg-Richter combination, deterministic given a seed.
 *
 * This is a popular-science model: it generates a representative
 * realisation of the post-mainshock seismicity, not a forecast. The
 * numbers and locations should be read as "what a typical sequence of
 * this magnitude looks like" — fault-specific aftershock zones (e.g.
 * Tōhoku 2011's offshore Japan Trench distribution) are reproduced
 * only in their bulk statistics, not in their individual epicentres.
 *
 * Physics layered together:
 *   - **Båth's law** (1965): the largest aftershock is ≈ 1.2 magnitude
 *     units below the mainshock. We cap the sampled magnitudes at
 *     M_main − 1.2.
 *   - **Gutenberg-Richter** (1954): the per-magnitude exceedance is
 *     log₁₀ N(M ≥ m) = a − b·m. We use b = 1 and sample magnitudes
 *     above a completeness cutoff M_c via inverse-CDF transform:
 *     m = M_c − log₁₀(U) / b for U ∼ Uniform(0, 1).
 *   - **Omori-Utsu** (1894 / 1961): event rate decays as
 *     n(t) = K / (c + t)^p with p ≈ 1.0–1.3 and c ≈ 0.05–0.5 days.
 *     We sample occurrence times via inverse-CDF on the analytic
 *     integral, with p = 1.1 and c = 0.05 d.
 *   - **Reasenberg & Jones** (1989) catalogue scaling sets the total
 *     event count: log₁₀ N_tot = a + b · (M_main − M_c) with
 *     a = −1.67, b = 0.91 (California-calibrated, used as a generic
 *     popular-science default).
 *
 * Spatial distribution: epicentres scatter uniformly inside a square
 * of side `ruptureLength` centred on the mainshock — a coarse proxy
 * for the rupture-zone Gaussian observed in real catalogues. Sufficient
 * for the on-globe point-cloud render; not a substitute for a real
 * fault-plane projection.
 *
 * References:
 *   Båth, M. (1965). "Lateral inhomogeneities in the upper mantle."
 *     Tectonophysics 2 (6), 483–514.
 *   Gutenberg, B. & Richter, C. F. (1954). "Seismicity of the Earth
 *     and Associated Phenomena" (2nd ed.). Princeton.
 *   Utsu, T. (1961). "A statistical study of the occurrence of
 *     aftershocks." Geophys. Mag. 30, 521–605.
 *   Reasenberg, P. A. & Jones, L. M. (1989). "Earthquake hazard after
 *     a mainshock in California." Science 243 (4895), 1173–1176.
 *     DOI: 10.1126/science.243.4895.1173.
 */

/** Båth-law magnitude gap between mainshock and largest aftershock. */
export const BATH_GAP = 1.2;
/** Gutenberg-Richter b-value used for magnitude sampling. */
export const GR_B_VALUE = 1.0;
/** Omori-Utsu p exponent. */
export const OMORI_P = 1.1;
/** Omori-Utsu c parameter (days). */
export const OMORI_C_DAYS = 0.05;
/** Reasenberg-Jones a coefficient (California-calibrated). */
export const RJ_A_COEFF = -1.67;
/** Reasenberg-Jones b coefficient. */
export const RJ_B_COEFF = 0.91;
/** Hard cap on the number of generated events — keeps the renderer
 *  responsive on extreme megathrust scenarios. */
export const MAX_AFTERSHOCKS = 500;

export interface AftershockEvent {
  /** Moment magnitude of the aftershock. */
  magnitude: number;
  /** Time since the mainshock (s). */
  timeAfterMainshock: Seconds;
  /** North offset from the mainshock epicentre (m, +N). */
  northOffsetM: Meters;
  /** East offset from the mainshock epicentre (m, +E). */
  eastOffsetM: Meters;
}

export interface AftershockSequenceInput {
  /** Mainshock moment magnitude. */
  magnitude: number;
  /** Length of the rupture surface (m). Drives the spatial scatter
   *  of generated aftershocks. */
  ruptureLength: Meters;
  /** Length of the post-mainshock observation window (days). Defaults
   *  to 30 — covers the bulk of the Omori decay envelope. */
  durationDays?: number;
  /** Magnitude completeness cutoff. Defaults to max(2.5, M_main − 4)
   *  so even an Mw 9 megathrust generates a tractable number of
   *  events for the renderer. */
  completenessCutoff?: number;
  /** Deterministic seed. Same seed → identical sequence (required by
   *  the URL-shareable simulation contract). */
  seed: string | number;
}

export interface AftershockSequenceResult {
  /** Generated events, sorted by occurrence time. */
  events: AftershockEvent[];
  /** Largest aftershock magnitude actually drawn. */
  maxMagnitude: number;
  /** Total count of events at or above completenessCutoff. */
  totalCount: number;
  /** Båth-law upper bound on aftershock magnitude
   *  (M_main − BATH_GAP). */
  bathCeiling: number;
  /** Echo of the completeness cutoff used. */
  completenessCutoff: number;
  /** Echo of the observation window in days. */
  durationDays: number;
}

/**
 * Generate the aftershock catalogue for a mainshock. Pure deterministic
 * function — same input + seed always produces the same sequence.
 */
export function generateAftershockSequence(
  input: AftershockSequenceInput
): AftershockSequenceResult {
  const Mc = input.completenessCutoff ?? Math.max(2.5, input.magnitude - 4);
  const Mmax = input.magnitude - BATH_GAP;
  const durationDays = input.durationDays ?? 30;
  const bathCeiling = Mmax;

  // Predicted total event count above Mc (Reasenberg-Jones 1989).
  const log10N = RJ_A_COEFF + RJ_B_COEFF * (input.magnitude - Mc);
  const predictedN = Math.pow(10, log10N);
  const targetCount = Math.min(MAX_AFTERSHOCKS, Math.round(predictedN));

  const rng = mulberry32(input.seed);
  const events: AftershockEvent[] = [];

  // Pre-compute the Omori normalisation so inverse-CDF sampling works.
  // ∫₀^T K/(c+t)^p dt = K · ((c+T)^(1-p) − c^(1-p)) / (1-p)   for p ≠ 1
  // Setting that integral = targetCount gives K. We don't actually
  // need K to sample times — the inverse CDF only depends on c, p, T.
  const c = OMORI_C_DAYS;
  const p = OMORI_P;
  const T = durationDays;
  // Inverse CDF for occurrence time given uniform U ∈ [0, 1):
  //   t(U) = ((c^(1-p) + U · ((c+T)^(1-p) − c^(1-p)))^(1/(1-p))) − c
  const cExp = Math.pow(c, 1 - p);
  const cTExp = Math.pow(c + T, 1 - p);
  const span = cTExp - cExp;

  for (let i = 0; i < targetCount; i++) {
    // Magnitude — Gutenberg-Richter inverse CDF capped at Båth.
    let magnitude: number;
    do {
      const u = Math.max(rng.next(), 1e-12);
      magnitude = Mc - Math.log10(u) / GR_B_VALUE;
    } while (magnitude > Mmax);

    // Occurrence time — Omori-Utsu inverse CDF.
    const u = rng.next();
    const tDays = Math.pow(cExp + u * span, 1 / (1 - p)) - c;
    const tSeconds = tDays * 86_400;

    // Spatial — uniform within ±ruptureLength/2 of epicentre.
    const dx = (rng.next() - 0.5) * (input.ruptureLength as number);
    const dy = (rng.next() - 0.5) * (input.ruptureLength as number);

    events.push({
      magnitude,
      timeAfterMainshock: s(Math.max(tSeconds, 0)),
      northOffsetM: m(dy),
      eastOffsetM: m(dx),
    });
  }

  events.sort((a, b) => (a.timeAfterMainshock as number) - (b.timeAfterMainshock as number));

  const maxMagnitude = events.reduce(
    (max, e) => (e.magnitude > max ? e.magnitude : max),
    -Infinity
  );

  return {
    events,
    maxMagnitude: Number.isFinite(maxMagnitude) ? maxMagnitude : Mc,
    totalCount: events.length,
    bathCeiling,
    completenessCutoff: Mc,
    durationDays,
  };
}

/**
 * Felt-intensity contour radii (MMI V / VI / VII) around an aftershock
 * of given moment magnitude. Computed via the same Joyner–Boore +
 * Worden 2012 pipeline as the mainshock, just at lower MMI thresholds —
 * aftershocks are bounded above by `M_main − BATH_GAP` (Båth 1965), so
 * an Mw 8 mainshock's largest aftershock peaks at ≈ Mw 6.8 and
 * routinely fails to reach MMI VIII / IX outside the immediate rupture
 * area. The V / VI / VII band ("light → strong felt shaking") is the
 * useful pedagogical range for an aftershock click-through.
 *
 * Pure function — can be called from the UI on demand without a
 * worker round-trip. Returns {@link m}(0) for any contour the
 * magnitude is too small to sustain at the epicentre, mirroring the
 * convention in `simulateEarthquake`.
 */
export interface AftershockShakingFootprint {
  /** Ground range to the MMI V contour ("widely felt"). */
  mmi5Radius: Meters;
  /** Ground range to the MMI VI contour ("strongly felt"). */
  mmi6Radius: Meters;
  /** Ground range to the MMI VII contour ("strong shaking"). */
  mmi7Radius: Meters;
}

export function aftershockShakingFootprint(magnitude: number): AftershockShakingFootprint {
  return {
    mmi5Radius: distanceForPga(magnitude, pgaFromMercalliIntensity(5)),
    mmi6Radius: distanceForPga(magnitude, pgaFromMercalliIntensity(6)),
    mmi7Radius: distanceForPga(magnitude, pgaFromMercalliIntensity(7)),
  };
}
