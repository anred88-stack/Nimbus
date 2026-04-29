/**
 * Hook + selectors that surface the centralized runtime validator's
 * output to React components.
 *
 * Usage:
 *
 *   const v = useScenarioValidation('earthquake');
 *   const fieldIssues = useFieldIssues('earthquake', 'magnitude');
 *
 * Closes H6 in `HARDENING_PLAN.md`. No second validation runs in the
 * UI: the components consume the SAME `validateScenario` output that
 * the store / safeRun / replay-harness use. The validator remains the
 * single source of truth.
 *
 * Note on coverage: the store-setter rejects invalid input at the
 * boundary (B-010 closure), so the input held in `state.<event>.input`
 * is always at least 'normalized'. To surface S1 'invalid' attempts
 * the UI would need pending-value tracking — out of scope for this
 * batch. What this hook DOES surface in real time:
 *   - 'normalized' → field had a normalization warning (azimuth wrap).
 *   - 'suspicious' → physical-plausibility warning (Mw 11, etc.).
 *   - 'accepted' → no issues.
 *
 * Architecture note: the field-filtering / top-issue extraction logic
 * is exported as a pure helper (`pickFieldIssues`) so that tests can
 * exercise it without spinning up React + jsdom. The hooks below are
 * thin React wrappers (useMemo + useAppStore selectors) around the
 * pure helper + the validator.
 */

import { useMemo } from 'react';
import { useAppStore } from './useAppStore.js';
import {
  validateScenario,
  type ValidationCode,
  type ValidationIssue,
  type ValidationResult,
  type ScenarioType,
  type ValidationStatus,
} from '../physics/validation/inputSchema.js';
import type { EarthquakeScenarioInput } from '../physics/events/earthquake/simulate.js';
import type { ExplosionScenarioInput } from '../physics/events/explosion/simulate.js';
import type { VolcanoScenarioInput } from '../physics/events/volcano/simulate.js';
import type { LandslideScenarioInput } from '../physics/events/landslide/simulate.js';
import type { ImpactScenarioInput } from '../physics/simulate.js';

type AnyScenarioInput =
  | EarthquakeScenarioInput
  | ExplosionScenarioInput
  | VolcanoScenarioInput
  | LandslideScenarioInput
  | ImpactScenarioInput;

export interface FieldIssuesView {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  hasError: boolean;
  hasWarning: boolean;
  /** Top issue's message (error first, warning second). `null` when clean. */
  topMessage: string | null;
  /** Top issue's canonical code (preserved for debug + tests). */
  topCode: ValidationCode | null;
}

/**
 * Pure: filter `result` to issues for `field` and pick the top one.
 *
 * Errors take precedence over warnings; within each bucket the first
 * one (validator-emitted order) wins. Field paths use dot-notation
 * (e.g. `flankCollapse.volumeM3`).
 *
 * Exported so tests can exercise the field-filtering contract without
 * a React renderer. The function reads only `errors` / `warnings`, so
 * it is generic over the validated payload type — callers can pass
 * any `ValidationResult<*>` (including the discriminated union from
 * `validateScenario`).
 */
export function pickFieldIssues(
  result: Pick<ValidationResult<unknown>, 'errors' | 'warnings'>,
  field: string
): FieldIssuesView {
  const errors = result.errors.filter((e) => e.field === field);
  const warnings = result.warnings.filter((w) => w.field === field);
  const top = errors[0] ?? warnings[0] ?? null;
  return {
    errors,
    warnings,
    hasError: errors.length > 0,
    hasWarning: warnings.length > 0,
    topMessage: top?.message ?? null,
    topCode: top?.code ?? null,
  };
}

/** Memoised validation of the current store input for `eventType`. */
export function useScenarioValidation(eventType: ScenarioType): ValidationResult<AnyScenarioInput> {
  const earthquake = useAppStore((s) => s.earthquake.input);
  const explosion = useAppStore((s) => s.explosion.input);
  const volcano = useAppStore((s) => s.volcano.input);
  const landslide = useAppStore((s) => s.landslide.input);
  const impact = useAppStore((s) => s.impact.input);

  const input = (() => {
    switch (eventType) {
      case 'earthquake':
        return earthquake;
      case 'explosion':
        return explosion;
      case 'volcano':
        return volcano;
      case 'landslide':
        return landslide;
      case 'impact':
        return impact;
    }
  })();

  return useMemo(() => {
    const dispatched = validateScenario(eventType, input as unknown as Record<string, unknown>);
    // The discriminated-union result narrows by `dispatched.type`, but
    // for the hook's purpose (per-field errors/warnings) we widen to
    // the union — `pickFieldIssues` only reads `.errors` / `.warnings`.
    return dispatched.result;
  }, [eventType, input]);
}

/** All issues (errors + warnings) for a specific field path. */
export function useFieldIssues(eventType: ScenarioType, field: string): FieldIssuesView {
  const v = useScenarioValidation(eventType);
  return pickFieldIssues(v, field);
}

/** Whether the current input is allowed to run a simulation. */
export function useScenarioCanRun(eventType: ScenarioType): boolean {
  const v = useScenarioValidation(eventType);
  return v.status !== 'invalid';
}

/** Aggregate status of the current input. */
export function useScenarioStatus(eventType: ScenarioType): ValidationStatus {
  return useScenarioValidation(eventType).status;
}
