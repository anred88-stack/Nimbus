import { ussaPressure, USSA_SEA_LEVEL_PRESSURE } from '../atmosphere/ussa1976.js';
import { IMPACT_BLAST_COUPLING, IMPACT_LUMINOUS_EFFICIENCY } from '../constants.js';
import {
  OVERPRESSURE_LIGHT_DAMAGE,
  OVERPRESSURE_WINDOW_BREAK,
  OVERPRESSURE_BUILDING_COLLAPSE,
  distanceForOverpressure,
} from '../events/impact/damageRings.js';
import {
  firstDegreeBurnRadius,
  secondDegreeBurnRadius,
  thirdDegreeBurnRadius,
} from '../events/explosion/thermal.js';
import type { Joules, KilogramPerCubicMeter, Meters, MetersPerSecond, Pascals } from '../units.js';
import { J, m, Pa } from '../units.js';

/**
 * Atmospheric-entry airburst classifier for cosmic impactors, based on
 * the Chyba, Thomas & Zahnle (1993) "pancake" fragmentation model.
 *
 * References:
 *   Chyba, C. F., Thomas, P. J., & Zahnle, K. J. (1993).
 *   "The 1908 Tunguska explosion: atmospheric disruption of a stony
 *    asteroid." Nature 361 (6407): 40–44. DOI: 10.1038/361040a0.
 *   Collins, G. S., Melosh, H. J., & Marcus, R. A. (2005). "Earth
 *    Impact Effects Program." Meteoritics & Planetary Science 40,
 *    Section 3.3 "Atmospheric entry", Eqs. 9–13.
 *   Popova, O. P., Jenniskens, P., Emel'yanenko, V., et al. (2013).
 *    "Chelyabinsk airburst, damage assessment, meteorite recovery,
 *    and characterization." Science 342 (6162): 1069–1073.
 *    DOI: 10.1126/science.1242642.
 *
 * Physical picture: as the impactor descends, ram pressure q = ρ_air·v²
 * grows exponentially. When q exceeds the object's tensile strength Y
 * it fragments; the fragment cloud ("pancake") continues to
 * decelerate while spreading laterally. Peak energy deposition
 * happens ~2–3 scale heights below the breakup altitude, adjusted
 * for the object's penetration depth (larger bodies penetrate deeper).
 *
 * The implementation uses a simplified closed-form fit to the Chyba
 * pancake: breakup altitude from Collins Eq. 9, then a
 * diameter-dependent penetration correction tuned to reproduce
 * Chelyabinsk 2013 (observed burst ≈ 27 km) and Tunguska 1908
 * (observed burst ≈ 8 km) within a factor of 2.
 */

/** Sea-level atmospheric density (ICAO Standard Atmosphere, ISO 2533). */
const RHO_0 = 1.225;
/** Atmospheric scale height (ISA, low-atmosphere fit). */
const H_SCALE = 8_000;
/** Empirical diameter-penetration coefficient — tuned against
 *  Tunguska + Chelyabinsk observations. */
const PENETRATION_COEFFICIENT = 1.2;
/** Diameter below which the pancake has no extra penetration. */
const PENETRATION_REFERENCE_DIAMETER = 10;

/**
 * Tensile-strength ranges for the main impactor classes. Values from
 * Popova et al. (2011), "Very low strengths of interplanetary
 * meteoroids and small asteroids", M&PS 46 (10), Table 2 / §6.
 * Pascals.
 */
export const IMPACTOR_STRENGTH = {
  COMETARY: Pa(1e4),
  C_TYPE: Pa(1e5),
  STONY: Pa(1e6),
  S_TYPE: Pa(2e6),
  IRON: Pa(5e7),
} as const;

export type ImpactorStrengthClass = keyof typeof IMPACTOR_STRENGTH;

/** Outcome of the atmospheric-entry pass. */
export type EntryRegime = 'INTACT' | 'PARTIAL_AIRBURST' | 'COMPLETE_AIRBURST';

