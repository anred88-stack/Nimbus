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

  it('impact cascade for Chicxulub reaches the long-term phase (year+ scale)', () => {
    const result = simulateImpact(IMPACT_PRESETS.CHICXULUB.input);
    const stages = buildImpactCascade(result);
    const keys = stages.map((s) => s.key);
    // Phase 2 / 3 long-range additions
    expect(keys).toContain('cascade.impact.ejectaReentry');
    expect(keys).toContain('cascade.impact.impactWinter');
    // Phase 3 (EXTINCTION-tier only): photosynthesis collapse
    expect(keys).toContain('cascade.impact.photoCollapse');
    // Phase 4 long-term consequences
    expect(keys).toContain('cascade.impact.oceanAcidification');
    expect(keys).toContain('cascade.impact.planktonCollapse');
    expect(keys).toContain('cascade.impact.co2Warming');
    expect(keys).toContain('cascade.impact.massExtinction');
  });

  it('impact cascade for Tunguska stays in the immediate / short-term phases', () => {
    const result = simulateImpact(IMPACT_PRESETS.TUNGUSKA.input);
    const stages = buildImpactCascade(result);
    const longTermStages = stages.filter((s) => s.phase === 'longTerm');
    expect(longTermStages).toHaveLength(0);
    const keys = stages.map((s) => s.key);
    expect(keys).not.toContain('cascade.impact.ejectaReentry');
    expect(keys).not.toContain('cascade.impact.impactWinter');
    expect(keys).not.toContain('cascade.impact.massExtinction');
  });

  it('every cascade stage carries a phase that matches its onset bucket', () => {
    const result = simulateImpact(IMPACT_PRESETS.CHICXULUB.input);
    const stages = buildImpactCascade(result);
    for (const s of stages) {
      const t = s.onset as number;
      if (t < 60) expect(s.phase).toBe('immediate');
      else if (t < 86_400) expect(s.phase).toBe('shortTerm');
      else if (t < 86_400 * 365) expect(s.phase).toBe('mediumTerm');
      else expect(s.phase).toBe('longTerm');
    }
  });

  it('explosion cascade for Tsar Bomba (> 50 Mt) adds the nuclear-winter stage', () => {
    const result = simulateExplosion(EXPLOSION_PRESETS.TSAR_BOMBA_1961.input);
    const stages = buildExplosionCascade(result);
    expect(stages.map((s) => s.key)).toContain('cascade.explosion.nuclearWinter');
  });

  it('explosion cascade for Hiroshima (< 50 Mt) omits the nuclear-winter stage', () => {
    const result = simulateExplosion(EXPLOSION_PRESETS.HIROSHIMA_1945.input);
    const stages = buildExplosionCascade(result);
    expect(stages.map((s) => s.key)).not.toContain('cascade.explosion.nuclearWinter');
  });

  it('volcano cascade for Tambora (VEI 7) adds the year-without-summer stage', () => {
    const result = simulateVolcano(VOLCANO_PRESETS.TAMBORA_1815.input);
    const stages = buildVolcanoCascade(result);
    expect(stages.map((s) => s.key)).toContain('cascade.volcano.yearWithoutSummer');
  });

  it('volcano cascade for Krakatau (VEI 6) omits the year-without-summer stage', () => {
    const result = simulateVolcano(VOLCANO_PRESETS.KRAKATAU_1883.input);
    const stages = buildVolcanoCascade(result);
    expect(stages.map((s) => s.key)).not.toContain('cascade.volcano.yearWithoutSummer');
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
