/**
 * Replay-fixture validation suite.
 *
 * Iterates over every JSON in `replayFixtures/` and asserts:
 *   - the validator status matches expected
 *   - the validator error/warning counts match expected
 *   - every numeric output passes its expected envelope
 *
 * Adding a new fixture requires no test-code change. A fixture failing
 * here means either the production code drifted (test should fail and
 * surface a real bug) or the fixture is stale (update the JSON). Use
 * `pnpm validation-report` to inspect the snapshot before deciding.
 */

import { describe, expect, it } from 'vitest';
import { loadReplayFixtures, runReplay } from './replayHarness.js';

const fixtures = loadReplayFixtures();

describe('Replay fixtures — every fixture in src/physics/validation/replayFixtures/', () => {
  if (fixtures.length === 0) {
    it.skip('no fixtures committed yet', () => {
      // Empty fixture directory is OK in early development.
    });
    return;
  }

  for (const fx of fixtures) {
    it(`[${fx.category}] ${fx.id}: validation + outputs match expected`, () => {
      const report = runReplay(fx);
      expect(
        report.violations,
        `Replay ${fx.id} failed (${report.violations.length.toString()} violation(s)). Snapshot:\n${JSON.stringify(report.snapshot, null, 2)}\nViolations:\n${JSON.stringify(report.violations, null, 2)}`,
      ).toEqual([]);
    });
  }
});
