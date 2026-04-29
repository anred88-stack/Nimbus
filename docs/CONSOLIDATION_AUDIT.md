# Validation consolidation audit

Snapshot of where the runtime-validation boundary stands today, and
which paths are still bypassable. Generated as part of the V&V
consolidation batch (see `HARDENING_PLAN.md` for follow-ups).

## Official runtime boundary

The single source of truth for "is this input valid":

- **Schema**: `src/physics/validation/inputSchema.ts`
  → `validateScenario(type, raw)` with 4 states + stable codes.

- **Safe entry points** (validate-then-simulate):
  `src/physics/validation/safeRun.ts`
  → `safeRunEarthquake/Explosion/Volcano/Landslide/Impact` and the
  discriminated dispatcher `safeRunByType`.

## Production callers — fully routed through the boundary

| Caller | Path | Status |
|--------|------|--------|
| Replay harness | `replayHarness.ts` calls `safeRunByType` | ✅ |
| Golden dataset runner | `goldenDataset.test.ts` calls `runReplay` → `safeRunByType` | ✅ |
| Validation report | `scripts/generate-validation-report.ts` runs both above | ✅ |
| Store setters (audit pass) | `auditStoreInput` calls `validateScenario` and logs in dev | ✅ (but see L1 below) |

## Bypassable paths — known and intentional

| Path | Bypass | Severity | Notes |
|------|--------|----------|-------|
| **Direct `simulate*()` calls** | Always permissive — no NaN/Inf gate inside the simulator | LOW | Documented contract: unit tests pinning isolated formulas may call directly. Production code MUST use `safeRun*`. |
| **CLI `pnpm simulate`** (`scripts/simulate-impact.ts`) | Calls `simulateImpact/Explosion/Earthquake/Volcano` directly | **MEDIUM** | Hardened in this batch: now routes custom-input paths through `safeRunByType`; preset paths still call directly because the preset is statically valid. |
| **Web Worker `saintVenantWorker.ts`** | Comlink-exposed Saint-Venant solver receives pre-built parameters | LOW | Caller is the store, which already validates. The worker entry point itself does not re-validate but only consumes structured numeric arrays. |
| **Test files calling `simulate*` directly** | All over the codebase | LOW | Intentional — verification tests pin formulas without going through validation. Listed as L1 latent. |

## Gaps still open after this batch

- **L1 — Inline guards in store setters precede the validator audit pass.**
  Store setters first apply `if (override > 0) next.x = override` and
  THEN call `auditStoreInput(next)`. Invalid inputs are silently
  dropped before the validator can classify them, so:
  - Validator sees only the merged "post-drop" input → never observes
    the original invalid override.
  - The dev-only console.warn never fires for individually-rejected
    fields.
  Impact: observability gap, not a real bypass — input that survives
  the inline guards is also valid for the schema.
  Fix path: refactor `set*Input` to call `validateScenario` on the raw
  override BEFORE merging. Out of scope for this batch (would require
  a coordinated rewrite of 5 setters and the matching UI components).

- **L2 — Replay fixture integrity is not enforced.**
  A malformed JSON in `replayFixtures/` (missing `expectedValidation`,
  unknown `category`, etc.) will crash the runner with an opaque
  TypeError rather than fail with a labelled message.
  Fix in this batch: `replayFixtureIntegrity.test.ts`.

- **L3 — Golden dataset has no uniqueness guarantee.**
  Two cases with the same `id` would both run silently. Fix in this
  batch: `goldenDataset.consistency.test.ts`.

- **L4 — Error/warning codes are TypeScript union types only.**
  No runtime test pins the enum. Renaming `NOT_FINITE` to
  `INVALID_NUMBER` would break every fixture silently. Fix in this
  batch: `validationCodes.stability.test.ts`.

- **L5 — Cross-entrypoint equivalence not pinned.**
  Two paths could drift: `validateScenario('earthquake', x)` and
  `safeRunEarthquake(x)` should always agree on status/errors. Fix in
  this batch: `crossEntrypoint.equivalence.test.ts`.

- **L6 — Validation report has no machine-readable summary or
  explicit gate policy.** Fix in this batch: emit
  `docs/VALIDATION_REPORT.json` alongside the markdown; document
  release-gate policy.

- **L7 — Nested fields not validated**
  (`flankCollapse: { volumeM3, slopeAngleDeg, meanOceanDepth }`).
  Documented in `HARDENING_PLAN.md`, deferred.

## Boundary diagram

```
                ┌─────────────────────┐
                │ inputSchema.ts      │ ← single source of truth
                │ validateScenario()  │   (4 states + stable codes)
                └──────────┬──────────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
       safeRun.ts     auditStoreInput  CLI safeRunByType
            │         (dev observ.)   (this batch)
            │              │              │
            ▼              ▼              ▼
   ┌────────────────────────────────────────┐
   │       simulate*() (per event type)     │ ← permissive, by design
   └────────────────────────────────────────┘
```

Direct `simulate*()` calls remain available — but every PRODUCTION
caller now provably routes through the schema.
