/**
 * One-at-a-time sensitivity analysis CLI for every preset.
 *
 * Usage:
 *   pnpm tsx scripts/sensitivity.ts                  # all presets, JSON to stdout
 *   pnpm tsx scripts/sensitivity.ts CHICXULUB        # single impact preset
 *   pnpm tsx scripts/sensitivity.ts --pretty         # pretty-printed
 *
 * Output is a JSON document mapping each preset to its OAT
 * sensitivity table. Useful as a docs/ artefact ("the impact final
 * crater diameter is dominated by impactor diameter with elasticity
 * ≈ 1.4") and as a regression aid: future formula edits that
 * unexpectedly flip a sign or scale a dominant elasticity by 2× are
 * red flags worth reviewing.
 */

import { simulateExplosion } from '../src/physics/events/explosion/index.js';
import { simulateImpact, IMPACT_PRESETS } from '../src/physics/simulate.js';
import { kgPerM3, m, mps } from '../src/physics/units.js';
import {
  IMPACT_INPUT_SIGMA,
  EXPLOSION_INPUT_SIGMA,
  asLinearHalfRange,
} from '../src/physics/uq/conventions.js';
import { oatSensitivity } from '../src/physics/uq/sensitivity.js';

interface CliOpts {
  pretty: boolean;
  presetFilter: string | null;
}

function parseArgs(argv: string[]): CliOpts {
  const opts: CliOpts = { pretty: false, presetFilter: null };
  for (const arg of argv) {
    if (arg === '--pretty') opts.pretty = true;
    else if (!arg.startsWith('--')) opts.presetFilter = arg;
  }
  return opts;
}

function impactSensitivityFor(presetId: keyof typeof IMPACT_PRESETS): unknown {
  const preset = IMPACT_PRESETS[presetId];
  const inp = preset.input;
  const nominal = {
    diameter: inp.impactorDiameter as number,
    velocity: inp.impactVelocity as number,
    density: inp.impactorDensity as number,
  };
  const sigmas = {
    diameter: nominal.diameter * asLinearHalfRange(IMPACT_INPUT_SIGMA.diameter),
    velocity: nominal.velocity * asLinearHalfRange(IMPACT_INPUT_SIGMA.velocity),
    density: nominal.density * asLinearHalfRange(IMPACT_INPUT_SIGMA.density),
  };
  return oatSensitivity({
    nominal,
    sigmas,
    simulate: (p) => {
      const r = simulateImpact({
        impactorDiameter: m(p.diameter),
        impactVelocity: mps(p.velocity),
        impactorDensity: kgPerM3(p.density),
        targetDensity: inp.targetDensity,
        impactAngle: inp.impactAngle,
        surfaceGravity: inp.surfaceGravity,
      });
      return {
        kineticEnergy: r.impactor.kineticEnergy,
        kineticEnergyMt: r.impactor.kineticEnergyMegatons,
        finalCraterDiameter: r.crater.finalDiameter,
        ejectaEdge1m: r.ejecta.blanketEdge1m,
        seismicMw: r.seismic.magnitudeTeanbyWookey,
      };
    },
  });
}

function explosionSensitivityFor(yieldMt: number, hob: number): unknown {
  const nominal = { yieldMt, hob } as const satisfies Record<string, number>;
  const sigmas = {
    yieldMt: yieldMt * asLinearHalfRange(EXPLOSION_INPUT_SIGMA.yield),
    hob: Math.max(EXPLOSION_INPUT_SIGMA.heightOfBurst.sigma, 0.05 * hob),
  } as const satisfies Record<string, number>;
  return oatSensitivity({
    nominal,
    sigmas,
    simulate: (p): Record<string, number> => {
      const r = simulateExplosion({
        yieldMegatons: p.yieldMt,
        heightOfBurst: m(Math.max(p.hob, 0)),
      });
      return {
        fivePsiRadius: r.blast.overpressure5psiRadiusHob,
        onePsiRadius: r.blast.overpressure1psiRadiusHob,
        burn3rdDegree: r.thermal.thirdDegreeBurnRadius,
        firestormIgnition: r.firestorm.ignitionRadius,
      };
    },
  });
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  const out: Record<string, unknown> = {};

  for (const id of Object.keys(IMPACT_PRESETS) as (keyof typeof IMPACT_PRESETS)[]) {
    if (opts.presetFilter && id !== opts.presetFilter) continue;
    out[`impact:${id}`] = impactSensitivityFor(id);
  }

  // A pair of representative explosion preset shapes so the output
  // includes both an airburst and a groundburst.
  out['explosion:HIROSHIMA-shape'] = explosionSensitivityFor(0.015, 580);
  out['explosion:CASTLE_BRAVO-shape'] = explosionSensitivityFor(15, 0);
  out['explosion:TSAR_BOMBA-shape'] = explosionSensitivityFor(50, 4_000);

  const json = JSON.stringify(out, null, opts.pretty ? 2 : 0);
  process.stdout.write(`${json}\n`);
}

main();
