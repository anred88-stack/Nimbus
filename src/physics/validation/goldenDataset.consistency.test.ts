/**
 * Golden-dataset consistency gate.
 *
 * Beyond the per-case execution test in `goldenDataset.test.ts`, the
 * dataset itself has structural invariants that should never drift:
 *   - IDs are unique (no silent duplicate that runs twice).
 *   - Every category has at least N cases (no accidental coverage loss).
 *   - Every oracle is represented.
 *   - Every regression case has a `linkedBug`.
 *   - Every reference / regression case has a non-empty `citation`.
 *   - No two cases have identical `rawInput` (cheap semantic-duplicate
 *     check).
 *
 * Closes L3 in `CONSOLIDATION_AUDIT.md`.
 */

import { describe, expect, it } from 'vitest';
import { GOLDEN_DATASET, type GoldenCase, type GoldenOracle } from './goldenDataset.js';
import type { FixtureCategory } from './replayHarness.js';

/** Minimum coverage thresholds per category. Tighten over time as the
 *  dataset grows. Numbers chosen so the current dataset just barely
 *  meets each — adding a new category-N case relaxes the gate; removing
 *  one tightens it (and triggers a CI failure). */
const MIN_PER_CATEGORY: Record<FixtureCategory, number> = {
  reference: 3,
  regression: 2,
  'custom-user': 1,
  edge: 2,
  'physical-sanity': 1,
};

/** Required oracles. Every dataset must exercise at least one of each. */
const REQUIRED_ORACLES: readonly GoldenOracle[] = ['historical', 'scaling', 'property'] as const;

describe('Golden dataset consistency — structural invariants', () => {
  it('all golden ids are unique', () => {
    const ids = GOLDEN_DATASET.map((g) => g.id).sort();
    const dups = ids.filter((id, i) => i > 0 && id === ids[i - 1]);
    expect(dups, `duplicate ids: ${dups.join(', ')}`).toEqual([]);
  });

  it('each category meets its minimum coverage threshold', () => {
    const counts: Record<string, number> = {};
    for (const g of GOLDEN_DATASET) {
      counts[g.category] = (counts[g.category] ?? 0) + 1;
    }
    for (const [cat, min] of Object.entries(MIN_PER_CATEGORY)) {
      expect(
        counts[cat] ?? 0,
        `category "${cat}" has ${(counts[cat] ?? 0).toString()} case(s), required >= ${min.toString()}`
      ).toBeGreaterThanOrEqual(min);
    }
  });

  it('every required oracle is represented', () => {
    const oracles = new Set(GOLDEN_DATASET.map((g) => g.oracle));
    for (const o of REQUIRED_ORACLES) {
      expect(oracles, `oracle "${o}" not represented in dataset`).toContain(o);
    }
  });

  it('every regression case has a linkedBug', () => {
    const orphans = GOLDEN_DATASET.filter(
      (g) => g.category === 'regression' && (g.linkedBug === undefined || g.linkedBug === null)
    );
    expect(
      orphans.map((g) => g.id),
      'regression cases must declare linkedBug (which row in BUG_REGISTRY.md)'
    ).toEqual([]);
  });

  it('every reference / regression case has a non-empty citation', () => {
    const missing = GOLDEN_DATASET.filter(
      (g) =>
        (g.category === 'reference' || g.category === 'regression') &&
        (typeof g.citation !== 'string' || g.citation.trim().length === 0)
    );
    expect(
      missing.map((g) => g.id),
      'reference/regression cases require a non-empty citation'
    ).toEqual([]);
  });

  it('no two cases share the same rawInput (semantic-duplicate guard)', () => {
    // Two identical inputs running side-by-side is dataset bloat.
    // We compare via stable JSON serialization of rawInput.
    const seen = new Map<string, GoldenCase>();
    const dups: string[] = [];
    for (const g of GOLDEN_DATASET) {
      const key = JSON.stringify(g.rawInput);
      const existing = seen.get(key);
      if (existing !== undefined) dups.push(`${existing.id} ↔ ${g.id}`);
      else seen.set(key, g);
    }
    expect(dups, `semantic duplicates: ${dups.join('; ')}`).toEqual([]);
  });

  it('every case has a non-empty title', () => {
    const missing = GOLDEN_DATASET.filter((g) => g.title.trim().length === 0);
    expect(missing.map((g) => g.id)).toEqual([]);
  });
});
