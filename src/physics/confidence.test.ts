import { describe, expect, it } from 'vitest';
import { bandFor, CONFIDENCE_SIGMA } from './confidence.js';

describe('bandFor', () => {
  it('returns symmetric ±30 % band for firestorm radii', () => {
    const b = bandFor(1_000, 'firestormIgnition');
    expect(b.sigma).toBe(0.3);
    expect(b.low).toBeCloseTo(700, 6);
    expect(b.high).toBeCloseTo(1_300, 6);
  });

  it('returns factor-2 band for ashfall area and lahar runout', () => {
    expect(bandFor(100, 'ashfallArea').high).toBeCloseTo(200, 6);
    expect(bandFor(100, 'laharRunout').low).toBe(0);
  });

  it('returns factor-3 band for tsunami far-field', () => {
    const b = bandFor(10, 'tsunamiWunnemannFarField');
    expect(b.high).toBeCloseTo(30, 6);
  });

  it('collapses to zero on non-positive or non-finite input', () => {
    expect(bandFor(0, 'firestormIgnition').value).toBe(0);
    expect(bandFor(-5, 'plumeHeight').high).toBe(0);
    expect(bandFor(Number.NaN, 'laharRunout').low).toBe(0);
  });

  it('every declared sigma is positive and below 4 (sanity bounds)', () => {
    for (const s of Object.values(CONFIDENCE_SIGMA)) {
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThan(4);
    }
  });
});
