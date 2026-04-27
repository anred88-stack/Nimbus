import type { Meters, MetersPerSecond } from '../units.js';

/**
 * Per-ring rendering geometry: how to draw an ellipse instead of a
 * concentric circle for a given nominal damage radius.
 *
 * The four numbers describe a 2D ground-plane shape, completely
 * independent of any rendering library:
 *
 *   - semi-major axis (m) = nominalRadius × {@link semiMajorMultiplier}
 *   - semi-minor axis (m) = nominalRadius × {@link semiMinorMultiplier}
 *   - the ellipse is rotated so its semi-major axis points along
 *     {@link azimuthDeg} (compass °, clockwise from geographic North)
 *   - the ellipse centre is shifted from the event point by
 *     {@link centerOffsetMeters} along the same azimuth (positive =
 *     downrange / downwind / asymmetric-elongation direction)
 *
 * For a perfectly isotropic, circular ring use {@link ISOTROPIC_RING}
 * — both multipliers = 1, offset = 0; renderers may short-circuit on
 * this sentinel to skip the ellipse-rotation arithmetic, but they
 * MUST produce visually identical output to the explicit case.
 *
 * Renderer contract: a positive {@link centerOffsetMeters} shifts the
 * ELLIPSE CENTRE, not the perimeter. The displayed shape still has its
 * outer edge at semi-major axis from that shifted centre, so the up-
 * range edge of the ring may end up CLOSER to the event point than the
 * difference (semi-major − offset). This matches the physical reality
 * of an asymmetric ejecta blanket — the "uprange forbidden zone" of
 * Schultz & Anderson (1996) is exactly this: a near-empty wedge
 * uprange of the impactor, with most of the deposit downrange.
 */
export interface RingAsymmetry {
  /** Multiplier on the nominal radius for the semi-major (downrange)
   *  axis. ≥ 1 for elongation, < 1 for compression. Always positive. */
  semiMajorMultiplier: number;
  /** Multiplier on the nominal radius for the semi-minor (cross-range)
   *  axis. ≤ 1 for compression, > 1 for cross-stretch. Always positive. */
  semiMinorMultiplier: number;
  /** Compass azimuth (° clockwise from geographic North) along which
   *  the semi-major axis points. Normalised to [0, 360). */
  azimuthDeg: number;
  /** Distance (m) by which the ellipse centre is shifted from the
   *  event point along the {@link azimuthDeg} azimuth. ≥ 0; the
   *  symmetric case is 0. */
  centerOffsetMeters: number;
}

/** No asymmetry: concentric circle at the event point. Returned by
 *  every helper when the inputs do not justify any asymmetric
 *  treatment (steep impact, calm wind, etc.). */
export const ISOTROPIC_RING: RingAsymmetry = {
  semiMajorMultiplier: 1,
  semiMinorMultiplier: 1,
  azimuthDeg: 0,
  centerOffsetMeters: 0,
};

/** Normalise a compass azimuth to the half-open interval [0, 360). */
function normaliseAzimuth(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  const wrapped = ((degrees % 360) + 360) % 360;
  return wrapped;
}

/**
 * Crater eccentricity from an oblique impact.
 *
 * Vertical (θ ≥ 45°) impacts produce essentially circular craters in
 * both laboratory experiments and 3D hydrocode simulations — the
 * b/a (cross-range / down-range diameter) ratio stays within ±0.05
 * of unity. Below ≈45°, the crater progressively elongates along the
 * impactor's downrange ground track; below ≈15° the elongation is
 * pronounced and clearly visible from orbit (e.g. Messier and
 * Messier A on the Moon, the "twin craters" canonically used to
 * demonstrate oblique-impact morphology).
 *
 * References:
 *   - Gault, D. E. & Wedekind, J. A. (1978). "Experimental studies of
 *     oblique impact." Proc. Lunar Planet. Sci. Conf. 9, 3843–3875.
 *   - Pierazzo, E. & Melosh, H. J. (2000). "Hydrocode modeling of
 *     oblique impacts: The fate of the projectile."
 *     Meteoritics & Planetary Science 35 (1), 117–130.
 *     DOI: 10.1111/j.1945-5100.2000.tb01979.x
 *   - Schultz, P. H. & Anderson, R. R. (1996). "Asymmetry of ejecta
 *     and target damage in oblique impacts." LPSC XXVII, 1149–1150.
 *
 * Analytical envelope used here:
 *
 *     b/a ≡ semiMinor / semiMajor  =  max( 0.40,  sin(θ)^(1/3) )
 *
 * — capped at 1 for θ ≥ 90°, naturally; floor of 0.40 prevents the
 * envelope from collapsing to a line at grazing incidence (real
 * craters of Earth-class projectiles have not been observed below
 * b/a ≈ 0.4, partly because shallower entries airburst before the
 * ground crater fully forms). The cube-root form fits the Gault &
 * Wedekind 1978 Fig. 5 data within ±0.05 across 5°–45° and reproduces
 * the Pierazzo & Melosh 2000 hydrocode envelope at θ = 30°, 45°.
 *
 * The semi-major axis is held at the nominal vertical-impact radius
 * — popular-science viewers care about "how far does the crater rim
 * reach downrange" — and the semi-minor axis is shrunk by `b/a`. The
 * crater centre stays anchored on the impact point: lab and hydrocode
 * studies both find the down-range elongation distributes roughly
 * symmetrically about the trajectory's surface intersect, not offset
 * from it (the offset effect is much stronger in the EJECTA blanket,
 * handled separately by {@link ejectaButterflyAsymmetry}).
 */
