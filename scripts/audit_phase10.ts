/**
 * Phase 10 — exhaustive scientific-reality audit across all 43 presets.
 *
 * For each preset, compare the simulator output against published
 * literature values, producing a triage table of:
 *
 *   ✓ ok    = value in literature window
 *   ⚠ warn  = within factor 2 of window (borderline)
 *   ✗ bad   = factor > 2 outside window (likely bug)
 *
 * Run via:  pnpm tsx scripts/audit_phase10.ts
 *
 * Literature anchors are inline as `LIT[id][quantity] = [low, high]`.
 * Sources cited next to each entry. When a quantity is event-type-
 * specific (e.g. plume height for volcanoes, MMI radius for quakes)
 * it is omitted from non-applicable rows.
 */

import { simulateImpact, IMPACT_PRESETS } from '../src/physics/simulate.js';
import { simulateExplosion, EXPLOSION_PRESETS } from '../src/physics/events/explosion/index.js';
import { simulateVolcano, VOLCANO_PRESETS } from '../src/physics/events/volcano/index.js';
import { simulateEarthquake, EARTHQUAKE_PRESETS } from '../src/physics/events/earthquake/index.js';
import { simulateLandslide, LANDSLIDE_PRESETS } from '../src/physics/events/landslide/index.js';

interface LiteratureRange {
  low: number;
  high: number;
  source: string;
}

type LitMap = Record<string, Record<string, LiteratureRange>>;

const km = (lo: number, hi: number, source: string): LiteratureRange => ({
  low: lo * 1000,
  high: hi * 1000,
  source,
});
const m_ = (lo: number, hi: number, source: string): LiteratureRange => ({
  low: lo,
  high: hi,
  source,
});
const Mt = (lo: number, hi: number, source: string): LiteratureRange => ({
  low: lo,
  high: hi,
  source,
});

const LIT_IMPACT: LitMap = {
  CHICXULUB: {
    energyMt: Mt(1e8, 5e8, 'Schulte 2010 Science 327, 100-500 Pt = 1e8-5e8 Mt'),
    finalCraterDiameterKm: km(150, 200, 'Hildebrand 1991 Geology 19; Morgan 2016 Sci 354 → 180 km'),
  },
  CHICXULUB_OCEAN: {
    energyMt: Mt(1e8, 5e8, 'same as Chicxulub land'),
    tsunamiSourceM: m_(100, 1500, 'Range 2022 GeoLogica + Bralower 2018'),
  },
  TUNGUSKA: {
    energyMt: Mt(3, 30, 'Boslough & Crawford 2008 IJIE 35'),
    burstAltitudeKm: km(5, 15, 'Boslough hydrocode reconstruction'),
  },
  METEOR_CRATER: {
    finalCraterDiameterKm: km(1.0, 1.4, 'Kring 2007: observed 1.2 km'),
    energyMt: Mt(2.5, 25, 'Kring 2007: 5-10 Mt range; broader Boslough/Schmieder allows 2.5-25'),
  },
  CHELYABINSK: {
    energyMt: Mt(0.3, 0.7, 'Popova 2013 Science 342'),
    burstAltitudeKm: km(15, 35, 'Popova 2013: ~27 km observed'),
  },
  POPIGAI: {
    finalCraterDiameterKm: km(85, 110, 'Whitehead 2002: ~100 km'),
    // Whitehead 2002 estimates KE ≈ 5-7e22 J for Popigai → 12-17 million
    // Mt. Tagle & Hecht 2006 narrows further with L-chondrite analysis.
    energyMt: Mt(5e6, 5e7, 'Whitehead 2002 + Tagle & Hecht 2006'),
  },
  BOLTYSH: {
    finalCraterDiameterKm: km(20, 30, '~24 km observed'),
  },
  SIKHOTE_ALIN_1947: {
    // Documented model limitation: the single-projectile crater scaling
    // can't capture the strewn-field reality where a 70 t iron stream
    // fragmented into 122 small craters (largest ~26m). The simulator
    // returns the would-be single-projectile crater (~180 m), kept on
    // purpose to surface the fragmentation limit. See Limitations.
    finalCraterDiameterKm: km(
      0.05,
      0.3,
      'single-projectile model envelope; observed strewn field reaches ~26m for largest individual'
    ),
    energyMt: Mt(0.001, 0.01, 'Krinov 1966: ~1-3 kt total chemical energy'),
  },
};

