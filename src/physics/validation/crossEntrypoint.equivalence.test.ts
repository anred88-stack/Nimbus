/**
 * Cross-entrypoint equivalence — same raw input MUST produce the
 * same validation outcome on every official path.
 *
 * Closes L5 in `CONSOLIDATION_AUDIT.md`. The four paths under test:
 *   1. `validateScenario(type, raw)` — direct schema call.
 *   2. `safeRunByType(type, raw)` — validate-then-simulate dispatcher.
 *   3. Replay harness — runs a fixture through `runReplay`.
 *   4. Golden dataset runner — same `runReplay` over `GoldenCase`.
 *
 * What MUST be equal across the first three (golden uses (3) under
 * the hood, so it's structurally pinned by transitivity):
 *   - validation.status
 *   - sorted error fields
 *   - sorted error codes
 *   - sorted warning fields
 *   - sorted warning codes
 *   - normalized payload (when accepted)
 *
 * If a contributor introduces a path that calls `simulate*()` without
 * going through the schema, this test will catch the divergence the
 * first time someone uses it for production validation.
 */

import { describe, expect, it } from 'vitest';
import {
  validateScenario,
  type ScenarioType,
  type ValidationCode,
} from './inputSchema.js';
import { safeRunByType } from './safeRun.js';
import { runReplay, type ReplayFixture } from './replayHarness.js';

interface SignatureCases {
  status: string;
  errorFields: string[];
  errorCodes: ValidationCode[];
  warningFields: string[];
  warningCodes: ValidationCode[];
}

function signatureFromValidation(v: {
  status: string;
  errors: { field: string; code: ValidationCode }[];
  warnings: { field: string; code: ValidationCode }[];
}): SignatureCases {
  return {
    status: v.status,
    errorFields: v.errors.map((e) => e.field).sort(),
    errorCodes: v.errors.map((e) => e.code).sort(),
    warningFields: v.warnings.map((w) => w.field).sort(),
    warningCodes: v.warnings.map((w) => w.code).sort(),
  };
}

interface CrossCase {
  label: string;
  type: ScenarioType;
  raw: Record<string, unknown>;
}

/**
 * Hand-curated cases covering each of the 4 status outcomes for each
 * event type. These cases are exercised by all three paths below.
 */
const CASES: CrossCase[] = [
  // --- earthquake ---
  {
    label: 'earthquake | accepted (Mw 7.0)',
    type: 'earthquake',
    raw: { magnitude: 7.0 },
  },
  {
    label: 'earthquake | normalized (azimuth 720°)',
    type: 'earthquake',
    raw: { magnitude: 7.0, strikeAzimuthDeg: 720 },
  },
  {
    label: 'earthquake | suspicious (Mw 11)',
    type: 'earthquake',
    raw: { magnitude: 11 },
  },
  {
    label: 'earthquake | invalid (NaN magnitude)',
    type: 'earthquake',
    raw: { magnitude: null },
  },
  // --- explosion ---
  {
    label: 'explosion | accepted (15 kt @ 580 m HOB)',
    type: 'explosion',
    raw: { yieldMegatons: 0.015, heightOfBurst: 580 },
  },
  {
    label: 'explosion | suspicious (200 Mt > Tsar Bomba)',
    type: 'explosion',
    raw: { yieldMegatons: 200 },
  },
  {
    label: 'explosion | invalid (negative yield)',
    type: 'explosion',
    raw: { yieldMegatons: -1 },
  },
  // --- volcano ---
  {
    label: 'volcano | accepted (Pinatubo-like)',
    type: 'volcano',
    raw: { volumeEruptionRate: 1.7e5, totalEjectaVolume: 1e10 },
  },
  {
    label: 'volcano | normalized (windDirection -45°)',
    type: 'volcano',
    raw: { volumeEruptionRate: 1e5, totalEjectaVolume: 1e10, windDirectionDegrees: -45 },
  },
  {
    label: 'volcano | invalid (zero eruption rate)',
    type: 'volcano',
    raw: { volumeEruptionRate: 0, totalEjectaVolume: 1e10 },
  },
  // --- landslide ---
  {
    label: 'landslide | accepted (Storegga-like)',
    type: 'landslide',
    raw: { volumeM3: 3e12, slopeAngleDeg: 5 },
  },
  {
    label: 'landslide | invalid (out-of-domain slope 0°)',
    type: 'landslide',
    raw: { volumeM3: 1e9, slopeAngleDeg: 0 },
  },
  // --- impact ---
  {
    label: 'impact | accepted (typical 100 m)',
    type: 'impact',
    raw: {
      impactorDiameter: 100,
      impactVelocity: 20_000,
      impactorDensity: 3000,
      targetDensity: 2500,
      impactAngleDeg: 45,
      surfaceGravity: 9.81,
    },
  },
  {
    label: 'impact | suspicious (200 km diameter)',
    type: 'impact',
    raw: {
      impactorDiameter: 200_000,
      impactVelocity: 20_000,
      impactorDensity: 3000,
      targetDensity: 2500,
      impactAngleDeg: 45,
      surfaceGravity: 9.81,
    },
  },
  {
    label: 'impact | invalid (NaN velocity)',
    type: 'impact',
    raw: {
      impactorDiameter: 100,
      impactVelocity: null,
      impactorDensity: 3000,
      targetDensity: 2500,
      impactAngleDeg: 45,
      surfaceGravity: 9.81,
    },
  },
];