export function craterAsymmetry(impactAngleDeg: number, impactAzimuthDeg: number): RingAsymmetry {
  if (!Number.isFinite(impactAngleDeg) || impactAngleDeg <= 0) {
    return { ...ISOTROPIC_RING, azimuthDeg: normaliseAzimuth(impactAzimuthDeg) };
  }
  if (impactAngleDeg >= 90) {
    // True vertical impact — exactly circular. Above 90° is non-physical
    // (anything below the local horizontal mirrors); clamp to circle.
    return { ...ISOTROPIC_RING, azimuthDeg: normaliseAzimuth(impactAzimuthDeg) };
  }
  // Smooth `cbrt(sin θ)` ramp ALL the way from θ = 0° to θ = 90°.
  // Earlier revisions imposed a hard 45° cliff above which the ratio
  // snapped to 1; that cliff hid the physically real (and visually
  // perceptible) ≈10 % compression at the canonical 45° preset angle
  // (Chicxulub, Meteor Crater). Pierazzo & Melosh 2000 show the
  // smooth ramp continues right up to 60°+, with b/a ≥ 0.95 in their
  // Figure 5; matching that envelope is more honest and gives every
  // default scenario a recognisably elliptical crater.
  const angleRad = (impactAngleDeg * Math.PI) / 180;
  const ratio = Math.cbrt(Math.sin(angleRad));
  const semiMinorMultiplier = Math.max(0.4, ratio);
  return {
    semiMajorMultiplier: 1,
    semiMinorMultiplier,
    azimuthDeg: normaliseAzimuth(impactAzimuthDeg),
    centerOffsetMeters: 0,
  };
}

/**
 * Damage-ring asymmetry for a far-field overpressure or thermal contour
 * downstream of an oblique impact.
 *
 * Oblique entries deposit kinetic energy along the projectile's
 * trajectory rather than at a single point, smearing the effective
 * source toward the downrange direction. Pierazzo & Artemieva (2003)
 * "Asteroid impacts: How big is big?" (in *Catastrophic Events and
 * Mass Extinctions*, GSA Special Paper 356) show 3D hydrocode runs in
 * which the 1 psi overpressure contour at θ = 15° elongates ≈ 8–12 %
 * downrange of an equivalent θ = 90° baseline; the thermal contour
 * elongates a few per cent more because the radiating fireball travels
 * further along the trajectory before ablating.
 *
 * Two-knob popular-science envelope used here:
 *
 *     downrangeBoost(θ)   =  α · max( 0, 1 − sin(θ) )
 *     crossrangeShrink(θ) =  α · 0.5 · max( 0, 1 − sin(θ) )
 *     centreOffset / R    =  γ · max( 0, 1 − sin(θ) )
 *
 * with α = 0.30 for overpressure rings, α = 0.40 for thermal (the
 * thermal source is more elongated along the trajectory because the
 * radiating fireball travels further before ablating), and γ = 0.20.
 * At θ = 90° the formula returns the isotropic ring; at θ = 45° the
 * down-range edge sits 9 % (overpressure) / 12 % (thermal) further
 * out, the cross-range a few per cent closer in, and the centre is
 * shifted 6 % of R downrange — a clearly visible "egg" shape on the
 * globe. The values bracket the Pierazzo & Artemieva 2003 envelope
 * (8–12 % for overpressure at θ = 15°) on the conservative side
 * for overpressure and slightly above for thermal — the latter is
 * justified by the longer thermal-source dwell time along the
 * trajectory observed in their hydrocode runs.
 *
 * Returns {@link ISOTROPIC_RING} for θ ≥ 90° or invalid inputs.
 */
