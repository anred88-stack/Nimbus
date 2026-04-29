import { describe, expect, it } from 'vitest';
import { seismicTsunamiFromMegathrust } from '../events/earthquake/seismicTsunami.js';
import { synolakisRunup } from '../events/tsunami/extendedEffects.js';
import { m } from '../units.js';
import {
  NOAA_PIN_TOLERANCE,
  NOAA_SEISMIC_PIN_TOLERANCE,
  SUMATRA_2004_COCOS_REFERENCE,
  SYNOLAKIS_1987_CASES,
} from './noaaBenchmarkFixtures.js';

/**
 * NOAA tsunami benchmark validation suite.
 *
 * Pin-style tests that compare Nimbus output against published
 * reference values from the NTHMP / Synolakis et al. 2008 benchmark
 * problem set. A failure here means the closed-form physics has
 * drifted outside the popular-science accuracy envelope (±20 %)
 * relative to a NOAA-accepted solver / lab dataset / field record.
 *
 * Strategy. The benchmark problems are split into two groups:
 *   - Pure analytic (Synolakis 1987 BP1): unit-test the
 *     `synolakisRunup` formula in isolation against the published
 *     Carrier-Greenspan analytic R/H values.
 *   - Integration (Tōhoku 2011 DART, Sumatra-Andaman 2004 Cocos):
 *     drive `seismicTsunamiFromMegathrust` end-to-end and pin the
 *     far-field amplitude at the buoy/gauge distance.
 *
 * Tolerance: ±20 % per pin (see NOAA_PIN_TOLERANCE rationale in the
 * fixture file). Tighter pins are not justified by the formulas'
 * inherent scatter on the popular-science envelope.
 */

function relativeError(predicted: number, observed: number): number {
  return Math.abs(predicted - observed) / Math.max(Math.abs(observed), 1e-9);
}

describe('NOAA BP1 — solitary wave runup on a 1:19.85 plane beach (Synolakis 1987)', () => {
  for (const c of SYNOLAKIS_1987_CASES) {
    it(`H/d = ${c.HOverD.toString()}: predicted R/H matches Synolakis 1987 within ±${(
      NOAA_PIN_TOLERANCE * 100
    ).toFixed(0)} %`, () => {
      const H = c.HOverD * c.offshoreDepthM;
      const R = synolakisRunup(m(H), c.beachSlopeRad, m(c.offshoreDepthM)) as number;
      const predictedROverH = R / H;
      const err = relativeError(predictedROverH, c.publishedROverH);
      expect(
        err,
        `predicted R/H = ${predictedROverH.toFixed(3)}, published = ${c.publishedROverH.toFixed(
          3
        )} (${c.source}); error = ${(err * 100).toFixed(1)} %`
      ).toBeLessThan(NOAA_PIN_TOLERANCE);
    });
  }
});

describe('Tōhoku 2011 megathrust DART buoy 21413 — Satake et al. 2013', () => {
  // Note. The cylindrical 1D model (Phase-19 / Tier 1) systematically
  // OVER-predicts compact-rupture far-field amplitudes by a factor
  // 3-7×: Tōhoku's 700 km rupture has a peaked slip distribution
  // (8 m peak vs ~4 m mean) that injects strong high-frequency
  // dispersion the cylindrical 1D + Heidarzadeh-Satake decay cannot
  // capture. Closing this gap requires the Tier 2 Saint-Venant 1D
  // Web Worker (planned). Here we only check the moment-magnitude →
  // mean slip part of the chain, which IS within tolerance.

  it('mean coseismic slip matches the Satake 2013 inversion (~5–25 m)', () => {
    const r = seismicTsunamiFromMegathrust({
      magnitude: 9.1,
      ruptureLength: m(700_000),
      subductionInterface: true,
    });
    expect(r.meanSlip as number).toBeGreaterThan(5);
    expect(r.meanSlip as number).toBeLessThan(25);
  });

  it.todo(
    'TIER 2 — DART 21413 amplitude at 1 500 km within ±20 % (needs Saint-Venant 1D, Phase-21+)'
  );
});

describe('Sumatra-Andaman 2004 megathrust — Cocos Island reference (Bernard et al. 2006)', () => {
  it(`seismic-tsunami amplitude at 1 700 km matches the deep-water reference within ±${(
    NOAA_SEISMIC_PIN_TOLERANCE * 100
  ).toFixed(0)} %`, () => {
    // Sumatra-Andaman 2004: Mw 9.1, very long rupture ≈ 1 300 km
    // (Bilham 2005, Lay et al. 2005). Subduction interface — Sunda
    // megathrust. Cocos Island is ≈ 1 700 km from rupture centroid.
    // The cylindrical 1D model captures long-rupture events well
    // because the slip distribution is more uniform than Tōhoku's;
    // dispersion-corrected amplitude lands within ±20 % of Bernard
    // 2006 deep-water reference.
    const r = seismicTsunamiFromMegathrust({
      magnitude: SUMATRA_2004_COCOS_REFERENCE.magnitude,
      ruptureLength: m(1_300_000),
      basinDepth: m(4_000),
      subductionInterface: true,
    });
    // Use the dispersion-corrected amplitude (Phase-20). Scale by
    // cylindrical √(R₀/r) from 1 000 km to the buoy distance.
    const ampAt1000Disp = r.amplitudeAt1000kmDispersed as number;
    const ampAtCocos =
      ampAt1000Disp * Math.sqrt(1_000_000 / SUMATRA_2004_COCOS_REFERENCE.distanceM);
    const err = relativeError(ampAtCocos, SUMATRA_2004_COCOS_REFERENCE.observedAmplitudeM);
    expect(
      err,
      `predicted ${ampAtCocos.toFixed(3)} m, observed ${SUMATRA_2004_COCOS_REFERENCE.observedAmplitudeM.toString()} m (${SUMATRA_2004_COCOS_REFERENCE.source}); error = ${(err * 100).toFixed(1)} %`
    ).toBeLessThan(NOAA_SEISMIC_PIN_TOLERANCE);
  });
});
