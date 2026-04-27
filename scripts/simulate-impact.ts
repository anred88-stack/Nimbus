import { parseArgs } from 'node:util';
import {
  EARTHQUAKE_PRESETS,
  simulateEarthquake,
  type EarthquakePresetId,
  type EarthquakeScenarioInput,
} from '../src/physics/events/earthquake/index.js';
import {
  EXPLOSION_PRESETS,
  simulateExplosion,
  type ExplosionPresetId,
  type ExplosionScenarioInput,
} from '../src/physics/events/explosion/index.js';
import {
  VOLCANO_PRESETS,
  simulateVolcano,
  type VolcanoPresetId,
  type VolcanoScenarioInput,
} from '../src/physics/events/volcano/index.js';
import {
  IMPACT_PRESETS,
  simulateImpact,
  type ImpactPresetId,
  type ImpactScenarioInput,
} from '../src/physics/simulate.js';
import { deg, degreesToRadians, kgPerM3, m as meters, mps } from '../src/physics/units.js';

const USAGE = `
Usage: pnpm simulate [options]

Event selection:
  --event <type>     impact (default) | explosion | earthquake | volcano

Impact options (used when --event = impact):
  --preset <id>       CHICXULUB (default), CHICXULUB_OCEAN, TUNGUSKA, METEOR_CRATER
  --diameter <m>      Impactor diameter (m). Overrides the preset value.
  --velocity <m/s>    Impact velocity (m/s). Overrides the preset value.
  --density <kg/m3>   Impactor bulk density (kg/m³).
  --angle <deg>       Impact angle from horizontal (degrees).
  --target <kg/m3>    Target-ground density (kg/m³).
  --gravity <m/s2>    Surface gravity (m/s²).
  --water-depth <m>   > 0 triggers the Ward & Asphaug tsunami cascade.
  --ocean-depth <m>   Mean basin depth (m) for tsunami travel time.

Explosion options (used when --event = explosion):
  --preset <id>       HIROSHIMA_1945 (default), NAGASAKI_1945,
                      CASTLE_BRAVO_1954, TSAR_BOMBA_1961, ONE_MEGATON
  --yield <Mt>        TNT-equivalent yield in megatons (e.g. 0.015 for 15 kt).
  --ground <type>     HARD_ROCK | FIRM_GROUND | DRY_SOIL | WET_SOIL.

Earthquake options (used when --event = earthquake):
  --preset <id>       TOHOKU_2011 (default), NORTHRIDGE_1994, KUNLUN_2001
  --magnitude <Mw>    Moment magnitude override.
  --depth <m>         Hypocenter depth (m).
  --fault <type>      strike-slip | reverse | normal | all.

Volcano options (used when --event = volcano):
  --preset <id>       KRAKATAU_1883 (default), MT_ST_HELENS_1980, TAMBORA_1815
  --v-rate <m3/s>     Volume eruption rate V̇.
  --ejecta <m3>       Total bulk ejecta volume.

Global:
  --help              Print this help message and exit.

Output: a JSON snapshot on stdout, suitable for piping into jq or saving
as a regression fixture. Numeric fields are in SI units (m, kg, J, s …).
`.trimStart();

type EventType = 'impact' | 'explosion' | 'earthquake' | 'volcano';

type FaultType = EarthquakeScenarioInput['faultType'];
type GroundType = NonNullable<ExplosionScenarioInput['groundType']>;

interface ParsedArgs {
  event?: EventType;
  preset?: string;
  diameter?: number;
  velocity?: number;
  density?: number;
  angle?: number;
  target?: number;
  gravity?: number;
  waterDepth?: number;
  oceanDepth?: number;
  magnitude?: number;
  depth?: number;
  fault?: FaultType;
  vRate?: number;
  ejecta?: number;
  yieldMegatons?: number;
  ground?: GroundType;
  help?: boolean;
}

