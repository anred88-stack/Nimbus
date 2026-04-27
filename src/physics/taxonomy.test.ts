import { describe, expect, it } from 'vitest';
import { ASTEROID_TAXONOMY, type AsteroidTaxonomyClass } from './constants.js';

describe('ASTEROID_TAXONOMY (Britt & Consolmagno 2003)', () => {
  it('spans the full spectrum from cometary to iron in density', () => {
    expect(ASTEROID_TAXONOMY.COMETARY.density).toBeLessThan(1_000);
    expect(ASTEROID_TAXONOMY.IRON.density).toBeGreaterThan(7_000);
  });

  it('assigns monotonically increasing strength from cometary to iron', () => {
    const ordered: AsteroidTaxonomyClass[] = ['COMETARY', 'C_TYPE', 'S_TYPE', 'M_TYPE', 'IRON'];
    for (let i = 1; i < ordered.length; i += 1) {
      const prev = ASTEROID_TAXONOMY[ordered[i - 1]!];
      const cur = ASTEROID_TAXONOMY[ordered[i]!];
      expect(cur.strength).toBeGreaterThanOrEqual(prev.strength);
    }
  });

  it('C-type density matches Britt & Consolmagno 2003 Table 2 (~2 000 kg/m³)', () => {
    expect(ASTEROID_TAXONOMY.C_TYPE.density).toBeGreaterThan(1_500);
    expect(ASTEROID_TAXONOMY.C_TYPE.density).toBeLessThan(2_500);
  });

  it('S-type density matches Britt & Consolmagno 2003 Table 2 (~3 300 kg/m³)', () => {
    expect(ASTEROID_TAXONOMY.S_TYPE.density).toBeGreaterThan(3_000);
    expect(ASTEROID_TAXONOMY.S_TYPE.density).toBeLessThan(3_700);
  });

  it('every class exposes a human-readable label', () => {
    const keys: AsteroidTaxonomyClass[] = ['C_TYPE', 'S_TYPE', 'M_TYPE', 'IRON', 'COMETARY'];
    for (const k of keys) {
      expect(ASTEROID_TAXONOMY[k].label.length).toBeGreaterThan(0);
    }
  });
});
