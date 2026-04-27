import type { Meters } from '../../units.js';
import { m } from '../../units.js';

/**
 * Fault slip regimes supported by {@link surfaceRuptureLength}. Use
 * 'all' when the mechanism is unknown or when the caller wants the
 * aggregated Wells–Coppersmith regression.
 */
export type FaultType = 'strike-slip' | 'reverse' | 'normal' | 'all';

/**
 * Wells & Coppersmith (1994) "log₁₀(SRL) = a + b·M" coefficients
 * (Table 2A, Surface Rupture Length). SRL in km, Mw moment magnitude.
 * The relations become optimistic for Mw > 8 (known saturation); the
 * simulator still applies them to keep headline numbers consistent.
 *
 * Source: Wells & Coppersmith (1994), "New empirical relationships
 * among magnitude, rupture length, rupture width, rupture area, and
 * surface displacement", BSSA 84(4), pp. 974–1002.
 */
export const WELLS_COPPERSMITH_1994_SRL: Record<FaultType, { a: number; b: number }> = {
  'strike-slip': { a: -3.55, b: 0.74 },
  reverse: { a: -2.86, b: 0.63 },
  normal: { a: -2.01, b: 0.5 },
  all: { a: -3.22, b: 0.69 },
};

export interface SurfaceRuptureLengthInput {
  /** Moment magnitude Mw. */
  magnitude: number;
  /** Defaults to 'all' (aggregated regression) when omitted. */
  faultType?: FaultType;
}

/**
 * Surface rupture length L (m) from the Wells & Coppersmith (1994)
 * empirical regression against moment magnitude:
 *
 *     log₁₀(SRL_km) = a + b · Mw
 *
 * Input Mw should lie in [4.8, 8.1] for the best-fit regime; outside
 * that range the simulator extrapolates, which Wells–Coppersmith
 * explicitly flag as unreliable but which we still render for the
 * popular-science display envelope.
 */
export function surfaceRuptureLength(input: SurfaceRuptureLengthInput): Meters {
  const { magnitude, faultType = 'all' } = input;
  const { a, b } = WELLS_COPPERSMITH_1994_SRL[faultType];
  const srlKm = 10 ** (a + b * magnitude);
  return m(srlKm * 1_000);
}

/**
 * Megathrust (subduction-interface) rupture-length scaling from
 * Strasser, Arango & Bommer (2010):
 *
 *     log₁₀(L_km) = −2.477 + 0.585 · Mw    (interface events)
 *
 * Wells & Coppersmith over-predicts rupture length at Mw ≥ 8 for
 * subduction interface events because their dataset was
 * continental-crust dominated. Strasser 2010 fits 95 interface +
 * intraslab events (Chile 1960, Alaska 1964, Sumatra 2004, Tōhoku
 * 2011), producing saner estimates for megathrusts. Use this helper
 * when the event is explicitly a subduction-zone thrust.
 *
 * Source: Strasser, F. O., Arango, M. C. & Bommer, J. J. (2010).
 * "Scaling of the source dimensions of interface and intraslab
 * subduction-zone earthquakes with moment magnitude." Seismological
 * Research Letters 81 (6): 941–950. DOI: 10.1785/gssrl.81.6.941.
 */
export function megathrustRuptureLength(magnitude: number): Meters {
  if (!Number.isFinite(magnitude) || magnitude <= 0) return m(0);
  const LkmLog = -2.477 + 0.585 * magnitude;
  return m(10 ** LkmLog * 1_000);
}
