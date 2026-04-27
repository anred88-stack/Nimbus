/**
 * Input range-validity guards — Phase 10 deliverable.
 *
 * Each physics formula in the simulator was calibrated against a
 * specific window of input parameters (Glasstone 1977 surface bursts
 * up to a few Mt; Mastin 2009 V_dot up to 10⁸ m³/s; Wells & Coppersmith
 * 1994 megathrust Mw up to 9.5; etc.). When a custom user input drifts
 * outside that window, the formula still returns *a number*, but the
 * confidence in that number drops sharply — extrapolation past the
 * calibration band is exactly where popular-science simulators
 * silently start producing nonsense.
 *
 * This module declares the calibration windows and a single
 * {@link validateInputs} function that returns a list of warnings
 * the UI can surface in the panel ("⚠ this input is outside the
 * formula's calibration band — interpret with caution").
 *
 * Bounds are sourced from the original calibration papers and
 * documented inline. Adding a new bound: cite the paper, give the
 * physical reason for the limit, write a one-line warning string.
 */

export interface ValidityWarning {
  /** The input parameter that triggered the warning. */
  parameter: string;
  /** The value the user passed. */
  value: number;
  /** The calibration window's lower bound (or undefined if none). */
  calibrationMin?: number;
  /** The calibration window's upper bound (or undefined if none). */
  calibrationMax?: number;
  /** One-line user-facing warning, structured for inline panel display. */
  message: string;
  /** Severity tag — drives the colour of the badge in the UI. */
  severity: 'info' | 'warning' | 'extrapolation';
}

/* -------------------------------------------------------------------- */
/* Impact                                                                */
/* -------------------------------------------------------------------- */

export interface ImpactValidityInput {
  impactorDiameterM: number;
  impactVelocityMs: number;
  impactorDensityKgM3: number;
  impactAngleRad: number;
  waterDepthM?: number;
}

export function validateImpactInputs(input: ImpactValidityInput): ValidityWarning[] {
  const out: ValidityWarning[] = [];

  // Collins 2005 Eq. 21 was fit to laboratory + hydrocode impacts in the
  // 10 m – 20 km diameter range. Below ~1 m the projectile is in the
  // strength-dominated regime (small craters scale differently);
  // above ~30 km we approach planet-sized impactors where curvature
  // and atmospheric mass loading break the local-flat-surface assumption.
  if (input.impactorDiameterM < 1) {
    out.push({
      parameter: 'impactorDiameter',
      value: input.impactorDiameterM,
      calibrationMin: 1,
      calibrationMax: 3e4,
      message:
        'Impactor diameter < 1 m: below Collins 2005 calibration range. Crater scaling extrapolates into the strength-dominated regime — interpret with caution.',
      severity: 'extrapolation',
    });
  } else if (input.impactorDiameterM > 30_000) {
    out.push({
      parameter: 'impactorDiameter',
      value: input.impactorDiameterM,
      calibrationMin: 1,
      calibrationMax: 3e4,
      message:
        'Impactor diameter > 30 km: above Collins 2005 calibration range. Local-surface assumptions begin to break down at planetary-scale impactors.',
      severity: 'extrapolation',
    });
  }

  // Hypervelocity regime starts at ~3 km/s; below that the cratering
  // is "subsonic" and Collins 2005 over-predicts. Above ~80 km/s
  // (cometary), shock compression of the projectile dominates and
  // the pi-group scaling breaks down.
  if (input.impactVelocityMs < 3_000) {
    out.push({
      parameter: 'impactVelocity',
      value: input.impactVelocityMs,
      calibrationMin: 3_000,
      calibrationMax: 80_000,
      message:
        'Velocity < 3 km/s: below the hypervelocity regime where Collins 2005 applies. The crater is sub-cratering and the formula over-predicts.',
      severity: 'extrapolation',
    });
  } else if (input.impactVelocityMs > 80_000) {
    out.push({
      parameter: 'impactVelocity',
      value: input.impactVelocityMs,
      calibrationMin: 3_000,
      calibrationMax: 80_000,
      message:
        'Velocity > 80 km/s: above typical solar-system-bound impactor band; shock-compression effects dominate and pi-group scaling extrapolates.',
      severity: 'extrapolation',
    });
  }

  // Strength-dominated angles (extreme grazing or near-vertical) push
  // outside the Pierazzo & Melosh asymmetry envelope.
  if (input.impactAngleRad < (5 * Math.PI) / 180) {
    out.push({
      parameter: 'impactAngle',
      value: (input.impactAngleRad * 180) / Math.PI,
      calibrationMin: 5,
      calibrationMax: 90,
      message:
        'Impact angle < 5°: extreme grazing — most impacts in this regime "skip" the atmosphere; Collins 2005 envelope of validity ends below 5°.',
      severity: 'warning',
    });
  }

  // Shallow ocean impacts (< 50 m water depth) are unstable for the
  // Ward & Asphaug cavity scaling — depth must exceed the impactor
  // diameter for the formula to apply.
  if (
    input.waterDepthM !== undefined &&
    input.waterDepthM > 0 &&
    input.waterDepthM < input.impactorDiameterM
  ) {
    out.push({
      parameter: 'waterDepth',
      value: input.waterDepthM,
      calibrationMin: input.impactorDiameterM,
      message:
        'Water depth less than impactor diameter: Ward & Asphaug 2000 cavity formula assumes deep water (h ≥ L). Tsunami source amplitude is unreliable.',
      severity: 'extrapolation',
    });
  }

  return out;
}

