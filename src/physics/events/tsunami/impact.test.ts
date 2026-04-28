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
  it('recovers a Ward-like fraction of R_C for small ocean impacts (R_C ≪ R_ref)', () => {
    // R_C = 1 km, R_ref = 3 km → η = 0.5/(1+1/3) = 0.375 → A ≈ 375 m.
    // Ward's idealised limit is 0.5 R but the linear coupling damps
    // even small impacts a little, anchoring the small-end of the
    // calibration to Eltanin-class observations.
    const A = impactSourceAmplitude(meters(1_000)) as number;
    expect(A).toBeGreaterThan(350);
    expect(A).toBeLessThan(400);
  });

  it('saturates near the asymptote for K-Pg-class cavities', () => {
    // R_C = 84 km → η = 0.5/(1+84/3) = 0.0172 → A ≈ 1.45 km.
    // Inside the Range 2022 / Bralower 2018 hydrocode envelope
    // (100–1500 m for Chicxulub-class) and saturating toward the
    // formal asymptote A∞ = 0.5·R_ref = 1.5 km.
    const A = impactSourceAmplitude(meters(84_000)) as number;
    expect(A).toBeGreaterThan(1_400);
    expect(A).toBeLessThan(1_500);
  });

  it('is strictly monotonic in cavity radius (Phase-17 invariant)', () => {
    // Pre-Phase-17 the formula peaked at R_C = 5 km and decreased
    // beyond, so a Boltysh-class impact (R_C ≈ 16 km) predicted a
    // *larger* source amplitude than Chicxulub-class (R_C ≈ 84 km).
    // Monotonicity is the load-bearing physics invariant: every step
    // up in cavity radius must produce at least as large an A₀.
    let last = 0;
    for (const RC of [500, 1_000, 3_000, 10_000, 16_000, 25_000, 50_000, 84_000, 200_000]) {
      const A = impactSourceAmplitude(meters(RC)) as number;
      expect(A).toBeGreaterThan(last);
      last = A;
    }
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

  it('Chicxulub raw KE cavity → undamped Ward reach at 1 000 km is hundred-metre scale', () => {
    // This test pokes the formula directly with the impactor's full
    // post-atmospheric KE (no Phase-18 ocean-coupling partition), so
    // it produces the upper-bound "if all the energy went into the
    // cavity" reach. Useful as a sanity check on impactCavityRadius
    // + impactSourceAmplitude in isolation. The simulator-level
    // Chicxulub-on-shelf result is much smaller (see simulate.test.ts
    // for the full integrated value).
    const chicxulub = simulateImpact(IMPACT_PRESETS.CHICXULUB.input);
    const RC = impactCavityRadius({ kineticEnergy: chicxulub.impactor.kineticEnergy });
    const A0 = impactSourceAmplitude(RC);
    const A = impactAmplitudeAtDistance({
      sourceAmplitude: A0,
      cavityRadius: RC,
      distance: meters(1_000_000),
    }) as number;
    // A₀(R_C ≈ 84 km) ≈ 1.45 km → A₀·R_C/r ≈ 122 m.
    expect(A).toBeGreaterThan(80);
    expect(A).toBeLessThan(200);
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
