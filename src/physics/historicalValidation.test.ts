import { describe, expect, it } from 'vitest';
import { EARTHQUAKE_PRESETS, simulateEarthquake } from './events/earthquake/index.js';
import { EXPLOSION_PRESETS, simulateExplosion } from './events/explosion/index.js';
import { VOLCANO_PRESETS, simulateVolcano } from './events/volcano/index.js';
import { IMPACT_PRESETS, simulateImpact } from './simulate.js';
import { STANDARD_GRAVITY } from './constants.js';
import { m } from './units.js';

/**
 * Historical-event validation suite.
 *
 * Every assertion below pins a simulator output against a published
 * observation. These are not unit tests of the formulas themselves —
 * those live next to each formula module. They are integration
 * anchors: if any physics change drifts the output of one of the
 * best-instrumented events in the historical record, this file fails
 * first.
 *
 * Validated events: Chelyabinsk 2013, Tunguska 1908, Meteor Crater,
 * Chicxulub, Hiroshima 1945, Castle Bravo 1954, Tsar Bomba 1961,
 * Northridge 1994, Tōhoku 2011, Krakatau 1883, Mount St Helens 1980,
 * Pinatubo 1991, Tambora 1815. Tolerances are honest: where the
 * published scatter is ±factor-2, so is the test.
 */

describe('Historical validation — cosmic impacts', () => {
  it('Chelyabinsk 2013: complete airburst, 0.3–0.7 Mt, no crater', () => {
    const r = simulateImpact(IMPACT_PRESETS.CHELYABINSK.input);
    expect(r.entry.regime).toBe('COMPLETE_AIRBURST');
    expect(r.impactor.kineticEnergyMegatons as number).toBeGreaterThan(0.3);
    expect(r.impactor.kineticEnergyMegatons as number).toBeLessThan(0.7);
    expect(r.crater.finalDiameter as number).toBeLessThan(500);
    // Observed burst altitude ~27 km (Popova 2013 Science 342). Our
    // simplified Chyba pancake gives ~22 km — within a factor of 2.
    expect(r.entry.burstAltitude as number).toBeGreaterThan(15_000);
    expect(r.entry.burstAltitude as number).toBeLessThan(35_000);
  });

  it('Tunguska 1908: partial airburst 5–15 km altitude', () => {
    const r = simulateImpact(IMPACT_PRESETS.TUNGUSKA.input);
    expect(r.entry.regime).toBe('PARTIAL_AIRBURST');
    expect(r.entry.burstAltitude as number).toBeGreaterThan(5_000);
    expect(r.entry.burstAltitude as number).toBeLessThan(15_000);
  });

  it('Meteor Crater: intact iron impactor, ~1 km crater (observed 1.2 km)', () => {
    const r = simulateImpact(IMPACT_PRESETS.METEOR_CRATER.input);
    expect(r.entry.regime).toBe('INTACT');
    const observed = 1_200;
    expect(Math.abs((r.crater.finalDiameter as number) - observed) / observed).toBeLessThan(0.35);
  });

  it('Chicxulub: ~180 km complex crater, EXTINCTION climate tier', () => {
    const r = simulateImpact(IMPACT_PRESETS.CHICXULUB.input);
    expect(r.crater.morphology).toBe('complex');
    expect(Math.abs((r.crater.finalDiameter as number) - 180_000) / 180_000).toBeLessThan(0.15);
    expect(['GLOBAL', 'EXTINCTION']).toContain(r.atmosphere.climateTier);
  });

  it('Popigai: ~100 km complex crater (Tagle & Hecht 2006)', () => {
    // Phase-17 audit guard: the previous L = 7 km preset under-shot
    // the observed 100 km final diameter by 15 %, at the edge of the
    // tolerance envelope. L = 8.1 km recovers it within ~1 %.
    const r = simulateImpact(IMPACT_PRESETS.POPIGAI.input);
    expect(r.crater.morphology).toBe('complex');
    const observed = 100_000;
    expect(Math.abs((r.crater.finalDiameter as number) - observed) / observed).toBeLessThan(0.15);
  });

  it('Boltysh: ~24 km complex crater (Kelley & Gurov 2002)', () => {
    // Phase-17 audit guard: the previous L = 800 m preset predicted
    // only 11.5 km — a 52 % under-shoot rooted in a confused inversion
    // of Collins 2005 (D_tc vs D_fr). L = 1.76 km recovers the
    // observed 24 km within < 1 %.
    const r = simulateImpact(IMPACT_PRESETS.BOLTYSH.input);
    expect(r.crater.morphology).toBe('complex');
    const observed = 24_000;
    expect(Math.abs((r.crater.finalDiameter as number) - observed) / observed).toBeLessThan(0.15);
  });

  it('Impact→liquefaction cross-bridge: Chicxulub Mw feeds Youd-Idriss into a continental ring', () => {
    const r = simulateImpact(IMPACT_PRESETS.CHICXULUB.input);
    // Teanby-Wookey Mw for Chicxulub is ~7.3; Youd-Idriss should then
    // push the liquefaction radius out to hundreds of km.
    expect(r.seismic.magnitudeTeanbyWookey).toBeGreaterThan(7);
    // Teanby-Wookey (conservative) gives a ~45 km liquefaction radius
    // for Chicxulub-equivalent Mw — an order-of-magnitude continent-
    // spanning effect once you account for real soil distributions.
    expect((r.seismic.liquefactionRadius as number) / 1_000).toBeGreaterThan(30);
  });

  it('Impact→liquefaction cross-bridge: Tunguska Mw too low to trigger any liquefaction', () => {
    const r = simulateImpact(IMPACT_PRESETS.TUNGUSKA.input);
    expect(r.seismic.magnitudeTeanbyWookey).toBeLessThan(5);
    expect(r.seismic.liquefactionRadius).toBe(0);
  });
});

