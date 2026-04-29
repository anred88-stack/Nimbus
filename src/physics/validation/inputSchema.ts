/**
 * Centralized runtime input validator for every Nimbus scenario type.
 *
 * Single source of truth for what counts as a valid custom input.
 * Used by:
 *   - Zustand store setters (setEarthquakeInput, etc.)
 *   - CLI replay harness (`pnpm simulate`)
 *   - Replay fixtures (`replay.test.ts`)
 *   - Golden dataset (`goldenDataset.test.ts`)
 *
 * The validator returns a {@link ValidationResult} with one of four
 * statuses (matching the V&V severity ladder in
 * `docs/VERIFICATION_PLAN.md`):
 *
 *   - `'invalid'`     — at least one S1 BLOCKING error. `input` is null.
 *                       Caller MUST not simulate.
 *   - `'normalized'`  — accepted after S2 normalization (azimuth wrap,
 *                       lat clamp, etc). `input` is the normalized form.
 *   - `'suspicious'`  — accepted as-is, but at least one S3 PHYSICAL
 *                       PLAUSIBILITY warning (e.g., Mw > 10).
 *   - `'accepted'`    — clean input, simulate without ceremony.
 *
 * Both `errors` and `warnings` are populated with structured
 * {@link ValidationIssue}s so the UI can render per-field feedback.
 *
 * Closes B-010: defense-in-depth gap. Production callers (store, CLI,
 * tests) MUST go through here. Direct calls to `simulate*()` remain
 * possible for unit-tests but the validator is now the documented
 * "official" entry point.
 */

import type { EarthquakeScenarioInput } from '../events/earthquake/simulate.js';
import type { FaultType } from '../events/earthquake/ruptureLength.js';
import type { ExplosionScenarioInput } from '../events/explosion/simulate.js';
import type { VolcanoScenarioInput } from '../events/volcano/simulate.js';
import type {
  LandslideScenarioInput,
  LandslideRegime,
} from '../events/landslide/simulate.js';
import type { ImpactScenarioInput } from '../simulate.js';
import { m, mps, deg, kgPerM3, degreesToRadians, Pa } from '../units.js';

/** Four-state severity ladder mirroring `VERIFICATION_PLAN.md`. */
export type ValidationStatus = 'invalid' | 'normalized' | 'suspicious' | 'accepted';

/** Stable error/warning code set. Add codes; never repurpose. */
export type ValidationCode =
  | 'NOT_FINITE' // S1: NaN or Infinity
  | 'NOT_NUMBER' // S1: wrong type entirely
  | 'NEGATIVE_FORBIDDEN' // S1: negative value where forbidden
  | 'ZERO_FORBIDDEN' // S1: zero where strictly positive required
  | 'OUT_OF_DOMAIN' // S1: outside the formula's defined domain
  | 'NORMALIZED_AZIMUTH' // S2: azimuth wrapped to [0, 360)
  | 'NORMALIZED_LATITUDE' // S2: latitude clamped to [-90, 90]
  | 'NORMALIZED_LONGITUDE' // S2: longitude wrapped to [-180, 180]
  | 'NORMALIZED_SLOPE' // S2: slope clamped to envelope
  | 'PHYS_SUSPICIOUS_HIGH' // S3: above typical-event ceiling
  | 'PHYS_SUSPICIOUS_LOW' // S3: below typical-event floor
  | 'UNKNOWN_FIELD'; // S2: extra field ignored

export interface ValidationIssue {
  field: string;
  code: ValidationCode;
  message: string;
  rawValue?: unknown;
  normalizedValue?: unknown;
}

export interface ValidationResult<T> {
  status: ValidationStatus;
  /** Normalized + accepted input. `null` only when `status === 'invalid'`. */
  input: T | null;
  /** Blocking errors (S1). Non-empty implies `status === 'invalid'`. */
  errors: ValidationIssue[];
  /** Non-blocking warnings (S2 normalization + S3 plausibility). */
  warnings: ValidationIssue[];
}

// ---------- shared helpers ----------

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function ok<T>(input: T): ValidationResult<T> {
  return { status: 'accepted', input, errors: [], warnings: [] };
}

function withWarnings<T>(input: T, warnings: ValidationIssue[]): ValidationResult<T> {
  if (warnings.length === 0) return ok(input);
  const hasPhys = warnings.some(
    (w) => w.code === 'PHYS_SUSPICIOUS_HIGH' || w.code === 'PHYS_SUSPICIOUS_LOW',
  );
  return {
    status: hasPhys ? 'suspicious' : 'normalized',
    input,
    errors: [],
    warnings,
  };
}

function invalid<T>(errors: ValidationIssue[], warnings: ValidationIssue[] = []): ValidationResult<T> {
  return { status: 'invalid', input: null, errors, warnings };
}

/** Wrap an azimuth into [0, 360) and emit a warning if it had to move. */
function normalizeAzimuthDeg(
  raw: number,
  field: string,
  warnings: ValidationIssue[],
): number {
  if (raw >= 0 && raw < 360) return raw;
  const wrapped = ((raw % 360) + 360) % 360;
  warnings.push({
    field,
    code: 'NORMALIZED_AZIMUTH',
    message: `azimuth ${raw.toString()}° wrapped to ${wrapped.toFixed(3)}°`,
    rawValue: raw,
    normalizedValue: wrapped,
  });
  return wrapped;
}