function parseCli(argv: string[]): ParsedArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      event: { type: 'string' },
      preset: { type: 'string' },
      diameter: { type: 'string' },
      velocity: { type: 'string' },
      density: { type: 'string' },
      angle: { type: 'string' },
      target: { type: 'string' },
      gravity: { type: 'string' },
      'water-depth': { type: 'string' },
      'ocean-depth': { type: 'string' },
      magnitude: { type: 'string' },
      depth: { type: 'string' },
      fault: { type: 'string' },
      'v-rate': { type: 'string' },
      ejecta: { type: 'string' },
      yield: { type: 'string' },
      ground: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
    allowPositionals: false,
  });

  const toNumber = (raw: string | undefined, label: string): number | undefined => {
    if (raw === undefined) return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      throw new Error(`--${label} must be a finite number, got "${raw}"`);
    }
    return n;
  };

  const parsed: ParsedArgs = {};
  if (values.event !== undefined) {
    if (
      values.event !== 'impact' &&
      values.event !== 'explosion' &&
      values.event !== 'earthquake' &&
      values.event !== 'volcano'
    ) {
      throw new Error(
        `--event must be one of impact | explosion | earthquake | volcano, got "${values.event}"`
      );
    }
    parsed.event = values.event;
  }
  if (values.preset !== undefined) parsed.preset = values.preset;
  const d = toNumber(values.diameter, 'diameter');
  if (d !== undefined) parsed.diameter = d;
  const v = toNumber(values.velocity, 'velocity');
  if (v !== undefined) parsed.velocity = v;
  const den = toNumber(values.density, 'density');
  if (den !== undefined) parsed.density = den;
  const a = toNumber(values.angle, 'angle');
  if (a !== undefined) parsed.angle = a;
  const t = toNumber(values.target, 'target');
  if (t !== undefined) parsed.target = t;
  const g = toNumber(values.gravity, 'gravity');
  if (g !== undefined) parsed.gravity = g;
  const wd = toNumber(values['water-depth'], 'water-depth');
  if (wd !== undefined) parsed.waterDepth = wd;
  const od = toNumber(values['ocean-depth'], 'ocean-depth');
  if (od !== undefined) parsed.oceanDepth = od;
  const mag = toNumber(values.magnitude, 'magnitude');
  if (mag !== undefined) parsed.magnitude = mag;
  const dep = toNumber(values.depth, 'depth');
  if (dep !== undefined) parsed.depth = dep;
  if (values.fault !== undefined) {
    if (
      values.fault !== 'strike-slip' &&
      values.fault !== 'reverse' &&
      values.fault !== 'normal' &&
      values.fault !== 'all'
    ) {
      throw new Error(
        `--fault must be strike-slip | reverse | normal | all, got "${values.fault}"`
      );
    }
    parsed.fault = values.fault;
  }
  const vr = toNumber(values['v-rate'], 'v-rate');
  if (vr !== undefined) parsed.vRate = vr;
  const ej = toNumber(values.ejecta, 'ejecta');
  if (ej !== undefined) parsed.ejecta = ej;
  const y = toNumber(values.yield, 'yield');
  if (y !== undefined) parsed.yieldMegatons = y;
  if (values.ground !== undefined) {
    if (
      values.ground !== 'HARD_ROCK' &&
      values.ground !== 'FIRM_GROUND' &&
      values.ground !== 'DRY_SOIL' &&
      values.ground !== 'WET_SOIL'
    ) {
      throw new Error(
        `--ground must be HARD_ROCK | FIRM_GROUND | DRY_SOIL | WET_SOIL, got "${values.ground}"`
      );
    }
    parsed.ground = values.ground;
  }
  if (values.help === true) parsed.help = true;
  return parsed;
}

