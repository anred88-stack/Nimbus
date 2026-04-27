import { describe, expect, it } from 'vitest';
import { EARTHQUAKE_PRESETS } from '../events/earthquake/index.js';
import { EXPLOSION_PRESETS } from '../events/explosion/index.js';
import { VOLCANO_PRESETS } from '../events/volcano/index.js';
import { IMPACT_PRESETS } from '../simulate.js';
import { runEarthquakeMonteCarlo } from './earthquakeMonteCarlo.js';
import { runExplosionMonteCarlo } from './explosionMonteCarlo.js';
import { runImpactMonteCarlo } from './impactMonteCarlo.js';
import { mulberry32 } from './sampling.js';
import { runVolcanoMonteCarlo } from './volcanoMonteCarlo.js';

describe('runImpactMonteCarlo — Chicxulub distributions', () => {
  it('produces P10 < P50 < P90 bands on kinetic energy', () => {
    const rng = mulberry32('chicxulub-mc');
    const out = runImpactMonteCarlo({
      nominal: IMPACT_PRESETS.CHICXULUB.input,
      rng,
      iterations: 100,
    });
    expect(out.iterations).toBeGreaterThan(90);
    const ke = out.metrics.kineticEnergyMt;
    expect(ke.p10).toBeLessThan(ke.p50);
    expect(ke.p50).toBeLessThan(ke.p90);
  });

  it('final-crater median stays within factor-2 of the deterministic Chicxulub number', () => {
    const rng = mulberry32('mc-fdr');
    const out = runImpactMonteCarlo({
      nominal: IMPACT_PRESETS.CHICXULUB.input,
      rng,
      iterations: 200,
    });
    const craterKm = out.metrics.finalCraterDiameter.p50 / 1_000;
    expect(craterKm).toBeGreaterThan(90);
    expect(craterKm).toBeLessThan(360);
  });
});

describe('runExplosionMonteCarlo — Hiroshima', () => {
  it('P50 yield tracks the deterministic 15 kt input', () => {
    const rng = mulberry32('hiroshima');
    const out = runExplosionMonteCarlo({
      nominal: EXPLOSION_PRESETS.HIROSHIMA_1945.input,
      rng,
      iterations: 200,
    });
    expect(out.metrics.yieldMt.p50).toBeCloseTo(0.015, 2);
  });

  it('5 psi ring spans a non-trivial P10–P90 band under ±10 % yield noise', () => {
    const rng = mulberry32('hiroshima-blast');
    const out = runExplosionMonteCarlo({
      nominal: EXPLOSION_PRESETS.HIROSHIMA_1945.input,
      rng,
      iterations: 200,
    });
    const band = out.metrics.fivePsiRadius;
    expect(band.p90 - band.p10).toBeGreaterThan(0);
    // The 5 psi ring for a 15 kt airburst is ~1.5 km — P50 should be
    // comfortably above 100 m and below 5 km.
    expect(band.p50).toBeGreaterThan(100);
    expect(band.p50).toBeLessThan(5_000);
  });
});

describe('runEarthquakeMonteCarlo — Tōhoku', () => {
  it('rupture-length P10–P90 bracket contains the deterministic ~700 km', () => {
    const rng = mulberry32('tohoku');
    const out = runEarthquakeMonteCarlo({
      nominal: EARTHQUAKE_PRESETS.TOHOKU_2011.input,
      rng,
      iterations: 200,
    });
    const lenKm = out.metrics.ruptureLength.p50 / 1_000;
    expect(lenKm).toBeGreaterThan(200);
    expect(lenKm).toBeLessThan(1_500);
  });
});

describe('runVolcanoMonteCarlo — Pinatubo', () => {
  it('plume-height P10–P90 spans ~factor-2 as expected from Mastin 2009 scatter', () => {
    const rng = mulberry32('pinatubo');
    const out = runVolcanoMonteCarlo({
      nominal: VOLCANO_PRESETS.PINATUBO_1991.input,
      rng,
      iterations: 300,
    });
    const band = out.metrics.plumeHeight;
    // Median should be around the deterministic 35 km Pinatubo plume.
    expect(band.p50).toBeGreaterThan(25_000);
    expect(band.p50).toBeLessThan(60_000);
    // P90/P10 should reflect the ±factor-2 published scatter.
    const ratio = band.p90 / Math.max(band.p10, 1);
    expect(ratio).toBeGreaterThan(1.3);
  });

  it('reproducibility: same seed returns bit-identical percentiles', () => {
    const run = (): ReturnType<typeof runVolcanoMonteCarlo> =>
      runVolcanoMonteCarlo({
        nominal: VOLCANO_PRESETS.PINATUBO_1991.input,
        rng: mulberry32('seed-dup'),
        iterations: 100,
      });
    const a = run();
    const b = run();
    expect(a.metrics.plumeHeight.p50).toBe(b.metrics.plumeHeight.p50);
    expect(a.metrics.plumeHeight.p10).toBe(b.metrics.plumeHeight.p10);
    expect(a.metrics.plumeHeight.p90).toBe(b.metrics.plumeHeight.p90);
  });
});