/* -------------------------------------------------------------------- */
/* Explosion                                                             */
/* -------------------------------------------------------------------- */

export interface ExplosionValidityInput {
  yieldMegatons: number;
  heightOfBurstM: number;
}

export function validateExplosionInputs(input: ExplosionValidityInput): ValidityWarning[] {
  const out: ValidityWarning[] = [];

  // Glasstone & Dolan 1977 + Kinney-Graham 1985 cover the 0.001 kt – 100 Mt
  // range. The Sublette FAQ extrapolates up to 200 Mt. Below 1 ton the
  // chemical-explosive regime dominates and Kinney-Graham was not
  // calibrated.
  if (input.yieldMegatons < 1e-6) {
    out.push({
      parameter: 'yieldMegatons',
      value: input.yieldMegatons,
      calibrationMin: 1e-6,
      calibrationMax: 200,
      message:
        'Yield < 1 ton TNT: below Kinney-Graham 1985 calibration. Conventional-chemistry effects dominate at this scale.',
      severity: 'extrapolation',
    });
  } else if (input.yieldMegatons > 200) {
    out.push({
      parameter: 'yieldMegatons',
      value: input.yieldMegatons,
      calibrationMin: 1e-6,
      calibrationMax: 200,
      message:
        'Yield > 200 Mt: above the Sublette FAQ envelope of historical / hypothetical devices; results extrapolate beyond instrumented data.',
      severity: 'extrapolation',
    });
  }

  // Stratospheric / exoatmospheric bursts (HOB > 50 km) drop into the
  // HEMP regime where surface blast / thermal effects approach zero
  // — but our piecewise hobBlastFactor still returns 0.25× at z≥1500
  // m·kt^(-1/3), which over-predicts for true exoatmospheric.
  if (input.heightOfBurstM > 50_000) {
    out.push({
      parameter: 'heightOfBurst',
      value: input.heightOfBurstM,
      calibrationMin: 0,
      calibrationMax: 50_000,
      message:
        'HOB > 50 km: exoatmospheric / HEMP regime. Ground blast and thermal radii lose physical meaning; EMP becomes the dominant hazard.',
      severity: 'extrapolation',
    });
  }
  return out;
}

/* -------------------------------------------------------------------- */
/* Earthquake                                                            */
/* -------------------------------------------------------------------- */

export interface EarthquakeValidityInput {
  magnitude: number;
  depthM: number;
}

export function validateEarthquakeInputs(input: EarthquakeValidityInput): ValidityWarning[] {
  const out: ValidityWarning[] = [];

  // Hanks & Kanamori 1979 Mw scale is monotone but the Wells & Coppersmith
  // 1994 area-magnitude calibration is based on observed Mw 4.5–9.5
  // earthquakes. Below 4 the crustal-rupture geometry breaks down;
  // above 9.5 we exceed the largest-ever observed earthquake (Valdivia 1960).
  if (input.magnitude < 4) {
    out.push({
      parameter: 'magnitude',
      value: input.magnitude,
      calibrationMin: 4,
      calibrationMax: 9.5,
      message:
        'Mw < 4: below the Wells & Coppersmith 1994 rupture-area calibration. Microseismic events have no useful damage radii.',
      severity: 'extrapolation',
    });
  } else if (input.magnitude > 9.5) {
    out.push({
      parameter: 'magnitude',
      value: input.magnitude,
      calibrationMin: 4,
      calibrationMax: 9.5,
      message:
        'Mw > 9.5: above Valdivia 1960, the largest instrumentally recorded earthquake. Results are pure extrapolation.',
      severity: 'extrapolation',
    });
  }

  // Boore 2014 NGA-West2 attenuation was fit for hypocentre depths
  // 0–35 km (crustal), with a separate extension for subduction
  // interface up to 100 km. Beyond that we are in deep-focus territory
  // where path effects dominate.
  if (input.depthM > 1e5) {
    out.push({
      parameter: 'depth',
      value: input.depthM,
      calibrationMin: 0,
      calibrationMax: 1e5,
      message:
        'Hypocentre depth > 100 km: beyond Boore 2014 NGA-West2 calibration. Deep-focus events have systematically different ground-motion patterns.',
      severity: 'extrapolation',
    });
  }
  return out;
}

