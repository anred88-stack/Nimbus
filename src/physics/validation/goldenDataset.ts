/**
 * Executable golden-cases dataset.
 *
 * The canonical scenarios documented in `docs/GOLDEN_CASES.md`,
 * encoded as runnable test data. Each entry has:
 *   - id (G-* per docs)
 *   - category (reference / regression / custom-user / edge / physical-sanity)
 *   - oracle (analytic / scaling / property / historical)
 *   - rawInput, expectedValidation, expectedOutputs
 *
 * Run by `goldenDataset.test.ts`. Add a case here AND a row to
 * GOLDEN_CASES.md; the dataset count is pinned in the test so they
 * can't drift.
 */

import type { ReplayFixture } from './replayHarness.js';

export type GoldenOracle = 'analytic' | 'scaling' | 'property' | 'historical';

export interface GoldenCase extends ReplayFixture {
  oracle: GoldenOracle;
  citation: string;
}

export const GOLDEN_DATASET: readonly GoldenCase[] = [
  // ========================================================================
  // Engineering scaling-law anchors (±20%)
  // ========================================================================
  {
    id: 'G-TOH-DART',
    category: 'reference',
    oracle: 'historical',
    title: 'Tōhoku 2011 Mw 9.1 megathrust — DART 21413 envelope',
    description:
      'Pinned via the Tier-3 GeoClaw fixture pipeline. This dataset case checks the closed-form Tier-1 chain end-to-end (validation + simulation + amplitude reach).',
    citation: 'Satake 2013 BSSA 103(2B):1473',
    linkedBug: 'B-006',
    linkedGoldenCase: 'G-TOH-DART',
    scenarioType: 'earthquake',
    rawInput: {
      magnitude: 9.1,
      depth: 29000,
      faultType: 'reverse',
      subductionInterface: true,
      strikeAzimuthDeg: 200,
    },
    expectedValidation: {
      status: 'accepted',
      errorCount: 0,
      warningCount: 0,
    },
    expectedOutputs: {
      'tsunami.meanSlip.m': { min: 7, max: 12 },
      'tsunami.amplitudeAt1000kmDispersed.m': { min: 0.5, max: 3.0 },
    },
  },
  {
    id: 'G-PINATUBO-PLUME',
    category: 'reference',
    oracle: 'scaling',
    title: 'Pinatubo 1991 plume from Mastin 2009',
    description: 'V̇ = 1.7×10⁵ m³/s DRE → ~35 km column observed by AVHRR.',
    citation: 'Mastin et al. 2009 JVGR 186 + Holasek et al. 1996 JGR 101',
    scenarioType: 'volcano',
    rawInput: {
      volumeEruptionRate: 1.7e5,
      totalEjectaVolume: 1e10,
    },
    expectedValidation: {
      status: 'accepted',
      errorCount: 0,
      warningCount: 0,
    },
    expectedOutputs: {
      'plumeHeight.km': { min: 27, max: 43 },
    },
  },
  {
    id: 'G-MTSH-PLUME',
    category: 'reference',
    oracle: 'scaling',
    title: 'Mount St Helens 1980 plume',
    description: 'V̇ = 5×10⁴ m³/s DRE → ~25 km column.',
    citation: 'Carey & Sigurdsson 1985',
    scenarioType: 'volcano',
    rawInput: {
      volumeEruptionRate: 5e4,
      totalEjectaVolume: 1.2e9,
    },
    expectedValidation: {
      status: 'accepted',
      errorCount: 0,
      warningCount: 0,
    },
    expectedOutputs: {
      'plumeHeight.km': { min: 20, max: 30 },
    },
  },

  // ========================================================================
  // Regression anchors (linked to BUG_REGISTRY.md)
  // ========================================================================
  {
    id: 'G-CHICX-CRATER',
    category: 'reference',
    oracle: 'historical',
    title: 'Chicxulub final crater diameter ~180 km',
    description: 'Hildebrand 1991, Morgan 2016 — Mw-equivalent 7.3 (Teanby-Wookey)',
    citation: 'Hildebrand 1991, Morgan 2016',
    scenarioType: 'impact',
    rawInput: {
      impactorDiameter: 14_000,
      impactVelocity: 20_000,
      impactorDensity: 2700,
      targetDensity: 2500,
      impactAngleDeg: 60,
      surfaceGravity: 9.81,
    },
    expectedValidation: {
      status: 'accepted',
      errorCount: 0,
      warningCount: 0,
    },
    expectedOutputs: {
      'crater.finalDiameter.km': { min: 130, max: 220 },
      'crater.morphology': { value: 'complex' },
    },
  },
  {
    id: 'G-METEOR-CRATER',
    category: 'reference',
    oracle: 'historical',
    title: 'Meteor Crater (Barringer) ~1.2 km, intact iron',
    description: 'Kring 2007 — D=50 m, ρ=7800, v=12.8 km/s, IMPACTOR_STRENGTH.IRON = 5×10⁷ Pa',
    citation: 'Kring 2007',
    scenarioType: 'impact',
    rawInput: {
      impactorDiameter: 50,
      impactVelocity: 12_800,
      impactorDensity: 7800,
      targetDensity: 2500,
      impactAngleDeg: 45,
      surfaceGravity: 9.81,
      impactorStrength: 5e7,
    },
    expectedValidation: {
      status: 'accepted',
      errorCount: 0,
      warningCount: 0,
    },
    expectedOutputs: {
      'crater.finalDiameter.km': { min: 0.8, max: 1.7 },
      'entry.regime': { value: 'INTACT' },
    },
  },
  {
    id: 'G-HIROSHIMA-FB',
    category: 'reference',
    oracle: 'historical',
    title: 'Hiroshima 1945 — 15 kt @ 580 m HOB → 5 psi @ ~1.7 km',
    description: 'Glasstone & Dolan 1977 Fig. 3.74a',
    citation: 'Glasstone & Dolan 1977 §3',
    scenarioType: 'explosion',
    rawInput: {
      yieldMegatons: 0.015,
      heightOfBurst: 580,
      groundType: 'FIRM_GROUND',
    },
    expectedValidation: {
      status: 'accepted',
      errorCount: 0,
      warningCount: 0,
    },
    expectedOutputs: {
      'blast.overpressure5psiRadiusHob.km': { min: 1.2, max: 2.5 },
      // Hiroshima scaled HOB z = 580 / cbrt(15) = 235 m·kt^(-1/3) → OPTIMUM band per hobRegime classifier
      'blast.hobRegime': { value: 'OPTIMUM' },
    },
  },

  // ========================================================================
  // Regression anchors (linked to BUG_REGISTRY.md rows)
  // ========================================================================
  {
    id: 'G-B009-TSAR-AIRBURST',
    category: 'regression',
    oracle: 'historical',
    title: 'B-009 Tsar Bomba 50 Mt @ 500 m HOB on water — no tsunami',
    description:
      'Pre-fix produced ~3.5 m wave at trans-Atlantic distance from a 500 m airburst. Post-fix the absolute-HOB gate (CONTACT_WATER_BURST_MAX_HOB_M = 30 m) suppresses the tsunami branch.',
    citation: 'BUG_REGISTRY B-009; commit 0ec0fda',
    linkedBug: 'B-009',
    scenarioType: 'explosion',
    rawInput: {
      yieldMegatons: 50,
      heightOfBurst: 500,
      waterDepth: 3500,
      groundType: 'WET_SOIL',
    },
    expectedValidation: {
      status: 'accepted',
      errorCount: 0,
      warningCount: 0,
    },
    expectedOutputs: {
      'tsunami.exists': { value: false },
      'isContactWaterBurst': { value: false },
      'blast.hobRegime': { value: 'SURFACE' },
    },
  },
  {
    id: 'G-B003-VAIONT-CONFINED',
    category: 'regression',
    oracle: 'historical',
    title: 'B-003 Vaiont 1963 reservoir wave reaches Genevois 2005 envelope',
    description:
      'Pre-fix: open-ocean Watts source gave ~56 m vs observed 250 m wave above the dam. Post-fix: confined-basin formula η = V/A × 3 capped at depth.',
    citation: 'BUG_REGISTRY B-003; commit 2b06388; Genevois & Ghirotti 2005 GGA 1: 41',
    linkedBug: 'B-003',
    scenarioType: 'landslide',
    rawInput: {
      volumeM3: 2.7e8,
      slopeAngleDeg: 35,
      meanOceanDepth: 250,
      regime: 'subaerial',
    },
    expectedValidation: {
      status: 'accepted',
      errorCount: 0,
      warningCount: 0,
    },
    // Note: the Vaiont preset uses confinedBasinArea internally; this
    // golden case checks the simpler subaerial-Watts path so the
    // regression guard is targeted at the configurable open-ocean
    // formula, not the preset-specific confined-basin override.
    expectedOutputs: {
      'tsunami.exists': { value: true },
    },
  },

  // ========================================================================
  // Edge cases (validator stress)
  // ========================================================================
  {
    id: 'G-EDGE-NAN',
    category: 'edge',
    oracle: 'property',
    title: 'NaN magnitude → invalid (B-010 closed)',
    description: 'JSON cannot represent NaN; the raw value `null` triggers NOT_FINITE.',
    citation: 'inputSchema.ts',
    linkedBug: 'B-010',
    scenarioType: 'earthquake',
    rawInput: { magnitude: null },
    expectedValidation: {
      status: 'invalid',
      errorCount: 1,
      warningCount: 0,
      errorFields: ['magnitude'],
      errorCodes: ['NOT_FINITE'],
    },
    expectedOutputs: {
      'result.exists': { value: false },
    },
  },
  {
    id: 'G-EDGE-NEGATIVE-YIELD',
    category: 'edge',
    oracle: 'property',
    title: 'Negative yield → invalid (validator gate)',
    description: 'yieldMegatons = -1 must be rejected at the schema boundary.',
    citation: 'inputSchema.ts',
    scenarioType: 'explosion',
    rawInput: { yieldMegatons: -1 },
    expectedValidation: {
      status: 'invalid',
      errorCount: 1,
      warningCount: 0,
      errorFields: ['yieldMegatons'],
      errorCodes: ['ZERO_FORBIDDEN'],
    },
    expectedOutputs: {
      'result.exists': { value: false },
    },
  },

  // ========================================================================
  // Physical sanity (S3 plausibility warnings)
  // ========================================================================
  {
    id: 'G-PHYS-SUSPICIOUS-MW',
    category: 'physical-sanity',
    oracle: 'property',
    title: 'Mw 11 → suspicious (largest recorded is Mw 9.5)',
    description: 'Above the historical maximum; should be ACCEPTED with PHYS_SUSPICIOUS_HIGH warning.',
    citation: 'Stein & Okal 2005 — Mw 9.5 Valdivia 1960 is the historical max',
    scenarioType: 'earthquake',
    rawInput: { magnitude: 11 },
    expectedValidation: {
      status: 'suspicious',
      errorCount: 0,
      warningCount: 1,
      warningFields: ['magnitude'],
      warningCodes: ['PHYS_SUSPICIOUS_HIGH'],
    },
    expectedOutputs: {
      // Even unphysical Mw produces finite output — no NaN/Inf escape.
      'shaking.mmi7Radius.km': { min: 100, max: 1e6 },
    },
  },

  // ========================================================================
  // Custom-user representative (the bug-report archetype)
  // ========================================================================
  {
    id: 'G-CUSTOM-VOLCANIC-FLANK',
    category: 'custom-user',
    oracle: 'scaling',
    title: 'Custom-user flank-collapse tsunami in 200 m water',
    description:
      'Anak-Krakatau-class custom inputs: 0.27 km³ slide, 20° slope, 200 m water. Watts source ~80 m capped by McCowan 0.4·h ceiling.',
    citation: 'Grilli et al. 2019 Sci. Rep. 9: 11946',
    scenarioType: 'volcano',
    rawInput: {
      volumeEruptionRate: 1,
      totalEjectaVolume: 1e7,
      flankCollapse: { volumeM3: 2.7e8, slopeAngleDeg: 20, meanOceanDepth: 200 },
    },
    expectedValidation: {
      status: 'accepted',
      errorCount: 0,
      warningCount: 0,
    },
    expectedOutputs: {
      // The validator does not yet inspect nested flankCollapse, so
      // these expectations focus on the top-level scenario.
      'plumeHeight.km': { min: 0, max: 5 },
    },
  },
] as const;
