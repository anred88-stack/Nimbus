import { describe, expect, it } from 'vitest';
import { animationDurationMs, computeCascadeSchedule, startDelayMs } from './ringAnimation.js';

describe('startDelayMs', () => {
  it('returns 0 for instantaneous-onset ring kinds', () => {
    expect(startDelayMs('crater', 1_000)).toBe(0);
    expect(startDelayMs('thermal', 50_000)).toBe(0);
    expect(startDelayMs('firestorm', 100_000)).toBe(0);
    expect(startDelayMs('tsunamiCavity', 80_000)).toBe(0);
    expect(startDelayMs('ashfall', 200_000)).toBe(0);
  });

  it('returns 0 for non-positive radii', () => {
    expect(startDelayMs('overpressure', 0)).toBe(0);
    expect(startDelayMs('mmi', -5)).toBe(0);
    expect(startDelayMs('overpressure', Number.NaN)).toBe(0);
  });

  it('compresses the shock-front onset for overpressure rings', () => {
    // 5 km blast: physical onset ≈ 14.6 s → log10(15.6) ≈ 1.193 → ~596 ms.
    const fivePsi = startDelayMs('overpressure', 5_000);
    expect(fivePsi).toBeGreaterThan(550);
    expect(fivePsi).toBeLessThan(620);

    // A larger 50 km 1-psi ring delays further into the cascade.
    const onePsi = startDelayMs('overpressure', 50_000);
    expect(onePsi).toBeGreaterThan(fivePsi);
  });

  it('compresses the P-wave onset for MMI contours', () => {
    // 100 km MMI VII: physical onset ≈ 16.7 s → log10(17.7) ≈ 1.247 → ~624 ms.
    const mmi7 = startDelayMs('mmi', 100_000);
    expect(mmi7).toBeGreaterThan(580);
    expect(mmi7).toBeLessThan(670);
  });

  it('saturates at the 2500 ms cap for very large radii', () => {
    // A 10 000 km MMI footprint implies ≈ 1 667 s of P-wave travel
    // (log10(1 668) · 500 ≈ 1 611 ms) — well under the new 2 500 ms
    // cap. A 10× larger radius (impractical but bounds-checks the cap)
    // would need ≈ 1 666 s shock travel → log10(1 667) · 500 = 1 611,
    // still under 2 500. So we exercise the cap with a much larger
    // synthetic MMI footprint instead.
    expect(startDelayMs('mmi', 10_000_000_000)).toBe(2_500);
    // A trans-oceanic 10 000 km shock front: ≈ 1 611 ms — visible
    // stagger, no clipping.
    const farShock = startDelayMs('overpressure', 10_000_000);
    expect(farShock).toBeGreaterThan(1_500);
    expect(farShock).toBeLessThan(2_500);
  });

  it('orders the cascade so thermal precedes shock precedes seismic', () => {
    // For a 100 km event radius, a thermal pulse appears immediately,
    // the airblast catches up after a fraction of a second of compressed
    // time, and the felt-intensity contour follows once the P-wave
    // arrives — exactly the order Chelyabinsk witnesses described.
    const radius = 100_000;
    const thermal = startDelayMs('thermal', radius);
    const shock = startDelayMs('overpressure', radius);
    const seismic = startDelayMs('mmi', radius);
    expect(thermal).toBeLessThan(shock);
    expect(seismic).toBeLessThan(shock);
  });
});

describe('animationDurationMs (regression)', () => {
  // Light-touch sanity check that the duration logic still tracks
  // the physically-calibrated speeds; the cap was bumped 4 000 → 6 000
  // and the floor 250 → 1 500 ms so every ring reads as a wavefront
  // rather than an instant snap.
  it('uses physical sound-speed for overpressure rings', () => {
    // 5 km shock front at 343 m/s → 14_577 ms → capped at 6 000 ms.
    expect(animationDurationMs('overpressure', 5_000)).toBe(6_000);
    // 1 km shock front at 343 m/s → ≈ 2 915 ms (between floor + cap).
    expect(animationDurationMs('overpressure', 1_000)).toBeCloseTo(2_915, 0);
    // 100 m shock front at 343 m/s → ≈ 292 ms physical, clamped to
    // the 1 500 ms floor so even small rings get a visible reveal.
    expect(animationDurationMs('overpressure', 100)).toBe(1_500);
  });

  it('returns visible reveal (1.5–2.2 s) for kinds with no propagating front', () => {
    // Bumped from 300 ms / 500 ms — those values produced flash-pops
    // that defeated the entire cascade cinematic.
    expect(animationDurationMs('crater', 1_000)).toBe(1_500);
    expect(animationDurationMs('thermal', 1_000)).toBe(2_200);
  });
});

