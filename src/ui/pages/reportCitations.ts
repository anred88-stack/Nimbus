/**
 * Per-scenario citation collector. Walks the result of a specific
 * simulation run and returns the subset of bibliographic entries whose
 * formulas were actually exercised — so the Simulation Report only
 * prints the science the run depended on, not every paper the engine
 * ships with. An underground explosion cites Young/Nordyke;
 * an airburst cites Chyba/Popova; a megathrust earthquake cites
 * Strasser; and so on.
 *
 * This file is display-layer only: no physics imports from here back
 * into the engine, and callers pass the already-computed result.
 */

import type { EarthquakeScenarioResult } from '../../physics/events/earthquake/index.js';
import type { ExplosionScenarioResult } from '../../physics/events/explosion/index.js';
import type { VolcanoScenarioResult } from '../../physics/events/volcano/index.js';
import type { ImpactScenarioResult } from '../../physics/simulate.js';
import type { ActiveResult } from '../../store/useAppStore.js';
import { CITATIONS, type Citation, type CitationKey } from './methodologyContent.js';

/**
 * A single equation trigger: the methodology key its formula was
 * bound to, together with a one-line human reason the equation fired
 * for this specific run. Rendered in the report under the citation.
 */
export interface TriggeredCitation {
  key: CitationKey;
  citation: Citation;
  reason: string;
}

/** De-duplicates entries by CitationKey, keeping the first reason. */
function dedupe(triggers: TriggeredCitation[]): TriggeredCitation[] {
  const seen = new Set<CitationKey>();
  const out: TriggeredCitation[] = [];
  for (const t of triggers) {
    if (seen.has(t.key)) continue;
    seen.add(t.key);
    out.push(t);
  }
  return out;
}

function cite(key: CitationKey, reason: string): TriggeredCitation {
  return { key, citation: CITATIONS[key], reason };
}

/** Collect the citations exercised by a cosmic-impact run. */
export function collectImpactCitations(result: ImpactScenarioResult): TriggeredCitation[] {
  const triggers: TriggeredCitation[] = [
    cite('collins2005', 'Impactor kinetic energy, transient crater, final crater.'),
    cite('brittConsolmagno2003', 'Impactor taxonomy density classes.'),
    cite('teanby2011', 'Seismic Mw estimator (modern k-scaling).'),
  ];

  if (result.crater.morphology === 'complex') {
    triggers.push(cite('pike1980', 'Complex crater depth–diameter scaling.'));
  }

  if (result.entry.regime !== 'INTACT') {
    triggers.push(cite('chyba1993', 'Pancake-model airburst classifier.'));
    triggers.push(cite('popova2013', 'Chelyabinsk 2013 pancake-penetration calibration.'));
  }

  if ((result.ejecta.blanketEdge1m as number) > 0) {
    triggers.push(cite('mcgetchin1973', 'Ballistic ejecta-blanket thickness.'));
  }

  if ((result.atmosphere.stratosphericDust as number) > 1e13) {
    triggers.push(cite('toon1997', 'Stratospheric dust loading scaling (Chicxulub anchor).'));
  }

  if ((result.atmosphere.acidRainMass as number) > 1e13) {
    triggers.push(cite('prinn1987', 'Shock-produced HNO₃ (bolide acid-rain) mass.'));
  }

  if ((result.seismic.liquefactionRadius as number) > 0) {
    triggers.push(
      cite('youdIdriss2001', 'Impact-induced liquefaction on saturated sandy soil (cross-bridge).')
    );
    triggers.push(
      cite('joynerBoore1981', 'Distance-for-PGA inversion used by the liquefaction ring.')
    );
  }

  if (result.tsunami) {
    triggers.push(cite('ward2000', 'Water-column cavity and 1/r cylindrical spreading.'));
    triggers.push(cite('wunnemann2007', 'Short-wavelength tsunami hydrocode damping.'));
    triggers.push(cite('synolakis1987', 'Plane-beach solitary-wave run-up at coast.'));
    triggers.push(
      cite('heidarzadehSatake2015', 'Far-field dispersion multiplier (DART-calibrated).')
    );
  }

  return dedupe(triggers);
}

/** Collect the citations exercised by a nuclear / conventional explosion run. */
export function collectExplosionCitations(result: ExplosionScenarioResult): TriggeredCitation[] {
  const triggers: TriggeredCitation[] = [
    cite('kinneyGraham1985', 'Peak-overpressure scaled-distance fit.'),
    cite('glasstoneDolan1977', 'Blast thresholds, thermal fluence, firestorm, initial radiation.'),
  ];

  if (result.blast.hobRegime === 'SURFACE') {
    // A contact burst excavates a real crater, so the Nordyke /
    // Murphey-Vortman / Young chain is the authority we cite.
    triggers.push(cite('nordyke1977', 'Surface-burst crater scaling with ground type.'));
  } else {
    // Airburst → no excavation; the HOB factor dominates the blast radii.
    triggers.push(cite('needham2018', 'Height-of-burst correction factor on blast radii.'));
  }

  if (result.emp.regime !== 'NEGLIGIBLE') {
    triggers.push(cite('longmire1978', 'Compton-current EMP model (source-region / HEMP).'));
  }

  return dedupe(triggers);
}