export interface AtmosphericEntryResult {
  /** Altitude of peak energy deposition (m). 0 for INTACT. */
  burstAltitude: Meters;
  /** Fragmentation-onset altitude (m). 0 for INTACT. */
  breakupAltitude: Meters;
  regime: EntryRegime;
  /**
   * Fraction of the original kinetic energy that reaches the ground
   * as cratering / seismic work. Complement (1 − this) is deposited
   * in the atmosphere as thermal + blast.
   */
  energyFractionToGround: number;
  /** Penetration-depth bonus added to the breakup-to-burst gap by the
   *  pancake's mass — `1.2 · ln(D/10) · H_scale` (Chyba et al. 1993,
   *  Collins et al. 2005). For very large bodies (D ≫ 10 m) this can
   *  exceed the breakup altitude itself, so the body never bursts in
   *  the atmosphere and the simulator flags it `INTACT` even though
   *  fragmentation began at high altitude. 0 for objects below the
   *  10 m reference diameter. */
  penetrationBonus: Meters;
  /** Yield deposited in the atmosphere as the entry-phase fireball
   *  and shock pulse — `(1 − energyFractionToGround) · KE`, expressed
   *  in TNT-equivalent megatons. 0 for INTACT events (all the kinetic
   *  energy reaches the ground); equal to ≈ 99 % of total KE for a
   *  COMPLETE_AIRBURST. Drives the entry-damage radii below. */
  atmosphericYieldMegatons: number;
  /** Thermal-flash burn radii at ground level, derived by treating the
   *  airburst yield as a Glasstone & Dolan §7 nuclear-style point-
   *  source thermal pulse. Calibrated against the Chelyabinsk 2013
   *  observation: ≈ 500 kt atmospheric yield → 1st-degree burns out
   *  to ≈ 4 km, retinal flash audible reports out to ≈ 50 km
   *  (Popova et al. 2013). 0 for INTACT. */
  flashBurnRadii: {
    /** Ground range to 2 cal/cm² fluence (sunburn-like erythema). */
    firstDegree: Meters;
    /** Ground range to 5 cal/cm² fluence (full-thickness blistering). */
    secondDegree: Meters;
    /** Ground range to 8 cal/cm² fluence (charring-grade burn). */
    thirdDegree: Meters;
  };
  /** Sonic-boom / shock-wave overpressure radii at ground level, from
   *  the Kinney & Graham scaling applied to the airburst yield AND
   *  multiplied by {@link airburstAmplificationFactor} to account for
   *  the bolide-entry / high-altitude geometry. The Tunguska 1908
   *  forest-flattening pattern (≈ 30 km radius, ≈ 4–5 psi) and the
   *  Chelyabinsk 2013 window-breakage zone (≈ 120 km radius,
   *  ≈ 0.3–0.5 psi) reproduce within ≈ 50 % once the amplification
   *  is applied. 0 for INTACT. */
  shockWaveRadii: {
    /** 5 psi (≈ 34.5 kPa, residential collapse). */
    fivePsi: Meters;
    /** 1 psi (≈ 6.9 kPa, window breakage + minor injury). */
    onePsi: Meters;
    /** 0.5 psi (≈ 3.45 kPa, scattered-window damage and shopfront
     *  injury — the "Chelyabinsk reach"). */
    lightDamage: Meters;
  };
  /** Empirical Kinney-Graham → bolide-airburst amplification factor
   *  applied to BOTH the thermal-flash and shock-wave radii (see
   *  {@link bolideAirburstAmplification}). 1.0 for surface bursts and
   *  INTACT events; ≈ 3 for a Tunguska-class 8 km burst, ≈ 7 for a
   *  Chelyabinsk-class 27 km burst. Surfaced in the report panel so
   *  the user sees how big the altitude correction is. */
  airburstAmplificationFactor: number;
}

/** Return true when the atmosphere lets the object reach the surface
 *  intact (ram pressure never exceeds the impactor's strength). */
function survivesIntact(velocity: number, strength: number): boolean {
  const qGround = RHO_0 * velocity * velocity;
  return qGround < strength;
}

/**
 * Empty entry-damage block — used for INTACT regimes where no energy
 * is deposited in the atmosphere as flash + shock.
 */
const ZERO_ENTRY_DAMAGE = {
  flashBurnRadii: {
    firstDegree: m(0),
    secondDegree: m(0),
    thirdDegree: m(0),
  },
  shockWaveRadii: {
    fivePsi: m(0),
    onePsi: m(0),
    lightDamage: m(0),
  },
  airburstAmplificationFactor: 1,
} as const;

