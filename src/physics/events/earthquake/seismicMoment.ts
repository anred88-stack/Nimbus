import type { NewtonMeters } from '../../units.js';
import { Nm } from '../../units.js';

/**
 * Seismic moment M₀ (N·m) of an earthquake from its moment magnitude Mw,
 * per Hanks & Kanamori (1979):
 *
 *     M₀ = 10^(1.5·Mw + 9.1)      (SI units, M₀ in N·m)
 *
 * This is the SI form of the original Hanks–Kanamori relation (which
 * used dyne·cm). Mw is defined so that a unit increase multiplies M₀
 * by ≈31.6× — the "factor-of-32 per magnitude" rule-of-thumb that
 * appears in every seismology primer.
 *
 * Source: Hanks & Kanamori (1979), "A moment magnitude scale", JGR
 * 84(B5), pp. 2348–2350. DOI: 10.1029/JB084iB05p02348.
 */
export function seismicMomentFromMagnitude(magnitude: number): NewtonMeters {
  return Nm(10 ** (1.5 * magnitude + 9.1));
}

/**
 * Inverse of {@link seismicMomentFromMagnitude}:
 *
 *     Mw = (log₁₀(M₀) − 9.1) / 1.5
 *
 * Source: Hanks & Kanamori (1979), Eq. 8.
 */
export function momentMagnitudeFromSeismicMoment(moment: NewtonMeters): number {
  return (Math.log10(moment) - 9.1) / 1.5;
}