// ---------- Earthquake ----------

interface EarthquakeRawInput {
  magnitude?: unknown;
  depth?: unknown;
  faultType?: unknown;
  vs30?: unknown;
  subductionInterface?: unknown;
  strikeAzimuthDeg?: unknown;
  ruptureLengthOverride?: unknown;
  ruptureWidthOverride?: unknown;
}

const VALID_FAULT_TYPES: readonly FaultType[] = [
  'strike-slip',
  'reverse',
  'normal',
  'all',
] as const;

export function validateEarthquakeInput(
  raw: EarthquakeRawInput,
): ValidationResult<EarthquakeScenarioInput> {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!isFiniteNumber(raw.magnitude)) {
    errors.push({
      field: 'magnitude',
      code: 'NOT_FINITE',
      message: 'magnitude must be a finite number',
      rawValue: raw.magnitude,
    });
    return invalid(errors);
  }
  if (raw.magnitude <= 0) {
    errors.push({
      field: 'magnitude',
      code: 'ZERO_FORBIDDEN',
      message: `magnitude must be > 0 (got ${raw.magnitude.toString()})`,
      rawValue: raw.magnitude,
    });
    return invalid(errors);
  }
  if (raw.magnitude > 10) {
    warnings.push({
      field: 'magnitude',
      code: 'PHYS_SUSPICIOUS_HIGH',
      message: `magnitude ${raw.magnitude.toString()} exceeds the largest recorded earthquake (Mw 9.5, Valdivia 1960)`,
      rawValue: raw.magnitude,
    });
  }
  if (raw.magnitude < 1) {
    warnings.push({
      field: 'magnitude',
      code: 'PHYS_SUSPICIOUS_LOW',
      message: `magnitude ${raw.magnitude.toString()} is below human-felt threshold (Mw ~2)`,
      rawValue: raw.magnitude,
    });
  }

  const out: EarthquakeScenarioInput = { magnitude: raw.magnitude };

  if (raw.depth !== undefined) {
    if (!isFiniteNumber(raw.depth) || raw.depth < 0) {
      errors.push({
        field: 'depth',
        code: isFiniteNumber(raw.depth) ? 'NEGATIVE_FORBIDDEN' : 'NOT_FINITE',
        message: 'depth (m) must be a finite, non-negative number',
        rawValue: raw.depth,
      });
      return invalid(errors);
    }
    if (raw.depth > 700_000) {
      warnings.push({
        field: 'depth',
        code: 'PHYS_SUSPICIOUS_HIGH',
        message: `depth ${(raw.depth / 1_000).toString()} km exceeds the deepest recorded hypocentre (~700 km)`,
        rawValue: raw.depth,
      });
    }
    out.depth = m(raw.depth);
  }

  if (raw.faultType !== undefined) {
    if (typeof raw.faultType !== 'string' || !VALID_FAULT_TYPES.includes(raw.faultType as FaultType)) {
      errors.push({
        field: 'faultType',
        code: 'OUT_OF_DOMAIN',
        message: `faultType must be one of ${VALID_FAULT_TYPES.join(', ')} (got ${JSON.stringify(raw.faultType)})`,
        rawValue: raw.faultType,
      });
      return invalid(errors);
    }
    out.faultType = raw.faultType as FaultType;
  }

  if (raw.vs30 !== undefined) {
    if (!isFiniteNumber(raw.vs30) || raw.vs30 <= 0) {
      errors.push({
        field: 'vs30',
        code: isFiniteNumber(raw.vs30) ? 'ZERO_FORBIDDEN' : 'NOT_FINITE',
        message: 'vs30 (m/s) must be a finite positive number',
        rawValue: raw.vs30,
      });
      return invalid(errors);
    }
    if (raw.vs30 < 100 || raw.vs30 > 2_000) {
      warnings.push({
        field: 'vs30',
        code: raw.vs30 < 100 ? 'PHYS_SUSPICIOUS_LOW' : 'PHYS_SUSPICIOUS_HIGH',
        message: `vs30 ${raw.vs30.toString()} m/s is outside the NEHRP soil-class envelope [100, 2000]`,
        rawValue: raw.vs30,
      });
    }
    out.vs30 = raw.vs30;
  }

  if (typeof raw.subductionInterface === 'boolean') {
    out.subductionInterface = raw.subductionInterface;
  }

  if (raw.strikeAzimuthDeg !== undefined) {
    if (!isFiniteNumber(raw.strikeAzimuthDeg)) {
      errors.push({
        field: 'strikeAzimuthDeg',
        code: 'NOT_FINITE',
        message: 'strikeAzimuthDeg must be a finite number',
        rawValue: raw.strikeAzimuthDeg,
      });
      return invalid(errors);
    }
    out.strikeAzimuthDeg = normalizeAzimuthDeg(
      raw.strikeAzimuthDeg,
      'strikeAzimuthDeg',
      warnings,
    );
  }

  if (raw.ruptureLengthOverride !== undefined) {
    if (!isFiniteNumber(raw.ruptureLengthOverride) || raw.ruptureLengthOverride <= 0) {
      errors.push({
        field: 'ruptureLengthOverride',
        code: isFiniteNumber(raw.ruptureLengthOverride) ? 'ZERO_FORBIDDEN' : 'NOT_FINITE',
        message: 'ruptureLengthOverride (m) must be finite > 0',
        rawValue: raw.ruptureLengthOverride,
      });
      return invalid(errors);
    }
    out.ruptureLengthOverride = m(raw.ruptureLengthOverride);
  }

  if (raw.ruptureWidthOverride !== undefined) {
    if (!isFiniteNumber(raw.ruptureWidthOverride) || raw.ruptureWidthOverride <= 0) {
      errors.push({
        field: 'ruptureWidthOverride',
        code: isFiniteNumber(raw.ruptureWidthOverride) ? 'ZERO_FORBIDDEN' : 'NOT_FINITE',
        message: 'ruptureWidthOverride (m) must be finite > 0',
        rawValue: raw.ruptureWidthOverride,
      });
      return invalid(errors);
    }
    out.ruptureWidthOverride = m(raw.ruptureWidthOverride);
  }

  return withWarnings(out, warnings);
}