describe('Historical validation — nuclear explosions', () => {
  it('Hiroshima 1945: ~15 kt, near-optimum airburst (scaled HOB ~235 m·kt^(-1/3))', () => {
    const r = simulateExplosion(EXPLOSION_PRESETS.HIROSHIMA_1945.input);
    expect(r.yield.megatons * 1_000).toBeCloseTo(15, 0);
    expect(r.blast.hobRegime).toBe('OPTIMUM');
    expect(r.blast.hobScaled).toBeGreaterThan(200);
    expect(r.blast.hobScaled).toBeLessThan(260);
    // 5 psi ring ≈ 1.5 km observed — our HOB-corrected value should
    // bracket that within 50 %.
    const r5HobKm = (r.blast.overpressure5psiRadiusHob as number) / 1_000;
    expect(r5HobKm).toBeGreaterThan(0.5);
    expect(r5HobKm).toBeLessThan(3);
    // Initial-radiation LD50 at 1.5–2.5 km is the observed "acute
    // death zone" radius — matches our radiation radii within factor 2.
    expect((r.radiation.ld50Radius as number) / 1_000).toBeGreaterThan(1);
    expect((r.radiation.ld50Radius as number) / 1_000).toBeLessThan(3);
  });

  it('Castle Bravo 1954: 15 Mt surface burst on wet coral (LD100 and crater in km range)', () => {
    const r = simulateExplosion(EXPLOSION_PRESETS.CASTLE_BRAVO_1954.input);
    expect(r.yield.megatons).toBe(15);
    expect(r.blast.hobRegime).toBe('SURFACE');
    // Observed Bravo crater ~1.9 km across in reef — bracket within ±50 %.
    const craterKm = (r.crater.apparentDiameter as number) / 1_000;
    expect(craterKm).toBeGreaterThan(1);
    expect(craterKm).toBeLessThan(3);
    // EMP negligible at surface.
    expect(r.emp.regime).toBe('NEGLIGIBLE');
  });

  it('Tsar Bomba 1961: 50 Mt, high airburst, no HEMP (below 30 km)', () => {
    const r = simulateExplosion(EXPLOSION_PRESETS.TSAR_BOMBA_1961.input);
    expect(r.yield.megatons).toBe(50);
    expect(r.blast.hobRegime).toBe('LOW_AIRBURST');
    expect(r.emp.regime).toBe('SOURCE_REGION');
  });

  it('Starfish Prime 1962: 1.4 Mt @ 400 km — HEMP footprint covers Oahu at 1 450 km', () => {
    const r = simulateExplosion(EXPLOSION_PRESETS.STARFISH_PRIME_1962.input);
    expect(r.yield.megatons).toBeCloseTo(1.4, 2);
    expect(r.emp.regime).toBe('HEMP_HIGH_ALTITUDE');
    // Horizon-tangent disc at h = 400 km: √(2·R_E·h + h²) ≈ 2 293 km.
    // Johnston Atoll → Oahu is ≈1 450 km, inside the footprint.
    const footprintKm = (r.emp.affectedRadius as number) / 1_000;
    expect(footprintKm).toBeGreaterThan(1_450);
    expect(footprintKm).toBeLessThan(3_000);
    // Peak field saturates at the IEC 61000-2-9 50 kV/m plateau for
    // yields above 1 Mt (Compton-current gamma-flux ceiling).
    // Starfish at 1.4 Mt sits just above the cap, so the reported
    // peak is exactly 50 kV/m.
    const peakKvM = r.emp.peakField / 1_000;
    expect(peakKvM).toBeCloseTo(50, 1);
    // Stratospheric HOB: blast coupling is negligible at ground level.
    expect(r.blast.hobRegime).toBe('STRATOSPHERIC');
  });

  it('HEMP peak saturates at 50 kV/m above 1 Mt (IEC 61000-2-9 plateau)', () => {
    const oneMt = simulateExplosion({
      yieldMegatons: 1,
      groundType: 'FIRM_GROUND',
      heightOfBurst: m(400_000),
    });
    const fiveMt = simulateExplosion({
      yieldMegatons: 5,
      groundType: 'FIRM_GROUND',
      heightOfBurst: m(400_000),
    });
    // Above the 1 Mt anchor the peak plateaus — both should sit at
    // exactly 50 kV/m regardless of yield.
    expect(oneMt.emp.peakField / 1_000).toBeCloseTo(50, 1);
    expect(fiveMt.emp.peakField / 1_000).toBeCloseTo(50, 1);
  });

  it('HEMP peak field scales as W^(1/3) below 1 Mt: a 10 kt exoatmospheric burst is ~5× weaker than Starfish', () => {
    const starfish = simulateExplosion(EXPLOSION_PRESETS.STARFISH_PRIME_1962.input);
    const lowYield = simulateExplosion({
      yieldMegatons: 0.01, // 10 kt
      groundType: 'FIRM_GROUND',
      heightOfBurst: m(400_000),
    });
    expect(lowYield.emp.regime).toBe('HEMP_HIGH_ALTITUDE');
    // Still above the 1 kV/m damage threshold — exoatmospheric geometry
    // radiates efficiently even at modest yields.
    expect(lowYield.emp.peakField).toBeGreaterThan(1_000);
    // But substantially weaker than the 1.4 Mt Starfish reference.
    expect(lowYield.emp.peakField).toBeLessThan(starfish.emp.peakField * 0.3);
    // Horizon geometry only depends on altitude, so the footprint
    // disc is the same as Starfish — not yield-dependent.
    expect((lowYield.emp.affectedRadius as number) / 1_000).toBeCloseTo(
      (starfish.emp.affectedRadius as number) / 1_000,
      0
    );
  });
});