function buildExplosionInput(args: ParsedArgs): ExplosionScenarioInput {
  const presetId = (args.preset ?? 'HIROSHIMA_1945') as ExplosionPresetId;
  if (!(presetId in EXPLOSION_PRESETS)) {
    throw new Error(
      `Unknown explosion preset "${presetId}". Available: ${Object.keys(EXPLOSION_PRESETS).join(', ')}`
    );
  }
  const base: ExplosionScenarioInput = EXPLOSION_PRESETS[presetId].input;
  const out: ExplosionScenarioInput = {
    yieldMegatons: args.yieldMegatons ?? base.yieldMegatons,
    groundType: args.ground ?? base.groundType ?? 'FIRM_GROUND',
  };
  // Pre-Phase-14 the CLI dropped heightOfBurst and waterDepth on the
  // floor when widening the preset to ExplosionScenarioInput. The
  // Hiroshima preset (heightOfBurst=580) was therefore simulated as
  // a contact surface burst, masking the HOB amplification factor
  // 1.5 in the audit. Pass them through explicitly.
  if (base.heightOfBurst !== undefined) out.heightOfBurst = base.heightOfBurst;
  if (base.waterDepth !== undefined) out.waterDepth = base.waterDepth;
  if (base.meanOceanDepth !== undefined) out.meanOceanDepth = base.meanOceanDepth;
  return out;
}

function buildImpactInput(args: ParsedArgs): ImpactScenarioInput {
  const presetId = (args.preset ?? 'CHICXULUB') as ImpactPresetId;
  if (!(presetId in IMPACT_PRESETS)) {
    throw new Error(
      `Unknown impact preset "${presetId}". Available: ${Object.keys(IMPACT_PRESETS).join(', ')}`
    );
  }
  // Explicit widening to the shared interface: each preset's `satisfies
  // ImpactScenarioInput` narrows to a literal subtype, so without this
  // annotation TS can't access the common optional fields.
  const base: ImpactScenarioInput = IMPACT_PRESETS[presetId].input;
  const input: ImpactScenarioInput = {
    impactorDiameter: args.diameter !== undefined ? meters(args.diameter) : base.impactorDiameter,
    impactVelocity: args.velocity !== undefined ? mps(args.velocity) : base.impactVelocity,
    impactorDensity: args.density !== undefined ? kgPerM3(args.density) : base.impactorDensity,
    targetDensity: args.target !== undefined ? kgPerM3(args.target) : base.targetDensity,
    impactAngle: args.angle !== undefined ? degreesToRadians(deg(args.angle)) : base.impactAngle,
  };
  const gravity = args.gravity ?? base.surfaceGravity;
  if (gravity !== undefined) input.surfaceGravity = gravity;
  if (args.waterDepth !== undefined) {
    input.waterDepth = meters(args.waterDepth);
  } else if (base.waterDepth !== undefined) {
    input.waterDepth = base.waterDepth;
  }
  if (args.oceanDepth !== undefined) {
    input.meanOceanDepth = meters(args.oceanDepth);
  } else if (base.meanOceanDepth !== undefined) {
    input.meanOceanDepth = base.meanOceanDepth;
  }
  return input;
}

function buildEarthquakeInput(args: ParsedArgs): EarthquakeScenarioInput {
  const presetId = (args.preset ?? 'TOHOKU_2011') as EarthquakePresetId;
  if (!(presetId in EARTHQUAKE_PRESETS)) {
    throw new Error(
      `Unknown earthquake preset "${presetId}". Available: ${Object.keys(EARTHQUAKE_PRESETS).join(', ')}`
    );
  }
  const base: EarthquakeScenarioInput = EARTHQUAKE_PRESETS[presetId].input;
  const input: EarthquakeScenarioInput = {
    magnitude: args.magnitude ?? base.magnitude,
  };
  if (args.depth !== undefined) {
    input.depth = meters(args.depth);
  } else if (base.depth !== undefined) {
    input.depth = base.depth;
  }
  if (args.fault !== undefined) {
    input.faultType = args.fault;
  } else if (base.faultType !== undefined) {
    input.faultType = base.faultType;
  }
  return input;
}