// ---------- Explosion ----------

interface ExplosionRawInput {
  yieldMegatons?: unknown;
  heightOfBurst?: unknown;
  waterDepth?: unknown;
  meanOceanDepth?: unknown;
  groundType?: unknown;
  coastalBeachSlopeRad?: unknown;
}

const VALID_GROUND_TYPES = ['DRY_SOIL', 'WET_SOIL', 'FIRM_GROUND', 'HARD_ROCK'] as const;
type GroundType = (typeof VALID_GROUND_TYPES)[number];

export function validateExplosionInput(
  raw: ExplosionRawInput,
): ValidationResult<ExplosionScenarioInput> {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!isFiniteNumber(raw.yieldMegatons)) {
    errors.push({
      field: 'yieldMegatons',
      code: 'NOT_FINITE',
      message: 'yieldMegatons must be finite',
      rawValue: raw.yieldMegatons,
    });
    return invalid(errors);
  }
  if (raw.yieldMegatons <= 0) {
    errors.push({
      field: 'yieldMegatons',
      code: 'ZERO_FORBIDDEN',
      message: `yieldMegatons must be > 0 (got ${raw.yieldMegatons.toString()})`,
      rawValue: raw.yieldMegatons,
    });
    return invalid(errors);
  }
  if (raw.yieldMegatons > 100) {
    warnings.push({
      field: 'yieldMegatons',
      code: 'PHYS_SUSPICIOUS_HIGH',
      message: `yieldMegatons ${raw.yieldMegatons.toString()} exceeds the largest device ever detonated (Tsar Bomba, 50 Mt)`,
      rawValue: raw.yieldMegatons,
    });
  }

  const out: ExplosionScenarioInput = { yieldMegatons: raw.yieldMegatons };

  if (raw.heightOfBurst !== undefined) {
    if (!isFiniteNumber(raw.heightOfBurst) || raw.heightOfBurst < 0) {
      errors.push({
        field: 'heightOfBurst',
        code: isFiniteNumber(raw.heightOfBurst) ? 'NEGATIVE_FORBIDDEN' : 'NOT_FINITE',
        message: 'heightOfBurst (m) must be finite and non-negative',
        rawValue: raw.heightOfBurst,
      });
      return invalid(errors);
    }
    if (raw.heightOfBurst > 100_000) {
      warnings.push({
        field: 'heightOfBurst',
        code: 'PHYS_SUSPICIOUS_HIGH',
        message: `heightOfBurst ${(raw.heightOfBurst / 1_000).toString()} km is above the mesosphere — this becomes a HEMP scenario`,
        rawValue: raw.heightOfBurst,
      });
    }
    out.heightOfBurst = m(raw.heightOfBurst);
  }

  if (raw.waterDepth !== undefined) {
    if (!isFiniteNumber(raw.waterDepth) || raw.waterDepth < 0) {
      errors.push({
        field: 'waterDepth',
        code: isFiniteNumber(raw.waterDepth) ? 'NEGATIVE_FORBIDDEN' : 'NOT_FINITE',
        message: 'waterDepth (m) must be finite and non-negative',
        rawValue: raw.waterDepth,
      });
      return invalid(errors);
    }
    if (raw.waterDepth > 11_000) {
      warnings.push({
        field: 'waterDepth',
        code: 'PHYS_SUSPICIOUS_HIGH',
        message: `waterDepth ${(raw.waterDepth / 1_000).toString()} km exceeds the Mariana Trench (~11 km)`,
        rawValue: raw.waterDepth,
      });
    }
    out.waterDepth = m(raw.waterDepth);
  }

  if (raw.meanOceanDepth !== undefined) {
    if (!isFiniteNumber(raw.meanOceanDepth) || raw.meanOceanDepth <= 0) {
      errors.push({
        field: 'meanOceanDepth',
        code: isFiniteNumber(raw.meanOceanDepth) ? 'ZERO_FORBIDDEN' : 'NOT_FINITE',
        message: 'meanOceanDepth (m) must be finite > 0',
        rawValue: raw.meanOceanDepth,
      });
      return invalid(errors);
    }
    out.meanOceanDepth = m(raw.meanOceanDepth);
  }

  if (raw.groundType !== undefined) {
    if (
      typeof raw.groundType !== 'string' ||
      !(VALID_GROUND_TYPES as readonly string[]).includes(raw.groundType)
    ) {
      errors.push({
        field: 'groundType',
        code: 'OUT_OF_DOMAIN',
        message: `groundType must be one of ${VALID_GROUND_TYPES.join(', ')} (got ${JSON.stringify(raw.groundType)})`,
        rawValue: raw.groundType,
      });
      return invalid(errors);
    }
    out.groundType = raw.groundType as GroundType;
  }

  if (raw.coastalBeachSlopeRad !== undefined) {
    if (!isFiniteNumber(raw.coastalBeachSlopeRad)) {
      errors.push({
        field: 'coastalBeachSlopeRad',
        code: 'NOT_FINITE',
        message: 'coastalBeachSlopeRad must be finite',
        rawValue: raw.coastalBeachSlopeRad,
      });
      return invalid(errors);
    }
    const min = Math.atan(1 / 1000);
    const max = Math.atan(1 / 3);
    if (raw.coastalBeachSlopeRad < min || raw.coastalBeachSlopeRad > max) {
      warnings.push({
        field: 'coastalBeachSlopeRad',
        code: 'NORMALIZED_SLOPE',
        message: `coastalBeachSlopeRad ${raw.coastalBeachSlopeRad.toString()} outside [1:1000, 1:3] envelope`,
        rawValue: raw.coastalBeachSlopeRad,
      });
    }
    out.coastalBeachSlopeRad = raw.coastalBeachSlopeRad;
  }

  return withWarnings(out, warnings);
}