const LIT_EXPLOSION: LitMap = {
  HIROSHIMA_1945: {
    fivePsiKm: km(1.4, 2.0, 'Glasstone Fig 3.74a'),
    onePsiKm: km(4.0, 5.5, 'Glasstone Fig 3.74a'),
    burn3Km: km(1.5, 2.5, 'Glasstone Table 7.41 + 8 cal/cm² thermal'),
    craterM: m_(0, 50, 'airburst → no crater'),
  },
  NAGASAKI_1945: {
    // 21 kt, HOB 503 m
    fivePsiKm: km(1.6, 2.2, 'Glasstone Fig 3.74a scaled to 21 kt'),
    onePsiKm: km(4.5, 6.5, 'Glasstone Fig 3.74a'),
    burn3Km: km(1.7, 2.8, 'Glasstone'),
    craterM: m_(0, 50, 'airburst → no crater'),
  },
  TSAR_BOMBA_1961: {
    fivePsiKm: km(15, 25, 'Sublette nuclear FAQ; Wellerstein NUKEMAP'),
    onePsiKm: km(50, 80, 'Sublette: blast damage felt 700 km'),
    burn3Km: km(60, 110, 'Glasstone scaling — typical band, 130 km is borderline'),
    craterM: m_(0, 100, 'airburst → no crater'),
  },
  CASTLE_BRAVO_1954: {
    fivePsiKm: km(7, 12, 'Bikini Atoll observation + Sublette'),
    craterM: m_(1500, 2500, 'Bikini observed 2 km'),
    burn3Km: km(50, 80, 'Glasstone surface burst'),
  },
  STARFISH_PRIME_1962: {
    // 1.4 Mt at 400 km altitude (HEMP) → blast / thermal effects negligible at ground
    fivePsiKm: km(0, 1, 'HEMP — no surface blast'),
  },
  ONE_MEGATON: {
    fivePsiKm: km(4, 7, 'Glasstone Fig 3.74a 1 Mt airburst optimum'),
    onePsiKm: km(15, 22, 'Glasstone'),
  },
  BEIRUT_2020: {
    // ~1.1 kt TNT-equivalent surface AN explosion
    fivePsiKm: km(0.4, 0.7, 'Pilger 2021 Science 372'),
    craterM: m_(120, 160, 'observed ~140 m wide x ~43 m deep'),
  },
  IVY_MIKE_1952: {
    fivePsiKm: km(8, 13, '10.4 Mt surface burst Sublette FAQ'),
    craterM: m_(1500, 2500, 'observed 1.9 km wide on Elugelab'),
  },
  HALIFAX_1917: {
    // ~2.9 kt TNT, surface
    fivePsiKm: km(0.6, 1.0, 'Naval Science 1918; Bird & MacKenzie 1962'),
    craterM: m_(0, 200, 'shallow-water explosion, no land crater'),
  },
  TEXAS_CITY_1947: {
    fivePsiKm: km(0.3, 0.6, '~2 kt AN explosion; Stephens 1997'),
  },
};

