/**
 * Release-readiness gate runner.
 *
 * Executes every BLOCKER from `docs/RELEASE_READINESS.md` in CI order,
 * collects the result of each, and prints a single verdict:
 *   - GO              — every blocker passes, no amber advisory.
 *   - CONDITIONAL GO  — every blocker passes, at least one advisory.
 *   - NO-GO           — at least one blocker fails.
 *
 * Reuses existing pnpm scripts (typecheck, lint, format:check, test,
 * validation-report, build, bundle:size). Does NOT duplicate their
 * logic. The final state of `docs/VALIDATION_REPORT.json` (regenerated
 * by the validation-report step) is the single source of truth for
 * the scientific gate decision.
 *
 * Exit codes:
 *   - 0: GO or CONDITIONAL GO
 *   - 1: NO-GO
 *
 * Run via:
 *   pnpm release:check
 *
 * Designed to be safe to invoke locally and in CI. Skip the heavy
 * E2E + Lighthouse jobs (those run as their own GitHub Actions
 * workflows; their decisions are surfaced via the GitHub status
 * checks, not duplicated here — the script only reports them as
 * "see workflow status" rows so the human runner can verify in the
 * release PR).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

type Severity = 'blocker' | 'advisory';
type Result = 'pass' | 'fail' | 'skipped';

interface GateOutcome {
  id: string;
  label: string;
  severity: Severity;
  result: Result;
  detail?: string;
}

function runStep(label: string, cmd: string, args: string[]): { ok: boolean; stderrTail: string } {
  process.stdout.write(`▶ ${label}\n`);
  const r = spawnSync(cmd, args, {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'inherit', 'pipe'],
    shell: process.platform === 'win32',
    encoding: 'utf-8',
  });
  const ok = r.status === 0;
  const stderrTail = typeof r.stderr === 'string' ? r.stderr.split('\n').slice(-6).join('\n') : '';
  return { ok, stderrTail };
}

function blocker(
  outcomes: GateOutcome[],
  id: string,
  label: string,
  cmd: string,
  args: string[]
): void {
  const r = runStep(label, cmd, args);
  outcomes.push({
    id,
    label,
    severity: 'blocker',
    result: r.ok ? 'pass' : 'fail',
    ...(r.ok ? {} : { detail: r.stderrTail.trim() || `${cmd} ${args.join(' ')} exited non-zero` }),
  });
}

/**
 * Read the gate decision from the JSON sidecar produced by
 * `pnpm validation-report --mode=strict`. Treats a missing file as a
 * blocker failure (the validation-report step should have produced it).
 */
