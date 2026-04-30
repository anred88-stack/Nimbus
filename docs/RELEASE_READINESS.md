# Release readiness checklist

Operational gate run before every release tag (`v*`). Distinct from
`RELEASE_CHECKLIST.md`, which covers the **one-time** pre-flight for
the first public release (identity, copy, content, scientific sign-off).
This file is the **per-release** classifier: GO / CONDITIONAL GO / NO-GO,
backed by the same gates CI already enforces.

## Decision states

| State              | Meaning                                                                                                                                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GO**             | Every blocker passes. No open critical bug. Tag the release.                                                                                                                                                                                   |
| **CONDITIONAL GO** | Every blocker passes, but at least one advisory is amber (e.g. Lighthouse perf < 0.85, bundle delta near budget, suspicious-but-accepted golden case). Release is allowed, but the amber must be explicitly acknowledged in the release notes. |
| **NO-GO**          | At least one blocker fails or an open bug is critical. Do not tag.                                                                                                                                                                             |

Each row below is **B** (blocker — failure ⇒ NO-GO) or **A** (advisory —
failure ⇒ CONDITIONAL GO at most).

## Minimum verify command

```sh
pnpm release:check
```

Runs every **structural** blocker locally in CI order and prints the
GO / CONDITIONAL GO / NO-GO verdict. Source: `scripts/release-readiness.ts`.

### Coverage split: local script vs CI workflows

`pnpm release:check` deliberately covers only the gates that are
**fast and self-contained** (typecheck, lint, format, test,
validation-report --mode=strict, build, bundle-size, BUG_REGISTRY).
Heavy gates run as their own GitHub Actions workflows; the release
manager verifies them by reading the workflow status on the release
PR — they are NOT re-executed locally.

| Gate                                                         | Where it runs                                        | Source of truth                |
| ------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------ |
| Typecheck / lint / format / test / build / bundle-size       | local + `ci.yml`                                     | `pnpm release:check` exit code |
| Strict validation gate (replay + golden)                     | local + `ci.yml`                                     | `docs/VALIDATION_REPORT.json`  |
| BUG_REGISTRY fix-commit completeness                         | local                                                | `pnpm release:check` parser    |
| Storybook builds                                             | `ci.yml` only                                        | GitHub status check            |
| **E2E matrix (5 projects)**                                  | `e2e.yml` only                                       | GitHub status check            |
| **Lighthouse (a11y = 1.0 ERROR + perf/best-practices WARN)** | `lighthouse.yml` only                                | GitHub status check            |
| Cloudflare deploy preview                                    | `deploy.yml` only (gated on `ENABLE_CF_DEPLOY=true`) | Cloudflare Pages dashboard     |

Before tagging, **both signals must be green**: `pnpm release:check`
verdict ∈ {GO, CONDITIONAL GO} **and** the GitHub Actions checks for
`E2E`, `Lighthouse`, and `CI` on the release PR head commit.

The Lighthouse a11y assertion (`accessibility = 1.0` as ERROR in
`lighthouserc.json`) is a **mandatory blocker** that lives only in
the workflow — it is intentionally not duplicated in
`release:check` because rendering Cesium + LH desktop preset takes
~3 min and would 6× the local sweep cost.

## A. Build & static quality

|     | Check                         | Command                        | Source-of-truth    |
| --- | ----------------------------- | ------------------------------ | ------------------ |
| B   | Typecheck passes              | `pnpm typecheck`               | `tsc --noEmit`     |
| B   | Lint passes (max 0 warnings)  | `pnpm lint`                    | ESLint flat config |
| B   | Format passes (touched files) | `pnpm format:check`            | Prettier           |
| B   | Production build succeeds     | `pnpm build`                   | Vite               |
| B   | Storybook builds              | `pnpm build-storybook --quiet` | Storybook          |

## B. Automated tests

|     | Check                                     | Command                | Source-of-truth                          |
| --- | ----------------------------------------- | ---------------------- | ---------------------------------------- |
| B   | Unit + integration suite green            | `pnpm test`            | Vitest, both projects (physics + ui)     |
| B   | Bundle-size budget respected              | `pnpm bundle:size`     | `bundle-size.baseline.json`              |
| A   | E2E matrix green on `main`                | `gh workflow view E2E` | `.github/workflows/e2e.yml` (5 projects) |
| A   | No new skipped test without an issue link | grep `\.skip`          | currently 4, all annotated               |

## C. Validation gates

|     | Check                                                 | Command                                   | Source-of-truth                                            |
| --- | ----------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------- |
| B   | Strict validation gate passes                         | `pnpm validation-report -- --mode=strict` | `docs/VALIDATION_REPORT.json` → `gate.decision === "pass"` |
| B   | All replay fixtures pass                              | (same)                                    | `replay.failed === 0` in JSON                              |
| B   | All golden cases pass                                 | (same)                                    | `golden.failed === 0` in JSON                              |
| A   | Suspicious-but-accepted cases (S3) named individually | (same)                                    | `golden.suspiciousCases[]` + `replay.suspiciousCases[]`    |

The strict gate is the cumulative scientific regression check. Any new
formula touch must keep it at PASS or accompany the change with a new
golden / replay fixture that justifies the diff.

**S3 advisory granularity.** The JSON sidecar emits a structured
`suspiciousCases[]` array per source (replay + golden) carrying
`{ id, title, warningCodes[] }` for every case whose validation
status is `'suspicious'`. The release-readiness script lifts each
entry into a one-line advisory in the summary, e.g.