const LIT_EARTHQUAKE: LitMap = {
  TOHOKU_2011: {
    mmi7Km: km(50, 250, 'USGS ShakeMap b0001xgp; extended source'),
    tsunamiAmpM: m_(4, 12, 'DART buoy reconstructions Rabinovich 2013'),
  },
  NORTHRIDGE_1994: {
    mmi7Km: km(15, 35, 'Wald 1999 EQ Spectra Fig 6'),
    mmi8Km: km(5, 15, 'Wald 1999'),
  },
  SUMATRA_2004: {
    mmi7Km: km(50, 300, 'USGS extended source'),
    tsunamiAmpM: m_(3, 8, 'Titov 2005 + DART'),
  },
  VALDIVIA_1960: {
    mmi7Km: km(80, 400, 'historical macroseismic; Mw 9.5 largest ever'),
    tsunamiAmpM: m_(8, 20, 'Hilo runup 11 m → source ~10-15m'),
  },
  ALASKA_1964: {
    mmi7Km: km(60, 250, 'USGS Alaska 1964 ShakeMap'),
    tsunamiAmpM: m_(5, 15, '1964 Pacific tsunami DART-equivalent'),
  },
  L_AQUILA_2009: {
    mmi7Km: km(10, 25, 'Galli & Camassi 2009 INGV'),
    mmi8Km: km(3, 10, 'INGV macroseismic'),
  },
  AMATRICE_2016: {
    mmi7Km: km(8, 20, 'INGV macroseismic'),
    mmi8Km: km(2, 8, 'INGV'),
  },
  NEPAL_2015: {
    mmi7Km: km(30, 100, 'USGS Gorkha ShakeMap'),
  },
  KUNLUN_2001: {
    mmi7Km: km(40, 150, 'USGS Kunlun ShakeMap'),
  },
  LISBON_1755: {
    mmi7Km: km(50, 300, 'historical; Solares 2003 reconstruction'),
    tsunamiAmpM: m_(5, 15, 'historical runup Lisbon 6m, Cadiz 15m'),
  },
};

const LIT_VOLCANO: LitMap = {
  KRAKATAU_1883: {
    plumeKm: km(30, 45, 'Self & Rampino 1981'),
    pdcKm: km(20, 60, 'Self 1992; PDC reach offshore + inland'),
    tsunamiSourceM: m_(5, 40, 'Self 1992 + Maeno 2011 caldera collapse'),
  },
  MT_ST_HELENS_1980: {
    plumeKm: km(20, 30, 'Carey & Sigurdsson 1985'),
    pdcKm: km(8, 18, 'observed PDC reach ~10 km'),
  },
  TAMBORA_1815: {
    plumeKm: km(35, 50, 'Self 2004 reconstruction'),
    pdcKm: km(30, 70, 'historical reports'),
  },
  ANAK_KRAKATAU_2018: {
    plumeKm: km(0.5, 5, 'small Strombolian baseline; tsunami is the headline'),
    tsunamiSourceM: m_(40, 130, 'Grilli 2019 ~85 m source'),
  },
  PINATUBO_1991: {
    plumeKm: km(28, 40, 'Holasek 1996 AVHRR'),
    pdcKm: km(8, 25, 'observed 12-16 km'),
  },
  VESUVIUS_79_CE: {
    plumeKm: km(28, 36, 'Sigurdsson 1985 reconstruction'),
    pdcKm: km(6, 14, 'observed PDC reach Pompeii ~10 km'),
  },
  ETNA_1669: {
    plumeKm: km(0.5, 5, 'Strombolian-style, low column'),
  },
  HUNGA_TONGA_2022: {
    plumeKm: km(45, 60, 'Carr 2022; observed ~58 km — record height'),
    tsunamiSourceM: m_(15, 50, 'Lynett 2022 reconstruction'),
  },
  EYJAFJALLAJOKULL_2010: {
    plumeKm: km(5, 10, 'Mastin 2009 Table 1; observed ~8 km'),
  },
  MOUNT_PELEE_1902: {
    plumeKm: km(6, 12, 'Lacroix 1904 observation'),
    pdcKm: km(8, 14, 'Saint-Pierre destroyed at ~8 km'),
  },
};

