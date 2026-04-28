import type { Entity } from 'cesium';
import { clampToGreatCircle } from '../physics/earthScale.js';

/**
 * Imperative ring-expansion animation driven by requestAnimationFrame.
 * Ramps a Cesium entity's `ellipse.semiMajorAxis` / `semiMinorAxis`
 * from 0 to the final radius over a physically-calibrated duration.
 *
 * We deliberately do NOT use `CallbackProperty` + two reads, because
 * Cesium's EllipseGeometry invariant check requires
 * `semiMajorAxis >= semiMinorAxis` at construction time. Independent
 * reads through a CallbackProperty can produce different values
 * between the two axes (floating-point timing drift), which throws.
 * Setting both props to the same plain `number` in one tick is
 * atomic and invariant-safe.
 *
 * Timing rationale (per overlay family):
 *   - Crater / ejecta boundary: instant — already excavated at t=0
 *     in reality; we give it a 300 ms "reveal" so it's not a
 *     flash-frame.
 *   - Thermal pulse / firestorm / flash: photons travel at c → the
 *     receiver sees them essentially at t=0. Use 500 ms for a nice
 *     "bloom" rather than snap-in.
 *   - Overpressure rings: shock wave at c_air ≈ 343 m/s in
 *     homogeneous air → real time = r / 343. Capped at ANIMATION_MAX
 *     (~4 s) so Chicxulub's 1 000 km 1-psi ring doesn't freeze the
 *     viewer for 50 minutes.
 *   - MMI felt-intensity rings: crustal P-wave ≈ 6 km/s → r / 6000.
 */

/** Floor on every ring's growth time. Earlier revisions used 250 ms,
 *  which let small-radius rings (e.g. the crater rim of a kt-class
 *  scenario) grow in a single frame — visually a flash-pop, not a
 *  "shock front travelling outward". 1 500 ms gives the eye enough
 *  time to track the wavefront from r=0 to its final radius and is
 *  what reads as "wave" rather than "instant snap". */
const ANIMATION_MIN_MS = 1_500;
const ANIMATION_MAX_MS = 6_000;
const SPEED_OF_SOUND_MS = 343;
const CRUSTAL_P_WAVE_MS = 6_000;
/** Reveal time used when the user has `prefers-reduced-motion`
 *  enabled. Earlier revisions returned 0 (collapsed cascade) and then
 *  300 ms (still flash-pop). 1 500 ms is the same floor as normal-
 *  motion mode — radius growth is NOT a vestibular-motion category
 *  per WCAG 2.3.3 (animation from interactions); only the camera
 *  fly-to is, and that one we still skip under reduced-motion. */
const REDUCED_MOTION_DURATION_MS = 1_500;

export type RingKind =
  | 'crater'
  | 'thermal'
  | 'firestorm'
  | 'overpressure'
  | 'mmi'
  | 'tsunamiCavity'
  | 'ashfall';

/**
 * Compute the animation duration (ms) for a given ring kind and
 * final radius. Honours `prefers-reduced-motion` by returning 0.
 */
export function animationDurationMs(kind: RingKind, finalRadiusMeters: number): number {
  if (!Number.isFinite(finalRadiusMeters) || finalRadiusMeters <= 0) return 0;
  if (prefersReducedMotion()) return REDUCED_MOTION_DURATION_MS;
  switch (kind) {
    case 'crater':
      // Excavation is "instant" in reality, but a 300 ms reveal reads
      // as flash-pop on screen — so we still grow the rim across a
      // visible window, just shorter than the propagating fronts.
      return 1_500;
    case 'thermal':
    case 'firestorm':
    case 'ashfall':
      // Thermal radiation, firestorm ignition and ashfall onset are
      // all near-instantaneous physically (light-speed → seconds);
      // 2 200 ms is the cinematic compression that lets the eye see
      // the contour expand as a single wave.
      return 2_200;
    case 'mmi': {
      const physical = (finalRadiusMeters / CRUSTAL_P_WAVE_MS) * 1_000;
      return Math.min(Math.max(physical, ANIMATION_MIN_MS), ANIMATION_MAX_MS);
    }
    case 'overpressure':
    case 'tsunamiCavity': {
      const physical = (finalRadiusMeters / SPEED_OF_SOUND_MS) * 1_000;
      return Math.min(Math.max(physical, ANIMATION_MIN_MS), ANIMATION_MAX_MS);
    }
  }
}

