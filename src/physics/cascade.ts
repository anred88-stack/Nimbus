import type { EarthquakeScenarioResult } from './events/earthquake/index.js';
import type { ExplosionScenarioResult } from './events/explosion/index.js';
import type { LandslideScenarioResult } from './events/landslide/index.js';
import type { VolcanoScenarioResult } from './events/volcano/index.js';
import type { ImpactScenarioResult } from './simulate.js';
import type { Seconds } from './units.js';
import { s } from './units.js';

/**
 * A single secondary / tertiary effect produced by an event,
 * annotated with its approximate onset time. The simulator uses these
 * entries to build a user-facing "what happens next" timeline. Onset
 * times are rough order-of-magnitude anchors — see the individual
 * physics modules for the underlying formulas.
 */
export interface CascadeStage {
  /** Stable translation key (e.g. 'cascade.impactFlash'). */
  key: string;
  /** Approximate onset from t=0 (event trigger). */
  onset: Seconds;
  /** Severity class. 'primary' = the event itself; 'secondary' =
   *  immediate physical cascade (blast, tsunami, ejecta); 'tertiary'
   *  = long-range or delayed consequence (firestorm, climate). */
  tier: 'primary' | 'secondary' | 'tertiary';
}

/** Cosmic impact cascade. Ordered chronologically. */
export function buildImpactCascade(result: ImpactScenarioResult): CascadeStage[] {
  const stages: CascadeStage[] = [
    { key: 'cascade.impact.flash', onset: s(0), tier: 'primary' },
    { key: 'cascade.impact.crater', onset: s(0), tier: 'primary' },
    { key: 'cascade.impact.seismic', onset: s(0), tier: 'secondary' },
  ];

  // Air blast: sound takes ~3 s/km at sea level. Use 1 psi ring as
  // the far-field anchor; "≈ 1psi distance / 343 m/s" seconds.
  const blastReach = result.damage.overpressure1psi as number;
  if (blastReach > 0) {
    stages.push({
      key: 'cascade.impact.airblast',
      onset: s(blastReach / 343),
      tier: 'secondary',
    });
  }

  // Ballistic ejecta reach the far rim of the continuous blanket in
  // a small fraction of an hour. Use 60 s for every 100 km of
  // sub-orbital hop as a rough lookup.
  const ejectaReach = result.ejecta.blanketEdge1m as number;
  if (ejectaReach > 0) {
    stages.push({
      key: 'cascade.impact.ejecta',
      onset: s(Math.min((ejectaReach / 100_000) * 60, 3_600)),
      tier: 'secondary',
    });
  }

  // Thermal pulse + firestorm ignition arrive at the speed of light
  // (t ≈ 0). Sustained firestorm development takes minutes.
  if ((result.firestorm.ignitionRadius as number) > 0) {
    stages.push({ key: 'cascade.impact.firestorm', onset: s(300), tier: 'secondary' });
  }

  // Tsunami arrival if the impact site is oceanic.
  if (result.tsunami) {
    stages.push({
      key: 'cascade.impact.tsunami',
      onset: s(result.tsunami.travelTimeTo1000km || 0),
      tier: 'secondary',
    });
  }

  // Stratospheric dust peak — hours for the first injection, with
  // global spread over a few weeks. Report the first peak.
  if ((result.atmosphere.stratosphericDust as number) > 1e13) {
    stages.push({ key: 'cascade.impact.stratDust', onset: s(86_400 * 7), tier: 'tertiary' });
  }

  // Acid rain peaks over weeks as NOx/HNO₃ washes out.
  if ((result.atmosphere.acidRainMass as number) > 1e13) {
    stages.push({ key: 'cascade.impact.acidRain', onset: s(86_400 * 30), tier: 'tertiary' });
  }

  // Climate cooling onset — months for photosynthesis shutdown in
  // GLOBAL-tier or larger events.
  if (
    result.atmosphere.climateTier === 'GLOBAL' ||
    result.atmosphere.climateTier === 'EXTINCTION'
  ) {
    stages.push({ key: 'cascade.impact.climate', onset: s(86_400 * 90), tier: 'tertiary' });
  }

  // Impact-induced liquefaction — when the Teanby-Wookey Mw is large
  // enough (≈ ≥ 6.5) that the seismic waves can trigger Youd-Idriss
  // liquefaction on saturated sandy soil within the surrounding ring.
  if ((result.seismic.liquefactionRadius as number) > 0) {
    stages.push({ key: 'cascade.impact.liquefaction', onset: s(120), tier: 'secondary' });
  }

  return stages.sort((a, b) => (a.onset as number) - (b.onset as number));
}

/** Nuclear / conventional explosion cascade. */
export function buildExplosionCascade(result: ExplosionScenarioResult): CascadeStage[] {
  const stages: CascadeStage[] = [
    { key: 'cascade.explosion.flash', onset: s(0), tier: 'primary' },
    { key: 'cascade.explosion.crater', onset: s(0), tier: 'primary' },
  ];

  const blastReach = result.blast.overpressure1psiRadius as number;
  if (blastReach > 0) {
    stages.push({
      key: 'cascade.explosion.airblast',
      onset: s(blastReach / 343),
      tier: 'secondary',
    });
  }

  if ((result.firestorm.ignitionRadius as number) > 0) {
    stages.push({ key: 'cascade.explosion.firestorm', onset: s(300), tier: 'secondary' });
  }

  // Underwater / contact-water burst → tsunami. Use the 100 km
  // travel-time from the result block; that is the first contour
  // a coastal observer would see.
  if (result.tsunami) {
    stages.push({
      key: 'cascade.explosion.tsunami',
      onset: s(result.tsunami.travelTimeTo100km || 0),
      tier: 'secondary',
    });
  }

  // Yields above ~10 Mt routinely leave fallout that fogs the local
  // troposphere for days; rigorous fallout modelling is outside scope.
  if (result.yield.megatons > 10) {
    stages.push({
      key: 'cascade.explosion.falloutPlume',
      onset: s(86_400),
      tier: 'tertiary',
    });
  }

  return stages.sort((a, b) => (a.onset as number) - (b.onset as number));
}

