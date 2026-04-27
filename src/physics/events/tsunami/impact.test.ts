import { describe, expect, it } from 'vitest';
import { IMPACT_PRESETS, simulateImpact } from '../../simulate.js';
import { m as meters, megatonsToJoules, Mt } from '../../units.js';
import {
  impactAmplitudeAtDistance,
  impactAmplitudeWunnemann,
  impactCavityRadius,
  impactSourceAmplitude,
  wunnemannDampingFactor,
} from './impact.js';

describe('impactCavityRadius (Ward & Asphaug 2000)', () => {
  it('Chicxulub-class impactor opens an ~80 km water-column cavity', () => {
    const chicxulub = simulateImpact(IMPACT_PRESETS.CHICXULUB.input);
    const RC = impactCavityRadius({ kineticEnergy: chicxulub.impactor.kineticEnergy }) as number;
    // Hand-computed ≈ 84 km for KE ≈ 1.06 × 10²⁴ J, ρ_w = 1025, g = 9.81.
    expect(RC).toBeGreaterThan(70_000);
    expect(RC).toBeLessThan(100_000);
  });

  it('scales as E^(1/4)', () => {
    const small = impactCavityRadius({ kineticEnergy: megatonsToJoules(Mt(1)) }) as number;
    const big = impactCavityRadius({ kineticEnergy: megatonsToJoules(Mt(16)) }) as number;
    // 16× the energy ⇒ 16^(1/4) = 2× the radius.
    expect(big / small).toBeCloseTo(2, 6);
  });
});

describe('impactSourceAmplitude — size-dependent coupling η', () => {
  it('recovers Ward 2000 (≈ R/2) for small ocean impacts (R_C ≪ 5 km)', () => {
    // R_C = 1 km → η ≈ 0.49, A ≈ 490 m (essentially Ward's 500 m).
    const A = impactSourceAmplitude(meters(1_000)) as number;
    expect(A).toBeGreaterThan(450);
    expect(A).toBeLessThan(500);
  });

  it('damps strongly for K-Pg-class cavities (R_C ≫ 5 km)', () => {
    // R_C = 84 km → η ≈ 0.0017 → A ≈ 142 m.
    // This matches the Range 2022 / Bralower 2018 hydrocode envelope
    // (100-1500 m for Chicxulub) — Ward's raw 0.5·R = 42 km is
    // unphysical because it ignores vapor + ejecta + crater
    // excavation absorption of impact energy.
    const A = impactSourceAmplitude(meters(84_000)) as number;
    expect(A).toBeGreaterThan(100);
    expect(A).toBeLessThan(300);
  });

  it('returns 0 for non-positive cavity radii', () => {
    expect(impactSourceAmplitude(meters(0)) as number).toBe(0);
    expect(impactSourceAmplitude(meters(-1)) as number).toBe(0);
  });
});

describe('impactAmplitudeAtDistance', () => {
  it('decays as 1/r in the far field', () => {
    const base = {
      sourceAmplitude: meters(40_000),
      cavityRadius: meters(80_000),
    };
    const near = impactAmplitudeAtDistance({ ...base, distance: meters(100_000) }) as number;
    const far = impactAmplitudeAtDistance({ ...base, distance: meters(1_000_000) }) as number;
    // 10× the distance ⇒ 1/10 the amplitude.
    expect(near / far).toBeCloseTo(10, 6);
  });

  it('clamps to source amplitude inside the cavity', () => {
    const A = impactAmplitudeAtDistance({
      sourceAmplitude: meters(100),
      cavityRadius: meters(500),
      distance: meters(200),
    }) as number;
    expect(A).toBe(100);
  });

  it('Chicxulub at 1 000 km from impact → tsunami in the metre-to-tens-of-metres range', () => {
    const chicxulub = simulateImpact(IMPACT_PRESETS.CHICXULUB.input);
    const RC = impactCavityRadius({ kineticEnergy: chicxulub.impactor.kineticEnergy });
    const A0 = impactSourceAmplitude(RC);
    const A = impactAmplitudeAtDistance({
      sourceAmplitude: A0,
      cavityRadius: RC,
      distance: meters(1_000_000),
    }) as number;
    // With the size-dependent η coupling, Ward 1/r decay gives
    // A(1000 km) ≈ 12 m for K-Pg — consistent with Range 2022
    // hydrocode at deep-ocean far-field (literature 5-50 m).
    expect(A).toBeGreaterThan(5);
    expect(A).toBeLessThan(50);
  });
});

describe('wunnemannDampingFactor (Wünnemann 2007 / Melosh 2003)', () => {
  it('returns ~0.8 at 100 km (anchor) and < 1 at all finite distances', () => {
    expect(wunnemannDampingFactor(meters(100_000))).toBeCloseTo(0.8, 2);
  });

  it('drops to ~0.25 at 1 000 km and ~0.11 at 5 000 km', () => {
    expect(wunnemannDampingFactor(meters(1_000_000))).toBeCloseTo(0.253, 2);
    expect(wunnemannDampingFactor(meters(5_000_000))).toBeCloseTo(0.113, 2);
  });

  it('clamps to 1 for distances below the anchor (no over-correction)', () => {
    expect(wunnemannDampingFactor(meters(10_000))).toBe(1);
    expect(wunnemannDampingFactor(meters(0))).toBe(1);
  });

  it('applying the factor to Ward–Asphaug gives a 4–10× smaller far field', () => {
    const chicxulub = simulateImpact(IMPACT_PRESETS.CHICXULUB.input);
    const RC = impactCavityRadius({ kineticEnergy: chicxulub.impactor.kineticEnergy });
    const A0 = impactSourceAmplitude(RC);
    const common = { sourceAmplitude: A0, cavityRadius: RC, distance: meters(1_000_000) };
    const ward = impactAmplitudeAtDistance(common) as number;
    const wunnemann = impactAmplitudeWunnemann(common) as number;
    expect(ward / wunnemann).toBeGreaterThan(3);
    expect(ward / wunnemann).toBeLessThan(10);
  });
});
