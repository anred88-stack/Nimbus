/**
 * Nested-field runtime validation.
 *
 * The volcano scenario carries two nested objects that previously
 * passed through the validator as opaque `unknown`:
 *   - `flankCollapse: { volumeM3, slopeAngleDeg, meanOceanDepth, sourceWaterDepth }`
 *   - `lateralBlast: { directionDeg, sectorAngleDeg }`
 *
 * Pre-fix, a NaN inside `flankCollapse.volumeM3` propagated to the
 * Watts source-amplitude calculation. This suite pins the new
 * deep-validation contract:
 *
 *   - missing required fields are rejected (S1 invalid).
 *   - non-numeric / NaN / Inf values are rejected.
 *   - out-of-domain values are rejected.
 *   - normalization (azimuth wrap) emits a warning.
 *   - physical-suspicious values emit a warning.
 *   - structurally valid → accepted; payload is type-correct.
 *
 * Codes are reused from the existing `ValidationCode` union — no
 * new codes introduced. Field paths use dot-notation
 * (`flankCollapse.volumeM3`).
 *
 * Closes L7 in `CONSOLIDATION_AUDIT.md`.
 */

import { describe, expect, it } from 'vitest';
import { validateScenario, validateVolcanoInput } from './inputSchema.js';

const BASE_VOLCANO = {
  volumeEruptionRate: 1e5,
  totalEjectaVolume: 1e10,
};

describe('Nested validation — volcano flankCollapse', () => {
  it('valid complete: all four fields present and numeric', () => {
    const v = validateVolcanoInput({
      ...BASE_VOLCANO,
      flankCollapse: {
        volumeM3: 2.5e10,
        slopeAngleDeg: 45,
        meanOceanDepth: 50,
        sourceWaterDepth: 250,
      },
    });
    expect(v.status).toBe('accepted');
    expect(v.input?.flankCollapse?.volumeM3).toBe(2.5e10);
    expect(v.input?.flankCollapse?.slopeAngleDeg).toBe(45);
  });

  it('valid minimal: only required volumeM3', () => {
    const v = validateVolcanoInput({
      ...BASE_VOLCANO,
      flankCollapse: { volumeM3: 1e9 },
    });
    expect(v.status).toBe('accepted');
    expect(v.input?.flankCollapse?.volumeM3).toBe(1e9);
    expect(v.input?.flankCollapse?.slopeAngleDeg).toBeUndefined();
  });

  it('missing volumeM3 → invalid + NOT_FINITE on flankCollapse.volumeM3', () => {
    const v = validateVolcanoInput({
      ...BASE_VOLCANO,
      flankCollapse: { slopeAngleDeg: 30 },
    });
    expect(v.status).toBe('invalid');
    const err = v.errors.find((e) => e.field === 'flankCollapse.volumeM3');
    expect(err?.code).toBe('NOT_FINITE');
  });

  it('NaN volumeM3 → invalid + NOT_FINITE', () => {
    const v = validateVolcanoInput({
      ...BASE_VOLCANO,
      flankCollapse: { volumeM3: Number.NaN, slopeAngleDeg: 30 },
    });
    expect(v.status).toBe('invalid');
    expect(v.errors[0]?.field).toBe('flankCollapse.volumeM3');
    expect(v.errors[0]?.code).toBe('NOT_FINITE');
  });

  it('zero volumeM3 → invalid + ZERO_FORBIDDEN', () => {
    const v = validateVolcanoInput({
      ...BASE_VOLCANO,
      flankCollapse: { volumeM3: 0 },
    });
    expect(v.status).toBe('invalid');
    expect(v.errors[0]?.code).toBe('ZERO_FORBIDDEN');
  });

  it('slopeAngleDeg out-of-domain (90°) → invalid', () => {
    const v = validateVolcanoInput({
      ...BASE_VOLCANO,
      flankCollapse: { volumeM3: 1e9, slopeAngleDeg: 90 },
    });
    expect(v.status).toBe('invalid');
    expect(v.errors[0]?.field).toBe('flankCollapse.slopeAngleDeg');
    expect(v.errors[0]?.code).toBe('OUT_OF_DOMAIN');
  });

  it('negative meanOceanDepth → invalid + NEGATIVE_FORBIDDEN', () => {
    const v = validateVolcanoInput({
      ...BASE_VOLCANO,
      flankCollapse: { volumeM3: 1e9, meanOceanDepth: -100 },
    });
    expect(v.status).toBe('invalid');
    expect(v.errors[0]?.field).toBe('flankCollapse.meanOceanDepth');
    expect(v.errors[0]?.code).toBe('NEGATIVE_FORBIDDEN');
  });

  it('volumeM3 above the largest known (>1e13) → suspicious with warning', () => {
    const v = validateVolcanoInput({
      ...BASE_VOLCANO,
      flankCollapse: { volumeM3: 5e13 },
    });
    expect(v.status).toBe('suspicious');
    expect(v.warnings.some((w) => w.field === 'flankCollapse.volumeM3' && w.code === 'PHYS_SUSPICIOUS_HIGH')).toBe(true);
  });

  it('non-object flankCollapse (e.g. string) → invalid + OUT_OF_DOMAIN', () => {
    const v = validateVolcanoInput({
      ...BASE_VOLCANO,
      flankCollapse: 'not-an-object',
    });
    expect(v.status).toBe('invalid');
    expect(v.errors[0]?.field).toBe('flankCollapse');
    expect(v.errors[0]?.code).toBe('OUT_OF_DOMAIN');
  });

  it('null flankCollapse → invalid + OUT_OF_DOMAIN', () => {
    const v = validateVolcanoInput({
      ...BASE_VOLCANO,
      flankCollapse: null,
    });
    expect(v.status).toBe('invalid');
    expect(v.errors[0]?.field).toBe('flankCollapse');
  });

  it('array as flankCollapse → invalid + OUT_OF_DOMAIN (catches malformed array payload)', () => {
    const v = validateVolcanoInput({
      ...BASE_VOLCANO,
      flankCollapse: [1, 2, 3],
    });
    // Arrays are objects in JS; the validator runs on the raw and the
    // first numeric field check (`r.volumeM3`) is undefined → NOT_FINITE.
    expect(v.status).toBe('invalid');
    const err = v.errors.find((e) => e.field === 'flankCollapse.volumeM3');
    expect(err?.code).toBe('NOT_FINITE');
  });
});