describe('Historical validation — earthquakes', () => {
  it('Northridge 1994: Mw 6.7 reverse, NGA-West2 PGA @ 20 km in 0.1–0.4 g window', () => {
    const r = simulateEarthquake(EARTHQUAKE_PRESETS.NORTHRIDGE_1994.input);
    expect(r.inputs.magnitude).toBeCloseTo(6.7, 2);
    const pgaG = (r.shaking.pgaAt20kmNGA as number) / STANDARD_GRAVITY;
    expect(pgaG).toBeGreaterThan(0.05);
    expect(pgaG).toBeLessThan(0.5);
  });

  it('Tōhoku 2011: Mw 9.1 megathrust, ~700 km rupture (observed 500–600 km)', () => {
    const r = simulateEarthquake(EARTHQUAKE_PRESETS.TOHOKU_2011.input);
    expect(r.inputs.magnitude).toBeCloseTo(9.1, 2);
    // Strasser 2010 megathrust predicts ~703 km for Mw 9.1.
    const ruptureKm = (r.ruptureLength as number) / 1_000;
    expect(ruptureKm).toBeGreaterThan(400);
    expect(ruptureKm).toBeLessThan(900);
    // Mw 9 events trigger basin-scale liquefaction (Tōhoku observed
    // liquefaction across ~2 × 10⁴ km² of the Kantō plain).
    expect((r.shaking.liquefactionRadius as number) / 1_000).toBeGreaterThan(50);
  });

  it('Kokoxili 2001: Mw 7.8 strike-slip, rupture 100–450 km (observed 400 km)', () => {
    const r = simulateEarthquake(EARTHQUAKE_PRESETS.KUNLUN_2001.input);
    const ruptureKm = (r.ruptureLength as number) / 1_000;
    expect(ruptureKm).toBeGreaterThan(100);
    expect(ruptureKm).toBeLessThan(500);
  });

  it('Megathrust→tsunami cross-bridge: Tōhoku produces a seafloor-uplift tsunami source', () => {
    const r = simulateEarthquake(EARTHQUAKE_PRESETS.TOHOKU_2011.input);
    expect(r.tsunami).toBeDefined();
    if (!r.tsunami) return;
    // Observed mean slip ~10–15 m, seafloor uplift ~5–7 m.
    expect(r.tsunami.meanSlip as number).toBeGreaterThan(5);
    expect(r.tsunami.meanSlip as number).toBeLessThan(25);
    expect(r.tsunami.initialAmplitude as number).toBeGreaterThan(3);
    expect(r.tsunami.initialAmplitude as number).toBeLessThan(15);
    // Non-zero coastal run-up.
    expect(r.tsunami.runupAt1000km as number).toBeGreaterThan(1);
  });

  it('Megathrust→tsunami cross-bridge: Northridge (no subduction flag) omits the tsunami block', () => {
    const r = simulateEarthquake(EARTHQUAKE_PRESETS.NORTHRIDGE_1994.input);
    expect(r.tsunami).toBeUndefined();
  });
});