function buildVolcanoInput(args: ParsedArgs): VolcanoScenarioInput {
  const presetId = (args.preset ?? 'KRAKATAU_1883') as VolcanoPresetId;
  if (!(presetId in VOLCANO_PRESETS)) {
    throw new Error(
      `Unknown volcano preset "${presetId}". Available: ${Object.keys(VOLCANO_PRESETS).join(', ')}`
    );
  }
  const base = VOLCANO_PRESETS[presetId].input;
  return {
    volumeEruptionRate: args.vRate ?? base.volumeEruptionRate,
    totalEjectaVolume: args.ejecta ?? base.totalEjectaVolume,
  };
}

/**
 * Stringify branded number values as plain numbers. Rounds to 6
 * significant figures for display — the underlying calculation still
 * runs in full IEEE-754 precision.
 */
function numericReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Math.abs(value) >= 1) return Number(value.toPrecision(6));
    return Number(value.toPrecision(4));
  }
  return value;
}

const IMPACT_CITATIONS = [
  'Collins, Melosh & Marcus (2005) — Earth Impact Effects Program',
  'Pike (1980) — complex crater morphometry',
  'Schultz & Gault (1975) — seismic magnitude of impacts',
  'Glasstone & Dolan (1977) — blast overpressure & thermal fluence',
  'Kinney & Graham (1985) — surface-burst overpressure fit',
];
const EARTHQUAKE_CITATIONS = [
  'Hanks & Kanamori (1979) — moment magnitude scale',
  'Wells & Coppersmith (1994) — rupture-length empirical regression',
  'Joyner & Boore (1981) — peak ground acceleration attenuation',
  'Worden et al. (2012) — ground-motion-to-intensity conversion',
];
const VOLCANO_CITATIONS = [
  'Mastin et al. (2009) — plume-height vs volume eruption rate',
  'Newhall & Self (1982) — Volcanic Explosivity Index',
  'Sheridan (1979) — pyroclastic-flow mobility ratio',
];
const EXPLOSION_CITATIONS = [
  'Glasstone & Dolan (1977) — The Effects of Nuclear Weapons',
  'Kinney & Graham (1985) — surface-burst overpressure fit',
  'Nordyke (1977) — nuclear-crater yield scaling',
];

function main(): void {
  const args = parseCli(process.argv.slice(2));

  if (args.help === true) {
    process.stdout.write(USAGE);
    return;
  }

  const event: EventType = args.event ?? 'impact';
  const snapshot: Record<string, unknown> = {
    generatedBy: 'pnpm simulate (scripts/simulate-impact.ts)',
    generatedAt: new Date().toISOString(),
    event,
  };

  if (event === 'impact') {
    const input = buildImpactInput(args);
    const result = simulateImpact(input);
    snapshot.preset = args.preset ?? 'CHICXULUB';
    snapshot.citations = result.tsunami
      ? [...IMPACT_CITATIONS, 'Ward & Asphaug (2000) — impact-generated tsunami']
      : IMPACT_CITATIONS;
    snapshot.result = result;
  } else if (event === 'explosion') {
    const input = buildExplosionInput(args);
    snapshot.preset = args.preset ?? 'HIROSHIMA_1945';
    snapshot.citations = EXPLOSION_CITATIONS;
    snapshot.result = simulateExplosion(input);
  } else if (event === 'earthquake') {
    const input = buildEarthquakeInput(args);
    snapshot.preset = args.preset ?? 'TOHOKU_2011';
    snapshot.citations = EARTHQUAKE_CITATIONS;
    snapshot.result = simulateEarthquake(input);
  } else {
    const input = buildVolcanoInput(args);
    snapshot.preset = args.preset ?? 'KRAKATAU_1883';
    snapshot.citations = VOLCANO_CITATIONS;
    snapshot.result = simulateVolcano(input);
  }

  process.stdout.write(`${JSON.stringify(snapshot, numericReplacer, 2)}\n`);
}

try {
  main();
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n\n`);
  process.stderr.write(USAGE);
  process.exit(1);
}