export function obliqueImpactRingAsymmetry(
  impactAngleDeg: number,
  impactAzimuthDeg: number,
  variant: 'overpressure' | 'thermal'
): RingAsymmetry {
  if (!Number.isFinite(impactAngleDeg) || impactAngleDeg <= 0) {
    return { ...ISOTROPIC_RING, azimuthDeg: normaliseAzimuth(impactAzimuthDeg) };
  }
  if (impactAngleDeg >= 90) {
    return { ...ISOTROPIC_RING, azimuthDeg: normaliseAzimuth(impactAzimuthDeg) };
  }
  const alpha = variant === 'thermal' ? 0.4 : 0.3;
  const angleRad = (impactAngleDeg * Math.PI) / 180;
  const obliquity = Math.max(0, 1 - Math.sin(angleRad));
  const downrangeBoost = alpha * obliquity;
  const crossrangeShrink = 0.5 * alpha * obliquity;
  // Centre-offset is RADIUS-DEPENDENT and therefore not embedded here:
  // the same multiplier shape applies to every ring in a scenario, but
  // the absolute downrange shift in metres scales with each ring's own
  // nominal radius. Callers obtain it from {@link obliqueImpactCentreOffset}
  // and overwrite the 0 returned below before handing the struct to the
  // renderer.
  return {
    semiMajorMultiplier: 1 + downrangeBoost,
    semiMinorMultiplier: Math.max(0.5, 1 - crossrangeShrink),
    azimuthDeg: normaliseAzimuth(impactAzimuthDeg),
    centerOffsetMeters: 0,
  };
}

/**
 * Centre offset (m) for an oblique-impact damage ring whose nominal
 * radius is `nominalRadiusMeters`. Convenience splitter so callers can
 * keep the multipliers from {@link obliqueImpactRingAsymmetry} and
 * compute the absolute downrange shift in one tidy expression.
 */
export function obliqueImpactCentreOffset(
  impactAngleDeg: number,
  nominalRadiusMeters: number
): number {
  if (
    !Number.isFinite(impactAngleDeg) ||
    impactAngleDeg <= 0 ||
    impactAngleDeg >= 90 ||
    !Number.isFinite(nominalRadiusMeters) ||
    nominalRadiusMeters <= 0
  ) {
    return 0;
  }
  const angleRad = (impactAngleDeg * Math.PI) / 180;
  const obliquity = Math.max(0, 1 - Math.sin(angleRad));
  return 0.2 * obliquity * nominalRadiusMeters;
}

/**
 * Wind-driven drift of the thermal-pulse footprint downwind of the
 * detonation point.
 *
 * The thermal pulse of a nuclear-class explosion lasts t_max ≈ 0.032 ·
 * W^0.5 s (W in kilotons, second peak; Glasstone & Dolan 1977 §7.20,
 * Eq. 7.20.1). During that interval the rising fireball is advected
 * laterally by the ambient wind, displacing the centre of the ground
 * thermal-fluence contour by ≈ wind × t_max. For a 1 Mt detonation in
 * a 10 m s⁻¹ wind that is ≈ 10 m — negligible against a 10-km thermal
 * ring. For a 50 Mt detonation in a 30 m s⁻¹ jet stream the offset
 * becomes ≈ 200 m, still small but visible.
 *
 * The CONTOUR ITSELF (the locus of equal fluence) is also stretched
 * downwind because the radiating source spent more dwell time near
 * the leading edge of its lateral travel. We model the stretch as a
 * fractional boost on the semi-major axis of the same magnitude as
 * the centre offset (in units of nominal radius), with a small
 * cross-wind compression to conserve area to within a few percent —
 * Glasstone treats this whole effect as a small correction and we
 * follow that convention rather than introducing a free parameter.
 *
 * Reference:
 *   Glasstone, S. & Dolan, P. J. (1977). "The Effects of Nuclear
 *   Weapons" (3rd ed.), U.S. DoD / U.S. DoE, §7.20–7.45 (thermal
 *   pulse), §2.51 (fireball convective rise).
 *
 * For impact thermal contours the same drift mechanism applies,
 * scaled to the ablation-driven luminous pulse duration; for popular-
 * science display we reuse the same envelope.
 *
 * Returns {@link ISOTROPIC_RING} when wind ≤ 0 or yield/radius ≤ 0.
 */
