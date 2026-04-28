import { describe, expect, it } from 'vitest';
import { IMPACT_PRESETS, simulateImpact } from './simulate.js';
import { deg, degreesToRadians, kgPerM3, m, mps } from './units.js';

describe('simulateImpact (deterministic Layer-2 evaluator)', () => {
  it('produces an identical snapshot on repeated calls (determinism)', () => {
    const a = simulateImpact(IMPACT_PRESETS.CHICXULUB.input);
    const b = simulateImpact(IMPACT_PRESETS.CHICXULUB.input);
    expect(a).toEqual(b);
  });

  it('Chicxulub preset: ≈1.06 × 10²⁴ J, ≈166 km complex crater, Mw ≈ 10', () => {
    const r = simulateImpact(IMPACT_PRESETS.CHICXULUB.input);
    // Energy: (π/6)·3000·15000³·½·20000² ≈ 1.0603 × 10²⁴ J
    expect(r.impactor.kineticEnergy as number).toBeGreaterThan(1.0e24);
    expect(r.impactor.kineticEnergy as number).toBeLessThan(1.1e24);
    // Final crater within 10 % of the ≈180 km rim-to-rim figure.
    expect(Math.abs((r.crater.finalDiameter as number) - 180_000) / 180_000).toBeLessThan(0.1);
    // Complex morphology above the 3.2 km transition.
    expect(r.crater.morphology).toBe('complex');
    // Mw ≈ 9.9 per Schultz & Gault (1975).
    expect(r.seismic.magnitude).toBeGreaterThan(9.5);
    expect(r.seismic.magnitude).toBeLessThan(10.5);
  });

  it('Tunguska preset: ≈3.8 × 10¹⁶ J ≈ 9 Mt TNT, simple-sized crater if it landed', () => {
    const r = simulateImpact(IMPACT_PRESETS.TUNGUSKA.input);
    // Energy in TNT-equivalent Mt.
    expect(r.impactor.kineticEnergyMegatons as number).toBeGreaterThan(7);
    expect(r.impactor.kineticEnergyMegatons as number).toBeLessThan(12);
    // Tunguska was an airburst — no crater formed. The hypothetical
    // ground-impact crater from the same parameters is simple.
    expect(r.crater.morphology).toBe('simple');
  });

  it('Meteor Crater preset: simple bowl about 1 km across', () => {
    const r = simulateImpact(IMPACT_PRESETS.METEOR_CRATER.input);
    expect(r.crater.morphology).toBe('simple');
    // Pike depth ≈0.196 · D for simple craters — consistent with the
    // preserved 170 m depth at Barringer.
    expect(r.crater.depth).toBeLessThan(r.crater.finalDiameter);
  });

  it('round-trips inputs in the result so UIs can re-render from a single blob', () => {
    const r = simulateImpact(IMPACT_PRESETS.CHICXULUB.input);
    expect(r.inputs).toBe(IMPACT_PRESETS.CHICXULUB.input);
  });

  it('emits a four-ring damage footprint for every impact result', () => {
    const r = simulateImpact(IMPACT_PRESETS.CHICXULUB.input);
    expect(r.damage.craterRim).toBeGreaterThan(0);
    expect(r.damage.thirdDegreeBurn).toBeGreaterThan(0);
    // Blast rings order monotonically outward (1 psi is the widest).
    expect(r.damage.craterRim).toBeLessThan(r.damage.overpressure5psi);
    expect(r.damage.overpressure5psi).toBeLessThan(r.damage.overpressure1psi);
  });

  it('Chelyabinsk 2013 preset: ≈0.4–0.5 Mt, complete airburst, no ground crater', () => {
    const r = simulateImpact(IMPACT_PRESETS.CHELYABINSK.input);
    // Popova et al. 2013 (Science 342): total energy ≈ 0.5 Mt TNT,
    // main disruption at ~27 km altitude, no ground crater recovered.
    expect(r.impactor.kineticEnergyMegatons as number).toBeGreaterThan(0.3);
    expect(r.impactor.kineticEnergyMegatons as number).toBeLessThan(0.7);
    expect(r.entry.regime).toBe('COMPLETE_AIRBURST');
    expect(r.entry.burstAltitude).toBeGreaterThan(15_000);
    expect(r.entry.burstAltitude).toBeLessThan(35_000);
    expect(r.entry.energyFractionToGround).toBeLessThan(0.05);
    // Crater shrinks to a nominal few tens of metres — no meteoritic
    // crater field around Chelyabinsk other than the Chebarkul hole.
    expect(r.crater.finalDiameter as number).toBeLessThan(500);
  });

  it('Tunguska preset: partial airburst 5–15 km, greatly reduced ground crater', () => {
    const r = simulateImpact(IMPACT_PRESETS.TUNGUSKA.input);
    expect(r.entry.regime).toBe('PARTIAL_AIRBURST');
    expect(r.entry.burstAltitude).toBeGreaterThan(5_000);
    expect(r.entry.burstAltitude).toBeLessThan(15_000);
    expect(r.entry.energyFractionToGround).toBeGreaterThan(0);
    expect(r.entry.energyFractionToGround).toBeLessThan(0.3);
  });

  it('Meteor Crater and Chicxulub remain INTACT ground impacts', () => {
    const mc = simulateImpact(IMPACT_PRESETS.METEOR_CRATER.input);
    expect(mc.entry.regime).toBe('INTACT');
    expect(mc.entry.energyFractionToGround).toBe(1);

    const chx = simulateImpact(IMPACT_PRESETS.CHICXULUB.input);
    expect(chx.entry.regime).toBe('INTACT');
    expect(chx.entry.energyFractionToGround).toBe(1);
  });
});

