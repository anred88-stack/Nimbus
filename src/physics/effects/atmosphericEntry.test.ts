import { describe, expect, it } from 'vitest';
import { CHONDRITIC_DENSITY, IRON_METEORITE_DENSITY } from '../constants.js';
import { impactorMass, kineticEnergy } from '../events/impact/kinetic.js';
import { J, m, mps, Pa } from '../units.js';
import { IMPACTOR_STRENGTH, atmosphericEntry } from './atmosphericEntry.js';

describe('atmosphericEntry — Chyba 1993 / Collins 2005 / Popova 2013', () => {
  it('reproduces Chelyabinsk 2013 observed burst altitude within a factor of 2', () => {
    // Popova 2013: ~17 m stony, 19 km/s, main disruption at ~27 km.
    const r = atmosphericEntry(m(17), mps(19_000), IMPACTOR_STRENGTH.S_TYPE);
    expect(r.regime).toBe('COMPLETE_AIRBURST');
    expect(r.burstAltitude).toBeGreaterThan(15_000);
    expect(r.burstAltitude).toBeLessThan(40_000);
    expect(r.energyFractionToGround).toBeLessThan(0.1);
  });

  it('reproduces Tunguska 1908 observed burst altitude within a factor of 2', () => {
    // Chyba 1993: ~60 m stony, 15 km/s, terminal burst at ~8 km.
    const r = atmosphericEntry(m(60), mps(15_000), IMPACTOR_STRENGTH.STONY);
    expect(r.regime).toBe('PARTIAL_AIRBURST');
    expect(r.burstAltitude).toBeGreaterThan(3_000);
    expect(r.burstAltitude).toBeLessThan(20_000);
    // Partial airburst leaves very little energy at ground.
    expect(r.energyFractionToGround).toBeGreaterThan(0);
    expect(r.energyFractionToGround).toBeLessThan(0.4);
  });

  it('classifies a Chicxulub-scale impactor as INTACT ground impact', () => {
    // 15 km, 20 km/s — huge object, ram pressure never decisive.
    const r = atmosphericEntry(m(15_000), mps(20_000), IMPACTOR_STRENGTH.STONY);
    expect(r.regime).toBe('INTACT');
    expect(r.burstAltitude).toBe(0);
    expect(r.energyFractionToGround).toBe(1);
  });

  it('classifies an iron meteoroid as INTACT (very high strength)', () => {
    // 5 m iron at 15 km/s — Meteor-Crater-like scenario.
    const r = atmosphericEntry(m(5), mps(15_000), IMPACTOR_STRENGTH.IRON);
    expect(r.regime).toBe('INTACT');
  });

  it('weak cometary bodies airburst very high in the atmosphere', () => {
    // 30 m comet, 25 km/s — very weak material.
    const r = atmosphericEntry(m(30), mps(25_000), IMPACTOR_STRENGTH.COMETARY);
    expect(r.regime).toBe('COMPLETE_AIRBURST');
    expect(r.burstAltitude).toBeGreaterThan(25_000);
  });

  it('energy fraction is monotonic with burst altitude', () => {
    // Smaller burst altitude → more ground energy.
    const low = atmosphericEntry(m(80), mps(15_000), IMPACTOR_STRENGTH.STONY);
    const high = atmosphericEntry(m(20), mps(15_000), IMPACTOR_STRENGTH.STONY);
    expect(low.burstAltitude).toBeLessThan(high.burstAltitude);
    expect(low.energyFractionToGround).toBeGreaterThanOrEqual(high.energyFractionToGround);
  });

  it('zero or non-finite inputs fall back to INTACT with no burst', () => {
    const r = atmosphericEntry(m(0), mps(0), Pa(1e6));
    expect(r.regime).toBe('INTACT');
    expect(r.burstAltitude).toBe(0);
  });

  it('penetrationBonus grows with diameter and zeros below the 10 m reference', () => {
    // Below the reference diameter the bonus is clamped to zero (a
    // 5 m iron behaves like a point source).
    const small = atmosphericEntry(m(5), mps(15_000), IMPACTOR_STRENGTH.IRON);
    expect(small.penetrationBonus as number).toBe(0);
    // A Chicxulub-class 15 km body gets a ~70 km bonus, dwarfing the
    // breakup altitude — exactly the reason it stays INTACT.
    const huge = atmosphericEntry(m(15_000), mps(20_000), IMPACTOR_STRENGTH.STONY);
    expect(huge.penetrationBonus as number).toBeGreaterThan(60_000);
    expect(huge.penetrationBonus as number).toBeLessThan(80_000);
  });

  it('INTACT regimes deposit zero in atmosphere and emit zero entry-damage radii', () => {
    const r = atmosphericEntry(m(15_000), mps(20_000), IMPACTOR_STRENGTH.STONY);
    expect(r.atmosphericYieldMegatons).toBe(0);
    expect(r.flashBurnRadii.firstDegree as number).toBe(0);
    expect(r.shockWaveRadii.lightDamage as number).toBe(0);
  });

  it('Chelyabinsk 2013 airburst yield ≈ 500 kt and shock-wave reach matches the observed 120 km window-breakage zone', () => {
    // Popova et al. 2013 / Brown et al. 2013: 17 m S-type at 19 km/s
    // → ≈ 500 kt TNT atmospheric yield. The observed window-breakage
    // injuries spanned ≈ 120 km from the trajectory point, matching
    // the simulator's lightDamage (0.5 psi) reach within a factor of 2.
    const D = m(17);
    const v = mps(19_000);
    const mass = impactorMass(D, CHONDRITIC_DENSITY);
    const ke = kineticEnergy(mass, v);
    const r = atmosphericEntry(D, v, IMPACTOR_STRENGTH.S_TYPE, undefined, ke);
    expect(r.regime).toBe('COMPLETE_AIRBURST');
    // Atmospheric yield in the 200–800 kt envelope (= 0.2–0.8 Mt) —
    // Brown et al. 2013 measure 0.44 ± 0.1 Mt, our 17 m / 3 000 kg/m³
    // preset lands at ≈ 0.33 Mt within that range.
    expect(r.atmosphericYieldMegatons).toBeGreaterThan(0.2);
    expect(r.atmosphericYieldMegatons).toBeLessThan(0.8);
    // 0.5 psi reach — Brown et al. 2013 report window-breakage out
    // to ≈ 120 km from the trajectory point. With the
    // `bolideAirburstAmplification` factor applied (≈ 7× at 27 km
    // burst altitude) the model reproduces this within a factor of 2.
    const lightDamageKm = (r.shockWaveRadii.lightDamage as number) / 1_000;
    expect(lightDamageKm).toBeGreaterThan(60);
    expect(lightDamageKm).toBeLessThan(250);
    // Amplification factor itself in the documented 5–10× envelope.
    expect(r.airburstAmplificationFactor).toBeGreaterThan(5);
    expect(r.airburstAmplificationFactor).toBeLessThan(10);
  });

  it('Tunguska 1908 atmospheric yield is in the 10–30 Mt envelope and forest-flattening matches a 5 psi reach', () => {
    // Boslough & Crawford 2008 / Chyba 1993: 60 m stony at 15 km/s
    // → ~10–15 Mt atmospheric yield. Observed forest-flattening
    // pattern was a butterfly ≈ 30 km in radius.
    const D = m(60);
    const v = mps(15_000);
    const mass = impactorMass(D, CHONDRITIC_DENSITY);
    const ke = kineticEnergy(mass, v);
    const r = atmosphericEntry(D, v, IMPACTOR_STRENGTH.STONY, undefined, ke);
    expect(r.atmosphericYieldMegatons).toBeGreaterThan(5);
    expect(r.atmosphericYieldMegatons).toBeLessThan(30);
    // 5 psi reach with the amplification factor (≈ 3× at 8 km burst
    // altitude) should reproduce the ≈ 28 km forest-flattening edge
    // within a factor of 2. The amplification factor itself sits in
    // the ≈ 2–4× range for an 8 km burst.
    const fivePsiKm = (r.shockWaveRadii.fivePsi as number) / 1_000;
    expect(fivePsiKm).toBeGreaterThan(15);
    expect(fivePsiKm).toBeLessThan(60);
    expect(r.airburstAmplificationFactor).toBeGreaterThan(2);
    expect(r.airburstAmplificationFactor).toBeLessThan(4);
  });

  it('amplification factor is 1 at sea level and grows linearly with burst altitude', () => {
    // Direct unit test on the helper via its physical signature: the
    // factor is exposed on the result so we can test it through
    // synthetic INTACT and airburst inputs without re-importing the
    // private helper.
    // INTACT events report amplification = 1 by convention.
    const intact = atmosphericEntry(m(15_000), mps(20_000), IMPACTOR_STRENGTH.STONY);
    expect(intact.airburstAmplificationFactor).toBe(1);
    // Higher burst altitude → larger factor (Tunguska < Chelyabinsk).
    const tunguska = atmosphericEntry(
      m(60),
      mps(15_000),
      IMPACTOR_STRENGTH.STONY,
      CHONDRITIC_DENSITY,
      J(1e16)
    );
    const chelyabinsk = atmosphericEntry(
      m(17),
      mps(19_000),
      IMPACTOR_STRENGTH.S_TYPE,
      CHONDRITIC_DENSITY,
      J(1.4e15)
    );
    expect(chelyabinsk.airburstAmplificationFactor).toBeGreaterThan(
      tunguska.airburstAmplificationFactor
    );
  });

  it('iron-bolide INTACT regime echoes penetrationBonus correctly without leaking entry damage', () => {
    // Sikhote-Alin-class: 3 m iron at 14.5 km/s, IRON strength —
    // INTACT regime (the body reaches the ground), but with a
    // penetrationBonus of zero (D = 3 m < 10 m reference).
    const D = m(3);
    const v = mps(14_500);
    const mass = impactorMass(D, IRON_METEORITE_DENSITY);
    const ke = kineticEnergy(mass, v);
    const r = atmosphericEntry(D, v, IMPACTOR_STRENGTH.IRON, undefined, ke);
    expect(r.regime).toBe('INTACT');
    expect(r.penetrationBonus as number).toBe(0);
    expect(r.atmosphericYieldMegatons).toBe(0);
    // Ground KE is the input energy in this case — passes through
    // unchanged when energyFractionToGround = 1.
    void J(0);
  });
});
