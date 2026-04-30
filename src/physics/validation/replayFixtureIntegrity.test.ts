/**
 * Replay-fixture integrity gate.
 *
 * A fixture file in `replayFixtures/` is committed JSON that drives
 * the validation harness. If a fixture is malformed (missing field,
 * unknown category, undeclared scenarioType), the runner crashes with
 * an opaque TypeError instead of a labelled validation failure.
 *
 * This test fails fast with a clear message when:
 *   - a required field is missing (id, category, scenarioType,
 *     rawInput, expectedValidation, expectedOutputs);
 *   - the category is not in the closed set;
 *   - the scenarioType is not a known event type;
 *   - the file name does not start with the fixture id (naming
 *     convention: `<id>.json`);
 *   - the id is not unique across the corpus;
 *   - the expectedValidation block is structurally wrong;
 *   - a fixture is "orphan" — has no linkedBug and no linkedGoldenCase
 *     and is not in a discoverable category that documents its purpose.
 *
 * Closes L2 in `CONSOLIDATION_AUDIT.md`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FixtureCategory } from './replayHarness.js';
import type { ScenarioType } from './inputSchema.js';

const VALID_CATEGORIES: readonly FixtureCategory[] = [
  'reference',
  'regression',
  'custom-user',
  'edge',
  'physical-sanity',
] as const;

const VALID_SCENARIO_TYPES: readonly ScenarioType[] = [
  'earthquake',
  'explosion',
  'volcano',
  'landslide',
  'impact',
] as const;

const VALID_STATUSES = ['invalid', 'normalized', 'suspicious', 'accepted'] as const;

const FIXTURE_DIR = (() => {
  const dir = new URL('./replayFixtures/', import.meta.url).pathname;
  return dir.startsWith('/') && /^\/[A-Za-z]:\//.test(dir) ? dir.slice(1) : dir;
})();

interface RawFixture {
  id?: unknown;
  category?: unknown;
  title?: unknown;
  description?: unknown;
  linkedBug?: unknown;
  linkedGoldenCase?: unknown;
  scenarioType?: unknown;
  rawInput?: unknown;
  expectedValidation?: unknown;
  expectedOutputs?: unknown;
}

function loadFixtureFiles(): { file: string; raw: RawFixture }[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({
      file: f,
      raw: JSON.parse(readFileSync(join(FIXTURE_DIR, f), 'utf8')) as RawFixture,
    }));
}

describe('Replay-fixture integrity — every JSON in replayFixtures/ is well-formed', () => {
  const files = loadFixtureFiles();

  it('fixture corpus is non-empty', () => {
    expect(files.length, 'no fixtures committed').toBeGreaterThan(0);
  });

  for (const { file, raw } of files) {
    describe(file, () => {
      it('has a string id', () => {
        expect(typeof raw.id, `${file}: id must be string`).toBe('string');
        expect((raw.id as string).length).toBeGreaterThan(0);
      });

      it('id matches the file name (naming convention <id>.json)', () => {
        expect(file, `id "${String(raw.id)}" does not match file name "${file}"`).toBe(
          `${String(raw.id)}.json`
        );
      });

      it('category is one of the known set', () => {
        expect(VALID_CATEGORIES, `${file}: unknown category "${String(raw.category)}"`).toContain(
          raw.category as FixtureCategory
        );
      });

      it('scenarioType is a known event type', () => {
        expect(
          VALID_SCENARIO_TYPES,
          `${file}: unknown scenarioType "${String(raw.scenarioType)}"`
        ).toContain(raw.scenarioType as ScenarioType);
      });

      it('rawInput is an object', () => {
        expect(
          typeof raw.rawInput === 'object' && raw.rawInput !== null,
          `${file}: rawInput must be a non-null object`
        ).toBe(true);
      });

      it('expectedValidation has a known status, finite errorCount, finite warningCount', () => {
        const ev = raw.expectedValidation as Record<string, unknown>;
        expect(ev, `${file}: expectedValidation must be an object`).toBeDefined();
        expect(VALID_STATUSES, `${file}: expectedValidation.status invalid`).toContain(
          ev.status as (typeof VALID_STATUSES)[number]
        );
        expect(typeof ev.errorCount === 'number' && Number.isFinite(ev.errorCount)).toBe(true);
        expect(typeof ev.warningCount === 'number' && Number.isFinite(ev.warningCount)).toBe(true);
      });

      it('expectedOutputs is an object (may be empty for invalid scenarios)', () => {
        expect(
          typeof raw.expectedOutputs === 'object' && raw.expectedOutputs !== null,
          `${file}: expectedOutputs must be a non-null object`
        ).toBe(true);
      });

      it('is not orphan — has either linkedBug, linkedGoldenCase, or a "reference" category', () => {
        // Reference cases self-document via their citation. Other
        // categories should declare provenance: a registered bug or
        // a golden anchor. This catches "drive-by" fixtures that nobody
        // remembers why they exist.
        const hasBug = typeof raw.linkedBug === 'string' && raw.linkedBug.length > 0;
        const hasGolden =
          typeof raw.linkedGoldenCase === 'string' && raw.linkedGoldenCase.length > 0;
        const isReference = raw.category === 'reference' || raw.category === 'physical-sanity';
        expect(
          hasBug || hasGolden || isReference,
          `${file}: orphan fixture — declare linkedBug, linkedGoldenCase, or set category to 'reference'/'physical-sanity'`
        ).toBe(true);
      });
    });
  }

  it('fixture ids are unique across the corpus', () => {
    const ids = files.map((f) => f.raw.id as string).sort();
    const dups = ids.filter((id, i) => i > 0 && id === ids[i - 1]);
    expect(dups, `duplicate fixture ids: ${dups.join(', ')}`).toEqual([]);
  });
});
