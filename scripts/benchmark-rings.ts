/**
 * Benchmark: ring radii for canonical scenarios vs. published numbers.
 *
 * Compares the simulator output against the textbook reference values
 * for a handful of well-documented scenarios (Hiroshima, Castle Bravo,
 * 1 Mt surface burst, Tunguska, Chicxulub). The goal is NOT to test
 * the simulator (the unit tests already pin individual formulas to
 * ±5 %) but to give the user a single-page printout that says, for the
 * exact rings the map draws, "this radius matches Glasstone / this
 * radius matches Collins-Melosh-Marcus / this radius is off by Δ %".
 *
 * No fixes. Read-only sanity check.
 */
import { EXPLOSION_PRESETS, simulateExplosion } from '../src/physics/events/explosion/index.js';
import { simulateImpact, IMPACT_PRESETS } from '../src/physics/simulate.js';

interface Reference {
  scenario: string;
  field: string;
  reference: number;
  unit: 'm' | 'km';
  source: string;
  computed: number;
}

const refs: Reference[] = [];

function pushRef(
  scenario: string,
  field: string,
  reference: number,
  unit: 'm' | 'km',
  source: string,
  computed: number
): void {
  refs.push({ scenario, field, reference, unit, source, computed });
}

// ── Hiroshima (15 kt, ~580 m airburst over Hiroshima city centre) ─────
// Glasstone & Dolan 1977 Tab 12.20 (15 kt freeair) + Lawrence 1981
// Hiroshima reconstruction:
//   - 5 psi: ~1.9 km  (severe damage, MOST buildings collapsed)
//   - 1 psi: ~5.4 km  (window glass, scattered injuries)
//   - 3° burn (no shielding): ~2.0 km
//   - 2° burn: ~3.5 km
//   - LD50 prompt radiation: ~1.1 km
{
  const r = simulateExplosion(EXPLOSION_PRESETS.HIROSHIMA_1945.input);
  pushRef(
    'Hiroshima 15 kt',
    'overpressure5psiRadius',
    1900,
    'm',
    'Glasstone Tab 12.20',
    r.blast.overpressure5psiRadiusHob
  );
  pushRef(
    'Hiroshima 15 kt',
    'overpressure1psiRadius',
    5400,
    'm',
    'Glasstone Tab 12.20',
    r.blast.overpressure1psiRadiusHob
  );
  pushRef(
    'Hiroshima 15 kt',
    'thirdDegreeBurnRadius',
    2000,
    'm',
    'Glasstone §7',
    r.thermal.thirdDegreeBurnRadius
  );
  pushRef(
    'Hiroshima 15 kt',
    'secondDegreeBurnRadius',
    3500,
    'm',
    'Glasstone §7',
    r.thermal.secondDegreeBurnRadius
  );
  pushRef(
    'Hiroshima 15 kt',
    'radiation.ld50Radius',
    1100,
    'm',
    'Glasstone §8',
    r.radiation.ld50Radius
  );
}

// ── Castle Bravo (15 Mt, surface burst, Bikini Atoll, 1 Mar 1954) ─────
// Glasstone Tab 12.20 (10–20 Mt range) + DOE/NV-209 declassified yield:
//   - 5 psi:  ~14 km
//   - 1 psi:  ~32 km
//   - 3° burn: ~28 km (clear, dry day)
//   - 2° burn: ~40 km
{
  const r = simulateExplosion(EXPLOSION_PRESETS.CASTLE_BRAVO_1954.input);
  pushRef(
    'Castle Bravo 15 Mt',
    'overpressure5psiRadius',
    14_000,
    'm',
    'Glasstone Tab 12.20',
    r.blast.overpressure5psiRadiusHob
  );
  pushRef(
    'Castle Bravo 15 Mt',
    'overpressure1psiRadius',
    32_000,
    'm',
    'Glasstone Tab 12.20',
    r.blast.overpressure1psiRadiusHob
  );
  pushRef(
    'Castle Bravo 15 Mt',
    'thirdDegreeBurnRadius',
    28_000,
    'm',
    'Glasstone §7',
    r.thermal.thirdDegreeBurnRadius
  );
  pushRef(
    'Castle Bravo 15 Mt',
    'secondDegreeBurnRadius',
    40_000,
    'm',
    'Glasstone §7',
    r.thermal.secondDegreeBurnRadius
  );
}

// ── Tsar Bomba (50 Mt, 4 km airburst, Novaya Zemlya, 30 Oct 1961) ─────
// Sakharov / Adamsky 1996 reconstruction + Glasstone scaling:
//   - 5 psi:  ~21 km
//   - 1 psi:  ~50 km
//   - 3° burn: ~55 km (HOB amplifies thermal)
//   - 2° burn: ~80 km
{
  const r = simulateExplosion(EXPLOSION_PRESETS.TSAR_BOMBA_1961.input);
  pushRef(
    'Tsar Bomba 50 Mt',
    'overpressure5psiRadius',
    21_000,
    'm',
    'Sakharov',
    r.blast.overpressure5psiRadiusHob
  );
  pushRef(
    'Tsar Bomba 50 Mt',
    'overpressure1psiRadius',
    50_000,
    'm',
    'Sakharov',
    r.blast.overpressure1psiRadiusHob
  );
  pushRef(
    'Tsar Bomba 50 Mt',
    'thirdDegreeBurnRadius',
    55_000,
    'm',
    'Glasstone §7',
    r.thermal.thirdDegreeBurnRadius
  );
  pushRef(
    'Tsar Bomba 50 Mt',
    'secondDegreeBurnRadius',
    80_000,
    'm',
    'Glasstone §7',
    r.thermal.secondDegreeBurnRadius
  );
}

