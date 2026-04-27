import { EARTHQUAKE_PRESETS } from '../physics/events/earthquake/index.js';
import { EXPLOSION_PRESETS } from '../physics/events/explosion/index.js';
import { LANDSLIDE_PRESETS } from '../physics/events/landslide/index.js';
import { VOLCANO_PRESETS } from '../physics/events/volcano/index.js';
import { IMPACT_PRESETS } from '../physics/simulate.js';
import { deg, degreesToRadians, kgPerM3, m, mps, radiansToDegrees } from '../physics/units.js';
import type { AppStore, EventType, ViewMode } from './useAppStore.js';

/**
 * Schema version. Bump when the URL keys or semantics change; older
 * URLs should then be migrated or dropped gracefully in the decoder.
 */
export const URL_STATE_VERSION = 1;

/**
 * Short, stable URL keys. Kept terse so a link fits in a tweet or a
 * QR code; verbose names go in docs not on the query string.
 */
export const URL_KEYS = {
  version: 'v',
  eventType: 't',
  preset: 'p',
  latitude: 'lat',
  longitude: 'lon',
  mode: 'm',
  // impact CUSTOM overrides
  diameter: 'd',
  velocity: 's',
  angleDeg: 'a',
  impactorDensity: 'rho',
  targetDensity: 'trho',
  gravity: 'g',
  waterDepth: 'wd',
  meanOceanDepth: 'od',
} as const;

type SyncableState = Pick<
  AppStore,
  | 'eventType'
  | 'impact'
  | 'explosion'
  | 'earthquake'
  | 'volcano'
  | 'landslide'
  | 'location'
  | 'mode'
>;

function isEventType(value: string | null): value is EventType {
  return (
    value === 'impact' ||
    value === 'explosion' ||
    value === 'earthquake' ||
    value === 'volcano' ||
    value === 'landslide'
  );
}

function isViewMode(value: string | null): value is ViewMode {
  return value === 'landing' || value === 'globe' || value === 'methodology' || value === 'report';
}

