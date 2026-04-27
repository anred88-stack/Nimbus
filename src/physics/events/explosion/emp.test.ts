import { describe, expect, it } from 'vitest';
import { electromagneticPulse } from './emp.js';

describe('electromagneticPulse (Glasstone §11 / IEC 61000-2-9)', () => {
  it('surface burst of any yield gives negligible EMP at ground', () => {
    const r = electromagneticPulse(1, 0);
    expect(r.regime).toBe('NEGLIGIBLE');
    expect(r.peakField).toBe(0);
  });

  it('low airburst (5 km) is source-region regime with local field', () => {
    const r = electromagneticPulse(0.02, 5_000);
    expect(r.regime).toBe('SOURCE_REGION');
    expect(r.peakField).toBeGreaterThan(0);
    expect(r.peakField).toBeLessThan(HEMP_PEAK);
  });

  it('high-altitude burst (300 km) is canonical HEMP with 50 kV/m peak', () => {
    const r = electromagneticPulse(1, 300_000);
    expect(r.regime).toBe('HEMP_HIGH_ALTITUDE');
    expect(r.peakField).toBe(HEMP_PEAK);
  });

  it('HEMP footprint at 400 km altitude covers a continent (~2 300 km radius)', () => {
    const r = electromagneticPulse(1, 400_000);
    expect(r.affectedRadius as number).toBeGreaterThan(2_000_000);
    expect(r.affectedRadius as number).toBeLessThan(3_000_000);
  });

  it('zero yield produces a NEGLIGIBLE result', () => {
    const r = electromagneticPulse(0, 300_000);
    expect(r.regime).toBe('NEGLIGIBLE');
  });
});

const HEMP_PEAK = 50_000;