// ---------- Volcano ----------

interface VolcanoRawInput {
  volumeEruptionRate?: unknown;
  totalEjectaVolume?: unknown;
  laharVolume?: unknown;
  windSpeed?: unknown;
  windDirectionDegrees?: unknown;
  flankCollapse?: unknown;
  lateralBlast?: unknown;
}

// ---------- Nested validators (composable) ----------

/**
 * Validate the flankCollapse nested object on a volcano input.
 * Pushes errors with `flankCollapse.<name>` paths and warnings with
 * the same prefix so downstream consumers can render per-field
 * diagnostics. Returns the structurally-validated nested payload, or
 * null when the input is non-object / has at least one error.
 */
type FlankCollapsePayload = NonNullable<VolcanoScenarioInput['flankCollapse']>;

function validateFlankCollapse(
  raw: unknown,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
): FlankCollapsePayload | null {
  if (typeof raw !== 'object' || raw === null) {
    errors.push({
      field: 'flankCollapse',
      code: 'OUT_OF_DOMAIN',
      message: 'flankCollapse must be an object when provided',
      rawValue: raw,
    });
    return null;
  }
  const r = raw as Record<string, unknown>;
  const startErrors = errors.length;

  if (!isFiniteNumber(r.volumeM3)) {
    errors.push({
      field: 'flankCollapse.volumeM3',
      code: 'NOT_FINITE',
      message: 'flankCollapse.volumeM3 must be a finite number',
      rawValue: r.volumeM3,
    });
  } else if (r.volumeM3 <= 0) {
    errors.push({
      field: 'flankCollapse.volumeM3',
      code: 'ZERO_FORBIDDEN',
      message: 'flankCollapse.volumeM3 must be > 0',
      rawValue: r.volumeM3,
    });
  } else if (r.volumeM3 > 1e13) {
    warnings.push({
      field: 'flankCollapse.volumeM3',
      code: 'PHYS_SUSPICIOUS_HIGH',
      message: `flankCollapse.volumeM3 ${r.volumeM3.toString()} exceeds the largest known volcanic-flank collapse (Storegga 3×10¹² is submarine-landslide; volcanic flank collapses cap near 10¹²)`,
      rawValue: r.volumeM3,
    });
  }

  if (r.slopeAngleDeg !== undefined) {
    if (!isFiniteNumber(r.slopeAngleDeg)) {
      errors.push({
        field: 'flankCollapse.slopeAngleDeg',
        code: 'NOT_FINITE',
        message: 'flankCollapse.slopeAngleDeg must be finite',
        rawValue: r.slopeAngleDeg,
      });
    } else if (r.slopeAngleDeg <= 0 || r.slopeAngleDeg >= 90) {
      errors.push({
        field: 'flankCollapse.slopeAngleDeg',
        code: 'OUT_OF_DOMAIN',
        message: 'flankCollapse.slopeAngleDeg must be in (0, 90)',
        rawValue: r.slopeAngleDeg,
      });
    }
  }

  for (const depthField of ['meanOceanDepth', 'sourceWaterDepth'] as const) {
    const v = r[depthField];
    if (v === undefined) continue;
    if (!isFiniteNumber(v)) {
      errors.push({
        field: `flankCollapse.${depthField}`,
        code: 'NOT_FINITE',
        message: `flankCollapse.${depthField} must be finite`,
        rawValue: v,
      });
    } else if (v < 0) {
      errors.push({
        field: `flankCollapse.${depthField}`,
        code: 'NEGATIVE_FORBIDDEN',
        message: `flankCollapse.${depthField} (m) must be >= 0`,
        rawValue: v,
      });
    } else if (v > 11_000) {
      warnings.push({
        field: `flankCollapse.${depthField}`,
        code: 'PHYS_SUSPICIOUS_HIGH',
        message: `flankCollapse.${depthField} ${(v / 1_000).toString()} km exceeds the Mariana Trench (~11 km)`,
        rawValue: v,
      });
    }
  }

  if (errors.length !== startErrors) return null;

  // Structurally valid — build the typed nested payload.
  const out: FlankCollapsePayload = {
    volumeM3: r.volumeM3 as number,
  };
  if (r.slopeAngleDeg !== undefined) out.slopeAngleDeg = r.slopeAngleDeg as number;
  if (r.meanOceanDepth !== undefined) out.meanOceanDepth = m(r.meanOceanDepth as number);
  if (r.sourceWaterDepth !== undefined) out.sourceWaterDepth = m(r.sourceWaterDepth as number);
  return out;
}

