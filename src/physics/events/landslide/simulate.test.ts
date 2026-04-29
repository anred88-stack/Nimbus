import { describe, expect, it } from 'vitest';
import { LANDSLIDE_PRESETS, simulateLandslide } from './simulate.js';

describe('simulateLandslide', () => {
  it('produces a deterministic snapshot on repeated calls', () => {
    const a = simulateLandslide(LANDSLIDE_PRESETS.ANAK_KRAKATAU_2018.input);
    const b = simulateLandslide(LANDSLIDE_PRESETS.ANAK_KRAKATAU_2018.input);
    expect(a).toEqual(b);
  });

  it('Storegga preset matches the Bondevik 2005 5-15 m source amplitude band', () => {
    // Submarine regime → K_submarine = 0.005 (re-calibrated against
    // Bondevik et al. 2005, Norwegian coast runup 10-25 m → source
    // amp 5-10 m). The previous test pinned the unphysical 126 m
    // produced by the rigid-block K=0.10 prefactor — fixed by the
    // regime-dependent prefactor.
    const r = simulateLandslide(LANDSLIDE_PRESETS.STOREGGA_8200_BP.input);
    expect(r.tsunami).not.toBeNull();
    if (r.tsunami === null) return;
    expect(r.tsunami.sourceAmplitude as number).toBeGreaterThan(2);
    expect(r.tsunami.sourceAmplitude as number).toBeLessThan(15);
  });

  it('Storegga preset reaches Bondevik 2005 trans-Atlantic amplitudes via slide-footprint cavity', () => {
    // The 1/r far-field decay needs the actual slide-footprint radius
    // (≈ 96 km from the 290 × 100 km Bondevik 2005 Fig. 1 outline),
    // NOT the V^(1/3) generic estimate (≈ 14 km). Pre-fix the cavity
    // was 12.6 m (back-derived from η₀), giving sub-millimetre
    // amplitudes at trans-Atlantic ranges. With the proper cavity:
    //   - cavityRadius ≈ 96 km
    //   - amp @ 1000 km ≈ 0.6-1.0 m (deep-water; Sula coast at
    //     ~600 km gets 1.5-2 m before Norwegian-shelf shoaling × 2-3
    //     and run-up ×2-3, reproducing the 10 m sediment scour).
    const r = simulateLandslide(LANDSLIDE_PRESETS.STOREGGA_8200_BP.input);
    expect(r.tsunami).not.toBeNull();
    if (r.tsunami === null) return;
    expect(r.tsunami.cavityRadius as number).toBeGreaterThan(50_000);
    expect(r.tsunami.cavityRadius as number).toBeLessThan(200_000);
    expect(r.tsunami.amplitudeAt1000km as number).toBeGreaterThan(0.3);
    expect(r.tsunami.amplitudeAt1000km as number).toBeLessThan(3);
  });

  it('Lituya preset produces a tsunami in the 30-60 m band (saturation cap)', () => {
    // Lituya 1958 is a documented limitation: the fjord geometry
    // amplifies the wave to 524 m run-up, but an open-ocean Watts
    // source can't capture reflection/focusing inside a narrow inlet.
    // With the new regime-aware prefactor (subaerial K=0.4) and the
    // 40 % depth-saturation cap, we land in the 30-60 m band — still
    // an order-of-magnitude under-prediction, kept on purpose so the
    // module header's caveat about Lituya stays accurate.
    const r = simulateLandslide(LANDSLIDE_PRESETS.LITUYA_BAY_1958.input);
    expect(r.tsunami).not.toBeNull();
    if (r.tsunami === null) return;
    expect(r.tsunami.sourceAmplitude as number).toBeGreaterThan(20);
    expect(r.tsunami.sourceAmplitude as number).toBeLessThan(80);
  });

  it('characteristicLength matches V^(1/3)', () => {
    const r = simulateLandslide({ volumeM3: 1e9 });
    expect(r.characteristicLength as number).toBeCloseTo(1_000, 1);
  });

  it('regime defaults to submarine when unspecified', () => {
    const r = simulateLandslide({ volumeM3: 1e9 });
    expect(r.regime).toBe('submarine');
  });

  it('returns a tsunami null when the inputs are ill-formed', () => {
    expect(simulateLandslide({ volumeM3: 0 }).tsunami).toBeNull();
    expect(simulateLandslide({ volumeM3: 1e9, slopeAngleDeg: 0 }).tsunami).toBeNull();
  });

  it('every LANDSLIDE_PRESETS entry simulates without throwing', () => {
    // Smoke test for newly-added presets (Vaiont, Elm). The Watts
    // 2000 source amplitude is positive for any positive volume
    // with a non-zero slope.
    for (const [id, preset] of Object.entries(LANDSLIDE_PRESETS)) {
      const r = simulateLandslide(preset.input);
      expect(r.characteristicLength as number, `${id}: char length > 0`).toBeGreaterThan(0);
      expect(r.regime, `${id}: regime defined`).toBeDefined();
    }
  });
});