```
✗ [ADVIS] S3 (suspicious-but-accepted) cases: 1
        G-PHYS-SUSPICIOUS-MW — Mw 11 → suspicious (largest recorded is Mw 9.5) [PHYS_SUSPICIOUS_HIGH]
```

This makes the advisory actionable without grepping the dataset:
the release manager either acknowledges the named case in the
release notes (CONDITIONAL GO) or removes it from the source
(GO). A sudden change in the list across releases is itself a
signal worth investigating.

## D. Scientific / model confidence

|     | Check                                                   | How                                                                                                              |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| B   | No physics formula changed without a co-located test    | `git diff --stat origin/main src/physics/ src/physics/**/*.test.ts` — every touched module has a test next to it |
| B   | New behaviours have a golden or replay entry            | `git diff origin/main src/physics/validation/goldenDataset.ts src/physics/validation/replayFixtures/`            |
| A   | Citation tooltips & glossary still link to real sources | spot-check `docs/SCIENCE.md` for new entries                                                                     |

## E. Custom-input safety

|     | Check                                                   | Source-of-truth                                                                                                          |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| B   | Validator runtime is the boundary on every store setter | `src/store/useAppStore.ts` → `classifyStoreInput<T>` is called by every `set*Input`                                      |
| B   | UI propagates validator errors via `useFieldIssues`     | `src/store/useScenarioValidation.ts` + `src/ui/components/FieldFeedback.tsx`; covered by `useScenarioValidation.test.ts` |
| B   | No safe-run bypass introduced this release              | `git grep -n "simulate(" -- src/store src/ui` returns nothing outside test files                                         |
| A   | Suspicious-status presets documented                    | every `S3` golden case has a `linkedBug` or comment                                                                      |

## F. Geo / rendering confidence

|     | Check                                                                | Command / source                                                                                                                  |
| --- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| B   | Geometry → rendering equivalence tests pass                          | `pnpm vitest run src/scene/globe/geometryRenderingEquivalence.test.ts src/scene/globe/geometryRenderingGlobalEquivalence.test.ts` |
| B   | Antimeridian + polar regimes covered                                 | `geometryRenderingGlobalEquivalence.test.ts` (15 cases)                                                                           |
| A   | No regression on bbox / centroid / feature-count for shipped presets | covered by the two suites above                                                                                                   |

## G. Bug management

|     | Check                                                                    | Source-of-truth                                         |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------- |
| B   | No `B-NNN` row without a fix commit                                      | `docs/BUG_REGISTRY.md` (Fix column ≠ `pending` / empty) |
| B   | Every critical fix has a regression test in `regressionRegistry.test.ts` | `src/physics/validation/regressionRegistry.test.ts`     |
| A   | Known issues classified by `BUG_CLASSIFICATION.md` codes                 | `docs/BUG_REGISTRY.md` (Category column non-empty)      |

## H. Release decision matrix

```
NO-GO
  ⇐ ANY blocker (B) fails
  ⇐ A row in BUG_REGISTRY.md has Fix=`pending` or empty
  ⇐ validation-report --mode=strict exits non-zero
  ⇐ Cumulative regression test (regressionRegistry) fails
  ⇐ Bundle size exceeds budget+tolerance with no documented update

CONDITIONAL GO
  ⇐ All blockers pass AND at least one advisory (A) is amber
  ⇐ Lighthouse perf or best-practices warns (< their thresholds)
  ⇐ E2E matrix has a known-flaky failure already documented in MEMORY
    or in the run summary
  ⇐ A new suspicious-but-accepted golden case appears with a justification

GO
  ⇐ Every blocker passes AND no advisory is amber
  ⇐ pnpm release:check exits 0 with verdict "GO"
```

## Known acceptable risks

These do NOT block a release. Re-evaluate quarterly.

- **Mobile-chrome E2E flake on Linux runners.** Pixel 7 + Chromium on
  GitHub-hosted runners times out occasionally on the `landing → globe`
  flow. Documented in `playwright.config.ts` (90 s CI test budget).
  Track in MEMORY (`nimbus_mobile_chrome_flake.md`).
- **GeoClaw Tier-3 fixtures intentionally absent.** `geoclawComparison.test.ts`
  uses `it.skip` when no fixtures are committed. Tracked in
  `docs/GEOCLAW_SETUP.md`.
- **Cloudflare deploy gated on `ENABLE_CF_DEPLOY=true`.** Until the
  Pages project + secrets are wired, the deploy workflow is a no-op.
  Documented in `.github/workflows/deploy.yml` and
  `RELEASE_CHECKLIST.md` §2.

## Mandatory blockers (cannot be waived)

1. `pnpm validation-report -- --mode=strict` must exit 0.
2. `pnpm test` must pass — no new skipped test without an issue link
   in the test file.
3. Every entry in `docs/BUG_REGISTRY.md` must carry a fix commit
   (no `pending`).
4. Production build must succeed (`pnpm build`).
5. Lighthouse `accessibility` assertion must remain at `1.0` (the
   `lighthouserc.json` policy keeps this an `error`, not a warning).

## Maintenance

When you add a quality gate to CI, add a row here and to
`scripts/release-readiness.ts` in the same change. Don't let this
file drift: it is checked into git for exactly this reason.
