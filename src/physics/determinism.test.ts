import { describe, expect, it } from 'vitest';
import { simulateEarthquake, EARTHQUAKE_PRESETS } from './events/earthquake/index.js';
import { simulateExplosion, EXPLOSION_PRESETS } from './events/explosion/index.js';
import { simulateLandslide, LANDSLIDE_PRESETS } from './events/landslide/index.js';
import { simulateVolcano, VOLCANO_PRESETS } from './events/volcano/index.js';
import { IMPACT_PRESETS, simulateImpact } from './simulate.js';

/**
 * End-to-end reproducibility contract for every event type.
 *
 * The audit (NUM-002 / shareable-URL contract) requires that running
 * the simulator twice with the same input must produce bit-identical
 * output. The shareable URL feature relies on this: a recipient who
 * pastes the URL must see exactly the percentiles the sender saw.
 *
 * This file pins that contract for the deterministic kernels (no MC).
 * Each preset is run twice, and the two outputs are compared with
 * exact equality. Any randomness, mutable global state, or order-
 * dependent floating-point reduction will surface here as a flake.
 *
 * Note: the Monte-Carlo wrappers add a separate "same seed = same
 * percentiles" contract — see {@link ./montecarlo/coverage.test.ts}.
 */

function deepEqualNumbers(a: unknown, b: unknown, path: string[] = []): void {
  if (typeof a === 'number' || typeof b === 'number') {
    if (!Object.is(a, b)) {
      throw new Error(`Output diverged at ${path.join('.')}: ${String(a)} vs ${String(b)}`);
    }
    return;
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    if (a !== b) {
      throw new Error(`Output diverged at ${path.join('.')}: ${String(a)} vs ${String(b)}`);
    }
    return;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      throw new Error(`Array vs non-array at ${path.join('.')}`);
    }
    if (a.length !== b.length) {
      throw new Error(
        `Array length differs at ${path.join('.')}: ${a.length.toString()} vs ${b.length.toString()}`
      );
    }
    for (let i = 0; i < a.length; i++) {
      deepEqualNumbers(a[i], b[i], [...path, `[${i.toString()}]`]);
    }
    return;
  }
  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.length !== keysB.length || keysA.some((k, i) => k !== keysB[i])) {
    throw new Error(
      `Object keys differ at ${path.join('.')}: ${keysA.join(',')} vs ${keysB.join(',')}`
    );
  }
  for (const k of keysA) {
    deepEqualNumbers((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], [
      ...path,
      k,
    ]);
  }
}

describe('determinism — impact pipeline', () => {
  for (const id of Object.keys(IMPACT_PRESETS) as (keyof typeof IMPACT_PRESETS)[]) {
    it(`${id} produces bit-identical output across two runs`, () => {
      const a = simulateImpact(IMPACT_PRESETS[id].input);
      const b = simulateImpact(IMPACT_PRESETS[id].input);
      expect(() => deepEqualNumbers(a, b)).not.toThrow();
    });
  }
});

describe('determinism — explosion pipeline', () => {
  for (const id of Object.keys(EXPLOSION_PRESETS) as (keyof typeof EXPLOSION_PRESETS)[]) {
    it(`${id} produces bit-identical output across two runs`, () => {
      const a = simulateExplosion(EXPLOSION_PRESETS[id].input);
      const b = simulateExplosion(EXPLOSION_PRESETS[id].input);
      expect(() => deepEqualNumbers(a, b)).not.toThrow();
    });
  }
});

describe('determinism — earthquake pipeline', () => {
  for (const id of Object.keys(EARTHQUAKE_PRESETS) as (keyof typeof EARTHQUAKE_PRESETS)[]) {
    it(`${id} produces bit-identical output across two runs`, () => {
      const a = simulateEarthquake(EARTHQUAKE_PRESETS[id].input);
      const b = simulateEarthquake(EARTHQUAKE_PRESETS[id].input);
      expect(() => deepEqualNumbers(a, b)).not.toThrow();
    });
  }
});

describe('determinism — volcano pipeline', () => {
  for (const id of Object.keys(VOLCANO_PRESETS) as (keyof typeof VOLCANO_PRESETS)[]) {
    it(`${id} produces bit-identical output across two runs`, () => {
      const a = simulateVolcano(VOLCANO_PRESETS[id].input);
      const b = simulateVolcano(VOLCANO_PRESETS[id].input);
      expect(() => deepEqualNumbers(a, b)).not.toThrow();
    });
  }
});

describe('determinism — landslide pipeline', () => {
  for (const id of Object.keys(LANDSLIDE_PRESETS) as (keyof typeof LANDSLIDE_PRESETS)[]) {
    it(`${id} produces bit-identical output across two runs`, () => {
      const a = simulateLandslide(LANDSLIDE_PRESETS[id].input);
      const b = simulateLandslide(LANDSLIDE_PRESETS[id].input);
      expect(() => deepEqualNumbers(a, b)).not.toThrow();
    });
  }
});