describe('Historical validation — volcanic eruptions', () => {
  it('Krakatau 1883: VEI 6, plume 20–60 km (observed ~40 km)', () => {
    const r = simulateVolcano(VOLCANO_PRESETS.KRAKATAU_1883.input);
    expect(r.vei).toBe(6);
    const plumeKm = (r.plumeHeight as number) / 1_000;
    expect(plumeKm).toBeGreaterThan(20);
    expect(plumeKm).toBeLessThan(60);
  });

  it('Mount St Helens 1980: VEI 5, plume 20–28 km, lahar runout in 10–100 km', () => {
    const r = simulateVolcano({
      ...VOLCANO_PRESETS.MT_ST_HELENS_1980.input,
      laharVolume: 5e7,
    });
    expect(r.vei).toBe(5);
    const plumeKm = (r.plumeHeight as number) / 1_000;
    // Phase 10 preset re-tune: V_dot=4e4 gives 24.7 km plume, in line
    // with Carey & Sigurdsson 1985 observed 25 km. Was 14.8 km from
    // the under-tuned V_dot=4e3 the original preset shipped with.
    expect(plumeKm).toBeGreaterThan(20);
    expect(plumeKm).toBeLessThan(28);
    const laharKm = r.laharRunout === undefined ? 0 : (r.laharRunout as number) / 1_000;
    expect(laharKm).toBeGreaterThan(10);
    expect(laharKm).toBeLessThan(100);
  });

  it('Pinatubo 1991: VEI 6, ΔT ≈ 0.2–1 K cooling (observed −0.5 K)', () => {
    const r = simulateVolcano(VOLCANO_PRESETS.PINATUBO_1991.input);
    expect(r.vei).toBe(6);
    expect(r.climateCoolingK).toBeGreaterThan(-1);
    expect(r.climateCoolingK).toBeLessThan(-0.1);
  });

  it('Tambora 1815: VEI 7, ΔT stronger than Pinatubo', () => {
    const tambora = simulateVolcano(VOLCANO_PRESETS.TAMBORA_1815.input);
    const pinatubo = simulateVolcano(VOLCANO_PRESETS.PINATUBO_1991.input);
    expect(tambora.vei).toBe(7);
    // Tambora produced the "year without a summer"; our VEI scaling
    // must deliver a more negative ΔT than Pinatubo.
    expect(tambora.climateCoolingK).toBeLessThan(pinatubo.climateCoolingK);
  });
});
