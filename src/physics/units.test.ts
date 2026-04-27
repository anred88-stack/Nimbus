import { describe, expect, it } from 'vitest';
import { J, Mt, joulesToMegatons, kg, m, megatonsToJoules, mps, s } from './units.js';

describe('branded unit constructors', () => {
  it('preserve numeric value unchanged', () => {
    expect(kg(42) as number).toBe(42);
    expect(m(100) as number).toBe(100);
    expect(s(3.14) as number).toBe(3.14);
    expect(mps(299_792_458) as number).toBe(299_792_458);
    expect(J(4.184e15) as number).toBe(4.184e15);
    expect(Mt(1) as number).toBe(1);
  });

  it('accept zero and negative inputs (caller validates domain)', () => {
    expect(kg(0) as number).toBe(0);
    expect(m(-1) as number).toBe(-1);
  });
});

describe('megaton ↔ joule conversion', () => {
  // 1 Mt TNT ≡ 4.184e15 J (definition).
  // Hiroshima ≈ 15 kt = 0.015 Mt ≈ 6.276e13 J.
  // Tsar Bomba ≈ 50 Mt ≈ 2.092e17 J.
  it('1 Mt equals 4.184e15 J exactly', () => {
    expect(megatonsToJoules(Mt(1)) as number).toBeCloseTo(4.184e15, -10);
  });

  it('15 kt (Hiroshima-scale) equals ≈6.276e13 J within 0.1 %', () => {
    const hiroshimaJ = megatonsToJoules(Mt(0.015)) as number;
    expect(hiroshimaJ).toBeCloseTo(6.276e13, -10);
    expect(Math.abs(hiroshimaJ - 6.276e13) / 6.276e13).toBeLessThan(1e-3);
  });

  it('round-trips Mt → J → Mt within floating-point epsilon', () => {
    for (const input of [0.001, 0.015, 1, 50, 100]) {
      const roundTripped = joulesToMegatons(megatonsToJoules(Mt(input))) as number;
      expect(roundTripped).toBeCloseTo(input, 10);
    }
  });

  it('inverse is exact: joulesToMegatons(megatonsToJoules(x)) === x (for IEEE-safe inputs)', () => {
    const x = Mt(42);
    const back = joulesToMegatons(megatonsToJoules(x)) as number;
    expect(back).toBeCloseTo(42, 12);
  });
});
