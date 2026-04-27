import { describe, expect, it } from 'vitest';
import {
  CRUSTAL_ROCK_DENSITY,
  EARTH_MASS,
  EARTH_RADIUS,
  GRAVITATIONAL_CONSTANT,
  SEAWATER_DENSITY,
  SPEED_OF_LIGHT,
  STANDARD_GRAVITY,
} from './constants.js';

describe('physical constants', () => {
  it('speed of light has the exact SI-defined value', () => {
    expect(SPEED_OF_LIGHT as number).toBe(299_792_458);
  });

  it('gravitational constant matches CODATA 2018 value', () => {
    // CODATA 2018: 6.67430(15) × 10⁻¹¹ m³ kg⁻¹ s⁻².
    expect(GRAVITATIONAL_CONSTANT).toBeCloseTo(6.674_30e-11, 15);
  });

  it("Earth's mean radius is the GRS80 value (6 371 km)", () => {
    expect(EARTH_RADIUS as number).toBe(6_371_000);
  });

  it("Earth's mass is within 0.1 % of 5.972e24 kg", () => {
    const expected = 5.972e24;
    expect(Math.abs((EARTH_MASS as number) - expected) / expected).toBeLessThan(1e-3);
  });

  it('standard gravity is the ISO 80000-3 fixed value 9.806 65 m/s²', () => {
    expect(STANDARD_GRAVITY).toBe(9.806_65);
  });

  it('seawater density is ≈ 1025 kg/m³', () => {
    expect(SEAWATER_DENSITY as number).toBe(1025);
  });

  it('crustal rock density is ≈ 2700 kg/m³', () => {
    expect(CRUSTAL_ROCK_DENSITY as number).toBe(2700);
  });

  // Sanity: g ≈ GM/R² at Earth's surface, within a few per cent of
  // STANDARD_GRAVITY (mass/radius constants used with Newton's law of gravity).
  // This is not a test of g itself; it is a cross-check that the constants
  // are mutually consistent and no rogue value slipped in.
  it('EARTH_MASS, EARTH_RADIUS, G reconstruct surface gravity within 1 %', () => {
    const computed =
      (GRAVITATIONAL_CONSTANT * (EARTH_MASS as number)) / (EARTH_RADIUS as number) ** 2;
    expect(Math.abs(computed - STANDARD_GRAVITY) / STANDARD_GRAVITY).toBeLessThan(1e-2);
  });
});