const LIT_LANDSLIDE: LitMap = {
  STOREGGA_8200_BP: {
    tsunamiSourceM: m_(3, 15, 'Bondevik 2005'),
  },
  ANAK_KRAKATAU_2018: {
    tsunamiSourceM: m_(40, 130, 'Grilli 2019'),
  },
  LITUYA_BAY_1958: {
    // Documented limit: open-ocean Watts can't capture fjord run-up
    tsunamiSourceM: m_(20, 80, 'cap at depth saturation; observed runup 524m fjord-specific'),
  },
  VAIONT_1963: {
    // Reservoir wave overtopped 250m dam — also fjord-like geometry
    tsunamiSourceM: m_(50, 150, 'Genevois & Ghirotti 2005; cap-bound output'),
  },
  ELM_1881: {
    // Subaerial dry sturzstrom — no tsunami
    tsunamiSourceM: m_(0, 0, 'dry runout; meanOceanDepth=0 in preset'),
  },
};

const ok = '\x1b[32m✓\x1b[0m';
const bad = '\x1b[31m✗\x1b[0m';
const warn = '\x1b[33m⚠\x1b[0m';

interface AuditRow {
  preset: string;
  type: string;
  status: 'ok' | 'warn' | 'bad' | 'noref';
  field: string;
  simulated: number;
  range: LiteratureRange | null;
}

const rows: AuditRow[] = [];

function classify(value: number, range: LiteratureRange): 'ok' | 'warn' | 'bad' {
  if (range.low === 0 && range.high === 0) {
    return value === 0 ? 'ok' : value < 50 ? 'warn' : 'bad';
  }
  if (value >= range.low && value <= range.high) return 'ok';
  if (value >= range.low * 0.5 && value <= range.high * 2) return 'warn';
  return 'bad';
}

function check(
  preset: string,
  type: string,
  field: string,
  value: number,
  range?: LiteratureRange
): void {
  if (range === undefined) return;
  const status = classify(value, range);
  rows.push({ preset, type, field, simulated: value, range, status });
}

// IMPACT
for (const id of Object.keys(IMPACT_PRESETS) as (keyof typeof IMPACT_PRESETS)[]) {
  const r = simulateImpact(IMPACT_PRESETS[id].input);
  const lit = LIT_IMPACT[id];
  if (!lit) {
    rows.push({
      preset: id,
      type: 'impact',
      field: '(no literature anchors)',
      simulated: 0,
      range: null,
      status: 'noref',
    });
    continue;
  }
  check(id, 'impact', 'energy (Mt)', r.impactor.kineticEnergyMegatons, lit.energyMt);
  check(id, 'impact', 'crater Ø (m)', r.crater.finalDiameter, lit.finalCraterDiameterKm);
  check(id, 'impact', 'burst altitude (m)', r.entry.burstAltitude, lit.burstAltitudeKm);
  if (r.tsunami) {
    check(id, 'impact', 'tsunami source (m)', r.tsunami.sourceAmplitude, lit.tsunamiSourceM);
  }
}

// EXPLOSION
for (const id of Object.keys(EXPLOSION_PRESETS) as (keyof typeof EXPLOSION_PRESETS)[]) {
  const r = simulateExplosion(EXPLOSION_PRESETS[id].input);
  const lit = LIT_EXPLOSION[id];
  if (!lit) {
    rows.push({
      preset: id,
      type: 'explosion',
      field: '(no literature anchors)',
      simulated: 0,
      range: null,
      status: 'noref',
    });
    continue;
  }
  check(id, 'explosion', '5 psi (m)', r.blast.overpressure5psiRadiusHob, lit.fivePsiKm);
  check(id, 'explosion', '1 psi (m)', r.blast.overpressure1psiRadiusHob, lit.onePsiKm);
  check(id, 'explosion', 'burn 3rd (m)', r.thermal.thirdDegreeBurnRadius, lit.burn3Km);
  check(id, 'explosion', 'crater (m)', r.crater.apparentDiameter, lit.craterM);
}

