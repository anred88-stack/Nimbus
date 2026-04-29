import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CRUSTAL_RIGIDITY } from '../constants.js';
import { seismicMomentFromMagnitude } from '../events/earthquake/seismicMoment.js';
import { dispersionAmplitudeFactor } from '../events/tsunami/extendedEffects.js';
import { simulateSaintVenant1D } from '../tsunami/saintVenant1D.js';
import { m } from '../units.js';

/**
 * Tier 3 — GeoClaw fixture comparison.
 *
 * For every JSON fixture in `geoclawFixtures/` that has a non-empty
 * `geoclawProbes` array, we feed the same source parameters to the
 * Nimbus closed-form pipeline (Phase-19 cylindrical 1D + dispersion)
 * and assert the predicted far-field amplitude lands within ±25 % of
 * the GeoClaw value at the same probe range.
 *
 * Tolerance rationale. ±25 % is the operational-grade scatter
 * envelope reported in Synolakis et al. 2008 §6 when MOST, GeoClaw,
 * COMCOT and Tsunami-HySEA ran the same NOAA benchmark — it is the
 * inherent inter-solver spread, not a sloppy pin. Our closed-form /
 * 1D Saint-Venant solver is not a 2D AMR code; ±25 % is the honest
 * pin width.
 *
 * How to add a fixture. See docs/GEOCLAW_SETUP.md. Run the scenario
 * in WSL2 / Linux with the published clawpack examples or your own
 * setrun.py, extract the gauge peak amplitude, and commit a JSON file
 * here following maule-2010.json's schema. The next CI run picks it
 * up automatically — no test code changes needed.
 *
 * Empty / placeholder fixtures (with `geoclawProbes: []`) are reported
 * as `it.todo` so the suite stays green while you populate them.
 */

interface GeoclawProbe {
  label: string;
  distanceFromEpicentreM: number;
  peakAmplitudeM: number;
  peakTimeSeconds?: number;
}

interface GeoclawFixture {
  scenarioId: string;
  displayName: string;
  geoclawVersion: string;
  computedAt: string;
  input: {
    type: string;
    magnitude?: number;
    ruptureLengthM?: number;
    ruptureWidthM?: number;
    basinDepthM?: number;
  };
  geoclawProbes: GeoclawProbe[];
  _metadata?: {
    tolerance?: number;
  };
}

const DEFAULT_TOLERANCE = 0.25;

function loadFixtures(): GeoclawFixture[] {
  const dirPath = new URL('./geoclawFixtures/', import.meta.url).pathname;
  // On Windows, import.meta.url paths are file:///C:/... — strip the
  // leading slash that would break readdirSync. Linux paths are
  // already fine.
  const cleaned =
    dirPath.startsWith('/') && /^\/[A-Za-z]:\//.test(dirPath) ? dirPath.slice(1) : dirPath;
  const fixtures: GeoclawFixture[] = [];
  for (const entry of readdirSync(cleaned)) {
    if (!entry.endsWith('.json')) continue;
    const raw = readFileSync(join(cleaned, entry), 'utf8');
    fixtures.push(JSON.parse(raw) as GeoclawFixture);
  }
  return fixtures;
}

function relativeError(predicted: number, geoclaw: number): number {
  return Math.abs(predicted - geoclaw) / Math.max(Math.abs(geoclaw), 1e-9);
}

const fixtures = loadFixtures();

