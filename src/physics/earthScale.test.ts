import { describe, expect, it } from 'vitest';
import {
  EARTH_GREAT_CIRCLE_MAX,
  EARTH_RADIUS,
  clampToGreatCircle,
  isGlobalReach,
  surfaceCoverageFraction,
} from './earthScale.js';

describe('earthScale', () => {
  it('EARTH_RADIUS and EARTH_GREAT_CIRCLE_MAX match the spherical-Earth identity', () => {
    expect(EARTH_RADIUS).toBe(6_371_000);
    // π·R = antipodal distance
    expect(EARTH_GREAT_CIRCLE_MAX / Math.PI).toBeCloseTo(6_371_000, 0);
  });

  describe('clampToGreatCircle', () => {
    it('passes through finite distances under the antipode', () => {
      expect(clampToGreatCircle(1_000_000)).toBe(1_000_000);
      expect(clampToGreatCircle(15_000_000)).toBe(15_000_000);
    });

    it('clamps at the antipodal distance', () => {
      expect(clampToGreatCircle(30_000_000)).toBe(EARTH_GREAT_CIRCLE_MAX);
      expect(clampToGreatCircle(Infinity)).toBe(EARTH_GREAT_CIRCLE_MAX);
    });

    it('clamps negatives / non-finite inputs to zero', () => {
      expect(clampToGreatCircle(-1)).toBe(0);
      expect(clampToGreatCircle(Number.NaN)).toBe(0);
    });
  });

  describe('isGlobalReach', () => {
    it('is false for continental-scale radii', () => {
      expect(isGlobalReach(1_000_000)).toBe(false); // 1 000 km
      expect(isGlobalReach(10_000_000)).toBe(false); // 10 000 km
    });

    it('is true once ≥ 90% of the antipodal distance', () => {
      expect(isGlobalReach(0.9 * (EARTH_GREAT_CIRCLE_MAX as number))).toBe(true);
      expect(isGlobalReach((EARTH_GREAT_CIRCLE_MAX as number) * 2)).toBe(true);
    });
  });

  describe('surfaceCoverageFraction', () => {
    it('is 0 at the origin', () => {
      expect(surfaceCoverageFraction(0)).toBe(0);
    });

    it('is 0.5 at a quarter great-circle (π·R/2)', () => {
      // Angular radius π/2 → cap covers exactly half the sphere.
      expect(surfaceCoverageFraction(((EARTH_RADIUS as number) * Math.PI) / 2)).toBeCloseTo(0.5, 5);
    });

    it('is 1 at the antipodal distance', () => {
      expect(surfaceCoverageFraction(EARTH_GREAT_CIRCLE_MAX as number)).toBeCloseTo(1, 5);
    });

    it('matches the spherical-cap area formula for a 1 000 km cap', () => {
      // A ~1 000 km cap over Earth covers ~0.61 % of the surface.
      const f = surfaceCoverageFraction(1_000_000);
      expect(f).toBeGreaterThan(0.006);
      expect(f).toBeLessThan(0.0065);
    });
  });
});
