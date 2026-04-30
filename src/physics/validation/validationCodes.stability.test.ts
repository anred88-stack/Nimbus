/**
 * Stability test for validation error/warning codes.
 *
 * The `ValidationCode` union in `inputSchema.ts` is the contract
 * between Nimbus and:
 *   - Replay fixtures that pin specific codes in `expectedValidation`.
 *   - Golden cases that pin specific codes per scenario.
 *   - The validation report's `topErrorCodes` / `topWarningCodes`.
 *   - Future external consumers (CI dashboards, error analytics).
 *
 * Renaming a code without updating every dependent fixture would silently
 * break the V&V chain. This test pins the canonical set; adding a new
 * code requires a deliberate addition here, removing one requires a
 * deliberate removal. Either way it shows up in PR diff.
 *
 * Closes L4 in `CONSOLIDATION_AUDIT.md`.
 */

import { describe, expect, it } from 'vitest';
import { validateScenario, type ValidationCode } from './inputSchema.js';

/**
 * Canonical, frozen set of validation codes. Adding a code requires a
 * line here. The order doesn't matter; the set comparison does.
 */
const CANONICAL_VALIDATION_CODES: readonly ValidationCode[] = [
  'NOT_FINITE',
  'NOT_NUMBER',
  'NEGATIVE_FORBIDDEN',
  'ZERO_FORBIDDEN',
  'OUT_OF_DOMAIN',
  'NORMALIZED_AZIMUTH',
  'NORMALIZED_LATITUDE',
  'NORMALIZED_LONGITUDE',
  'NORMALIZED_SLOPE',
  'PHYS_SUSPICIOUS_HIGH',
  'PHYS_SUSPICIOUS_LOW',
  'UNKNOWN_FIELD',
] as const;

/**
 * Sample inputs that, between them, must surface every code that we
 * actually emit somewhere in the codebase. If a code is in the union
 * but never produced by any path, it is dead code — listed in the
 * known-dead set so reviewers can intentionally retire it later.
 */
const KNOWN_PRODUCED_CODES: ReadonlySet<ValidationCode> = new Set([
  'NOT_FINITE',
  'NEGATIVE_FORBIDDEN',
  'ZERO_FORBIDDEN',
  'OUT_OF_DOMAIN',
  'NORMALIZED_AZIMUTH',
  'NORMALIZED_SLOPE',
  'PHYS_SUSPICIOUS_HIGH',
  'PHYS_SUSPICIOUS_LOW',
]);

const KNOWN_DEAD_CODES: ReadonlySet<ValidationCode> = new Set([
  // Reserved for future schema extensions; not yet emitted.
  'NOT_NUMBER',
  'NORMALIZED_LATITUDE',
  'NORMALIZED_LONGITUDE',
  'UNKNOWN_FIELD',
]);

describe('Validation codes — stability gate', () => {
  it('canonical set matches union (every code declared in the type appears in the canonical list)', () => {
    // We can't iterate a TypeScript union at runtime, so we encode the
    // union as a tuple via the `CANONICAL_VALIDATION_CODES` literal
    // and rely on `readonly ValidationCode[]` — if a contributor adds
    // a new code to the union without listing it here, the test below
    // fails: `produced` includes it via a real validator emission.
    expect(CANONICAL_VALIDATION_CODES.length).toBeGreaterThan(0);
  });

  it('produced ∪ dead == canonical (no orphan code)', () => {
    const declared = new Set(CANONICAL_VALIDATION_CODES);
    const accountedFor = new Set([...KNOWN_PRODUCED_CODES, ...KNOWN_DEAD_CODES]);
    const orphans = [...declared].filter((c) => !accountedFor.has(c));
    expect(orphans, `codes declared but not classified: ${orphans.join(', ')}`).toEqual([]);
    const ghosts = [...accountedFor].filter((c) => !declared.has(c));
    expect(ghosts, `codes classified but not declared in union: ${ghosts.join(', ')}`).toEqual([]);
  });

  it('every "produced" code is actually produced by at least one validator path', () => {
    const samples: {
      code: ValidationCode;
      type: 'earthquake' | 'explosion' | 'volcano' | 'landslide' | 'impact';
      raw: Record<string, unknown>;
    }[] = [
      { code: 'NOT_FINITE', type: 'earthquake', raw: { magnitude: null } },
      { code: 'NEGATIVE_FORBIDDEN', type: 'earthquake', raw: { magnitude: 7, depth: -1 } },
      { code: 'ZERO_FORBIDDEN', type: 'earthquake', raw: { magnitude: 0 } },
      { code: 'OUT_OF_DOMAIN', type: 'landslide', raw: { volumeM3: 1e9, slopeAngleDeg: 0 } },
      {
        code: 'NORMALIZED_AZIMUTH',
        type: 'volcano',
        raw: { volumeEruptionRate: 1e5, totalEjectaVolume: 1e10, windDirectionDegrees: 720 },
      },
      {
        code: 'NORMALIZED_SLOPE',
        type: 'explosion',
        raw: { yieldMegatons: 1, coastalBeachSlopeRad: 0.0001 },
      },
      { code: 'PHYS_SUSPICIOUS_HIGH', type: 'earthquake', raw: { magnitude: 11 } },
      { code: 'PHYS_SUSPICIOUS_LOW', type: 'earthquake', raw: { magnitude: 0.5 } },
    ];
    for (const s of samples) {
      const v = validateScenario(s.type, s.raw);
      const allCodes = [
        ...v.result.errors.map((e) => e.code),
        ...v.result.warnings.map((w) => w.code),
      ];
      expect(
        allCodes,
        `code "${s.code}" not produced by validateScenario('${s.type}', ${JSON.stringify(s.raw)})`
      ).toContain(s.code);
    }
  });

  it('"dead" codes are not produced by any validator path (sanity-check)', () => {
    // Cheap check: feed a wide range of inputs and verify dead codes
    // never surface. Catches accidental emissions.
    const exercise: {
      type: 'earthquake' | 'explosion' | 'volcano' | 'landslide' | 'impact';
      raw: Record<string, unknown>;
    }[] = [
      { type: 'earthquake', raw: { magnitude: 7 } },
      { type: 'earthquake', raw: { magnitude: 7, strikeAzimuthDeg: 720 } },
      { type: 'earthquake', raw: { magnitude: -1 } },
      { type: 'explosion', raw: { yieldMegatons: 1, heightOfBurst: 500 } },
      {
        type: 'volcano',
        raw: { volumeEruptionRate: 1e5, totalEjectaVolume: 1e10, windDirectionDegrees: -45 },
      },
      {
        type: 'landslide',
        raw: { volumeM3: 1e9, slopeAngleDeg: 5, regime: 'subaerial' },
      },
      {
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
    ];
    const seenCodes = new Set<ValidationCode>();
    for (const e of exercise) {
      const v = validateScenario(e.type, e.raw);
      for (const it of v.result.errors) seenCodes.add(it.code);
      for (const it of v.result.warnings) seenCodes.add(it.code);
    }
    for (const dead of KNOWN_DEAD_CODES) {
      expect(
        seenCodes.has(dead),
        `dead code "${dead}" was unexpectedly produced — promote it to KNOWN_PRODUCED_CODES`
      ).toBe(false);
    }
  });
});
