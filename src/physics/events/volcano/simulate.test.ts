import { describe, expect, it } from 'vitest';
import { DRE_DENSITY } from '../../constants.js';
import { VOLCANO_PRESETS, simulateVolcano } from './simulate.js';

describe('simulateVolcano', () => {
  it('Krakatau 1883 preset → ≈ 38 km plume, VEI 6, ≈ 27 km runout', () => {
    const r = simulateVolcano(VOLCANO_PRESETS.KRAKATAU_1883.input);
    // All three come from cited formulas — cross-check the composition.
    expect(r.plumeHeight as number).toBeGreaterThan(35_000);
    expect(r.plumeHeight as number).toBeLessThan(45_000);
    expect(r.vei).toBe(6);
    expect(r.pyroclasticRunout as number).toBeGreaterThan(22_000);
    expect(r.pyroclasticRunout as number).toBeLessThan(32_000);
  });

  it('Mt St Helens 1980 preset → VEI 5', () => {
    const r = simulateVolcano(VOLCANO_PRESETS.MT_ST_HELENS_1980.input);
    expect(r.vei).toBe(5);
  });

  it('Tambora 1815 preset → VEI 7 and ≈ 50 km runout', () => {
    const r = simulateVolcano(VOLCANO_PRESETS.TAMBORA_1815.input);
    expect(r.vei).toBe(7);
    expect(r.pyroclasticRunout as number).toBeGreaterThan(45_000);
    expect(r.pyroclasticRunout as number).toBeLessThan(60_000);
  });

  it('applies DRE_DENSITY to convert V̇ → mass eruption rate', () => {
    const r = simulateVolcano({ volumeEruptionRate: 1_000, totalEjectaVolume: 1e9 });
    expect(r.massEruptionRate).toBeCloseTo(1_000 * (DRE_DENSITY as number), 3);
  });

  it('preserves inputs in the result blob', () => {
    const input = VOLCANO_PRESETS.KRAKATAU_1883.input;
    expect(simulateVolcano(input).inputs).toBe(input);
  });

  it('Mt St Helens preset emits a lateral-blast envelope ≈ 4× the PDC runout', () => {
    const r = simulateVolcano(VOLCANO_PRESETS.MT_ST_HELENS_1980.input);
    expect(r.lateralBlast).toBeDefined();
    if (!r.lateralBlast) return;
    expect(r.lateralBlast.runout as number).toBeGreaterThan(
      4 * (r.pyroclasticRunout as number) - 1
    );
    expect(r.lateralBlast.directionDeg).toBe(0);
    expect(r.lateralBlast.sectorAngleDeg).toBe(180);
    // 180° wedge area = ½ · π · r² (half disk).
    const expectedArea =
      Math.PI * (r.lateralBlast.runout as number) * (r.lateralBlast.runout as number) * 0.5;
    expect(r.lateralBlast.area as number).toBeCloseTo(expectedArea, -1);
  });

  it('Krakatau preset emits no lateral blast (no flag)', () => {
    const r = simulateVolcano(VOLCANO_PRESETS.KRAKATAU_1883.input);
    expect(r.lateralBlast).toBeUndefined();
  });

  it('Anak Krakatau 2018 preset matches the Grilli 2019 source amplitude (~85 m)', () => {
    const r = simulateVolcano(VOLCANO_PRESETS.ANAK_KRAKATAU_2018.input);
    expect(r.tsunami).toBeDefined();
    if (!r.tsunami) return;
    // Subaerial K=0.4 calibration → η = 0.4·647·sin(20°) ≈ 88 m, capped
    // at 200·0.4 = 80 m. Matches Grilli 2019 within ~6 %.
    expect(r.tsunami.sourceAmplitude as number).toBeGreaterThan(60);
    expect(r.tsunami.sourceAmplitude as number).toBeLessThan(100);
  });

  it('Krakatau 1883 caldera-collapse tsunami source ≤ 40 m (depth-saturation cap)', () => {
    const r = simulateVolcano(VOLCANO_PRESETS.KRAKATAU_1883.input);
    expect(r.tsunami).toBeDefined();
    if (!r.tsunami) return;
    // Raw Watts 0.4·(2.5e10)^(1/3)·sin(45°) ≈ 827 m would be unphysical
    // in 50 m of water. The 40 % wave-breaking cap clamps to 20 m, in
    // the right order of magnitude vs Self 1992 / Maeno & Imamura 2011
    // (coastal runup 30-40 m on Sunda Strait, source ~10-30 m before
    // shoaling).
    expect(r.tsunami.sourceAmplitude as number).toBeGreaterThan(5);
    expect(r.tsunami.sourceAmplitude as number).toBeLessThan(40);
  });

  it('Mt St Helens preset has no flankCollapse → no tsunami', () => {
    const r = simulateVolcano(VOLCANO_PRESETS.MT_ST_HELENS_1980.input);
    expect(r.tsunami).toBeUndefined();
  });

  it('every VOLCANO_PRESETS entry simulates without throwing and produces a positive plume', () => {
    // Smoke test for newly-added presets (Vesuvius, Etna, Hunga Tonga,
    // Eyjafjallajökull, Mount Pelée). The Mastin et al. 2009 plume-
    // height fit returns a positive plume for any positive eruption rate.
    for (const [id, preset] of Object.entries(VOLCANO_PRESETS)) {
      const r = simulateVolcano(preset.input);
      expect(r.vei, `${id}: VEI ≥ 0`).toBeGreaterThanOrEqual(0);
      expect(r.plumeHeight as number, `${id}: plume > 0`).toBeGreaterThan(0);
    }
  });
});
