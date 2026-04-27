import { describe, expect, it } from 'vitest';
import { buildExceedanceProbability } from '../physics/uq/ecdf.js';
import { renderRadialEcdfBitmap } from './radialEcdfBitmap.js';

/**
 * Canvas / Cesium pixel-buffer paths only run in a real browser
 * (jsdom does not implement HTMLCanvasElement.getContext). The unit
 * tests here cover the pure paths: empty-ECDF guard and the
 * publicly-observable invariants on the half-edge return value.
 * The full bitmap path is exercised end-to-end by the Globe
 * integration via Playwright in tests/e2e/.
 */

describe('renderRadialEcdfBitmap — guard paths', () => {
  it('returns null on an empty ECDF', () => {
    const ecdf = buildExceedanceProbability([]);
    expect(renderRadialEcdfBitmap(ecdf)).toBeNull();
  });

  it('returns null when the largest sample is 0', () => {
    const ecdf = buildExceedanceProbability([0, 0, 0]);
    expect(renderRadialEcdfBitmap(ecdf)).toBeNull();
  });
});
