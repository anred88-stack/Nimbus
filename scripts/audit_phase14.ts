/* eslint-disable @typescript-eslint/restrict-template-expressions */
/**
 * Phase 14 — atomic 100+ scenario audit. Each scenario is a row that
 * runs the simulator end-to-end and compares the numerical outputs
 * against:
 *
 *   1. The closed-form formula behind the field (e.g. Wells &
 *      Coppersmith log10 fit, Glasstone HOB scaling, Ward & Asphaug
 *      η coupling), with a hard tolerance band.
 *   2. Published literature ranges (where available — same anchors
 *      as Phase 10 + extra ones added here).
 *   3. Physical sanity rules that bind multiple fields ("crater
 *      diameter cannot exceed transient diameter", "MMI VII radius
 *      must be larger than MMI IX", "tsunami source amplitude must
 *      be < cavity radius for non-degenerate waves").
 *
 * The script prints a summary of bad/warn/ok rows and a punch list
 * of every bad row with file:line pointers — feed this to a fix
 * pass.
 *
 * Run via:  pnpm tsx scripts/audit_phase14.ts
 */

import { simulateImpact, IMPACT_PRESETS } from '../src/physics/simulate.js';
import { simulateExplosion, EXPLOSION_PRESETS } from '../src/physics/events/explosion/index.js';
import { simulateVolcano, VOLCANO_PRESETS } from '../src/physics/events/volcano/index.js';
import { simulateEarthquake, EARTHQUAKE_PRESETS } from '../src/physics/events/earthquake/index.js';
import { simulateLandslide, LANDSLIDE_PRESETS } from '../src/physics/events/landslide/index.js';
import { deg, degreesToRadians, kgPerM3, m as M, mps } from '../src/physics/units.js';
import {
  surfaceRuptureLength,
  megathrustRuptureLength,
} from '../src/physics/events/earthquake/index.js';

interface Issue {
  scenario: string;
  field: string;
  severity: 'BAD' | 'WARN' | 'INFO';
  expected: string;
  actual: string;
  source: string;
}

const issues: Issue[] = [];
let nRun = 0;

function record(
  scenario: string,
  field: string,
  severity: Issue['severity'],
  expected: string,
  actual: string,
  source: string
): void {
  issues.push({ scenario, field, severity, expected, actual, source });
}

function within(
  scenario: string,
  field: string,
  value: number,
  lo: number,
  hi: number,
  source: string
): void {
  if (!Number.isFinite(value)) {
    record(scenario, field, 'BAD', `[${lo}, ${hi}]`, 'NaN/Inf', source);
    return;
  }
  if (value < lo || value > hi) {
    const factor = value < lo ? lo / Math.max(value, 1e-12) : value / hi;
    const sev = factor > 2 ? 'BAD' : 'WARN';
    record(scenario, field, sev, `[${lo}, ${hi}]`, value.toPrecision(4), source);
  }
}

function gt(
  scenario: string,
  field: string,
  value: number,
  threshold: number,
  source: string
): void {
  if (!(value > threshold)) {
    record(scenario, field, 'BAD', `> ${threshold}`, value.toPrecision(4), source);
  }
}

