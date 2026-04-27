import type { Entity } from 'cesium';

/**
 * Progressively reveals aftershock point entities over a single 4 s
 * UI window, using log-compressed onsets so the first seconds of the
 * Omori–Utsu decay (where most events cluster) read clearly while
 * the long tail (days–weeks) doesn't drag the loop on for minutes.
 *
 * Time mapping (Omori physical → UI):
 *   t = 0 (mainshock)        → 0 ms
 *   t = +1 minute            → ~600 ms
 *   t = +1 hour              → ~1 200 ms
 *   t = +1 day               → ~1 900 ms
 *   t = +1 week              → ~2 500 ms
 *   t = +1 year              → 4 000 ms
 *
 * Typical input has 100–500 events with `physicalTimeSeconds` from a
 * few seconds to ~30 days. Linear playback would either rush the
 * dense early cluster or wait minutes for the late tail; the `log1p`
 * mapping keeps both ends visible inside ANIMATION_MS.
 *
 * The audit (Phase 8a) flagged the previous 200 ms pixelSize
 * overshoot as a pure UX cue with no physical meaning. The reveal is
 * now a clean 300 ms fade-in via `pixelSize` ramping from 0 to the
 * final size — same "the marker is appearing" semantic, but the
 * geometry stays monotone (no overshoot), and the timing is tied to
 * the log-compressed Omori onset for that specific replica.
 *
 * Honours `prefers-reduced-motion`: returns immediately after
 * setting every entity's `show = true` (no rAF loop).
 */

const ANIMATION_MS = 4_000;
/** Per-marker fade-in duration. Pure visual easing — does not
 *  compete with the log-compressed Omori timing of the marker
 *  itself. Was a 200 ms overshoot pop previously; now a monotone
 *  ramp 0 → final size over the same budget. */
const FADE_IN_MS = 300;

export interface AftershockAnimationSpec {
  /** Cesium entity carrying a `point` graphic. */
  entity: Entity;
  /** Real-world onset (seconds since the mainshock). */
  physicalTimeSeconds: number;
  /** Final pixel size (settled state). The pop ramps from
   *  POP_OVERSHOOT × this back down to it. */
  finalPixelSize: number;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Start the aftershock-reveal animation. Returns a cancel function
 * that stops the rAF loop and forces every entity to its settled
 * visible state — call it on re-evaluate so a stale loop doesn't
 * keep writing into removed entities.
 */
export function animateAftershocksImperatively(
  specs: readonly AftershockAnimationSpec[]
): () => void {
  if (specs.length === 0) return () => undefined;

  // Resolve point property accessors once. Cesium's point graphic
  // is `entity.point` and exposes `show` / `pixelSize` properties
  // that accept plain numbers / booleans (we don't need
  // CallbackProperty here — atomic per-frame writes are fine).
  const writeShow = (entity: Entity, value: boolean): void => {
    if (entity.point !== undefined) {
      // ConstantProperty rebinding — assigning a primitive triggers
      // Cesium's value-coercion path which wraps it for us.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (entity.point as unknown as Record<string, any>).show = value;
    }
  };
  const writePixelSize = (entity: Entity, value: number): void => {
    if (entity.point !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (entity.point as unknown as Record<string, any>).pixelSize = value;
    }
  };

  // Reduced-motion branch: settle immediately, no rAF.
  if (prefersReducedMotion()) {
    for (const spec of specs) {
      writeShow(spec.entity, true);
      writePixelSize(spec.entity, spec.finalPixelSize);
    }
    return () => undefined;
  }

  // Hide all entities up front; the loop will reveal them progressively.
  for (const spec of specs) writeShow(spec.entity, false);

  // Log-compress onsets across the UI window.
  let maxPhysical = 0;
  for (const spec of specs) {
    if (spec.physicalTimeSeconds > maxPhysical) maxPhysical = spec.physicalTimeSeconds;
  }
  const logMax = Math.log1p(Math.max(maxPhysical, 1));
  const schedule = specs.map((spec) => {
    const ratio = logMax > 0 ? Math.log1p(Math.max(spec.physicalTimeSeconds, 0)) / logMax : 0;
    return ratio * ANIMATION_MS;
  });

  const t0 = performance.now();
  let cancelled = false;
  let rafHandle = 0;

  const tick = (): void => {
    if (cancelled) return;
    const elapsed = performance.now() - t0;
    let allRevealed = true;
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      if (spec === undefined) continue;
      const onset = schedule[i] ?? 0;
      if (elapsed < onset) {
        allRevealed = false;
        continue;
      }
      // Monotone fade-in from 0 to the final pixel size. No
      // overshoot — the audit (Phase 8a) explicitly disallowed the
      // previous "pop" because it competed with the physical-time
      // semantics of the marker reveal.
      writeShow(spec.entity, true);
      const sinceReveal = elapsed - onset;
      if (sinceReveal < FADE_IN_MS) {
        const t = sinceReveal / FADE_IN_MS;
        writePixelSize(spec.entity, spec.finalPixelSize * t);
        allRevealed = false;
      } else {
        writePixelSize(spec.entity, spec.finalPixelSize);
      }
    }
    if (!allRevealed && elapsed < ANIMATION_MS + FADE_IN_MS) {
      rafHandle = requestAnimationFrame(tick);
    } else {
      // Force-settle every entity at the end so we never leave a
      // stale pop on screen.
      for (const spec of specs) {
        writeShow(spec.entity, true);
        writePixelSize(spec.entity, spec.finalPixelSize);
      }
    }
  };

  rafHandle = requestAnimationFrame(tick);

  return (): void => {
    cancelled = true;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafHandle);
    for (const spec of specs) {
      writeShow(spec.entity, true);
      writePixelSize(spec.entity, spec.finalPixelSize);
    }
  };
}