function numberParam(search: URLSearchParams, key: string): number | null {
  const raw = search.get(key);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Fixed-precision formatter: trims trailing zeros from `toFixed(digits)`
 * so latitude 21.5 stays "21.5" rather than "21.5000" in the URL.
 */
function trim(n: number, digits: number): string {
  return Number(n.toFixed(digits)).toString();
}

/**
 * Serialise the shareable slice of the app state into URL search
 * params. Location, non-landing view mode, and CUSTOM impact inputs
 * are only included when they differ from defaults, so the baseline
 * "land on the page and pick a preset" URL stays short.
 */
export function encodeStateToSearchParams(state: SyncableState): URLSearchParams {
  const params = new URLSearchParams();
  params.set(URL_KEYS.version, URL_STATE_VERSION.toString());
  params.set(URL_KEYS.eventType, state.eventType);

  if (state.eventType === 'impact') {
    params.set(URL_KEYS.preset, state.impact.preset);
    if (state.impact.preset === 'CUSTOM') {
      const input = state.impact.input;
      params.set(URL_KEYS.diameter, trim(input.impactorDiameter, 2));
      params.set(URL_KEYS.velocity, trim(input.impactVelocity, 2));
      params.set(URL_KEYS.angleDeg, trim(radiansToDegrees(input.impactAngle), 2));
      params.set(URL_KEYS.impactorDensity, trim(input.impactorDensity, 1));
      params.set(URL_KEYS.targetDensity, trim(input.targetDensity, 1));
      if (input.surfaceGravity !== undefined) {
        params.set(URL_KEYS.gravity, trim(input.surfaceGravity, 4));
      }
      if (input.waterDepth !== undefined) {
        params.set(URL_KEYS.waterDepth, trim(input.waterDepth, 1));
      }
      if (input.meanOceanDepth !== undefined) {
        params.set(URL_KEYS.meanOceanDepth, trim(input.meanOceanDepth, 0));
      }
    }
  } else if (state.eventType === 'explosion') {
    params.set(URL_KEYS.preset, state.explosion.preset);
  } else if (state.eventType === 'earthquake') {
    params.set(URL_KEYS.preset, state.earthquake.preset);
  } else if (state.eventType === 'volcano') {
    params.set(URL_KEYS.preset, state.volcano.preset);
  } else {
    params.set(URL_KEYS.preset, state.landslide.preset);
  }

  if (state.location) {
    params.set(URL_KEYS.latitude, trim(state.location.latitude, 4));
    params.set(URL_KEYS.longitude, trim(state.location.longitude, 4));
  }
  if (state.mode !== 'landing') {
    params.set(URL_KEYS.mode, state.mode);
  }

  return params;
}

/**
 * Output of {@link decodeSearchParamsToIntent}. Null-typed fields
 * mean "do not override the existing store value"; they correspond
 * to URL keys that were absent or invalid.
 */
export interface DecodedStateIntent {
  eventType: EventType | null;
  /** Only set when the preset id is known in the relevant PRESETS table. */
  preset: string | null;
  /** Present only when both lat and lon parsed into valid ranges. */
  location: { latitude: number; longitude: number } | null;
  mode: ViewMode | null;
  /** Only filled when preset === 'CUSTOM' and at least one override is set. */
  impactCustomInput: {
    impactorDiameter?: number;
    impactVelocity?: number;
    impactAngle?: number; // radians
    impactorDensity?: number;
    targetDensity?: number;
    surfaceGravity?: number;
    waterDepth?: number;
    meanOceanDepth?: number;
  } | null;
}

function looksLikeCustomPreset(preset: string): boolean {
  return preset === 'CUSTOM';
}

function presetBelongsTo(preset: string, table: EventType): boolean {
  if (table === 'impact') return preset in IMPACT_PRESETS || looksLikeCustomPreset(preset);
  if (table === 'explosion') return preset in EXPLOSION_PRESETS;
  if (table === 'earthquake') return preset in EARTHQUAKE_PRESETS;
  if (table === 'volcano') return preset in VOLCANO_PRESETS;
  return preset in LANDSLIDE_PRESETS;
}

/**
 * Parse URL search params into an "intent" describing which slices
 * the app store should update after this hydration. The caller is
 * responsible for applying the intent via the store actions; this
 * function is pure and returns null for every field the URL did not
 * express (or expressed invalidly).
 */
export function decodeSearchParamsToIntent(search: URLSearchParams): DecodedStateIntent {
  const rawType = search.get(URL_KEYS.eventType);
  const eventType = isEventType(rawType) ? rawType : null;

  let preset: string | null = null;
  const rawPreset = search.get(URL_KEYS.preset);
  if (rawPreset !== null && eventType !== null && presetBelongsTo(rawPreset, eventType)) {
    preset = rawPreset;
  }

  const lat = numberParam(search, URL_KEYS.latitude);
  const lon = numberParam(search, URL_KEYS.longitude);
  const location =
    lat !== null && lon !== null && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
      ? { latitude: lat, longitude: lon }
      : null;

  const rawMode = search.get(URL_KEYS.mode);
  const mode = isViewMode(rawMode) ? rawMode : null;

  let impactCustomInput: DecodedStateIntent['impactCustomInput'] = null;
  if (eventType === 'impact' && preset === 'CUSTOM') {
    const custom: NonNullable<DecodedStateIntent['impactCustomInput']> = {};
    const d = numberParam(search, URL_KEYS.diameter);
    if (d !== null && d > 0) custom.impactorDiameter = d;
    const v = numberParam(search, URL_KEYS.velocity);
    if (v !== null && v > 0) custom.impactVelocity = v;
    const ang = numberParam(search, URL_KEYS.angleDeg);
    if (ang !== null && ang >= 0 && ang <= 90) custom.impactAngle = ang;
    const rhoI = numberParam(search, URL_KEYS.impactorDensity);
    if (rhoI !== null && rhoI > 0) custom.impactorDensity = rhoI;
    const rhoT = numberParam(search, URL_KEYS.targetDensity);
    if (rhoT !== null && rhoT > 0) custom.targetDensity = rhoT;
    const g = numberParam(search, URL_KEYS.gravity);
    if (g !== null && g > 0) custom.surfaceGravity = g;
    const wd = numberParam(search, URL_KEYS.waterDepth);
    if (wd !== null && wd >= 0) custom.waterDepth = wd;
    const od = numberParam(search, URL_KEYS.meanOceanDepth);
    if (od !== null && od > 0) custom.meanOceanDepth = od;
    impactCustomInput = Object.keys(custom).length > 0 ? custom : null;
  }

  return { eventType, preset, location, mode, impactCustomInput };
}

/**
 * Convenience: turn a bare URL (relative or absolute) into the
 * decoded intent. Pass `window.location.href` from the browser; tests
 * pass crafted strings directly.
 */
export function decodeUrl(url: string, base = 'http://localhost/'): DecodedStateIntent {
  try {
    const parsed = new URL(url, base);
    return decodeSearchParamsToIntent(parsed.searchParams);
  } catch {
    return { eventType: null, preset: null, location: null, mode: null, impactCustomInput: null };
  }
}

/**
 * Apply a decoded intent to the app store. Uses the existing typed
 * actions (`selectEventType`, `selectPreset`, `setLocation`,
 * `setImpactInput`, `setMode`) so each slice validates its own
 * inputs. Anything left `null` in the intent is ignored.
 */
export function applyIntentToStore(intent: DecodedStateIntent, store: AppStore): void {
  if (intent.eventType !== null) store.selectEventType(intent.eventType);

  if (intent.preset !== null && intent.preset !== 'CUSTOM') {
    // selectPreset routes to the correct event-type slice by itself.
    store.selectPreset(intent.preset as Parameters<AppStore['selectPreset']>[0]);
  }

  if (intent.impactCustomInput !== null) {
    store.setImpactInput(intent.impactCustomInput);
  }

  if (intent.location !== null) {
    store.setLocation(intent.location);
  }

  if (intent.mode !== null) {
    store.setMode(intent.mode);
  }
}

/**
 * Reconstruct a SyncableState projection from the full app store.
 * Used by the hook that writes URL params when the store changes —
 * we keep this selector in one place so the set of tracked fields
 * lives next to encode/decode.
 */
export function projectSyncableState(store: AppStore): SyncableState {
  return {
    eventType: store.eventType,
    impact: store.impact,
    explosion: store.explosion,
    earthquake: store.earthquake,
    volcano: store.volcano,
    landslide: store.landslide,
    location: store.location,
    mode: store.mode,
  };
}

/**
 * Helper kept alongside the encoder so the test suite has access to
 * the canonical sets of recognised keys without re-deriving them.
 */
export function knownUrlKeys(): string[] {
  return Object.values(URL_KEYS);
}

// Re-exports to give the unit tests a direct dependency on the SI
// conversions that encode/decode implies — saves a level of
// indirection in the spec file.
export { degreesToRadians, kgPerM3, m as meters, mps, deg };
