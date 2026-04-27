import { describe, expect, it } from 'vitest';
import { EARTHQUAKE_PRESETS, simulateEarthquake } from '../../physics/events/earthquake/index.js';
import { EXPLOSION_PRESETS, simulateExplosion } from '../../physics/events/explosion/index.js';
import { VOLCANO_PRESETS, simulateVolcano } from '../../physics/events/volcano/index.js';
import { IMPACT_PRESETS, simulateImpact } from '../../physics/simulate.js';
import type { CitationKey } from './methodologyContent.js';
import {
  collectEarthquakeCitations,
  collectExplosionCitations,
  collectImpactCitations,
  collectReportCitations,
  collectVolcanoCitations,
  formatCitationLine,
} from './reportCitations.js';

function keys(triggers: readonly { key: CitationKey }[]): CitationKey[] {
  return triggers.map((t) => t.key);
}

describe('collectImpactCitations', () => {
  it('Chicxulub (oceanic) exercises the tsunami + dust + acid-rain chain', () => {
    const r = simulateImpact(IMPACT_PRESETS.CHICXULUB_OCEAN.input);
    const ks = keys(collectImpactCitations(r));
    expect(ks).toContain('collins2005');
    expect(ks).toContain('teanby2011');
    expect(ks).toContain('ward2000');
    expect(ks).toContain('wunnemann2007');
    expect(ks).toContain('synolakis1987');
    expect(ks).toContain('heidarzadehSatake2015');
    expect(ks).toContain('toon1997');
    expect(ks).toContain('prinn1987');
    // Chicxulub Mw → liquefaction ring → Youd-Idriss + Joyner-Boore
    expect(ks).toContain('youdIdriss2001');
    expect(ks).toContain('joynerBoore1981');
  });

  it('Tunguska (airburst, no ground crater) exercises Chyba + Popova, no tsunami', () => {
    const r = simulateImpact(IMPACT_PRESETS.TUNGUSKA.input);
    const ks = keys(collectImpactCitations(r));
    expect(ks).toContain('chyba1993');
    expect(ks).toContain('popova2013');
    expect(ks).not.toContain('ward2000');
    expect(ks).not.toContain('wunnemann2007');
    // Tunguska Mw is too low to trigger Youd-Idriss.
    expect(ks).not.toContain('youdIdriss2001');
  });

  it('Meteor Crater (intact iron, simple crater) does not cite airburst chain', () => {
    const r = simulateImpact(IMPACT_PRESETS.METEOR_CRATER.input);
    const ks = keys(collectImpactCitations(r));
    expect(ks).not.toContain('chyba1993');
    expect(ks).not.toContain('popova2013');
    // Simple crater (well below 3.2 km): Pike 1980 complex piecewise
    // should NOT be cited.
    expect(ks).not.toContain('pike1980');
  });

  it('de-duplicates — every citation appears at most once', () => {
    const r = simulateImpact(IMPACT_PRESETS.CHICXULUB.input);
    const ks = keys(collectImpactCitations(r));
    expect(new Set(ks).size).toBe(ks.length);
  });
});

describe('collectExplosionCitations', () => {
  it('Hiroshima (airburst) cites Needham HOB correction, not Nordyke cratering', () => {
    const r = simulateExplosion(EXPLOSION_PRESETS.HIROSHIMA_1945.input);
    const ks = keys(collectExplosionCitations(r));
    expect(ks).toContain('kinneyGraham1985');
    expect(ks).toContain('glasstoneDolan1977');
    expect(ks).toContain('needham2018');
    // Airburst → no surface crater → Nordyke should not appear.
    expect(ks).not.toContain('nordyke1977');
  });

  it('Castle Bravo (surface burst) cites Nordyke cratering, not Needham HOB', () => {
    const r = simulateExplosion(EXPLOSION_PRESETS.CASTLE_BRAVO_1954.input);
    const ks = keys(collectExplosionCitations(r));
    expect(ks).toContain('nordyke1977');
    expect(ks).not.toContain('needham2018');
    // Surface burst: EMP should be NEGLIGIBLE, so Longmire omitted.
    expect(ks).not.toContain('longmire1978');
  });

  it('Tsar Bomba (high airburst, source-region EMP) cites Longmire', () => {
    const r = simulateExplosion(EXPLOSION_PRESETS.TSAR_BOMBA_1961.input);
    const ks = keys(collectExplosionCitations(r));
    expect(ks).toContain('longmire1978');
  });
});

describe('collectEarthquakeCitations', () => {
  it('Tōhoku (megathrust) cites Strasser, not Wells-Coppersmith; adds tsunami chain', () => {
    const r = simulateEarthquake(EARTHQUAKE_PRESETS.TOHOKU_2011.input);
    const ks = keys(collectEarthquakeCitations(r));
    expect(ks).toContain('strasser2010');
    expect(ks).not.toContain('wellsCoppersmith1994');
    expect(ks).toContain('synolakis1987');
    expect(ks).toContain('heidarzadehSatake2015');
    // Mw 9 triggers basin-scale liquefaction → Youd-Idriss.
    expect(ks).toContain('youdIdriss2001');
  });

  it('Northridge (continental reverse) cites Wells-Coppersmith, not Strasser', () => {
    const r = simulateEarthquake(EARTHQUAKE_PRESETS.NORTHRIDGE_1994.input);
    const ks = keys(collectEarthquakeCitations(r));
    expect(ks).toContain('wellsCoppersmith1994');
    expect(ks).not.toContain('strasser2010');
    // Northridge not a megathrust → no tsunami chain.
    expect(ks).not.toContain('synolakis1987');
  });
});

describe('collectVolcanoCitations', () => {
  it('Pinatubo (has lahar) cites Iverson; Krakatau (no lahar) does not', () => {
    const pinatubo = simulateVolcano(VOLCANO_PRESETS.PINATUBO_1991.input);
    const krakatau = simulateVolcano(VOLCANO_PRESETS.KRAKATAU_1883.input);
    expect(keys(collectVolcanoCitations(pinatubo))).toContain('iverson1997');
    expect(keys(collectVolcanoCitations(krakatau))).not.toContain('iverson1997');
  });

  it('always cites Mastin + Newhall-Self + Robock (core volcano pipeline)', () => {
    const r = simulateVolcano(VOLCANO_PRESETS.TAMBORA_1815.input);
    const ks = keys(collectVolcanoCitations(r));
    expect(ks).toContain('mastin2009');
    expect(ks).toContain('newhallSelf1982');
    expect(ks).toContain('robock2000');
  });
});

describe('collectReportCitations polymorphic dispatch', () => {
  it('routes on the ActiveResult type tag', () => {
    const data = simulateImpact(IMPACT_PRESETS.CHELYABINSK.input);
    const triggers = collectReportCitations({ type: 'impact', data });
    expect(keys(triggers)).toContain('chyba1993');
  });
});

describe('formatCitationLine', () => {
  it('renders authors, year, title, venue, and DOI', () => {
    const line = formatCitationLine({
      authors: 'Smith, A.',
      year: 2020,
      title: 'Example',
      venue: 'Journal',
      doi: '10.0/xyz',
    });
    expect(line).toBe('Smith, A. (2020). "Example." Journal  ·  DOI: 10.0/xyz.');
  });

  it('omits the DOI fragment when absent', () => {
    const line = formatCitationLine({
      authors: 'Smith, A.',
      year: 2020,
      title: 'Example',
      venue: 'Journal',
    });
    expect(line).toBe('Smith, A. (2020). "Example." Journal.');
  });
});
