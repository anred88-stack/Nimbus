/**
 * Replay harness for V&V fixtures.
 *
 * A "replay fixture" is a JSON file in `replayFixtures/` containing:
 *   - id, category, title, description
 *   - linkedBug (BUG_REGISTRY.md row), linkedGoldenCase (GOLDEN_CASES.md)
 *   - scenarioType + rawInput (whatever the user / preset provides)
 *   - expectedValidation (status, error/warning counts)
 *   - expectedOutputs: dot-paths into the result with either
 *       { value, absTolerance } | { min, max } | { value } (exact)
 *
 * The harness loads a fixture, runs it through `safeRunByType`, and
 * compares the structured snapshot (validation block + scalar
 * extractions) against the expected values. Returns a labelled diff so
 * `replay.test.ts` can assert clean pass/fail per fixture.
 *
 * Usage from a test file:
 *   const fixtures = loadReplayFixtures();
 *   for (const f of fixtures) {
 *     const report = runReplay(f);
 *     expect(report.violations, ...).toEqual([]);
 *   }
 *
 * Usage from CLI (`pnpm validation-report`):
 *   prints one line per fixture + summary at the end.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { safeRunByType, type SafeRunDispatchResult } from './safeRun.js';
import type { ScenarioType } from './inputSchema.js';

export type FixtureCategory =
  | 'reference'
  | 'regression'
  | 'custom-user'
  | 'edge'
  | 'physical-sanity';

export interface ExpectedScalar {
  /** Expected exact value (for booleans, strings, exact numbers). */
  value?: unknown;
  /** Lower bound (inclusive) for a numeric value. */
  min?: number;
  /** Upper bound (inclusive) for a numeric value. */
  max?: number;
  /** Absolute tolerance: passes if |actual - value| <= absTolerance. */
  absTolerance?: number;
  /** Free-form note for humans. Not enforced. */
  comment?: string;
}

export interface ExpectedValidation {
  status: 'invalid' | 'normalized' | 'suspicious' | 'accepted';
  errorCount: number;
  warningCount: number;
  errorFields?: string[];
  errorCodes?: string[];
  warningFields?: string[];
  warningCodes?: string[];
}

export interface ReplayFixture {
  id: string;
  category: FixtureCategory;
  title: string;
  description?: string;
  linkedBug?: string | null;
  linkedGoldenCase?: string | null;
  scenarioType: ScenarioType;
  rawInput: Record<string, unknown>;
  expectedValidation: ExpectedValidation;
  expectedOutputs: Record<string, ExpectedScalar | { value?: unknown; comment?: string }>;
}

export interface ReplayViolation {
  field: string;
  expected: unknown;
  actual: unknown;
  reason: string;
}

export interface ReplayReport {
  fixtureId: string;
  category: FixtureCategory;
  passed: boolean;
  violations: ReplayViolation[];
  /** Captured snapshot of actual values (for `pnpm validation-report`). */
  snapshot: {
    validation: {
      status: string;
      errors: { field: string; code: string }[];
      warnings: { field: string; code: string }[];
    };
    outputs: Record<string, unknown>;
  };
}

/** Resolve a dot-path inside a nested object. Returns `undefined` when
 *  any segment is missing. Two synthetic suffixes are recognised:
 *    - `.km`      → divide a number by 1000
 *    - `.m`       → identity (just for documentation)
 *    - `.exists`  → boolean: the field is non-null/non-undefined
 */
export function resolvePath(obj: unknown, path: string): unknown {
  let suffix: 'km' | 'm' | 'exists' | undefined;
  let p = path;
  if (p.endsWith('.km')) {
    suffix = 'km';
    p = p.slice(0, -3);
  } else if (p.endsWith('.m')) {
    suffix = 'm';
    p = p.slice(0, -2);
  } else if (p.endsWith('.exists')) {
    suffix = 'exists';
    p = p.slice(0, -7);
  }
  const segments = p.split('.');
  let cur: unknown = obj;
  for (const seg of segments) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  if (suffix === 'exists') return cur !== null && cur !== undefined;
  if (suffix === 'km' && typeof cur === 'number') return cur / 1000;
  return cur;
}