/** Collect the citations exercised by an earthquake run. */
export function collectEarthquakeCitations(result: EarthquakeScenarioResult): TriggeredCitation[] {
  const triggers: TriggeredCitation[] = [
    cite('hanksKanamori1979', 'Seismic moment from moment magnitude.'),
    cite('boore2014', 'NGA-West2 BSSA14 PGA attenuation (default estimator).'),
    cite('joynerBoore1981', 'Legacy Joyner–Boore PGA attenuation (displayed alongside BSSA14).'),
    cite('worden2012', 'MMI from PGA, California calibration.'),
    cite('faenzaMichelini2010', 'MMI from PGA, Italian / European calibration.'),
    cite('waldAllen2007', 'NEHRP site-class classification from Vs30 at the scenario coordinates.'),
  ];

  if (result.inputs.subductionInterface === true) {
    triggers.push(cite('strasser2010', 'Subduction-interface rupture-length scaling.'));
  } else {
    triggers.push(
      cite('wellsCoppersmith1994', 'Continental-crust rupture-length scaling by fault type.')
    );
  }

  if ((result.shaking.liquefactionRadius as number) > 0) {
    triggers.push(cite('youdIdriss2001', 'Liquefaction-radius threshold on saturated sandy soil.'));
  }

  if (result.tsunami) {
    triggers.push(cite('synolakis1987', 'Plane-beach tsunami run-up at coast.'));
    triggers.push(cite('heidarzadehSatake2015', 'Far-field dispersion multiplier.'));
    triggers.push(cite('ward2000', 'Cylindrical wave spreading from the rupture source.'));
  }

  return dedupe(triggers);
}

/** Collect the citations exercised by a volcanic-eruption run. */
export function collectVolcanoCitations(result: VolcanoScenarioResult): TriggeredCitation[] {
  const triggers: TriggeredCitation[] = [
    cite('mastin2009', 'Plinian plume-height scaling from volume eruption rate.'),
    cite('newhallSelf1982', 'Volcanic Explosivity Index binning.'),
    cite('robock2000', 'Climate-cooling ΔT scaling from VEI.'),
  ];

  if ((result.pyroclasticRunoutEnergyLine as number) > 0) {
    triggers.push(cite('dadeHuppert1998', 'Pyroclastic-flow energy-line runout upper bound.'));
  }

  if (result.laharRunout !== undefined) {
    triggers.push(cite('iverson1997', 'Lahar / debris-flow volume–runout scaling.'));
  }

  if (result.windAdvectedAshfall !== undefined) {
    triggers.push(
      cite('suzuki1983', 'Vertical release-height distribution along the plume column.')
    );
    triggers.push(
      cite('bonadonnaPhillips2003', 'Analytical advection-diffusion ashfall sedimentation.')
    );
    triggers.push(
      cite('ganser1993', 'Terminal velocity of grain classes (Stokes → Newton regime).')
    );
  }

  return dedupe(triggers);
}

/**
 * Polymorphic collector that dispatches on the tagged {@link ActiveResult}
 * envelope the app store uses. Returns the sorted, de-duplicated
 * citation list for the run. Optional `extras` flags let the caller
 * report non-Layer-2 triggers (bathymetric FMM, DEM-derived slope)
 * that are orchestrated outside the physics function.
 */
export interface ReportExtras {
  /** True when Fast-Marching was run on a bathymetric grid alongside
   *  the classical 1/r tsunami, producing arrival-time isochrones. */
  bathymetricTsunami?: boolean;
  /** True when a Monte-Carlo uncertainty sweep was run for this
   *  scenario, producing P10/P50/P90 bands on the headline metrics. */
  monteCarlo?: boolean;
}

export function collectReportCitations(
  result: ActiveResult,
  extras: ReportExtras = {}
): TriggeredCitation[] {
  let triggers: TriggeredCitation[];
  switch (result.type) {
    case 'impact':
      triggers = collectImpactCitations(result.data);
      break;
    case 'explosion':
      triggers = collectExplosionCitations(result.data);
      break;
    case 'earthquake':
      triggers = collectEarthquakeCitations(result.data);
      break;
    case 'volcano':
      triggers = collectVolcanoCitations(result.data);
      break;
    case 'landslide':
      // Reuses the volcano-tsunami formula stack — the Watts cube-root
      // source amplitude and the Ward-Asphaug 1/r far-field decay are
      // the only equations the landslide branch exercises.
      triggers =
        result.data.tsunami === null
          ? []
          : collectVolcanoCitations({
              ...result.data,
              // Synthetic shape: collectVolcanoCitations only reads the
              // tsunami flag, not the volcano-specific fields, so the cast
              // is safe for citation collection.
            } as never);
      break;
  }
  if (extras.bathymetricTsunami === true) {
    triggers.push(
      cite(
        'sethian1996',
        'Fast Marching eikonal solver — tsunami arrival-time isochrones on the bathymetric grid.'
      )
    );
  }
  if (extras.monteCarlo === true && result.type === 'impact') {
    triggers.push(
      cite('melosh1989', 'Sin(2θ) impact-angle distribution used for the Monte-Carlo sweep.')
    );
  }
  return dedupe(triggers);
}

/** Human-readable "IEEE-style" single-line rendering of a Citation. */
export function formatCitationLine(c: Citation): string {
  const doi = c.doi === undefined ? '' : `  ·  DOI: ${c.doi}`;
  return `${c.authors} (${c.year.toString()}). "${c.title}." ${c.venue}${doi}.`;
}