/** Cap on the compressed render-time delay before a ring starts
 *  expanding (ms). Bumped from 1 500 ms so the cascade plays out
 *  long enough for the eye to register every wave-front arriving in
 *  sequence — the previous cap was tight enough that the user often
 *  perceived the staggered reveal as a single instantaneous pop. */
const STAGGER_CAP_MS = 2_500;
/** Multiplier on `log10(1 + onsetSeconds)` when compressing physical
 *  onset times into render time. Tuned so a 5 km shock front (~14.6 s
 *  physical onset) starts ≈ 580 ms after t=0, and a 1 000 km MMI
 *  contour (~167 s physical) saturates near the cap. */
const STAGGER_SCALE = 500;
/** Reduced-motion stagger cap. Bumped 250 → 800 ms so the cascade
 *  still reads as a cascade under reduced-motion: with the new
 *  1 500 ms reveal floor, an earlier 250 ms stagger left the user
 *  perceiving every ring "popping at once" because the gap between
 *  successive starts was much smaller than each individual ring's
 *  growth window. 800 ms gives a clear "thermal first, blast second,
 *  seismic third" reading without crossing into the WCAG vestibular
 *  motion category. */
const REDUCED_MOTION_STAGGER_CAP_MS = 800;

/**
 * Render-time delay before a given ring begins expanding from r=0.
 * Encodes the physical onset of the propagating front at the ring's
 * outer radius (light-speed → 0; sound front → r/343 m·s⁻¹; P-wave →
 * r/6000 m·s⁻¹; surface phenomena that are present at t=0 → 0). The
 * resulting onset (in seconds) is then log-compressed to a 0–1500 ms
 * window so the cascade reads cinematically without freezing the
 * viewer for the literal half-hour a Chicxulub 1 psi front would take.
 *
 * Pedagogical intent: the user *sees* the thermal flash arrive first,
 * the shock front detach and roll out behind it, and the seismic
 * tremor catch up — i.e. the same sequence Chelyabinsk witnesses
 * reported. Honours `prefers-reduced-motion` by returning 0.
 */