/**
 * Validate the lateralBlast nested object on a volcano input.
 * `directionDeg` is mandatory; `sectorAngleDeg` is optional with a
 * default of 180° (handled by the simulator). Azimuth is normalized
 * with a NORMALIZED_AZIMUTH warning.
 */
type LateralBlastPayload = NonNullable<VolcanoScenarioInput['lateralBlast']>;

function validateLateralBlast(
  raw: unknown,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
): LateralBlastPayload | null {
  if (typeof raw !== 'object' || raw === null) {
    errors.push({
      field: 'lateralBlast',
      code: 'OUT_OF_DOMAIN',
      message: 'lateralBlast must be an object when provided',
      rawValue: raw,
    });
    return null;
  }
  const r = raw as Record<string, unknown>;
  const startErrors = errors.length;

  if (!isFiniteNumber(r.directionDeg)) {
    errors.push({
      field: 'lateralBlast.directionDeg',
      code: 'NOT_FINITE',
      message: 'lateralBlast.directionDeg must be finite',
      rawValue: r.directionDeg,
    });
  }

  if (r.sectorAngleDeg !== undefined) {
    if (!isFiniteNumber(r.sectorAngleDeg)) {
      errors.push({
        field: 'lateralBlast.sectorAngleDeg',
        code: 'NOT_FINITE',
        message: 'lateralBlast.sectorAngleDeg must be finite',
        rawValue: r.sectorAngleDeg,
      });
    } else if (r.sectorAngleDeg <= 0 || r.sectorAngleDeg > 360) {
      errors.push({
        field: 'lateralBlast.sectorAngleDeg',
        code: 'OUT_OF_DOMAIN',
        message: 'lateralBlast.sectorAngleDeg must be in (0, 360]',
        rawValue: r.sectorAngleDeg,
      });
    }
  }

  if (errors.length !== startErrors) return null;

  const direction = normalizeAzimuthDeg(r.directionDeg as number, 'lateralBlast.directionDeg', warnings);
  const out: LateralBlastPayload = { directionDeg: direction };
  if (r.sectorAngleDeg !== undefined) out.sectorAngleDeg = r.sectorAngleDeg as number;
  return out;
}

export function validateVolcanoInput(
  raw: VolcanoRawInput,
): ValidationResult<VolcanoScenarioInput> {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!isFiniteNumber(raw.volumeEruptionRate)) {
    errors.push({
      field: 'volumeEruptionRate',
      code: 'NOT_FINITE',
      message: 'volumeEruptionRate (m³/s DRE) must be finite',
      rawValue: raw.volumeEruptionRate,
    });
    return invalid(errors);
  }
  if (raw.volumeEruptionRate <= 0) {
    errors.push({
      field: 'volumeEruptionRate',
      code: 'ZERO_FORBIDDEN',
      message: 'volumeEruptionRate must be > 0',
      rawValue: raw.volumeEruptionRate,
    });
    return invalid(errors);
  }
  if (raw.volumeEruptionRate > 1e7) {
    warnings.push({
      field: 'volumeEruptionRate',
      code: 'PHYS_SUSPICIOUS_HIGH',
      message: `volumeEruptionRate ${raw.volumeEruptionRate.toString()} m³/s exceeds the largest known eruption (Tambora 1815, ~5×10⁶)`,
      rawValue: raw.volumeEruptionRate,
    });
  }

  // totalEjectaVolume is REQUIRED by the simulator type.
  if (!isFiniteNumber(raw.totalEjectaVolume) || raw.totalEjectaVolume <= 0) {
    errors.push({
      field: 'totalEjectaVolume',
      code: isFiniteNumber(raw.totalEjectaVolume) ? 'ZERO_FORBIDDEN' : 'NOT_FINITE',
      message: 'totalEjectaVolume (m³) must be finite > 0',
      rawValue: raw.totalEjectaVolume,
    });
    return invalid(errors);
  }

  const out: VolcanoScenarioInput = {
    volumeEruptionRate: raw.volumeEruptionRate,
    totalEjectaVolume: raw.totalEjectaVolume,
  };

  if (raw.laharVolume !== undefined) {
    if (!isFiniteNumber(raw.laharVolume) || raw.laharVolume < 0) {
      errors.push({
        field: 'laharVolume',
        code: isFiniteNumber(raw.laharVolume) ? 'NEGATIVE_FORBIDDEN' : 'NOT_FINITE',
        message: 'laharVolume (m³) must be finite >= 0',
        rawValue: raw.laharVolume,
      });
      return invalid(errors);
    }
    out.laharVolume = raw.laharVolume;
  }

  if (raw.windSpeed !== undefined) {
    if (!isFiniteNumber(raw.windSpeed) || raw.windSpeed < 0) {
      errors.push({
        field: 'windSpeed',
        code: isFiniteNumber(raw.windSpeed) ? 'NEGATIVE_FORBIDDEN' : 'NOT_FINITE',
        message: 'windSpeed (m/s) must be finite >= 0',
        rawValue: raw.windSpeed,
      });
      return invalid(errors);
    }
    out.windSpeed = raw.windSpeed;
  }

  if (raw.windDirectionDegrees !== undefined) {
    if (!isFiniteNumber(raw.windDirectionDegrees)) {
      errors.push({
        field: 'windDirectionDegrees',
        code: 'NOT_FINITE',
        message: 'windDirectionDegrees must be finite',
        rawValue: raw.windDirectionDegrees,
      });
      return invalid(errors);
    }
    out.windDirectionDegrees = normalizeAzimuthDeg(
      raw.windDirectionDegrees,
      'windDirectionDegrees',
      warnings,
    );
  }

  // Nested validation — closes L7 in CONSOLIDATION_AUDIT.md.
  if (raw.flankCollapse !== undefined) {
    const fc = validateFlankCollapse(raw.flankCollapse, errors, warnings);
    if (errors.length > 0) return invalid(errors, warnings);
    if (fc !== null) out.flankCollapse = fc;
  }
  if (raw.lateralBlast !== undefined) {
    const lb = validateLateralBlast(raw.lateralBlast, errors, warnings);
    if (errors.length > 0) return invalid(errors, warnings);
    if (lb !== null) out.lateralBlast = lb;
  }

  return withWarnings(out, warnings);
}

