import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CRUSTAL_RIGIDITY, SEAWATER_DENSITY, STANDARD_GRAVITY } from '../constants.js';
import { seismicMomentFromMagnitude } from '../events/earthquake/seismicMoment.js';
import { dispersionAmplitudeFactor } from '../events/tsunami/extendedEffects.js';
import {
  impactCavityRadius,
  impactSourceAmplitude,
} from '../events/tsunami/impact.js';
import { simulateSaintVenant1D } from '../tsunami/saintVenant1D.js';
import { J, m } from '../units.js';

/**
 * Tier 3 — GeoClaw fixture comparison.
 *
 * For every JSON fixture in `geoclawFixtures/` that has a non-empty
 * `geoclawProbes` array, we feed the same source parameters to the
 * Nimbus Phase-21c Saint-Venant 1D-radial pipeline + Heidarzadeh-
 * Satake dispersion post-process and assert the predicted far-field
 * amplitude lands within `tolerance` (±25 % default) of the GeoClaw
 * value at every probe.
 *
 * Supported source types (driven by `fixture.input.type`):
 *
 *   - `seismic-megathrust`: Hanks-Kanamori M₀ → Okada uplift → coupling
 *     × peak. Uses the same 4 m / σ ≈ L/4 Gaussian source as the
 *     Phase-21c Tōhoku DART pin in noaaBenchmarks.test.ts.
 *
 *   - `volcanic-collapse`: Watts 2000 source amplitude from collapse
 *     volume + slope (formula in events/tsunami/extendedEffects.ts).
 *     σ proportional to sqrt(collapseAreaM2)/2.
 *
 *   - `submarine-landslide`: Watts 2000 source amplitude from slide
 *     volume + slope. σ proportional to slideLengthM / 4.
 *
 *   - `impact-deep-ocean`: Ward-Asphaug cavity radius + Phase-18
 *     ocean-coupling-corrected source amplitude. σ ≈ R_C.
 *
 * Tolerance rationale. ±25 % matches the Synolakis et al. 2008 §6
 * inter-model spread (MOST, GeoClaw, COMCOT, Tsunami-HySEA on the
 * same NOAA benchmark) — the inherent operational-grade scatter, not
 * a sloppy pin. Per-fixture overrides via `_metadata.tolerance` for
 * sources with even larger scatter (volcanic flank collapse,
 * submarine landslide).
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

interface SeismicMegathrustInput {
  type: 'seismic-megathrust';
  magnitude: number;
  ruptureLengthM: number;
  basinDepthM?: number;
}

interface VolcanicCollapseInput {
  type: 'volcanic-collapse';
  collapseVolumeM3: number;
  collapseAreaM2?: number;
  slopeRad?: number;
  basinDepthM: number;
}

interface SubmarineLandslideInput {
  type: 'submarine-landslide';
  slideVolumeM3: number;
  slideLengthM?: number;
  slopeRad?: number;
  basinDepthM: number;
}

interface ImpactDeepOceanInput {
  type: 'impact-deep-ocean';
  impactorDiameterM: number;
  impactorVelocityMPerS: number;
  impactorDensityKgPerM3: number;
  basinDepthM: number;
}

type FixtureInput =
  | SeismicMegathrustInput
  | VolcanicCollapseInput
  | SubmarineLandslideInput
  | ImpactDeepOceanInput;

interface GeoclawFixture {
  scenarioId: string;
  displayName: string;
  geoclawVersion: string;
  computedAt: string;
  input: FixtureInput;
  geoclawProbes: GeoclawProbe[];
  _metadata?: {
    tolerance?: number;
  };
}

const DEFAULT_TOLERANCE = 0.25;

/**
 * GeoClaw amplitudes below this threshold are below the AMR base-grid
 * truncation noise floor for our typical 0.5°-1° Tier-3 fixture
 * resolution: a Gaussian source σ < 0.5 cell width gets averaged out to
 * essentially zero on a 55 km-cell grid, even when the source peak is
 * many metres. The relative-error metric blows up against numerical
 * zero, so we report those probes as `it.skip` rather than fail.
 *
 * For real geophysical comparisons, a fixture would resolve the source
 * better; for the custom-input grid that samples small parameters
 * (volcanic V=0.1 km³ → σ≈1 km), the unresolved-source case is honest
 * to surface as `skipped` rather than fudging the tolerance to ±10⁵ %.
 */
const GEOCLAW_NOISE_FLOOR_M = 0.01;