export function startDelayMs(kind: RingKind, finalRadiusMeters: number): number {
  if (!Number.isFinite(finalRadiusMeters) || finalRadiusMeters <= 0) return 0;
  let onsetSeconds = 0;
  switch (kind) {
    case 'crater':
    case 'thermal':
    case 'firestorm':
    case 'tsunamiCavity':
    case 'ashfall':
      onsetSeconds = 0;
      break;
    case 'overpressure':
      onsetSeconds = finalRadiusMeters / SPEED_OF_SOUND_MS;
      break;
    case 'mmi':
      onsetSeconds = finalRadiusMeters / CRUSTAL_P_WAVE_MS;
      break;
  }
  const compressed = Math.log10(1 + onsetSeconds) * STAGGER_SCALE;
  const cap = prefersReducedMotion() ? REDUCED_MOTION_STAGGER_CAP_MS : STAGGER_CAP_MS;
  return Math.min(compressed, cap);
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** easeOutCubic — slows as the wavefront expands (matches how
 *  human perception of an expanding disc reads on screen). */
function easeOutCubic(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 1 - (1 - clamped) ** 3;
}

/**
 * Write the supplied semi-major / semi-minor axes to the entity's
 * ellipse in one synchronous pass. Cesium's `EllipseGeometry`
 * invariant requires `semiMajorAxis ≥ semiMinorAxis` at construction
 * time; we therefore swap the inputs here when needed (the renderer
 * chooses orientation via `ellipse.rotation`, so swapping changes the
 * sign of the rotation but not the on-screen shape — and the rotation
 * has already been baked into the entity at creation).
 *
 * Uses `as unknown as never` to thread the plain-number value into
 * the Cesium `EllipseGraphics` slots whose published type expects
 * `Property | undefined` — Cesium's runtime accepts numbers fine
 * (they get wrapped internally). This is the pragmatic escape hatch
 * documented in the module header.
 */
/** Floor for ellipse semi-axes, in metres. Cesium's ground-geometry
 *  pipeline (`StaticGroundGeometryPerMaterialBatch`, used whenever an
 *  ellipse carries `heightReference: CLAMP_TO_GROUND` since Phase 14)
 *  calls `pointOnEllipsoid → Cartesian3.normalize` on the ellipse axes
 *  while it builds the GroundPrimitive. With a true 0, the normalize
 *  receives a zero-length vector and throws `DeveloperError: normalized
 *  result is not a number`, which halts the render loop globally —
 *  every subsequent Launch then appears frozen. 1 mm is sub-pixel at
 *  any practical zoom (the smallest meaningful damage radius is 4–5
 *  orders of magnitude larger), so the clamp is visually invisible
 *  while keeping every ground-geometry build numerically valid. */
export const RING_INITIAL_RADIUS_M = 0.001;

function writeEllipseAxes(entity: Entity, semiMajor: number, semiMinor: number): void {
  const ellipse = entity.ellipse;
  if (!ellipse) return;
  const a = Math.max(Math.max(semiMajor, semiMinor), RING_INITIAL_RADIUS_M);
  const b = Math.max(Math.min(semiMajor, semiMinor), RING_INITIAL_RADIUS_M);
  (ellipse as unknown as { semiMajorAxis: number; semiMinorAxis: number }).semiMajorAxis = a;
  (ellipse as unknown as { semiMajorAxis: number; semiMinorAxis: number }).semiMinorAxis = b;
}

export interface RingAnimationSpec {
  /** The Cesium entity whose ellipse axes we want to ramp. */
  entity: Entity;
  /** The ring's fully-expanded semi-major axis (m). For a circular
   *  ring this is the nominal damage radius; for an asymmetric ring
   *  it is the nominal radius scaled by the asymmetry's
   *  `semiMajorMultiplier`. */
  finalSemiMajor: number;
  /** The ring's fully-expanded semi-minor axis (m). Defaults to
   *  {@link finalSemiMajor} for backward-compatible concentric
   *  circles; pass a smaller value for an elliptical ring. */
  finalSemiMinor?: number;
  /** The ring kind — drives the duration choice. The duration uses
   *  the semi-major axis as the propagation distance, which is
   *  exactly the nominal radius for any isotropic ring and a slight
   *  over-estimate for an elongated ring (the front DOES reach the
   *  longer axis last in the cinematic compression we use). */
  kind: RingKind;
}

/**
 * Schedule a batch of ring-expansion animations that share a single
 * rAF loop and a single t=0 so the cascade reads as one event.
 * Returns a cancel function the caller can invoke when the entities
 * are torn down (e.g. on next `evaluate`).
 *
 * Each tick writes the current radius atomically to both axes of the
 * target entity's ellipse — so Cesium never sees a frame where
 * `semiMajor < semiMinor`.
 */
/**
 * Cascade timing — sound-speed-based, not equal slices.
 *
 * Earlier revisions partitioned the cascade window into `N` equal
 * slices, one per ring sorted by radius. That gave a small-radius
 * jump (e.g. ld50 → 1 psi where the radii differ by 0.3 km) the
 * same on-screen time as a 5 km jump, which read as an instant
 * snap separated from the rest of the cascade by an unmotivated
 * pause. The user reported "tutti gli anelli compaiono insieme"
 * across multiple iterations.
 *
 * The fix adopts the user's own suggestion: anchor every ring's
 * delay to the physical sound-speed travel time, scaled into a
 * cinematic window. Concretely:
 *
 *     delayMs   = (ring.radius / 343 m·s⁻¹) · 1 000 · ANIMATION_SCALE
 *     growthMs  = max( MIN_GROWTH_MS,
 *                      ((ring.radius − prev.radius) / 343)
 *                        · 1 000 · ANIMATION_SCALE )
 *
 * with `ANIMATION_SCALE = 0.1` (so 1 s of visual time = 10 s of
 * physical shock-front travel). For a 1 Mt scenario this places
 * crater @ 70 ms, 5 psi @ 1.1 s, 1 psi @ 3.3 s, light-damage
 * @ 7.3 s — natural spacing in radius-order with no manufactured
 * pauses. Every ring's growth is also at-least-MIN_GROWTH_MS
 * so the smallest jumps still read as a visible expansion.
 *
 * The cascade-timeline panel still surfaces the literal physical
 * onset times for users who want them; this scale is purely a
 * display-layer compression for the on-globe wavefront.
 */
const VISUAL_ANIMATION_SCALE = 0.1;
const VISUAL_SHOCK_SPEED_MS = 343 * (1 / VISUAL_ANIMATION_SCALE); // 3 430 m/s effective
const MIN_GROWTH_MS = 600;
const REDUCED_MOTION_SCALE_FACTOR = 0.4; // reduced-motion replays 2.5× faster

/**
 * Upper bound on the total cascade window (ms). At the canonical
 * 3 430 m/s visual shock speed a 50 km outer ring (Tsar-Bomba-class
 * 1 psi) ends ≈ 14.6 s past t=0 — long after the 7 s mushroom-cloud
 * VFX has faded. For Chicxulub-class light-damage radii (hundreds
 * of km) the schedule overflows tens of seconds and the user sees
 * the outer rings appear with no visible link to the burst.
 *
 * Capping the schedule at 5 s — matched to the wavefront indicator's
 * `cascadeDurationMs` in Globe.tsx — keeps every ring inside the same
 * cinematic beat as the fireball, the stem and the cap. Radius-
 * proportional spacing is preserved: the effective shock speed is
 * accelerated uniformly when (and only when) the schedule would
 * otherwise overflow the cap. Smaller scenarios are unaffected
 * (Hiroshima light-damage ≈ 5 km still takes ≈ 1.5 s).
 */
const MAX_TOTAL_CASCADE_MS = 5_000;

/**
 * Per-ring schedule entry produced by {@link computeCascadeSchedule}.
 * Pure data — no Cesium dependencies — so the schedule logic is
 * unit-testable without spinning up a viewer.
 */
export interface CascadeScheduleEntry {
  /** Inner-edge radius the ring grows FROM (i.e. the previous ring's
   *  outer radius, or 0 for the innermost). */
  prevMajor: number;
  /** Outer-edge radius the ring grows TO (semi-major axis). */
  finalMajor: number;
  /** Outer-edge radius the ring grows TO (semi-minor axis). Equals
   *  `finalMajor` for circular rings. */
  finalMinor: number;
  /** Render-time delay before this ring starts expanding (ms). */
  delayMs: number;
  /** Render-time growth window for this ring (ms). */
  growthMs: number;
}

/**
 * Pure-function cascade scheduler. Given resolved ring radii sorted
 * ascending by `finalMajor`, returns the per-ring delay and growth
 * window so the visible cascade ends within {@link MAX_TOTAL_CASCADE_MS}.
 *
 * The base shock speed is the canonical 10× sound (3 430 m/s) cinematic
 * baseline. When the largest ring would otherwise overflow the cap,
 * the speed is accelerated uniformly so the OUTER ring's expansion end
 * lands exactly at the cap. Smaller rings keep their proportional
 * placement — the cascade still reads as a wavefront, just compressed
 * into the cinematic window. Scenarios under the cap (Hiroshima light-
 * damage ≈ 5 km, Northridge MMI VII ≈ 50 km) are unchanged.
 *
 * Exported so tests and other scene-layer modules (wavefront indicator,
 * cascade timeline) can stay in lock-step with the on-globe schedule.
 */
export function computeCascadeSchedule(
  resolved: readonly { finalMajor: number; finalMinor: number }[],
  options: { reducedMotionScale: number; minGrowthMs: number }
): CascadeScheduleEntry[] {
  const { reducedMotionScale, minGrowthMs } = options;
  const maxNominalRadius = resolved.reduce((m, r) => Math.max(m, r.finalMajor), 0);

  // Pick the effective shock speed. The base value is the canonical
  // VISUAL_SHOCK_SPEED_MS (10× sound, ≈ 3 430 m/s); we accelerate ONLY
  // when the largest ring would otherwise place its expansion end
  // past MAX_TOTAL_CASCADE_MS. The required speed is `r_max / cap`,
  // so for a 1 000 km outer ring we run at 200 km/s effective speed
  // and the cascade lands at exactly t = cap. Smaller scenarios stay
  // at the base speed (their natural end is already inside the cap).
  // Edge case: when the last ring's natural growth is below
  // minGrowthMs the floor adds at most minGrowthMs of overshoot
  // (1 - 1.12 × cap), which is still well inside the 7 s mushroom-
  // VFX lifetime — we accept that rather than introduce a
  // distance-dependent re-fit.
  const cap = MAX_TOTAL_CASCADE_MS * reducedMotionScale;
  const speedFromCap = (maxNominalRadius / Math.max(cap, 1)) * 1_000;
  const effectiveSpeed = Math.max(VISUAL_SHOCK_SPEED_MS, speedFromCap);

  return resolved.map((r, i) => {
    const prevMajor = i === 0 ? 0 : (resolved[i - 1]?.finalMajor ?? 0);
    const delayMs = (prevMajor / effectiveSpeed) * 1_000 * reducedMotionScale;
    const physicalGrowthMs =
      ((r.finalMajor - prevMajor) / effectiveSpeed) * 1_000 * reducedMotionScale;
    const growthMs = Math.max(minGrowthMs, physicalGrowthMs);
    return {
      prevMajor,
      finalMajor: r.finalMajor,
      finalMinor: r.finalMinor,
      delayMs,
      growthMs,
    };
  });
}

/**
 * Animate every ring as a sound-speed-paced expanding shock-front.
 *
 * Specs are sorted by `finalSemiMajor` ascending. Each ring is
 * assigned its own delay and growth window, both derived from the
 * physical shock-front travel time `radius / 343 m·s⁻¹` scaled by
 * `ANIMATION_SCALE` (default 0.1, so visual time runs 10× real
 * shock time). The growth window is bounded below by
 * `MIN_GROWTH_MS` so even tiny radius gaps are visibly progressive.
 *
 * Within its window each ring grows from `specs[i-1].finalSemiMajor`
 * to `specs[i].finalSemiMajor` (or from 0 for the first ring) with
 * an ease-out cubic. Earlier-index rings are locked at their final
 * radius; later-index rings stay invisible (axes = 0) until their
 * delay opens.
 *
 * The visible result: one band-coloured wavefront travels outward
 * at a constant visual speed, decelerating into each successive
 * damage threshold; the band's colour shifts as the front crosses
 * each ring. The radius-proportional spacing means a 1 Mt scenario
 * places crater @ 70 ms, 5 psi @ 1.1 s, 1 psi @ 3.3 s, light-damage
 * @ 7.3 s — natural rhythm with no manufactured pauses on tightly-
 * spaced thresholds.
 *
 * Per-kind delays from {@link startDelayMs} are intentionally NOT
 * consulted; the cascade-timeline panel (separate UI) still
 * surfaces the literal physical front-arrival seconds.
 *
 * The asymmetric semi-minor axis grows proportionally so each
 * ring keeps its physically-derived eccentricity throughout its
 * window.
 */
export function animateRingsImperatively(specs: RingAnimationSpec[]): () => void {
  if (specs.length === 0 || typeof requestAnimationFrame !== 'function') {
    // No animation possible — snap to final values.
    for (const spec of specs) {
      const major = clampToGreatCircle(spec.finalSemiMajor) as number;
      const minor = clampToGreatCircle(spec.finalSemiMinor ?? spec.finalSemiMajor) as number;
      writeEllipseAxes(spec.entity, major, minor);
    }
    return (): void => {
      /* no-op */
    };
  }

  // Pre-sort by `finalMajor` ascending so each spec's index maps
  // directly to its position in the cascade order.
  const resolved = specs
    .map((spec) => ({
      entity: spec.entity,
      finalMajor: clampToGreatCircle(spec.finalSemiMajor),
      finalMinor: clampToGreatCircle(spec.finalSemiMinor ?? spec.finalSemiMajor),
    }))
    .sort((a, b) => a.finalMajor - b.finalMajor);

  const maxNominalRadius = resolved.reduce((m, r) => Math.max(m, r.finalMajor), 0);
  if (maxNominalRadius <= 0) {
    // Degenerate: every ring is zero. Snap and exit.
    for (const r of resolved) writeEllipseAxes(r.entity, 0, 0);
    return (): void => {
      /* no-op */
    };
  }

  // Reduced-motion path: still progressive, just faster. The radius-
  // growth animation is NOT vestibular per WCAG 2.3.3, so we keep it
  // visible — only camera-fly motion gets fully suppressed elsewhere.
  const reducedMotionScale = prefersReducedMotion() ? REDUCED_MOTION_SCALE_FACTOR : 1;
  const minGrowthMs = MIN_GROWTH_MS * reducedMotionScale;

  const baseSchedule = computeCascadeSchedule(resolved, { reducedMotionScale, minGrowthMs });
  // Zip the pure-data schedule back together with each ring's Cesium
  // entity. `computeCascadeSchedule` is intentionally Cesium-free so
  // it can be unit-tested in Node; the entity binding lives here.
  const schedule = baseSchedule.map((entry, i) => ({ ...entry, entity: resolved[i]?.entity }));

  const t0 = performance.now();
  let cancelled = false;
  let rafHandle = 0;

  // Initialise every ring at radius 0 — Cesium skips drawing them
  // until their delay opens. writeEllipseAxes already preserves the
  // `semiMajor >= semiMinor` invariant.
  for (const r of resolved) writeEllipseAxes(r.entity, 0, 0);

  const totalCascadeMs = schedule.reduce((m, s) => Math.max(m, s.delayMs + s.growthMs), 0);

  const tick = (): void => {
    if (cancelled) return;
    const elapsed = performance.now() - t0;

    for (const s of schedule) {
      if (s.entity === undefined) continue;
      let currentMajor: number;
      if (elapsed >= s.delayMs + s.growthMs) {
        // Window fully elapsed — ring locked at its final radius.
        currentMajor = s.finalMajor;
      } else if (elapsed <= s.delayMs) {
        // Wavefront has not reached this ring yet — invisible.
        currentMajor = 0;
      } else {
        const localProgress = (elapsed - s.delayMs) / s.growthMs;
        const eased = easeOutCubic(localProgress);
        currentMajor = s.prevMajor + (s.finalMajor - s.prevMajor) * eased;
      }
      const ratio = s.finalMajor > 0 ? currentMajor / s.finalMajor : 0;
      writeEllipseAxes(s.entity, s.finalMajor * ratio, s.finalMinor * ratio);
    }

    if (elapsed < totalCascadeMs) {
      rafHandle = requestAnimationFrame(tick);
    }
  };
  rafHandle = requestAnimationFrame(tick);
  return (): void => {
    cancelled = true;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafHandle);
  };
}