/** Earthquake cascade. */
export function buildEarthquakeCascade(result: EarthquakeScenarioResult): CascadeStage[] {
  const stages: CascadeStage[] = [
    { key: 'cascade.earthquake.rupture', onset: s(0), tier: 'primary' },
    { key: 'cascade.earthquake.shaking', onset: s(30), tier: 'secondary' },
  ];

  // P/S waves reach 1 000 km in ≈ 2–3 minutes.
  if (result.inputs.magnitude >= 6.5) {
    stages.push({ key: 'cascade.earthquake.teleseismic', onset: s(180), tier: 'secondary' });
  }

  // Aftershock onset — first event in the catalogue. Anchors the
  // cascade to the actual realised sequence rather than to a generic
  // "minutes-after" floor.
  if (result.aftershocks.events.length > 0) {
    const firstEvent = result.aftershocks.events[0];
    if (firstEvent !== undefined) {
      stages.push({
        key: 'cascade.earthquake.aftershocks',
        onset: s(Math.max(firstEvent.timeAfterMainshock, 60)),
        tier: 'secondary',
      });
    }
  }

  // Subduction-interface megathrust → full seismic tsunami source.
  // Arrival time derived from the shallow-water celerity in the
  // result.tsunami block.
  if (result.tsunami) {
    const arrival = result.tsunami.travelTimeTo1000km || 600;
    stages.push({
      key: 'cascade.earthquake.tsunami',
      onset: s(arrival),
      tier: 'secondary',
    });
    stages.push({
      key: 'cascade.earthquake.tsunamiRunup',
      onset: s(arrival + 300),
      tier: 'tertiary',
    });
  } else if (
    result.inputs.magnitude >= 7.5 &&
    (result.inputs.faultType === 'reverse' || result.inputs.faultType === 'normal')
  ) {
    // Qualitative flag for large shallow reverse/normal events not
    // explicitly marked as subduction interface.
    stages.push({ key: 'cascade.earthquake.tsunamiRisk', onset: s(600), tier: 'tertiary' });
  }

  return stages.sort((a, b) => (a.onset as number) - (b.onset as number));
}

/** Volcanic-eruption cascade. */
export function buildVolcanoCascade(result: VolcanoScenarioResult): CascadeStage[] {
  const stages: CascadeStage[] = [
    { key: 'cascade.volcano.vent', onset: s(0), tier: 'primary' },
    { key: 'cascade.volcano.plume', onset: s(60), tier: 'primary' },
  ];

  // Lateral-blast envelope (Mt St Helens-class flank decompression)
  // cleared 27 km in ≈ 1 minute = ~450 m/s. We use a 400 m/s
  // characteristic velocity to stamp the onset; if the blast is small
  // the floor of 30 s prevents the onset from collapsing to t = 0.
  if (result.lateralBlast !== undefined) {
    const reach = result.lateralBlast.runout as number;
    stages.push({
      key: 'cascade.volcano.lateralBlast',
      onset: s(Math.max(reach / 400, 30)),
      tier: 'secondary',
    });
  }

  // Pyroclastic density currents descend at 100+ km/h, so a ~20 km
  // runout is reached in minutes.
  const runout = result.pyroclasticRunout as number;
  if (runout > 0) {
    const onsetSeconds = Math.max((runout / 30) * 60 * 0.6, 30);
    stages.push({ key: 'cascade.volcano.pdc', onset: s(onsetSeconds), tier: 'secondary' });
  }

  if (result.vei >= 4) {
    stages.push({ key: 'cascade.volcano.ashfall', onset: s(3_600), tier: 'secondary' });
  }

  // Flank- or caldera-collapse tsunami. Anchor the onset on the
  // 100 km travel-time when the source is far enough offshore; for
  // an Anak-Krakatau-class collapse the first wave reaches 100 km
  // shores in ≈ 30 minutes.
  if (result.tsunami) {
    stages.push({
      key: 'cascade.volcano.tsunami',
      onset: s(result.tsunami.travelTimeTo100km || 0),
      tier: 'secondary',
    });
  }

  if (result.vei >= 6) {
    // Stratospheric SO₂/aerosol injection → short-term climate cooling.
    stages.push({ key: 'cascade.volcano.aerosol', onset: s(86_400 * 90), tier: 'tertiary' });
  }

  return stages.sort((a, b) => (a.onset as number) - (b.onset as number));
}

/** Submarine / sub-aerial landslide cascade. */
export function buildLandslideCascade(result: LandslideScenarioResult): CascadeStage[] {
  const stages: CascadeStage[] = [
    { key: 'cascade.landslide.failure', onset: s(0), tier: 'primary' },
    { key: 'cascade.landslide.runout', onset: s(60), tier: 'primary' },
  ];
  if (result.tsunami !== null) {
    stages.push({
      key: 'cascade.landslide.tsunami',
      onset: s(result.tsunami.travelTimeTo100km || 0),
      tier: 'secondary',
    });
  }
  return stages.sort((a, b) => (a.onset as number) - (b.onset as number));
}
