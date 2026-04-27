import type { EarthquakeScenarioResult } from './events/earthquake/index.js';
import type { ExplosionScenarioResult } from './events/explosion/index.js';
import type { LandslideScenarioResult } from './events/landslide/index.js';
import type { VolcanoScenarioResult } from './events/volcano/index.js';
import type { ImpactScenarioResult } from './simulate.js';
import type { Seconds } from './units.js';
import { s } from './units.js';

/**
 * Time-scale bucket for grouping cascade stages in the timeline UI.
 *
 *   immediate   t < 60 s            — fireball, shock front, primary seismic
 *   shortTerm   60 s ≤ t < 1 day    — far-field blast, ejecta, firestorm,
 *                                     basin tsunami, aftershock first hour
 *   mediumTerm  1 day ≤ t < 1 year  — stratospheric dust peak, ash settling,
 *                                     acid-rain washout, impact-winter onset
 *   longTerm    t ≥ 1 year          — climate rebound, ocean acidification,
 *                                     plankton collapse, mass-extinction marker
 */
export type CascadePhase = 'immediate' | 'shortTerm' | 'mediumTerm' | 'longTerm';

const ONE_MINUTE = 60;
const ONE_HOUR = 3_600;
const ONE_DAY = 86_400;
const ONE_YEAR = 86_400 * 365;

function phaseOf(onset: Seconds): CascadePhase {
  const t = onset as number;
  if (t < ONE_MINUTE) return 'immediate';
  if (t < ONE_DAY) return 'shortTerm';
  if (t < ONE_YEAR) return 'mediumTerm';
  return 'longTerm';
}

/**
 * A single secondary / tertiary effect produced by an event,
 * annotated with its approximate onset time and a phase bucket. The
 * simulator uses these entries to build a user-facing "what happens
 * next" timeline. Onset times are rough order-of-magnitude anchors —
 * see the individual physics modules for the underlying formulas.
 */
export interface CascadeStage {
  /** Stable translation key (e.g. 'cascade.impact.flash'). */
  key: string;
  /** Approximate onset from t=0 (event trigger). */
  onset: Seconds;
  /** Severity class. 'primary' = the event itself; 'secondary' =
   *  immediate physical cascade (blast, tsunami, ejecta); 'tertiary'
   *  = long-range or delayed consequence (firestorm, climate). */
  tier: 'primary' | 'secondary' | 'tertiary';
  /** Time-scale bucket — derived from onset. Used by the timeline UI
   *  to render section headers (Immediate / Short term / …). */
  phase: CascadePhase;
}

function stage(key: string, onset: Seconds, tier: CascadeStage['tier']): CascadeStage {
  return { key, onset, tier, phase: phaseOf(onset) };
}

