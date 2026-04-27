import type { Joules } from '../../units.js';

/**
 * Seismic-equivalent moment magnitude of an impact from its kinetic energy.
 *
 *     M = 0.67 · log10(E) − 5.87     (E in joules)
 *
 * Source: Schultz & Gault (1975), "Seismic effects from major basin
 * formations on the Moon and Mercury", The Moon 12, pp. 159–177. Adopted
 * by Collins, Melosh & Marcus (2005), Eq. 31, as the default relation for
 * the "Earth Impact Effects Program".
 * DOI: 10.1007/BF00577875 · 10.1111/j.1945-5100.2005.tb00157.x.
 *
 * Only a small fraction (∼10⁻⁴ – 10⁻³) of impact kinetic energy couples
 * into seismic waves; this value is therefore an upper envelope suitable
 * for headline popular-science display, not a drop-in replacement for the
 * observed Mw of a recorded earthquake. Distance-dependent ground motion
 * lives in src/physics/propagation/ alongside USGS ShakeMap relations.
 */
export function seismicMagnitude(energy: Joules): number {
  return 0.67 * Math.log10(energy) - 5.87;
}

/**
 * Modern impact-seismicity estimator based on Teanby & Wookey (2011)
 * "Mars explosion seismology", Earth & Planetary Science Letters 303,
 * 297–307, DOI: 10.1016/j.epsl.2011.01.015. They correlate the seismic
 * moment M₀ with impact kinetic energy through a seismic efficiency k
 * calibrated from underground-nuclear-explosion and meteor-bolide
 * observations:
 *
 *     M₀ = k · E_impact           (k = seismic efficiency)
 *     Mw = (2/3) · log10(M₀) − 6.07   (Hanks & Kanamori 1979)
 *
 * Default k = 1 × 10⁻⁴ sits at the centre of the observed band
 * (10⁻⁵ – 10⁻³) for hypervelocity cratering events. Schultz & Gault's
 * 1975 correlation overshoots the observed Mw of recent large events
 * (Chicxulub, Meteor Crater) by 2 – 3 magnitude units; Teanby & Wookey
 * argues the moment-based k-scaling is the honest upper bound.
 */
export function seismicMagnitudeTeanbyWookey(energy: Joules, seismicEfficiency = 1e-4): number {
  const E = energy as number;
  if (!Number.isFinite(E) || E <= 0) return 0;
  const M0 = seismicEfficiency * E; // seismic moment (N·m)
  return (2 / 3) * Math.log10(M0) - 6.07;
}