/* -------------------------------------------------------------------- */
/* Volcano                                                               */
/* -------------------------------------------------------------------- */

export interface VolcanoValidityInput {
  volumeEruptionRateM3s: number;
  totalEjectaVolumeM3: number;
}

export function validateVolcanoInputs(input: VolcanoValidityInput): ValidityWarning[] {
  const out: ValidityWarning[] = [];

  // Mastin 2009 plume-height fit was calibrated against eruptions
  // with V̇ between ~10 m³/s (small Strombolian) and ~10⁸ m³/s
  // (caldera-forming Plinian). Below 1 m³/s the column collapses
  // into a fountain rather than a buoyant plume.
  if (input.volumeEruptionRateM3s < 1) {
    out.push({
      parameter: 'volumeEruptionRate',
      value: input.volumeEruptionRateM3s,
      calibrationMin: 1,
      calibrationMax: 1e8,
      message:
        'V̇ < 1 m³/s: below the buoyant-plume regime. Mastin 2009 fit applies to ascending columns, not lava fountains.',
      severity: 'extrapolation',
    });
  } else if (input.volumeEruptionRateM3s > 1e8) {
    out.push({
      parameter: 'volumeEruptionRate',
      value: input.volumeEruptionRateM3s,
      calibrationMin: 1,
      calibrationMax: 1e8,
      message:
        'V̇ > 10⁸ m³/s: above the largest observed Plinian eruptions; extrapolates past the Mastin 2009 dataset.',
      severity: 'extrapolation',
    });
  }

  // Total ejecta volume: VEI scale tops out at 8 (~10¹² m³ Toba-class).
  if (input.totalEjectaVolumeM3 > 1e13) {
    out.push({
      parameter: 'totalEjectaVolume',
      value: input.totalEjectaVolumeM3,
      calibrationMin: 0,
      calibrationMax: 1e13,
      message:
        'V > 10¹³ m³: larger than any Quaternary supereruption; ashfall and PDC scalings extrapolate beyond the calibration band.',
      severity: 'extrapolation',
    });
  }
  return out;
}

/* -------------------------------------------------------------------- */
/* Landslide                                                             */
/* -------------------------------------------------------------------- */

export interface LandslideValidityInput {
  volumeM3: number;
  slopeAngleDeg: number;
  meanOceanDepthM: number;
}

export function validateLandslideInputs(input: LandslideValidityInput): ValidityWarning[] {
  const out: ValidityWarning[] = [];
  if (input.volumeM3 > 1e13) {
    out.push({
      parameter: 'volumeM3',
      value: input.volumeM3,
      calibrationMin: 0,
      calibrationMax: 1e13,
      message:
        'Slide volume > 10¹³ m³: above Storegga (≈ 3 × 10¹² m³), the largest documented submarine slide. Watts 2000 saturation cap extrapolates here.',
      severity: 'extrapolation',
    });
  }
  if (input.slopeAngleDeg < 1 || input.slopeAngleDeg > 80) {
    out.push({
      parameter: 'slopeAngleDeg',
      value: input.slopeAngleDeg,
      calibrationMin: 1,
      calibrationMax: 80,
      message:
        'Slope outside 1°–80°: very gentle slopes give vanishing tsunami amplitude; near-vertical slopes are not Watts 2000 geometry.',
      severity: 'warning',
    });
  }
  if (input.meanOceanDepthM > 0 && input.meanOceanDepthM < 10) {
    out.push({
      parameter: 'meanOceanDepth',
      value: input.meanOceanDepthM,
      message:
        'Mean ocean depth < 10 m: shallow-water saturation cap binds and amplitude is mostly noise.',
      severity: 'warning',
    });
  }
  return out;
}
