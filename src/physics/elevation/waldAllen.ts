/**
 * Topographic-slope → Vs30 proxy from Wald & Allen (2007),
 * "Topographic Slope as a Proxy for Seismic Site Conditions (Vs30)
 * and Amplification Around the Globe." BSSA 97 (5), 1379–1395.
 * DOI: 10.1785/0120060267.
 *
 * Wald & Allen calibrated a piecewise map between topographic slope
 * (measured on a 30 arc-second DEM) and the NEHRP Vs30 site class
 * boundaries. The physical argument is that competent-rock outcrops
 * tend to form steep topography (high slope, high Vs30) while
 * unconsolidated sediments settle into low-slope basins (soft soil,
 * low Vs30). Empirically this reproduces measured Vs30 to within a
 * factor of ~1.5× for ~70 % of California stations and was adopted
 * by USGS ShakeMap as the default global site model when no
 * borehole data is available.
 *
 * We implement Table 1 of the paper (active-tectonic regions), which
 * covers California, Italy, Japan, and the NGA-West2 calibration
 * regions where the Boore 2014 site term applies cleanly.
 *
 * Regression table (active tectonic regions):
 *
 *   Vs30  (m/s)     slope (m/m)
 *   ─────────────   ──────────────
 *       760         ≥ 0.138          (NEHRP B/C rock)
 *       685         0.098 – 0.138
 *       620         0.071 – 0.098
 *       555         0.051 – 0.071
 *       490         0.036 – 0.051
 *       425         0.025 – 0.036
 *       365         0.017 – 0.025
 *       300         0.012 – 0.017    (NEHRP D/E transition)
 *       240         0.007 – 0.012
 *       180         < 0.007          (NEHRP E, soft soil)
 *
 * The bins are interpreted as a step function; we log-interpolate
 * *within* each bin to avoid visible "staircase" jumps on the UI.
 */

/** Active-tectonic Wald & Allen 2007 Table 1 bins, sorted low-slope
 *  (soft soil) → high-slope (rock). Each entry: [slopeUpper, Vs30]. */
const WALD_ALLEN_2007_TABLE: readonly { slopeMax: number; vs30: number }[] = [
  { slopeMax: 0.007, vs30: 180 },
  { slopeMax: 0.012, vs30: 240 },
  { slopeMax: 0.017, vs30: 300 },
  { slopeMax: 0.025, vs30: 365 },
  { slopeMax: 0.036, vs30: 425 },
  { slopeMax: 0.051, vs30: 490 },
  { slopeMax: 0.071, vs30: 555 },
  { slopeMax: 0.098, vs30: 620 },
  { slopeMax: 0.138, vs30: 685 },
  { slopeMax: Number.POSITIVE_INFINITY, vs30: 760 },
];

/**
 * Estimate Vs30 (m/s) from topographic slope (radians) using Wald &
 * Allen 2007 Table 1 (active-tectonic regime). Input slope is the
 * magnitude of the terrain gradient, typically obtained from the
 * elevation grid's {@link sampleSlope}.
 *
 * The lookup first converts radians → m/m (tan), then log-interpolates
 * between adjacent bins so a slope that sits halfway between two
 * boundaries returns the geometric mean of the corresponding Vs30
 * values. This smooths the step function without losing the bin
 * semantics.
 */
export function waldAllen2007Vs30FromSlope(slopeRad: number): number {
  if (!Number.isFinite(slopeRad) || slopeRad < 0) return 760;
  const slope = Math.tan(slopeRad);
  if (slope <= 0) return 180;

  // Find the bin that contains the slope. Active-tectonic Table 1
  // uses strict upper bounds, so find the first entry where slope <
  // slopeMax.
  for (let i = 0; i < WALD_ALLEN_2007_TABLE.length; i++) {
    const entry = WALD_ALLEN_2007_TABLE[i];
    if (entry === undefined) continue;
    if (slope < entry.slopeMax) {
      if (i === 0) return entry.vs30;
      const prev = WALD_ALLEN_2007_TABLE[i - 1];
      if (prev === undefined) return entry.vs30;
      // Log-interpolate between prev.slopeMax → entry.slopeMax and
      // prev.vs30 → entry.vs30.
      const slopeLog = Math.log(slope);
      const prevLog = Math.log(prev.slopeMax);
      const nextLog = Math.log(entry.slopeMax);
      const t = (slopeLog - prevLog) / (nextLog - prevLog);
      const vs30Log = Math.log(prev.vs30) + t * (Math.log(entry.vs30) - Math.log(prev.vs30));
      return Math.exp(vs30Log);
    }
  }
  return 760;
}

/** NEHRP site-class bins for Vs30 (FEMA 2015 / NEHRP 2003). */
export type NEHRPClass = 'A' | 'B' | 'C' | 'D' | 'E';

export function nehrpClassFromVs30(vs30: number): NEHRPClass {
  if (!Number.isFinite(vs30) || vs30 <= 0) return 'E';
  if (vs30 >= 1_500) return 'A'; // Hard rock
  if (vs30 >= 760) return 'B'; // Rock
  if (vs30 >= 360) return 'C'; // Very dense soil / soft rock
  if (vs30 >= 180) return 'D'; // Stiff soil
  return 'E'; // Soft clay / saturated alluvium
}