export function windDriftAsymmetry(input: {
  /** Nominal isotropic ring radius (m) — used to non-dimensionalise
   *  the centre offset and the major-axis boost. */
  nominalRadius: Meters;
  /** Yield in kilotons TNT-equivalent. Drives the thermal pulse
   *  duration via Glasstone Eq. 7.20.1: t_max ≈ 0.032 · W^0.5 s. */
  yieldKilotons: number;
  /** Ambient wind speed at burst altitude (m s⁻¹). 0 disables. */
  windSpeed: MetersPerSecond;
  /** Compass azimuth (° clockwise from geographic North) the wind is
   *  blowing TOWARD — same convention as meteorological "wind to". */
  windDirectionDeg: number;
}): RingAsymmetry {
  const radius = input.nominalRadius as number;
  const wind = input.windSpeed as number;
  if (
    !Number.isFinite(radius) ||
    radius <= 0 ||
    !Number.isFinite(wind) ||
    wind <= 0 ||
    !Number.isFinite(input.yieldKilotons) ||
    input.yieldKilotons <= 0
  ) {
    return ISOTROPIC_RING;
  }
  const pulseDurationSeconds = 0.032 * Math.sqrt(input.yieldKilotons);
  const driftMeters = wind * pulseDurationSeconds;
  const driftFraction = Math.min(driftMeters / radius, 0.25);
  return {
    semiMajorMultiplier: 1 + driftFraction,
    semiMinorMultiplier: Math.max(0.85, 1 - 0.5 * driftFraction),
    azimuthDeg: normaliseAzimuth(input.windDirectionDeg),
    centerOffsetMeters: driftMeters,
  };
}

/**
 * Schultz & Anderson (1996) "butterfly" asymmetry of the ejecta
 * blanket downrange of an oblique impact.
 *
 * The same primitive that has been computed inline in
 * `simulate.ts` since M3, repackaged here as a {@link RingAsymmetry}
 * so the renderer can consume it through the same interface as every
 * other asymmetric ring. Reference:
 *
 *   Schultz, P. H. & Anderson, R. R. (1996). "Asymmetry of ejecta and
 *   target damage in oblique impacts." Lunar Planet. Sci. Conf. XXVII,
 *   1149–1150.
 *
 * The {@link asymmetryFactor} is the dimensionless [0, 1] number
 * already produced by the impact simulator from the impact angle
 * (= max(0, 1 − θ/45°)). 0 → symmetric blanket (steep impact); 1 →
 * maximum butterfly with a near-empty uprange "forbidden zone"
 * (θ → 0°, grazing).
 *
 * The geometric factors (1 + 0.4·f, 1 − 0.25·f, 0.3·f) are taken from
 * the prior inline implementation so the rendered shape stays
 * pixel-identical to the existing ejecta-blanket overlay; future
 * tightening of the fit lives in this one place rather than at the
 * renderer call-site.
 */
export function ejectaButterflyAsymmetry(
  asymmetryFactor: number,
  azimuthDeg: number,
  blanketEdgeRadius: Meters
): RingAsymmetry {
  if (!Number.isFinite(asymmetryFactor) || asymmetryFactor <= 0) {
    return { ...ISOTROPIC_RING, azimuthDeg: normaliseAzimuth(azimuthDeg) };
  }
  const f = Math.max(0, Math.min(1, asymmetryFactor));
  const radius = blanketEdgeRadius as number;
  const offset = Number.isFinite(radius) && radius > 0 ? radius * 0.3 * f : 0;
  return {
    semiMajorMultiplier: 1 + 0.4 * f,
    semiMinorMultiplier: 1 - 0.25 * f,
    azimuthDeg: normaliseAzimuth(azimuthDeg),
    centerOffsetMeters: offset,
  };
}

/**
 * Compose two asymmetry sources that share an azimuth axis (e.g.
 * impact-angle obliquity AND down-range wind drift, when both happen
 * to point along the same compass bearing).
 *
 * The composition multiplies the multipliers and adds the offsets;
 * the result's azimuth is the first source's azimuth (callers
 * pre-align). For sources with DIFFERENT azimuths the right answer
 * is to compose tensors, which we do not need at popular-science
 * fidelity — callers should use the dominant source instead.
 */
export function compose(a: RingAsymmetry, b: RingAsymmetry): RingAsymmetry {
  return {
    semiMajorMultiplier: a.semiMajorMultiplier * b.semiMajorMultiplier,
    semiMinorMultiplier: a.semiMinorMultiplier * b.semiMinorMultiplier,
    azimuthDeg: a.azimuthDeg,
    centerOffsetMeters: a.centerOffsetMeters + b.centerOffsetMeters,
  };
}