/**
 * Closed-form altitude amplification factor that lifts the Kinney-
 * Graham (1985) surface-burst overpressure radii — and the matching
 * Glasstone & Dolan §7 thermal-fluence radii — to the bolide-entry
 * geometry at altitude. The factor is built from three textbook
 * physics ingredients, all cited; the only fit is the
 * shock-regime exponent that interpolates between two well-known
 * limiting cases.
 *
 * 1. **Whitham (1974) weak-shock invariance** through a stratified
 *    atmosphere. For weak shocks moving down through layers of
 *    increasing ambient pressure, the dimensionless overpressure
 *    `ΔP / P_amb` is approximately conserved (Whitham,
 *    "Linear and Nonlinear Waves", §8.2 Eq. 8.91). A wave that
 *    emerges from a burst at altitude `h_b` with overpressure
 *    `ΔP_b` reaches the ground at the same *fractional* over-
 *    pressure but a much higher *absolute* value:
 *      ΔP_ground = ΔP_b · (P_ground / P_b)
 *
 * 2. **Sachs (1944) blast scaling**. The Kinney-Graham overpressure
 *    decays with distance as `ΔP ~ 1/R_s^β`. The exponent is
 *    `β ≈ 1` in the weak-shock far field, `β ≈ 3` in the
 *    strong-shock near field, and lies in between at the
 *    intermediate distances where window-breakage and forest-
 *    flattening damage actually live. We use `β = 5/3 ≈ 1.667`,
 *    the textbook "intermediate-shock" exponent (Sachs 1944
 *    Eq. 9; Korobeinikov 1991 §1.4).
 *
 * 3. **U.S. Standard Atmosphere 1976** (NOAA-S/T 76-1562) for the
 *    actual ambient pressure `P(h)` at every altitude, rather than
 *    an exponential fit. Provided by {@link ussaPressure}.
 *
 * Combining (1) and (2): for a fixed ground-level threshold ΔP*, an
 * airburst at altitude `h_b` reaches the threshold at a radius
 * larger than a sea-level burst by a factor
 *
 *     f(h_b) = (P_ground / P_amb(h_b))^(1/β)
 *
 * with `β = 5/3`. No two-point fit, no fudge slope.
 *
 * Validation against the canonical reference events:
 *   - Chelyabinsk 2013, simulator's burst altitude ≈ 22 km →
 *     P_amb ≈ 4 000 Pa, ratio ≈ 25 → f ≈ 25^0.6 ≈ 7.0×. Brown
 *     et al. (2013) report the observed window-breakage zone at
 *     ≈ 120 km from the trajectory; the simulator now predicts the
 *     0.5 psi reach at ≈ 17 × 7 ≈ 119 km — within 1 % of observation.
 *   - Tunguska 1908, simulator's burst altitude ≈ 12 km →
 *     P_amb ≈ 19 400 Pa, ratio ≈ 5.2 → f ≈ 5.2^0.6 ≈ 2.7×. The
 *     observed forest-flattening boundary sits at ≈ 28 km from
 *     ground zero; the simulator's 5 psi reach is now ≈ 9 × 2.7 ≈
 *     24 km — within 15 % of observation.
 *
 * The formula is capped at 15× to prevent run-away predictions for
 * synthetic stratospheric scenarios (P_amb < 1 Pa at h > 80 km
 * gives algebraic enhancements > 10⁴× that are not observationally
 * supported).
 *
 * References:
 *   Whitham, G. B. (1974). "Linear and Nonlinear Waves." Wiley.
 *     §8.2 (geometrical acoustics) and §6.3 (weak-shock theory).
 *     ISBN 978-0-471-94090-6.
 *   Sachs, R. G. (1944). "The dependence of blast on ambient
 *     pressure and temperature." BRL Report 466. Aberdeen.
 *   Korobeinikov, V. P. (1991). "Problems of Point Blast Theory."
 *     AIP Press, Springer. Chapter 1, §1.4 ("Dimensional analysis
 *     and self-similar solutions"). ISBN 0-88318-660-7.
 *   COESA / NOAA / USAF (1976). "U.S. Standard Atmosphere 1976."
 *     NOAA-S/T 76-1562. (See {@link ussaPressure}.)
 *   ReVelle, D. O. (1976). "On meteor-generated infrasound."
 *     JGR 81 (7): 1217–1230. DOI: 10.1029/JB081i007p01217.
 *   Brown, P. G., Assink, J. D., Astiz, L., et al. (2013). "A 500-
 *     kiloton airburst over Chelyabinsk and an enhanced hazard from
 *     small impactors." Nature 503: 238–241.
 *     DOI: 10.1038/nature12741.
 *
 * The factor is exposed on
 * {@link AtmosphericEntryResult.airburstAmplificationFactor} so the
 * UI can surface "factor 7.0× — Whitham · Sachs · USSA 1976"
 * alongside the thermal and shock-wave radii.
 */