// ---------- Landslide ----------

interface LandslideRawInput {
  volumeM3?: unknown;
  slopeAngleDeg?: unknown;
  meanOceanDepth?: unknown;
  slideFootprintArea?: unknown;
  confinedBasinArea?: unknown;
  confinementDynamicFactor?: unknown;
  regime?: unknown;
}

const VALID_LANDSLIDE_REGIMES: readonly LandslideRegime[] = ['submarine', 'subaerial'] as const;

export function validateLandslideInput(
  raw: LandslideRawInput,
): ValidationResult<LandslideScenarioInput> {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!isFiniteNumber(raw.volumeM3)) {
    errors.push({
      field: 'volumeM3',
      code: 'NOT_FINITE',
      message: 'volumeM3 must be finite',
      rawValue: raw.volumeM3,
    });
    return invalid(errors);
  }
  if (raw.volumeM3 <= 0) {
    errors.push({
      field: 'volumeM3',
      code: 'ZERO_FORBIDDEN',
      message: 'volumeM3 must be > 0',
      rawValue: raw.volumeM3,
    });
    return invalid(errors);
  }
  if (raw.volumeM3 > 1e14) {
    warnings.push({
      field: 'volumeM3',
      code: 'PHYS_SUSPICIOUS_HIGH',
      message: `volumeM3 ${raw.volumeM3.toString()} exceeds Storegga (3×10¹², the largest known submarine slide)`,
      rawValue: raw.volumeM3,
    });
  }

  const out: LandslideScenarioInput = { volumeM3: raw.volumeM3 };

  if (raw.slopeAngleDeg !== undefined) {
    if (!isFiniteNumber(raw.slopeAngleDeg)) {
      errors.push({
        field: 'slopeAngleDeg',
        code: 'NOT_FINITE',
        message: 'slopeAngleDeg must be finite',
        rawValue: raw.slopeAngleDeg,
      });
      return invalid(errors);
    }
    if (raw.slopeAngleDeg <= 0 || raw.slopeAngleDeg >= 90) {
      errors.push({
        field: 'slopeAngleDeg',
        code: 'OUT_OF_DOMAIN',
        message: 'slopeAngleDeg must be in (0, 90)',
        rawValue: raw.slopeAngleDeg,
      });
      return invalid(errors);
    }
    out.slopeAngleDeg = raw.slopeAngleDeg;
  }

  if (raw.meanOceanDepth !== undefined) {
    if (!isFiniteNumber(raw.meanOceanDepth) || raw.meanOceanDepth < 0) {
      errors.push({
        field: 'meanOceanDepth',
        code: isFiniteNumber(raw.meanOceanDepth) ? 'NEGATIVE_FORBIDDEN' : 'NOT_FINITE',
        message: 'meanOceanDepth (m) must be finite >= 0',
        rawValue: raw.meanOceanDepth,
      });
      return invalid(errors);
    }
    out.meanOceanDepth = m(raw.meanOceanDepth);
  }

  if (raw.slideFootprintArea !== undefined) {
    if (!isFiniteNumber(raw.slideFootprintArea) || raw.slideFootprintArea <= 0) {
      errors.push({
        field: 'slideFootprintArea',
        code: isFiniteNumber(raw.slideFootprintArea) ? 'ZERO_FORBIDDEN' : 'NOT_FINITE',
        message: 'slideFootprintArea (m²) must be finite > 0',
        rawValue: raw.slideFootprintArea,
      });
      return invalid(errors);
    }
    // Cast through never because SquareMeters is a brand only — number assignable.
    out.slideFootprintArea = raw.slideFootprintArea as never;
  }

  if (raw.confinedBasinArea !== undefined) {
    if (!isFiniteNumber(raw.confinedBasinArea) || raw.confinedBasinArea <= 0) {
      errors.push({
        field: 'confinedBasinArea',
        code: isFiniteNumber(raw.confinedBasinArea) ? 'ZERO_FORBIDDEN' : 'NOT_FINITE',
        message: 'confinedBasinArea (m²) must be finite > 0',
        rawValue: raw.confinedBasinArea,
      });
      return invalid(errors);
    }
    out.confinedBasinArea = raw.confinedBasinArea as never;
  }

  if (raw.confinementDynamicFactor !== undefined) {
    if (!isFiniteNumber(raw.confinementDynamicFactor) || raw.confinementDynamicFactor <= 0) {
      errors.push({
        field: 'confinementDynamicFactor',
        code: isFiniteNumber(raw.confinementDynamicFactor) ? 'ZERO_FORBIDDEN' : 'NOT_FINITE',
        message: 'confinementDynamicFactor must be finite > 0',
        rawValue: raw.confinementDynamicFactor,
      });
      return invalid(errors);
    }
    out.confinementDynamicFactor = raw.confinementDynamicFactor;
  }

  if (raw.regime !== undefined) {
    if (
      typeof raw.regime !== 'string' ||
      !(VALID_LANDSLIDE_REGIMES as readonly string[]).includes(raw.regime)
    ) {
      errors.push({
        field: 'regime',
        code: 'OUT_OF_DOMAIN',
        message: `regime must be one of ${VALID_LANDSLIDE_REGIMES.join(', ')}`,
        rawValue: raw.regime,
      });
      return invalid(errors);
    }
    out.regime = raw.regime as LandslideRegime;
  }

  return withWarnings(out, warnings);
}

