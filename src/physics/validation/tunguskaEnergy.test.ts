import { describe, expect, it } from 'vitest';
import { IMPACT_PRESETS, simulateImpact } from '../simulate.js';
import { TUNGUSKA_ENERGY_OBSERVATION } from './fixtures.js';

/**
 * Tunguska 1908 energy-budget validation.
 *
 * The simulator's Tunguska preset is a 60 m diameter chondritic
 * bolide hitting at 15 km/s and 30°. Its kinetic energy must
 * reproduce the Boslough & Crawford 2008 reconstructed yield window
 * of 10–15 Mt TNT (the upper end of the literature range from
 * tree-fall-pattern modelling). Anything outside that band is a sign
 * that either the preset has drifted or the kinetic-energy formula
 * has been silently changed.
 *
 * This test is the single safeguard against rebuilding the simulator
 * with a different "Tunguska" — a problem the field had genuinely in
 * the 1990s, before the Boslough hydrocode reconstructions settled
 * the energy band.
 */

describe('Impact validation — Tunguska 1908 energy budget', () => {
  it('preset KE lies within the Boslough & Crawford 2008 reconstructed yield window', () => {
    const r = simulateImpact(IMPACT_PRESETS.TUNGUSKA.input);
    const yieldMt = r.impactor.kineticEnergyMegatons as number;
    expect(yieldMt).toBeGreaterThan(TUNGUSKA_ENERGY_OBSERVATION.yieldMtLow);
    expect(yieldMt).toBeLessThan(TUNGUSKA_ENERGY_OBSERVATION.yieldMtHigh);
  });
});