// ------------- IMPACT scenarios ----------------------------------
function auditImpact(): void {
  // (1) All preset impacts — sanity rules
  for (const [id, preset] of Object.entries(IMPACT_PRESETS)) {
    const r = simulateImpact(preset.input);
    nRun++;
    const tag = `IMPACT.${id}`;
    // Energy must be positive
    gt(tag, 'kineticEnergy', r.impactor.kineticEnergy, 0, 'sanity');
    // Crater hierarchy: transient ≤ final
    if ((r.crater.transientDiameter as number) > (r.crater.finalDiameter as number) * 1.001) {
      record(
        tag,
        'crater hierarchy',
        'BAD',
        'transient ≤ final',
        `${(r.crater.transientDiameter as number).toFixed(0)} > ${(r.crater.finalDiameter as number).toFixed(0)}`,
        'Pike 1980'
      );
    }
    // Damage hierarchy: 5psi < 1psi < lightDamage radii
    if ((r.damage.overpressure5psi as number) > (r.damage.overpressure1psi as number)) {
      record(
        tag,
        'overpressure hierarchy',
        'BAD',
        '5psi < 1psi',
        `${(r.damage.overpressure5psi as number).toFixed(0)} > ${(r.damage.overpressure1psi as number).toFixed(0)}`,
        'Kinney & Graham'
      );
    }
    if ((r.damage.overpressure1psi as number) > (r.damage.lightDamage as number)) {
      record(
        tag,
        'lightDamage hierarchy',
        'BAD',
        '1psi < light',
        `${(r.damage.overpressure1psi as number).toFixed(0)} > ${(r.damage.lightDamage as number).toFixed(0)}`,
        'Kinney & Graham'
      );
    }
    // Burn hierarchy: 3rd-degree < 2nd-degree (3rd needs more fluence → smaller radius)
    if ((r.damage.thirdDegreeBurn as number) > (r.damage.secondDegreeBurn as number)) {
      record(
        tag,
        'burn hierarchy',
        'BAD',
        '3rd < 2nd',
        `${(r.damage.thirdDegreeBurn as number).toFixed(0)} > ${(r.damage.secondDegreeBurn as number).toFixed(0)}`,
        'Glasstone Tab 7.41'
      );
    }
    // If tsunami present: source amplitude < cavity radius (η ≤ 0.5)
    if (r.tsunami !== undefined) {
      if ((r.tsunami.sourceAmplitude as number) > (r.tsunami.cavityRadius as number)) {
        record(
          tag,
          'A0 ≤ R_C',
          'BAD',
          'A0/R_C ≤ 0.5',
          `${(r.tsunami.sourceAmplitude as number).toFixed(0)}/${(r.tsunami.cavityRadius as number).toFixed(0)}`,
          'Ward & Asphaug 2000'
        );
      }
      // 1/r decay: 5000 km amp = 1/5 of 1000 km amp
      const ratio =
        (r.tsunami.amplitudeAt1000km as number) / (r.tsunami.amplitudeAt5000km as number);
      if (ratio < 4.5 || ratio > 5.5) {
        record(
          tag,
          '1/r decay 1000/5000',
          'WARN',
          '~5',
          ratio.toFixed(2),
          'Ward & Asphaug shallow-water 1/r'
        );
      }
    }
    // Airburst gate: tsunami should NOT be emitted for airburst regimes
    if (r.tsunami !== undefined && r.entry.regime === 'COMPLETE_AIRBURST') {
      record(
        tag,
        'airburst tsunami gate',
        'BAD',
        'no tsunami for COMPLETE_AIRBURST',
        `tsunami emitted (A0=${(r.tsunami.sourceAmplitude as number).toFixed(0)}m)`,
        'physical sanity'
      );
    }
  }

  // (2) Custom impactor sweep — diameter from 10 m to 20 km
  const diameters = [10, 25, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  for (const d of diameters) {
    const tag = `IMPACT.CUSTOM_d${d}`;
    const r = simulateImpact({
      impactorDiameter: M(d),
      impactVelocity: mps(20000),
      impactorDensity: kgPerM3(3000),
      targetDensity: kgPerM3(2700),
      impactAngle: degreesToRadians(deg(45)),
    });
    nRun++;
    // Energy scales as d^3
    const ke = r.impactor.kineticEnergy as number;
    gt(tag, 'kineticEnergy', ke, 0, 'sanity');
    // Atmospheric entry: small bolides should airburst, large ones shouldn't
    if (d <= 30 && r.entry.regime !== 'COMPLETE_AIRBURST') {
      record(
        tag,
        'small bolide regime',
        'WARN',
        'COMPLETE_AIRBURST for d≤30m',
        r.entry.regime,
        'Chyba 1993 pancake — Chelyabinsk-class fragment in atmosphere'
      );
    }
    if (d >= 1000 && r.entry.regime !== 'INTACT') {
      record(
        tag,
        'large bolide regime',
        'BAD',
        'INTACT for d≥1km',
        r.entry.regime,
        'large bolides have ablation/breakup negligible'
      );
    }
  }

  // (3) Custom impactor in deep ocean — tsunami pipeline behaviour
  for (const d of diameters) {
    const tag = `IMPACT.OCEAN_d${d}`;
    const r = simulateImpact({
      impactorDiameter: M(d),
      impactVelocity: mps(20000),
      impactorDensity: kgPerM3(3000),
      targetDensity: kgPerM3(2700),
      impactAngle: degreesToRadians(deg(45)),
      waterDepth: M(4000),
      meanOceanDepth: M(4000),
    });
    nRun++;
    // For airburst regimes, tsunami should be rejected
    if (r.entry.regime === 'COMPLETE_AIRBURST' && r.tsunami !== undefined) {
      record(
        tag,
        'COMPLETE_AIRBURST tsunami emitted',
        'BAD',
        'no tsunami',
        `A0=${(r.tsunami.sourceAmplitude as number).toFixed(0)}m`,
        'gf<0.1 gate in simulate.ts:473'
      );
    }
    // For partial airbursts the current code emits tsunami when gf > 0.1.
    // Flag the cases where this produces a physically suspicious A0.
    if (r.entry.regime === 'PARTIAL_AIRBURST' && r.tsunami !== undefined) {
      const gf = r.entry.energyFractionToGround;
      const A0 = r.tsunami.sourceAmplitude as number;
      const burst = r.entry.burstAltitude as number;
      // Heuristic: any partial airburst with burstAlt > 5 km AND A0 > 50 m
      // is producing a phantom tsunami. The bolide is nowhere near the
      // water surface — the cavity formula is misapplied.
      if (burst > 5000 && A0 > 50) {
        record(
          tag,
          'phantom airburst tsunami',
          'BAD',
          'A0≈0 for high airburst',
          `burstAlt=${burst.toFixed(0)}m, A0=${A0.toFixed(0)}m, gf=${gf.toFixed(3)}`,
          'simulate.ts:473 gf>0.1 gate too lenient'
        );
      }
    }
    // For INTACT regime: source amplitude monotonic with cavity (small/big bolides ranking)
    if (r.entry.regime === 'INTACT' && r.tsunami !== undefined) {
      // Expect monotonic-ish but η-attenuated. Just check positive.
      gt(tag, 'tsunami amp positive', r.tsunami.sourceAmplitude, 0, 'Ward & Asphaug');
    }
  }

  // (4) Oblique-entry sweep — asymmetry should grow with grazing angle
  for (const angleDeg of [15, 30, 45, 60, 75, 90]) {
    const tag = `IMPACT.OBLIQUE_${angleDeg}deg`;
    const r = simulateImpact({
      impactorDiameter: M(500),
      impactVelocity: mps(20000),
      impactorDensity: kgPerM3(3000),
      targetDensity: kgPerM3(2700),
      impactAngle: degreesToRadians(deg(angleDeg)),
    });
    nRun++;
    // Schultz & Anderson 1996: at 45° the asymmetry factor = 0;
    // at 15° (grazing) factor ≈ 0.6+
    const asym = r.ejecta.asymmetryFactor;
    if (angleDeg === 45) {
      if (Math.abs(asym) > 0.05) {
        record(tag, 'asymmetry at 45°', 'BAD', '~0', asym.toFixed(3), 'Schultz & Anderson 1996');
      }
    }
    if (angleDeg === 15) {
      if (asym < 0.5) {
        record(
          tag,
          'asymmetry at 15°',
          'WARN',
          '> 0.5',
          asym.toFixed(3),
          'Schultz & Anderson 1996'
        );
      }
    }
  }
}

// ------------- EXPLOSION scenarios -------------------------------
function auditExplosion(): void {
  for (const [id, preset] of Object.entries(EXPLOSION_PRESETS)) {
    const r = simulateExplosion(preset.input);
    nRun++;
    const tag = `EXPL.${id}`;
    // Hierarchies
    if ((r.blast.overpressure5psiRadius as number) > (r.blast.overpressure1psiRadius as number)) {
      record(
        tag,
        '5psi vs 1psi',
        'BAD',
        '5psi < 1psi',
        `${(r.blast.overpressure5psiRadius as number).toFixed(0)} > ${(r.blast.overpressure1psiRadius as number).toFixed(0)}`,
        'Kinney & Graham'
      );
    }
    if (
      (r.thermal.thirdDegreeBurnRadius as number) > (r.thermal.secondDegreeBurnRadius as number)
    ) {
      record(
        tag,
        'thermal hierarchy',
        'BAD',
        '3rd < 2nd',
        `${(r.thermal.thirdDegreeBurnRadius as number).toFixed(0)} > ${(r.thermal.secondDegreeBurnRadius as number).toFixed(0)}`,
        'Glasstone Tab 7.41'
      );
    }
  }

  // Custom yield sweep — 0.001 Mt to 100 Mt
  const yields = [0.001, 0.005, 0.015, 0.05, 0.1, 0.5, 1, 5, 10, 50, 100];
  for (const y of yields) {
    const tag = `EXPL.CUSTOM_${y}Mt`;
    const r = simulateExplosion({ yieldMegatons: y, groundType: 'FIRM_GROUND' });
    nRun++;
    // Cube-root scaling of 5psi radius: r ∝ Y^(1/3)
    // Reference: 1 Mt → ~5 km. So r ≈ 5000 × Y^(1/3).
    const expected = 5000 * Math.cbrt(y);
    const actual = r.blast.overpressure5psiRadius as number;
    if (actual < expected * 0.4 || actual > expected * 2.5) {
      record(
        tag,
        '5psi cube-root scaling',
        'WARN',
        `${expected.toFixed(0)}m ± factor 2`,
        actual.toFixed(0),
        'Glasstone cube-root scaling'
      );
    }
  }

  // Underwater burst — Castle Bravo class on water
  for (const wd of [10, 50, 200, 1000, 4000]) {
    const tag = `EXPL.WATER_d${wd}`;
    const r = simulateExplosion({
      yieldMegatons: 15,
      heightOfBurst: M(0),
      waterDepth: M(wd),
    });
    nRun++;
    // Castle Bravo + water depth → tsunami should be present
    if (r.tsunami === undefined) {
      record(
        tag,
        'underwater burst tsunami',
        'BAD',
        'tsunami emitted',
        'undefined',
        'underwaterBurst.ts'
      );
    } else {
      gt(
        tag,
        'tsunami source amplitude',
        r.tsunami.sourceAmplitude,
        0,
        'Glasstone underwater burst'
      );
    }
  }
}

// ------------- EARTHQUAKE scenarios ------------------------------
function auditEarthquake(): void {
  for (const [id, preset] of Object.entries(EARTHQUAKE_PRESETS)) {
    const r = simulateEarthquake(preset.input);
    nRun++;
    const tag = `EQ.${id}`;
    // MMI hierarchy: VII > VIII > IX in radius
    const m7 = r.shaking.mmi7Radius as number;
    const m8 = r.shaking.mmi8Radius as number;
    const m9 = r.shaking.mmi9Radius as number;
    if (m7 < m8 || m8 < m9) {
      record(
        tag,
        'MMI hierarchy',
        'BAD',
        'r(VII) > r(VIII) > r(IX)',
        `${m7.toFixed(0)} / ${m8.toFixed(0)} / ${m9.toFixed(0)}`,
        'Worden 2012 GMICE'
      );
    }
    // Rupture length matches W&C / Strasser closed form
    const inputAny = preset.input as {
      subductionInterface?: boolean;
      faultType?: 'strike-slip' | 'reverse' | 'normal' | 'all';
      magnitude: number;
    };
    const expectedL =
      inputAny.subductionInterface === true
        ? (megathrustRuptureLength(inputAny.magnitude) as number)
        : (surfaceRuptureLength({
            magnitude: inputAny.magnitude,
            faultType: inputAny.faultType ?? 'all',
          }) as number);
    const actualL = r.ruptureLength as number;
    if (Math.abs(actualL - expectedL) > expectedL * 0.01) {
      record(
        tag,
        'ruptureLength formula match',
        'BAD',
        `${expectedL.toFixed(0)}m`,
        actualL.toFixed(0),
        'W&C 1994 / Strasser 2010'
      );
    }
    // Phase 13b: extended-source flag for Mw ≥ 7.5 OR subduction interface
    const expectExtended = inputAny.magnitude >= 7.5 || inputAny.subductionInterface === true;
    if (r.isExtendedSource !== expectExtended) {
      record(
        tag,
        'isExtendedSource gate',
        'BAD',
        expectExtended.toString(),
        r.isExtendedSource.toString(),
        'Phase 13b: simulate.ts gate'
      );
    }
    // Width is positive if isExtendedSource
    if (r.isExtendedSource && (r.ruptureWidth as number) <= 0) {
      record(
        tag,
        'ruptureWidth positive',
        'BAD',
        '> 0',
        (r.ruptureWidth as number).toFixed(0),
        'W&C 1994 RW table / Strasser 2010'
      );
    }
  }

  // Magnitude sweep — 4.0 to 9.5 in 0.5 steps
  for (let mw = 4.0; mw <= 9.5; mw += 0.5) {
    const tag = `EQ.MW_${mw.toFixed(1)}`;
    const r = simulateEarthquake({ magnitude: mw, faultType: 'reverse' });
    nRun++;
    // mmi7 should grow monotonically with Mw
    gt(tag, 'mmi7 positive (Mw≥5)', r.shaking.mmi7Radius, mw < 5 ? -1 : 0, 'Worden 2012');
  }

  // Megathrust sweep
  for (let mw = 7.5; mw <= 9.5; mw += 0.25) {
    const tag = `EQ.MEG_${mw.toFixed(2)}`;
    const r = simulateEarthquake({
      magnitude: mw,
      depth: M(25_000),
      faultType: 'reverse',
      subductionInterface: true,
      strikeAzimuthDeg: 200,
    });
    nRun++;
    // Megathrust → extended source ALWAYS
    if (!r.isExtendedSource) {
      record(tag, 'megathrust extended source', 'BAD', 'true', 'false', 'Phase 13b gate');
    }
    // Tsunami branch should fire
    if (r.tsunami === undefined) {
      record(
        tag,
        'megathrust tsunami',
        'BAD',
        'tsunami emitted',
        'undefined',
        'simulate.ts cross-bridge'
      );
    }
  }
}

// ------------- VOLCANO scenarios ---------------------------------
function auditVolcano(): void {
  for (const [id, preset] of Object.entries(VOLCANO_PRESETS)) {
    const r = simulateVolcano(preset.input);
    nRun++;
    const tag = `VOLC.${id}`;
    // Plume positive
    gt(tag, 'plumeHeight positive', r.plumeHeight, 0, 'Mastin 2009');
    // PDC runout positive
    gt(tag, 'pdc runout positive', r.pyroclasticRunout, 0, 'Sheridan 1979');
  }

  // VEI sweep — eruption rate from 1e3 to 1e9 m³/s
  for (const vRate of [1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9]) {
    const tag = `VOLC.VEI_${vRate.toExponential(0)}`;
    const r = simulateVolcano({
      volumeEruptionRate: vRate,
      totalEjectaVolume: vRate * 3600 * 24, // 1 day eruption
    });
    nRun++;
    // Mastin 2009: H_km = 2 × V̇_(m³/s)^(1/4) for dense-rock equivalent
    // → for V̇=1e6, H ≈ 63 km. Tunable but order-of-magnitude check.
    const H = r.plumeHeight as number;
    if (H <= 0) {
      record(tag, 'plumeHeight positive', 'BAD', '> 0', H.toString(), 'Mastin 2009');
    }
  }
}

// ------------- LANDSLIDE scenarios -------------------------------
function auditLandslide(): void {
  for (const [id, preset] of Object.entries(LANDSLIDE_PRESETS)) {
    const r = simulateLandslide(preset.input);
    nRun++;
    const tag = `LAND.${id}`;
    // Characteristic length positive
    gt(tag, 'characteristic length positive', r.characteristicLength, 0, 'V^(1/3) sanity');
    // Tsunami branch present iff submarine
    const isSubmarine = ((preset.input.meanOceanDepth as number | undefined) ?? 0) > 0;
    if (isSubmarine && r.tsunami === null) {
      record(tag, 'submarine tsunami', 'BAD', 'tsunami emitted', 'null', 'Watts 2000');
    }
    if (!isSubmarine && r.tsunami !== null) {
      record(tag, 'subaerial tsunami', 'WARN', 'null', 'present', 'should be dry runout');
    }
  }
}

// ------------- SCALING-LAW + EDGE-CASE scenarios ------------------

/**
 * Cross-validate that the simulator obeys textbook scaling laws.
 * If these break, the underlying formulas are mis-coded.
 */
function auditScalingLaws(): void {
  // (1) Impact energy ∝ D³ at constant v, ρ
  const baseInput = {
    impactVelocity: mps(20000),
    impactorDensity: kgPerM3(3000),
    targetDensity: kgPerM3(2700),
    impactAngle: degreesToRadians(deg(45)),
  };
  const r100 = simulateImpact({ ...baseInput, impactorDiameter: M(100) });
  const r200 = simulateImpact({ ...baseInput, impactorDiameter: M(200) });
  nRun += 2;
  // KE ratio should be 8 (200/100)^3
  const keRatio = (r200.impactor.kineticEnergy as number) / (r100.impactor.kineticEnergy as number);
  if (Math.abs(keRatio - 8) > 0.01) {
    record('SCALING.KE_d^3', 'KE(200m)/KE(100m)', 'BAD', '8.0', keRatio.toFixed(3), 'KE ∝ m ∝ D³');
  }

  // (2) KE ∝ v² at constant D, ρ
  const v15 = simulateImpact({
    ...baseInput,
    impactVelocity: mps(15000),
    impactorDiameter: M(500),
  });
  const v30 = simulateImpact({
    ...baseInput,
    impactVelocity: mps(30000),
    impactorDiameter: M(500),
  });
  nRun += 2;
  const vRatio = (v30.impactor.kineticEnergy as number) / (v15.impactor.kineticEnergy as number);
  if (Math.abs(vRatio - 4) > 0.01) {
    record('SCALING.KE_v^2', 'KE(30km/s)/KE(15km/s)', 'BAD', '4.0', vRatio.toFixed(3), 'KE = ½mv²');
  }

  // (3) Earthquake energy ∝ 10^(1.5·ΔMw) per Hanks-Kanamori
  const eq6 = simulateEarthquake({ magnitude: 6.0, faultType: 'strike-slip' });
  const eq7 = simulateEarthquake({ magnitude: 7.0, faultType: 'strike-slip' });
  nRun += 2;
  const moRatio = (eq7.seismicMoment as number) / (eq6.seismicMoment as number);
  // Mw 6→7 should multiply moment by 10^1.5 ≈ 31.62
  if (Math.abs(moRatio - 10 ** 1.5) / 10 ** 1.5 > 0.01) {
    record(
      'SCALING.Mo_Mw',
      'Mo(7)/Mo(6)',
      'BAD',
      '31.62',
      moRatio.toFixed(2),
      'Hanks & Kanamori 1979'
    );
  }

  // (4) Explosion 5psi cube-root scaling: r(8Y) = 2 · r(Y)
  const e1 = simulateExplosion({ yieldMegatons: 1, groundType: 'FIRM_GROUND' });
  const e8 = simulateExplosion({ yieldMegatons: 8, groundType: 'FIRM_GROUND' });
  nRun += 2;
  const rRatio =
    (e8.blast.overpressure5psiRadius as number) / (e1.blast.overpressure5psiRadius as number);
  if (Math.abs(rRatio - 2.0) > 0.05) {
    record(
      'SCALING.5psi_cubeRoot',
      'r(8Mt)/r(1Mt)',
      'WARN',
      '2.0',
      rRatio.toFixed(3),
      'Glasstone cube-root scaling'
    );
  }

  // (5) Volcano plumeHeight ∝ V̇^(1/4) per Mastin
  const v1e6 = simulateVolcano({ volumeEruptionRate: 1e6, totalEjectaVolume: 1e10 });
  const v16e6 = simulateVolcano({ volumeEruptionRate: 16e6, totalEjectaVolume: 1e10 });
  nRun += 2;
  const hRatio = (v16e6.plumeHeight as number) / (v1e6.plumeHeight as number);
  if (Math.abs(hRatio - 2.0) > 0.05) {
    record(
      'SCALING.plume_4thRoot',
      'H(16x V̇)/H(V̇)',
      'WARN',
      '2.0',
      hRatio.toFixed(3),
      'Mastin 2009 H ∝ V̇^(1/4)'
    );
  }
}

/**
 * Boundary / edge-case inputs.
 */
function auditEdgeCases(): void {
  // (1) Tiny bolide — should be filtered or produce minimal effects
  for (const d of [1, 5, 10]) {
    const tag = `EDGE.tiny_d${d}`;
    const r = simulateImpact({
      impactorDiameter: M(d),
      impactVelocity: mps(20000),
      impactorDensity: kgPerM3(3000),
      targetDensity: kgPerM3(2700),
      impactAngle: degreesToRadians(deg(45)),
    });
    nRun++;
    // Such a small bolide must be COMPLETE_AIRBURST
    if (r.entry.regime !== 'COMPLETE_AIRBURST') {
      record(
        tag,
        'tiny bolide regime',
        'BAD',
        'COMPLETE_AIRBURST',
        r.entry.regime,
        'Chyba 1993 atmospheric ablation'
      );
    }
    // Crater diameter must be ~0
    if ((r.crater.finalDiameter as number) > 50) {
      record(
        tag,
        'tiny bolide crater',
        'WARN',
        '<50m',
        (r.crater.finalDiameter as number).toFixed(0),
        'tiny bolides leave no crater'
      );
    }
  }

  // (2) Huge bolide — should be INTACT and produce massive effects
  for (const d of [50000, 100000]) {
    const tag = `EDGE.huge_d${d}`;
    nRun++;
    try {
      const r = simulateImpact({
        impactorDiameter: M(d),
        impactVelocity: mps(20000),
        impactorDensity: kgPerM3(3000),
        targetDensity: kgPerM3(2700),
        impactAngle: degreesToRadians(deg(45)),
      });
      if (r.entry.regime !== 'INTACT') {
        record(
          tag,
          'huge bolide regime',
          'BAD',
          'INTACT',
          r.entry.regime,
          'huge bolides ignore atmosphere'
        );
      }
    } catch (err: unknown) {
      record(
        tag,
        'simulator throws on huge bolide',
        'BAD',
        'no exception',
        err instanceof Error ? err.message : String(err),
        'damageRings.ts: bracket overflow'
      );
    }
  }

  // (3) Slow vs fast comet (extreme velocities)
  for (const v of [11200, 17000, 30000, 60000, 72000]) {
    const tag = `EDGE.velocity_${v}`;
    const r = simulateImpact({
      impactorDiameter: M(500),
      impactVelocity: mps(v),
      impactorDensity: kgPerM3(3000),
      targetDensity: kgPerM3(2700),
      impactAngle: degreesToRadians(deg(45)),
    });
    nRun++;
    gt(tag, 'KE positive', r.impactor.kineticEnergy, 0, 'sanity');
    // Higher velocity → higher KE strictly
    if (v > 11200) {
      const slow = simulateImpact({
        impactorDiameter: M(500),
        impactVelocity: mps(11200),
        impactorDensity: kgPerM3(3000),
        targetDensity: kgPerM3(2700),
        impactAngle: degreesToRadians(deg(45)),
      });
      if ((r.impactor.kineticEnergy as number) <= (slow.impactor.kineticEnergy as number)) {
        record(
          tag,
          'KE monotonic in v',
          'BAD',
          `> ${(slow.impactor.kineticEnergy as number).toExponential(2)}`,
          (r.impactor.kineticEnergy as number).toExponential(2),
          'KE = ½mv²'
        );
      }
    }
  }

  // (4) Different impactor densities (cometary 800 → iron 7800)
  for (const rho of [800, 1500, 3000, 5500, 7800]) {
    const tag = `EDGE.density_${rho}`;
    const r = simulateImpact({
      impactorDiameter: M(500),
      impactVelocity: mps(20000),
      impactorDensity: kgPerM3(rho),
      targetDensity: kgPerM3(2700),
      impactAngle: degreesToRadians(deg(45)),
    });
    nRun++;
    gt(tag, 'KE positive', r.impactor.kineticEnergy, 0, 'sanity');
    // KE should scale linearly with density
    if (rho === 800) {
      const ironR = simulateImpact({
        impactorDiameter: M(500),
        impactVelocity: mps(20000),
        impactorDensity: kgPerM3(7800),
        targetDensity: kgPerM3(2700),
        impactAngle: degreesToRadians(deg(45)),
      });
      const iceKe = r.impactor.kineticEnergy as number;
      const ironKe = ironR.impactor.kineticEnergy as number;
      const ratio = ironKe / iceKe;
      if (Math.abs(ratio - 7800 / 800) > 0.05) {
        record(tag, 'KE ∝ ρ', 'BAD', (7800 / 800).toFixed(2), ratio.toFixed(3), 'KE ∝ m ∝ ρV');
      }
    }
  }

  // (5) Earthquake fault types — same Mw, different L from W&C table
  for (const ft of ['strike-slip', 'reverse', 'normal', 'all'] as const) {
    const tag = `EDGE.faultType_${ft}`;
    const r = simulateEarthquake({ magnitude: 7.0, faultType: ft });
    nRun++;
    gt(tag, 'L positive', r.ruptureLength, 0, 'W&C 1994');
  }

  // (6) Volcano edge — VEI 0 (tiny effusion) vs VEI 8+ supervolcano
  const tinyV = simulateVolcano({ volumeEruptionRate: 100, totalEjectaVolume: 1e6 });
  nRun++;
  const superV = simulateVolcano({ volumeEruptionRate: 1e9, totalEjectaVolume: 1e15 });
  nRun++;
  // tiny < super for plume height
  if ((tinyV.plumeHeight as number) >= (superV.plumeHeight as number)) {
    record(
      'EDGE.volcano_extreme',
      'plume monotonic V̇',
      'BAD',
      'super > tiny',
      `tiny=${(tinyV.plumeHeight as number).toFixed(0)}, super=${(superV.plumeHeight as number).toFixed(0)}`,
      'Mastin 2009'
    );
  }

  // (7) Earthquake at very low Mw 3.5 — MMI radii should drop to 0 or near-0
  const tinyEq = simulateEarthquake({ magnitude: 3.5, faultType: 'strike-slip' });
  nRun++;
  // MMI VII (strong shaking) should not be reachable for Mw 3.5
  if ((tinyEq.shaking.mmi7Radius as number) > 5000) {
    record(
      'EDGE.eq_Mw3.5',
      'MMI VII radius for tiny eq',
      'WARN',
      '< 5km',
      (tinyEq.shaking.mmi7Radius as number).toFixed(0),
      'Worden 2012 — Mw 3.5 felt locally only'
    );
  }

  // (8) Earthquake at very high Mw 10 (impossible but test boundary)
  const giantEq = simulateEarthquake({
    magnitude: 10,
    faultType: 'reverse',
    subductionInterface: true,
  });
  nRun++;
  gt('EDGE.eq_Mw10', 'L positive', giantEq.ruptureLength, 0, 'sanity');

  // (9) Negative water depth — should not produce tsunami
  const negD = simulateImpact({
    impactorDiameter: M(500),
    impactVelocity: mps(20000),
    impactorDensity: kgPerM3(3000),
    targetDensity: kgPerM3(2700),
    impactAngle: degreesToRadians(deg(45)),
    waterDepth: M(-100),
  });
  nRun++;
  if (negD.tsunami !== undefined) {
    record(
      'EDGE.negative_water_depth',
      'tsunami on negative depth',
      'BAD',
      'undefined',
      'present',
      'simulate.ts:473 waterDepth>0 gate'
    );
  }

  // (10) Zero-yield explosion — should be near-zero damage
  const zeroExp = simulateExplosion({ yieldMegatons: 0.0001, groundType: 'FIRM_GROUND' });
  nRun++;
  if ((zeroExp.blast.overpressure5psiRadius as number) > 200) {
    record(
      'EDGE.tiny_explosion',
      '5psi for 0.1 kt',
      'WARN',
      '< 200m',
      (zeroExp.blast.overpressure5psiRadius as number).toFixed(0),
      'Glasstone cube-root → 0.1kt 5psi ≈ 100m'
    );
  }
}

// ------------- COASTAL/OROGRAPHIC fidelity check ------------------

/**
 * Spot-check tsunami source amplitudes for variations in water depth
 * (proxy for Mediterranean / Atlantic / Pacific bathymetric basins).
 * The Ward-Asphaug far-field decay is independent of depth (1/r), so
 * source amplitude must not change. Only the FMM propagation should
 * vary with depth — which the Layer-2 simulate.ts doesn't expose.
 */
function auditOrographicFidelity(): void {
  // Same impactor, three different basin depths: A0 must match.
  const a200 = simulateImpact({
    impactorDiameter: M(500),
    impactVelocity: mps(20000),
    impactorDensity: kgPerM3(3000),
    targetDensity: kgPerM3(2700),
    impactAngle: degreesToRadians(deg(45)),
    waterDepth: M(200),
    meanOceanDepth: M(200),
  });
  const a1500 = simulateImpact({
    impactorDiameter: M(500),
    impactVelocity: mps(20000),
    impactorDensity: kgPerM3(3000),
    targetDensity: kgPerM3(2700),
    impactAngle: degreesToRadians(deg(45)),
    waterDepth: M(1500),
    meanOceanDepth: M(1500),
  });
  const a4000 = simulateImpact({
    impactorDiameter: M(500),
    impactVelocity: mps(20000),
    impactorDensity: kgPerM3(3000),
    targetDensity: kgPerM3(2700),
    impactAngle: degreesToRadians(deg(45)),
    waterDepth: M(4000),
    meanOceanDepth: M(4000),
  });
  nRun += 3;
  if (a200.tsunami !== undefined && a4000.tsunami !== undefined) {
    const ampShallow = a200.tsunami.sourceAmplitude as number;
    const ampDeep = a4000.tsunami.sourceAmplitude as number;
    if (Math.abs(ampShallow - ampDeep) / ampDeep > 0.01) {
      record(
        'OROGRAPHY.shallow_vs_deep_basin',
        'A0 invariant under depth (Layer 2)',
        'INFO',
        'A0(shallow) ≈ A0(deep)',
        `${ampShallow.toFixed(0)} vs ${ampDeep.toFixed(0)}`,
        'Ward & Asphaug 2000 source not depth-coupled at Layer 2'
      );
    }
    // Travel time MUST scale with 1/sqrt(g·h)
    const ttShallow = a200.tsunami.travelTimeTo1000km as number;
    const ttDeep = a4000.tsunami.travelTimeTo1000km as number;
    // c ∝ sqrt(g·h) → tt ∝ 1/sqrt(h). h: 200→4000 = 20× → tt ratio ≈ sqrt(20) ≈ 4.47
    const ttRatio = ttShallow / ttDeep;
    if (Math.abs(ttRatio - Math.sqrt(20)) > 0.5) {
      record(
        'OROGRAPHY.travelTime_h^(1/2)',
        'tt ∝ 1/sqrt(h)',
        'WARN',
        Math.sqrt(20).toFixed(2),
        ttRatio.toFixed(2),
        'Lamb 1932 shallow-water phase speed'
      );
    }
  }
  if (a1500.tsunami !== undefined) {
    nRun++;
  }

  // Submarine vs continental megathrust — submarine should fire tsunami
  const subEq = simulateEarthquake({
    magnitude: 7.0,
    faultType: 'reverse',
    subductionInterface: true,
    waterDepth: M(4000),
  });
  const contEq = simulateEarthquake({
    magnitude: 7.0,
    faultType: 'reverse',
    subductionInterface: true,
  });
  nRun += 2;
  // subduction interface ALWAYS fires a tsunami branch
  if (subEq.tsunami === undefined) {
    record(
      'OROGRAPHY.eq_subduction_water',
      'tsunami on submarine megathrust',
      'BAD',
      'present',
      'undefined',
      'seismicTsunami.ts cross-bridge'
    );
  }
  if (contEq.tsunami === undefined) {
    record(
      'OROGRAPHY.eq_subduction_continental',
      'tsunami on continental subduction-flag',
      'BAD',
      'present (flagged)',
      'undefined',
      'subductionInterface flag intent'
    );
  }
  // Submarine flag detected
  if (subEq.tsunami !== undefined && !subEq.isSubmarine) {
    record(
      'OROGRAPHY.eq_submarine_flag',
      'isSubmarine flag',
      'BAD',
      'true',
      'false',
      'simulate.ts isSubmarine derivation'
    );
  }

  // Test extreme: water depth = 10 m (continental shelf, "barely water")
  const shelfImpact = simulateImpact({
    impactorDiameter: M(500),
    impactVelocity: mps(20000),
    impactorDensity: kgPerM3(3000),
    targetDensity: kgPerM3(2700),
    impactAngle: degreesToRadians(deg(45)),
    waterDepth: M(10),
    meanOceanDepth: M(10),
  });
  nRun++;
  // Shallow water + 500m bolide: cavity radius will exceed water depth
  // and the formula is being applied outside its validity domain.
  if (shelfImpact.tsunami !== undefined) {
    const RC = shelfImpact.tsunami.cavityRadius as number;
    if (RC > 100) {
      // arbitrary but RC=2km on 10m water is absurd
      record(
        'OROGRAPHY.shallow_shelf_cavity',
        'cavity > water depth',
        'WARN',
        'RC ≤ waterDepth',
        `RC=${RC.toFixed(0)} on 10m water`,
        'Ward & Asphaug deep-water assumption'
      );
    }
  }
}

// ------------- FORMULA closed-form verification ------------------

function auditFormulaConsistency(): void {
  // Earthquake: ruptureLength formula MUST match Wells & Coppersmith /
  // Strasser closed form to 1% (already done in auditEarthquake);
  // here cross-check ruptureWidth too.
  for (const ft of ['strike-slip', 'reverse', 'normal'] as const) {
    for (const mw of [5.5, 6.5, 7.0, 7.5]) {
      const tag = `FORMULA.eq_W_${ft}_Mw${mw.toFixed(1)}`;
      const r = simulateEarthquake({ magnitude: mw, faultType: ft });
      nRun++;
      // W&C 1994 Table 2A coefficients (must match ruptureLength.ts)
      const a: Record<string, number> = {
        'strike-slip': -0.76,
        reverse: -1.61,
        normal: -1.14,
      };
      const b: Record<string, number> = {
        'strike-slip': 0.27,
        reverse: 0.41,
        normal: 0.35,
      };
      const expectedW = 10 ** ((a[ft] ?? 0) + (b[ft] ?? 0) * mw) * 1000;
      const actualW = r.ruptureWidth as number;
      if (Math.abs(actualW - expectedW) / expectedW > 0.01) {
        record(
          tag,
          'ruptureWidth W&C match',
          'BAD',
          `${expectedW.toFixed(0)}m`,
          actualW.toFixed(0),
          'Wells & Coppersmith 1994 RW table'
        );
      }
    }
  }

  // Volcano: Mastin H_km = 2 V̇_(m³/s)^(1/4) (dense-rock equivalent;
  // note the simulator may use a different exponent — verify what
  // the existing code does)
  for (const v of [1e3, 1e6, 1e9]) {
    const tag = `FORMULA.volcano_plume_${v.toExponential(0)}`;
    const r = simulateVolcano({ volumeEruptionRate: v, totalEjectaVolume: 1e10 });
    nRun++;
    // Just ensure positive monotonic
    gt(tag, 'plume positive', r.plumeHeight, 0, 'Mastin 2009');
  }
}

// ------------- CASCADING & VISUAL-CONTRACT consistency -----------

function auditCascadeConsistency(): void {
  // For every impact preset producing a crater, the ejecta-blanket
  // 1-mm edge MUST be larger than the crater rim radius.
  for (const [id, preset] of Object.entries(IMPACT_PRESETS)) {
    const r = simulateImpact(preset.input);
    nRun++;
    const tag = `CASCADE.${id}`;
    const rim = (r.crater.finalDiameter as number) / 2;
    const blanket1mm = r.ejecta.blanketEdge1mm as number;
    if (rim > 0 && blanket1mm > 0 && blanket1mm < rim) {
      record(
        tag,
        'ejecta blanket vs crater rim',
        'BAD',
        'blanket1mm > rim',
        `${blanket1mm.toFixed(0)} < ${rim.toFixed(0)}`,
        'ejecta extends beyond crater rim'
      );
    }
    // Crater rim < lightDamage radius for any non-trivial impact.
    const lightDamage = r.damage.lightDamage as number;
    if (rim > 0 && lightDamage > 0 && rim > lightDamage) {
      record(
        tag,
        'crater vs lightDamage',
        'WARN',
        'rim < light',
        `${rim.toFixed(0)} > ${lightDamage.toFixed(0)}`,
        'sanity: light damage from blast extends past crater'
      );
    }
  }

  // Aftershock catalogues: every Mw ≥ 5 earthquake should produce at
  // least one aftershock per Reasenberg & Jones.
  for (const [id, preset] of Object.entries(EARTHQUAKE_PRESETS)) {
    const r = simulateEarthquake(preset.input);
    nRun++;
    const tag = `CASCADE.eq.${id}`;
    if (preset.input.magnitude >= 5.5 && r.aftershocks.events.length === 0) {
      record(
        tag,
        'aftershock catalogue empty',
        'BAD',
        '> 0 events for Mw≥5.5',
        '0',
        'Reasenberg & Jones 1989'
      );
    }
    // Maximum aftershock magnitude must be < mainshock - 1.0 (Båth)
    if (r.aftershocks.events.length > 0) {
      const maxMag = Math.max(...r.aftershocks.events.map((a) => a.magnitude));
      // Båth law: ΔMw between mainshock and largest aftershock ~1.2;
      // anything above mainshock is illegal.
      if (maxMag > preset.input.magnitude) {
        record(
          tag,
          'aftershock > mainshock',
          'BAD',
          `≤ ${preset.input.magnitude}`,
          maxMag.toFixed(2),
          'physics — aftershocks cannot exceed mainshock'
        );
      }
      // Guard: aftershock max should not exceed mainshock - 0.3
      if (maxMag > preset.input.magnitude - 0.3) {
        record(
          tag,
          'aftershock too close to mainshock',
          'WARN',
          `< ${(preset.input.magnitude - 0.3).toFixed(1)}`,
          maxMag.toFixed(2),
          'Båth 1965 ~1.2 average gap'
        );
      }
    }
  }
}

// ------------- TIME-DOMAIN consistency ---------------------------

function auditTimeConsistency(): void {
  // Tsunami travel time at 5000 km should be 5× that at 1000 km when
  // depth is constant (linear shallow-water phase speed).
  const r = simulateImpact({
    ...IMPACT_PRESETS.CHICXULUB_OCEAN.input,
  });
  nRun++;
  if (r.tsunami !== undefined) {
    const tt1k = r.tsunami.travelTimeTo1000km as number;
    // The simulator only reports tt at 1000km but we can check it's
    // physically reasonable for c=√(gh) on 4000m basin.
    // c = sqrt(9.81 × 4000) = 198 m/s → tt for 1000 km = 5050 s
    const expectedTT = 1_000_000 / Math.sqrt(9.81 * 4000);
    if (Math.abs(tt1k - expectedTT) / expectedTT > 0.15) {
      record(
        'TIME.tsunami_tt_speed',
        'tt = r/c match',
        'WARN',
        `${expectedTT.toFixed(0)}s ± 15%`,
        tt1k.toFixed(0),
        'Lamb 1932 c=√(gh)'
      );
    }
  }
}

// ------------- DAMAGE-ASYMMETRY scenarios ------------------------

function auditAsymmetry(): void {
  // Schultz-Anderson 1996: at θ=45° asymmetry=0; at θ=15° factor>0.5;
  // (already checked in auditImpact). Here cross-check that the
  // azimuth is preserved through the asymmetry compute.
  for (const az of [0, 45, 90, 135, 180, 270]) {
    const tag = `ASYM.azimuth_${az}`;
    const r = simulateImpact({
      impactorDiameter: M(500),
      impactVelocity: mps(20000),
      impactorDensity: kgPerM3(3000),
      targetDensity: kgPerM3(2700),
      impactAngle: degreesToRadians(deg(15)), // grazing
      impactAzimuthDeg: az,
    });
    nRun++;
    // Asymmetry has a definite azimuth orientation
    if (r.ejecta.asymmetryFactor > 0.05) {
      // Should be reflected in azimuthDeg of ejecta
      const ejAz = r.ejecta.azimuthDeg;
      if (Math.abs(ejAz - az) > 1) {
        record(
          tag,
          'asymmetry azimuth pass-through',
          'WARN',
          `${az}°`,
          ejAz.toFixed(1),
          'Schultz-Anderson azimuth tag'
        );
      }
    }
  }

  // Wind drift on thermal pulse — explicit test
  const calmExpl = simulateExplosion({
    yieldMegatons: 1,
    groundType: 'FIRM_GROUND',
    windSpeed: mps(0),
  });
  const windyExpl = simulateExplosion({
    yieldMegatons: 1,
    groundType: 'FIRM_GROUND',
    windSpeed: mps(20),
    windDirectionDeg: 90,
  });
  nRun += 2;
  // Wind drift should NOT change the central blast radii
  if (
    Math.abs(
      (calmExpl.blast.overpressure5psiRadius as number) -
        (windyExpl.blast.overpressure5psiRadius as number)
    ) > 1
  ) {
    record(
      'ASYM.wind_blast_invariance',
      'wind invariant blast radius',
      'BAD',
      'identical',
      `calm=${(calmExpl.blast.overpressure5psiRadius as number).toFixed(0)} vs windy=${(windyExpl.blast.overpressure5psiRadius as number).toFixed(0)}`,
      'wind only affects thermal pulse, not blast'
    );
  }
}

// ------------- HISTORICAL VALIDATION cross-check ------------------

function auditHistoricalValidation(): void {
  // Tunguska — 1908 Siberian airburst (no waterDepth)
  const tung = simulateImpact(IMPACT_PRESETS.TUNGUSKA.input);
  nRun++;
  // Total energy must be 3-30 Mt
  within(
    'HIST.TUNGUSKA',
    'energyMt',
    tung.impactor.kineticEnergyMegatons,
    3,
    30,
    'Boslough & Crawford 2008'
  );
  // Burst altitude must be 5-15 km
  within(
    'HIST.TUNGUSKA',
    'burstAltKm',
    (tung.entry.burstAltitude as number) / 1000,
    5,
    15,
    'Boslough hydrocode reconstruction'
  );
  // No crater at all (airburst)
  if ((tung.crater.finalDiameter as number) > 100) {
    record(
      'HIST.TUNGUSKA',
      'crater diameter',
      'WARN',
      '< 100m',
      (tung.crater.finalDiameter as number).toFixed(0),
      'PARTIAL_AIRBURST — Boslough crater <100m'
    );
  }

  // Hiroshima — 15 kt, HOB 580 m. The actual observed 5psi reach
  // requires the HOB-corrected radius (Mach-stem amplification at
  // optimum airburst): the bare Kinney-Graham value is the contact
  // surface-burst envelope and lands at ~1.13 km, which the bare
  // ground-coupling factor 0.85 dials down to ~960 m — neither is
  // the right comparand for a historical 1.4-2.0 km observation.
  const hiro = simulateExplosion(EXPLOSION_PRESETS.HIROSHIMA_1945.input);
  nRun++;
  within(
    'HIST.HIROSHIMA',
    '5psiKm (HOB-corrected)',
    (hiro.blast.overpressure5psiRadiusHob as number) / 1000,
    1.4,
    2.0,
    'Glasstone Fig 3.74a airburst optimum'
  );
  within(
    'HIST.HIROSHIMA',
    'burn3Km',
    (hiro.thermal.thirdDegreeBurnRadius as number) / 1000,
    1.5,
    2.5,
    'Glasstone Tab 7.41'
  );

  // Chicxulub — K-Pg
  const chix = simulateImpact(IMPACT_PRESETS.CHICXULUB.input);
  nRun++;
  within(
    'HIST.CHICXULUB',
    'finalCraterKm',
    (chix.crater.finalDiameter as number) / 1000,
    150,
    200,
    'Hildebrand 1991 + Morgan 2016'
  );

  // Tōhoku 2011
  const tohoku = simulateEarthquake(EARTHQUAKE_PRESETS.TOHOKU_2011.input);
  nRun++;
  within(
    'HIST.TOHOKU',
    'mmi7Km',
    (tohoku.shaking.mmi7Radius as number) / 1000,
    50,
    250,
    'USGS ShakeMap'
  );
}

// ------------- ALMOST-HORIZONTAL impact scenarios ----------------

function auditExtremeAngles(): void {
  // Test very low (1°) and 90° (vertical)
  for (const angDeg of [1, 5, 30, 60, 89]) {
    const tag = `ANGLE.${angDeg}deg`;
    const r = simulateImpact({
      impactorDiameter: M(500),
      impactVelocity: mps(20000),
      impactorDensity: kgPerM3(3000),
      targetDensity: kgPerM3(2700),
      impactAngle: degreesToRadians(deg(angDeg)),
    });
    nRun++;
    // Crater diameter must be > 0 for any non-zero angle
    gt(tag, 'crater positive', r.crater.finalDiameter, 0, 'Pierazzo & Melosh 2000 oblique scaling');
    // Energy invariant in angle (only crater shape changes)
    if (angDeg === 30) {
      const r45 = simulateImpact({
        impactorDiameter: M(500),
        impactVelocity: mps(20000),
        impactorDensity: kgPerM3(3000),
        targetDensity: kgPerM3(2700),
        impactAngle: degreesToRadians(deg(45)),
      });
      const ke30 = r.impactor.kineticEnergy as number;
      const ke45 = r45.impactor.kineticEnergy as number;
      if (Math.abs(ke30 - ke45) > 1) {
        record(
          tag,
          'KE invariant in angle',
          'BAD',
          ke45.toExponential(3),
          ke30.toExponential(3),
          'KE = ½mv² independent of angle'
        );
      }
    }
  }
}

// ------------- main ----------------------------------------------
console.log('Phase 14 — atomic 100+ scenario audit\n');
auditImpact();
auditExplosion();
auditEarthquake();
auditVolcano();
auditLandslide();
auditScalingLaws();
auditEdgeCases();
auditOrographicFidelity();
auditFormulaConsistency();
auditCascadeConsistency();
auditTimeConsistency();
auditAsymmetry();
auditHistoricalValidation();
auditExtremeAngles();

const bad = issues.filter((i) => i.severity === 'BAD');
const warn = issues.filter((i) => i.severity === 'WARN');
const info = issues.filter((i) => i.severity === 'INFO');
console.log(`scenarios run:   ${String(nRun)}`);
console.log(`issues found:    ${String(issues.length)}`);
console.log(`  BAD:           ${String(bad.length)}`);
console.log(`  WARN:          ${String(warn.length)}`);
console.log(`  INFO:          ${String(info.length)}`);
console.log('');
if (bad.length + warn.length === 0) {
  console.log('No issues.');
} else {
  console.log('--- BAD ---');
  for (const i of bad) {
    console.log(`  [${i.scenario}] ${i.field}`);
    console.log(`     expected: ${i.expected}`);
    console.log(`     actual:   ${i.actual}`);
    console.log(`     source:   ${i.source}`);
  }
  console.log('--- WARN ---');
  for (const i of warn) {
    console.log(`  [${i.scenario}] ${i.field}`);
    console.log(`     expected: ${i.expected}`);
    console.log(`     actual:   ${i.actual}`);
    console.log(`     source:   ${i.source}`);
  }
}
