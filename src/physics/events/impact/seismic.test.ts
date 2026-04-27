import { describe, expect, it } from 'vitest';
import { J, Mt, megatonsToJoules } from '../../units.js';
import { seismicMagnitude, seismicMagnitudeTeanbyWookey } from './seismic.js';

describe('seismicMagnitude (Schultz & Gault 1975)', () => {
  it('gives M ≈ 9.9 for a Chicxulub-class event (3.14 × 10²³ J)', () => {
    const M = seismicMagnitude(J(3.1416e23));
    // 0.67 × log10(3.1416e23) − 5.87 ≈ 9.86
    expect(M).toBeCloseTo(9.86, 1);
  });

  it('gives M ≈ 5.4 for a Tunguska-class airburst (≈15 Mt TNT)', () => {
    // 15 Mt = 6.276 × 10¹⁶ J; M ≈ 5.38. Tunguska shook stations as far as
    // Potsdam but with poor moment-magnitude equivalents in the literature
    // (4.5–5.5 range is typical), so we match the formula's own value.
    const M = seismicMagnitude(megatonsToJoules(Mt(15)));
    expect(M).toBeCloseTo(5.38, 1);
  });

  it('increases by exactly 0.67 per decade of energy', () => {
    const a = seismicMagnitude(J(1e20));
    const b = seismicMagnitude(J(1e21));
    expect(b - a).toBeCloseTo(0.67, 10);
  });
});

describe('seismicMagnitudeTeanbyWookey (Teanby & Wookey 2011)', () => {
  it('sits ≈ 2–3 Mw units below the Schultz & Gault estimate for the same energy', () => {
    const E = J(1e23);
    const mSG = seismicMagnitude(E);
    const mTW = seismicMagnitudeTeanbyWookey(E);
    expect(mSG - mTW).toBeGreaterThan(2);
    expect(mSG - mTW).toBeLessThan(4);
  });

  it('matches Hanks–Kanamori identity when the efficiency is explicit', () => {
    // For E = 1e20 J, k=1e-4 → M0=1e16 → Mw = (2/3)·16 − 6.07 = 4.59.
    const M = seismicMagnitudeTeanbyWookey(J(1e20), 1e-4);
    expect(M).toBeCloseTo(4.59, 1);
  });

  it('scales as (2/3) · log10(E) per decade of energy', () => {
    const a = seismicMagnitudeTeanbyWookey(J(1e20));
    const b = seismicMagnitudeTeanbyWookey(J(1e21));
    expect(b - a).toBeCloseTo(2 / 3, 6);
  });

  it('accepts a custom seismic efficiency (10⁻⁵ to 10⁻³ published band)', () => {
    const low = seismicMagnitudeTeanbyWookey(J(1e23), 1e-5);
    const high = seismicMagnitudeTeanbyWookey(J(1e23), 1e-3);
    // Doubling k by a decade shifts Mw by (2/3) · 1 ≈ 0.67.
    expect(high - low).toBeCloseTo(2 * (2 / 3), 3);
  });

  it('returns 0 for non-positive energy', () => {
    expect(seismicMagnitudeTeanbyWookey(J(0))).toBe(0);
    expect(seismicMagnitudeTeanbyWookey(J(-5))).toBe(0);
  });

  it('Tunguska 15 Mt TNT → Mw ≈ 2.5 with k=1e-4 (observed seismic record was weak)', () => {
    // With 15 Mt → 6.3 × 10¹⁶ J and k = 10⁻⁴: M₀ = 6.3 × 10¹² N·m →
    // Mw = (2/3)·log10(6.3e12) − 6.07 ≈ 2.46. Historical Tunguska
    // seismic trace was faint at Irkutsk (~1 000 km), consistent with
    // a microseismic event of ≈Mw 2–3.
    const M = seismicMagnitudeTeanbyWookey(megatonsToJoules(Mt(15)));
    expect(M).toBeGreaterThan(2);
    expect(M).toBeLessThan(3.5);
  });
});
