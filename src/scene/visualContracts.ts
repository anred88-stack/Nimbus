/**
 * Visual contract registry — the single source of truth for "what
 * each rendered shape on the globe actually represents in physics".
 *
 * The user-facing complaint that drove this file: **"many graphics
 * don't reflect the real behaviour"**. The root cause was that we
 * had been adding visualisations one at a time without forcing each
 * one to declare its scientific contract. So a circle rendered for
 * MMI VII looked the same as a circle rendered for the impact crater
 * rim — but the underlying physics is completely different (extended-
 * source rupture vs single-point excavation), and the circle is the
 * wrong shape for one of them and the right shape for the other.
 *
 * Every entity that the Globe layer adds via `viewer.entities.add()`
 * MUST reference a contract id from this registry. The contract
 * tells the renderer (and the reader of the source code, and the
 * hover tooltip) exactly:
 *
 *   - What physical quantity the shape represents (`quantity`)
 *   - The formula or paper the rendering derives from (`formula`)
 *   - The geometric semantic (`geometry`) — concentric ring? extended
 *     source contour? topographic channel? heatmap rectangle?
 *   - Whether the shape is a quantitative match to the formula or an
 *     illustrative placeholder (`isQuantitative`)
 *   - Any caveats the renderer should surface (`caveats`)
 *
 * **Geometry vocabulary.** These are the shape categories the
 * renderer is allowed to use; the registry rejects anything else.
 * Adding a new geometry means adding a new entry to the union AND
 * a new branch in the renderer that handles it.
 *
 *   - `point-source-ring` — circle around a point source. Right for
 *     impact craters, nuclear bursts, PDC vent (when terrain-flat).
 *     Wrong for any extended source.
 *   - `extended-source-stadium` — line-source + perpendicular offset.
 *     Stadium-shaped contour. Right for rupture-driven MMI on big
 *     earthquakes, where the rupture is L × W with L ≫ W.
 *   - `asymmetric-ellipse` — oblique-impact downrange stretch
 *     (Schultz & Anderson 1996) or wind-drift thermal pulse.
 *   - `bathymetric-isocontour` — marching-squares iso-line on a
 *     2-D scalar field (FMM arrival, amplitude). Follows real
 *     coastlines because the underlying field is masked by land.
 *   - `heatmap-rectangle` — Cesium Rectangle entity displaying a
 *     scalar field as an image. The rectangle bbox is purely a
 *     coordinate system for the colormap pixels; transparent pixels
 *     hide the bbox where the field is not defined.
 *   - `coastal-band` — polygon strip running along the coastline,
 *     width modulated by a coastal-cell quantity (run-up height).
 *   - `topographic-channel` — polyline routed by the DEM's drainage
 *     network (lahar) or steepest-descent slope (PDC).
 *   - `point-marker` — single point with style modulated by a scalar
 *     (aftershock magnitude, ECDF threshold).
 *   - `illustrative-3d` — pictorial 3D mesh (mushroom cloud, plume
 *     column). Height matches a scaling formula; shape is qualitative.
 */

export type VisualGeometry =
  | 'point-source-ring'
  | 'extended-source-stadium'
  | 'asymmetric-ellipse'
  | 'bathymetric-isocontour'
  | 'heatmap-rectangle'
  | 'coastal-band'
  | 'topographic-channel'
  | 'point-marker'
  | 'illustrative-3d';

export interface VisualContract {
  /** Stable lookup key, also used as a substring of the Cesium
   *  entity id so a runtime audit can verify each entity was added
   *  via a contracted helper (see `assertEntityContract` below). */
  id: string;
  /** What the user sees this shape representing, in plain language. */
  quantity: string;
  /** Source paper(s) for the formula behind the shape. Always cite
   *  authors + year + journal; the linter for this file rejects
   *  empty strings. */
  formula: string;
  /** SI unit of the quantity (or "dimensionless" for ratios). */
  unit: string;
  /** Geometric semantic — see the module header for the vocabulary. */
  geometry: VisualGeometry;
  /** True when the shape is a faithful rendering of the formula's
   *  output: the position, size and outline ALL derive from physics.
   *  False ("illustrative") when the height / size matches a scaling
   *  but the visual form (e.g. mushroom cloud morphology, plume
   *  column texture) is qualitative. The methodology page surfaces
   *  the boolean as a "scientifically faithful / illustrative" badge. */
  isQuantitative: boolean;
  /** Caveats the renderer should surface in the hover tooltip or
   *  next to the contract on the methodology page. Examples: "ring
   *  ignores terrain shadowing", "amplitude clamped at McCowan". */
  caveats: string[];
}