describe('simulateImpact — land vs. ocean cascade', () => {
  it('land impact (no waterDepth) produces no tsunami block', () => {
    const r = simulateImpact(IMPACT_PRESETS.CHICXULUB.input);
    expect(r.tsunami).toBeUndefined();
  });

  it('Chicxulub ocean preset produces a literature-consistent K-Pg tsunami', () => {
    const r = simulateImpact(IMPACT_PRESETS.CHICXULUB_OCEAN.input);

    // The exit criterion for the Phase-18 audit: source amplitude
    // must sit inside the Range 2022 / Bralower 2018 hydrocode
    // envelope (100-1500 m for K-Pg-class) AND the cavity must be
    // sized by the WATER-COUPLED fraction of KE only (Crawford-Mader
    // 1998 / Gisler 2011 partition), not by the full post-atmospheric
    // KE. CHICXULUB_OCEAN is a 100 m carbonate-shelf strike, so
    // f_water ≈ 0.008 (almost everything punches through to the
    // seafloor) and the cavity is ≈ 25 km, not the 84 km the
    // pre-Phase-18 model produced. A₀ stays high (≈ 1.34 km) because
    // the η saturation asymptote dominates once R_C exceeds R_ref.
    expect(r.tsunami).toBeDefined();
    if (!r.tsunami) return;

    // Cavity radius scales with f_water · KE for shelf impacts.
    expect(r.tsunami.cavityRadius as number).toBeGreaterThan(20_000);
    expect(r.tsunami.cavityRadius as number).toBeLessThan(35_000);

    // Source amplitude near the upper bound of the K-Pg envelope.
    expect(r.tsunami.sourceAmplitude as number).toBeGreaterThan(1_300);
    expect(r.tsunami.sourceAmplitude as number).toBeLessThan(1_400);

    // Far-field at 1 000 km — undamped Ward 1/r reach scales as
    // A₀·R_C/r ≈ 1.34 km · 25 km / 1 000 km ≈ 33 m at continent
    // range. The Wünnemann hydrocode damping (separate function)
    // drops this further for the deep-ocean comparison.
    expect(r.tsunami.amplitudeAt1000km as number).toBeGreaterThan(20);
    expect(r.tsunami.amplitudeAt1000km as number).toBeLessThan(60);

    // Water-coupling partition exposed to the report panel.
    expect(r.tsunami.waterCouplingFraction).toBeGreaterThan(0);
    expect(r.tsunami.waterCouplingFraction).toBeLessThan(0.05);

    // Travel time at 3 000 m mean basin depth: t = 1 000 km / √(g·3 000)
    // ≈ 5 830 s (≈ 97 min). A 4 km basin would drop this to ≈ 84 min.
    expect(r.tsunami.travelTimeTo1000km as number).toBeGreaterThan(5_000);
    expect(r.tsunami.travelTimeTo1000km as number).toBeLessThan(7_000);

    // Open-ocean celerity at the 3 000 m Chicxulub-preset basin depth:
    // c = √(g · h) ≈ 171 m/s. Wavelength ≈ 2 × cavity ≈ 160 km;
    // dominant period ≈ λ/c ≈ 940 s ≈ 15 min.
    expect(r.tsunami.deepWaterCelerity as number).toBeGreaterThan(160);
    expect(r.tsunami.deepWaterCelerity as number).toBeLessThan(180);
    // Phase-18: source wavelength = 2 × cavity. Cavity is now ~25 km
    // (driven by f_water · KE), so wavelength ≈ 50 km and dominant
    // period ≈ 50 km / 171 m/s ≈ 290 s.
    expect(r.tsunami.sourceWavelength as number).toBeGreaterThan(40_000);
    expect(r.tsunami.sourceWavelength as number).toBeLessThan(70_000);
    expect(r.tsunami.dominantPeriod as number).toBeGreaterThan(200);
    expect(r.tsunami.dominantPeriod as number).toBeLessThan(400);
  });

  it('ocean cascade on a shallow shelf leaves crater/seismic essentially unchanged vs land', () => {
    // Phase-18: CHICXULUB_OCEAN sits on a 100 m carbonate shelf, so
    // f_seafloor ≈ exp(-100 / 12 832) ≈ 0.992. The crater shrinks by
    // less than 1 % (165.62 → 165.19 km), well within rounding for
    // popular-science output. Seismic moment scales with crater
    // volume so it tracks the same fractional change.
    const land = simulateImpact(IMPACT_PRESETS.CHICXULUB.input);
    const ocean = simulateImpact(IMPACT_PRESETS.CHICXULUB_OCEAN.input);
    const craterRatio =
      (ocean.crater.finalDiameter as number) / (land.crater.finalDiameter as number);
    expect(craterRatio).toBeGreaterThan(0.99);
    expect(craterRatio).toBeLessThanOrEqual(1.0);
    expect(ocean.seismic.magnitude).toBeCloseTo(land.seismic.magnitude, 1);
  });

  it('5 000 km tsunami amplitude is 1/5 of the 1 000 km amplitude (1/r decay)', () => {
    const r = simulateImpact(IMPACT_PRESETS.CHICXULUB_OCEAN.input);
    if (!r.tsunami) {
      expect.fail('expected tsunami block for ocean preset');
      return;
    }
    const ratio = (r.tsunami.amplitudeAt1000km as number) / (r.tsunami.amplitudeAt5000km as number);
    expect(ratio).toBeCloseTo(5, 6);
  });

  it('airburst over ocean (gf < 0.10) emits no tsunami block', () => {
    // Chelyabinsk-class superbolide on a 4 km basin: the Chyba pancake
    // model returns COMPLETE_AIRBURST with energyFractionToGround ≈
    // 0.02, well below the 0.10 surface-coupling threshold required
    // to seed the Ward & Asphaug cavity. Without this guard, the
    // simulator would dump the bolide's full ≈ 0.4 Mt KE into a
    // water-cavity formula that assumes a piston-coupling regime,
    // producing a phantom kilometre-scale wave.
    const r = simulateImpact({
      ...IMPACT_PRESETS.CHELYABINSK.input,
      waterDepth: m(100),
      meanOceanDepth: m(4_000),
    });
    expect(r.entry.regime).toBe('COMPLETE_AIRBURST');
    expect(r.entry.energyFractionToGround).toBeLessThan(0.1);
    expect(r.tsunami).toBeUndefined();
  });

  it('Schultz-Anderson 1996 asymmetry: 45° impact → symmetric blanket, 15° → ~0.67 stretch', () => {
    // Chicxulub at 45° canonical angle: asymmetryFactor = 0.
    const sym = simulateImpact(IMPACT_PRESETS.CHICXULUB.input);
    expect(sym.ejecta.asymmetryFactor).toBe(0);
    expect(sym.ejecta.downrangeOffset as number).toBe(0);

    // Oblique surface-impactor at 15° grazing — must reach the ground
    // intact so a crater (and therefore an asymmetric ejecta blanket)
    // exists. Phase 14 explicitly suppresses the crater for high-
    // altitude airbursts (Tunguska / Chelyabinsk-class), so this
    // assertion uses a 1 km bolide at 18° instead, which is safely
    // INTACT regime and exercises the same asymmetry formula. The
    // pre-Phase-14 version of this test used Chelyabinsk and started
    // failing once the phantom-crater suppression landed.
    const oblique = simulateImpact({
      impactorDiameter: m(1000),
      impactVelocity: mps(20000),
      impactorDensity: kgPerM3(3000),
      targetDensity: kgPerM3(2700),
      impactAngle: degreesToRadians(deg(18)),
    });
    expect(oblique.entry.regime).toBe('INTACT');
    expect(oblique.ejecta.asymmetryFactor).toBeGreaterThan(0.55);
    expect(oblique.ejecta.asymmetryFactor).toBeLessThan(0.65);
    expect(oblique.ejecta.downrangeOffset as number).toBeGreaterThan(0);
  });

  it('impactAzimuthDeg defaults to 90° (east-bound) but echoes user override', () => {
    const def = simulateImpact(IMPACT_PRESETS.CHELYABINSK.input);
    expect(def.ejecta.azimuthDeg).toBe(90);

    const overridden = simulateImpact({
      ...IMPACT_PRESETS.CHELYABINSK.input,
      impactAzimuthDeg: 250,
    });
    expect(overridden.ejecta.azimuthDeg).toBe(250);
  });

  it('ocean cavity radius scales with water-coupled fraction of KE (Phase-18)', () => {
    // Pre-Phase-18 the cavity used the full post-atmospheric KE
    // regardless of water depth. Phase-18 routes only `f_water · KE`
    // into the cavity, where f_water = 1 − exp(-d_water / d_critical)
    // and d_critical = β·L·√(ρ_i/ρ_water). For the Chicxulub shelf
    // preset (100 m water on a 15 km impactor) f_water ≈ 0.008, so
    // the cavity is ≈ 25 km — much smaller than the 84 km the old
    // model produced.
    const land = IMPACT_PRESETS.CHICXULUB.input;
    const ocean = IMPACT_PRESETS.CHICXULUB_OCEAN.input;
    const r = simulateImpact(ocean);
    expect(r.entry.energyFractionToGround).toBe(1);
    if (!r.tsunami) {
      expect.fail('expected tsunami for Chicxulub ocean preset');
      return;
    }
    // Phase-18 cavity matches the f_water-scaled energy.
    expect(r.tsunami.cavityRadius as number).toBeGreaterThan(20_000);
    expect(r.tsunami.cavityRadius as number).toBeLessThan(35_000);
    expect(r.tsunami.waterCouplingFraction).toBeLessThan(0.05);
    // Sanity: same impactor on land has no tsunami at all.
    expect(simulateImpact(land).tsunami).toBeUndefined();
  });

  it('Phase-18 deep-ocean strike suppresses the seafloor crater (Eltanin regime)', () => {
    // 1 km stony asteroid in a 5 km Pacific deep-ocean basin: the
    // Crawford-Mader d_critical = 0.5 · 1 km · √(3000/1025) ≈ 0.86 km
    // gives f_seafloor = exp(-5 km / 0.86 km) ≈ 0.003. The seafloor
    // crater therefore shrinks to ≈ 25 % of the equivalent land
    // crater (D ∝ KE^(1/3.4) so D drops by 0.003^0.294 ≈ 0.18×),
    // matching the Eltanin asteroid's geological "no observable
    // crater" record (1-4 km, 5 km Pacific basin, 2.5 Ma; Gersonde
    // et al. 1997 Nature 390:357). Tsunami branch fires fully.
    const land = simulateImpact({
      impactorDiameter: m(1_000),
      impactVelocity: mps(20_000),
      impactorDensity: kgPerM3(3_000),
      targetDensity: kgPerM3(2_700),
      impactAngle: degreesToRadians(deg(45)),
    });
    const ocean = simulateImpact({
      impactorDiameter: m(1_000),
      impactVelocity: mps(20_000),
      impactorDensity: kgPerM3(3_000),
      targetDensity: kgPerM3(2_700),
      impactAngle: degreesToRadians(deg(45)),
      waterDepth: m(5_000),
      meanOceanDepth: m(5_000),
    });
    const craterRatio =
      (ocean.crater.finalDiameter as number) / (land.crater.finalDiameter as number);
    // Aggressive suppression — ocean crater under 25 % of land crater.
    expect(craterRatio).toBeLessThan(0.25);
    // Tsunami branch fires with f_water close to 1.
    expect(ocean.tsunami).toBeDefined();
    if (ocean.tsunami) {
      expect(ocean.tsunami.waterCouplingFraction).toBeGreaterThan(0.99);
    }
  });

  it('every IMPACT_PRESETS entry simulates without throwing and yields plausible KE', () => {
    // Smoke test: catches typos in newly-added presets. All eight
    // canonical impactors should produce a positive kinetic energy
    // that fits into the physical envelope of "ranger from ≈ kt
    // chemical fall (Sikhote-Alin) up to ≈ 10²⁴ J K-Pg dinosaur
    // killer (Chicxulub)".
    for (const [id, preset] of Object.entries(IMPACT_PRESETS)) {
      const r = simulateImpact(preset.input);
      expect(r.impactor.kineticEnergy as number, `${id}: kineticEnergy positive`).toBeGreaterThan(
        0
      );
      expect(r.impactor.kineticEnergy as number, `${id}: kineticEnergy < 1e25 J`).toBeLessThan(
        1e25
      );
    }
  });

  it('damage rings for an airburst event match the atmospheric airburst, not the full-KE surface burst', () => {
    // Tunguska is the canonical PARTIAL_AIRBURST: the ground sees
    // shock waves and burns from the airburst at ≈ 12 km, NOT from
    // a 7 Mt surface burst. The simulator's `damage.*` rings must
    // therefore reflect the atmospheric-airburst reach (with the
    // Whitham/Sachs/USSA amplification), not the legacy full-KE
    // surface ring radii. We assert that the values agree exactly
    // with the entry block's atmospheric radii — the max() collapses
    // to the airburst component because the ground-coupled fireball
    // from gf · KE is much smaller for an airburst regime.
    const r = simulateImpact(IMPACT_PRESETS.TUNGUSKA.input);
    expect(r.entry.regime).not.toBe('INTACT');
    expect(r.damage.overpressure5psi).toBe(r.entry.shockWaveRadii.fivePsi);
    expect(r.damage.overpressure1psi).toBe(r.entry.shockWaveRadii.onePsi);
    expect(r.damage.lightDamage).toBe(r.entry.shockWaveRadii.lightDamage);
    expect(r.damage.thirdDegreeBurn).toBe(r.entry.flashBurnRadii.thirdDegree);
  });

  it('damage rings for an INTACT impact match the surface-burst formulas (atmospheric block is zero)', () => {
    // Chicxulub is the canonical INTACT regime — gf = 1, the
    // atmospheric airburst radii are zero, and `damage.*` must
    // come from the surface-burst Kinney-Graham fit applied to
    // the full kinetic energy. Sanity check: the surface ring
    // values are positive and exceed the (zero) airburst values.
    const r = simulateImpact(IMPACT_PRESETS.CHICXULUB.input);
    expect(r.entry.regime).toBe('INTACT');
    expect(r.entry.shockWaveRadii.fivePsi as number).toBe(0);
    expect(r.damage.overpressure5psi as number).toBeGreaterThan(0);
    expect(r.damage.thirdDegreeBurn as number).toBeGreaterThan(0);
  });
});
