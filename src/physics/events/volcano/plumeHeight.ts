import { DRE_DENSITY } from '../../constants.js';
import type { KilogramPerCubicMeter, Meters } from '../../units.js';
import { m } from '../../units.js';

/**
 * Mastin et al. (2009) H ∝ V̇^0.241 coefficient (volume-rate form).
 * The published Eq. 1 of the paper reads H_km = 2.00 · V̇_m³/s^0.241
 * for an "average" Plinian eruption, with ~±50 % scatter across the
 * dataset. The coefficient is exported so callers can apply their
 * own calibration if they want to.
 */
export const MASTIN_2009_COEFFICIENT = 2.0;
export const MASTIN_2009_EXPONENT = 0.241;

export interface PlumeHeightInput {
  /** Volume eruption rate V̇ (m³/s), volumes measured as DRE. */
  volumeEruptionRate: number;
  /** Surface gravity — unused by Mastin 2009 but reserved for future
   *  extensions that scale with g on non-Earth bodies. */
  surfaceGravity?: number;
}

/**
 * Plinian-plume height above the vent from the Mastin et al. (2009)
 * empirical scaling:
 *
 *     H = 2.00 · V̇^0.241       (H in km, V̇ in m³/s)
 *
 * Fitted against 34 historical eruptions ranging over six orders of
 * magnitude in mass eruption rate. Reproduces the Krakatoa-class
 * (V̇ ≈ 2 × 10⁵ m³/s) ≈ 38 km plume and the Mt. St. Helens 1980
 * (V̇ ≈ 4 × 10³ m³/s) ≈ 14 km plume to within the ±30 % scatter band
 * documented in the paper.
 *
 * Source: Mastin, Guffanti, Servranckx, Webley, Barsotti, Dean,
 * Durant, Ewert, Neri, Rose, Schneider, Siebert, Stunder, Swanson,
 * Tupper, Volentik & Waythomas (2009), "A multidisciplinary effort
 * to assign realistic source parameters to models of volcanic
 * ash-cloud transport and dispersion during eruptions",
 * J. Volcanol. Geotherm. Res. 186(1-2), pp. 10–21, Eq. 1.
 * DOI: 10.1016/j.jvolgeores.2009.01.008.
 */
export function plumeHeight(input: PlumeHeightInput): Meters {
  const heightKm = MASTIN_2009_COEFFICIENT * input.volumeEruptionRate ** MASTIN_2009_EXPONENT;
  return m(heightKm * 1_000);
}

/**
 * Inverse of {@link plumeHeight}: the Mastin 2009 volume-rate that
 * sustains a column of the requested height above vent.
 *
 *     V̇ = (H / 2.00)^(1 / 0.241)
 */
export function volumeEruptionRateFromPlume(plumeHeight: Meters): number {
  const heightKm = (plumeHeight as number) / 1_000;
  return (heightKm / MASTIN_2009_COEFFICIENT) ** (1 / MASTIN_2009_EXPONENT);
}

/**
 * Convenience: mass eruption rate (kg/s) from Mastin 2009 volume rate,
 * using the DRE density as the conversion factor (default 2 500 kg/m³).
 */
export function massEruptionRateFromPlume(
  plumeHeight: Meters,
  density: KilogramPerCubicMeter = DRE_DENSITY
): number {
  return volumeEruptionRateFromPlume(plumeHeight) * (density as number);
}
