import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

/**
 * Bundle-size guard. Walks `dist/` after `pnpm build`, sums the bytes
 * (raw + gzip) of every entry-bundle JS / CSS file, and compares the
 * total to a committed baseline (`bundle-size.baseline.json`).
 *
 * Three modes:
 *   - default: read baseline, fail when the new total exceeds the
 *     budget (baseline + tolerance). Tolerance defaults to +5 % raw,
 *     +5 % gzip; override via --tolerance=0.10 for 10 %.
 *   - --update: rewrite the baseline with the current sizes. Run once
 *     after a deliberate bundle change and commit the new file.
 *   - --report: print the per-file table without comparing.
 *
 * The script intentionally walks the *production* bundle only — every
 * file under `dist/` whose extension is .js / .mjs / .css. Lazy chunks
 * are reported separately so growth in a deferred GlobeView chunk
 * doesn't block a fix that lives in the eager landing-page bundle.
 *
 * The baseline file lives at the repo root so the diff is visible
 * during code review (i.e. "this change adds 12 KB to the eager
 * bundle, here's why").
 */

interface FileEntry {
  path: string;
  rawBytes: number;
  gzipBytes: number;
  /** True when the file is named with a Vite hash (lazy chunk). */
  isLazy: boolean;
}

interface BundleStats {
  totalRaw: number;
  totalGzip: number;
  eagerRaw: number;
  eagerGzip: number;
  lazyRaw: number;
  lazyGzip: number;
  files: FileEntry[];
}

interface Baseline {
  totalRaw: number;
  totalGzip: number;
  eagerRaw: number;
  eagerGzip: number;
  lazyRaw: number;
  lazyGzip: number;
  /** Captured at write time so reviewers can see drift over months. */
  recordedAt: string;
  /** Tool that produced the file — keeps a paper trail when we ever
   *  swap measurement strategies. */
  tool: string;
}

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const DIST_DIR = join(REPO_ROOT, 'dist');
const BASELINE_PATH = join(REPO_ROOT, 'bundle-size.baseline.json');

const ASSET_EXTENSIONS = new Set(['.js', '.mjs', '.css']);
const HASH_RE = /-[A-Za-z0-9_-]{8,}\.(?:js|mjs|css)$/;
const DEFAULT_TOLERANCE = 0.05;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function collectStats(): BundleStats {
  const files: FileEntry[] = [];
  let totalRaw = 0;
  let totalGzip = 0;
  let eagerRaw = 0;
  let eagerGzip = 0;
  let lazyRaw = 0;
  let lazyGzip = 0;

  for (const path of walk(DIST_DIR)) {
    const ext = path.slice(path.lastIndexOf('.')).toLowerCase();
    if (!ASSET_EXTENSIONS.has(ext)) continue;
    const raw = statSync(path).size;
    const gz = gzipSync(readFileSync(path)).length;
    const isLazy = HASH_RE.test(path);
    files.push({
      path: relative(REPO_ROOT, path).replace(/\\/g, '/'),
      rawBytes: raw,
      gzipBytes: gz,
      isLazy,
    });
    totalRaw += raw;
    totalGzip += gz;
    if (isLazy) {
      lazyRaw += raw;
      lazyGzip += gz;
    } else {
      eagerRaw += raw;
      eagerGzip += gz;
    }
  }

  files.sort((a, b) => b.rawBytes - a.rawBytes);
  return { totalRaw, totalGzip, eagerRaw, eagerGzip, lazyRaw, lazyGzip, files };
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n.toString()} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function printTable(stats: BundleStats): void {
  console.log('\nBundle size report');
  console.log('==================');
  for (const f of stats.files) {
    const tag = f.isLazy ? '[lazy]' : '[eager]';
    console.log(
      `  ${tag.padEnd(8)} ${f.path.padEnd(50)} ${fmtBytes(f.rawBytes).padStart(10)}  (gz ${fmtBytes(
        f.gzipBytes
      ).padStart(8)})`
    );
  }
  console.log('  ──────');
  console.log(
    `  eager   ${fmtBytes(stats.eagerRaw).padStart(10)}  (gz ${fmtBytes(stats.eagerGzip).padStart(
      8
    )})`
  );
  console.log(
    `  lazy    ${fmtBytes(stats.lazyRaw).padStart(10)}  (gz ${fmtBytes(stats.lazyGzip).padStart(8)})`
  );
  console.log(
    `  total   ${fmtBytes(stats.totalRaw).padStart(10)}  (gz ${fmtBytes(stats.totalGzip).padStart(
      8
    )})`
  );
}

