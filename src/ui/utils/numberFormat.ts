/**
 * Locale-aware number formatting helpers for the UI layer.
 *
 * Closes two display-layer gaps surfaced by the math-and-rendering
 * audit:
 *
 *   1. **NaN/Infinity hygiene.** Every helper guards against
 *      non-finite input and returns the typographic em-dash
 *      placeholder `—` (U+2014) instead of "NaN" or "Infinity".
 *      A simulation that produced NaN is a bug that must surface,
 *      but the user must never read the literal string in the UI.
 *
 *   2. **Locale-aware grouping.** Thousands separators follow the
 *      active i18next language: `1.234,56` for `it`, `1,234.56` for
 *      `en`. Reads `i18n.resolvedLanguage` at format time so the
 *      output reacts to a language switch without component reflow.
 *
 *   3. **True minus sign.** `Intl.NumberFormat` emits ASCII
 *      hyphen-minus (`-`, U+002D) for negative numbers; we
 *      post-process to Unicode minus (`−`, U+2212) so the same
 *      glyph is used in display numbers and in mathematical formulas
 *      (which already use U+2212 in `methodologyContent.ts`).
 *
 * The physics layer never imports from here — these helpers are for
 * the display layer only and depend on i18next, which lives outside
 * `src/physics/**`.
 */

import i18n from '../../i18n/index.js';

/** Em-dash placeholder used for non-finite numbers across the app. */
export const NON_FINITE_PLACEHOLDER = '—';

/** Unicode true-minus character (U+2212). */
const UNICODE_MINUS = '−';

/** Resolve the active i18next language to a BCP-47 locale tag. */
export function currentLocale(): string {
  return i18n.resolvedLanguage === 'it' ? 'it-IT' : 'en-US';
}

/** Replace ASCII hyphen-minus with Unicode minus. Safe for
 *  Intl.NumberFormat output, which only uses `-` as the negative
 *  sign (group / decimal separators are locale-specific glyphs that
 *  don't include `-`). */
function withUnicodeMinus(s: string): string {
  return s.replace(/-/g, UNICODE_MINUS);
}

/** Locale-formatted integer with thousands separators and Unicode minus. */
export function formatInteger(n: number): string {
  if (!Number.isFinite(n)) return NON_FINITE_PLACEHOLDER;
  return withUnicodeMinus(
    new Intl.NumberFormat(currentLocale(), {
      maximumFractionDigits: 0,
    }).format(n)
  );
}

/** Locale-formatted decimal with a fixed number of fraction digits. */
export function formatDecimal(n: number, digits: number): string {
  if (!Number.isFinite(n)) return NON_FINITE_PLACEHOLDER;
  return withUnicodeMinus(
    new Intl.NumberFormat(currentLocale(), {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(n)
  );
}

/**
 * Scientific notation with Unicode superscript exponents, e.g.
 *   formatScientific(0)        → "0"
 *   formatScientific(1234.5)   → "1.23 × 10³"   (en-US)
 *   formatScientific(1234.5)   → "1,23 × 10³"   (it-IT)
 *   formatScientific(-0.0042)  → "−4.20 × 10⁻³"
 *   formatScientific(NaN)      → "—"
 *
 * Replaces the previous home-grown `formatScientific` in
 * `SimulatorPanel.tsx` which lacked a NaN guard, used ASCII minus
 * for negative mantissas, and ignored the active locale.
 */
export function formatScientific(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return NON_FINITE_PLACEHOLDER;
  if (n === 0) return '0';
  const exp = Math.floor(Math.log10(Math.abs(n)));
  const mantissa = n / 10 ** exp;
  return `${formatDecimal(mantissa, digits)} × 10${toSuperscript(exp)}`;
}

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '-': '⁻',
};

function toSuperscript(n: number): string {
  return n
    .toString()
    .split('')
    .map((c) => SUPERSCRIPT_DIGITS[c] ?? c)
    .join('');
}

/**
 * Multi-tier unit selector that detects the unit AFTER rounding to
 * avoid the rounding-crossing bug in legacy formatters:
 *
 *   formatKilometres(999.6)  before:  "1000 m"   ← never appears
 *   formatKilometres(999.6)  after:   "1.0 km"
 *
 * Each tier is `{ scale, digits, label }`. The function tries each
 * tier from the smallest unit up, formats the value rounded to that
 * tier's digit count, and accepts the tier as soon as the rounded
 * value is < 1000 in that unit. Falls back to the last tier when
 * none qualify.
 */
export interface UnitTier {
  /** Divide the input by this to get the value in the tier's unit. */
  scale: number;
  /** Number of fraction digits to display. */
  digits: number;
  /** Unit label (already includes any leading space if required). */
  label: string;
}

export function formatWithUnitTiers(value: number, tiers: readonly UnitTier[]): string {
  if (!Number.isFinite(value)) return NON_FINITE_PLACEHOLDER;
  for (const tier of tiers) {
    const scaled = value / tier.scale;
    // Round to the tier's display precision FIRST, then check the
    // boundary. This catches values like 999.6 m that would round to
    // "1000 m" — they correctly promote to the next tier ("1.0 km").
    const rounded = parseFloat(scaled.toFixed(tier.digits));
    if (Math.abs(rounded) < 1000) {
      return `${formatDecimal(scaled, tier.digits)} ${tier.label}`;
    }
  }
  // None qualified: emit the value in the last tier's unit. This
  // happens only at the extreme end of the dynamic range; the caller
  // is expected to clamp earlier (e.g. `clampToGreatCircle`).
  const last = tiers[tiers.length - 1];
  if (!last) return NON_FINITE_PLACEHOLDER;
  return `${formatDecimal(value / last.scale, last.digits)} ${last.label}`;
}
