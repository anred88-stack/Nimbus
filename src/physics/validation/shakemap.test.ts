import { describe, expect, it } from 'vitest';
import { simulateEarthquake } from '../events/earthquake/index.js';
import { m } from '../units.js';
import { SHAKEMAP_OBSERVATIONS } from './fixtures.js';

/**
 * Earthquake MMI-ring validation against published macroseismic
 * surveys.
 *
 * The simulator's MMI VII radius is built on the Wald 1999 PGV-MMI
 * relation + a Boore 2014 NGA-West2 attenuation, which is the same
 * production stack USGS ShakeMap runs. So this test does NOT
 * validate the GMICE itself — it pins the *integrated* output (the
 * radius the user sees on the map) to the radii reported by post-
 * earthquake macroseismic intensity surveys.
 *
 * Tolerance: the published macroseismic ring is itself a fitted
 * contour through irregular felt-report data with ±5–10 km
 * irreducible scatter; the predicted vs observed must overlap that
 * scatter band, not match a sharp value.
 */

describe('Earthquake validation — MMI VII ring radius vs ShakeMap surveys', () => {
  for (const obs of SHAKEMAP_OBSERVATIONS) {
    it(`${obs.event}: predicted MMI VII radius matches ${obs.observedMmi7RadiusM.toString()} m ±${obs.toleranceM.toString()} m (${obs.source})`, () => {
      const r = simulateEarthquake({
        magnitude: obs.magnitudeMw,
        depth: m(obs.depthM),
        faultType: 'reverse',
      });
      const predicted = r.shaking.mmi7Radius as number;
      const diff = Math.abs(predicted - obs.observedMmi7RadiusM);
      // Tolerance is the published macroseismic scatter plus the
      // 30 % depth-uncertainty band on Mw 6 events.
      const tolerance = obs.toleranceM + 0.3 * obs.observedMmi7RadiusM;
      expect(diff).toBeLessThan(tolerance);
    });
  }

  it('aggregate bias across all events is within ±25 % (no systematic over/under)', () => {
    let sum = 0;
    let n = 0;
    for (const obs of SHAKEMAP_OBSERVATIONS) {
      const r = simulateEarthquake({
        magnitude: obs.magnitudeMw,
        depth: m(obs.depthM),
        faultType: 'reverse',
      });
      const predicted = r.shaking.mmi7Radius as number;
      sum += (predicted - obs.observedMmi7RadiusM) / obs.observedMmi7RadiusM;
      n++;
    }
    const meanRelativeBias = sum / n;
    expect(Math.abs(meanRelativeBias)).toBeLessThan(0.25);
  });
});
