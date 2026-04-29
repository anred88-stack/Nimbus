/**
 * Generate `docs/VALIDATION_REPORT.md` from the live state of the V&V
 * suite. Pure: reads only the validation modules + replay fixtures +
 * golden dataset; writes one Markdown file. Safe to run in CI.
 *
 * Sections produced:
 *   - Verification status (pure-formula tests)
 *   - Validation status (replay fixtures + golden dataset)
 *   - Remaining gaps (open BUG_REGISTRY items + sub-grid GeoClaw skips)
 *   - Scenarios covered (by category + oracle)
 *   - Scenarios still untrusted (where validation hasn't run)
 *
 * Usage:
 *   pnpm validation-report
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GOLDEN_DATASET } from '../src/physics/validation/goldenDataset.js';
import {
  loadReplayFixtures,
  runReplay,
  type ReplayReport,
} from '../src/physics/validation/replayHarness.js';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

function bullet(rows: string[]): string {
  return rows.map((r) => `- ${r}`).join('\n');
}

interface AggregateBucket {
  total: number;
  passed: number;
  failed: number;
  byCategory: Record<string, number>;
  failures: { id: string; violations: string[] }[];
}

function aggregateReports(reports: ReplayReport[]): AggregateBucket {
  const byCategory: Record<string, number> = {};
  const failures: { id: string; violations: string[] }[] = [];
  let passed = 0;
  for (const r of reports) {
    byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
    if (r.passed) {
      passed += 1;
    } else {
      failures.push({
        id: r.fixtureId,
        violations: r.violations.map(
          (v) => `${v.field}: ${v.reason} (expected ${JSON.stringify(v.expected)}, got ${JSON.stringify(v.actual)})`,
        ),
      });
    }
  }
  return {
    total: reports.length,
    passed,
    failed: reports.length - passed,
    byCategory,
    failures,
  };
}

function reportTable(b: AggregateBucket): string {
  const lines = [
    `| Total | Passed | Failed |`,
    `|-------|--------|--------|`,
    `| ${b.total.toString()} | ${b.passed.toString()} | ${b.failed.toString()} |`,
    '',
    '| Category | Count |',
    '|----------|-------|',
    ...Object.entries(b.byCategory)
      .sort()
      .map(([k, v]) => `| ${k} | ${v.toString()} |`),
  ];
  return lines.join('\n');
}

function failureSection(b: AggregateBucket, header: string): string {
  if (b.failures.length === 0) return `### ${header}\n\nAll passed.\n`;
  const lines = [`### ${header}`, ''];
  for (const f of b.failures) {
    lines.push(`#### ${f.id}`);
    for (const v of f.violations) lines.push(`- ${v}`);
    lines.push('');
  }
  return lines.join('\n');
}

function main(): void {
  const replayFixtures = loadReplayFixtures();
  const replayReports = replayFixtures.map(runReplay);
  const goldenReports = GOLDEN_DATASET.map(runReplay);

  const replayAgg = aggregateReports(replayReports);
  const goldenAgg = aggregateReports(goldenReports);

  const now = new Date().toISOString();
  const md = `# Nimbus validation report

_Generated: ${now}_

This report is produced by \`pnpm validation-report\`. Do not edit by
hand. Re-run after every change to the V&V suite to refresh.

## Verification vs validation

- **Verification** (does the code do what we said it does?) is the
  static unit-test layer: \`customInput.invariants\`,
  \`monotonicity.property\`, \`geometry.crs\`, \`regressionRegistry\`,
  plus per-formula tests scattered alongside each module.
- **Validation** (does the code reproduce real-world observation?) is
  what this report measures: replay fixtures + executable golden
  dataset, both routed through the centralized \`inputSchema.ts\` and
  the \`safeRun*()\` wrappers (the same path UI / store / CLI use).

## Replay fixtures

${reportTable(replayAgg)}

${failureSection(replayAgg, 'Replay failures')}

## Golden dataset

${reportTable(goldenAgg)}

${failureSection(goldenAgg, 'Golden case failures')}

## Remaining gaps (manually curated)

${bullet([
  '7 GeoClaw fixture probes are below the AMR base-grid noise floor (< 1 cm)' +
    ' and run as `it.skip` in `geoclawComparison.test.ts`. See `BUG_REGISTRY.md`' +
    ' "skipped" notes — these are sub-grid sources, not regressions.',
  'Closed-form / 1D-radial Saint-Venant amplitude predictions for elongated megathrusts' +
    ' have factor-3 scatter vs 2D AMR GeoClaw (per `DEFAULT_TOLERANCE_BY_TYPE` in' +
    ' `scripts/geoclaw/run_scenario.py`). Pinning tighter would require a 2D' +
    ' propagation engine in the browser worker.',
  'The bathymetric tsunami pipeline is not directly exercised by the replay' +
    ' harness — it depends on async ETOPO grid fetches that are not part of the' +
    ' synchronous `safeRun*()` path. E2E coverage lives in `tests/e2e/`.',
  'Custom-user GeoClaw fixtures cover only 8 parameter-grid samples per source class' +
    ' (3 seismic, 2 volcanic, 2 landslide, 1 impact). Adding more is a' +
    ' fixed-cost compute job; see `docs/GEOCLAW_SETUP.md`.',
])}

## Scenarios covered

- **Reference / scaling** (peer-reviewed observation envelope): ${(goldenAgg.byCategory.reference ?? 0).toString()} golden cases
- **Regression** (linked to BUG_REGISTRY rows): ${(goldenAgg.byCategory.regression ?? 0).toString()} golden cases + ${(replayAgg.byCategory.regression ?? 0).toString()} replay fixtures
- **Custom-user** (user-input archetype): ${(goldenAgg.byCategory['custom-user'] ?? 0).toString()} golden cases
- **Edge** (validator stress): ${(goldenAgg.byCategory.edge ?? 0).toString()} golden cases + ${(replayAgg.byCategory.edge ?? 0).toString()} replay fixtures
- **Physical-sanity** (S3 plausibility warnings): ${(goldenAgg.byCategory['physical-sanity'] ?? 0).toString()} golden cases

## Scenarios still untrusted

- Volcanic flank-collapse with explicit \`flankCollapse\` nested input (validator does not yet recurse into the nested object).
- Earthquake aftershocks pipeline (deterministic but not pinned by replay fixtures).
- Population-exposure pipeline (depends on disabled WorldPop COG).
- Atmospheric Comlink worker round-trip (covered by store smoke tests, not by harness).

## How to add a fixture

1. Drop a JSON file into \`src/physics/validation/replayFixtures/\` matching the \`ReplayFixture\` shape.
2. \`pnpm test src/physics/validation/replay\` will pick it up automatically.
3. \`pnpm validation-report\` will include it in the next regenerated report.

## How to add a golden case

1. Append an entry to \`GOLDEN_DATASET\` in \`src/physics/validation/goldenDataset.ts\`.
2. Append the corresponding row to \`docs/GOLDEN_CASES.md\`.
3. Re-run the test suite + this report.
`;

  const out = join(REPO_ROOT, 'docs', 'VALIDATION_REPORT.md');
  writeFileSync(out, md, 'utf8');
  console.log(`Wrote ${out}`);
  console.log(
    `Replay: ${replayAgg.passed.toString()}/${replayAgg.total.toString()} passed; Golden: ${goldenAgg.passed.toString()}/${goldenAgg.total.toString()} passed.`,
  );
  if (replayAgg.failed > 0 || goldenAgg.failed > 0) {
    process.exitCode = 1;
  }
}

main();