function loadFixtures(): GeoclawFixture[] {
  const dirPath = new URL('./geoclawFixtures/', import.meta.url).pathname;
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

/**
 * Derive the (sourcePeak, sigmaM) pair for the Saint-Venant 1D-radial
 * Gaussian initial condition, given the fixture input. Each branch
 * encapsulates the Tier-1 closed-form physics for its source type
 * — same formulas the in-app pipeline uses, so a Tier-3 pass means
 * the closed-form chain is consistent with GeoClaw at the integrated
 * far-field level too.
 */
function deriveSource(input: FixtureInput): { sourcePeakM: number; sigmaM: number } {
  if (input.type === 'seismic-megathrust') {
    const M0 = seismicMomentFromMagnitude(input.magnitude) as number;
    const W = input.ruptureLengthM / 2;
    const meanSlip = M0 / ((CRUSTAL_RIGIDITY as number) * input.ruptureLengthM * W);
    const upliftM = 0.6 * meanSlip;
    const sourcePeakM = 0.7 * upliftM;
    const sigmaM = input.ruptureLengthM / 4;
    return { sourcePeakM, sigmaM };
  }
  if (input.type === 'volcanic-collapse') {
    // Watts 2000 short form for subaerial / caldera collapse:
    //   A₀ ~ 0.4 · V^(1/3) · sin(slope) (subaerial),
    //         0.005 · V^(1/3) · sin(slope) (submarine).
    // Volcanic-flank collapses (Krakatau caldera + Anak Krakatau) sit
    // close to the subaerial coefficient; we use 0.4 and let the
    // ±25 % envelope absorb the regime ambiguity.
    const slope = input.slopeRad ?? Math.atan(0.05); // shallow shelf default
    const sourcePeakM = 0.4 * Math.pow(input.collapseVolumeM3, 1 / 3) * Math.sin(slope);
    const sigmaM = input.collapseAreaM2 !== undefined ? Math.sqrt(input.collapseAreaM2) / 2 : 5_000;
    return { sourcePeakM, sigmaM };
  }
  if (input.type === 'submarine-landslide') {
    // Watts 2000 submarine slide form. K_submarine = 0.005 (two
    // orders of magnitude smaller than subaerial because soft-
    // sediment slides don't displace water as efficiently as a
    // rigid block).
    const slope = input.slopeRad ?? Math.atan(0.05);
    const sourcePeakM = 0.005 * Math.pow(input.slideVolumeM3, 1 / 3) * Math.sin(slope);
    const sigmaM = input.slideLengthM !== undefined ? input.slideLengthM / 4 : 50_000;
    return { sourcePeakM, sigmaM };
  }
  // impact-deep-ocean
  const massKg =
    (Math.PI / 6) *
    input.impactorDensityKgPerM3 *
    input.impactorDiameterM ** 3;
  const keJ = 0.5 * massKg * input.impactorVelocityMPerS ** 2;
  const cavityRadius = impactCavityRadius({
    kineticEnergy: J(keJ),
    waterDensity: SEAWATER_DENSITY,
    surfaceGravity: STANDARD_GRAVITY,
  });
  const sourcePeakM = impactSourceAmplitude(cavityRadius) as number;
  const sigmaM = cavityRadius as number;
  return { sourcePeakM, sigmaM };
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

    const tolerance = fx._metadata?.tolerance ?? DEFAULT_TOLERANCE;
    const basinDepthM = fx.input.basinDepthM ?? 4_000;

    for (const probe of fx.geoclawProbes) {
      if (probe.peakAmplitudeM < GEOCLAW_NOISE_FLOOR_M) {
        it.skip(
          `${fx.scenarioId} @ ${probe.label} — GeoClaw peak ${probe.peakAmplitudeM.toFixed(4)} m below ${GEOCLAW_NOISE_FLOOR_M.toFixed(2)} m noise floor (sub-grid source)`
        );
        continue;
      }
      it(`${fx.scenarioId} (${fx.input.type}) @ ${probe.label} — Nimbus Phase-21c radial within ±${(tolerance * 100).toFixed(0)} % of GeoClaw`, () => {
        const { sourcePeakM, sigmaM } = deriveSource(fx.input);
        if (!Number.isFinite(sourcePeakM) || sourcePeakM <= 0) {
          expect.fail(
            `Source amplitude ${sourcePeakM.toString()} m is not physical for ${fx.scenarioId}`
          );
          return;
        }

        const N = 400;
        const dx = 10_000;
        const sigmaCells = Math.max(3, Math.round(sigmaM / dx));
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
        if (!Number.isFinite(ampAtProbe) || ampAtProbe < 0) {
          expect.fail(`Nimbus produced invalid amplitude ${ampAtProbe.toString()} at probe`);
          return;
        }
        const err = relativeError(ampAtProbe, probe.peakAmplitudeM);
        expect(
          err,
          `Nimbus ${ampAtProbe.toFixed(3)} m (source ${sourcePeakM.toFixed(2)} m, σ ${(sigmaM / 1000).toFixed(1)} km, raw solver ${probeRec.peakAbsAmplitudeM.toFixed(3)} m × dispersion) vs GeoClaw ${probe.peakAmplitudeM.toFixed(3)} m at ${(probe.distanceFromEpicentreM / 1_000).toFixed(0)} km (${probe.label}); error ${(err * 100).toFixed(1)} %`
        ).toBeLessThan(tolerance);
      });
    }
  }
});
