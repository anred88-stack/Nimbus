import { describe, expect, it } from 'vitest';
import { J } from '../units.js';
import {
  CHICXULUB_ACID_RAIN_MASS,
  CHICXULUB_REFERENCE_ENERGY,
  CHICXULUB_STRATOSPHERIC_DUST,
  climateTier,
  shockAcidRainMass,
  stratosphericDustMass,
} from './atmosphere.js';

describe('atmosphere — Toon 1997 / Prinn & Fegley 1987 scaling', () => {
  describe('stratosphericDustMass', () => {
    it('reproduces the Chicxulub benchmark', () => {
      const m = stratosphericDustMass(CHICXULUB_REFERENCE_ENERGY) as number;
      expect(m).toBeCloseTo(CHICXULUB_STRATOSPHERIC_DUST, -10);
    });

    it('scales linearly with kinetic energy', () => {
      const ref = CHICXULUB_REFERENCE_ENERGY as number;
      const dustRef = stratosphericDustMass(CHICXULUB_REFERENCE_ENERGY) as number;
      const dust10x = stratosphericDustMass(J(10 * ref)) as number;
      expect(dust10x / dustRef).toBeCloseTo(10, 5);
    });

    it('returns zero for non-positive input', () => {
      expect(stratosphericDustMass(J(0))).toBe(0);
      expect(stratosphericDustMass(J(-5))).toBe(0);
    });
  });

  describe('shockAcidRainMass', () => {
    it('reproduces the Chicxulub benchmark', () => {
      const m = shockAcidRainMass(CHICXULUB_REFERENCE_ENERGY) as number;
      expect(m).toBeCloseTo(CHICXULUB_ACID_RAIN_MASS, -10);
    });

    it('scales linearly with kinetic energy', () => {
      const ref = CHICXULUB_REFERENCE_ENERGY as number;
      const small = shockAcidRainMass(J(ref / 100)) as number;
      const refMass = shockAcidRainMass(CHICXULUB_REFERENCE_ENERGY) as number;
      expect(refMass / small).toBeCloseTo(100, 3);
    });
  });

  describe('climateTier', () => {
    it('places Tunguska (~2 × 10¹⁶ J) in LOCAL/REGIONAL depending on exact energy', () => {
      expect(climateTier(J(2e16))).toBe('LOCAL');
      expect(climateTier(J(5e18))).toBe('REGIONAL');
    });

    it('places 1 Gt TNT (4 × 10¹⁸ J) in REGIONAL', () => {
      expect(climateTier(J(4.184e18))).toBe('REGIONAL');
    });

    it('places Chicxulub (4 × 10²³ J) in GLOBAL', () => {
      expect(climateTier(CHICXULUB_REFERENCE_ENERGY)).toBe('GLOBAL');
    });

    it('flags an extinction-class event above 10²⁴ J', () => {
      expect(climateTier(J(2e24))).toBe('EXTINCTION');
    });

    it('returns LOCAL for zero / non-finite input', () => {
      expect(climateTier(J(0))).toBe('LOCAL');
      expect(climateTier(J(Number.NaN))).toBe('LOCAL');
    });
  });
});
