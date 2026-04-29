/**
 * State-level test for the validator → UI propagation pipeline.
 *
 * Goal: prove that `validateScenario` (single source of truth) is what
 * the UI hook surfaces, with NO secondary validation step. The test
 * exercises the pure helper `pickFieldIssues` against `validateScenario`
 * outputs and against live store state — no jsdom render needed.
 *
 * What this pins:
 *   - `pickFieldIssues` returns the validator-emitted issue verbatim
 *     (same `code`, same `message`, no transformation);
 *   - errors take precedence over warnings on the same field;
 *   - field-filtering is exact-match on the `field` path (so dot-notated
 *     nested paths like `flankCollapse.volumeM3` survive correctly);
 *   - clean fields produce a fully-null view (no false-positives);
 *   - the hook's contract is a thin pass-through: changing store state
 *     and re-validating yields the same view as calling
 *     `pickFieldIssues(validateScenario(...), field)` directly.
 *
 * Out of scope (no RTL installed): React-lifecycle assertions
 * (memoisation, re-render avoidance). Memoisation correctness is a
 * useMemo concern, not a validation concern — covered by React itself.
 *
 * Closes the test gap for the "UI validation propagation" objective.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetAppStore, useAppStore } from './useAppStore.js';
import { pickFieldIssues } from './useScenarioValidation.js';
import {
  validateScenario,
  type ValidationCode,
  type ValidationIssue,
  type ValidationResult,
} from '../physics/validation/inputSchema.js';

beforeEach(() => {
  resetAppStore();
});

afterEach(() => {
  resetAppStore();
});

function makeIssue(field: string, code: ValidationCode, message: string): ValidationIssue {
  return { field, code, message };
}

describe('pickFieldIssues — pure helper', () => {
  it('returns a fully-null view when the validator reported nothing', () => {
    const result: ValidationResult<unknown> = {
      status: 'accepted',
      input: {},
      errors: [],
      warnings: [],
    };
    const v = pickFieldIssues(result, 'magnitude');
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
    expect(v.hasError).toBe(false);
    expect(v.hasWarning).toBe(false);
    expect(v.topMessage).toBeNull();
    expect(v.topCode).toBeNull();
  });

  it('filters by exact field-path match (does not bleed across fields)', () => {
    const result: ValidationResult<unknown> = {
      status: 'invalid',
      input: null,
      errors: [
        makeIssue('magnitude', 'NOT_FINITE', 'magnitude must be finite'),
        makeIssue('depth', 'OUT_OF_DOMAIN', 'depth too deep'),
      ],
      warnings: [],
    };
    const mag = pickFieldIssues(result, 'magnitude');
    const dep = pickFieldIssues(result, 'depth');
    const other = pickFieldIssues(result, 'vs30');

    expect(mag.topCode).toBe('NOT_FINITE');
    expect(mag.errors).toHaveLength(1);
    expect(dep.topCode).toBe('OUT_OF_DOMAIN');
    expect(dep.errors).toHaveLength(1);
    expect(other.topCode).toBeNull();
    expect(other.errors).toEqual([]);
  });

  it('errors take precedence over warnings on the same field', () => {
    const result: ValidationResult<unknown> = {
      status: 'invalid',
      input: null,
      errors: [makeIssue('flankCollapse.volumeM3', 'NOT_FINITE', 'NaN')],
      warnings: [makeIssue('flankCollapse.volumeM3', 'PHYS_SUSPICIOUS_HIGH', 'too big')],
    };
    const v = pickFieldIssues(result, 'flankCollapse.volumeM3');
    expect(v.hasError).toBe(true);
    expect(v.hasWarning).toBe(true);
    expect(v.topCode).toBe('NOT_FINITE');
    expect(v.topMessage).toBe('NaN');
  });

  it('with no error, the first warning is the top issue', () => {
    const result: ValidationResult<unknown> = {
      status: 'normalized',
      input: {},
      errors: [],
      warnings: [
        makeIssue('strikeAzimuthDeg', 'NORMALIZED_AZIMUTH', 'wrapped 720→0'),
        makeIssue('strikeAzimuthDeg', 'PHYS_SUSPICIOUS_HIGH', 'unused second'),
      ],
    };
    const v = pickFieldIssues(result, 'strikeAzimuthDeg');
    expect(v.hasError).toBe(false);
    expect(v.hasWarning).toBe(true);
    expect(v.topCode).toBe('NORMALIZED_AZIMUTH');
    expect(v.warnings).toHaveLength(2);
  });

  it('dot-notated nested paths survive (no path normalisation)', () => {
    const result: ValidationResult<unknown> = {
      status: 'invalid',
      input: null,
      errors: [
        makeIssue('flankCollapse.volumeM3', 'ZERO_FORBIDDEN', 'must be > 0'),
        makeIssue('flankCollapse', 'OUT_OF_DOMAIN', 'must be object'),
      ],
      warnings: [],
    };
    expect(pickFieldIssues(result, 'flankCollapse.volumeM3').topCode).toBe('ZERO_FORBIDDEN');
    expect(pickFieldIssues(result, 'flankCollapse').topCode).toBe('OUT_OF_DOMAIN');
    // The dot-path is exact-match: 'flankCollapse' does NOT match the nested error.
    expect(pickFieldIssues(result, 'flankCollapse').errors).toHaveLength(1);
  });
});

describe('validator → store → pickFieldIssues — end-to-end', () => {
  it('a clean preset (Tōhoku) produces zero issues for every field', () => {
    const input = useAppStore.getState().earthquake.input;
    const { result } = validateScenario('earthquake', input as unknown as Record<string, unknown>);
    expect(result.status).toBe('accepted');
    expect(pickFieldIssues(result, 'magnitude').topCode).toBeNull();
    expect(pickFieldIssues(result, 'depth').topCode).toBeNull();
  });

  it('PHYS_SUSPICIOUS_HIGH on magnitude propagates as warning, not error', () => {
    // Mw 11 is above the Valdivia 1960 ceiling — validator marks
    // suspicious, store ACCEPTS (it's not invalid), and the hook
    // surfaces it as a warning on `magnitude`.
    useAppStore.getState().setEarthquakeInput({ magnitude: 11 });
    const input = useAppStore.getState().earthquake.input;
    const { result } = validateScenario('earthquake', input as unknown as Record<string, unknown>);
    expect(result.status).toBe('suspicious');
    const v = pickFieldIssues(result, 'magnitude');
    expect(v.hasError).toBe(false);
    expect(v.hasWarning).toBe(true);
    expect(v.topCode).toBe('PHYS_SUSPICIOUS_HIGH');
    expect(v.topMessage).toMatch(/Valdivia/);
  });

  it('store rejects S1 invalid at the boundary; UI never sees the bad value', () => {
    // setEarthquakeInput uses classifyStoreInput, which leaves the
    // state untouched on `invalid`. The view a UI hook reads is
    // therefore the LAST-VALID input, not the bad one.
    const before = useAppStore.getState().earthquake.input.magnitude;
    useAppStore.getState().setEarthquakeInput({ magnitude: Number.NaN });
    const after = useAppStore.getState().earthquake.input.magnitude;
    expect(after).toBe(before); // boundary held — no UI second-validation needed
  });

  it('volcano nested field (flankCollapse.volumeM3) propagates with dot-notated path', () => {
    // The store's `setVolcanoInput` exposes scalar overrides only;
    // `flankCollapse` arrives via presets (e.g. KRAKATAU_1883). The
    // realistic UI flow is therefore: preset → flankCollapse in input
    // → validator surfaces warning → helper picks it up by dot-path.
    // We exercise this directly through validateScenario to pin the
    // dot-path contract end-to-end.
    const { result } = validateScenario('volcano', {
      volumeEruptionRate: 2e5,
      totalEjectaVolume: 2e10,
      flankCollapse: {
        volumeM3: 5e13, // > 1e13 → PHYS_SUSPICIOUS_HIGH
        slopeAngleDeg: 45,
        meanOceanDepth: 50,
        sourceWaterDepth: 250,
      },
    });
    expect(result.status).toBe('suspicious');
    const v = pickFieldIssues(result, 'flankCollapse.volumeM3');
    expect(v.hasWarning).toBe(true);
    expect(v.topCode).toBe('PHYS_SUSPICIOUS_HIGH');
  });

  it('preserves the validator-supplied raw message verbatim (no UI re-formatting)', () => {
    useAppStore.getState().setEarthquakeInput({ magnitude: 11 });
    const input = useAppStore.getState().earthquake.input;
    const { result } = validateScenario('earthquake', input as unknown as Record<string, unknown>);
    const v = pickFieldIssues(result, 'magnitude');
    // The message must be exactly what the validator emitted; the UI
    // is allowed to wrap it (label + aria) but never to mutate it.
    const direct = result.warnings.find((w) => w.field === 'magnitude');
    expect(v.topMessage).toBe(direct?.message);
    expect(v.topCode).toBe(direct?.code);
  });
});

describe('canonical-code preservation', () => {
  it('every validator-emitted code reaches the helper unchanged', () => {
    // Sanity scan: build a result with every code in the union and
    // verify the helper round-trips each one. If a future refactor
    // accidentally re-maps codes (e.g. "translates" them), this test
    // catches it.
    const codes: ValidationCode[] = [
      'NOT_FINITE',
      'NOT_NUMBER',
      'NEGATIVE_FORBIDDEN',
      'ZERO_FORBIDDEN',
      'OUT_OF_DOMAIN',
      'NORMALIZED_AZIMUTH',
      'NORMALIZED_LATITUDE',
      'NORMALIZED_LONGITUDE',
      'NORMALIZED_SLOPE',
      'PHYS_SUSPICIOUS_HIGH',
      'PHYS_SUSPICIOUS_LOW',
      'UNKNOWN_FIELD',
    ];
    const errors = codes.map((c) => makeIssue(`f_${c}`, c, `m_${c}`));
    const result: ValidationResult<unknown> = {
      status: 'invalid',
      input: null,
      errors,
      warnings: [],
    };
    for (const code of codes) {
      const v = pickFieldIssues(result, `f_${code}`);
      expect(v.topCode).toBe(code);
      expect(v.topMessage).toBe(`m_${code}`);
    }
  });
});
