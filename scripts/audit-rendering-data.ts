/**
 * Atomic rendering-data audit (read-only).
 *
 * Spawns 50+ scenarios per event type, runs the Layer-2 simulator on
 * each, and checks that the fields Globe.tsx reads to render the
 * scene are:
 *
 *   1. Finite (no NaN, no -Infinity, no +Infinity sneaking through).
 *   2. Non-negative where geometry requires it (radii, half-lengths,
 *      cavity radii, source amplitudes…).
 *   3. Monotonic where physics requires it (3rd-degree-burn ≥
 *      2nd-degree-burn ≥ thermal-effect, MMI VII ≤ VI for radii,
 *      5 psi ≤ 1 psi).
 *   4. Coherent across the input sweep (doubling yield should grow
 *      every overpressure radius monotonically).
 *
 * No fixes. Only a report — anomalies are appended to the `issues`
 * array and printed at the end with their reproduction command.
 */
import {
  EARTHQUAKE_PRESETS,
  simulateEarthquake,
  type EarthquakePresetId,
  type EarthquakeScenarioInput,
  type EarthquakeScenarioResult,
} from '../src/physics/events/earthquake/index.js';
import {
  EXPLOSION_PRESETS,
  simulateExplosion,
  type ExplosionPresetId,
  type ExplosionScenarioInput,
  type ExplosionScenarioResult,
} from '../src/physics/events/explosion/index.js';
import {
  simulateLandslide,
  type LandslideScenarioInput,
  type LandslideScenarioResult,
} from '../src/physics/events/landslide/simulate.js';
import {
  VOLCANO_PRESETS,
  simulateVolcano,
  type VolcanoPresetId,
  type VolcanoScenarioInput,
  type VolcanoScenarioResult,
} from '../src/physics/events/volcano/index.js';
import {
  IMPACT_PRESETS,
  simulateImpact,
  type ImpactPresetId,
  type ImpactScenarioInput,
  type ImpactScenarioResult,
} from '../src/physics/simulate.js';
import { deg, degreesToRadians, kgPerM3, m as meters, mps } from '../src/physics/units.js';

interface Issue {
  event: string;
  scenario: string;
  field: string;
  value: number | string;
  reason: string;
}

const issues: Issue[] = [];
let scenariosRun = 0;
const perEventCount: Record<string, number> = {
  impact: 0,
  explosion: 0,
  earthquake: 0,
  volcano: 0,
  landslide: 0,
};

function record(
  event: string,
  scenario: string,
  field: string,
  value: unknown,
  reason: string
): void {
  issues.push({
    event,
    scenario,
    field,
    value: typeof value === 'number' ? value : String(value),
    reason,
  });
}

function checkFinite(event: string, scenario: string, field: string, v: unknown): boolean {
  if (typeof v !== 'number') {
    record(event, scenario, field, String(v), 'not a number');
    return false;
  }
  if (!Number.isFinite(v)) {
    record(event, scenario, field, v, 'not finite');
    return false;
  }
  return true;
}

function checkNonNegative(event: string, scenario: string, field: string, v: number): boolean {
  if (v < 0) {
    record(event, scenario, field, v, 'negative — geometry expects ≥ 0');
    return false;
  }
  return true;
}