/** Cosmic impact cascade. Ordered chronologically. */
export function buildImpactCascade(result: ImpactScenarioResult): CascadeStage[] {
  const stages: CascadeStage[] = [
    stage('cascade.impact.flash', s(0), 'primary'),
    stage('cascade.impact.crater', s(0), 'primary'),
    stage('cascade.impact.seismic', s(0), 'secondary'),
  ];

  // Air blast: sound takes ~3 s/km at sea level. Use 1 psi ring as
  // the far-field anchor; "≈ 1 psi distance / 343 m/s" seconds.
  const blastReach = result.damage.overpressure1psi as number;
  if (blastReach > 0) {
    stages.push(stage('cascade.impact.airblast', s(blastReach / 343), 'secondary'));
  }

  // Ballistic ejecta reach the far rim of the continuous blanket in
  // a small fraction of an hour. ~60 s per 100 km of sub-orbital hop.
  const ejectaReach = result.ejecta.blanketEdge1m as number;
  if (ejectaReach > 0) {
    stages.push(
      stage(
        'cascade.impact.ejecta',
        s(Math.min((ejectaReach / 100_000) * 60, ONE_HOUR)),
        'secondary'
      )
    );
  }

  // Thermal pulse + firestorm ignition arrive at the speed of light;
  // sustained firestorm development takes minutes.
  if ((result.firestorm.ignitionRadius as number) > 0) {
    stages.push(stage('cascade.impact.firestorm', s(300), 'secondary'));
  }

  // Tsunami arrival if the impact site is oceanic.
  if (result.tsunami) {
    stages.push(
      stage('cascade.impact.tsunami', s(result.tsunami.travelTimeTo1000km || 0), 'secondary')
    );
  }

  // Impact-induced liquefaction — when the Teanby-Wookey Mw is large
  // enough (≈ ≥ 6.5) that the seismic waves can trigger Youd-Idriss
  // liquefaction on saturated sandy soil within the surrounding ring.
  if ((result.seismic.liquefactionRadius as number) > 0) {
    stages.push(stage('cascade.impact.liquefaction', s(120), 'secondary'));
  }

  // ---- Phase 2 tail / Phase 3 onset --------------------------------
  // Global ejecta re-entry. For GLOBAL / EXTINCTION-tier events the
  // sub-orbital hot-rock plume re-enters worldwide, the upper
  // atmosphere reaches > 1500 K, and broadleaf vegetation ignites
  // beyond the line-of-sight thermal pulse. Toon et al. (1997)
  // Reviews of Geophysics 35: 41 — §3 "Reentry of ejecta"; Goldin &
  // Melosh (2009) Geology 37: 1135 — line-of-sight cutoff resolves
  // the global-versus-regional firestorm controversy. Onset peaks
  // ≈ 30 min after impact, aligning with the K-Pg charcoal layer.
  if (
    result.atmosphere.climateTier === 'GLOBAL' ||
    result.atmosphere.climateTier === 'EXTINCTION'
  ) {
    stages.push(stage('cascade.impact.ejectaReentry', s(30 * ONE_MINUTE), 'tertiary'));
  }

  // Stratospheric dust peak — hours for the first injection, with
  // global spread over a few weeks. Report the first-week peak.
  if ((result.atmosphere.stratosphericDust as number) > 1e13) {
    stages.push(stage('cascade.impact.stratDust', s(86_400 * 7), 'tertiary'));
  }

  // Acid rain peaks over weeks as NOx/HNO₃ washes out of the
  // stratosphere (Prinn & Fegley 1987 Earth Planet. Sci. Lett. 83: 1).
  if ((result.atmosphere.acidRainMass as number) > 1e13) {
    stages.push(stage('cascade.impact.acidRain', s(ONE_DAY * 30), 'tertiary'));
  }

  // ---- Phase 3 — impact winter / photosynthesis collapse ----------
  // Soot from global wildfires + sulfate aerosols + dust cuts surface
  // insolation by an order of magnitude for months. Robertson et al.
  // (2013) JGR Biogeosciences 118: 329 — soot lifetime 1–6 yr in the
  // stratosphere. Brugger, Feulner & Petri (2017) GRL 44: 419 — coupled
  // climate model: -26 °C continental cooling for 3-4 years post-K-Pg.
  if (
    result.atmosphere.climateTier === 'GLOBAL' ||
    result.atmosphere.climateTier === 'EXTINCTION'
  ) {
    stages.push(stage('cascade.impact.impactWinter', s(ONE_DAY * 60), 'tertiary'));
  }

  // Climate cooling onset — months for photosynthesis shutdown in
  // GLOBAL-tier or larger events. Pope (2002) Geology 30: 99 — soot
  // optical depth > 50 halts photosynthesis at sea level for ≥ 1 yr.
  if (
    result.atmosphere.climateTier === 'GLOBAL' ||
    result.atmosphere.climateTier === 'EXTINCTION'
  ) {
    stages.push(stage('cascade.impact.climate', s(ONE_DAY * 90), 'tertiary'));
  }

  // Photosynthesis collapse → terrestrial food-chain failure.
  // Schulte et al. (2010) Science 327: 1214 — K-Pg fern-spore spike
  // documents the months-to-years timescale. Heavy-tier impacts only.
  if (result.atmosphere.climateTier === 'EXTINCTION') {
    stages.push(stage('cascade.impact.photoCollapse', s(ONE_DAY * 180), 'tertiary'));
  }

  // ---- Phase 4 — long-term consequences (years → millennia) -------
  // Ocean acidification from sulfate / nitrate dissolution. Ohno et
  // al. (2014) Nat. Geosci. 7: 279 — boron-isotope record of K-Pg
  // surface-ocean pH drop ≈ 0.25 units within decades.
  if (
    result.atmosphere.climateTier === 'GLOBAL' ||
    result.atmosphere.climateTier === 'EXTINCTION'
  ) {
    stages.push(stage('cascade.impact.oceanAcidification', s(ONE_YEAR), 'tertiary'));
  }

  // Plankton collapse — marine primary productivity falls and the
  // calcareous-nannoplankton record bottlenecks. Vellekoop et al.
  // (2014) PNAS 111: 7537 — the K-Pg "Strangelove ocean" interval
  // lasts ≈ 0.5–3 Myr; its onset is the first few years.
  if (result.atmosphere.climateTier === 'EXTINCTION') {
    stages.push(stage('cascade.impact.planktonCollapse', s(ONE_YEAR * 5), 'tertiary'));
  }

  // CO₂-driven warming after the soot clears — sulfate aerosols rain
  // out within a decade but volatilised carbonate-platform CO₂
  // persists. MacLeod et al. (2018) Science 360: 1467 — Tunisia
  // foraminifera record +5 °C warming for ≈ 100 kyr post-K-Pg.
  if (
    result.atmosphere.climateTier === 'GLOBAL' ||
    result.atmosphere.climateTier === 'EXTINCTION'
  ) {
    stages.push(stage('cascade.impact.co2Warming', s(ONE_YEAR * 50), 'tertiary'));
  }

  // Mass-extinction marker. Schulte et al. (2010) — Chicxulub-class
  // events drive 70-75 % species turnover within ≈ 10 kyr; Renne et
  // al. (2013) Science 339: 684 — ⁴⁰Ar/³⁹Ar dating ties the K-Pg
  // boundary to the impact within 32 ± 5 kyr.
  if (result.atmosphere.climateTier === 'EXTINCTION') {
    stages.push(stage('cascade.impact.massExtinction', s(ONE_YEAR * 10_000), 'tertiary'));
  }

  return stages.sort((a, b) => (a.onset as number) - (b.onset as number));
}

