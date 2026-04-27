import { describe, expect, it } from 'vitest';
import { m } from '../units.js';
import {
  ejectaBlanketOuterEdge,
  ejectaThickness,
  ejectaThicknessAt10R,
  ejectaThicknessAt2R,
} from './ejecta.js';

describe('ejectaThickness (McGetchin 1973 / Collins 2005 Eq. 28)', () => {
  it('is zero inside the crater', () => {
    expect(ejectaThickness(m(100), m(500))).toBe(0);
    expect(ejectaThickness(m(500), m(500))).toBe(0);
  });

  it('equals 0.14·R at the crater rim edge (r = R + ε)', () => {
    // Just outside the rim: ratio ≈ 1, T ≈ 0.14·R
    const r = m(1_000);
    const R = m(1_000);
    const justOutside = m((r as number) + 1);
    const t = ejectaThickness(justOutside, R) as number;
    expect(t).toBeGreaterThan(0.139 * 1_000);
    expect(t).toBeLessThan(0.141 * 1_000);
  });

  it('drops with the inverse cube of distance', () => {
    // T(2R) / T(4R) should be 8 (since (R/r)^3)
    const R = m(1_000);
    const t2R = ejectaThickness(m(2_000), R) as number;
    const t4R = ejectaThickness(m(4_000), R) as number;
    expect(t2R / t4R).toBeCloseTo(8, 5);
  });

  it('matches published Chicxulub far-field thickness (~1 mm at ~18 000 km)', () => {
    // Chicxulub final crater ~165 km → R ≈ 82 500 m.
    // At the antipode (r ≈ 20 000 km) thickness is ~0.1 mm, well
    // within order-of-magnitude of the K-Pg boundary layer.
    const R = m(82_500);
    const r = m(18_000_000);
    const t = ejectaThickness(r, R) as number;
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(0.01); // < 10 mm
  });
});

describe('ejectaThicknessAt2R / ejectaThicknessAt10R', () => {
  it('produce the expected ratio (2R is 125× thicker than 10R)', () => {
    // T(2R)/T(10R) = (10/2)^3 = 125
    const R = m(5_000);
    const t2R = ejectaThicknessAt2R(R) as number;
    const t10R = ejectaThicknessAt10R(R) as number;
    expect(t2R / t10R).toBeCloseTo(125, 4);
  });
});

describe('ejectaBlanketOuterEdge', () => {
  it('expands with larger crater radius', () => {
    const small = ejectaBlanketOuterEdge(m(100)) as number;
    const big = ejectaBlanketOuterEdge(m(100_000)) as number;
    expect(big).toBeGreaterThan(small);
  });

  it('inverts ejectaThickness: T(outerEdge, R) = minThickness', () => {
    const R = m(10_000);
    const minT = m(0.001);
    const outer = ejectaBlanketOuterEdge(R, minT);
    const t = ejectaThickness(outer, R) as number;
    expect(t).toBeCloseTo(0.001, 6);
  });

  it('Chicxulub blanket reaches several thousand km at 1 mm threshold', () => {
    // R = 82 500 m; outer edge at 1 mm: r = R · (0.14 · R / 0.001)^(1/3)
    const R = m(82_500);
    const outer = ejectaBlanketOuterEdge(R, m(0.001)) as number;
    expect(outer).toBeGreaterThan(15_000_000); // > 15 000 km
    expect(outer).toBeLessThan(25_000_000); // < 25 000 km
  });
});
