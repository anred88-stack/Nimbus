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
 * **Uncertainty.** This is a defining identity, not a regression: by
 * construction Mw is the magnitude that satisfies the equation
 * exactly. The ONLY scatter comes from how M₀ itself is observed
 * (long-period CMT inversion ±0.1 in Mw for global events, larger
 * for shallow / local). The forward function below is therefore
 * exact within Float64 round-off — the V&V suite pins the round-trip
 * to `TOL_LOG_IDENTITY = 1e-12` (`tolerances.ts`).
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
 * Exact within Float64 round-off — see {@link seismicMomentFromMagnitude}
 * for the uncertainty discussion.
 *
 * Source: Hanks & Kanamori (1979), Eq. 8.
 */
export function momentMagnitudeFromSeismicMoment(moment: NewtonMeters): number {
  return (Math.log10(moment) - 9.1) / 1.5;
}