// ---------- Impact ----------

interface ImpactRawInput {
  impactorDiameter?: unknown;
  impactVelocity?: unknown;
  impactorDensity?: unknown;
  targetDensity?: unknown;
  impactAngle?: unknown;
  impactAngleDeg?: unknown;
  impactAzimuthDeg?: unknown;
  surfaceGravity?: unknown;
  waterDepth?: unknown;
  impactorStrength?: unknown;
}

export function validateImpactInput(raw: ImpactRawInput): ValidationResult<ImpactScenarioInput> {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  for (const [name, val] of [
    ['impactorDiameter', raw.impactorDiameter],
    ['impactVelocity', raw.impactVelocity],
    ['impactorDensity', raw.impactorDensity],
    ['targetDensity', raw.targetDensity],
    ['surfaceGravity', raw.surfaceGravity],
  ] as const) {
    if (!isFiniteNumber(val)) {
      errors.push({
        field: name,
        code: 'NOT_FINITE',
        message: `${name} must be finite`,
        rawValue: val,
      });
      continue;
    }
    if (val <= 0) {
      errors.push({
        field: name,
        code: 'ZERO_FORBIDDEN',
        message: `${name} must be > 0`,
        rawValue: val,
      });
    }
  }
  if (errors.length > 0) return invalid(errors);

  // Past this point, all five are isFiniteNumber > 0.
  const D = raw.impactorDiameter as number;
  const v = raw.impactVelocity as number;
  const rhoI = raw.impactorDensity as number;
  const rhoT = raw.targetDensity as number;
  const g = raw.surfaceGravity as number;

  if (D > 100_000) {
    warnings.push({
      field: 'impactorDiameter',
      code: 'PHYS_SUSPICIOUS_HIGH',
      message: `impactorDiameter ${(D / 1_000).toString()} km exceeds the largest known crater-forming body (Vredefort, ~10-15 km)`,
      rawValue: D,
    });
  }
  if (v < 1_000) {
    warnings.push({
      field: 'impactVelocity',
      code: 'PHYS_SUSPICIOUS_LOW',
      message: `impactVelocity ${v.toString()} m/s is below Earth escape velocity (~11.2 km/s); cosmic impacts arrive at ≥ 11.2 km/s`,
      rawValue: v,
    });
  }
  if (v > 80_000) {
    warnings.push({
      field: 'impactVelocity',
      code: 'PHYS_SUSPICIOUS_HIGH',
      message: `impactVelocity ${(v / 1_000).toString()} km/s exceeds heliocentric retrograde maximum (~73 km/s)`,
      rawValue: v,
    });
  }
  if (rhoI < 500 || rhoI > 8_000) {
    warnings.push({
      field: 'impactorDensity',
      code: rhoI < 500 ? 'PHYS_SUSPICIOUS_LOW' : 'PHYS_SUSPICIOUS_HIGH',
      message: `impactorDensity ${rhoI.toString()} kg/m³ is outside the [600 cometary, 7800 iron] taxonomy envelope`,
      rawValue: rhoI,
    });
  }

  // Angle: normalize either impactAngle (rad) or impactAngleDeg.
  let angleRad: number | undefined;
  if (raw.impactAngle !== undefined) {
    if (!isFiniteNumber(raw.impactAngle)) {
      errors.push({
        field: 'impactAngle',
        code: 'NOT_FINITE',
        message: 'impactAngle (rad) must be finite',
        rawValue: raw.impactAngle,
      });
      return invalid(errors);
    }
    if (raw.impactAngle <= 0 || raw.impactAngle > Math.PI / 2 + 1e-9) {
      errors.push({
        field: 'impactAngle',
        code: 'OUT_OF_DOMAIN',
        message: 'impactAngle (rad) must be in (0, π/2]',
        rawValue: raw.impactAngle,
      });
      return invalid(errors);
    }
    angleRad = raw.impactAngle;
  } else if (raw.impactAngleDeg !== undefined) {
    if (!isFiniteNumber(raw.impactAngleDeg)) {
      errors.push({
        field: 'impactAngleDeg',
        code: 'NOT_FINITE',
        message: 'impactAngleDeg must be finite',
        rawValue: raw.impactAngleDeg,
      });
      return invalid(errors);
    }
    if (raw.impactAngleDeg <= 0 || raw.impactAngleDeg > 90.0001) {
      errors.push({
        field: 'impactAngleDeg',
        code: 'OUT_OF_DOMAIN',
        message: 'impactAngleDeg must be in (0, 90]',
        rawValue: raw.impactAngleDeg,
      });
      return invalid(errors);
    }
    angleRad = (raw.impactAngleDeg * Math.PI) / 180;
  } else {
    errors.push({
      field: 'impactAngle',
      code: 'OUT_OF_DOMAIN',
      message: 'either impactAngle (rad) or impactAngleDeg must be provided',
    });
    return invalid(errors);
  }

  const out: ImpactScenarioInput = {
    impactorDiameter: m(D),
    impactVelocity: mps(v),
    impactorDensity: kgPerM3(rhoI),
    targetDensity: kgPerM3(rhoT),
    impactAngle: degreesToRadians(deg((angleRad * 180) / Math.PI)),
    surfaceGravity: g,
  };

  if (raw.impactAzimuthDeg !== undefined) {
    if (!isFiniteNumber(raw.impactAzimuthDeg)) {
      errors.push({
        field: 'impactAzimuthDeg',
        code: 'NOT_FINITE',
        message: 'impactAzimuthDeg must be finite',
        rawValue: raw.impactAzimuthDeg,
      });
      return invalid(errors);
    }
    out.impactAzimuthDeg = normalizeAzimuthDeg(
      raw.impactAzimuthDeg,
      'impactAzimuthDeg',
      warnings,
    );
  }

  if (raw.waterDepth !== undefined) {
    if (!isFiniteNumber(raw.waterDepth) || raw.waterDepth < 0) {
      errors.push({
        field: 'waterDepth',
        code: isFiniteNumber(raw.waterDepth) ? 'NEGATIVE_FORBIDDEN' : 'NOT_FINITE',
        message: 'waterDepth (m) must be finite >= 0',
        rawValue: raw.waterDepth,
      });
      return invalid(errors);
    }
    out.waterDepth = m(raw.waterDepth);
  }

  if (raw.impactorStrength !== undefined) {
    if (!isFiniteNumber(raw.impactorStrength) || raw.impactorStrength <= 0) {
      errors.push({
        field: 'impactorStrength',
        code: isFiniteNumber(raw.impactorStrength) ? 'ZERO_FORBIDDEN' : 'NOT_FINITE',
        message: 'impactorStrength (Pa) must be finite > 0',
        rawValue: raw.impactorStrength,
      });
      return invalid(errors);
    }
    out.impactorStrength = Pa(raw.impactorStrength);
  }

  // suppress unused-import warnings for unit constructors when they're
  // not consumed in a particular branch (depends on optional fields).
  void mps; void kgPerM3;

  return withWarnings(out, warnings);
}

// ---------- Discriminated dispatcher ----------

export type ScenarioType = 'earthquake' | 'explosion' | 'volcano' | 'landslide' | 'impact';

export type ValidatedScenario =
  | { type: 'earthquake'; result: ValidationResult<EarthquakeScenarioInput> }
  | { type: 'explosion'; result: ValidationResult<ExplosionScenarioInput> }
  | { type: 'volcano'; result: ValidationResult<VolcanoScenarioInput> }
  | { type: 'landslide'; result: ValidationResult<LandslideScenarioInput> }
  | { type: 'impact'; result: ValidationResult<ImpactScenarioInput> };

/** Dispatch validation by scenario type. Used by replay harness and CLI. */
export function validateScenario(
  type: ScenarioType,
  raw: Record<string, unknown>,
): ValidatedScenario {
  switch (type) {
    case 'earthquake':
      return { type, result: validateEarthquakeInput(raw) };
    case 'explosion':
      return { type, result: validateExplosionInput(raw) };
    case 'volcano':
      return { type, result: validateVolcanoInput(raw) };
    case 'landslide':
      return { type, result: validateLandslideInput(raw) };
    case 'impact':
      return { type, result: validateImpactInput(raw) };
  }
}
