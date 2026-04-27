import { describe, expect, it } from 'vitest';
import { m } from '../../units.js';
import {
  aftershockShakingFootprint,
  BATH_GAP,
  generateAftershockSequence,
  MAX_AFTERSHOCKS,
} from './aftershocks.js';

describe('generateAftershockSequence', () => {
  it('produces an identical sequence on repeated calls (determinism)', () => {
    const a = generateAftershockSequence({
      magnitude: 7.0,
      ruptureLength: m(50_000),
      seed: 'reg-test',
    });
    const b = generateAftershockSequence({
      magnitude: 7.0,
      ruptureLength: m(50_000),
      seed: 'reg-test',
    });
    expect(a).toEqual(b);
  });

  it('respects the Båth cap (no aftershock above M_main − 1.2)', () => {
    const r = generateAftershockSequence({
      magnitude: 7.5,
      ruptureLength: m(80_000),
      seed: 'bath-test',
    });
    expect(r.bathCeiling).toBeCloseTo(7.5 - BATH_GAP, 6);
    for (const event of r.events) {
      expect(event.magnitude).toBeLessThanOrEqual(r.bathCeiling);
    }
  });

  it('every event sits at or above the completeness cutoff', () => {
    const r = generateAftershockSequence({
      magnitude: 6.5,
      ruptureLength: m(20_000),
      seed: 'mc-test',
      completenessCutoff: 3.0,
    });
    for (const event of r.events) {
      expect(event.magnitude).toBeGreaterThanOrEqual(3.0);
    }
  });

  it('event times sit inside the observation window and are sorted', () => {
    const r = generateAftershockSequence({
      magnitude: 7.0,
      ruptureLength: m(50_000),
      seed: 'time-test',
      durationDays: 7,
    });
    let prev = 0;
    for (const event of r.events) {
      const tSeconds = event.timeAfterMainshock as number;
      expect(tSeconds).toBeGreaterThanOrEqual(0);
      expect(tSeconds).toBeLessThanOrEqual(7 * 86_400);
      expect(tSeconds).toBeGreaterThanOrEqual(prev);
      prev = tSeconds;
    }
  });

  it('large mainshocks generate more aftershocks than small ones', () => {
    const small = generateAftershockSequence({
      magnitude: 5.5,
      ruptureLength: m(5_000),
      seed: 'count-test',
    });
    const big = generateAftershockSequence({
      magnitude: 8.0,
      ruptureLength: m(200_000),
      seed: 'count-test',
    });
    expect(big.totalCount).toBeGreaterThan(small.totalCount);
  });

  it('caps the catalogue at MAX_AFTERSHOCKS for extreme megathrust events', () => {
    const r = generateAftershockSequence({
      magnitude: 9.5,
      ruptureLength: m(1_000_000),
      seed: 'cap-test',
    });
    expect(r.totalCount).toBeLessThanOrEqual(MAX_AFTERSHOCKS);
  });

  it('spatial scatter stays inside the rupture-length envelope', () => {
    const ruptureLength = 80_000;
    const r = generateAftershockSequence({
      magnitude: 7.5,
      ruptureLength: m(ruptureLength),
      seed: 'space-test',
    });
    for (const event of r.events) {
      expect(Math.abs(event.northOffsetM as number)).toBeLessThanOrEqual(ruptureLength / 2);
      expect(Math.abs(event.eastOffsetM as number)).toBeLessThanOrEqual(ruptureLength / 2);
    }
  });
});

describe('aftershockShakingFootprint', () => {
  /**
   * Validates the per-aftershock MMI radii against orders of magnitude
   * routinely observed for moderate aftershocks. The footprint uses
   * the same Joyner–Boore + Worden 2012 chain as the mainshock, so
   * these checks act as smoke tests on the integration rather than
   * a fresh re-validation of the underlying formulas (which have
   * dedicated tests in attenuation/intensity).
   */
  it('orders the radii correctly: MMI V > VI > VII', () => {
    const f = aftershockShakingFootprint(6.5);
    expect(f.mmi5Radius as number).toBeGreaterThan(f.mmi6Radius);
    expect(f.mmi6Radius as number).toBeGreaterThan(f.mmi7Radius);
  });

  it('returns positive km-scale radii for a typical Mw 5.5 aftershock', () => {
    // An Mw 5.5 strike-slip aftershock typically produces MMI V at
    // ≈ 30–60 km and MMI VII just at the rupture (Worden 2012 +
    // Joyner-Boore 1981; cross-checked against ShakeMap archives
    // for the M5.5 Northridge aftershock cluster).
    const f = aftershockShakingFootprint(5.5);
    expect(f.mmi5Radius as number).toBeGreaterThan(10_000);
    expect(f.mmi5Radius as number).toBeLessThan(120_000);
    expect(f.mmi7Radius as number).toBeGreaterThanOrEqual(0);
    expect(f.mmi7Radius as number).toBeLessThan(20_000);
  });

  it('returns zero contour radius when the magnitude is too low to sustain it', () => {
    // Mw 3.0: epicentral PGA is below the MMI VII threshold —
    // distanceForPga returns m(0), which the consumer interprets as
    // "this contour does not exist for this scenario".
    const f = aftershockShakingFootprint(3.0);
    expect(f.mmi7Radius as number).toBe(0);
  });

  it('grows monotonically with magnitude', () => {
    const small = aftershockShakingFootprint(5.0);
    const large = aftershockShakingFootprint(7.0);
    expect(large.mmi5Radius as number).toBeGreaterThan(small.mmi5Radius);
    expect(large.mmi6Radius as number).toBeGreaterThan(small.mmi6Radius);
    expect(large.mmi7Radius as number).toBeGreaterThan(small.mmi7Radius);
  });
});