/** Nuclear / conventional explosion cascade. */
export function buildExplosionCascade(result: ExplosionScenarioResult): CascadeStage[] {
  const stages: CascadeStage[] = [
    stage('cascade.explosion.flash', s(0), 'primary'),
    stage('cascade.explosion.crater', s(0), 'primary'),
  ];

  const blastReach = result.blast.overpressure1psiRadius as number;
  if (blastReach > 0) {
    stages.push(stage('cascade.explosion.airblast', s(blastReach / 343), 'secondary'));
  }

  if ((result.firestorm.ignitionRadius as number) > 0) {
    stages.push(stage('cascade.explosion.firestorm', s(300), 'secondary'));
  }

  // Underwater / contact-water burst → tsunami. Use the 100 km
  // travel-time from the result block; that is the first contour
  // a coastal observer would see.
  if (result.tsunami) {
    stages.push(
      stage('cascade.explosion.tsunami', s(result.tsunami.travelTimeTo100km || 0), 'secondary')
    );
  }

  // Yields above ~10 Mt routinely leave fallout that fogs the local
  // troposphere for days; rigorous fallout modelling is outside scope.
  if (result.yield.megatons > 10) {
    stages.push(stage('cascade.explosion.falloutPlume', s(ONE_DAY), 'tertiary'));
  }

  // Multi-megaton groundbursts loft enough soot and sulphate aerosol
  // into the stratosphere to dim insolation for a season. Robock,
  // Oman & Stenchikov (2007) JGR 112: D13107 — 100-Mt regional
  // exchange model: 5 Tg of stratospheric soot, 1.25 °C global
  // cooling for 4 years. The 30-Mt threshold here is a coarse
  // proxy: a single Tsar-Bomba-class detonation (50 Mt) is roughly
  // half the mass-yield budget of the published exchange scenario.
  // The simulator does not model the full smoke-coupling chain, so
  // the stage flags "exposure" rather than "guaranteed onset".
  if (result.yield.megatons >= 30) {
    stages.push(stage('cascade.explosion.nuclearWinter', s(ONE_DAY * 30), 'tertiary'));
  }

  return stages.sort((a, b) => (a.onset as number) - (b.onset as number));
}