describe('computeCascadeSchedule', () => {
  /**
   * Ring radii used by these tests are picked at the orders of magnitude
   * the simulator actually produces:
   *   - Hiroshima (15 kt) light-damage ≈ 5 km — well under the cap.
   *   - Tsar Bomba (50 Mt) light-damage ≈ 80 km — overflows the
   *     canonical schedule into ≈ 23 s without the cap.
   *   - Chicxulub (1e24 J) light-damage ≈ 1 000 km — would otherwise
   *     run for several minutes.
   * `reducedMotionScale: 1` is the desktop default; `0.4` mirrors the
   * `prefers-reduced-motion: reduce` path.
   */
  const opts = (
    reducedMotionScale = 1,
    minGrowthMs = 600
  ): {
    reducedMotionScale: number;
    minGrowthMs: number;
  } => ({ reducedMotionScale, minGrowthMs });

  it('preserves the canonical schedule when the cascade fits the cap', () => {
    // Hiroshima-class radii: crater 90 m → thermal 1.2 km → 5 psi
    // 2.5 km → 1 psi 4.7 km. The outer ring at 4.7 km / 3 430 m/s ≈
    // 1.37 s — well under the 5 s cap.
    const resolved = [
      { finalMajor: 90, finalMinor: 90 },
      { finalMajor: 1_200, finalMinor: 1_200 },
      { finalMajor: 2_500, finalMinor: 2_500 },
      { finalMajor: 4_700, finalMinor: 4_700 },
    ];
    const schedule = computeCascadeSchedule(resolved, opts());
    // Innermost ring still starts at t = 0.
    expect(schedule[0]?.delayMs).toBe(0);
    // Outer ring's start lines up with `prevMajor / 3430 m/s`. For the
    // 1 psi ring, prev = 2 500 m → 729 ms. Allowing a couple ms float
    // slack.
    const outer = schedule[3];
    expect(outer?.delayMs).toBeCloseTo(2_500 / 3.43, 0);
    // Total cascade well under the cap.
    const total = schedule.reduce((m, s) => Math.max(m, s.delayMs + s.growthMs), 0);
    expect(total).toBeLessThan(2_500);
  });

  it('caps the total cascade at 5 s for Tsar-Bomba-class events', () => {
    // Tsar Bomba light-damage ≈ 80 km — at base speed the schedule
    // would run 80 000 / 3 430 ≈ 23.3 s, well past the 7 s mushroom
    // VFX lifetime. The cap accelerates the effective shock speed so
    // the outermost ring lands at exactly 5 s.
    const resolved = [
      { finalMajor: 200, finalMinor: 200 },
      { finalMajor: 5_000, finalMinor: 5_000 },
      { finalMajor: 30_000, finalMinor: 30_000 },
      { finalMajor: 80_000, finalMinor: 80_000 },
    ];
    const schedule = computeCascadeSchedule(resolved, opts());
    const total = schedule.reduce((m, s) => Math.max(m, s.delayMs + s.growthMs), 0);
    // 5 s ± float slack. Without the cap this was ~23 s.
    expect(total).toBeLessThanOrEqual(5_000 + 1);
    expect(total).toBeGreaterThan(4_500);
  });

  it('caps the total cascade at 5 s for Chicxulub-class radii', () => {
    // Chicxulub-class outermost ring at 1 000 km would otherwise take
    // ≈ 4.86 minutes at base speed.
    const resolved = [
      { finalMajor: 5_000, finalMinor: 5_000 },
      { finalMajor: 50_000, finalMinor: 50_000 },
      { finalMajor: 300_000, finalMinor: 300_000 },
      { finalMajor: 1_000_000, finalMinor: 1_000_000 },
    ];
    const schedule = computeCascadeSchedule(resolved, opts());
    const total = schedule.reduce((m, s) => Math.max(m, s.delayMs + s.growthMs), 0);
    expect(total).toBeLessThanOrEqual(5_000 + 1);
  });

  it('preserves radius order across the schedule', () => {
    const resolved = [
      { finalMajor: 1_000, finalMinor: 1_000 },
      { finalMajor: 10_000, finalMinor: 10_000 },
      { finalMajor: 100_000, finalMinor: 100_000 },
      { finalMajor: 1_000_000, finalMinor: 1_000_000 },
    ];
    const schedule = computeCascadeSchedule(resolved, opts());
    // Each ring starts no earlier than its predecessor.
    for (let i = 1; i < schedule.length; i++) {
      const prev = schedule[i - 1];
      const cur = schedule[i];
      if (prev !== undefined && cur !== undefined) {
        expect(cur.delayMs).toBeGreaterThanOrEqual(prev.delayMs);
      }
    }
  });

  it('honours minGrowthMs as the floor on every ring', () => {
    const resolved = [
      { finalMajor: 100, finalMinor: 100 },
      { finalMajor: 200, finalMinor: 200 }, // 100 m gap → physical growth 29 ms
      { finalMajor: 500, finalMinor: 500 },
    ];
    const schedule = computeCascadeSchedule(resolved, opts(1, 600));
    for (const entry of schedule) {
      expect(entry.growthMs).toBeGreaterThanOrEqual(600);
    }
  });

  it('compresses the cap proportionally under reduced motion', () => {
    // Reduced-motion path multiplies both delays and growth by 0.4 so
    // the cascade replays 2.5× faster. The cap moves with it: 5 s × 0.4
    // = 2 s.
    const resolved = [
      { finalMajor: 5_000, finalMinor: 5_000 },
      { finalMajor: 80_000, finalMinor: 80_000 },
    ];
    const schedule = computeCascadeSchedule(resolved, opts(0.4, 240));
    const total = schedule.reduce((m, s) => Math.max(m, s.delayMs + s.growthMs), 0);
    expect(total).toBeLessThanOrEqual(2_000 + 1);
  });
});
