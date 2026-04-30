/**
 * Safe entry point: validate-then-simulate for every event type.
 *
 * Production callers (store setters, CLI, replay harness) should use
 * these wrappers instead of `simulate*()` directly so input validation
 * is guaranteed to run BEFORE any physics calculation.
 *
 * Direct calls to `simulate*()` remain available for legacy unit
 * tests that pin the formula in isolation.
 *
 * Closes B-010 by making validation the documented official path.
 */

import { simulateEarthquake } from '../events/earthquake/simulate.js';
import type { EarthquakeScenarioResult } from '../events/earthquake/simulate.js';
import { simulateExplosion } from '../events/explosion/simulate.js';
import type { ExplosionScenarioResult } from '../events/explosion/simulate.js';
import { simulateVolcano } from '../events/volcano/simulate.js';
import type { VolcanoScenarioResult } from '../events/volcano/simulate.js';
import { simulateLandslide } from '../events/landslide/simulate.js';
import type { LandslideScenarioResult } from '../events/landslide/simulate.js';
import { simulateImpact } from '../simulate.js';
import type { ImpactScenarioResult } from '../simulate.js';
import {
  validateEarthquakeInput,
  validateExplosionInput,
  validateVolcanoInput,
  validateLandslideInput,
  validateImpactInput,
  validateScenario,
  type ValidationResult,
  type ValidatedScenario,
  type ScenarioType,
} from './inputSchema.js';

export interface SafeRunOk<TInput, TResult> {
  ok: true;
  validation: ValidationResult<TInput>;
  result: TResult;
}

export interface SafeRunFail<TInput> {
  ok: false;
  validation: ValidationResult<TInput>;
  result: null;
}

export type SafeRunResult<TInput, TResult> = SafeRunOk<TInput, TResult> | SafeRunFail<TInput>;

function runSafe<TInput, TResult>(
  v: ValidationResult<TInput>,
  run: (input: TInput) => TResult
): SafeRunResult<TInput, TResult> {
  if (v.status === 'invalid' || v.input === null) {
    return { ok: false, validation: v, result: null };
  }
  return { ok: true, validation: v, result: run(v.input) };
}

export function safeRunEarthquake(
  raw: Record<string, unknown>
): SafeRunResult<Parameters<typeof simulateEarthquake>[0], EarthquakeScenarioResult> {
  return runSafe(validateEarthquakeInput(raw), simulateEarthquake);
}

export function safeRunExplosion(
  raw: Record<string, unknown>
): SafeRunResult<Parameters<typeof simulateExplosion>[0], ExplosionScenarioResult> {
  return runSafe(validateExplosionInput(raw), simulateExplosion);
}

export function safeRunVolcano(
  raw: Record<string, unknown>
): SafeRunResult<Parameters<typeof simulateVolcano>[0], VolcanoScenarioResult> {
  return runSafe(validateVolcanoInput(raw), simulateVolcano);
}

export function safeRunLandslide(
  raw: Record<string, unknown>
): SafeRunResult<Parameters<typeof simulateLandslide>[0], LandslideScenarioResult> {
  return runSafe(validateLandslideInput(raw), simulateLandslide);
}

export function safeRunImpact(
  raw: Record<string, unknown>
): SafeRunResult<Parameters<typeof simulateImpact>[0], ImpactScenarioResult> {
  return runSafe(validateImpactInput(raw), simulateImpact);
}

/** Discriminated dispatcher for replay harness. */
export type SafeRunDispatchResult =
  | { type: 'earthquake'; safe: ReturnType<typeof safeRunEarthquake> }
  | { type: 'explosion'; safe: ReturnType<typeof safeRunExplosion> }
  | { type: 'volcano'; safe: ReturnType<typeof safeRunVolcano> }
  | { type: 'landslide'; safe: ReturnType<typeof safeRunLandslide> }
  | { type: 'impact'; safe: ReturnType<typeof safeRunImpact> };

export function safeRunByType(
  type: ScenarioType,
  raw: Record<string, unknown>
): SafeRunDispatchResult {
  switch (type) {
    case 'earthquake':
      return { type, safe: safeRunEarthquake(raw) };
    case 'explosion':
      return { type, safe: safeRunExplosion(raw) };
    case 'volcano':
      return { type, safe: safeRunVolcano(raw) };
    case 'landslide':
      return { type, safe: safeRunLandslide(raw) };
    case 'impact':
      return { type, safe: safeRunImpact(raw) };
  }
}

// Re-exported so callers can import everything from one place.
export { validateScenario };
export type { ValidatedScenario };