function loadBaseline(): Baseline | null {
  try {
    const raw = readFileSync(BASELINE_PATH, 'utf8');
    return JSON.parse(raw) as Baseline;
  } catch {
    return null;
  }
}

function writeBaseline(stats: BundleStats): void {
  const baseline: Baseline = {
    totalRaw: stats.totalRaw,
    totalGzip: stats.totalGzip,
    eagerRaw: stats.eagerRaw,
    eagerGzip: stats.eagerGzip,
    lazyRaw: stats.lazyRaw,
    lazyGzip: stats.lazyGzip,
    recordedAt: new Date().toISOString(),
    tool: 'scripts/bundle-size-check.ts',
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
}

function compare(stats: BundleStats, baseline: Baseline, tolerance: number): boolean {
  const checks: { key: string; current: number; baseline: number }[] = [
    { key: 'eagerRaw', current: stats.eagerRaw, baseline: baseline.eagerRaw },
    { key: 'eagerGzip', current: stats.eagerGzip, baseline: baseline.eagerGzip },
    { key: 'totalRaw', current: stats.totalRaw, baseline: baseline.totalRaw },
    { key: 'totalGzip', current: stats.totalGzip, baseline: baseline.totalGzip },
  ];
  let ok = true;
  console.log(`\nBudget check (tolerance: +${(tolerance * 100).toFixed(0)} %)`);
  console.log('==================');
  for (const c of checks) {
    const budget = c.baseline * (1 + tolerance);
    const delta = c.current - c.baseline;
    const deltaPct = c.baseline > 0 ? (delta / c.baseline) * 100 : 0;
    const status = c.current <= budget ? 'ok' : 'OVER';
    if (status === 'OVER') ok = false;
    console.log(
      `  ${status.padEnd(4)} ${c.key.padEnd(12)} current ${fmtBytes(c.current).padStart(
        9
      )}  baseline ${fmtBytes(c.baseline).padStart(9)}  delta ${
        delta >= 0 ? '+' : ''
      }${fmtBytes(delta).padStart(9)} (${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)} %)`
    );
  }
  return ok;
}

function parseTolerance(argv: string[]): number {
  const flag = argv.find((a) => a.startsWith('--tolerance='));
  if (flag === undefined) return DEFAULT_TOLERANCE;
  const v = Number.parseFloat(flag.slice('--tolerance='.length));
  if (!Number.isFinite(v) || v < 0 || v > 1) {
    throw new Error(`--tolerance must be a number in [0, 1], got "${flag}"`);
  }
  return v;
}

function main(): void {
  const argv = process.argv.slice(2);
  const update = argv.includes('--update');
  const reportOnly = argv.includes('--report');
  const tolerance = parseTolerance(argv);

  const stats = collectStats();
  printTable(stats);

  if (update) {
    writeBaseline(stats);
    console.log(
      `\nBaseline rewritten at ${relative(REPO_ROOT, BASELINE_PATH).replace(/\\/g, '/')}`
    );
    return;
  }

  if (reportOnly) return;

  const baseline = loadBaseline();
  if (baseline === null) {
    console.warn(
      `\n[bundle-size-check] no baseline at ${relative(REPO_ROOT, BASELINE_PATH).replace(
        /\\/g,
        '/'
      )} — run with --update once to record one.`
    );
    return;
  }

  const ok = compare(stats, baseline, tolerance);
  if (!ok) {
    console.error(
      '\n[bundle-size-check] one or more buckets exceeded the budget. ' +
        'Either tighten the change or rerun with --update if the bigger bundle is intentional.'
    );
    process.exit(1);
  }
  console.log('\n[bundle-size-check] all buckets within budget.');
}

main();
