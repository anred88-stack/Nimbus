import { describe, expect, it } from 'vitest';
import { plumeHeight } from '../events/volcano/plumeHeight.js';
import { PLUME_HEIGHT_OBSERVATIONS } from './fixtures.js';

/**
 * Volcanic plume-height validation against AVHRR / radar observations.
 *
 * The simulator's plume height comes from the Mastin 2009 fit
 * H = 2.0 · V̇^0.241. The Mastin fit itself has factor-2 scatter at
 * any given mass eruption rate (see Aubry et al. 2023 GRL for an
 * updated factor-2 envelope), so a strict ±5 % comparison would be
 * scientifically misleading. The tolerance band per event is the
 * paper-reported ±1σ on the observation; the predicted height must
 * fall inside that band plus the Mastin scatter envelope.
 */

describe('Volcano validation — plume height vs published observations', () => {
  for (const obs of PLUME_HEIGHT_OBSERVATIONS) {
    it(`${obs.event}: Mastin 2009 prediction matches ${obs.observedPlumeHeightKm.toString()} km ±${obs.toleranceKm.toString()} km (${obs.source})`, () => {
      const heightM = plumeHeight({
        volumeEruptionRate: obs.volumeEruptionRate,
      });
      const predictedKm = (heightM as number) / 1_000;
      const diff = Math.abs(predictedKm - obs.observedPlumeHeightKm);
      // Mastin 2009 factor-2 envelope: half of the predicted height
      // is the published 1σ band; we add the observation σ on top.
      const tolerance = obs.toleranceKm + 0.5 * predictedKm;
      expect(diff).toBeLessThan(tolerance);
    });
  }

  it('predicted heights are monotone in volume eruption rate', () => {
    const sorted = [...PLUME_HEIGHT_OBSERVATIONS].sort(
      (a, b) => a.volumeEruptionRate - b.volumeEruptionRate
    );
    let prev = -Infinity;
    for (const obs of sorted) {
      const h = plumeHeight({ volumeEruptionRate: obs.volumeEruptionRate }) as number;
      expect(h).toBeGreaterThan(prev);
      prev = h;
    }
  });
});
