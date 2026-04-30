/**
 * Tests for the locale-aware number formatters.
 *
 * Covers the three contracts the audit required:
 *   1. NaN/Infinity guards return the em-dash placeholder.
 *   2. Rounding-crossing detection in `formatWithUnitTiers` promotes
 *      values like 999.6 m to "1.0 km" instead of rendering as
 *      "1000 m".
 *   3. Locale-aware grouping: en-US uses `,` for thousands and `.`
 *      for decimals; it-IT uses `.` and `,`.
 *
 * The tests force the i18n language explicitly via i18next so they
 * are deterministic regardless of the user's browser locale.
 */

import { afterAll, describe, expect, it, beforeEach } from 'vitest';
import i18n from '../../i18n/index.js';
import {
  NON_FINITE_PLACEHOLDER,
  formatDecimal,
  formatInteger,
  formatScientific,
  formatWithUnitTiers,
  type UnitTier,
} from './numberFormat.js';

const TIERS_METERS: readonly UnitTier[] = [
  { scale: 1, digits: 0, label: 'm' },
  { scale: 1_000, digits: 1, label: 'km' },
];

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

afterAll(async () => {
  await i18n.changeLanguage('en');
});

describe('formatInteger / formatDecimal — non-finite guards', () => {
  it('returns em-dash for NaN', () => {
    expect(formatInteger(Number.NaN)).toBe(NON_FINITE_PLACEHOLDER);
    expect(formatDecimal(Number.NaN, 2)).toBe(NON_FINITE_PLACEHOLDER);
  });

  it('returns em-dash for ±Infinity', () => {
    expect(formatInteger(Number.POSITIVE_INFINITY)).toBe(NON_FINITE_PLACEHOLDER);
    expect(formatInteger(Number.NEGATIVE_INFINITY)).toBe(NON_FINITE_PLACEHOLDER);
    expect(formatDecimal(Number.POSITIVE_INFINITY, 1)).toBe(NON_FINITE_PLACEHOLDER);
  });

  it('does NOT return em-dash for legitimate zero', () => {
    expect(formatInteger(0)).not.toBe(NON_FINITE_PLACEHOLDER);
    expect(formatDecimal(0, 2)).not.toBe(NON_FINITE_PLACEHOLDER);
  });
});

describe('formatInteger — locale-aware grouping', () => {
  it('en-US uses comma thousands', async () => {
    await i18n.changeLanguage('en');
    expect(formatInteger(1_234_567)).toBe('1,234,567');
  });

  it('it-IT uses dot thousands', async () => {
    await i18n.changeLanguage('it');
    expect(formatInteger(1_234_567)).toBe('1.234.567');
  });

  it('uses Unicode minus, not ASCII hyphen, for negatives', async () => {
    await i18n.changeLanguage('en');
    const out = formatInteger(-1234);
    expect(out).toContain('−'); // U+2212
    expect(out.startsWith('-')).toBe(false); // not U+002D
  });
});

describe('formatDecimal — locale-aware decimal separator', () => {
  it('en-US uses period as decimal separator', async () => {
    await i18n.changeLanguage('en');
    expect(formatDecimal(3.14159, 2)).toBe('3.14');
  });

  it('it-IT uses comma as decimal separator', async () => {
    await i18n.changeLanguage('it');
    expect(formatDecimal(3.14159, 2)).toBe('3,14');
  });

  it('respects the digits parameter (no auto-trim)', async () => {
    await i18n.changeLanguage('en');
    expect(formatDecimal(1.5, 3)).toBe('1.500');
  });
});