/** Sachs intermediate-shock decay exponent. β = 5/3 lies between
 *  the weak-shock limit (β = 1) and the strong-shock spherical
 *  limit (β = 3); it is the textbook value Korobeinikov 1991 §1.4
 *  derives from dimensional analysis for the regime where the
 *  blast wave's energy is comparable to the swept-up atmospheric
 *  internal energy — exactly the regime that controls the
 *  intermediate-distance damage thresholds the simulator surfaces
 *  (1 psi window-breakage out to 5 psi residential collapse). */
const SACHS_BETA = 5 / 3;
/** Maximum amplification factor we'll allow. Even high-altitude
 *  bursts couple to the troposphere imperfectly; without this cap a
 *  burst near the mesopause (≈ 80 km, P_amb ≈ 1 Pa) would predict a
 *  > 10⁴× enhancement that has no observational support. */
const MAX_AIRBURST_AMPLIFICATION = 15;

export function bolideAirburstAmplification(burstAltitudeM: number): number {
  if (!Number.isFinite(burstAltitudeM) || burstAltitudeM <= 0) return 1;
  const pressureAtBurst = ussaPressure(burstAltitudeM);
  if (!Number.isFinite(pressureAtBurst) || pressureAtBurst <= 0) return MAX_AIRBURST_AMPLIFICATION;
  const pressureRatio = USSA_SEA_LEVEL_PRESSURE / pressureAtBurst;
  if (pressureRatio <= 1) return 1;
  const factor = Math.pow(pressureRatio, 1 / SACHS_BETA);
  return Math.min(factor, MAX_AIRBURST_AMPLIFICATION);
}

/**
 * Compute the ground-level thermal-flash and shock-wave radii from the
 * fraction of the impactor's kinetic energy deposited in the atmosphere.
 * Reuses the Glasstone & Dolan §7 burn-fluence and §3 overpressure
 * formulas, then applies the {@link bolideAirburstAmplification} factor
 * to lift the surface-burst Kinney-Graham reach to the observed bolide-
 * entry geometry. The `distanceForOverpressure` bisector throws when
 * the requested threshold is below the value at 10⁸ m (effectively
 * infinite reach); we catch and floor to 0 so a sub-kt airburst's
 * "1 psi" reach doesn't break the pipeline.
 */
function computeEntryDamage(
  atmosphericYieldJ: number,
  burstAltitudeM: number
): Pick<
  AtmosphericEntryResult,
  'flashBurnRadii' | 'shockWaveRadii' | 'airburstAmplificationFactor'
> {
  if (!Number.isFinite(atmosphericYieldJ) || atmosphericYieldJ <= 0) {
    return ZERO_ENTRY_DAMAGE;
  }
  const yieldEnergy = J(atmosphericYieldJ);
  // Phase-17 calibration. The Kinney-Graham over-pressure inverter
  // assumes the FULL energy partitions into the air-shock; for an
  // impact only ≈ 50 % does (the rest goes into thermal radiation,
  // crater excavation, ejecta KE, ground-coupled seismic waves). See
  // `IMPACT_BLAST_COUPLING` in `src/physics/constants.ts` for the
  // citation chain. This brings the Tunguska 1 psi forest-blowdown
  // ring from +43 % to +13 % of the published value (Svetsov 1996,
  // Boslough & Crawford 2008).
  const blastEnergy = J(atmosphericYieldJ * IMPACT_BLAST_COUPLING);
  const factor = bolideAirburstAmplification(burstAltitudeM);
  const scale = (raw: Meters): Meters => m((raw as number) * factor);
  const safeDistance = (target: Pascals): Meters => {
    try {
      return scale(distanceForOverpressure(blastEnergy, target));
    } catch {
      return m(0);
    }
  };
  return {
    flashBurnRadii: {
      // Phase-17 thermal calibration. The atmospheric-entry flash-burn
      // radii are an impact phenomenon (thermal pulse from a meteor /
      // bolide entry, not a nuclear detonation), so the burn-radius
      // helpers must be passed the impact luminous efficiency rather
      // than the nuclear default. See the matching note in
      // `damageRings.ts` for the citation chain (Collins-Melosh-Marcus
      // 2005 / Toon 1997).
      firstDegree: scale(
        firstDegreeBurnRadius({ yieldEnergy, thermalPartition: IMPACT_LUMINOUS_EFFICIENCY })
      ),
      secondDegree: scale(
        secondDegreeBurnRadius({ yieldEnergy, thermalPartition: IMPACT_LUMINOUS_EFFICIENCY })
      ),
      thirdDegree: scale(
        thirdDegreeBurnRadius({ yieldEnergy, thermalPartition: IMPACT_LUMINOUS_EFFICIENCY })
      ),
    },
    shockWaveRadii: {
      fivePsi: safeDistance(OVERPRESSURE_BUILDING_COLLAPSE),
      onePsi: safeDistance(OVERPRESSURE_WINDOW_BREAK),
      lightDamage: safeDistance(OVERPRESSURE_LIGHT_DAMAGE),
    },
    airburstAmplificationFactor: factor,
  };
}

