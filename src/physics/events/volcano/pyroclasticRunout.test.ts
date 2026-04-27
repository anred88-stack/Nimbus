import { describe, expect, it } from 'vitest';
import { pyroclasticRunout } from './pyroclasticRunout.js';

describe('pyroclasticRunout (Sheridan 1979 H/L mobility)', () => {
  it('Mt St Helens 1980 (V ≈ 1.2 km³) → runout ≈ 10 km (observed 6–10 km)', () => {
    const L = pyroclasticRunout({ ejectaVolume: 1.2e9 }) as number;
    // 10 · 1.2^(1/3) km ≈ 10.6 km. Observed PDCs reached 6–10 km from
    // the vent — our value is at the upper edge of that envelope.
    expect(L).toBeGreaterThan(8_000);
    expect(L).toBeLessThan(13_000);
  });

  it('Krakatoa 1883 (V ≈ 20 km³) → runout ≈ 27 km (base surges reached 40 km)', () => {
    const L = pyroclasticRunout({ ejectaVolume: 2e10 }) as number;
    // 10 · 20^(1/3) km ≈ 27 km. Observed base surges carried across
    // the Sunda Strait (~40 km) but the dense-flow runout is captured.
    expect(L).toBeGreaterThan(22_000);
    expect(L).toBeLessThan(32_000);
  });

  it('Tambora 1815 (V ≈ 140 km³) → runout ≈ 52 km', () => {
    const L = pyroclasticRunout({ ejectaVolume: 1.4e11 }) as number;
    // 10 · 140^(1/3) km ≈ 52 km. Observed Tambora PDC reach ~40 km.
    expect(L).toBeGreaterThan(45_000);
    expect(L).toBeLessThan(60_000);
  });

  it('scales as V^(1/3) (1 000× volume → 10× runout)', () => {
    const small = pyroclasticRunout({ ejectaVolume: 1e6 }) as number;
    const big = pyroclasticRunout({ ejectaVolume: 1e9 }) as number;
    expect(big / small).toBeCloseTo(10, 6);
  });

  it('honours a user-supplied mobility coefficient', () => {
    const defaultRun = pyroclasticRunout({ ejectaVolume: 1e10 }) as number;
    const lowerK = pyroclasticRunout({ ejectaVolume: 1e10, mobilityCoefficient: 5 }) as number;
    expect(lowerK / defaultRun).toBeCloseTo(0.5, 10);
  });

  it('returns 0 for non-positive volumes', () => {
    expect(pyroclasticRunout({ ejectaVolume: 0 }) as number).toBe(0);
  });
});
