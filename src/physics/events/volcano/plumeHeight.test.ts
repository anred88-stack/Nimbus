import { describe, expect, it } from 'vitest';
import { m as meters } from '../../units.js';
import {
  massEruptionRateFromPlume,
  plumeHeight,
  volumeEruptionRateFromPlume,
} from './plumeHeight.js';

describe('plumeHeight (Mastin et al. 2009, Eq. 1)', () => {
  it('Krakatoa-class V̇ ≈ 2 × 10⁵ m³/s → plume within ±50 % of observed ~40 km', () => {
    const H = plumeHeight({ volumeEruptionRate: 2e5 }) as number;
    // Mastin 2009 Fig. 2 shows a ±factor-2 scatter on real eruption
    // data around the fitted median; Aubry et al. (2023) GRL confirms
    // the same 1σ band. Honest tolerance is the full published scatter,
    // not the nominal fit — expected observational range 20–60 km.
    const observed = 40_000;
    expect(Math.abs(H - observed) / observed).toBeLessThan(0.5);
  });

  it('Mt St. Helens 1980 V̇ ≈ 4 × 10³ m³/s → plume within ±50 % of observed ~15 km', () => {
    const H = plumeHeight({ volumeEruptionRate: 4e3 }) as number;
    // Time-averaged peak plume 14–19 km per USGS Open-File 81-250.
    const observed = 15_000;
    expect(Math.abs(H - observed) / observed).toBeLessThan(0.5);
  });

  it('grows with the Mastin exponent 0.241', () => {
    const low = plumeHeight({ volumeEruptionRate: 1e3 }) as number;
    const high = plumeHeight({ volumeEruptionRate: 1e6 }) as number;
    // 1000× the volume rate → 1000^0.241 ≈ 5.24× the height.
    expect(high / low).toBeCloseTo(1000 ** 0.241, 6);
  });
});

describe('volumeEruptionRateFromPlume (inverse of Mastin 2009)', () => {
  it('round-trips to the original V̇ within floating-point epsilon', () => {
    for (const Vdot of [10, 1_000, 100_000, 1e7]) {
      const back = volumeEruptionRateFromPlume(plumeHeight({ volumeEruptionRate: Vdot }));
      expect(back).toBeCloseTo(Vdot, 4);
    }
  });

  it('40 km plume implies ≈ 2.5 × 10⁵ m³/s (Krakatoa-class)', () => {
    const V = volumeEruptionRateFromPlume(meters(40_000));
    expect(V).toBeGreaterThan(1.5e5);
    expect(V).toBeLessThan(4e5);
  });
});

describe('massEruptionRateFromPlume', () => {
  it('applies the DRE density (2 500 kg/m³) by default', () => {
    const Vdot = volumeEruptionRateFromPlume(meters(10_000));
    const Mdot = massEruptionRateFromPlume(meters(10_000));
    expect(Mdot).toBeCloseTo(Vdot * 2_500, 3);
  });
});
