/**
 * Confidence-band metadata for outputs whose published 1σ scatter is
 * large enough that rendering a single sharp number — or a crisp ring
 * on a map — is scientifically misleading.
 *
 * The numerical σ values listed here mirror the OUTPUT_SIGMA dictionary
 * in src/physics/uq/conventions.ts — that module is the single source
 * of truth and carries the per-quantity citation. This file is kept
 * for back-compat with existing callers (`bandFor()` is widely used
 * across the UI); future code should import from `uq/conventions.ts`.
 *
 * The physics modules still emit point estimates; this module only
 * declares the ±σ% band the UI should draw around each value.
 *
 * σ values sourced from the original papers:
 *   - firestormIgnition / firestormSustain : Glasstone & Dolan §7.40,
 *     ±1σ on fluence threshold ≈ 30 %.
 *   - plumeHeight : Mastin 2009 Fig. 2 + Aubry 2023 GRL, ±factor-2
 *     scatter around the median (half-range ≈ 50 %).
 *   - pyroclasticRunout : Sheridan 1979 statistical vs Dade & Huppert
 *     1998 energy-line upper bound; treat the fit as ±70 %.
 *   - ashfallArea1mm : Walker 1980 / Pyle 1989 isopach scaling, ±factor-2.
 *   - laharRunout : Iverson 1997 volume-runout, ±factor-2.
 *   - tsunamiRunup / tsunamiWunnemannFarField : Synolakis 1987 run-up
 *     ±30 %; Wünnemann far-field ±factor-3 at continent range.
 *
 * Each entry is the *half-range* of the band: low = value · (1 − σ),
 * high = value · (1 + σ). For factor-k bands we store σ such that
 * (1 + σ) = k, so "factor-2" is σ = 1.0 (high = 2·value, low = 0).
 */

export type ConfidenceField =
  | 'firestormIgnition'
  | 'firestormSustain'
  | 'plumeHeight'
  | 'pyroclasticRunout'
  | 'ashfallArea'
  | 'laharRunout'
  | 'tsunamiRunup'
  | 'tsunamiWunnemannFarField';

export const CONFIDENCE_SIGMA: Record<ConfidenceField, number> = {
  firestormIgnition: 0.3,
  firestormSustain: 0.3,
  plumeHeight: 0.5,
  pyroclasticRunout: 0.7,
  ashfallArea: 1.0,
  laharRunout: 1.0,
  tsunamiRunup: 0.3,
  tsunamiWunnemannFarField: 2.0,
};

export interface ConfidenceBand {
  value: number;
  low: number;
  high: number;
  sigma: number;
}

/** Wrap a point estimate with its declared confidence band. */
export function bandFor(value: number, field: ConfidenceField): ConfidenceBand {
  const sigma = CONFIDENCE_SIGMA[field];
  if (!Number.isFinite(value) || value <= 0) {
    return { value: 0, low: 0, high: 0, sigma };
  }
  return {
    value,
    low: Math.max(value * (1 - sigma), 0),
    high: value * (1 + sigma),
    sigma,
  };
}
