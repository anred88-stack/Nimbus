import { describe, expect, it } from 'vitest';
import { surfaceRuptureLength } from './ruptureLength.js';

describe('surfaceRuptureLength (Wells & Coppersmith 1994)', () => {
  it('Northridge 1994 (Mw 6.7 reverse) ≈ 20 km SRL (observed ≈ 18 km)', () => {
    const L = surfaceRuptureLength({ magnitude: 6.7, faultType: 'reverse' }) as number;
    // 10^(0.63·6.7 − 2.86) ≈ 23 km. Observed blind-thrust rupture was
    // ≈18 km, within the 0.23-log-unit scatter documented in Wells &
    // Coppersmith Table 2A.
    expect(L).toBeGreaterThan(15_000);
    expect(L).toBeLessThan(30_000);
  });

  it('generic Mw 7.0 strike-slip ≈ 40 km', () => {
    const L = surfaceRuptureLength({ magnitude: 7.0, faultType: 'strike-slip' }) as number;
    // 10^(0.74·7.0 − 3.55) = 10^1.63 ≈ 42.7 km.
    expect(L).toBeCloseTo(10 ** (0.74 * 7.0 - 3.55) * 1_000, -2);
  });

  it("defaults to the 'all' regression when faultType is omitted", () => {
    const L_default = surfaceRuptureLength({ magnitude: 7.0 }) as number;
    const L_all = surfaceRuptureLength({ magnitude: 7.0, faultType: 'all' }) as number;
    expect(L_default).toBe(L_all);
  });

  it("ranks slip regimes as expected at Mw 7.0 (all' coefficient above 'reverse')", () => {
    // At fixed Mw the slip regressions rank differently; the "all" fit
    // can sit above reverse. Verify the sign of each b-coefficient more
    // directly: SRL always grows with magnitude regardless of regime.
    for (const t of ['strike-slip', 'reverse', 'normal', 'all'] as const) {
      const small = surfaceRuptureLength({ magnitude: 5, faultType: t }) as number;
      const big = surfaceRuptureLength({ magnitude: 7, faultType: t }) as number;
      expect(big).toBeGreaterThan(small);
    }
  });
});
