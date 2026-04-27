import { describe, expect, it } from 'vitest';
import { m } from '../../units.js';
import { EXPLOSION_PRESETS, simulateExplosion } from './simulate.js';

describe('simulateExplosion — composition', () => {
  it('Hiroshima 15 kt: 1 psi ring in the 2–5 km band, 3rd-degree burn ≈ 2–3 km', () => {
    const r = simulateExplosion(EXPLOSION_PRESETS.HIROSHIMA_1945.input);
    expect(r.yield.kilotons).toBe(15);
    // 1 psi for 15 kt surface-burst Kinney–Graham ≈ 3.3 km (see existing
    // damage-rings tests); generous band covers the ±10 % modelling
    // scatter vs observed airburst-optimised historical figures.
    expect(r.blast.overpressure1psiRadius as number).toBeGreaterThan(2_000);
    expect(r.blast.overpressure1psiRadius as number).toBeLessThan(5_000);
    // Burn radius ≈ 2.3 km unshielded (see thermal.test.ts).
    expect(r.thermal.thirdDegreeBurnRadius as number).toBeGreaterThan(2_000);
    expect(r.thermal.thirdDegreeBurnRadius as number).toBeLessThan(3_000);
  });

  it('Castle Bravo 15 Mt (wet coral) opens a ~1.5–2 km apparent crater', () => {
    const r = simulateExplosion(EXPLOSION_PRESETS.CASTLE_BRAVO_1954.input);
    expect(r.yield.megatons).toBe(15);
    expect(r.crater.apparentDiameter as number).toBeGreaterThan(1_500);
    expect(r.crater.apparentDiameter as number).toBeLessThan(2_000);
  });

  it('Tsar Bomba 50 Mt: 1 psi ring ≈ 45–60 km (surface-burst envelope)', () => {
    const r = simulateExplosion(EXPLOSION_PRESETS.TSAR_BOMBA_1961.input);
    // K–G surface burst gives ≈ 49 km at 50 Mt. Tsar Bomba's observed
    // 900 km window-breakage range was a tropospheric-duct artefact
    // of the high-altitude airburst, not the surface-burst envelope
    // this formula describes.
    expect(r.blast.overpressure1psiRadius as number).toBeGreaterThan(40_000);
    expect(r.blast.overpressure1psiRadius as number).toBeLessThan(65_000);
  });

  it('One-megaton reference has a 5 psi ring an order of magnitude bigger than Hiroshima', () => {
    const hiroshima = simulateExplosion(EXPLOSION_PRESETS.HIROSHIMA_1945.input);
    const oneMt = simulateExplosion(EXPLOSION_PRESETS.ONE_MEGATON.input);
    // Yield ratio ≈ 67 → radius ratio ≈ 67^(1/3) ≈ 4.06 for a pure
    // cube-root formula. K–G bends the curve a bit, so we check for
    // at least 3× rather than the exact algebraic value.
    expect(
      (oneMt.blast.overpressure5psiRadius as number) /
        (hiroshima.blast.overpressure5psiRadius as number)
    ).toBeGreaterThan(3);
  });

  it('defaults groundType to FIRM_GROUND when omitted', () => {
    const defaultCrater = simulateExplosion({ yieldMegatons: 1 }).crater.apparentDiameter;
    const explicit = simulateExplosion({
      yieldMegatons: 1,
      groundType: 'FIRM_GROUND',
    }).crater.apparentDiameter;
    expect(defaultCrater).toBe(explicit);
  });

  it('preserves inputs in the result blob', () => {
    const input = EXPLOSION_PRESETS.HIROSHIMA_1945.input;
    expect(simulateExplosion(input).inputs).toBe(input);
  });

  it('land burst (no waterDepth) emits no tsunami block', () => {
    const r = simulateExplosion(EXPLOSION_PRESETS.HIROSHIMA_1945.input);
    expect(r.tsunami).toBeUndefined();
  });

  it('underwater burst exposes celerity, wavelength, period, runup and inundation', () => {
    const r = simulateExplosion({
      yieldMegatons: 1,
      groundType: 'WET_SOIL',
      heightOfBurst: m(0),
      waterDepth: m(50),
      meanOceanDepth: m(4_000),
    });
    expect(r.tsunami).toBeDefined();
    if (!r.tsunami) return;
    // c = √(g · 4 000) ≈ 198 m/s.
    expect(r.tsunami.deepWaterCelerity as number).toBeGreaterThan(193);
    expect(r.tsunami.deepWaterCelerity as number).toBeLessThan(203);
    // Wavelength ≈ 2 × cavity. For a 1 Mt coupled burst the cavity
    // sits in the few-hundred-metre range so wavelength is sub-km.
    expect(r.tsunami.sourceWavelength as number).toBeGreaterThan(200);
    expect(r.tsunami.sourceWavelength as number).toBeLessThan(2_000);
    // Period = λ / c, sub-10 s for this scale.
    expect(r.tsunami.dominantPeriod as number).toBeGreaterThan(0);
    expect(r.tsunami.dominantPeriod as number).toBeLessThan(15);
    // Runup is positive and inundation = 100 × runup.
    expect(r.tsunami.runupAt100km as number).toBeGreaterThan(0);
    expect(r.tsunami.inundationDistanceAt100km as number).toBeCloseTo(
      (r.tsunami.runupAt100km as number) * 100,
      3
    );
  });

  it('underwater 1 Mt burst emits a Glasstone-class tsunami source', () => {
    const r = simulateExplosion({
      yieldMegatons: 1,
      groundType: 'WET_SOIL',
      heightOfBurst: m(0),
      waterDepth: m(50),
    });
    expect(r.tsunami).toBeDefined();
    if (!r.tsunami) return;
    // Coupling fraction of 0.08 → equivalent KE = 3.34e14 J →
    // R_C ≈ 350 m, η_0 ≈ 175 m. Check the source amplitude is in the
    // 100–250 m envelope that brackets Glasstone Table 6.50's ≈ 180 m
    // for an optimum-depth 1 Mt burst.
    expect(r.tsunami.sourceAmplitude as number).toBeGreaterThan(100);
    expect(r.tsunami.sourceAmplitude as number).toBeLessThan(250);
    expect(r.tsunami.couplingFraction).toBeCloseTo(0.08, 6);
  });

  it('non-surface burst over water still suppresses the tsunami branch', () => {
    // Hiroshima at 580 m HOB sits in LOW_AIRBURST / OPTIMUM regime
    // depending on yield-scaling. Even with waterDepth > 0, the
    // mechanical coupling is essentially zero — the simulator must
    // skip the underwater-burst cascade for any non-SURFACE detonation.
    const r = simulateExplosion({
      ...EXPLOSION_PRESETS.HIROSHIMA_1945.input,
      waterDepth: m(50),
    });
    expect(r.blast.hobRegime).not.toBe('SURFACE');
    expect(r.tsunami).toBeUndefined();
  });

  it('flags a SURFACE burst on water as a contact-water burst', () => {
    const r = simulateExplosion({
      yieldMegatons: 1,
      groundType: 'WET_SOIL',
      heightOfBurst: m(0),
      waterDepth: m(50),
    });
    expect(r.isContactWaterBurst).toBe(true);
    expect(r.tsunami).toBeDefined();
  });

  it('continental land bursts are not flagged as contact-water', () => {
    const r = simulateExplosion(EXPLOSION_PRESETS.HIROSHIMA_1945.input);
    expect(r.isContactWaterBurst).toBe(false);
  });

  it('airburst over water is not flagged as contact-water', () => {
    // The HOB regime path keeps the energy in the atmosphere; the
    // contact-water branch must not be taken even with waterDepth > 0.
    const r = simulateExplosion({
      ...EXPLOSION_PRESETS.HIROSHIMA_1945.input,
      waterDepth: m(50),
    });
    expect(r.isContactWaterBurst).toBe(false);
  });

  it('every EXPLOSION_PRESETS entry simulates without throwing and matches yield bookkeeping', () => {
    // Smoke test for newly-added presets (Halifax, Texas City, Ivy
    // Mike). yieldKilotons should equal yieldMegatons × 1 000 by
    // definition (see line ~180 of simulate.ts).
    for (const [id, preset] of Object.entries(EXPLOSION_PRESETS)) {
      const r = simulateExplosion(preset.input);
      expect(r.yield.megatons, `${id}: positive yield`).toBeGreaterThan(0);
      expect(r.yield.kilotons, `${id}: kt = Mt × 1000`).toBeCloseTo(r.yield.megatons * 1000, 6);
    }
  });
});