/** Earthquake cascade. */
export function buildEarthquakeCascade(result: EarthquakeScenarioResult): CascadeStage[] {
  const stages: CascadeStage[] = [
    stage('cascade.earthquake.rupture', s(0), 'primary'),
    stage('cascade.earthquake.shaking', s(30), 'secondary'),
  ];

  // P/S waves reach 1 000 km in ≈ 2–3 minutes.
  if (result.inputs.magnitude >= 6.5) {
    stages.push(stage('cascade.earthquake.teleseismic', s(180), 'secondary'));
  }

  // Aftershock onset — first event in the catalogue. Anchors the
  // cascade to the actual realised sequence rather than to a generic
  // "minutes-after" floor.
  if (result.aftershocks.events.length > 0) {
    const firstEvent = result.aftershocks.events[0];
    if (firstEvent !== undefined) {
      stages.push(
        stage(
          'cascade.earthquake.aftershocks',
          s(Math.max(firstEvent.timeAfterMainshock, ONE_MINUTE)),
          'secondary'
        )
      );
    }
  }

  // Subduction-interface megathrust → full seismic tsunami source.
  // Arrival time derived from the shallow-water celerity in the
  // result.tsunami block.
  if (result.tsunami) {
    const arrival = result.tsunami.travelTimeTo1000km || 600;
    stages.push(stage('cascade.earthquake.tsunami', s(arrival), 'secondary'));
    stages.push(stage('cascade.earthquake.tsunamiRunup', s(arrival + 300), 'tertiary'));
  } else if (
    result.inputs.magnitude >= 7.5 &&
    (result.inputs.faultType === 'reverse' || result.inputs.faultType === 'normal')
  ) {
    // Qualitative flag for large shallow reverse/normal events not
    // explicitly marked as subduction interface.
    stages.push(stage('cascade.earthquake.tsunamiRisk', s(600), 'tertiary'));
  }

  return stages.sort((a, b) => (a.onset as number) - (b.onset as number));
}

/** Volcanic-eruption cascade. */
export function buildVolcanoCascade(result: VolcanoScenarioResult): CascadeStage[] {
  const stages: CascadeStage[] = [
    stage('cascade.volcano.vent', s(0), 'primary'),
    stage('cascade.volcano.plume', s(60), 'primary'),
  ];

  // Lateral-blast envelope (Mt St Helens-class flank decompression)
  // cleared 27 km in ≈ 1 minute = ~450 m/s. We use a 400 m/s
  // characteristic velocity to stamp the onset; if the blast is small
  // the floor of 30 s prevents the onset from collapsing to t = 0.
  if (result.lateralBlast !== undefined) {
    const reach = result.lateralBlast.runout as number;
    stages.push(stage('cascade.volcano.lateralBlast', s(Math.max(reach / 400, 30)), 'secondary'));
  }

  // Pyroclastic density currents descend at 100+ km/h, so a ~20 km
  // runout is reached in minutes.
  const runout = result.pyroclasticRunout as number;
  if (runout > 0) {
    const onsetSeconds = Math.max((runout / 30) * 60 * 0.6, 30);
    stages.push(stage('cascade.volcano.pdc', s(onsetSeconds), 'secondary'));
  }

  if (result.vei >= 4) {
    stages.push(stage('cascade.volcano.ashfall', s(ONE_HOUR), 'secondary'));
  }

  // Flank- or caldera-collapse tsunami. Anchor the onset on the
  // 100 km travel-time when the source is far enough offshore; for
  // an Anak-Krakatau-class collapse the first wave reaches 100 km
  // shores in ≈ 30 minutes.
  if (result.tsunami) {
    stages.push(
      stage('cascade.volcano.tsunami', s(result.tsunami.travelTimeTo100km || 0), 'secondary')
    );
  }

  if (result.vei >= 6) {
    // Stratospheric SO₂/aerosol injection → short-term climate cooling.
    stages.push(stage('cascade.volcano.aerosol', s(ONE_DAY * 90), 'tertiary'));
  }

  // Year-without-summer / agricultural collapse for VEI 7+ (Tambora
  // 1815, Toba ≈ 74 ka). Self & Rampino (1981) Nature 294: 699; Oppenheimer
  // (2003) QSR 22: 1593 — Tambora dropped Northern Hemisphere
  // temperatures by ≈ 0.5–1 °C for 2-3 years and triggered the 1816
  // famine across Europe and North America.
  if (result.vei >= 7) {
    stages.push(stage('cascade.volcano.yearWithoutSummer', s(ONE_YEAR), 'tertiary'));
  }

  return stages.sort((a, b) => (a.onset as number) - (b.onset as number));
}

/** Submarine / sub-aerial landslide cascade. */
export function buildLandslideCascade(result: LandslideScenarioResult): CascadeStage[] {
  const stages: CascadeStage[] = [
    stage('cascade.landslide.failure', s(0), 'primary'),
    stage('cascade.landslide.runout', s(60), 'primary'),
  ];
  if (result.tsunami !== null) {
    stages.push(
      stage('cascade.landslide.tsunami', s(result.tsunami.travelTimeTo100km || 0), 'secondary')
    );
  }
  return stages.sort((a, b) => (a.onset as number) - (b.onset as number));
}
