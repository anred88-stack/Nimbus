import { useMemo, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import {
  buildEarthquakeCascade,
  buildExplosionCascade,
  buildImpactCascade,
  buildLandslideCascade,
  buildVolcanoCascade,
  type CascadeStage,
} from '../../physics/cascade.js';
import type { EarthquakeScenarioResult } from '../../physics/events/earthquake/index.js';
import type { ExplosionScenarioResult } from '../../physics/events/explosion/index.js';
import type { LandslideScenarioResult } from '../../physics/events/landslide/index.js';
import type { VolcanoScenarioResult } from '../../physics/events/volcano/index.js';
import type { ImpactScenarioResult } from '../../physics/simulate.js';
import { joulesToMegatons, radiansToDegrees } from '../../physics/units.js';
import { useAppStore, type ActiveResult } from '../../store/index.js';
import { CascadeTimeline } from '../components/CascadeTimeline.js';
import { METHODOLOGY_SECTIONS } from './methodologyContent.js';
import {
  collectReportCitations,
  formatCitationLine,
  type TriggeredCitation,
} from './reportCitations.js';
import styles from './SimulationReportPage.module.css';

function fmtKm(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) return '—';
  if (meters < 1_000) return `${meters.toFixed(0)} m`;
  return `${(meters / 1_000).toFixed(1)} km`;
}

function fmtKm2(m2: number): string {
  if (!Number.isFinite(m2) || m2 <= 0) return '—';
  const km2 = m2 / 1_000_000;
  if (km2 >= 1_000_000) return `${(km2 / 1_000_000).toFixed(1)} M km²`;
  if (km2 >= 1) return `${km2.toFixed(0)} km²`;
  return `${m2.toFixed(0)} m²`;
}

function fmtMt(mt: number): string {
  if (!Number.isFinite(mt) || mt <= 0) return '—';
  if (mt < 0.001) return `${(mt * 1_000_000).toFixed(0)} t`;
  if (mt < 1) return `${(mt * 1_000).toFixed(1)} kt`;
  if (mt < 1_000) return `${mt.toFixed(1)} Mt`;
  return `${(mt / 1_000).toFixed(2)} Gt`;
}

function fmtMass(kg: number): string {
  if (!Number.isFinite(kg) || kg <= 0) return '—';
  if (kg >= 1e12) return `${(kg / 1e12).toExponential(1)} Gt`;
  if (kg >= 1e9) return `${(kg / 1e9).toFixed(1)} Gt`;
  if (kg >= 1e6) return `${(kg / 1e6).toFixed(1)} Mt`;
  if (kg >= 1_000) return `${(kg / 1_000).toFixed(0)} t`;
  return `${kg.toFixed(0)} kg`;
}

function fmtMin(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const minutes = seconds / 60;
  if (minutes < 60) return `${minutes.toFixed(0)} min`;
  const hours = Math.floor(minutes / 60);
  const rem = Math.round(minutes % 60);
  return rem === 0 ? `${hours.toFixed(0)} h` : `${hours.toFixed(0)} h ${rem.toFixed(0)} min`;
}

