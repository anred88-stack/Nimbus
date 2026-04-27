import { describe, expect, it } from 'vitest';
import {
  buildEarthquakeCascade,
  buildExplosionCascade,
  buildImpactCascade,
  buildVolcanoCascade,
} from './cascade.js';
import { simulateEarthquake } from './events/earthquake/index.js';
import { EXPLOSION_PRESETS, simulateExplosion } from './events/explosion/index.js';
import { VOLCANO_PRESETS, simulateVolcano } from './events/volcano/index.js';
import { IMPACT_PRESETS, simulateImpact } from './simulate.js';

describe('cascade', () => {
  it('impact cascade for Chicxulub contains flash, blast, ejecta, firestorm, atmospheric stages', () => {
    const result = simulateImpact(IMPACT_PRESETS.CHICXULUB.input);
    const stages = buildImpactCascade(result);
    const keys = stages.map((s) => s.key);
    expect(keys).toContain('cascade.impact.flash');
    expect(keys).toContain('cascade.impact.airblast');
    expect(keys).toContain('cascade.impact.ejecta');
    expect(keys).toContain('cascade.impact.firestorm');
    expect(keys).toContain('cascade.impact.stratDust');
    expect(keys).toContain('cascade.impact.climate');
  });

  it('impact cascade for an ocean preset includes the tsunami stage', () => {
    const result = simulateImpact(IMPACT_PRESETS.CHICXULUB_OCEAN.input);
    const stages = buildImpactCascade(result);
    expect(stages.map((s) => s.key)).toContain('cascade.impact.tsunami');
  });

  it('impact cascade for a Tunguska-class event omits the climate stage', () => {
    const result = simulateImpact(IMPACT_PRESETS.TUNGUSKA.input);
    const stages = buildImpactCascade(result);
    expect(stages.map((s) => s.key)).not.toContain('cascade.impact.climate');
  });

  it('impact cascade for Chicxulub includes the liquefaction cross-bridge stage', () => {
    const result = simulateImpact(IMPACT_PRESETS.CHICXULUB.input);
    const stages = buildImpactCascade(result);
    expect(stages.map((s) => s.key)).toContain('cascade.impact.liquefaction');
  });

  it('impact cascade for Tunguska omits the liquefaction stage (Mw too low)', () => {
    const result = simulateImpact(IMPACT_PRESETS.TUNGUSKA.input);
    const stages = buildImpactCascade(result);
    expect(stages.map((s) => s.key)).not.toContain('cascade.impact.liquefaction');
  });

  it('impact cascade is sorted by onset time (non-decreasing)', () => {
    const result = simulateImpact(IMPACT_PRESETS.CHICXULUB.input);
    const stages = buildImpactCascade(result);
    for (let i = 1; i < stages.length; i += 1) {
      expect(stages[i]!.onset).toBeGreaterThanOrEqual(stages[i - 1]!.onset);
    }
  });

  it('explosion cascade for Tsar Bomba adds the fallout stage (yield > 10 Mt)', () => {
    const result = simulateExplosion(EXPLOSION_PRESETS.TSAR_BOMBA_1961.input);
    const stages = buildExplosionCascade(result);
    expect(stages.map((s) => s.key)).toContain('cascade.explosion.falloutPlume');
  });

  it('explosion cascade for Hiroshima (< 10 Mt) omits the fallout plume', () => {
    const result = simulateExplosion(EXPLOSION_PRESETS.HIROSHIMA_1945.input);
    const stages = buildExplosionCascade(result);
    expect(stages.map((s) => s.key)).not.toContain('cascade.explosion.falloutPlume');
  });

  it('earthquake cascade adds a tsunami-risk stage for a large reverse event without subduction flag', () => {
    const result = simulateEarthquake({ magnitude: 9.1, faultType: 'reverse' });
    const stages = buildEarthquakeCascade(result);
    expect(stages.map((s) => s.key)).toContain('cascade.earthquake.tsunamiRisk');
  });

  it('earthquake cascade adds explicit tsunami + run-up stages for subduction-interface events', () => {
    const result = simulateEarthquake({
      magnitude: 9.1,
      faultType: 'reverse',
      subductionInterface: true,
    });
    const stages = buildEarthquakeCascade(result);
    const keys = stages.map((s) => s.key);
    expect(keys).toContain('cascade.earthquake.tsunami');
    expect(keys).toContain('cascade.earthquake.tsunamiRunup');
    expect(keys).not.toContain('cascade.earthquake.tsunamiRisk');
  });

  it('earthquake cascade omits tsunami risk for a mid-size strike-slip quake', () => {
    const result = simulateEarthquake({ magnitude: 6.7, faultType: 'strike-slip' });
    const stages = buildEarthquakeCascade(result);
    expect(stages.map((s) => s.key)).not.toContain('cascade.earthquake.tsunamiRisk');
  });

  it('volcano cascade includes ashfall + aerosol for a VEI 6 event', () => {
    const result = simulateVolcano(VOLCANO_PRESETS.KRAKATAU_1883.input);
    const stages = buildVolcanoCascade(result);
    const keys = stages.map((s) => s.key);
    expect(keys).toContain('cascade.volcano.pdc');
    expect(keys).toContain('cascade.volcano.ashfall');
    expect(keys).toContain('cascade.volcano.aerosol');
  });

  it('volcano cascade for a small eruption omits the aerosol stage', () => {
    const result = simulateVolcano(VOLCANO_PRESETS.MT_ST_HELENS_1980.input);
    const stages = buildVolcanoCascade(result);
    expect(stages.map((s) => s.key)).not.toContain('cascade.volcano.aerosol');
  });
});