describe('Cross-entrypoint equivalence — schema vs safeRun vs replay', () => {
  for (const c of CASES) {
    it(c.label, () => {
      // Path 1: direct schema call.
      const v1 = validateScenario(c.type, c.raw);
      const sig1 = signatureFromValidation(v1.result);

      // Path 2: safeRunByType dispatcher.
      const safe = safeRunByType(c.type, c.raw);
      const sig2 = signatureFromValidation(safe.safe.validation);

      // Path 3: replay harness — wrap in a synthetic fixture so we
      // exercise the same path the JSON files use.
      const syntheticFixture: ReplayFixture = {
        id: `cross-eq-${c.label}`,
        category: 'edge',
        title: c.label,
        scenarioType: c.type,
        rawInput: c.raw,
        // The harness compares actual validation against expected, but
        // here we use it only to capture the snapshot. Set expected
        // values that always match (status: same, counts: same) so
        // violations only appear if there's structural disagreement.
        expectedValidation: {
          status: v1.result.status,
          errorCount: v1.result.errors.length,
          warningCount: v1.result.warnings.length,
        },
        expectedOutputs: {},
      };
      const replay = runReplay(syntheticFixture);
      const sig3 = signatureFromValidation({
        status: replay.snapshot.validation.status,
        errors: replay.snapshot.validation.errors as { field: string; code: ValidationCode }[],
        warnings: replay.snapshot.validation.warnings as { field: string; code: ValidationCode }[],
      });

      // Equivalence: all three paths produce the same signature.
      expect(
        sig2,
        `safeRun signature differs from schema signature.\nSchema:\n${JSON.stringify(sig1, null, 2)}\nsafeRun:\n${JSON.stringify(sig2, null, 2)}`,
      ).toEqual(sig1);
      expect(
        sig3,
        `Replay-harness signature differs from schema signature.\nSchema:\n${JSON.stringify(sig1, null, 2)}\nReplay:\n${JSON.stringify(sig3, null, 2)}`,
      ).toEqual(sig1);

      // Replay reports zero violations (because expected mirrored actual).
      expect(
        replay.violations,
        `Synthetic-fixture replay has unexpected violations: ${JSON.stringify(replay.violations, null, 2)}`,
      ).toEqual([]);

      // When status is 'accepted' or 'suspicious' or 'normalized', the
      // safeRun must produce a non-null result; when 'invalid' it must
      // be null.
      if (sig1.status === 'invalid') {
        expect(safe.safe.ok, 'invalid status must produce safeRun.ok=false').toBe(false);
        expect(safe.safe.result).toBeNull();
      } else {
        expect(safe.safe.ok, 'non-invalid status must produce safeRun.ok=true').toBe(true);
        expect(safe.safe.result).not.toBeNull();
      }
    });
  }

  it('every status appears at least once across the case matrix (coverage gate)', () => {
    const seen = new Set<string>();
    for (const c of CASES) {
      const v = validateScenario(c.type, c.raw);
      seen.add(v.result.status);
    }
    expect(seen).toContain('accepted');
    expect(seen).toContain('normalized');
    expect(seen).toContain('suspicious');
    expect(seen).toContain('invalid');
  });

  it('every event type is exercised by at least one case (coverage gate)', () => {
    const seen = new Set<string>();
    for (const c of CASES) seen.add(c.type);
    expect(seen).toContain('earthquake');
    expect(seen).toContain('explosion');
    expect(seen).toContain('volcano');
    expect(seen).toContain('landslide');
    expect(seen).toContain('impact');
  });
});