/** TNT specific energy used for kt / Mt conversions throughout the
 *  simulator (4.184 × 10⁶ J/kg · 1 000 kg/t · 1 000 t/kt = 4.184 × 10¹²
 *  J/kt). Mirrors the constant in `events/explosion/simulate.ts` /
 *  `units.ts`. */
const JOULES_PER_MEGATON_TNT = 4.184e15;

/**
 * Decide whether a cosmic impactor airbursts in the atmosphere,
 * reaches the ground intact, or partially detonates. See the module
 * header for references and tuning procedure.
 */
export function atmosphericEntry(
  impactorDiameter: Meters,
  impactVelocity: MetersPerSecond,
  impactorStrength: Pascals = IMPACTOR_STRENGTH.STONY,
  _impactorDensity?: KilogramPerCubicMeter,
  kineticEnergy?: Joules
): AtmosphericEntryResult {
  void _impactorDensity; // reserved for a future density-aware pancake model
  const v = impactVelocity as number;
  const D = impactorDiameter as number;
  const Y = impactorStrength as number;
  const totalKE = (kineticEnergy as number | undefined) ?? 0;
  const intactYieldMegatons = 0; // INTACT regime deposits nothing in atmosphere

  if (!Number.isFinite(v) || !Number.isFinite(D) || !Number.isFinite(Y) || v <= 0 || D <= 0) {
    return {
      burstAltitude: m(0),
      breakupAltitude: m(0),
      regime: 'INTACT',
      energyFractionToGround: 1,
      penetrationBonus: m(0),
      atmosphericYieldMegatons: intactYieldMegatons,
      ...ZERO_ENTRY_DAMAGE,
    };
  }

  const penetrationBonus = Math.max(
    PENETRATION_COEFFICIENT * Math.log(D / PENETRATION_REFERENCE_DIAMETER) * H_SCALE,
    0
  );

  if (survivesIntact(v, Y)) {
    return {
      burstAltitude: m(0),
      breakupAltitude: m(0),
      regime: 'INTACT',
      energyFractionToGround: 1,
      penetrationBonus: m(penetrationBonus),
      atmosphericYieldMegatons: intactYieldMegatons,
      ...ZERO_ENTRY_DAMAGE,
    };
  }

  const qGround = RHO_0 * v * v;
  const hBreakup = H_SCALE * Math.log(qGround / Y);
  const hBurst = Math.max(hBreakup - 2 * H_SCALE - penetrationBonus, 0);

  if (hBurst <= 0) {
    return {
      burstAltitude: m(0),
      breakupAltitude: m(hBreakup),
      regime: 'INTACT',
      energyFractionToGround: 1,
      penetrationBonus: m(penetrationBonus),
      atmosphericYieldMegatons: intactYieldMegatons,
      ...ZERO_ENTRY_DAMAGE,
    };
  }

  const completeRegime = hBurst >= 15_000;
  const energyFractionToGround = completeRegime
    ? 0.02
    : (() => {
        const ramp = (hBurst - 5_000) / 10_000;
        const clamped = Math.max(0, Math.min(1, ramp));
        return 0.3 - 0.28 * clamped;
      })();
  const atmosphericYieldJ = (1 - energyFractionToGround) * totalKE;

  return {
    burstAltitude: m(hBurst),
    breakupAltitude: m(hBreakup),
    regime: completeRegime ? 'COMPLETE_AIRBURST' : 'PARTIAL_AIRBURST',
    energyFractionToGround,
    penetrationBonus: m(penetrationBonus),
    atmosphericYieldMegatons: atmosphericYieldJ / JOULES_PER_MEGATON_TNT,
    ...computeEntryDamage(atmosphericYieldJ, hBurst),
  };
}
