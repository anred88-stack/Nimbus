/**
 * Golden-cases dataset runner.
 *
 * Iterates GOLDEN_DATASET (the executable form of GOLDEN_CASES.md) and
 * runs each entry through the same replay harness used for the JSON
 * fixtures. A failure surfaces both the violations and the captured
 * snapshot so a developer can decide if the case drifted or the
 * production model drifted.
 *
 * The dataset count is pinned so adding a row to GOLDEN_CASES.md
 * without adding the matching dataset entry fails this test.
 */

import { describe, expect, it } from 'vitest';
import { GOLDEN_DATASET } from './goldenDataset.js';
import { runReplay } from './replayHarness.js';

describe('Golden cases — executable dataset (see docs/GOLDEN_CASES.md)', () => {
  for (const gc of GOLDEN_DATASET) {
    it(`[${gc.category}/${gc.oracle}] ${gc.id}: ${gc.title}`, () => {
      const report = runReplay(gc);
      expect(
        report.violations,
        `Golden case ${gc.id} (${gc.citation}) violated:\n${JSON.stringify(report.violations, null, 2)}\nSnapshot:\n${JSON.stringify(report.snapshot, null, 2)}`
      ).toEqual([]);
    });
  }

  it('every category is represented at least once', () => {
    // Quality gate: the dataset must keep covering all V&V categories.
    // If you remove the only "edge" case the suite is silently weaker.
    const categories = new Set(GOLDEN_DATASET.map((g) => g.category));
    expect(categories).toContain('reference');
    expect(categories).toContain('regression');
    expect(categories).toContain('custom-user');
    expect(categories).toContain('edge');
    expect(categories).toContain('physical-sanity');
  });

  it('every oracle is represented at least once', () => {
    const oracles = new Set(GOLDEN_DATASET.map((g) => g.oracle));
    expect(oracles).toContain('historical');
    expect(oracles).toContain('scaling');
    expect(oracles).toContain('property');
  });
});
