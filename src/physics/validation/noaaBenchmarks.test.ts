import { describe, expect, it } from 'vitest';
import { seismicTsunamiFromMegathrust } from '../events/earthquake/seismicTsunami.js';
import { dispersionAmplitudeFactor, synolakisRunup } from '../events/tsunami/extendedEffects.js';
import { simulateSaintVenant1D } from '../tsunami/saintVenant1D.js';
import { m } from '../units.js';
import {
  NOAA_PIN_TOLERANCE,
  NOAA_SEISMIC_PIN_TOLERANCE,
  SUMATRA_2004_COCOS_REFERENCE,
  SYNOLAKIS_1987_CASES,
  TOHOKU_2011_DART_REFERENCE,
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

  it(`TIER 2 (Phase-21c) — Saint-Venant 1D-radial DART 21413 amplitude at 1 500 km within ±${(
    NOAA_SEISMIC_PIN_TOLERANCE * 100
  ).toFixed(0)} %`, () => {
    // Tōhoku 2011 routed through the Phase-21c Saint-Venant 1D-radial
    // pipeline (Closes the Tier-2 todo opened by Phase-20).
    //
    // Setup. Domain: 0..4000 km from the rupture symmetry axis,
    // 10 km cell width, 4 km mean ocean depth. Source: a Gaussian
    // sea-surface displacement centred at the axis, peak η₀ =
    // 4 m × WAVE_COUPLING_EFFICIENCY (0.7, Satake 2013 calibration
    // — the Hanks-Kanamori uplift to wave coupling efficiency the
    // closed-form pipeline already uses), half-width 350 km
    // (Tōhoku-typical rupture half-length).
    //
    // Solver: MUSCL second-order TVD reconstruction + SSP-RK2 +
    // 1D-radial geometry source term, the GeoClaw-equivalent
    // configuration. Manning friction n = 0.025 (open ocean,
    // Imamura 1995). Run for 9000 s (2.5 h, the wave at √(g·4000) =
    // 198 m/s reaches DART 21413 at 1500 km in ≈ 7600 s).
    //
    // Post-processing: apply the Heidarzadeh & Satake 2015
    // frequency-dependent dispersion factor at the buoy distance.
    // The Saint-Venant solver does NOT model dispersion (it solves
    // the non-dispersive shallow-water equations); HF spectral
    // components disperse out of the wave train at observation
    // distance, which the Heidarzadeh-Satake decay captures
    // empirically.
    const N = 400;
    const dx = 10_000;
    const peakUpliftM = 4;
    const couplingEfficiency = 0.7;
    const sigmaCells = 35;
    const sourcePeakM = peakUpliftM * couplingEfficiency;

    const z: number[] = [];
    const eta0: number[] = [];
    for (let i = 0; i < N; i++) {
      z.push(-4_000);
      const rCells = i + 0.5;
      eta0.push(sourcePeakM * Math.exp(-(rCells * rCells) / (2 * sigmaCells * sigmaCells)));
    }

    const probeIdx = Math.round(TOHOKU_2011_DART_REFERENCE.distanceM / dx - 0.5);
    const r = simulateSaintVenant1D({
      bathymetryM: z,
      cellWidthM: dx,
      initialDisplacementM: eta0,
      durationS: 9_000,
      manningN: 0.025,
      scheme: 'muscl-rk2',
      geometry: 'radial',
      probeCellIndices: [probeIdx],
    });
    const probe = r.probes[0];
    if (!probe) {
      expect.fail('expected Tōhoku probe');
      return;
    }
    const solverPeakM = probe.peakAbsAmplitudeM;
    const dispersedPeakM =
      solverPeakM * dispersionAmplitudeFactor(m(TOHOKU_2011_DART_REFERENCE.distanceM));
    const err = relativeError(dispersedPeakM, TOHOKU_2011_DART_REFERENCE.observedAmplitudeM);
    expect(
      err,
      `predicted ${dispersedPeakM.toFixed(3)} m (solver ${solverPeakM.toFixed(3)} m × dispersion ${(
        dispersedPeakM / solverPeakM
      ).toFixed(
        3
      )}), observed ${TOHOKU_2011_DART_REFERENCE.observedAmplitudeM.toString()} m (${TOHOKU_2011_DART_REFERENCE.source}); error = ${(err * 100).toFixed(1)} %`
    ).toBeLessThan(NOAA_SEISMIC_PIN_TOLERANCE);
  });
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
