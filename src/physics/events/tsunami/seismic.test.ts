import { describe, expect, it } from 'vitest';
import { seismicTsunamiInitialAmplitude } from './seismic.js';

describe('seismicTsunamiInitialAmplitude', () => {
  it('Tohoku-class Mw 9.1 thrust (dip 15°) → initial uplift 5–15 m', () => {
    // Observed free-surface uplift near Japan Trench was in the 5–10 m
    // range (inverted from DART buoys; Saito et al. 2011). Our simplified
    // chain predicts a value in that band for a 15° dip.
    const A = seismicTsunamiInitialAmplitude({
      magnitude: 9.1,
      faultType: 'reverse',
      dipDegrees: 15,
    }) as number;
    expect(A).toBeGreaterThan(5);
    expect(A).toBeLessThan(15);
  });

  it('defaults to 20° dip for subduction thrusts when unspecified', () => {
    const A_default = seismicTsunamiInitialAmplitude({ magnitude: 9, faultType: 'reverse' });
    const A_explicit = seismicTsunamiInitialAmplitude({
      magnitude: 9,
      faultType: 'reverse',
      dipDegrees: 20,
    });
    expect(A_default).toBe(A_explicit);
  });

  it('vanishes for horizontal-slip (dip → 0°) — strike-slip quakes do not uplift the seafloor', () => {
    const A = seismicTsunamiInitialAmplitude({
      magnitude: 8,
      faultType: 'strike-slip',
      dipDegrees: 0,
    }) as number;
    expect(A).toBeCloseTo(0, 10);
  });

  it('grows with magnitude at fixed dip', () => {
    const A7 = seismicTsunamiInitialAmplitude({ magnitude: 7 }) as number;
    const A8 = seismicTsunamiInitialAmplitude({ magnitude: 8 }) as number;
    const A9 = seismicTsunamiInitialAmplitude({ magnitude: 9 }) as number;
    expect(A7).toBeLessThan(A8);
    expect(A8).toBeLessThan(A9);
  });
});
