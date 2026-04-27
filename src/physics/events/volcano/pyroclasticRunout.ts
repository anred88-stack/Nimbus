import type { Meters } from '../../units.js';
import { m } from '../../units.js';

/**
 * Mobility coefficient K (km / km) in the simplified runout relation:
 *
 *     L_km = K · V_km³^(1/3)
 *
 * Default K = 10 reproduces the H/L ≈ 0.1 mobility ratio reported for
 * large pyroclastic density currents (Sheridan 1979). With this K
 * the formula gives Mt St Helens 1980 (V ≈ 1.2 km³) → ≈ 11 km runout,
 * Krakatoa 1883 (V ≈ 20 km³) → ≈ 27 km, and Tambora 1815 (V ≈ 140 km³)
 * → ≈ 52 km — all within the ±50 % empirical scatter documented for
 * PDC runout observations.
 */
export const PYROCLASTIC_MOBILITY_COEFFICIENT = 10;

export interface PyroclasticRunoutInput {
  /** Bulk ejecta volume (m³). The runout formula is insensitive to
   *  whether this is DRE or deposited tephra beyond the ~2× scatter
   *  already baked into K. */
  ejectaVolume: number;
  /** Override mobility coefficient K. Defaults to 10 (dense-flow H/L
   *  ≈ 0.1). Use a lower value for valley-fill flows with aggressive
   *  interaction, higher for long-runout ignimbrites. */
  mobilityCoefficient?: number;
}

/**
 * Maximum runout distance of a collapse-driven pyroclastic density
 * current, using the H/L ≈ 0.1 mobility approximation:
 *
 *     L = K · V^(1/3)        (V in km³, L in km)
 *
 * This is the simplest defensible popular-science form for PDC reach:
 * it reproduces the observed ±30 % envelope for MSH, El Chichón,
 * Krakatoa, and Tambora without asking the user to know the column
 * collapse height or the slope profile. For rigorous hazard mapping,
 * replace with a two-phase Titan2D-style depth-averaged simulation —
 * outside the M3 popular-science scope.
 *
 * Source: Sheridan (1979), "Emplacement of pyroclastic flows: A
 * review", in Ash-Flow Tuffs (GSA Special Paper 180, pp. 125–136),
 * §"The mobility ratio of large flows". Scaling form as applied in
 * downstream reviews (Dade & Huppert 1998; Costa et al. 2014).
 */
export function pyroclasticRunout(input: PyroclasticRunoutInput): Meters {
  const K = input.mobilityCoefficient ?? PYROCLASTIC_MOBILITY_COEFFICIENT;
  const volumeKm3 = input.ejectaVolume / 1e9;
  if (volumeKm3 <= 0) return m(0);
  const lengthKm = K * volumeKm3 ** (1 / 3);
  return m(lengthKm * 1_000);
}
