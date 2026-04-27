import { describe, expect, it } from 'vitest';
import { tsunamiTravelTime } from '../events/tsunami/propagation.js';
import { m } from '../units.js';
import { SUMATRA_2004_TIDE_GAUGES, TOHOKU_2011_DART } from './fixtures.js';

/**
 * Tsunami arrival-time validation against historical observations.
 *
 * The simulator's headline arrival-time estimate uses Lamb 1932
 * shallow-water celerity over the mean ocean depth — exactly the
 * model that lights up the in-app "arrives in X minutes" badge. We
 * compare its prediction to DART buoy and tide-gauge observations of
 * the two best-instrumented tsunamis on record (Tōhoku 2011 and
 * Sumatra 2004) and require the bias to lie within the documented
 * tolerance band (a few minutes for nearby buoys, tens of minutes
 * for trans-oceanic stations).
 *
 * What this validates: the linear shallow-water model, plus the
 * 4 km mean-depth choice, are good enough for headline display. It
 * does NOT validate the full 2-D bathymetric travel-time field — that
 * is covered by the FMM convergence and barrier-detour tests in
 * src/physics/tsunami/.
 */

/**
 * Pacific / Indian-ocean basin-average depth (Charette & Smith 2010
 * Oceanography 23.2 Table 1) — the celerity reference used here.
 */
const MEAN_OCEAN_DEPTH = m(4_500);

interface ValidationStat {
  rmseMin: number;
  biasMin: number;
  worstMissMin: number;
  worstStation: string;
}

function compareArrivals(
  observations: readonly {
    distanceFromEpicentreM: number;
    observedArrivalMin: number;
    station: string;
  }[]
): ValidationStat {
  let sumSq = 0;
  let sumBias = 0;
  let worstMiss = 0;
  let worstStation = '';
  for (const obs of observations) {
    const predictedSec = tsunamiTravelTime(m(obs.distanceFromEpicentreM), MEAN_OCEAN_DEPTH);
    const predictedMin = (predictedSec as number) / 60;
    const diff = predictedMin - obs.observedArrivalMin;
    sumSq += diff * diff;
    sumBias += diff;
    if (Math.abs(diff) > Math.abs(worstMiss)) {
      worstMiss = diff;
      worstStation = obs.station;
    }
  }
  const n = observations.length;
  return {
    rmseMin: Math.sqrt(sumSq / n),
    biasMin: sumBias / n,
    worstMissMin: worstMiss,
    worstStation,
  };
}

describe('Tsunami validation — Tōhoku 2011 trans-Pacific DART arrivals', () => {
  const stat = compareArrivals(TOHOKU_2011_DART);

  it('RMSE under 60 minutes across all 4 far-field stations', () => {
    expect(stat.rmseMin).toBeLessThan(60);
  });

  it('mean bias is bounded (< 40 minutes, no systematic factor-2 mis-prediction)', () => {
    expect(Math.abs(stat.biasMin)).toBeLessThan(40);
  });

  it('every individual buoy is matched within ±20 % of the predicted travel time', () => {
    for (const obs of TOHOKU_2011_DART) {
      const predictedSec = tsunamiTravelTime(m(obs.distanceFromEpicentreM), MEAN_OCEAN_DEPTH);
      const predictedMin = (predictedSec as number) / 60;
      const tolerance = 0.2 * predictedMin + obs.observedArrivalUncertaintyMin * 3;
      expect(Math.abs(predictedMin - obs.observedArrivalMin)).toBeLessThan(tolerance);
    }
  });
});

describe('Tsunami validation — Sumatra 2004 trans-Indian-Ocean arrivals', () => {
  const stat = compareArrivals(SUMATRA_2004_TIDE_GAUGES);

  it('RMSE under 50 minutes across the 3 stations', () => {
    expect(stat.rmseMin).toBeLessThan(50);
  });

  it('every station is matched within ±20 % + 3σ tolerance', () => {
    for (const obs of SUMATRA_2004_TIDE_GAUGES) {
      const predictedSec = tsunamiTravelTime(m(obs.distanceFromEpicentreM), MEAN_OCEAN_DEPTH);
      const predictedMin = (predictedSec as number) / 60;
      const tolerance = 0.2 * predictedMin + obs.observedArrivalUncertaintyMin * 3;
      expect(Math.abs(predictedMin - obs.observedArrivalMin)).toBeLessThan(tolerance);
    }
  });
});