function compareScalar(
  field: string,
  expected: ExpectedScalar | { value?: unknown; comment?: string },
  actual: unknown
): ReplayViolation | null {
  const e = expected as ExpectedScalar;
  if (e.value !== undefined) {
    // Strict equality for booleans/strings; absTolerance for numbers.
    if (typeof e.value === 'number' && typeof actual === 'number' && e.absTolerance !== undefined) {
      if (Math.abs(actual - e.value) <= e.absTolerance) return null;
      return {
        field,
        expected: `${e.value.toString()} ± ${e.absTolerance.toString()}`,
        actual,
        reason: `numeric tolerance violated (delta ${(actual - e.value).toFixed(3)})`,
      };
    }
    if (e.value === actual) return null;
    return { field, expected: e.value, actual, reason: 'exact-equality violated' };
  }
  if (e.min !== undefined || e.max !== undefined) {
    if (typeof actual !== 'number' || !Number.isFinite(actual)) {
      const lo = e.min === undefined ? '-inf' : e.min.toString();
      const hi = e.max === undefined ? '+inf' : e.max.toString();
      return { field, expected: `[${lo}, ${hi}]`, actual, reason: 'expected finite number' };
    }
    if (e.min !== undefined && actual < e.min) {
      return { field, expected: `>= ${e.min.toString()}`, actual, reason: 'below lower bound' };
    }
    if (e.max !== undefined && actual > e.max) {
      return { field, expected: `<= ${e.max.toString()}`, actual, reason: 'above upper bound' };
    }
    return null;
  }
  // No constraints — just record (used for "comment" entries).
  return null;
}

function summariseValidation(safe: SafeRunDispatchResult): ReplayReport['snapshot']['validation'] {
  const v = safe.safe.validation;
  return {
    status: v.status,
    errors: v.errors.map((e) => ({ field: e.field, code: e.code })),
    warnings: v.warnings.map((w) => ({ field: w.field, code: w.code })),
  };
}

/** Run a single fixture and produce a labelled report. Pure function. */
export function runReplay(fixture: ReplayFixture): ReplayReport {
  const safe = safeRunByType(fixture.scenarioType, fixture.rawInput);
  const violations: ReplayViolation[] = [];

  // Validation block.
  const v = safe.safe.validation;
  if (v.status !== fixture.expectedValidation.status) {
    violations.push({
      field: 'validation.status',
      expected: fixture.expectedValidation.status,
      actual: v.status,
      reason: 'validation status mismatch',
    });
  }
  if (v.errors.length !== fixture.expectedValidation.errorCount) {
    violations.push({
      field: 'validation.errors.length',
      expected: fixture.expectedValidation.errorCount,
      actual: v.errors.length,
      reason: 'error count mismatch',
    });
  }
  if (v.warnings.length !== fixture.expectedValidation.warningCount) {
    violations.push({
      field: 'validation.warnings.length',
      expected: fixture.expectedValidation.warningCount,
      actual: v.warnings.length,
      reason: 'warning count mismatch',
    });
  }
  if (fixture.expectedValidation.errorFields !== undefined) {
    const actual = v.errors.map((e) => e.field).sort();
    const expected = [...fixture.expectedValidation.errorFields].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      violations.push({
        field: 'validation.errors.fields',
        expected,
        actual,
        reason: 'error fields mismatch',
      });
    }
  }
  if (fixture.expectedValidation.errorCodes !== undefined) {
    const actual = v.errors.map((e) => e.code).sort();
    const expected = [...fixture.expectedValidation.errorCodes].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      violations.push({
        field: 'validation.errors.codes',
        expected,
        actual,
        reason: 'error codes mismatch',
      });
    }
  }

  // Output block.
  const expectedKeys = Object.keys(fixture.expectedOutputs);
  const snapshotOutputs: Record<string, unknown> = {};
  for (const [key, expectedValue] of Object.entries(fixture.expectedOutputs)) {
    if (key === 'comment') continue;
    let actual: unknown;
    if (key === 'result.exists') {
      actual = safe.safe.ok;
    } else if (safe.safe.ok) {
      actual = resolvePath(safe.safe.result, key);
    } else {
      actual = undefined;
    }
    snapshotOutputs[key] = actual;
    const violation = compareScalar(key, expectedValue, actual);
    if (violation !== null) violations.push(violation);
  }
  void expectedKeys;

  return {
    fixtureId: fixture.id,
    category: fixture.category,
    passed: violations.length === 0,
    violations,
    snapshot: {
      validation: summariseValidation(safe),
      outputs: snapshotOutputs,
    },
  };
}

/** Read every JSON fixture in the `replayFixtures/` directory. */
export function loadReplayFixtures(): ReplayFixture[] {
  const dir = new URL('./replayFixtures/', import.meta.url).pathname;
  // On Windows, URL.pathname is `/C:/...`; strip the leading `/`.
  const cleaned = dir.startsWith('/') && /^\/[A-Za-z]:\//.test(dir) ? dir.slice(1) : dir;
  const files = readdirSync(cleaned).filter((f) => f.endsWith('.json'));
  return files.map((f) => JSON.parse(readFileSync(join(cleaned, f), 'utf8')) as ReplayFixture);
}
