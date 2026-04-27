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

  it('Anak Krakatau 2018 preset emits a flank-collapse tsunami in the 10–80 m source band', () => {
    const r = simulateVolcano(VOLCANO_PRESETS.ANAK_KRAKATAU_2018.input);
    expect(r.tsunami).toBeDefined();
    if (!r.tsunami) return;
    // Watts 2000-style fit: η = 0.10 · V^(1/3) · sin(θ) gives
    // ≈ 0.10 · (2.7e8)^(1/3) · sin(20°) ≈ 22 m. The published Grilli
    // 2019 source amplitude is ≈ 85 m — the model underestimates by
    // a factor of ~4, which is within the published landslide-tsunami
    // scatter envelope (Tappin 2017).
    expect(r.tsunami.sourceAmplitude as number).toBeGreaterThan(10);
    expect(r.tsunami.sourceAmplitude as number).toBeLessThan(80);
  });

  it('Krakatau 1883 preset emits a caldera-collapse tsunami in the 100–500 m source band', () => {
    const r = simulateVolcano(VOLCANO_PRESETS.KRAKATAU_1883.input);
    expect(r.tsunami).toBeDefined();
    if (!r.tsunami) return;
    // η = 0.10 · (2.5e10)^(1/3) · sin(45°) ≈ 207 m at the source.
    expect(r.tsunami.sourceAmplitude as number).toBeGreaterThan(100);
    expect(r.tsunami.sourceAmplitude as number).toBeLessThan(500);
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
