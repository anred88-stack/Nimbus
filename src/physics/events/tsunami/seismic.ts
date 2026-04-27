import { CRUSTAL_RIGIDITY } from '../../constants.js';
import type { FaultType } from '../earthquake/ruptureLength.js';
import { seismicMomentFromMagnitude } from '../earthquake/seismicMoment.js';
import type { Meters } from '../../units.js';
import { m } from '../../units.js';

/**
 * Wells & Coppersmith (1994) "log₁₀(A_km²) = a + b·M" coefficients for
 * **rupture area** (Table 2A). Used here to estimate the fault
 * footprint over which the seismic moment is released.
 */
const WELLS_COPPERSMITH_1994_AREA: Record<FaultType, { a: number; b: number }> = {
  'strike-slip': { a: -3.42, b: 0.9 },
  reverse: { a: -3.99, b: 0.98 },
  normal: { a: -2.87, b: 0.82 },
  all: { a: -3.49, b: 0.91 },
};

/**
 * Dip angle (degrees) used to project the fault slip onto the
 * vertical when the caller doesn't specify one. 20° is the textbook
 * mean for oceanic subduction megathrusts and is a reasonable
 * default for tsunami-generating events.
 */
const DEFAULT_THRUST_DIP_DEG = 20;

export interface SeismicTsunamiInput {
  /** Moment magnitude Mw of the source earthquake. */
  magnitude: number;
  /** Slip regime; defaults to 'reverse' (thrust faults dominate
   *  tsunami-generating earthquakes). */
  faultType?: FaultType;
  /** Dip angle of the fault plane in degrees from horizontal; defaults
   *  to 20°, the textbook subduction-megathrust mean. */
  dipDegrees?: number;
}

/**
 * Initial vertical sea-surface displacement above a co-seismic fault
 * rupture. Decomposes as:
 *
 *   1. Seismic moment   M₀ = 10^(1.5·Mw + 9.1) N·m (Hanks–Kanamori 1979).
 *   2. Rupture area     A  = 10^(a + b·Mw) km²    (Wells–Coppersmith 1994).
 *   3. Average slip     D  = M₀ / (μ · A)         (Aki 1966, μ = 30 GPa).
 *   4. Vertical offset  ΔH = D · sin(dip)         (elastic dislocation).
 *
 * For Mw 9 on a 20° thrust this predicts ΔH ≈ 5–8 m, consistent with
 * the initial free-surface uplift inferred from DART buoy inversions
 * for Tohoku 2011 and Sumatra 2004. Used as the seed amplitude for
 * the propagation/shoaling chain downstream.
 */
export function seismicTsunamiInitialAmplitude(input: SeismicTsunamiInput): Meters {
  const { magnitude, faultType = 'reverse', dipDegrees = DEFAULT_THRUST_DIP_DEG } = input;
  const { a, b } = WELLS_COPPERSMITH_1994_AREA[faultType];
  const areaM2 = 10 ** (a + b * magnitude) * 1e6; // km² → m²
  const moment = seismicMomentFromMagnitude(magnitude) as number;
  const averageSlip = moment / (CRUSTAL_RIGIDITY * areaM2);
  return m(averageSlip * Math.sin((dipDegrees * Math.PI) / 180));
}