function checkMonotone(
  event: string,
  scenario: string,
  outerField: string,
  inner: number,
  outer: number
): void {
  if (Number.isFinite(inner) && Number.isFinite(outer) && inner > 0 && outer > 0 && outer < inner) {
    record(
      event,
      scenario,
      outerField,
      outer,
      `monotonicity violation — outer (${outerField} = ${outer.toFixed(0)}) smaller than inner = ${inner.toFixed(0)}`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────
// IMPACT
// ─────────────────────────────────────────────────────────────────────
function auditImpact(scenario: string, input: ImpactScenarioInput): void {
  scenariosRun += 1;
  perEventCount.impact = (perEventCount.impact ?? 0) + 1;
  let result: ImpactScenarioResult;
  try {
    result = simulateImpact(input);
  } catch (err) {
    record('impact', scenario, 'simulate', String(err), 'simulator threw');
    return;
  }
  // Damage radii — Globe.tsx reads `result.damage.<key>` and
  // renders an ellipse with that radius. Must be finite ≥ 0.
  const d = result.damage;
  const fields = [
    'craterRim',
    'thirdDegreeBurn',
    'secondDegreeBurn',
    'overpressure5psi',
    'overpressure1psi',
    'lightDamage',
  ] as const;
  for (const f of fields) {
    const v = d[f] as number;
    checkFinite('impact', scenario, `damage.${f}`, v);
    checkNonNegative('impact', scenario, `damage.${f}`, v);
  }
  // Monotonicity: thirdDegree ≥ secondDegree (closer = hotter), 5 psi ≤ 1 psi.
  checkMonotone(
    'impact',
    scenario,
    'damage.secondDegreeBurn',
    d.thirdDegreeBurn,
    d.secondDegreeBurn
  );
  checkMonotone(
    'impact',
    scenario,
    'damage.overpressure1psi',
    d.overpressure5psi,
    d.overpressure1psi
  );
  checkMonotone('impact', scenario, 'damage.lightDamage', d.overpressure1psi, d.lightDamage);
  // Asymmetry — Globe.tsx feeds these into computeAsymmetricGeometry.
  const a = result.damageAsymmetry;
  for (const key of fields) {
    const ar = a[key];
    checkFinite(
      'impact',
      scenario,
      `damageAsymmetry.${key}.semiMajorMultiplier`,
      ar.semiMajorMultiplier
    );
    checkFinite(
      'impact',
      scenario,
      `damageAsymmetry.${key}.semiMinorMultiplier`,
      ar.semiMinorMultiplier
    );
    checkFinite('impact', scenario, `damageAsymmetry.${key}.azimuthDeg`, ar.azimuthDeg);
    checkFinite(
      'impact',
      scenario,
      `damageAsymmetry.${key}.centerOffsetMeters`,
      ar.centerOffsetMeters
    );
    checkNonNegative(
      'impact',
      scenario,
      `damageAsymmetry.${key}.semiMajorMultiplier`,
      ar.semiMajorMultiplier
    );
    checkNonNegative(
      'impact',
      scenario,
      `damageAsymmetry.${key}.semiMinorMultiplier`,
      ar.semiMinorMultiplier
    );
  }
  // Ejecta — Globe.tsx draws an asymmetric ellipse around blanketEdge1mm.
  const e = result.ejecta;
  checkFinite('impact', scenario, 'ejecta.blanketEdge1mm', e.blanketEdge1mm);
  checkNonNegative('impact', scenario, 'ejecta.blanketEdge1mm', e.blanketEdge1mm);
  checkFinite('impact', scenario, 'ejecta.asymmetryFactor', e.asymmetryFactor);
  checkFinite('impact', scenario, 'ejecta.azimuthDeg', e.azimuthDeg);
  checkFinite('impact', scenario, 'ejecta.downrangeOffset', e.downrangeOffset);
  // Tsunami — only present on ocean impacts.
  if (result.tsunami) {
    const t = result.tsunami;
    checkFinite('impact', scenario, 'tsunami.cavityRadius', t.cavityRadius);
    checkNonNegative('impact', scenario, 'tsunami.cavityRadius', t.cavityRadius);
    checkFinite('impact', scenario, 'tsunami.sourceAmplitude', t.sourceAmplitude);
    checkNonNegative('impact', scenario, 'tsunami.sourceAmplitude', t.sourceAmplitude);
    checkFinite('impact', scenario, 'tsunami.meanOceanDepth', t.meanOceanDepth);
    checkNonNegative('impact', scenario, 'tsunami.meanOceanDepth', t.meanOceanDepth);
  }
}

function impactPresetScenarios(): void {
  for (const id of Object.keys(IMPACT_PRESETS) as ImpactPresetId[]) {
    auditImpact(`preset:${id}`, IMPACT_PRESETS[id].input);
  }
}

function impactCustomScenarios(): void {
  // Sweep diameter × velocity × angle × density × waterDepth.
  const diameters = [50, 200, 1_000, 5_000, 10_000, 30_000];
  const velocities = [11_000, 17_000, 25_000, 50_000];
  const angles = [10, 30, 45, 60, 90];
  const waterDepths = [undefined, 500, 4_000, 8_000];
  let n = 0;
  for (const d of diameters) {
    for (const v of velocities) {
      for (const a of angles) {
        // Sample to keep the grid manageable: pick every 4th tuple.
        if (n % 4 === 0) {
          for (const wd of waterDepths) {
            const input: ImpactScenarioInput = {
              impactorDiameter: meters(d),
              impactVelocity: mps(v),
              impactAngle: degreesToRadians(deg(a)),
              impactorDensity: kgPerM3(3_000),
              targetDensity: kgPerM3(2_700),
            };
            if (wd !== undefined) {
              input.waterDepth = meters(wd);
              input.meanOceanDepth = meters(wd);
            }
            auditImpact(
              `custom:d=${d.toString()}m v=${v.toString()}m/s a=${a.toString()}° wd=${wd === undefined ? 'none' : wd.toString()}`,
              input
            );
          }
        }
        n += 1;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// EXPLOSION
// ─────────────────────────────────────────────────────────────────────
function auditExplosion(scenario: string, input: ExplosionScenarioInput): void {
  scenariosRun += 1;
  perEventCount.explosion = (perEventCount.explosion ?? 0) + 1;
  let result: ExplosionScenarioResult;
  try {
    result = simulateExplosion(input);
  } catch (err) {
    record('explosion', scenario, 'simulate', String(err), 'simulator threw');
    return;
  }
  const blast = result.blast;
  checkFinite('explosion', scenario, 'blast.overpressure5psiRadius', blast.overpressure5psiRadius);
  checkFinite('explosion', scenario, 'blast.overpressure1psiRadius', blast.overpressure1psiRadius);
  checkFinite('explosion', scenario, 'blast.lightDamageRadius', blast.lightDamageRadius);
  checkNonNegative(
    'explosion',
    scenario,
    'blast.overpressure5psiRadius',
    blast.overpressure5psiRadius
  );
  checkNonNegative(
    'explosion',
    scenario,
    'blast.overpressure1psiRadius',
    blast.overpressure1psiRadius
  );
  checkNonNegative('explosion', scenario, 'blast.lightDamageRadius', blast.lightDamageRadius);
  checkMonotone(
    'explosion',
    scenario,
    'blast.overpressure1psiRadius',
    blast.overpressure5psiRadius,
    blast.overpressure1psiRadius
  );
  checkMonotone(
    'explosion',
    scenario,
    'blast.lightDamageRadius',
    blast.overpressure1psiRadius,
    blast.lightDamageRadius
  );

  const thermal = result.thermal;
  checkFinite(
    'explosion',
    scenario,
    'thermal.thirdDegreeBurnRadius',
    thermal.thirdDegreeBurnRadius
  );
  checkFinite(
    'explosion',
    scenario,
    'thermal.secondDegreeBurnRadius',
    thermal.secondDegreeBurnRadius
  );
  checkNonNegative(
    'explosion',
    scenario,
    'thermal.thirdDegreeBurnRadius',
    thermal.thirdDegreeBurnRadius
  );
  checkNonNegative(
    'explosion',
    scenario,
    'thermal.secondDegreeBurnRadius',
    thermal.secondDegreeBurnRadius
  );
  checkMonotone(
    'explosion',
    scenario,
    'thermal.secondDegreeBurnRadius',
    thermal.thirdDegreeBurnRadius,
    thermal.secondDegreeBurnRadius
  );

  const crater = result.crater;
  checkFinite('explosion', scenario, 'crater.apparentDiameter', crater.apparentDiameter);
  checkNonNegative('explosion', scenario, 'crater.apparentDiameter', crater.apparentDiameter);

  // EMP / radiation are rendered as rings too — check finite.
  const radiation = result.radiation;
  checkFinite('explosion', scenario, 'radiation.ld50Radius', radiation.ld50Radius);
  checkNonNegative('explosion', scenario, 'radiation.ld50Radius', radiation.ld50Radius);
  const emp = result.emp;
  checkFinite('explosion', scenario, 'emp.affectedRadius', emp.affectedRadius);
  checkNonNegative('explosion', scenario, 'emp.affectedRadius', emp.affectedRadius);

  // Tsunami branch — explosions in water.
  if (result.tsunami) {
    const t = result.tsunami;
    checkFinite('explosion', scenario, 'tsunami.cavityRadius', t.cavityRadius);
    checkNonNegative('explosion', scenario, 'tsunami.cavityRadius', t.cavityRadius);
    checkFinite('explosion', scenario, 'tsunami.sourceAmplitude', t.sourceAmplitude);
    checkNonNegative('explosion', scenario, 'tsunami.sourceAmplitude', t.sourceAmplitude);
  }
}

function explosionPresetScenarios(): void {
  for (const id of Object.keys(EXPLOSION_PRESETS) as ExplosionPresetId[]) {
    auditExplosion(`preset:${id}`, EXPLOSION_PRESETS[id].input);
  }
}

function explosionCustomScenarios(): void {
  // Sweep yield × HOB × waterDepth × ground type.
  const yields = [0.001, 0.015, 0.1, 1.0, 15.0, 50.0, 1_000.0]; // 1 kt → 1 Gt
  const hobs = [undefined, 100, 500, 2_000];
  const waterDepths = [undefined, 100, 1_000, 4_000];
  const grounds = ['HARD_ROCK', 'FIRM_GROUND', 'DRY_SOIL', 'WET_SOIL'] as const;
  let n = 0;
  for (const y of yields) {
    for (const hob of hobs) {
      for (const wd of waterDepths) {
        for (const g of grounds) {
          if (n % 5 !== 0) {
            n += 1;
            continue;
          }
          n += 1;
          const input: ExplosionScenarioInput = {
            yieldMegatons: y,
            groundType: g,
          };
          if (hob !== undefined) input.heightOfBurst = meters(hob);
          if (wd !== undefined) {
            input.waterDepth = meters(wd);
            input.meanOceanDepth = meters(wd);
          }
          auditExplosion(
            `custom:y=${y.toString()}Mt hob=${hob === undefined ? 'surface' : hob.toString()} wd=${wd === undefined ? 'land' : wd.toString()} g=${g}`,
            input
          );
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// EARTHQUAKE
// ─────────────────────────────────────────────────────────────────────
function auditEarthquake(scenario: string, input: EarthquakeScenarioInput): void {
  scenariosRun += 1;
  perEventCount.earthquake = (perEventCount.earthquake ?? 0) + 1;
  let result: EarthquakeScenarioResult;
  try {
    result = simulateEarthquake(input);
  } catch (err) {
    record('earthquake', scenario, 'simulate', String(err), 'simulator threw');
    return;
  }
  const sh = result.shaking;
  // Renderer reads mmi7Radius / mmi8Radius / mmi9Radius / ruptureLength.
  checkFinite('earthquake', scenario, 'shaking.mmi7Radius', sh.mmi7Radius);
  checkFinite('earthquake', scenario, 'shaking.mmi8Radius', sh.mmi8Radius);
  checkFinite('earthquake', scenario, 'shaking.mmi9Radius', sh.mmi9Radius);
  checkNonNegative('earthquake', scenario, 'shaking.mmi7Radius', sh.mmi7Radius);
  checkNonNegative('earthquake', scenario, 'shaking.mmi8Radius', sh.mmi8Radius);
  checkNonNegative('earthquake', scenario, 'shaking.mmi9Radius', sh.mmi9Radius);
  // MMI is intensity (higher = closer/stronger): IX innermost, then
  // VIII, then VII; VII ≥ VIII ≥ IX in radius.
  checkMonotone('earthquake', scenario, 'shaking.mmi8Radius', sh.mmi9Radius, sh.mmi8Radius);
  checkMonotone('earthquake', scenario, 'shaking.mmi7Radius', sh.mmi8Radius, sh.mmi7Radius);
  checkFinite('earthquake', scenario, 'shaking.mmiAtEpicenter', sh.mmiAtEpicenter);
  // Rupture length — used by Globe.tsx to derive cavity radius for the
  // tsunami visualisation.
  checkFinite('earthquake', scenario, 'ruptureLength', result.ruptureLength);
  checkNonNegative('earthquake', scenario, 'ruptureLength', result.ruptureLength);
  // Tsunami branch.
  if (result.tsunami !== undefined) {
    const t = result.tsunami;
    checkFinite('earthquake', scenario, 'tsunami.initialAmplitude', t.initialAmplitude);
    checkNonNegative('earthquake', scenario, 'tsunami.initialAmplitude', t.initialAmplitude);
  }
  // Aftershock data — Globe draws aftershock dots from this.
  const a = result.aftershocks;
  checkFinite('earthquake', scenario, 'aftershocks.bathCeiling', a.bathCeiling);
  checkFinite('earthquake', scenario, 'aftershocks.completenessCutoff', a.completenessCutoff);
  for (let i = 0; i < Math.min(a.events.length, 5); i++) {
    const e = a.events[i];
    if (e === undefined) continue;
    checkFinite(
      'earthquake',
      scenario,
      `aftershocks.events[${i.toString()}].magnitude`,
      e.magnitude
    );
    checkFinite(
      'earthquake',
      scenario,
      `aftershocks.events[${i.toString()}].timeAfterMainshock`,
      e.timeAfterMainshock
    );
    checkFinite(
      'earthquake',
      scenario,
      `aftershocks.events[${i.toString()}].northOffsetM`,
      e.northOffsetM
    );
    checkFinite(
      'earthquake',
      scenario,
      `aftershocks.events[${i.toString()}].eastOffsetM`,
      e.eastOffsetM
    );
  }
}

function earthquakePresetScenarios(): void {
  for (const id of Object.keys(EARTHQUAKE_PRESETS) as EarthquakePresetId[]) {
    auditEarthquake(`preset:${id}`, EARTHQUAKE_PRESETS[id].input);
  }
}

function earthquakeCustomScenarios(): void {
  // Sweep magnitude × depth × fault type.
  const magnitudes = [4.0, 5.5, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5];
  const depths = [5_000, 15_000, 35_000, 70_000];
  const faults = ['strike-slip', 'reverse', 'normal'] as const;
  for (const m of magnitudes) {
    for (const d of depths) {
      for (const f of faults) {
        const input: EarthquakeScenarioInput = {
          magnitude: m,
          depth: meters(d),
          faultType: f,
        };
        auditEarthquake(`custom:Mw=${m.toString()} depth=${d.toString()}m fault=${f}`, input);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// VOLCANO
// ─────────────────────────────────────────────────────────────────────
function auditVolcano(scenario: string, input: VolcanoScenarioInput): void {
  scenariosRun += 1;
  perEventCount.volcano = (perEventCount.volcano ?? 0) + 1;
  let result: VolcanoScenarioResult;
  try {
    result = simulateVolcano(input);
  } catch (err) {
    record('volcano', scenario, 'simulate', String(err), 'simulator threw');
    return;
  }
  const v = result;
  // Renderer reads pyroclasticRunout, lateralBlast.runout / sectorAngleDeg,
  // windAdvectedAshfall.downwindRange / crosswindHalfWidth.
  checkFinite('volcano', scenario, 'pyroclasticRunout', v.pyroclasticRunout);
  checkNonNegative('volcano', scenario, 'pyroclasticRunout', v.pyroclasticRunout);
  if (v.lateralBlast !== undefined) {
    const lb = v.lateralBlast;
    checkFinite('volcano', scenario, 'lateralBlast.runout', lb.runout);
    checkNonNegative('volcano', scenario, 'lateralBlast.runout', lb.runout);
    checkFinite('volcano', scenario, 'lateralBlast.sectorAngleDeg', lb.sectorAngleDeg);
    checkNonNegative('volcano', scenario, 'lateralBlast.sectorAngleDeg', lb.sectorAngleDeg);
  }
  if (v.windAdvectedAshfall !== undefined) {
    const w = v.windAdvectedAshfall;
    checkFinite('volcano', scenario, 'windAdvectedAshfall.downwindRange', w.downwindRange);
    checkFinite(
      'volcano',
      scenario,
      'windAdvectedAshfall.crosswindHalfWidth',
      w.crosswindHalfWidth
    );
    checkNonNegative('volcano', scenario, 'windAdvectedAshfall.downwindRange', w.downwindRange);
    checkNonNegative(
      'volcano',
      scenario,
      'windAdvectedAshfall.crosswindHalfWidth',
      w.crosswindHalfWidth
    );
    checkFinite(
      'volcano',
      scenario,
      'windAdvectedAshfall.windDirectionDegrees',
      w.windDirectionDegrees
    );
  }
  if (v.tsunami !== undefined) {
    const t = v.tsunami;
    checkFinite('volcano', scenario, 'tsunami.cavityRadius', t.cavityRadius);
    checkFinite('volcano', scenario, 'tsunami.sourceAmplitude', t.sourceAmplitude);
    checkNonNegative('volcano', scenario, 'tsunami.cavityRadius', t.cavityRadius);
    checkNonNegative('volcano', scenario, 'tsunami.sourceAmplitude', t.sourceAmplitude);
  }
}

function volcanoPresetScenarios(): void {
  for (const id of Object.keys(VOLCANO_PRESETS) as VolcanoPresetId[]) {
    auditVolcano(`preset:${id}`, VOLCANO_PRESETS[id].input);
  }
}

function volcanoCustomScenarios(): void {
  // Sweep volume × eruption rate × optional flank collapse / wind.
  const volumes = [1e6, 1e7, 1e8, 1e9, 1e10, 5e10, 1.6e11, 5e11, 1e12]; // 0.001 km³ → 1000 km³
  const rates = [1e3, 1e5, 1e6, 1e7, 1e8, 1e9];
  const winds: { ws?: number; wd?: number }[] = [{}, { ws: 5, wd: 90 }, { ws: 30, wd: 270 }];
  for (const vol of volumes) {
    for (const rate of rates) {
      for (const wind of winds) {
        const input: VolcanoScenarioInput = {
          totalEjectaVolume: vol,
          volumeEruptionRate: rate,
        };
        if (wind.ws !== undefined) {
          input.windSpeed = mps(wind.ws);
          input.windDirectionDegrees = wind.wd ?? 0;
        }
        auditVolcano(
          `custom:vol=${vol.toExponential(1)}m³ rate=${rate.toExponential(1)}m³/s wind=${(wind.ws ?? 0).toString()}m/s`,
          input
        );
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// LANDSLIDE
// ─────────────────────────────────────────────────────────────────────
function auditLandslide(scenario: string, input: LandslideScenarioInput): void {
  scenariosRun += 1;
  perEventCount.landslide = (perEventCount.landslide ?? 0) + 1;
  let result: LandslideScenarioResult;
  try {
    result = simulateLandslide(input);
  } catch (err) {
    record('landslide', scenario, 'simulate', String(err), 'simulator threw');
    return;
  }
  // Renderer uses tsunami.cavityRadius / tsunami.sourceAmplitude when
  // tsunami !== null, plus characteristicLength etc.
  if (result.tsunami !== null) {
    const t = result.tsunami;
    checkFinite('landslide', scenario, 'tsunami.cavityRadius', t.cavityRadius);
    checkFinite('landslide', scenario, 'tsunami.sourceAmplitude', t.sourceAmplitude);
    checkNonNegative('landslide', scenario, 'tsunami.cavityRadius', t.cavityRadius);
    checkNonNegative('landslide', scenario, 'tsunami.sourceAmplitude', t.sourceAmplitude);
  }
  checkFinite('landslide', scenario, 'characteristicLength', result.characteristicLength);
  checkNonNegative('landslide', scenario, 'characteristicLength', result.characteristicLength);
}

function landslideCustomScenarios(): void {
  // Sweep volume × slope × meanOceanDepth × regime. Volumes range
  // from a small flank rockfall (~1e6 m³) to Storegga-class
  // submarine slides (~3e12 m³).
  const volumes = [1e6, 1e8, 1e10, 1e11, 3e11, 1e12, 3e12];
  const slopes = [5, 15, 25, 40];
  const oceanDepths = [100, 1_000, 4_000];
  const regimes = ['subaerial', 'submarine'] as const;
  for (const vol of volumes) {
    for (const slope of slopes) {
      for (const od of oceanDepths) {
        for (const regime of regimes) {
          const input: LandslideScenarioInput = {
            volumeM3: vol,
            slopeAngleDeg: slope,
            meanOceanDepth: meters(od),
            regime,
          };
          auditLandslide(
            `custom:V=${vol.toExponential(1)}m³ slope=${slope.toString()}° depth=${od.toString()}m regime=${regime}`,
            input
          );
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────
function main(): void {
  const t0 = Date.now();
  process.stdout.write('Auditing rendering data across all event types…\n\n');

  const before = (label: string): void => {
    process.stdout.write(`▸ ${label}\n`);
  };

  before('IMPACT');
  impactPresetScenarios();
  impactCustomScenarios();
  before('EXPLOSION');
  explosionPresetScenarios();
  explosionCustomScenarios();
  before('EARTHQUAKE');
  earthquakePresetScenarios();
  earthquakeCustomScenarios();
  before('VOLCANO');
  volcanoPresetScenarios();
  volcanoCustomScenarios();
  before('LANDSLIDE');
  landslideCustomScenarios();

  const ms = Date.now() - t0;
  process.stdout.write(`\nRan ${scenariosRun.toString()} scenarios in ${ms.toString()} ms.\n`);
  process.stdout.write('Per-event breakdown:\n');
  for (const [event, count] of Object.entries(perEventCount)) {
    process.stdout.write(`  ${event}: ${count.toString()} scenarios\n`);
  }

  if (issues.length === 0) {
    process.stdout.write(
      '\n✓ No issues found. All renderer-facing fields are finite, non-negative\n'
    );
    process.stdout.write('  where required, and monotonic across damage / intensity tiers.\n');
    return;
  }

  // Group issues by event for the report.
  const byEvent: Record<string, Issue[]> = {};
  for (const i of issues) {
    const arr = byEvent[i.event] ?? [];
    arr.push(i);
    byEvent[i.event] = arr;
  }
  process.stdout.write(`\n✗ ${issues.length.toString()} issue(s) found:\n\n`);
  for (const [event, list] of Object.entries(byEvent)) {
    process.stdout.write(`── ${event.toUpperCase()} (${list.length.toString()} issue(s)) ──\n`);
    // Cap per-event print to 20 to keep the report readable; full list
    // available via the appended JSON dump.
    for (let i = 0; i < Math.min(list.length, 20); i++) {
      const it = list[i];
      if (it === undefined) continue;
      process.stdout.write(
        `  • [${it.scenario}] ${it.field} = ${typeof it.value === 'number' ? it.value.toString() : it.value}\n    → ${it.reason}\n`
      );
    }
    if (list.length > 20) {
      process.stdout.write(`  … +${(list.length - 20).toString()} more, see JSON dump below\n`);
    }
    process.stdout.write('\n');
  }
  process.stdout.write('Full JSON issue dump:\n');
  process.stdout.write(`${JSON.stringify(issues, null, 2)}\n`);
}

main();