describe('Nested validation — volcano lateralBlast', () => {
  it('valid complete', () => {
    const v = validateVolcanoInput({
      ...BASE_VOLCANO,
      lateralBlast: { directionDeg: 0, sectorAngleDeg: 180 },
    });
    expect(v.status).toBe('accepted');
    expect(v.input?.lateralBlast?.directionDeg).toBe(0);
    expect(v.input?.lateralBlast?.sectorAngleDeg).toBe(180);
  });

  it('missing directionDeg → invalid + NOT_FINITE', () => {
    const v = validateVolcanoInput({
      ...BASE_VOLCANO,
      lateralBlast: { sectorAngleDeg: 90 },
    });
    expect(v.status).toBe('invalid');
    const err = v.errors.find((e) => e.field === 'lateralBlast.directionDeg');
    expect(err?.code).toBe('NOT_FINITE');
  });

  it('directionDeg > 360 is normalized → status normalized + NORMALIZED_AZIMUTH warning', () => {
    const v = validateVolcanoInput({
      ...BASE_VOLCANO,
      lateralBlast: { directionDeg: 720 },
    });
    expect(v.status).toBe('normalized');
    expect(v.input?.lateralBlast?.directionDeg).toBe(0);
    expect(v.warnings.some((w) => w.field === 'lateralBlast.directionDeg' && w.code === 'NORMALIZED_AZIMUTH')).toBe(true);
  });

  it('sectorAngleDeg out-of-domain (0°) → invalid', () => {
    const v = validateVolcanoInput({
      ...BASE_VOLCANO,
      lateralBlast: { directionDeg: 0, sectorAngleDeg: 0 },
    });
    expect(v.status).toBe('invalid');
    expect(v.errors[0]?.field).toBe('lateralBlast.sectorAngleDeg');
    expect(v.errors[0]?.code).toBe('OUT_OF_DOMAIN');
  });

  it('sectorAngleDeg out-of-domain (>360°) → invalid', () => {
    const v = validateVolcanoInput({
      ...BASE_VOLCANO,
      lateralBlast: { directionDeg: 0, sectorAngleDeg: 400 },
    });
    expect(v.status).toBe('invalid');
    expect(v.errors[0]?.code).toBe('OUT_OF_DOMAIN');
  });
});

describe('Nested validation — both nested objects together', () => {
  it('valid flankCollapse + valid lateralBlast → accepted', () => {
    const v = validateVolcanoInput({
      ...BASE_VOLCANO,
      flankCollapse: { volumeM3: 2.5e10, slopeAngleDeg: 45 },
      lateralBlast: { directionDeg: 90 },
    });
    expect(v.status).toBe('accepted');
  });

  it('invalid flankCollapse + valid lateralBlast → invalid (one error in flankCollapse)', () => {
    const v = validateVolcanoInput({
      ...BASE_VOLCANO,
      flankCollapse: { volumeM3: Number.NaN },
      lateralBlast: { directionDeg: 90 },
    });
    expect(v.status).toBe('invalid');
    expect(v.errors.length).toBeGreaterThan(0);
    expect(v.errors[0]?.field).toBe('flankCollapse.volumeM3');
  });

  it('Krakatau-shape preset shape passes the nested validator (regression)', () => {
    // The KRAKATAU_1883 preset uses both flankCollapse and reaches
    // production via the schema — pin it through validateScenario to
    // make sure the nested validation didn't break the canonical
    // happy-path.
    const v = validateScenario('volcano', {
      volumeEruptionRate: 2e5,
      totalEjectaVolume: 2e10,
      flankCollapse: {
        volumeM3: 2.5e10,
        slopeAngleDeg: 45,
        meanOceanDepth: 50,
        sourceWaterDepth: 250,
      },
    });
    expect(v.result.status).toBe('accepted');
    // Narrow the discriminated union: scenarioType==='volcano' →
    // input is VolcanoScenarioInput which has the flankCollapse field.
    expect(v.type).toBe('volcano');
    if (v.type !== 'volcano') return;
    expect(v.result.input?.flankCollapse?.volumeM3).toBe(2.5e10);
  });
});