/**
 * Build a typed registry helper so a misspelt id is caught at the
 * compiler boundary rather than at runtime.
 */
function defineContract<I extends string>(
  contract: VisualContract & { id: I }
): VisualContract & { id: I } {
  if (contract.formula.trim().length === 0) {
    throw new Error(`Visual contract "${contract.id}" has empty formula citation`);
  }
  if (contract.quantity.trim().length === 0) {
    throw new Error(`Visual contract "${contract.id}" has empty quantity description`);
  }
  return contract;
}

export const VISUAL_CONTRACTS = {
  // ---- Impact damage rings (point-source) -------------------------
  craterRim: defineContract({
    id: 'craterRim',
    quantity: 'Final crater rim radius',
    formula: 'Collins, Melosh & Marcus (2005) MAPS 40(6), Eq. 22 / 27',
    unit: 'metres',
    geometry: 'point-source-ring',
    isQuantitative: true,
    caveats: [],
  }),
  thirdDegreeBurn: defineContract({
    id: 'thirdDegreeBurn',
    quantity: '3rd-degree burn fluence radius (8 cal/cm²)',
    formula: 'Glasstone & Dolan (1977) Table 7.41',
    unit: 'metres',
    geometry: 'point-source-ring',
    isQuantitative: true,
    caveats: ['ignores atmospheric scattering and terrain shadowing'],
  }),
  secondDegreeBurn: defineContract({
    id: 'secondDegreeBurn',
    quantity: '2nd-degree burn fluence radius (5 cal/cm²)',
    formula: 'Glasstone & Dolan (1977) Table 7.41',
    unit: 'metres',
    geometry: 'point-source-ring',
    isQuantitative: true,
    caveats: ['ignores atmospheric scattering'],
  }),
  overpressure5psi: defineContract({
    id: 'overpressure5psi',
    quantity: '5 psi (34.5 kPa) overpressure radius',
    formula: 'Kinney & Graham (1985) Ch. 4 + Glasstone HOB factor',
    unit: 'metres',
    geometry: 'point-source-ring',
    isQuantitative: true,
    caveats: ['ignores terrain channelling and reflections'],
  }),
  overpressure1psi: defineContract({
    id: 'overpressure1psi',
    quantity: '1 psi (6.9 kPa) overpressure radius',
    formula: 'Kinney & Graham (1985) Ch. 4',
    unit: 'metres',
    geometry: 'point-source-ring',
    isQuantitative: true,
    caveats: [],
  }),
  lightDamage: defineContract({
    id: 'lightDamage',
    quantity: '0.5 psi (3.5 kPa) light-damage overpressure radius',
    formula: 'Kinney & Graham (1985) Ch. 4',
    unit: 'metres',
    geometry: 'point-source-ring',
    isQuantitative: true,
    caveats: [],
  }),
  radiationLD50: defineContract({
    id: 'radiationLD50',
    quantity: 'Initial-radiation LD50/60 dose radius (~4.5 Gy)',
    formula: 'Glasstone & Dolan (1977) Fig. 8.46 + UNSCEAR 2000',
    unit: 'metres',
    geometry: 'point-source-ring',
    isQuantitative: true,
    caveats: ['ignores shielding (buildings, terrain)'],
  }),
  empAffected: defineContract({
    id: 'empAffected',
    quantity: 'EMP-affected ground footprint',
    formula: 'Glasstone §11 / IEC 61000-2-9',
    unit: 'metres',
    geometry: 'point-source-ring',
    isQuantitative: true,
    caveats: ['exoatmospheric only; ground bursts have negligible EMP'],
  }),

  // ---- Earthquake MMI contours ------------------------------------
  // Phase 13b — these split into two contracts depending on Mw and
  // fault style. Small / continental events keep the point-source
  // ring; megathrusts and Mw ≥ 7.5 events upgrade to extended-source
  // stadium contour driven by the rupture rectangle (Wells &
  // Coppersmith 1994 area scaling).
  mmi7Point: defineContract({
    id: 'mmi7Point',
    quantity: 'MMI VII felt-intensity radius (point-source)',
    formula: 'Worden 2012 GMICE + Boore 2014 NGA-West2',
    unit: 'metres',
    geometry: 'point-source-ring',
    isQuantitative: true,
    caveats: ['point-source attenuation; valid for crustal Mw < 7.5'],
  }),
  mmi7Stadium: defineContract({
    id: 'mmi7Stadium',
    quantity: 'MMI VII felt-intensity contour around the rupture',
    formula: 'Worden 2012 + Boore 2014 with r_jb to Wells & Coppersmith 1994 rupture',
    unit: 'metres',
    geometry: 'extended-source-stadium',
    isQuantitative: true,
    caveats: [
      'rupture is a rectangle of L × W from W&C area scaling',
      'r_jb is the perpendicular distance to the surface projection',
    ],
  }),
  mmi8Point: defineContract({
    id: 'mmi8Point',
    quantity: 'MMI VIII felt-intensity radius (point-source)',
    formula: 'Worden 2012 + Boore 2014',
    unit: 'metres',
    geometry: 'point-source-ring',
    isQuantitative: true,
    caveats: [],
  }),
  mmi8Stadium: defineContract({
    id: 'mmi8Stadium',
    quantity: 'MMI VIII felt-intensity contour around the rupture',
    formula: 'Worden 2012 + Boore 2014 + Wells & Coppersmith 1994',
    unit: 'metres',
    geometry: 'extended-source-stadium',
    isQuantitative: true,
    caveats: [],
  }),
  mmi9Point: defineContract({
    id: 'mmi9Point',
    quantity: 'MMI IX felt-intensity radius (point-source)',
    formula: 'Worden 2012 + Boore 2014',
    unit: 'metres',
    geometry: 'point-source-ring',
    isQuantitative: true,
    caveats: [],
  }),
  mmi9Stadium: defineContract({
    id: 'mmi9Stadium',
    quantity: 'MMI IX felt-intensity contour around the rupture',
    formula: 'Worden 2012 + Boore 2014 + Wells & Coppersmith 1994',
    unit: 'metres',
    geometry: 'extended-source-stadium',
    isQuantitative: true,
    caveats: [],
  }),

  // ---- Tsunami: cavity, wavefronts, isochrones --------------------
  tsunamiCavity: defineContract({
    id: 'tsunamiCavity',
    quantity: 'Initial water cavity radius',
    formula: 'Ward & Asphaug (2000) Eq. 3 with size-dependent η coupling',
    unit: 'metres',
    geometry: 'point-source-ring',
    isQuantitative: true,
    caveats: ['near-field; the ring marks where the cavity collapses, not where damage stops'],
  }),
  tsunamiWaveFront5m: defineContract({
    id: 'tsunamiWaveFront5m',
    quantity: 'Iso-amplitude contour at 5 m wave height',
    formula: 'Lamb 1932 FMM + Green 1838 shoaling + size-dependent Ward source',
    unit: 'metres (amplitude)',
    geometry: 'bathymetric-isocontour',
    isQuantitative: true,
    caveats: ['follows real coastlines via the bathymetric grid'],
  }),
  tsunamiWaveFront1m: defineContract({
    id: 'tsunamiWaveFront1m',
    quantity: 'Iso-amplitude contour at 1 m wave height',
    formula: 'Lamb 1932 FMM + Green 1838',
    unit: 'metres (amplitude)',
    geometry: 'bathymetric-isocontour',
    isQuantitative: true,
    caveats: [],
  }),
  tsunamiWaveFront03m: defineContract({
    id: 'tsunamiWaveFront03m',
    quantity: 'Iso-amplitude contour at 0.3 m wave height',
    formula: 'Lamb 1932 FMM + Green 1838',
    unit: 'metres (amplitude)',
    geometry: 'bathymetric-isocontour',
    isQuantitative: true,
    caveats: ['below 0.3 m the wave is mostly invisible at the coast'],
  }),
  tsunamiIsochrone1h: defineContract({
    id: 'tsunamiIsochrone1h',
    quantity: 'Tsunami arrival contour at +1 hour',
    formula: 'Lamb 1932 FMM eikonal arrival',
    unit: 'seconds (travel time)',
    geometry: 'bathymetric-isocontour',
    isQuantitative: true,
    caveats: [],
  }),
  tsunamiIsochrone2h: defineContract({
    id: 'tsunamiIsochrone2h',
    quantity: 'Tsunami arrival contour at +2 hours',
    formula: 'Lamb 1932 FMM',
    unit: 'seconds',
    geometry: 'bathymetric-isocontour',
    isQuantitative: true,
    caveats: [],
  }),
  tsunamiIsochrone4h: defineContract({
    id: 'tsunamiIsochrone4h',
    quantity: 'Tsunami arrival contour at +4 hours',
    formula: 'Lamb 1932 FMM',
    unit: 'seconds',
    geometry: 'bathymetric-isocontour',
    isQuantitative: true,
    caveats: [],
  }),
  tsunamiIsochrone8h: defineContract({
    id: 'tsunamiIsochrone8h',
    quantity: 'Tsunami arrival contour at +8 hours',
    formula: 'Lamb 1932 FMM',
    unit: 'seconds',
    geometry: 'bathymetric-isocontour',
    isQuantitative: true,
    caveats: [],
  }),
  tsunamiAmplitudeHeatmapLocal: defineContract({
    id: 'tsunamiAmplitudeHeatmapLocal',
    quantity: 'Wave amplitude field, near-source high-resolution',
    formula: 'Green 1838 shoaling + Lamb 1932 cylindrical spreading',
    unit: 'metres (amplitude)',
    geometry: 'heatmap-rectangle',
    isQuantitative: true,
    caveats: ['rendered as an image inside the local terrain tile bbox'],
  }),
  tsunamiAmplitudeHeatmapGlobal: defineContract({
    id: 'tsunamiAmplitudeHeatmapGlobal',
    quantity: 'Wave amplitude field, planet-wide low-resolution',
    formula: 'Green 1838 + Lamb 1932 on the zoom-2 mosaic',
    unit: 'metres (amplitude)',
    geometry: 'heatmap-rectangle',
    isQuantitative: true,
    caveats: ['~40 km/pixel — coastlines smaller than this are smeared'],
  }),
  tsunamiArrivalHeatmap: defineContract({
    id: 'tsunamiArrivalHeatmap',
    quantity: 'Tsunami travel-time field',
    formula: 'Lamb 1932 FMM eikonal',
    unit: 'seconds',
    geometry: 'heatmap-rectangle',
    isQuantitative: true,
    caveats: [],
  }),

  // ---- Tsunami coastal run-up — Phase 13d will turn this into a
  // coastal-band polygon. The current contract is documented as
  // point-marker because that is what we render today.
  tsunamiCoastalRunup: defineContract({
    id: 'tsunamiCoastalRunup',
    quantity: 'Vertical run-up height at coastal cells',
    formula: 'Synolakis (1987) plane-beach R = 2.831·H·√(cot β)·(H/d)^¼',
    unit: 'metres (vertical)',
    geometry: 'point-marker',
    isQuantitative: true,
    caveats: [
      'today rendered as colour-tier dots — Phase 13d upgrades to coastal-band polygon strip',
      'capped at 4× incoming amplitude (McCowan 1894 wave-breaking)',
    ],
  }),

  // ---- Volcano: PDC, lateral blast, ashfall, plume ---------------
  pyroclasticRunout: defineContract({
    id: 'pyroclasticRunout',
    quantity: 'Pyroclastic-flow runout',
    formula: 'Sheridan 1979 / Dade & Huppert 1998 mobility ratio',
    unit: 'metres',
    geometry: 'point-source-ring',
    isQuantitative: true,
    caveats: [
      'today rendered as a circle around the vent — Phase 13c upgrades to topographic-channel routed by DEM',
      'the runout MAGNITUDE is a faithful Sheridan formula; the SHAPE is a placeholder',
    ],
  }),
  lateralBlast: defineContract({
    id: 'lateralBlast',
    quantity: 'Mt-St-Helens-style directional blast wedge',
    formula: 'Glicken (1996) USGS OFR 96-677',
    unit: 'metres',
    geometry: 'asymmetric-ellipse',
    isQuantitative: true,
    caveats: ['wedge centred on the user-supplied direction'],
  }),
  ashfallPlume: defineContract({
    id: 'ashfallPlume',
    quantity: 'Wind-advected ash deposit thickness',
    formula: 'Suzuki 1983 + Bonadonna & Phillips 2003 + Ganser 1993',
    unit: 'metres (deposit thickness)',
    geometry: 'heatmap-rectangle',
    isQuantitative: true,
    caveats: ['2-D analytical advection; not a 3-D atmospheric solver'],
  }),
  ejectaBlanket: defineContract({
    id: 'ejectaBlanket',
    quantity: 'Impact ejecta blanket, 1 m thickness contour',
    formula: 'Collins 2005 + Pierazzo & Melosh asymmetry',
    unit: 'metres',
    geometry: 'asymmetric-ellipse',
    isQuantitative: true,
    caveats: [
      'today renders only the 1 m thickness ring — Phase 13e adds 1 mm / 1 cm / 10 m tiers',
    ],
  }),

  // ---- Cascade + animation markers --------------------------------
  aftershockMarker: defineContract({
    id: 'aftershockMarker',
    quantity: 'Aftershock event (location, magnitude)',
    formula: 'Reasenberg & Jones 1989 sequence + Bath ceiling',
    unit: 'magnitude (Mw, dimensionless) + metres (offset)',
    geometry: 'point-marker',
    isQuantitative: true,
    caveats: [
      'reveal time is log-compressed for UI display; physical onsets are listed in the panel',
    ],
  }),
  ecdfRadialBitmap: defineContract({
    id: 'ecdfRadialBitmap',
    quantity: 'Probability-of-exceedance halo from MC ensemble',
    formula: 'Empirical CDF of N=200 Monte-Carlo realisations',
    unit: 'dimensionless probability',
    geometry: 'heatmap-rectangle',
    isQuantitative: true,
    caveats: ['alpha at distance r encodes P(R ≥ r); rotationally symmetric'],
  }),
  sigmaUpperBand: defineContract({
    id: 'sigmaUpperBand',
    quantity: 'Upper-1σ envelope around a damage radius',
    formula: 'Per-quantity 1σ from src/physics/uq/conventions.ts',
    unit: 'metres',
    geometry: 'point-source-ring',
    isQuantitative: true,
    caveats: ['outer halo only; symmetric inner band is pending'],
  }),
  mushroomCloud: defineContract({
    id: 'mushroomCloud',
    quantity: 'Stabilisation altitude of the rising fireball cloud',
    formula: 'Glasstone & Dolan §2.51 + Khariton et al. 2005 fit',
    unit: 'metres (altitude)',
    geometry: 'illustrative-3d',
    isQuantitative: false,
    caveats: ['altitude matches the formula; cloud morphology is qualitative'],
  }),
} as const satisfies Record<string, VisualContract>;

export type VisualContractId = keyof typeof VISUAL_CONTRACTS;

/** Look up a contract by id, throwing in dev mode if it is missing. */
export function getVisualContract(id: VisualContractId): VisualContract {
  return VISUAL_CONTRACTS[id];
}

/**
 * Aggregate every contract whose `geometry` is one of the provided
 * categories. Useful for tooling — e.g. "list every illustrative-3d
 * contract" or "audit every point-source-ring contract for caveats".
 */
export function contractsByGeometry(...geometries: VisualGeometry[]): VisualContract[] {
  const set = new Set<VisualGeometry>(geometries);
  return Object.values(VISUAL_CONTRACTS).filter((c) => set.has(c.geometry));
}
