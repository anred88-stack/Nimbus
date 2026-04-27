import { describe, expect, it } from 'vitest';
import { IMPACT_PRESETS } from '../simulate.js';
import { mulberry32 } from './sampling.js';
import { runImpactMonteCarlo } from './impactMonteCarlo.js';

/**
 * Coverage and self-consistency tests for the Monte-Carlo engine, as
 * flagged by the audit (NUM-002). The headline question: is N=200
 * (the popular-science default) actually enough samples to nail the
 * P10/P90 bands within the band width itself?
 *
 * The strategy is to use a high-N reference run as ground truth and
 * compare the production-default run against it:
 *
 *   - Reference: same seed, N=2 000.
 *   - Production: same seed, N=200.
 *
 * Acceptance: the P10/P90 of the 200-sample run lies within 15 % of
 * the P10/P90 of the 2 000-sample reference for the four headline
 * metrics (energy, crater, ejecta edge, firestorm ignition). The 15 %
 * threshold is below the published per-quantity 1σ scatter (see the
 * master table in docs/SCIENCE.md), so a Monte-Carlo bin shift below
 * that is invisible to the user.
 *
 * A separate test asserts seed determinism — re-running the same MC
 * twice with the same seed must yield bit-identical percentiles. This
 * is the contract that lets us hash a seed into a shareable URL.
 *
 * Both tests run on the Tunguska preset because its small size keeps
 * the simulator below 0.5 ms per iteration, so even N=2 000 finishes
 * in well under a second.
 */

const NOMINAL = IMPACT_PRESETS.TUNGUSKA.input;

describe('Monte-Carlo coverage — N=200 vs N=2000 reference (Tunguska)', () => {
  const referenceRng = mulberry32('coverage-reference');
  const reference = runImpactMonteCarlo({
    nominal: NOMINAL,
    rng: referenceRng,
    iterations: 2_000,
  });
  const productionRng = mulberry32('coverage-reference');
  const production = runImpactMonteCarlo({
    nominal: NOMINAL,
    rng: productionRng,
    iterations: 200,
  });

  const FIELDS = [
    'kineticEnergy',
    'finalCraterDiameter',
    'ejectaEdge1m',
    'firestormIgnition',
  ] as const;

  for (const f of FIELDS) {
    it(`${f}: P10 within 15 % of N=2000 reference`, () => {
      const ref = reference.metrics[f].p10;
      const prod = production.metrics[f].p10;
      const tolerance = 0.15;
      // Both must be > 0 for ratio to make sense; otherwise both must
      // be 0 (zero output is a stable signal — Tunguska firestorm
      // ignition is correctly zero with high probability).
      if (ref === 0) {
        expect(prod).toBe(0);
      } else {
        expect(Math.abs(prod - ref) / ref).toBeLessThan(tolerance);
      }
    });
    it(`${f}: P90 within 15 % of N=2000 reference`, () => {
      const ref = reference.metrics[f].p90;
      const prod = production.metrics[f].p90;
      if (ref === 0) {
        expect(prod).toBe(0);
      } else {
        expect(Math.abs(prod - ref) / ref).toBeLessThan(0.15);
      }
    });
    it(`${f}: median within 10 % of N=2000 reference`, () => {
      const ref = reference.metrics[f].p50;
      const prod = production.metrics[f].p50;
      // Empirically a 200-sample median is unbiased but has a few-
      // percent sampling envelope around the high-N reference.
      // 10 % is below every published 1σ in the master table.
      if (ref === 0) {
        expect(prod).toBe(0);
      } else {
        expect(Math.abs(prod - ref) / ref).toBeLessThan(0.1);
      }
    });
  }
});

describe('Monte-Carlo determinism — same seed produces identical percentiles', () => {
  it('two N=200 runs with the same seed return bit-identical percentiles', () => {
    const a = runImpactMonteCarlo({
      nominal: NOMINAL,
      rng: mulberry32('determinism-test'),
      iterations: 200,
    });
    const b = runImpactMonteCarlo({
      nominal: NOMINAL,
      rng: mulberry32('determinism-test'),
      iterations: 200,
    });
    expect(a.iterations).toBe(b.iterations);
    for (const k of Object.keys(a.metrics)) {
      const fa = a.metrics[k as keyof typeof a.metrics];
      const fb = b.metrics[k as keyof typeof b.metrics];
      if (!fa || !fb) {
        throw new Error(`metric ${k} missing on one side`);
      }
      expect(fa.p10).toBe(fb.p10);
      expect(fa.p50).toBe(fb.p50);
      expect(fa.p90).toBe(fb.p90);
      expect(fa.mean).toBe(fb.mean);
    }
  });

  it('different seeds produce different percentiles (sanity)', () => {
    const a = runImpactMonteCarlo({
      nominal: NOMINAL,
      rng: mulberry32('seed-A'),
      iterations: 200,
    });
    const b = runImpactMonteCarlo({
      nominal: NOMINAL,
      rng: mulberry32('seed-B'),
      iterations: 200,
    });
    // P50 will be close — that's the point of medians — but the P10
    // and P90 tails should disagree by *something* between two
    // independent 200-sample runs. Use the energy metric (largest
    // dynamic range, so any drift shows up).
    const a10 = a.metrics.kineticEnergy.p10;
    const b10 = b.metrics.kineticEnergy.p10;
    expect(a10).not.toBe(b10);
  });
});