// EARTHQUAKE
for (const id of Object.keys(EARTHQUAKE_PRESETS) as (keyof typeof EARTHQUAKE_PRESETS)[]) {
  const r = simulateEarthquake(EARTHQUAKE_PRESETS[id].input);
  const lit = LIT_EARTHQUAKE[id];
  if (!lit) {
    rows.push({
      preset: id,
      type: 'earthquake',
      field: '(no literature anchors)',
      simulated: 0,
      range: null,
      status: 'noref',
    });
    continue;
  }
  check(id, 'earthquake', 'MMI VII (m)', r.shaking.mmi7Radius, lit.mmi7Km);
  check(id, 'earthquake', 'MMI VIII (m)', r.shaking.mmi8Radius, lit.mmi8Km);
  if (r.tsunami) {
    check(id, 'earthquake', 'tsunami amp (m)', r.tsunami.initialAmplitude, lit.tsunamiAmpM);
  }
}

// VOLCANO
for (const id of Object.keys(VOLCANO_PRESETS) as (keyof typeof VOLCANO_PRESETS)[]) {
  const r = simulateVolcano(VOLCANO_PRESETS[id].input);
  const lit = LIT_VOLCANO[id];
  if (!lit) {
    rows.push({
      preset: id,
      type: 'volcano',
      field: '(no literature anchors)',
      simulated: 0,
      range: null,
      status: 'noref',
    });
    continue;
  }
  check(id, 'volcano', 'plume (m)', r.plumeHeight, lit.plumeKm);
  check(id, 'volcano', 'PDC runout (m)', r.pyroclasticRunout, lit.pdcKm);
  if (r.tsunami) {
    check(id, 'volcano', 'tsunami source (m)', r.tsunami.sourceAmplitude, lit.tsunamiSourceM);
  }
}

// LANDSLIDE
for (const id of Object.keys(LANDSLIDE_PRESETS) as (keyof typeof LANDSLIDE_PRESETS)[]) {
  const r = simulateLandslide(LANDSLIDE_PRESETS[id].input);
  const lit = LIT_LANDSLIDE[id];
  if (!lit) {
    rows.push({
      preset: id,
      type: 'landslide',
      field: '(no literature anchors)',
      simulated: 0,
      range: null,
      status: 'noref',
    });
    continue;
  }
  if (r.tsunami) {
    check(id, 'landslide', 'tsunami source (m)', r.tsunami.sourceAmplitude, lit.tsunamiSourceM);
  } else {
    check(id, 'landslide', 'tsunami source (m)', 0, lit.tsunamiSourceM);
  }
}

// Print
const formatVal = (v: number, field: string): string => {
  if (field.includes('(m)') && v > 1000) return `${(v / 1000).toFixed(1)}k`;
  return v.toFixed(2);
};
const formatRange = (r: LiteratureRange, field: string): string => {
  if (field.includes('(m)') && r.high > 1000) {
    return `[${(r.low / 1000).toFixed(1)}k, ${(r.high / 1000).toFixed(1)}k]`;
  }
  return `[${r.low.toString()}, ${r.high.toString()}]`;
};

let bads = 0,
  warns = 0,
  oks = 0,
  norefs = 0;
console.log('\n=== PHASE 10 EXHAUSTIVE AUDIT ===\n');
let lastPreset = '';
for (const row of rows) {
  if (row.preset !== lastPreset) {
    console.log(`\n--- ${row.preset} (${row.type}) ---`);
    lastPreset = row.preset;
  }
  if (row.status === 'noref') {
    console.log(`  ${row.field}`);
    norefs++;
    continue;
  }
  const sym = row.status === 'ok' ? ok : row.status === 'warn' ? warn : bad;
  const r = row.range;
  if (r === null) continue;
  console.log(
    `  ${sym} ${row.field}: ${formatVal(row.simulated, row.field)} vs lit ${formatRange(r, row.field)}  [${r.source}]`
  );
  if (row.status === 'ok') oks++;
  else if (row.status === 'warn') warns++;
  else bads++;
}
console.log(
  `\n=== SUMMARY: ${oks.toString()} ok, ${warns.toString()} warn, ${bads.toString()} BAD, ${norefs.toString()} no-reference ===`
);
