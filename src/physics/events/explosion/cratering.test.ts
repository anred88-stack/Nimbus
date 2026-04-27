import { describe, expect, it } from 'vitest';
import { Mt, megatonsToJoules } from '../../units.js';
import { NUCLEAR_CRATER_COEFFICIENT, nuclearApparentCraterDiameter } from './cratering.js';

describe('nuclearApparentCraterDiameter (Glasstone & Dolan 1977, §6.70)', () => {
  it('default firm-ground coefficient gives ≈477 m crater for a 1 Mt contact burst', () => {
    const D = nuclearApparentCraterDiameter({ yieldEnergy: megatonsToJoules(Mt(1)) }) as number;
    // K = 60, W_kt = 1000 → D = 60 × 1000^0.3 ≈ 476.6 m.
    expect(D).toBeCloseTo(60 * 1000 ** 0.3, 3);
  });

  it('respects the chosen ground preset (hard rock < firm < dry < wet)', () => {
    const yieldJ = megatonsToJoules(Mt(1));
    const hard = nuclearApparentCraterDiameter({
      yieldEnergy: yieldJ,
      groundCoefficient: NUCLEAR_CRATER_COEFFICIENT.HARD_ROCK,
    }) as number;
    const firm = nuclearApparentCraterDiameter({
      yieldEnergy: yieldJ,
      groundCoefficient: NUCLEAR_CRATER_COEFFICIENT.FIRM_GROUND,
    }) as number;
    const dry = nuclearApparentCraterDiameter({
      yieldEnergy: yieldJ,
      groundCoefficient: NUCLEAR_CRATER_COEFFICIENT.DRY_SOIL,
    }) as number;
    const wet = nuclearApparentCraterDiameter({
      yieldEnergy: yieldJ,
      groundCoefficient: NUCLEAR_CRATER_COEFFICIENT.WET_SOIL,
    }) as number;
    expect(hard).toBeLessThan(firm);
    expect(firm).toBeLessThan(dry);
    expect(dry).toBeLessThan(wet);
  });

  it('scales as W^0.3: 1 000× the yield → ≈ 7.94× the diameter', () => {
    const small = nuclearApparentCraterDiameter({
      yieldEnergy: megatonsToJoules(Mt(0.001)), // 1 kt
    }) as number;
    const big = nuclearApparentCraterDiameter({
      yieldEnergy: megatonsToJoules(Mt(1)), // 1 Mt = 1000 kt
    }) as number;
    expect(big / small).toBeCloseTo(1000 ** 0.3, 8);
  });

  it('Castle-Bravo-class (15 Mt, wet coral) predicts a 1.5–2 km crater', () => {
    // K = 92, W = 15 000 kt → 92 × 15 000^0.3 ≈ 1 647 m. The measured
    // Castle Bravo crater is ≈1 890 m rim-to-rim; the formula
    // under-predicts by ≈13 %, well within the ±30 % empirical scatter
    // band documented for these fits (Glasstone & Dolan 1977 Fig. 6.70
    // alongside Nordyke 1977 alluvium data).
    const D = nuclearApparentCraterDiameter({
      yieldEnergy: megatonsToJoules(Mt(15)),
      groundCoefficient: NUCLEAR_CRATER_COEFFICIENT.WET_SOIL,
    }) as number;
    expect(D).toBeGreaterThan(1_500);
    expect(D).toBeLessThan(2_000);
  });
});