// ── 1 Mt surface burst (textbook reference, Glasstone Fig 7.46) ────────
// The canonical 1 Mt surface burst in Glasstone & Dolan §7:
//   - 5 psi: ~6.0 km
//   - 1 psi: ~14.8 km
//   - 3° burn (clear day): ~9.7 km
//   - 2° burn:             ~14 km
{
  const input = { ...EXPLOSION_PRESETS.ONE_MEGATON.input, yieldMegatons: 1.0 };
  const r = simulateExplosion(input);
  pushRef(
    '1 Mt surface burst',
    'overpressure5psiRadius',
    6_000,
    'm',
    'Glasstone §7.30',
    r.blast.overpressure5psiRadiusHob
  );
  pushRef(
    '1 Mt surface burst',
    'overpressure1psiRadius',
    14_800,
    'm',
    'Glasstone §7.30',
    r.blast.overpressure1psiRadiusHob
  );
  pushRef(
    '1 Mt surface burst',
    'thirdDegreeBurnRadius',
    9_700,
    'm',
    'Glasstone §7.46',
    r.thermal.thirdDegreeBurnRadius
  );
  pushRef(
    '1 Mt surface burst',
    'secondDegreeBurnRadius',
    14_000,
    'm',
    'Glasstone §7.46',
    r.thermal.secondDegreeBurnRadius
  );
}

// ── Tunguska (1908 airburst, ≈ 12-15 Mt energy, ≈ 8 km altitude) ──────
// Boslough & Crawford 2008 hydrocode + Svetsov 1996 ground forest fall:
//   - Forest blowdown radius (≈ 5 psi reach): ~22 km
//   - Felt blast (1 psi reach): ~50 km
//   - 3rd-degree burn / scorch: ~10 km
{
  const r = simulateImpact(IMPACT_PRESETS.TUNGUSKA.input);
  pushRef(
    'Tunguska 1908',
    'damage.overpressure5psi',
    22_000,
    'm',
    'Boslough & Crawford',
    r.damage.overpressure5psi
  );
  pushRef(
    'Tunguska 1908',
    'damage.overpressure1psi',
    50_000,
    'm',
    'Svetsov 1996',
    r.damage.overpressure1psi
  );
  pushRef(
    'Tunguska 1908',
    'damage.thirdDegreeBurn',
    10_000,
    'm',
    'Boslough & Crawford',
    r.damage.thirdDegreeBurn
  );
}

// ── Chicxulub (10 km bolide, 65 Ma) ────────────────────────────────────
// Collins, Melosh & Marcus 2005 Earth Impact Effects Program:
//   - Final crater diameter:  ~180 km  (geophysics observation +
//                                       hydrocode hindcast)
//   - 1 psi blast reach:      ~6 000 km
{
  const r = simulateImpact(IMPACT_PRESETS.CHICXULUB.input);
  // crater.finalDiameter is a diameter; we compare to ~180 km.
  pushRef(
    'Chicxulub',
    'crater.finalDiameter',
    180_000,
    'm',
    'Morgan et al 2016',
    r.crater.finalDiameter
  );
  pushRef(
    'Chicxulub',
    'damage.overpressure1psi',
    6_000_000,
    'm',
    'Collins-Melosh-Marcus',
    r.damage.overpressure1psi
  );
}

// ── Print the table ───────────────────────────────────────────────────
function fmt(v: number, unit: 'm' | 'km'): string {
  if (unit === 'km' || v >= 1_000) return `${(v / 1_000).toFixed(1)} km`;
  return `${v.toFixed(0)} m`;
}

const PASS_THRESHOLD_PCT = 30; // Glasstone curves are ±20-30 % even
// between editions; 30 % is "in
// scientific agreement" for popular-
// science-grade simulator output.

let pass = 0;
let warn = 0;
let fail = 0;

process.stdout.write('Ring-radius benchmark — simulator vs. published references\n');
process.stdout.write('═'.repeat(80));
process.stdout.write('\n\n');
let lastScenario = '';
for (const ref of refs) {
  if (ref.scenario !== lastScenario) {
    process.stdout.write(`▸ ${ref.scenario}\n`);
    lastScenario = ref.scenario;
  }
  const errorPct = (Math.abs(ref.computed - ref.reference) / ref.reference) * 100;
  let status: string;
  if (errorPct <= PASS_THRESHOLD_PCT) {
    status = '✓';
    pass += 1;
  } else if (errorPct <= 100) {
    status = '⚠';
    warn += 1;
  } else {
    status = '✗';
    fail += 1;
  }
  const sign = ref.computed > ref.reference ? '+' : '';
  process.stdout.write(
    `   ${status}  ${ref.field.padEnd(28)}  computed: ${fmt(ref.computed, ref.unit).padStart(10)}   reference: ${fmt(ref.reference, ref.unit).padStart(10)}   Δ ${sign}${errorPct.toFixed(0).padStart(3)}%   [${ref.source}]\n`
  );
}

process.stdout.write('\n');
process.stdout.write('═'.repeat(80));
process.stdout.write('\n');
process.stdout.write(
  `Summary: ${pass.toString()} within ±${PASS_THRESHOLD_PCT.toString()}% of reference, ${warn.toString()} between ${PASS_THRESHOLD_PCT.toString()}-100%, ${fail.toString()} > 100%.\n`
);