function checkValidationReportArtifact(outcomes: GateOutcome[]): void {
  const id = 'validation-report.json';
  const path = join(REPO_ROOT, 'docs', 'VALIDATION_REPORT.json');
  if (!existsSync(path)) {
    outcomes.push({
      id,
      label: 'VALIDATION_REPORT.json present after strict run',
      severity: 'blocker',
      result: 'fail',
      detail: `${path} not found — did pnpm validation-report run?`,
    });
    return;
  }
  try {
    const json = JSON.parse(readFileSync(path, 'utf-8')) as {
      mode?: string;
      gate?: { decision?: string; exitCode?: number; blocking?: string[] };
      replay?: { failed?: number; passed?: number; total?: number };
      golden?: {
        failed?: number;
        passed?: number;
        total?: number;
        byStatus?: Record<string, number>;
      };
    };
    const decision = json.gate?.decision ?? 'unknown';
    const replayFailed = json.replay?.failed ?? -1;
    const goldenFailed = json.golden?.failed ?? -1;
    const replayPassed = json.replay?.passed ?? 0;
    const replayTotal = json.replay?.total ?? 0;
    const goldenPassed = json.golden?.passed ?? 0;
    const goldenTotal = json.golden?.total ?? 0;
    const ok = decision === 'pass' && replayFailed === 0 && goldenFailed === 0;
    outcomes.push({
      id,
      label: 'Strict gate decision (parsed from VALIDATION_REPORT.json)',
      severity: 'blocker',
      result: ok ? 'pass' : 'fail',
      detail: ok
        ? `decision=${decision}, replay=${replayPassed.toString()}/${replayTotal.toString()}, golden=${goldenPassed.toString()}/${goldenTotal.toString()}`
        : `decision=${decision}, replayFailed=${replayFailed.toString()}, goldenFailed=${goldenFailed.toString()}`,
    });
    // Advisory: suspicious golden status surface (informational).
    const suspicious = json.golden?.byStatus?.suspicious ?? 0;
    if (suspicious > 0) {
      outcomes.push({
        id: 'golden.suspicious',
        label: 'Golden cases with suspicious-but-accepted status',
        severity: 'advisory',
        result: 'fail',
        detail: `${suspicious.toString()} S3 golden case(s) — confirm each is documented in goldenDataset.ts`,
      });
    }
  } catch (e) {
    outcomes.push({
      id,
      label: 'VALIDATION_REPORT.json parseable',
      severity: 'blocker',
      result: 'fail',
      detail: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Walk `docs/BUG_REGISTRY.md` and assert no row has `pending` (or empty)
 * in the Fix column. The single-source-of-truth table starts with a
 * `## Index` heading and a 6-column markdown table.
 */
function checkBugRegistry(outcomes: GateOutcome[]): void {
  const id = 'bug-registry';
  const path = join(REPO_ROOT, 'docs', 'BUG_REGISTRY.md');
  if (!existsSync(path)) {
    outcomes.push({
      id,
      label: 'BUG_REGISTRY.md present',
      severity: 'blocker',
      result: 'fail',
      detail: `${path} not found`,
    });
    return;
  }
  const content = readFileSync(path, 'utf-8');
  // Match every B-NNN row.
  const rowRe = /^\|\s*(B-\d+)\s*\|.*\|\s*([^|]+?)\s*\|\s*$/gm;
  const pendingRows: string[] = [];
  let total = 0;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(content)) !== null) {
    total += 1;
    const id = m[1] ?? '';
    const fix = (m[2] ?? '').trim().toLowerCase();
    // Accept anything that looks like a commit link / hash. Reject:
    // empty, "pending", "tbd", "n/a".
    const looksFixed = fix.length > 0 && !['pending', 'tbd', 'n/a', '-'].includes(fix);
    if (!looksFixed) pendingRows.push(`${id} → "${(m[2] ?? '').trim()}"`);
  }
  outcomes.push({
    id,
    label: `BUG_REGISTRY: every row has a fix commit (${total.toString()} rows)`,
    severity: 'blocker',
    result: pendingRows.length === 0 ? 'pass' : 'fail',
    ...(pendingRows.length === 0 ? {} : { detail: `pending: ${pendingRows.join('; ')}` }),
  });
}

function verdictOf(outcomes: GateOutcome[]): 'GO' | 'CONDITIONAL GO' | 'NO-GO' {
  const blockerFails = outcomes.filter((o) => o.severity === 'blocker' && o.result === 'fail');
  if (blockerFails.length > 0) return 'NO-GO';
  const advisoryFails = outcomes.filter((o) => o.severity === 'advisory' && o.result === 'fail');
  if (advisoryFails.length > 0) return 'CONDITIONAL GO';
  return 'GO';
}

function printSummary(outcomes: GateOutcome[]): void {
  const verdict = verdictOf(outcomes);
  const sep = '─'.repeat(72);
  console.log(`\n${sep}`);
  console.log('Release readiness summary');
  console.log(sep);
  for (const o of outcomes) {
    const sym = o.result === 'pass' ? '✓' : o.result === 'fail' ? '✗' : '·';
    const tag = o.severity === 'blocker' ? '[BLOCK]' : '[ADVIS]';
    console.log(`  ${sym} ${tag} ${o.label}`);
    if (o.result === 'fail' && o.detail) {
      for (const line of o.detail.split('\n')) {
        if (line.trim().length === 0) continue;
        console.log(`        ${line}`);
      }
    }
  }
  console.log(sep);
  console.log(`Verdict: ${verdict}`);
  console.log(sep);
  if (verdict === 'NO-GO') {
    console.log('Do NOT tag a release. Fix the blockers above first.');
  } else if (verdict === 'CONDITIONAL GO') {
    console.log('Release allowed only if every advisory amber is acknowledged');
    console.log('in the release notes. See docs/RELEASE_READINESS.md §H.');
  } else {
    console.log('All blockers pass, no advisory amber. Cleared to tag.');
  }
}

function main(): void {
  const outcomes: GateOutcome[] = [];
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

  // A. Build & static quality
  blocker(outcomes, 'A.typecheck', 'A · Typecheck', pnpm, ['typecheck']);
  blocker(outcomes, 'A.lint', 'A · Lint (max 0 warnings)', pnpm, ['lint']);
  blocker(outcomes, 'A.format', 'A · Format check', pnpm, ['format:check']);

  // B. Automated tests (no coverage flag — keeps the local sweep fast)
  blocker(outcomes, 'B.test', 'B · Unit + integration test suite', pnpm, ['test']);

  // C. Validation gates (regenerates the JSON sidecar)
  blocker(outcomes, 'C.validation', 'C · Strict validation gate', pnpm, [
    'validation-report',
    '--',
    '--mode=strict',
  ]);
  checkValidationReportArtifact(outcomes);

  // A (continued). Build last so a typecheck/lint failure short-circuits
  // earlier.
  blocker(outcomes, 'A.build', 'A · Production build', pnpm, ['build']);
  blocker(outcomes, 'B.bundle', 'B · Bundle-size budget', pnpm, ['bundle:size']);

  // G. Bug management — file-based check, no command needed.
  checkBugRegistry(outcomes);

  printSummary(outcomes);

  const v = verdictOf(outcomes);
  process.exitCode = v === 'NO-GO' ? 1 : 0;
}

main();
