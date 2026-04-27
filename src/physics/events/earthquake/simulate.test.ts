import { describe, expect, it } from 'vitest';
import { m } from '../../units.js';
import { EARTHQUAKE_PRESETS, simulateEarthquake } from './simulate.js';

describe('simulateEarthquake', () => {
  it('Northridge 1994 Mw 6.7 → ~20 km reverse rupture, MMI VIII epicentre', () => {
    const r = simulateEarthquake(EARTHQUAKE_PRESETS.NORTHRIDGE_1994.input);
    // Wells–Coppersmith reverse at Mw 6.7 ≈ 23 km (test bracket matches
    // the existing ruptureLength tests).
    expect(r.ruptureLength as number).toBeGreaterThan(15_000);
    expect(r.ruptureLength as number).toBeLessThan(30_000);
    expect(r.shaking.mmiAtEpicenter).toBeGreaterThan(7);
    expect(r.shaking.mmiAtEpicenter).toBeLessThan(10);
    // Strong-shaking ring reaches 20+ km for a Mw 6.7 event.
    expect(r.shaking.mmi7Radius as number).toBeGreaterThan(15_000);
  });

  it('Tōhoku 2011 Mw 9.1 → M₀ ≈ 5 × 10²² N·m, MMI IX ring exists', () => {
    const r = simulateEarthquake(EARTHQUAKE_PRESETS.TOHOKU_2011.input);
    // Hanks–Kanamori moment for Mw 9.1 ≈ 5.6 × 10²² N·m.
    expect(r.seismicMoment as number).toBeGreaterThan(4e22);
    expect(r.seismicMoment as number).toBeLessThan(8e22);
    // Joyner–Boore was calibrated on crustal events with Mw ≤ 7.7, so
    // Tōhoku-scale rings under-shoot the subduction-zone reality
    // (observed MMI IX+ ran hundreds of km). The test checks only that
    // the contour exists at all — swapping to ASK14 with a subduction
    // term is tracked as a future upgrade.
    expect(r.shaking.mmi9Radius as number).toBeGreaterThan(10_000);
  });

  it('defaults faultType to "all" when omitted', () => {
    const r = simulateEarthquake({ magnitude: 7 });
    const rExplicit = simulateEarthquake({ magnitude: 7, faultType: 'all' });
    expect(r.ruptureLength).toBe(rExplicit.ruptureLength);
  });

  it('preserves inputs in the result blob', () => {
    const r = simulateEarthquake(EARTHQUAKE_PRESETS.NORTHRIDGE_1994.input);
    expect(r.inputs).toBe(EARTHQUAKE_PRESETS.NORTHRIDGE_1994.input);
  });

  it('weak earthquakes do not yield an MMI IX ring (zero radius)', () => {
    const r = simulateEarthquake({ magnitude: 4.0 });
    expect(r.shaking.mmi9Radius as number).toBe(0);
  });

  it('flags continental scenarios as non-submarine and emits no auto-tsunami', () => {
    const r = simulateEarthquake(EARTHQUAKE_PRESETS.NORTHRIDGE_1994.input);
    expect(r.isSubmarine).toBe(false);
    expect(r.submarineDepth as number).toBe(0);
    expect(r.tsunami).toBeUndefined();
  });

  it('submarine epicentre with shallow-thrust Mw ≥ 6.5 auto-triggers a tsunami', () => {
    // Mw 7.5 reverse fault under 3 000 m of water — the shallow
    // thrust component lifts the seafloor enough to seed a basin-
    // crossing wave, even without the explicit subductionInterface
    // megathrust label.
    const r = simulateEarthquake({
      magnitude: 7.5,
      faultType: 'reverse',
      waterDepth: m(3_000),
    });
    expect(r.isSubmarine).toBe(true);
    expect(r.submarineDepth as number).toBe(3_000);
    expect(r.tsunami).toBeDefined();
    expect((r.tsunami?.initialAmplitude as number | undefined) ?? 0).toBeGreaterThan(0);
  });

  it('submarine strike-slip earthquakes do not auto-trigger a tsunami', () => {
    // Strike-slip displaces the seafloor laterally; the dip-slip
    // uplift component is small. Bryant 2014 §3.4 — we conservatively
    // skip the auto-trigger for this fault style.
    const r = simulateEarthquake({
      magnitude: 7.5,
      faultType: 'strike-slip',
      waterDepth: m(3_000),
    });
    expect(r.isSubmarine).toBe(true);
    expect(r.tsunami).toBeUndefined();
  });

  it('submarine trigger respects the Mw ≥ 6.5 threshold', () => {
    const small = simulateEarthquake({
      magnitude: 6.0,
      faultType: 'reverse',
      waterDepth: m(2_000),
    });
    expect(small.isSubmarine).toBe(true);
    expect(small.tsunami).toBeUndefined();
  });

  it('explicit subductionInterface flag still wins regardless of waterDepth', () => {
    const r = simulateEarthquake({
      ...EARTHQUAKE_PRESETS.TOHOKU_2011.input,
      waterDepth: m(7_000), // a Japan Trench depth
    });
    expect(r.isSubmarine).toBe(true);
    expect(r.submarineDepth as number).toBe(7_000);
    expect(r.tsunami).toBeDefined();
  });

  it('every EARTHQUAKE_PRESETS entry simulates without throwing and produces a positive seismic moment', () => {
    // Smoke test: catches typos in the new presets (Valdivia, Alaska,
    // L'Aquila, Amatrice, Nepal). M0 = 10^(1.5·Mw + 9.1), so for any
    // Mw > 0 the moment is strictly positive.
    for (const [id, preset] of Object.entries(EARTHQUAKE_PRESETS)) {
      const r = simulateEarthquake(preset.input);
      expect(r.seismicMoment as number, `${id}: M0 positive`).toBeGreaterThan(0);
      expect(r.ruptureLength as number, `${id}: rupture > 0`).toBeGreaterThan(0);
    }
  });
});
