import { describe, expect, it } from 'vitest';
import { computeValueRange } from './heatmap.js';

describe('computeValueRange', () => {
  it('returns the min / max of a finite, positive field', () => {
    const samples = new Float32Array([1, 5, 10, 20, 40, 100]);
    const r = computeValueRange(samples);
    expect(r.valueMin).toBe(1);
    expect(r.valueMax).toBe(100);
  });

  it('respects caller-supplied overrides and echoes them unchanged', () => {
    const samples = new Float32Array([1, 5, 10, 20, 40, 100]);
    const r = computeValueRange(samples, Number.NEGATIVE_INFINITY, 0, 50);
    expect(r.valueMin).toBe(0);
    expect(r.valueMax).toBe(50);
  });

  it('returns {0, 0} for a uniform (degenerate) field so callers can detect it', () => {
    const r = computeValueRange(new Float32Array(6).fill(42));
    expect(r.valueMin).toBe(0);
    expect(r.valueMax).toBe(0);
  });

  it('returns {0, 0} for an all-transparent field', () => {
    const r = computeValueRange(new Float32Array([0, 0, 0]), 0);
    expect(r.valueMin).toBe(0);
    expect(r.valueMax).toBe(0);
  });

  it('ignores cells at or below transparentBelow', () => {
    // Three 0s (transparent) + three hits — should only use the hits.
    const samples = new Float32Array([0, 0, 0, 10, 20, 40]);
    const r = computeValueRange(samples, 0);
    expect(r.valueMin).toBe(10);
    expect(r.valueMax).toBe(40);
  });

  it('filters out Infinity (unreachable FMM cells) from the auto-range', () => {
    const samples = new Float32Array([Infinity, 100, 200, 300, Infinity, 400]);
    const r = computeValueRange(samples);
    expect(r.valueMin).toBe(100);
    expect(r.valueMax).toBe(400);
  });

  it('filters NaN defensively', () => {
    const samples = new Float32Array([NaN, 5, 10, NaN]);
    const r = computeValueRange(samples);
    expect(r.valueMin).toBe(5);
    expect(r.valueMax).toBe(10);
  });

  it('mixed user override on one bound, auto on the other', () => {
    // Pin only valueMin=0; let max auto-detect.
    const samples = new Float32Array([100, 200, 500]);
    const r = computeValueRange(samples, Number.NEGATIVE_INFINITY, 0, undefined);
    expect(r.valueMin).toBe(0);
    expect(r.valueMax).toBe(500);
  });
});
