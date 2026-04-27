import { describe, expect, it } from 'vitest';
import { LANDSLIDE_PRESETS, simulateLandslide } from './simulate.js';

describe('simulateLandslide', () => {
  it('produces a deterministic snapshot on repeated calls', () => {
    const a = simulateLandslide(LANDSLIDE_PRESETS.ANAK_KRAKATAU_2018.input);
    const b = simulateLandslide(LANDSLIDE_PRESETS.ANAK_KRAKATAU_2018.input);
    expect(a).toEqual(b);
  });

  it('Storegga preset produces a basin-scale tsunami source amplitude', () => {
    // η = 0.10 · (3e12)^(1/3) · sin(5°) ≈ 0.10 · 14422 · 0.087 ≈ 126 m
    // — well above the Anak source of ≈ 22 m, as expected from the
    // V^(1/3) scaling.
    const r = simulateLandslide(LANDSLIDE_PRESETS.STOREGGA_8200_BP.input);
    expect(r.tsunami).not.toBeNull();
    if (r.tsunami === null) return;
    expect(r.tsunami.sourceAmplitude as number).toBeGreaterThan(80);
    expect(r.tsunami.sourceAmplitude as number).toBeLessThan(200);
  });

  it('Lituya preset produces a tsunami orders of magnitude below the observed run-up', () => {
    // Documented under-prediction: the open-ocean Watts source gives
    // a few metres for Lituya, vs the observed 524 m fjord run-up.
    // The test pins the magnitude of the under-prediction so the
    // module header's caveat stays accurate.
    const r = simulateLandslide(LANDSLIDE_PRESETS.LITUYA_BAY_1958.input);
    expect(r.tsunami).not.toBeNull();
    if (r.tsunami === null) return;
    expect(r.tsunami.sourceAmplitude as number).toBeLessThan(50);
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