describe('formatScientific — Unicode mantissa minus + superscript exponent', () => {
  it('zero is rendered as plain "0", not "0 × 10⁰"', () => {
    expect(formatScientific(0)).toBe('0');
  });

  it('positive value renders mantissa + Unicode superscript exponent', async () => {
    await i18n.changeLanguage('en');
    expect(formatScientific(1234.5, 2)).toBe('1.23 × 10³');
  });

  it('negative value uses Unicode minus on mantissa', async () => {
    await i18n.changeLanguage('en');
    const out = formatScientific(-0.0042, 2);
    expect(out.startsWith('−')).toBe(true);
    expect(out).not.toMatch(/^-/); // not ASCII hyphen
  });

  it('negative exponent uses Unicode superscript minus', async () => {
    await i18n.changeLanguage('en');
    expect(formatScientific(0.001, 2)).toContain('⁻³');
  });

  it('non-finite returns em-dash', () => {
    expect(formatScientific(Number.NaN)).toBe(NON_FINITE_PLACEHOLDER);
    expect(formatScientific(Number.POSITIVE_INFINITY)).toBe(NON_FINITE_PLACEHOLDER);
  });

  it('Italian locale changes mantissa decimal separator', async () => {
    await i18n.changeLanguage('it');
    expect(formatScientific(1234.5, 2)).toBe('1,23 × 10³');
  });
});

describe('formatWithUnitTiers — rounding-crossing detection', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('999.6 m promotes to 1.0 km, not 1000 m (the audit bug)', () => {
    expect(formatWithUnitTiers(999.6, TIERS_METERS)).toBe('1.0 km');
  });

  it('500 m stays in meters', () => {
    expect(formatWithUnitTiers(500, TIERS_METERS)).toBe('500 m');
  });

  it('999.49 m stays in meters (rounds DOWN to 999, no promotion)', () => {
    expect(formatWithUnitTiers(999.49, TIERS_METERS)).toBe('999 m');
  });

  it('1500 m → 1.5 km', () => {
    expect(formatWithUnitTiers(1500, TIERS_METERS)).toBe('1.5 km');
  });

  it('non-finite returns em-dash', () => {
    expect(formatWithUnitTiers(Number.NaN, TIERS_METERS)).toBe(NON_FINITE_PLACEHOLDER);
  });

  it('falls back to last tier when value exceeds even that tier', () => {
    // 50 000 km is way past the per-tier 1000 boundary at every tier.
    // Should still emit a value using the largest unit.
    const out = formatWithUnitTiers(50_000_000, TIERS_METERS);
    expect(out).toContain('km');
    expect(out).not.toBe(NON_FINITE_PLACEHOLDER);
  });

  it('multi-tier promotion chain (canonical = Mt, downstream = kt, t)', () => {
    // Mirror of `TIERS_MEGATONS` in SimulatorPanel: canonical unit is
    // Mt, so 1 t = 1e-6 Mt and 1 kt = 1e-3 Mt.
    const tiers: UnitTier[] = [
      { scale: 1e-6, digits: 0, label: 't' },
      { scale: 1e-3, digits: 1, label: 'kt' },
      { scale: 1, digits: 2, label: 'Mt' },
    ];
    // 0.0005 Mt = 500 t — rounded to integer in the t tier
    expect(formatWithUnitTiers(0.0005, tiers)).toBe('500 t');
    // 0.015 Mt = 15 kt
    expect(formatWithUnitTiers(0.015, tiers)).toBe('15.0 kt');
    // 0.05 Mt = 50 kt
    expect(formatWithUnitTiers(0.05, tiers)).toBe('50.0 kt');
    // 1.5 Mt — stays in the canonical tier
    expect(formatWithUnitTiers(1.5, tiers)).toBe('1.50 Mt');
  });
});

describe('rounding-crossing — the specific audit case', () => {
  it('values that previously rounded across the 1000-m boundary now switch unit', async () => {
    await i18n.changeLanguage('en');
    // Boundary cases the audit flagged. Each one previously rendered
    // as "1000 m" because `.toFixed(0)` rounds up before the
    // boundary check. The tier formatter rounds first, then evaluates.
    expect(formatWithUnitTiers(999.5, TIERS_METERS)).toBe('1.0 km');
    expect(formatWithUnitTiers(999.95, TIERS_METERS)).toBe('1.0 km');
    expect(formatWithUnitTiers(1000, TIERS_METERS)).toBe('1.0 km');
  });
});
