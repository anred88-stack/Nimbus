/**
 * Reference elevation fixtures — hand-assembled pin points from USGS
 * National Map, OpenTopography / SRTM and Japanese GSI DEMs for
 * testing the Wald & Allen slope→Vs30 pipeline against known site
 * classifications. Used by the unit suite to validate the bilinear
 * lookup + slope calculation against realistic numbers without
 * needing to ship a full ETOPO raster.
 *
 * Numbers chosen from:
 *   - USGS NSHMP Vs30 map (California, Northridge epicentre 1994).
 *   - Japanese GSI site-classification map (Kantō plain, Tokyo).
 *   - USGS NSHMP (Icelandic volcanic basalt near Reykjavík).
 *
 * These fixtures are not a DEM — they are single-point realities the
 * test suite can check against without depending on an external
 * asset. The full DEM infrastructure is in {@link ./grid.ts}.
 */

export interface VsSite {
  name: string;
  latitude: number;
  longitude: number;
  /** Expected Vs30 range (m/s) from published site-classification data. */
  expectedVs30Min: number;
  expectedVs30Max: number;
  /** Expected NEHRP class. */
  expectedClass: 'A' | 'B' | 'C' | 'D' | 'E';
  /** Published slope range at the site (m/m). */
  slopeMin: number;
  slopeMax: number;
}

export const REFERENCE_VS30_SITES: VsSite[] = [
  {
    name: 'Northridge, San Fernando Valley (1994 epicentre)',
    latitude: 34.213,
    longitude: -118.537,
    // USGS Vs30 map reports ≈ 300–400 m/s (NEHRP D, alluvial basin).
    expectedVs30Min: 300,
    expectedVs30Max: 500,
    expectedClass: 'C',
    slopeMin: 0.012,
    slopeMax: 0.036,
  },
  {
    name: 'Tokyo, Kantō Plain (soft alluvium)',
    latitude: 35.689,
    longitude: 139.692,
    // GSI Japan site map reports Vs30 ≈ 200–300 m/s in central Tokyo.
    expectedVs30Min: 180,
    expectedVs30Max: 350,
    expectedClass: 'D',
    slopeMin: 0.001,
    slopeMax: 0.015,
  },
  {
    name: 'Reykjavík, Iceland (volcanic basalt rock)',
    latitude: 64.135,
    longitude: -21.895,
    // Icelandic strong-motion catalogue: Vs30 ~ 600–900 on basalt,
    // classed NEHRP B.
    expectedVs30Min: 600,
    expectedVs30Max: 1_000,
    expectedClass: 'B',
    slopeMin: 0.05,
    slopeMax: 0.2,
  },
  {
    name: 'Yosemite Valley wall (granite, very steep)',
    latitude: 37.747,
    longitude: -119.595,
    // USGS NSHMP: granitic hard rock ≈ 900–1 500 m/s.
    expectedVs30Min: 760,
    expectedVs30Max: 1_500,
    expectedClass: 'B',
    slopeMin: 0.2,
    slopeMax: 1.0,
  },
];