function fmtNumber(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

interface Field {
  label: string;
  value: string;
}

function impactFields(r: ImpactScenarioResult): { inputs: Field[]; outputs: Field[] } {
  const input = r.inputs;
  const inputs: Field[] = [
    { label: 'Impactor diameter', value: fmtKm(input.impactorDiameter) },
    {
      label: 'Impact velocity',
      value: `${((input.impactVelocity as number) / 1_000).toFixed(1)} km/s`,
    },
    { label: 'Impactor density', value: `${fmtNumber(input.impactorDensity, 0)} kg/m³` },
    { label: 'Target density', value: `${fmtNumber(input.targetDensity, 0)} kg/m³` },
    { label: 'Impact angle', value: `${radiansToDegrees(input.impactAngle).toFixed(0)}°` },
  ];
  if ((input.waterDepth as number | undefined) !== undefined && (input.waterDepth as number) > 0) {
    inputs.push({ label: 'Water depth at impact', value: fmtKm(input.waterDepth as number) });
  }
  if ((input.meanOceanDepth as number | undefined) !== undefined) {
    inputs.push({ label: 'Mean basin depth', value: fmtKm(input.meanOceanDepth as number) });
  }
  if (input.impactorStrength !== undefined) {
    inputs.push({
      label: 'Impactor tensile strength',
      value: `${((input.impactorStrength as number) / 1e6).toFixed(2)} MPa`,
    });
  }

  const outputs: Field[] = [
    { label: 'Impactor mass', value: fmtMass(r.impactor.mass) },
    { label: 'Kinetic energy', value: fmtMt(joulesToMegatons(r.impactor.kineticEnergy)) },
    { label: 'Entry regime', value: r.entry.regime.replace(/_/g, ' ').toLowerCase() },
    {
      label: 'Energy fraction to ground',
      value: `${(r.entry.energyFractionToGround * 100).toFixed(0)}%`,
    },
    { label: 'Transient crater diameter', value: fmtKm(r.crater.transientDiameter) },
    { label: 'Final crater diameter', value: fmtKm(r.crater.finalDiameter) },
    { label: 'Crater depth', value: fmtKm(r.crater.depth) },
    { label: 'Crater morphology', value: r.crater.morphology },
    { label: 'Seismic Mw (Schultz-Gault)', value: fmtNumber(r.seismic.magnitude, 1) },
    { label: 'Seismic Mw (Teanby-Wookey)', value: fmtNumber(r.seismic.magnitudeTeanbyWookey, 1) },
    { label: 'Liquefaction radius', value: fmtKm(r.seismic.liquefactionRadius) },
    { label: 'Crater rim radius', value: fmtKm(r.damage.craterRim) },
    { label: '3rd-degree burn radius', value: fmtKm(r.damage.thirdDegreeBurn) },
    { label: '2nd-degree burn radius', value: fmtKm(r.damage.secondDegreeBurn) },
    { label: '5 psi overpressure radius', value: fmtKm(r.damage.overpressure5psi) },
    { label: '1 psi overpressure radius', value: fmtKm(r.damage.overpressure1psi) },
    { label: '0.5 psi · light-damage radius', value: fmtKm(r.damage.lightDamage) },
    { label: 'Firestorm ignition radius', value: fmtKm(r.firestorm.ignitionRadius) },
    { label: 'Firestorm sustain radius', value: fmtKm(r.firestorm.sustainRadius) },
    { label: 'Firestorm ignition area', value: fmtKm2(r.firestorm.ignitionArea) },
    { label: 'Ejecta blanket outer edge (1 mm)', value: fmtKm(r.ejecta.blanketEdge1mm) },
    { label: 'Ejecta blanket outer edge (1 m)', value: fmtKm(r.ejecta.blanketEdge1m) },
    {
      label: 'Ejecta thickness at 2 R',
      value: `${(r.ejecta.thicknessAt2R as number).toFixed(1)} m`,
    },
    {
      label: 'Ejecta thickness at 10 R',
      value: `${(r.ejecta.thicknessAt10R as number).toFixed(2)} m`,
    },
    { label: 'Stratospheric dust', value: fmtMass(r.atmosphere.stratosphericDust) },
    { label: 'Acid-rain mass (HNO₃)', value: fmtMass(r.atmosphere.acidRainMass) },
    { label: 'Climate tier', value: r.atmosphere.climateTier },
  ];
  if (r.tsunami) {
    outputs.push(
      { label: 'Tsunami cavity radius', value: fmtKm(r.tsunami.cavityRadius) },
      {
        label: 'Tsunami source amplitude',
        value: `${(r.tsunami.sourceAmplitude as number).toFixed(1)} m`,
      },
      {
        label: 'Tsunami A @ 1 000 km (Ward-Asphaug)',
        value: `${(r.tsunami.amplitudeAt1000km as number).toFixed(2)} m`,
      },
      {
        label: 'Tsunami A @ 1 000 km (Wünnemann-corrected)',
        value: `${(r.tsunami.amplitudeAt1000kmWunnemann as number).toFixed(2)} m`,
      },
      {
        label: 'Tsunami A @ 5 000 km (Ward-Asphaug)',
        value: `${(r.tsunami.amplitudeAt5000km as number).toFixed(2)} m`,
      },
      {
        label: 'Tsunami A @ 5 000 km (dispersion-corrected)',
        value: `${(r.tsunami.amplitudeAt5000kmDispersed as number).toFixed(2)} m`,
      },
      {
        label: 'Coastal run-up @ 1 000 km (Synolakis 1:100)',
        value: `${(r.tsunami.runupAt1000km as number).toFixed(1)} m`,
      },
      { label: 'Tsunami travel to 1 000 km', value: fmtMin(r.tsunami.travelTimeTo1000km) }
    );
  }
  return { inputs, outputs };
}

function explosionFields(r: ExplosionScenarioResult): { inputs: Field[]; outputs: Field[] } {
  const hob = r.inputs.heightOfBurst;
  const inputs: Field[] = [
    { label: 'Yield', value: fmtMt(r.yield.megatons) },
    { label: 'Ground type', value: r.inputs.groundType ?? 'FIRM_GROUND' },
    {
      label: 'Height of burst',
      value: hob === undefined || (hob as number) <= 0 ? 'Contact surface burst' : fmtKm(hob),
    },
  ];
  if ((r.inputs.waterDepth as number | undefined) !== undefined) {
    inputs.push({ label: 'Water depth at burst', value: fmtKm(r.inputs.waterDepth as number) });
  }

  const outputs: Field[] = [
    { label: 'Yield (kilotons)', value: `${r.yield.kilotons.toLocaleString()} kt` },
    { label: '5 psi ring (baseline)', value: fmtKm(r.blast.overpressure5psiRadius) },
    { label: '5 psi ring (HOB-corrected)', value: fmtKm(r.blast.overpressure5psiRadiusHob) },
    { label: '1 psi ring (baseline)', value: fmtKm(r.blast.overpressure1psiRadius) },
    { label: '1 psi ring (HOB-corrected)', value: fmtKm(r.blast.overpressure1psiRadiusHob) },
    {
      label: 'Peak overpressure @ 1 km',
      value: `${((r.blast.peakAt1km as number) / 1_000).toFixed(2)} kPa`,
    },
    {
      label: 'Peak overpressure @ 5 km',
      value: `${((r.blast.peakAt5km as number) / 1_000).toFixed(2)} kPa`,
    },
    { label: 'HOB regime', value: r.blast.hobRegime.replace(/_/g, ' ').toLowerCase() },
    {
      label: 'Scaled HOB (z = HOB / W^⅓)',
      value: `${r.blast.hobScaled.toFixed(1)} m·kt⁻¹ᐟ³`,
    },
    { label: 'HOB blast factor', value: fmtNumber(r.blast.hobFactor, 2) },
    { label: '3rd-degree burn radius', value: fmtKm(r.thermal.thirdDegreeBurnRadius) },
    { label: '2nd-degree burn radius', value: fmtKm(r.thermal.secondDegreeBurnRadius) },
    { label: '1st-degree burn radius', value: fmtKm(r.thermal.firstDegreeBurnRadius) },
    { label: '0.5 psi · light-damage radius', value: fmtKm(r.blast.lightDamageRadius) },
    {
      label: 'Peak wind @ 1 km',
      value: `${(r.peakWind.at1km as number).toFixed(0)} m/s`,
    },
    {
      label: 'Peak wind @ 5 km',
      value: `${(r.peakWind.at5km as number).toFixed(0)} m/s`,
    },
    {
      label: 'Peak wind @ 10 km',
      value: `${(r.peakWind.at10km as number).toFixed(0)} m/s`,
    },
    {
      label: 'Peak wind @ 50 km',
      value: `${(r.peakWind.at50km as number).toFixed(0)} m/s`,
    },
    { label: 'Firestorm ignition radius', value: fmtKm(r.firestorm.ignitionRadius) },
    { label: 'Firestorm sustain radius', value: fmtKm(r.firestorm.sustainRadius) },
    { label: 'Firestorm ignition area', value: fmtKm2(r.firestorm.ignitionArea) },
    { label: 'Firestorm sustain area', value: fmtKm2(r.firestorm.sustainArea) },
    { label: 'Surface-burst crater diameter', value: fmtKm(r.crater.apparentDiameter) },
    { label: 'LD₁₀₀ radiation radius (8 Gy)', value: fmtKm(r.radiation.ld100Radius) },
    { label: 'LD₅₀ radiation radius (4.5 Gy)', value: fmtKm(r.radiation.ld50Radius) },
    { label: 'ARS-threshold radius (1 Gy)', value: fmtKm(r.radiation.arsThresholdRadius) },
    { label: 'EMP regime', value: r.emp.regime.replace(/_/g, ' ').toLowerCase() },
    { label: 'EMP affected radius', value: fmtKm(r.emp.affectedRadius) },
  ];
  if (r.tsunami) {
    outputs.push(
      {
        label: 'Tsunami coupling fraction',
        value: `${(r.tsunami.couplingFraction * 100).toFixed(1)} %`,
      },
      { label: 'Tsunami cavity radius', value: fmtKm(r.tsunami.cavityRadius) },
      {
        label: 'Tsunami source amplitude',
        value: `${(r.tsunami.sourceAmplitude as number).toFixed(1)} m`,
      },
      {
        label: 'Tsunami A @ 100 km',
        value: `${(r.tsunami.amplitudeAt100km as number).toFixed(2)} m`,
      },
      {
        label: 'Tsunami A @ 1 000 km',
        value: `${(r.tsunami.amplitudeAt1000km as number).toFixed(2)} m`,
      },
      { label: 'Tsunami travel to 100 km', value: fmtMin(r.tsunami.travelTimeTo100km) },
      { label: 'Tsunami travel to 1 000 km', value: fmtMin(r.tsunami.travelTimeTo1000km) }
    );
  }
  return { inputs, outputs };
}

function earthquakeFields(r: EarthquakeScenarioResult): { inputs: Field[]; outputs: Field[] } {
  const inputs: Field[] = [
    { label: 'Moment magnitude Mw', value: fmtNumber(r.inputs.magnitude, 1) },
    { label: 'Fault type', value: r.inputs.faultType ?? 'all' },
    {
      label: 'Hypocentre depth',
      value: r.inputs.depth === undefined ? '—' : fmtKm(r.inputs.depth),
    },
    { label: 'Vs30 (site)', value: `${fmtNumber(r.inputs.vs30 ?? 760, 0)} m/s` },
    { label: 'Subduction interface', value: r.inputs.subductionInterface === true ? 'yes' : 'no' },
  ];

  const outputs: Field[] = [
    {
      label: 'Seismic moment M₀',
      value: `${(r.seismicMoment as number).toExponential(2)} N·m`,
    },
    { label: 'Rupture length', value: fmtKm(r.ruptureLength) },
    { label: 'NEHRP site class', value: r.shaking.siteClass },
    { label: 'Site Vs30 (resolved)', value: `${fmtNumber(r.shaking.siteVs30, 0)} m/s` },
    {
      label: 'PGA @ 20 km (Joyner-Boore)',
      value: `${((r.shaking.pgaAt20km as number) / 9.80665).toFixed(2)} g`,
    },
    {
      label: 'PGA @ 100 km (Joyner-Boore)',
      value: `${((r.shaking.pgaAt100km as number) / 9.80665).toFixed(2)} g`,
    },
    {
      label: 'PGA @ 20 km (NGA-West2 BSSA14)',
      value: `${((r.shaking.pgaAt20kmNGA as number) / 9.80665).toFixed(2)} g`,
    },
    {
      label: 'PGA @ 100 km (NGA-West2 BSSA14)',
      value: `${((r.shaking.pgaAt100kmNGA as number) / 9.80665).toFixed(2)} g`,
    },
    { label: 'MMI at epicentre (Worden CA)', value: fmtNumber(r.shaking.mmiAtEpicenter, 1) },
    {
      label: 'MMI at epicentre (Faenza Europe)',
      value: fmtNumber(r.shaking.mmiAtEpicenterEurope, 1),
    },
    { label: 'MMI VII ring (strong shaking)', value: fmtKm(r.shaking.mmi7Radius) },
    { label: 'MMI VIII ring (severe shaking)', value: fmtKm(r.shaking.mmi8Radius) },
    { label: 'MMI IX ring (violent shaking)', value: fmtKm(r.shaking.mmi9Radius) },
    { label: 'Liquefaction radius', value: fmtKm(r.shaking.liquefactionRadius) },
  ];
  if (r.tsunami) {
    outputs.push(
      { label: 'Mean coseismic slip', value: `${(r.tsunami.meanSlip as number).toFixed(1)} m` },
      { label: 'Seafloor uplift', value: `${(r.tsunami.seafloorUplift as number).toFixed(1)} m` },
      {
        label: 'Tsunami initial amplitude',
        value: `${(r.tsunami.initialAmplitude as number).toFixed(1)} m`,
      },
      {
        label: 'Tsunami A @ 1 000 km',
        value: `${(r.tsunami.amplitudeAt1000km as number).toFixed(2)} m`,
      },
      {
        label: 'Coastal run-up @ 1 000 km',
        value: `${(r.tsunami.runupAt1000km as number).toFixed(1)} m`,
      },
      { label: 'Tsunami travel to 1 000 km', value: fmtMin(r.tsunami.travelTimeTo1000km) }
    );
  }
  outputs.push(
    {
      label: 'Aftershocks (M ≥ Mc, 30 d)',
      value: r.aftershocks.totalCount.toString(),
    },
    {
      label: 'Largest aftershock magnitude',
      value: fmtNumber(r.aftershocks.maxMagnitude, 1),
    },
    {
      label: 'Båth ceiling (M_main − 1.2)',
      value: fmtNumber(r.aftershocks.bathCeiling, 1),
    },
    {
      label: 'Completeness cutoff Mc',
      value: fmtNumber(r.aftershocks.completenessCutoff, 1),
    }
  );
  return { inputs, outputs };
}

function volcanoFields(r: VolcanoScenarioResult): { inputs: Field[]; outputs: Field[] } {
  const inputs: Field[] = [
    {
      label: 'Volume eruption rate',
      value: `${r.inputs.volumeEruptionRate.toExponential(1)} m³/s`,
    },
    { label: 'Total ejecta volume', value: `${r.inputs.totalEjectaVolume.toExponential(1)} m³` },
  ];
  if (r.inputs.laharVolume !== undefined) {
    inputs.push({
      label: 'Lahar total volume',
      value: `${r.inputs.laharVolume.toExponential(1)} m³`,
    });
  }
  if (r.inputs.windSpeed !== undefined && r.inputs.windSpeed > 0) {
    inputs.push({
      label: 'Wind speed at plume top',
      value: `${r.inputs.windSpeed.toFixed(1)} m/s`,
    });
  }
  if (r.inputs.windDirectionDegrees !== undefined) {
    inputs.push({
      label: 'Wind direction (° from N)',
      value: `${r.inputs.windDirectionDegrees.toFixed(0)}°`,
    });
  }

  const outputs: Field[] = [
    { label: 'Plume height (Mastin 2009)', value: fmtKm(r.plumeHeight) },
    { label: 'Volcanic Explosivity Index', value: `VEI ${r.vei.toString()}` },
    {
      label: 'Mass eruption rate',
      value: `${r.massEruptionRate.toExponential(2)} kg/s`,
    },
    { label: 'PDC runout (Sheridan H/L = 0.1)', value: fmtKm(r.pyroclasticRunout) },
    {
      label: 'PDC runout (Dade-Huppert energy-line)',
      value: fmtKm(r.pyroclasticRunoutEnergyLine),
    },
    { label: 'Ashfall ≥ 1 mm area (circular)', value: fmtKm2(r.ashfallArea1mm) },
    { label: 'Climate cooling ΔT', value: `${r.climateCoolingK.toFixed(2)} K` },
  ];
  if (r.laharRunout !== undefined) {
    outputs.push({ label: 'Lahar runout (Iverson 1997)', value: fmtKm(r.laharRunout) });
  }
  if (r.windAdvectedAshfall) {
    outputs.push(
      {
        label: 'Ashfall downwind range (1 mm)',
        value: fmtKm(r.windAdvectedAshfall.downwindRange),
      },
      {
        label: 'Ashfall crosswind half-width',
        value: fmtKm(r.windAdvectedAshfall.crosswindHalfWidth),
      },
      {
        label: 'Ashfall isopach area (wind-oriented)',
        value: fmtKm2(r.windAdvectedAshfall.area),
      }
    );
  }
  if (r.lateralBlast) {
    outputs.push(
      { label: 'Lateral-blast runout (Glicken 1996)', value: fmtKm(r.lateralBlast.runout) },
      {
        label: 'Lateral-blast direction (° from N)',
        value: `${r.lateralBlast.directionDeg.toFixed(0)}°`,
      },
      {
        label: 'Lateral-blast sector angle',
        value: `${r.lateralBlast.sectorAngleDeg.toFixed(0)}°`,
      },
      { label: 'Lateral-blast affected area', value: fmtKm2(r.lateralBlast.area) }
    );
  }
  if (r.tsunami) {
    outputs.push(
      {
        label: 'Collapse tsunami source amplitude',
        value: `${(r.tsunami.sourceAmplitude as number).toFixed(0)} m`,
      },
      { label: 'Collapse tsunami cavity radius', value: fmtKm(r.tsunami.cavityRadius) },
      {
        label: 'Tsunami A @ 100 km',
        value: `${(r.tsunami.amplitudeAt100km as number).toFixed(2)} m`,
      },
      {
        label: 'Tsunami A @ 1 000 km',
        value: `${(r.tsunami.amplitudeAt1000km as number).toFixed(2)} m`,
      },
      { label: 'Tsunami travel to 100 km', value: fmtMin(r.tsunami.travelTimeTo100km) },
      { label: 'Tsunami travel to 1 000 km', value: fmtMin(r.tsunami.travelTimeTo1000km) }
    );
  }
  return { inputs, outputs };
}

function landslideFields(r: LandslideScenarioResult): { inputs: Field[]; outputs: Field[] } {
  const inputs: Field[] = [
    { label: 'Block volume', value: `${r.inputs.volumeM3.toExponential(2)} m³` },
    {
      label: 'Slope angle',
      value: `${(r.inputs.slopeAngleDeg ?? 20).toFixed(0)}°`,
    },
    { label: 'Regime', value: r.regime },
  ];
  if (r.inputs.meanOceanDepth !== undefined) {
    inputs.push({ label: 'Mean basin depth', value: fmtKm(r.inputs.meanOceanDepth) });
  }
  const outputs: Field[] = [
    { label: 'Characteristic length (V^⅓)', value: fmtKm(r.characteristicLength) },
    {
      label: 'Characteristic area (V^⅔)',
      value: fmtKm2(r.characteristicArea),
    },
  ];
  if (r.tsunami) {
    outputs.push(
      {
        label: 'Tsunami source amplitude',
        value: `${(r.tsunami.sourceAmplitude as number).toFixed(0)} m`,
      },
      { label: 'Tsunami cavity radius', value: fmtKm(r.tsunami.cavityRadius) },
      {
        label: 'Tsunami A @ 100 km',
        value: `${(r.tsunami.amplitudeAt100km as number).toFixed(2)} m`,
      },
      {
        label: 'Tsunami A @ 1 000 km',
        value: `${(r.tsunami.amplitudeAt1000km as number).toFixed(2)} m`,
      },
      { label: 'Tsunami travel to 100 km', value: fmtMin(r.tsunami.travelTimeTo100km) },
      { label: 'Tsunami travel to 1 000 km', value: fmtMin(r.tsunami.travelTimeTo1000km) }
    );
  }
  return { inputs, outputs };
}

function fieldsFor(result: ActiveResult): { inputs: Field[]; outputs: Field[] } {
  switch (result.type) {
    case 'impact':
      return impactFields(result.data);
    case 'explosion':
      return explosionFields(result.data);
    case 'earthquake':
      return earthquakeFields(result.data);
    case 'volcano':
      return volcanoFields(result.data);
    case 'landslide':
      return landslideFields(result.data);
  }
}

function cascadeFor(result: ActiveResult): CascadeStage[] {
  switch (result.type) {
    case 'impact':
      return buildImpactCascade(result.data);
    case 'explosion':
      return buildExplosionCascade(result.data);
    case 'earthquake':
      return buildEarthquakeCascade(result.data);
    case 'volcano':
      return buildVolcanoCascade(result.data);
    case 'landslide':
      return buildLandslideCascade(result.data);
  }
}

function scenarioTypeLabel(type: ActiveResult['type']): string {
  switch (type) {
    case 'impact':
      return 'Cosmic impact';
    case 'explosion':
      return 'Nuclear / conventional explosion';
    case 'earthquake':
      return 'Earthquake';
    case 'volcano':
      return 'Volcanic eruption';
    case 'landslide':
      return 'Submarine / sub-aerial landslide';
  }
}

/** Pull the formula string out of the methodology catalogue that matches
 *  a triggered citation. A given citation may back several formulas; we
 *  print every matching formula row so the reader sees the exact
 *  equations this run depends on. */
function formulasForCitation(
  trigger: TriggeredCitation
): readonly { sectionId: string; name: string; formula: string }[] {
  const hits: { sectionId: string; name: string; formula: string }[] = [];
  for (const section of METHODOLOGY_SECTIONS) {
    for (const entry of section.entries) {
      if (entry.citation === trigger.citation) {
        hits.push({ sectionId: section.id, name: entry.name, formula: entry.formula });
      }
    }
  }
  return hits;
}

export function SimulationReportPage(): JSX.Element {
  const { t } = useTranslation();
  const result = useAppStore((s) => s.result);
  const bathymetricTsunami = useAppStore((s) => s.bathymetricTsunami);
  const populationExposure = useAppStore((s) => s.populationExposure);
  const populationStatus = useAppStore((s) => s.populationStatus);
  const lastEvaluatedAt = useAppStore((s) => s.lastEvaluatedAt);
  const location = useAppStore((s) => s.location);
  const setMode = useAppStore((s) => s.setMode);

  const triggers = useMemo<TriggeredCitation[]>(
    () =>
      result
        ? collectReportCitations(result, { bathymetricTsunami: bathymetricTsunami !== null })
        : [],
    [result, bathymetricTsunami]
  );

  if (result === null) {
    return (
      <div className={styles.root}>
        <div className={styles.toolbar}>
          <button
            type="button"
            className={styles.toolButton}
            onClick={() => {
              setMode('globe');
            }}
          >
            ← {t('report.backToSimulator')}
          </button>
        </div>
        <main className={styles.page}>
          <h1 className={styles.title}>{t('report.title')}</h1>
          <p className={styles.empty}>{t('report.noResult')}</p>
        </main>
      </div>
    );
  }

  const { inputs, outputs } = fieldsFor(result);
  const cascade = cascadeFor(result);
  const timestamp = lastEvaluatedAt === null ? '' : new Date(lastEvaluatedAt).toISOString();

  const handlePrint = (): void => {
    window.print();
  };

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.toolButton}
          onClick={() => {
            setMode('globe');
          }}
        >
          ← {t('report.backToSimulator')}
        </button>
        <button type="button" className={styles.printButton} onClick={handlePrint}>
          {t('report.print')}
        </button>
      </div>

      <main className={styles.page}>
        <header className={styles.header}>
          <p className={styles.brand}>VIS — Visual Impact Software</p>
          <h1 className={styles.title}>{t('report.title')}</h1>
          <dl className={styles.meta}>
            <dt>{t('report.meta.event')}</dt>
            <dd>{scenarioTypeLabel(result.type)}</dd>
            {location !== null && (
              <>
                <dt>{t('report.meta.location')}</dt>
                <dd>
                  {location.latitude.toFixed(3)}°, {location.longitude.toFixed(3)}°
                </dd>
              </>
            )}
            {timestamp !== '' && (
              <>
                <dt>{t('report.meta.generated')}</dt>
                <dd>
                  <time dateTime={timestamp}>{timestamp}</time>
                </dd>
              </>
            )}
          </dl>
        </header>

        <section className={styles.section}>
          <h2>{t('report.inputsTitle')}</h2>
          <dl className={styles.fields}>
            {inputs.map((f) => (
              <div key={f.label} className={styles.fieldRow}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={styles.section}>
          <h2>{t('report.outputsTitle')}</h2>
          <dl className={styles.fields}>
            {outputs.map((f) => (
              <div key={f.label} className={styles.fieldRow}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {(populationExposure !== null || populationStatus !== 'idle') && (
          <section className={styles.section}>
            <h2>{t('population.label')}</h2>
            {populationStatus === 'fetching' && (
              <p className={styles.sectionIntro}>{t('population.loading')}</p>
            )}
            {populationStatus === 'error' && populationExposure === null && (
              <p className={styles.sectionIntro}>{t('population.unavailable')}</p>
            )}
            {populationExposure !== null && (
              <>
                <dl className={styles.fields}>
                  <div className={styles.fieldRow}>
                    <dt>{t(populationExposure.ringLabel)}</dt>
                    <dd>{populationExposure.exposed.toLocaleString()}</dd>
                  </div>
                  <div className={styles.fieldRow}>
                    <dt>{t('report.meta.location')}</dt>
                    <dd>r = {fmtKm(populationExposure.radiusM)}</dd>
                  </div>
                </dl>
                <p className={styles.sectionIntro}>{t('population.disclaimer')}</p>
              </>
            )}
          </section>
        )}

        {cascade.length > 0 && (
          <section className={styles.section}>
            <CascadeTimeline stages={cascade} />
          </section>
        )}

        <section className={styles.section}>
          <h2>{t('report.equationsTitle')}</h2>
          <p className={styles.sectionIntro}>{t('report.equationsBody')}</p>
          <div className={styles.equations}>
            {triggers.map((trigger) => {
              const formulas = formulasForCitation(trigger);
              return (
                <article key={trigger.key} className={styles.equation}>
                  <header className={styles.equationHeader}>
                    <h3>
                      {trigger.citation.authors.split(',')[0]?.trim() ?? trigger.citation.authors} (
                      {trigger.citation.year.toString()})
                    </h3>
                    <p className={styles.reason}>{trigger.reason}</p>
                  </header>
                  {formulas.map((f) => (
                    <div key={`${trigger.key}-${f.name}`} className={styles.formulaRow}>
                      <p className={styles.formulaName}>{f.name}</p>
                      <pre className={styles.formulaBlock}>{f.formula}</pre>
                    </div>
                  ))}
                </article>
              );
            })}
          </div>
        </section>

        <section className={styles.section}>
          <h2>{t('report.bibliographyTitle')}</h2>
          <ol className={styles.bibliography}>
            {triggers.map((trigger) => (
              <li key={trigger.key}>{formatCitationLine(trigger.citation)}</li>
            ))}
          </ol>
        </section>

        <footer className={styles.footer}>
          <p>{t('report.footer')}</p>
        </footer>
      </main>
    </div>
  );
}