describe('Tier 3 — GeoClaw fixture comparison', () => {
  if (fixtures.length === 0) {
    it.skip('no fixtures committed — see docs/GEOCLAW_SETUP.md', () => {
      // No-op — skipped because there is nothing to compare.
    });
    return;
  }

  for (const fx of fixtures) {
    if (fx.geoclawProbes.length === 0) {
      it.todo(
        `${fx.scenarioId} — fixture committed but geoclawProbes empty (run GeoClaw + populate JSON)`
      );
      continue;
    }

    if (fx.input.type !== 'seismic-megathrust') {
      // Non-seismic scenarios (volcano, landslide, impact) need a
      // different pipeline call than seismicTsunamiFromMegathrust.
      // Skip until those branches are wired.
      it.todo(
        `${fx.scenarioId} — comparator not yet implemented for input.type='${fx.input.type}'`
      );
      continue;
    }

    const tolerance = fx._metadata?.tolerance ?? DEFAULT_TOLERANCE;

    for (const probe of fx.geoclawProbes) {
      it(`${fx.scenarioId} @ ${probe.label} — Nimbus Phase-21c radial within ±${(tolerance * 100).toFixed(0)} % of GeoClaw`, () => {
        if (fx.input.magnitude === undefined || fx.input.ruptureLengthM === undefined) {
          expect.fail(
            `Fixture ${fx.scenarioId} missing magnitude or ruptureLengthM — cannot run comparison`
          );
          return;
        }
        // Same recipe as the Tohoku DART pin in noaaBenchmarks.test.ts:
        // Phase-21c Saint-Venant 1D-radial solver + Heidarzadeh-Satake
        // post-process dispersion factor. Source: Gaussian uplift
        // centred on the symmetry axis with peak η₀ = mean uplift ×
        // WAVE_COUPLING_EFFICIENCY (0.7, Satake 2013), half-width
        // proportional to L/4 so the source size scales with the
        // rupture (Tohoku σ ≈ 175 km, Sumatra σ ≈ 325 km, Maule σ ≈
        // 113 km).
        const Mw = fx.input.magnitude;
        const L = fx.input.ruptureLengthM;
        const basinDepthM = fx.input.basinDepthM ?? 4_000;
        const M0 = seismicMomentFromMagnitude(Mw) as number;
        const W = L / 2; // megathrust subduction aspect ratio
        const meanSlipM = M0 / ((CRUSTAL_RIGIDITY as number) * L * W);
        const upliftM = 0.6 * meanSlipM; // megathrust dip-uplift factor
        const couplingEfficiency = 0.7; // Satake 2013
        const sourcePeakM = upliftM * couplingEfficiency;

        const N = 400;
        const dx = 10_000;
        const sigmaCells = Math.max(10, Math.round(L / 4 / dx));
        const z: number[] = new Array<number>(N).fill(-Math.abs(basinDepthM));
        const eta0: number[] = new Array<number>(N).fill(0);
        for (let i = 0; i < N; i++) {
          const rCells = i + 0.5;
          eta0[i] = sourcePeakM * Math.exp(-(rCells * rCells) / (2 * sigmaCells * sigmaCells));
        }
        const probeIdx = Math.min(
          N - 1,
          Math.max(0, Math.round(probe.distanceFromEpicentreM / dx - 0.5))
        );
        const sv = simulateSaintVenant1D({
          bathymetryM: z,
          cellWidthM: dx,
          initialDisplacementM: eta0,
          durationS: Math.max(9_000, (probe.distanceFromEpicentreM / 198) * 1.5),
          manningN: 0.025,
          scheme: 'muscl-rk2',
          geometry: 'radial',
          probeCellIndices: [probeIdx],
        });
        const probeRec = sv.probes[0];
        if (!probeRec) {
          expect.fail('Saint-Venant solver returned no probe record');
          return;
        }
        const ampAtProbe =
          probeRec.peakAbsAmplitudeM * dispersionAmplitudeFactor(m(probe.distanceFromEpicentreM));
        if (!Number.isFinite(ampAtProbe) || ampAtProbe <= 0) {
          expect.fail(`Nimbus produced invalid amplitude ${ampAtProbe.toString()} at probe`);
          return;
        }
        const err = relativeError(ampAtProbe, probe.peakAmplitudeM);
        expect(
          err,
          `Nimbus ${ampAtProbe.toFixed(3)} m (raw ${probeRec.peakAbsAmplitudeM.toFixed(3)} m × dispersion) vs GeoClaw ${probe.peakAmplitudeM.toFixed(3)} m at ${(probe.distanceFromEpicentreM / 1_000).toFixed(0)} km (${probe.label}); error ${(err * 100).toFixed(1)} %`
        ).toBeLessThan(tolerance);
      });
    }
  }
});
