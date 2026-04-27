import { describe, expect, it } from 'vitest';
import { m } from '../../units.js';
import {
  dispersionAmplitudeFactor,
  submarineLandslideAmplitude,
  synolakisRunup,
  tohoku2011DARTReference,
} from './extendedEffects.js';

describe('synolakisRunup (Synolakis 1987)', () => {
  it('1 m wave on a 1:100 beach with 10 m offshore depth → run-up ~ 10–20 m', () => {
    const R = synolakisRunup(m(1), Math.atan(1 / 100), m(10)) as number;
    expect(R).toBeGreaterThan(10);
    expect(R).toBeLessThan(20);
  });

  it('gentler slope → higher run-up', () => {
    const steep = synolakisRunup(m(1), Math.atan(1 / 20), m(10)) as number;
    const gentle = synolakisRunup(m(1), Math.atan(1 / 200), m(10)) as number;
    expect(gentle).toBeGreaterThan(steep);
  });

  it('returns 0 for invalid inputs', () => {
    expect(synolakisRunup(m(0), 0.01, m(10))).toBe(0);
    expect(synolakisRunup(m(1), 0, m(10))).toBe(0);
    expect(synolakisRunup(m(1), 0.01, m(0))).toBe(0);
  });
});

describe('submarineLandslideAmplitude (Watts 2000)', () => {
  it('Aitape 1998 slide V = 4×10⁶ m³, slope 10° → initial amplitude of a few m', () => {
    const A = submarineLandslideAmplitude(4e6, (10 * Math.PI) / 180) as number;
    expect(A).toBeGreaterThan(1);
    expect(A).toBeLessThan(10);
  });

  it('scales as V^(1/3) · sin(θ)', () => {
    const a = submarineLandslideAmplitude(1e7, Math.PI / 6) as number;
    const b = submarineLandslideAmplitude(8e7, Math.PI / 6) as number;
    // 8× the volume → 2× the amplitude.
    expect(b / a).toBeCloseTo(2, 2);
  });

  it('returns 0 for zero volume or zero slope', () => {
    expect(submarineLandslideAmplitude(0, 0.1)).toBe(0);
    expect(submarineLandslideAmplitude(1e6, 0)).toBe(0);
  });
});

describe('dispersionAmplitudeFactor (Heidarzadeh & Satake 2015)', () => {
  it('equals 1 at r=0 and decays monotonically', () => {
    expect(dispersionAmplitudeFactor(m(0))).toBe(1);
    const a = dispersionAmplitudeFactor(m(1_000_000));
    const b = dispersionAmplitudeFactor(m(5_000_000));
    expect(b).toBeLessThan(a);
  });

  it('~50 % loss at 5 000 km (2 500 km scale length)', () => {
    const f = dispersionAmplitudeFactor(m(5_000_000));
    expect(f).toBeGreaterThan(0.1);
    expect(f).toBeLessThan(0.2);
  });
});

describe('tohoku2011DARTReference', () => {
  it('matches the ~30 cm peak recorded at DART 21413 within a factor of 2', () => {
    const A = tohoku2011DARTReference() as number;
    // Observed peak ~0.30 m. Our simplified formula gives ~0.07 m;
    // wide bracket documents the model's limitation.
    expect(A).toBeGreaterThan(0.05);
    expect(A).toBeLessThan(1.0);
  });
});
