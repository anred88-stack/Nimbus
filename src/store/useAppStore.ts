import { create } from 'zustand';
import {
  findNearbyOceanDepth,
  OCEAN_FLOOR_M,
  sampleElevation,
  sampleSlope,
  waldAllen2007Vs30FromSlope,
  type ElevationGrid,
} from '../physics/elevation/index.js';
import {
  computeBathymetricTsunami,
  type BathymetricTsunamiResult,
} from '../physics/tsunami/index.js';
import { populationInRadius, type PopulationLookupResult } from '../scene/populationLookup.js';
import { wrap, type Remote } from 'comlink';
import {
  type EarthquakeMonteCarloMetrics,
  type ExplosionMonteCarloMetrics,
  type ImpactMonteCarloMetrics,
  type MonteCarloOutput,
  type VolcanoMonteCarloMetrics,
} from '../physics/montecarlo/index.js';
import type { MonteCarloWorkerApi } from '../physics/montecarlo/worker.js';
import type { SimulationApi } from '../physics/worker.js';
import {
  EARTHQUAKE_PRESETS,
  simulateEarthquake,
  type EarthquakePresetId,
  type EarthquakeScenarioInput,
  type EarthquakeScenarioResult,
} from '../physics/events/earthquake/index.js';
import {
  LANDSLIDE_PRESETS,
  simulateLandslide,
  type LandslidePresetId,
  type LandslideScenarioInput,
  type LandslideScenarioResult,
} from '../physics/events/landslide/index.js';
import {
  EXPLOSION_PRESETS,
  simulateExplosion,
  type ExplosionPresetId,
  type ExplosionScenarioInput,
  type ExplosionScenarioResult,
} from '../physics/events/explosion/index.js';
import {
  VOLCANO_PRESETS,
  simulateVolcano,
  type VolcanoPresetId,
  type VolcanoScenarioInput,
  type VolcanoScenarioResult,
} from '../physics/events/volcano/index.js';
import {
  IMPACT_PRESETS,
  simulateImpact,
  type ImpactPresetId,
  type ImpactScenarioInput,
  type ImpactScenarioResult,
} from '../physics/simulate.js';
import { deg, degreesToRadians, kgPerM3, m, mps } from '../physics/units.js';

/** Top-level event categories the simulator supports. */
export type EventType = 'impact' | 'explosion' | 'earthquake' | 'volcano' | 'landslide';

/**
 * Geographic pick point from the Cesium globe. Latitude in [−90, 90],
 * longitude in [−180, 180] — WGS84 surface coordinates, no altitude
 * (detonation altitude is a property of the scenario, not the location).
 */
export interface Coordinates {
  latitude: number;
  longitude: number;
}

export type ViewMode = 'landing' | 'globe' | 'methodology' | 'report';
export type SimulationStatus = 'idle' | 'running' | 'error';
export type MonteCarloStatus = 'idle' | 'running' | 'error';
export type TransitionPhase = 'idle' | 'fading-out' | 'fading-in';

/**
 * Lazy-instantiated Monte-Carlo worker. The underlying Worker is
 * only spawned on first use, so a user who never clicks "Run Monte
 * Carlo" pays no bundle/memory cost. Comlink wraps the worker's
 * exposed API so the store calls it as if it were a local function.
 */
let mcWorker: Remote<MonteCarloWorkerApi> | null = null;
function getMonteCarloWorker(): Remote<MonteCarloWorkerApi> {
  if (mcWorker === null) {
    const worker = new Worker(new URL('../physics/montecarlo/worker.ts', import.meta.url), {
      type: 'module',
    });
    mcWorker = wrap<MonteCarloWorkerApi>(worker);
  }
  return mcWorker;
}

/**
 * Lazy-instantiated main physics worker. Hosts the per-event
 * `simulate*` evaluators AND the bathymetric-tsunami fast-marching
 * solver, which is the single biggest CPU sink in the pipeline
 * (≈ 200 ms – 2 s on continental grids). Spawning happens on first
 * `evaluate()`; the worker stays alive for the lifetime of the tab so
 * subsequent "Simula" clicks pay no cold-start cost.
 *
 * Test/SSR fallback: vitest's jsdom environment does NOT ship a real
 * Worker constructor, so spawning would throw at module-load time.
 * When `Worker` is missing (or `new Worker(...)` throws), we hand
 * back a synchronous shim that runs the same Layer-2 functions on
 * the calling thread but still returns Promises — preserving the
 * uniform `await sim.simulateXxx(...)` shape in `evaluate()`.
 */
type SimulationProxy = {
  [K in keyof SimulationApi]: SimulationApi[K] extends (...args: infer P) => infer R
    ? (...args: P) => Promise<R>
    : never;
};
let simWorker: SimulationProxy | null = null;
function getSimulationWorker(): SimulationProxy {
  if (simWorker !== null) return simWorker;

  if (typeof Worker !== 'undefined') {
    try {
      const worker = new Worker(new URL('../physics/worker.ts', import.meta.url), {
        type: 'module',
      });
      simWorker = wrap<SimulationApi>(worker);
      return simWorker;
    } catch (err) {
      console.warn('[store] simulation worker spawn failed, falling back to sync:', err);
    }
  }

  // Sync fallback: runs the SAME deterministic Layer-2 functions
  // (no behavioural drift), but on the calling thread. Still wrapped
  // in async so the caller's `await` works the same in both modes.
  const fallback: SimulationProxy = {
    simulateImpact: (input) => Promise.resolve(simulateImpact(input)),
    simulateExplosion: (input) => Promise.resolve(simulateExplosion(input)),
    simulateEarthquake: (input) => Promise.resolve(simulateEarthquake(input)),
    simulateVolcano: (input) => Promise.resolve(simulateVolcano(input)),
    simulateLandslide: (input) => Promise.resolve(simulateLandslide(input)),
    computeBathymetricTsunami: (input) => Promise.resolve(computeBathymetricTsunami(input)),
  };
  simWorker = fallback;
  return fallback;
}

/** Milliseconds spent in each half of the crossfade. */
export const TRANSITION_HALF_MS = 750;

export type ActiveImpactPreset = ImpactPresetId | 'CUSTOM';
export type ActiveExplosionPreset = ExplosionPresetId | 'CUSTOM';
export type ActiveEarthquakePreset = EarthquakePresetId | 'CUSTOM';
export type ActiveVolcanoPreset = VolcanoPresetId | 'CUSTOM';

/** UI-facing overrides for the impact scenario (plain numbers, SI). */
export interface ImpactInputOverrides {
  impactorDiameter?: number;
  impactVelocity?: number;
  impactorDensity?: number;
  targetDensity?: number;
  impactAngle?: number;
  surfaceGravity?: number;
  /** Compass azimuth (° from N) the impactor travels toward. Drives
   *  the downrange orientation of the asymmetric ejecta blanket. */
  impactAzimuthDeg?: number;
}

/** UI-facing overrides for the explosion scenario. */
export interface ExplosionInputOverrides {
  yieldMegatons?: number;
  groundType?: ExplosionScenarioInput['groundType'];
  /** Height of burst (m) — 0 = contact surface burst. */
  heightOfBurst?: number;
  /** Ambient wind speed at burst altitude (m s⁻¹). 0 = calm. Drives
   *  the Glasstone & Dolan §7.20 thermal-pulse drift envelope on the
   *  thermal-burn ring's rendered shape. */
  windSpeed?: number;
  /** Compass azimuth (° clockwise from N) the wind is blowing TOWARD. */
  windDirectionDeg?: number;
}

/** UI-facing overrides for the earthquake scenario. */
export interface EarthquakeInputOverrides {
  magnitude?: number;
  depth?: number;
  faultType?: EarthquakeScenarioInput['faultType'];
  /** Vs30 (m/s) site reference. */
  vs30?: number;
  /** Megathrust rupture scaling flag (Strasser 2010). */
  subductionInterface?: boolean;
}

/** UI-facing overrides for the landslide scenario. */
export interface LandslideInputOverrides {
  volumeM3?: number;
  slopeAngleDeg?: number;
  meanOceanDepth?: number;
  regime?: LandslideScenarioInput['regime'];
}

/** UI-facing overrides for the volcano scenario. */
export interface VolcanoInputOverrides {
  volumeEruptionRate?: number;
  totalEjectaVolume?: number;
  /** Optional lahar total volume (m³) — triggers Iverson runout. */
  laharVolume?: number;
  /** Optional wind speed (m/s) at plume-top altitude — triggers the
   *  Suzuki-Bonadonna wind-advected ashfall footprint. */
  windSpeed?: number;
  /** Optional wind direction (° clockwise from North) — orients the
   *  ashfall footprint on the globe. */
  windDirectionDegrees?: number;
}

/** Any preset id across event types. Used by the polymorphic
 *  {@link AppStore.selectPreset} action, which routes to the right
 *  slice based on which PRESETS table the id belongs to. */
export type AnyPresetId =
  | ImpactPresetId
  | ExplosionPresetId
  | EarthquakePresetId
  | VolcanoPresetId
  | LandslidePresetId;

/**
 * Discriminated result blob: either null (no run yet), or tagged with
 * the originating event type so UIs can switch on `type` to choose a
 * render path.
 */
export type ActiveResult =
  | { type: 'impact'; data: ImpactScenarioResult }
  | { type: 'explosion'; data: ExplosionScenarioResult }
  | { type: 'earthquake'; data: EarthquakeScenarioResult }
  | { type: 'volcano'; data: VolcanoScenarioResult }
  | { type: 'landslide'; data: LandslideScenarioResult };

/**
 * Per-event Monte-Carlo percentile summary. Each variant re-uses the
 * discriminator of {@link ActiveResult} so UIs can branch on `type`
 * in the same way as the deterministic result.
 */
export type ActiveMonteCarlo =
  | { type: 'impact'; data: MonteCarloOutput<ImpactMonteCarloMetrics> }
  | { type: 'explosion'; data: MonteCarloOutput<ExplosionMonteCarloMetrics> }
  | { type: 'earthquake'; data: MonteCarloOutput<EarthquakeMonteCarloMetrics> }
  | { type: 'volcano'; data: MonteCarloOutput<VolcanoMonteCarloMetrics> };

export type ActiveLandslidePreset = LandslidePresetId | 'CUSTOM';

export interface AppStore {
  // --- Event selection -------------------------------------------------
  eventType: EventType;
  impact: { preset: ActiveImpactPreset; input: ImpactScenarioInput };
  explosion: { preset: ActiveExplosionPreset; input: ExplosionScenarioInput };
  earthquake: { preset: ActiveEarthquakePreset; input: EarthquakeScenarioInput };
  volcano: { preset: ActiveVolcanoPreset; input: VolcanoScenarioInput };
  landslide: { preset: ActiveLandslidePreset; input: LandslideScenarioInput };

  // --- Geographic picker -----------------------------------------------
  location: Coordinates | null;

  // --- Aftershock detail selection ------------------------------------
  /** Index of the aftershock currently "pinned" by a click on its
   *  globe entity, or null when no aftershock is selected. The
   *  Globe layer reads this to render a dim MMI V/VI/VII contour
   *  set around the picked aftershock and to surface the detail
   *  card. Resets whenever the result, location, event type, or
   *  earthquake inputs change. */
  selectedAftershockIndex: number | null;

  // --- Per-ring visibility toggle ------------------------------------
  /** Set of ring keys (matching `RingTooltipKind` in the legend) the
   *  user has hidden via the legend toggle. Empty by default — every
   *  ring renders. The Globe layer reads this through a CallbackProperty
   *  on each entity's `show` field so flipping a row toggles visibility
   *  immediately, without rebuilding the entity collection (and therefore
   *  without restarting the ring-grow animation). Resets on event type,
   *  preset, location, or evaluate so a stale "I hid the 5 m wave-front"
   *  doesn't persist into the next scenario. */
  hiddenRingKeys: ReadonlySet<string>;

  // --- Simulation lifecycle -------------------------------------------
  result: ActiveResult | null;
  /** Optional bathymetric-tsunami isochrones from the Fast Marching
   *  solver. Populated next to `result` whenever the current scenario
   *  triggers a tsunami AND the elevation grid is loaded. Layered out
   *  of the main result envelope because it depends on data the Layer-
   *  2 physics never sees (grid + location) — the store orchestrates. */
  bathymetricTsunami: BathymetricTsunamiResult | null;
  /** Optional population-exposure number derived from a Cloud-
   *  Optimised GeoTIFF lookup (see src/scene/populationLookup.ts).
   *  Populated asynchronously after `evaluate()` writes a result;
   *  null while pending or when the lookup is unavailable. The
   *  `ringLabel` and `radiusM` echo which damage threshold drove
   *  the count so the UI can render "≥ 5 psi: 1.2 M people". */
  populationExposure: (PopulationLookupResult & { ringLabel: string }) | null;
  /** Status of the population fetch — drives a tiny spinner in the
   *  result panel. 'idle' both before any run and after success. */
  populationStatus: 'idle' | 'fetching' | 'error';
  /** Optional Monte-Carlo P10/P50/P90 summary. Populated only when
   *  the user explicitly triggers `evaluateMonteCarlo` — the default
   *  single-shot `evaluate` leaves this as `null`. */
  monteCarlo: ActiveMonteCarlo | null;
  /** Status of the Monte-Carlo worker — `running` while the sweep
   *  is in flight, `error` on failure. UI uses this to show a
   *  loading spinner without freezing the rest of the panel. */
  monteCarloStatus: MonteCarloStatus;
  status: SimulationStatus;
  error: string | null;
  lastEvaluatedAt: number | null;

  // --- Global elevation / bathymetry grid -----------------------------
  /** Optional global DEM raster injected at app startup. When set,
   *  earthquake evaluation derives Vs30 from topographic slope via
   *  Wald & Allen 2007 when the user has not specified one. */
  elevationGrid: ElevationGrid | null;

  // --- View state ------------------------------------------------------
  mode: ViewMode;
  transitionPhase: TransitionPhase;

  // --- Actions ---------------------------------------------------------
  selectEventType: (type: EventType) => void;
  /** Polymorphic preset-switch: detects the event category from the id
   *  and flips `eventType` if needed. */
  selectPreset: (id: AnyPresetId) => void;
  /** Impact-only input overrides (degrees → radians, brand-wrap, mark
   *  the impact preset as CUSTOM). */
  setImpactInput: (overrides: ImpactInputOverrides) => void;
  /** Explosion-input overrides. Marks the explosion preset as CUSTOM. */
  setExplosionInput: (overrides: ExplosionInputOverrides) => void;
  /** Earthquake-input overrides. Marks the earthquake preset as CUSTOM. */
  setEarthquakeInput: (overrides: EarthquakeInputOverrides) => void;
  /** Volcano-input overrides. Marks the volcano preset as CUSTOM. */
  setVolcanoInput: (overrides: VolcanoInputOverrides) => void;
  /** Landslide-input overrides. Marks the landslide preset as CUSTOM. */
  setLandslideInput: (overrides: LandslideInputOverrides) => void;
  setLocation: (coords: Coordinates) => void;
  clearLocation: () => void;
  /** Pin a specific aftershock for click-through detail. The globe
   *  draws three dim MMI V/VI/VII contours around the picked event;
   *  the detail card surfaces magnitude, time-since-mainshock and
   *  estimated felt-intensity reach. */
  selectAftershock: (index: number) => void;
  /** Clear the pinned aftershock selection. */
  clearAftershock: () => void;
  /** Flip the visibility of a single legend row + its globe ring. */
  toggleRingVisibility: (key: string) => void;
  /** Reset every legend toggle so all rings render again. Wired to a
   *  "show all" button in the legend header. */
  showAllRings: () => void;
  /** Install the global DEM raster. Called once at startup by the app
   *  shell after fetching the binary asset. `null` reverts to the
   *  rock-reference (Vs30 = 760) default. */
  setElevationGrid: (grid: ElevationGrid | null) => void;
  evaluate: () => Promise<void>;
  /** Run a Monte-Carlo sweep around the active scenario's nominal
   *  inputs. Uses a seed derived from the scenario preset so the
   *  same URL gives the same percentiles. */
  evaluateMonteCarlo: (iterations?: number) => void;
  setMode: (mode: ViewMode) => void;
  transitionTo: (mode: ViewMode, options?: { instant?: boolean }) => void;
  reset: () => void;
}

const INITIAL_IMPACT_PRESET: ImpactPresetId = 'CHICXULUB';
const INITIAL_EXPLOSION_PRESET: ExplosionPresetId = 'HIROSHIMA_1945';
const INITIAL_EARTHQUAKE_PRESET: EarthquakePresetId = 'TOHOKU_2011';
const INITIAL_VOLCANO_PRESET: VolcanoPresetId = 'KRAKATAU_1883';
const INITIAL_LANDSLIDE_PRESET: LandslidePresetId = 'STOREGGA_8200_BP';

function isImpactPresetId(id: AnyPresetId): id is ImpactPresetId {
  return id in IMPACT_PRESETS;
}
function isExplosionPresetId(id: AnyPresetId): id is ExplosionPresetId {
  return id in EXPLOSION_PRESETS;
}
function isEarthquakePresetId(id: AnyPresetId): id is EarthquakePresetId {
  return id in EARTHQUAKE_PRESETS;
}
function isVolcanoPresetId(id: AnyPresetId): id is VolcanoPresetId {
  return id in VOLCANO_PRESETS;
}
function isLandslidePresetId(id: AnyPresetId): id is LandslidePresetId {
  return id in LANDSLIDE_PRESETS;
}

type InitialSlice = Pick<
  AppStore,
  | 'eventType'
  | 'impact'
  | 'explosion'
  | 'earthquake'
  | 'volcano'
  | 'landslide'
  | 'location'
  | 'selectedAftershockIndex'
  | 'hiddenRingKeys'
  | 'result'
  | 'bathymetricTsunami'
  | 'populationExposure'
  | 'populationStatus'
  | 'monteCarlo'
  | 'monteCarloStatus'
  | 'status'
  | 'error'
  | 'lastEvaluatedAt'
  | 'elevationGrid'
  | 'mode'
  | 'transitionPhase'
>;

function initialState(): InitialSlice {
  return {
    eventType: 'impact',
    impact: {
      preset: INITIAL_IMPACT_PRESET,
      input: IMPACT_PRESETS[INITIAL_IMPACT_PRESET].input,
    },
    explosion: {
      preset: INITIAL_EXPLOSION_PRESET,
      input: EXPLOSION_PRESETS[INITIAL_EXPLOSION_PRESET].input,
    },
    earthquake: {
      preset: INITIAL_EARTHQUAKE_PRESET,
      input: EARTHQUAKE_PRESETS[INITIAL_EARTHQUAKE_PRESET].input,
    },
    volcano: {
      preset: INITIAL_VOLCANO_PRESET,
      input: VOLCANO_PRESETS[INITIAL_VOLCANO_PRESET].input,
    },
    landslide: {
      preset: INITIAL_LANDSLIDE_PRESET,
      input: LANDSLIDE_PRESETS[INITIAL_LANDSLIDE_PRESET].input,
    },
    location: null,
    selectedAftershockIndex: null,
    hiddenRingKeys: new Set<string>(),
    result: null,
    bathymetricTsunami: null,
    populationExposure: null,
    populationStatus: 'idle',
    monteCarlo: null,
    monteCarloStatus: 'idle',
    status: 'idle',
    error: null,
    lastEvaluatedAt: null,
    elevationGrid: null,
    mode: 'landing',
    transitionPhase: 'idle',
  };
}

/** Lower-bound on a beach slope we are willing to use in the
 *  Synolakis run-up: 1:1 000 (≈ 0.057°). Below that the surface is
 *  closer to a tidal flat than a beach and the analytical fit fails. */
const MIN_BEACH_SLOPE_RAD = Math.atan(1 / 1000);
/** Upper-bound on a beach slope: 1:3 (≈ 18°). Above that the surface
 *  is a cliff or steep dune face, not a run-up beach. */
const MAX_BEACH_SLOPE_RAD = Math.atan(1 / 3);

/**
 * Derive the coastal beach slope (rad) from the loaded DEM tile when
 * the click sits on land with a slope inside the
 * [MIN_BEACH_SLOPE_RAD, MAX_BEACH_SLOPE_RAD] envelope. Returns
 * `undefined` when the click is over open water (z < 0) — the source
 * slope of a deep-ocean impact is not a "beach slope" — or when the
 * sampled slope falls outside the envelope. Callers (the per-event
 * branches in `evaluate()`) pass the result straight through to the
 * scenario input; the physics fallback is the textbook 1:100 plane
 * beach.
 *
 * Why we check z first: a 0 m flat seafloor returns slope = 0,
 * which is below the lower bound, so the envelope check would
 * already reject it — but checking elevation first short-circuits
 * the more expensive `sampleSlope` call for the dominant
 * mid-ocean-impact case.
 */
function deriveBeachSlope(
  grid: ElevationGrid | null,
  location: Coordinates | null
): number | undefined {
  if (grid === null || location === null) return undefined;
  if (!gridCoversLocation(grid, location)) return undefined;
  const z = sampleElevation(grid, location.latitude, location.longitude);
  if (z < 0) return undefined;
  const slope = sampleSlope(grid, location.latitude, location.longitude);
  if (!Number.isFinite(slope)) return undefined;
  if (slope < MIN_BEACH_SLOPE_RAD || slope > MAX_BEACH_SLOPE_RAD) return undefined;
  return slope;
}

/** True when the loaded DEM tile actually contains the click point.
 *  Each Terrarium tile covers ≈ 156 km × 156 km (zoom 8); when the
 *  user clicks far away from the previous fetch we can still hold a
 *  stale grid, in which case `sampleElevation` would clamp to the
 *  tile edge and produce a misleading bathymetry value. */
function gridCoversLocation(grid: ElevationGrid, c: Coordinates): boolean {
  return (
    c.latitude >= grid.minLat &&
    c.latitude <= grid.maxLat &&
    c.longitude >= grid.minLon &&
    c.longitude <= grid.maxLon
  );
}

/** Strip out the source-amplitude metadata the FMM amplitude module
 *  needs from whichever event-type tsunami block fired. Returns null
 *  when no headline amplitude can be derived (e.g. an earthquake
 *  tsunami missing its initialAmplitude). */
function extractTsunamiMeta(
  result: ActiveResult
): { sourceAmplitudeM: number; sourceCavityRadiusM: number; sourceDepthM: number } | null {
  if (result.type === 'impact' && result.data.tsunami !== undefined) {
    const t = result.data.tsunami;
    return {
      sourceAmplitudeM: t.sourceAmplitude,
      sourceCavityRadiusM: t.cavityRadius,
      sourceDepthM: t.meanOceanDepth,
    };
  }
  if (result.type === 'explosion' && result.data.tsunami !== undefined) {
    const t = result.data.tsunami;
    return {
      sourceAmplitudeM: t.sourceAmplitude,
      sourceCavityRadiusM: t.cavityRadius,
      sourceDepthM: t.meanOceanDepth,
    };
  }
  if (result.type === 'volcano' && result.data.tsunami !== undefined) {
    const t = result.data.tsunami;
    return {
      sourceAmplitudeM: t.sourceAmplitude,
      sourceCavityRadiusM: t.cavityRadius,
      sourceDepthM: t.meanOceanDepth,
    };
  }
  if (result.type === 'landslide' && result.data.tsunami !== null) {
    const t = result.data.tsunami;
    return {
      sourceAmplitudeM: t.sourceAmplitude,
      sourceCavityRadiusM: t.cavityRadius,
      sourceDepthM: t.meanOceanDepth,
    };
  }
  if (result.type === 'earthquake' && result.data.tsunami !== undefined) {
    const t = result.data.tsunami;
    // Earthquake tsunami doesn't carry a cavity radius — back-derive
    // one from the rupture length so the geometric-spreading factor
    // has a sensible R₀. The 1 000 m default depth covers most
    // megathrust subduction zones.
    return {
      sourceAmplitudeM: t.initialAmplitude,
      sourceCavityRadiusM: Math.max((result.data.ruptureLength as number) / 4, 10_000),
      sourceDepthM: 4_000,
    };
  }
  return null;
}

/** Pick the most representative damage radius for the population
 *  lookup, per event type. Each return value carries a short i18n
 *  label key the UI can render alongside the count ("Population
 *  exposed to ≥ 5 psi: …"). Returns null when the result genuinely
 *  has no land-based damage radius worth measuring (e.g. landslides
 *  — they generate tsunamis, the population at risk is on the far
 *  shore, not at the slide source). */
function headlineRingForResult(result: ActiveResult): { radiusM: number; label: string } | null {
  switch (result.type) {
    case 'impact': {
      const r = result.data.damage.overpressure5psi as number;
      return r > 0 ? { radiusM: r, label: 'population.ring.overpressure5psi' } : null;
    }
    case 'explosion': {
      const r = result.data.blast.overpressure5psiRadiusHob as number;
      return r > 0 ? { radiusM: r, label: 'population.ring.overpressure5psi' } : null;
    }
    case 'earthquake': {
      const r = result.data.shaking.mmi8Radius as number;
      return r > 0 ? { radiusM: r, label: 'population.ring.mmi8' } : null;
    }
    case 'volcano': {
      const r = result.data.pyroclasticRunout as number;
      return r > 0 ? { radiusM: r, label: 'population.ring.pyroclasticRunout' } : null;
    }
    case 'landslide':
      return null;
  }
}

function isValidCoordinates(c: Coordinates): boolean {
  return (
    Number.isFinite(c.latitude) &&
    Number.isFinite(c.longitude) &&
    c.latitude >= -90 &&
    c.latitude <= 90 &&
    c.longitude >= -180 &&
    c.longitude <= 180
  );
}

/**
 * Canonical app store. See docs/ARCHITECTURE.md §"The store" for the
 * layering rationale: it sits between the headless physics layer (L2)
 * and the React UI (L4), exposing actions that the UI invokes and
 * typed-result slices that Globe / Stage read via selectors.
 */
export const useAppStore = create<AppStore>((set, get) => ({
  ...initialState(),

  selectEventType: (type) => {
    set({
      eventType: type,
      selectedAftershockIndex: null,
      hiddenRingKeys: new Set<string>(),
      result: null,
      bathymetricTsunami: null,
      populationExposure: null,
      populationStatus: 'idle',
      monteCarlo: null,
      monteCarloStatus: 'idle',
      status: 'idle',
      error: null,
      lastEvaluatedAt: null,
    });
  },

  toggleRingVisibility: (key) => {
    set((state) => {
      const next = new Set(state.hiddenRingKeys);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { hiddenRingKeys: next };
    });
  },

  showAllRings: () => {
    set({ hiddenRingKeys: new Set<string>() });
  },

  selectPreset: (id) => {
    if (isImpactPresetId(id)) {
      set({
        eventType: 'impact',
        impact: { preset: id, input: IMPACT_PRESETS[id].input },
        selectedAftershockIndex: null,
        result: null,
        bathymetricTsunami: null,
        populationExposure: null,
        populationStatus: 'idle',
        monteCarlo: null,
        monteCarloStatus: 'idle',
        status: 'idle',
        error: null,
        lastEvaluatedAt: null,
      });
      return;
    }
    if (isExplosionPresetId(id)) {
      set({
        eventType: 'explosion',
        explosion: { preset: id, input: EXPLOSION_PRESETS[id].input },
        selectedAftershockIndex: null,
        result: null,
        bathymetricTsunami: null,
        populationExposure: null,
        populationStatus: 'idle',
        monteCarlo: null,
        monteCarloStatus: 'idle',
        status: 'idle',
        error: null,
        lastEvaluatedAt: null,
      });
      return;
    }
    if (isEarthquakePresetId(id)) {
      set({
        eventType: 'earthquake',
        earthquake: { preset: id, input: EARTHQUAKE_PRESETS[id].input },
        selectedAftershockIndex: null,
        result: null,
        bathymetricTsunami: null,
        populationExposure: null,
        populationStatus: 'idle',
        monteCarlo: null,
        monteCarloStatus: 'idle',
        status: 'idle',
        error: null,
        lastEvaluatedAt: null,
      });
      return;
    }
    if (isVolcanoPresetId(id)) {
      set({
        eventType: 'volcano',
        volcano: { preset: id, input: VOLCANO_PRESETS[id].input },
        selectedAftershockIndex: null,
        result: null,
        bathymetricTsunami: null,
        populationExposure: null,
        populationStatus: 'idle',
        monteCarlo: null,
        monteCarloStatus: 'idle',
        status: 'idle',
        error: null,
        lastEvaluatedAt: null,
      });
      return;
    }
    if (isLandslidePresetId(id)) {
      set({
        eventType: 'landslide',
        landslide: { preset: id, input: LANDSLIDE_PRESETS[id].input },
        selectedAftershockIndex: null,
        result: null,
        bathymetricTsunami: null,
        populationExposure: null,
        populationStatus: 'idle',
        monteCarlo: null,
        monteCarloStatus: 'idle',
        status: 'idle',
        error: null,
        lastEvaluatedAt: null,
      });
      return;
    }
    throw new Error(`Unknown preset id: ${String(id)}`);
  },

  setImpactInput: (overrides) => {
    set((state) => {
      const next: ImpactScenarioInput = { ...state.impact.input };
      if (overrides.impactorDiameter !== undefined) {
        next.impactorDiameter = m(overrides.impactorDiameter);
      }
      if (overrides.impactVelocity !== undefined) {
        next.impactVelocity = mps(overrides.impactVelocity);
      }
      if (overrides.impactorDensity !== undefined) {
        next.impactorDensity = kgPerM3(overrides.impactorDensity);
      }
      if (overrides.targetDensity !== undefined) {
        next.targetDensity = kgPerM3(overrides.targetDensity);
      }
      if (overrides.impactAngle !== undefined) {
        next.impactAngle = degreesToRadians(deg(overrides.impactAngle));
      }
      if (overrides.surfaceGravity !== undefined) {
        next.surfaceGravity = overrides.surfaceGravity;
      }
      if (overrides.impactAzimuthDeg !== undefined && Number.isFinite(overrides.impactAzimuthDeg)) {
        // Normalise to [0, 360).
        next.impactAzimuthDeg = ((overrides.impactAzimuthDeg % 360) + 360) % 360;
      }
      return {
        eventType: 'impact',
        impact: { preset: 'CUSTOM', input: next },
        selectedAftershockIndex: null,
        result: null,
        bathymetricTsunami: null,
        populationExposure: null,
        populationStatus: 'idle',
        monteCarlo: null,
        monteCarloStatus: 'idle',
        status: 'idle',
        error: null,
        lastEvaluatedAt: null,
      };
    });
  },

  setExplosionInput: (overrides) => {
    set((state) => {
      const next: ExplosionScenarioInput = { ...state.explosion.input };
      if (overrides.yieldMegatons !== undefined && overrides.yieldMegatons > 0) {
        next.yieldMegatons = overrides.yieldMegatons;
      }
      if (overrides.groundType !== undefined) {
        next.groundType = overrides.groundType;
      }
      if (overrides.heightOfBurst !== undefined && overrides.heightOfBurst >= 0) {
        next.heightOfBurst = m(overrides.heightOfBurst);
      }
      if (overrides.windSpeed !== undefined && overrides.windSpeed >= 0) {
        next.windSpeed = mps(overrides.windSpeed);
      }
      if (overrides.windDirectionDeg !== undefined && Number.isFinite(overrides.windDirectionDeg)) {
        next.windDirectionDeg = ((overrides.windDirectionDeg % 360) + 360) % 360;
      }
      return {
        eventType: 'explosion',
        explosion: { preset: 'CUSTOM', input: next },
        selectedAftershockIndex: null,
        result: null,
        bathymetricTsunami: null,
        populationExposure: null,
        populationStatus: 'idle',
        monteCarlo: null,
        monteCarloStatus: 'idle',
        status: 'idle',
        error: null,
        lastEvaluatedAt: null,
      };
    });
  },

  setEarthquakeInput: (overrides) => {
    set((state) => {
      const next: EarthquakeScenarioInput = { ...state.earthquake.input };
      if (overrides.magnitude !== undefined && overrides.magnitude > 0) {
        next.magnitude = overrides.magnitude;
      }
      if (overrides.depth !== undefined && overrides.depth >= 0) {
        next.depth = m(overrides.depth);
      }
      if (overrides.faultType !== undefined) {
        next.faultType = overrides.faultType;
      }
      if (overrides.vs30 !== undefined && overrides.vs30 > 0) {
        next.vs30 = overrides.vs30;
      }
      if (overrides.subductionInterface !== undefined) {
        next.subductionInterface = overrides.subductionInterface;
      }
      return {
        eventType: 'earthquake',
        earthquake: { preset: 'CUSTOM', input: next },
        selectedAftershockIndex: null,
        result: null,
        bathymetricTsunami: null,
        populationExposure: null,
        populationStatus: 'idle',
        monteCarlo: null,
        monteCarloStatus: 'idle',
        status: 'idle',
        error: null,
        lastEvaluatedAt: null,
      };
    });
  },

  setVolcanoInput: (overrides) => {
    set((state) => {
      const next: VolcanoScenarioInput = { ...state.volcano.input };
      if (overrides.volumeEruptionRate !== undefined && overrides.volumeEruptionRate > 0) {
        next.volumeEruptionRate = overrides.volumeEruptionRate;
      }
      if (overrides.totalEjectaVolume !== undefined && overrides.totalEjectaVolume > 0) {
        next.totalEjectaVolume = overrides.totalEjectaVolume;
      }
      if (overrides.laharVolume !== undefined && overrides.laharVolume >= 0) {
        next.laharVolume = overrides.laharVolume;
      }
      if (overrides.windSpeed !== undefined && overrides.windSpeed >= 0) {
        next.windSpeed = overrides.windSpeed;
      }
      if (
        overrides.windDirectionDegrees !== undefined &&
        Number.isFinite(overrides.windDirectionDegrees)
      ) {
        // Normalise to [0, 360).
        next.windDirectionDegrees = ((overrides.windDirectionDegrees % 360) + 360) % 360;
      }
      return {
        eventType: 'volcano',
        volcano: { preset: 'CUSTOM', input: next },
        selectedAftershockIndex: null,
        result: null,
        bathymetricTsunami: null,
        populationExposure: null,
        populationStatus: 'idle',
        monteCarlo: null,
        monteCarloStatus: 'idle',
        status: 'idle',
        error: null,
        lastEvaluatedAt: null,
      };
    });
  },

  setLandslideInput: (overrides) => {
    set((state) => {
      const next: LandslideScenarioInput = { ...state.landslide.input };
      if (overrides.volumeM3 !== undefined && overrides.volumeM3 > 0) {
        next.volumeM3 = overrides.volumeM3;
      }
      if (overrides.slopeAngleDeg !== undefined && overrides.slopeAngleDeg > 0) {
        next.slopeAngleDeg = overrides.slopeAngleDeg;
      }
      if (overrides.meanOceanDepth !== undefined && overrides.meanOceanDepth > 0) {
        next.meanOceanDepth = m(overrides.meanOceanDepth);
      }
      if (overrides.regime !== undefined) {
        next.regime = overrides.regime;
      }
      return {
        eventType: 'landslide',
        landslide: { preset: 'CUSTOM', input: next },
        selectedAftershockIndex: null,
        result: null,
        bathymetricTsunami: null,
        populationExposure: null,
        populationStatus: 'idle',
        monteCarlo: null,
        monteCarloStatus: 'idle',
        status: 'idle',
        error: null,
        lastEvaluatedAt: null,
      };
    });
  },

  setLocation: (coords) => {
    if (!isValidCoordinates(coords)) {
      throw new Error(
        `Invalid coordinates: ${JSON.stringify(coords)}. Latitude must be [−90, 90], longitude [−180, 180].`
      );
    }
    // A fresh epicentre pick supersedes any pinned aftershock — the
    // selection points at an entity that the next render pass will
    // tear down.
    set({ location: coords, selectedAftershockIndex: null });
  },

  clearLocation: () => {
    set({ location: null, selectedAftershockIndex: null });
  },

  selectAftershock: (index) => {
    if (!Number.isInteger(index) || index < 0) {
      throw new Error(
        `Aftershock index must be a non-negative integer (received ${String(index)}).`
      );
    }
    set({ selectedAftershockIndex: index });
  },

  clearAftershock: () => {
    set({ selectedAftershockIndex: null });
  },

  setElevationGrid: (grid) => {
    set({ elevationGrid: grid });
    if (grid === null) return;
    // Race-condition catch-up: the user may have clicked "Simula" in
    // the brief window between picking an ocean point and the
    // Terrarium tile arriving. If the prior evaluate produced an
    // impact / explosion result without a tsunami AND the freshly-
    // loaded grid puts the pick at or near water, transparently
    // re-run so the tsunami cascade appears without a second
    // "Simula" click. "Near" means a 5 km neighbourhood — same
    // search radius used by the evaluators below — so coastal
    // clicks (Yucatán shore, Beirut quay) catch up too, not only
    // open-ocean picks.
    const state = get();
    if (state.location === null || !gridCoversLocation(grid, state.location)) return;
    const z = sampleElevation(grid, state.location.latitude, state.location.longitude);
    // Re-evaluate when:
    //   - impact is pending and the click is over open water (impact
    //     tsunami requires the source itself to be submerged), or
    //   - explosion is pending and the click is at or near water (Beirut
    //     / Castle Bravo coastal coupling — see the evaluator).
    const isOceanic = z < OCEAN_FLOOR_M;
    const hasNearbyOcean =
      findNearbyOceanDepth(grid, state.location.latitude, state.location.longitude, 5_000) !== null;
    const impactPending =
      state.eventType === 'impact' &&
      state.result?.type === 'impact' &&
      state.impact.input.waterDepth === undefined;
    const explosionPending =
      state.eventType === 'explosion' &&
      state.result?.type === 'explosion' &&
      state.explosion.input.waterDepth === undefined;
    if ((impactPending && isOceanic) || (explosionPending && (isOceanic || hasNearbyOcean))) {
      void get().evaluate();
    }
  },

  evaluate: async () => {
    const state = get();
    set({ status: 'running', error: null });
    const sim = getSimulationWorker();
    try {
      let result: ActiveResult;
      if (state.eventType === 'impact') {
        // Auto-derive waterDepth from bathymetry when:
        //   1. user hasn't manually set it (preset CHICXULUB_OCEAN ships
        //      with explicit waterDepth; custom inputs leave it
        //      undefined),
        //   2. an elevation grid is loaded that actually covers the
        //      pick point (per-click Terrarium tile, see
        //      src/scene/terrainSampling.ts), and
        //   3. the pick point sits below sea level. Terrarium encodes
        //      bathymetry from ETOPO1, so negative samples are real
        //      water depths. The −10 m floor filters DEM noise around
        //      the coastline so a sandbar one pixel below MSL doesn't
        //      misfire the tsunami cascade.
        let impactInput = state.impact.input;
        if (
          impactInput.waterDepth === undefined &&
          state.elevationGrid !== null &&
          state.location !== null &&
          gridCoversLocation(state.elevationGrid, state.location)
        ) {
          const z = sampleElevation(
            state.elevationGrid,
            state.location.latitude,
            state.location.longitude
          );
          // Tsunami source needs the impactor to actually piston a
          // water column, which only happens when the click point is
          // itself below sea level. Earlier code synthesised a ~200 m
          // depth from any ocean cell within 5 km; that produced a
          // spurious wave train for inland-near-coast clicks (Tunguska
          // dropped on Sicily auto-fired the Ward-Asphaug cavity even
          // though the cavity itself is ~1 km across and never reaches
          // the sea). For impacts we now require the click cell to be
          // open water — the explosion branch keeps the coastal
          // synthesis because Beirut / Castle Bravo really did couple
          // into a quayside basin.
          if (z < OCEAN_FLOOR_M) {
            impactInput = { ...impactInput, waterDepth: m(-z) };
          }
        }
        // DEM-driven beach slope for the Synolakis run-up — see
        // `deriveBeachSlope` for the envelope check. Open-ocean
        // clicks return undefined and the physics falls back to the
        // 1:100 reference, which is the right behaviour for a
        // mid-ocean impact whose run-up is computed at an
        // unspecified far-field coast.
        if (impactInput.coastalBeachSlopeRad === undefined) {
          const beachSlope = deriveBeachSlope(state.elevationGrid, state.location);
          if (beachSlope !== undefined) {
            impactInput = { ...impactInput, coastalBeachSlopeRad: beachSlope };
          }
        }
        result = { type: 'impact', data: await sim.simulateImpact(impactInput) };
      } else if (state.eventType === 'explosion') {
        // Auto-derive waterDepth from bathymetry (same pattern as
        // impact above): if the user picked an ocean point and the
        // Terrarium tile covers it, feed the negative elevation as
        // the burst-water depth. The Glasstone underwater-burst
        // tsunami branch then fires automatically.
        //
        // Coastal fall-through: if the click cell itself is land
        // (positive elevation — a quay, a beach, a pier), we still
        // search a 5 km neighbourhood for ocean cells. Beirut 2020
        // sat on +0–10 m of reclaimed quay yet generated a small
        // wave train into the harbour; without this fall-through the
        // store would set no waterDepth and the cascade would silently
        // drop the coastal-tsunami branch. The coupling efficiency
        // for a near-shore burst is lower than a true contact-water
        // burst, so we cap the synthetic depth at 200 m and rely on
        // the existing Glasstone factor in `explosionTsunami` to
        // dampen the headline amplitude — a separate follow-up will
        // introduce a "near-shore" coupling correction proper.
        let explosionInput = state.explosion.input;
        if (
          explosionInput.waterDepth === undefined &&
          state.elevationGrid !== null &&
          state.location !== null &&
          gridCoversLocation(state.elevationGrid, state.location)
        ) {
          const z = sampleElevation(
            state.elevationGrid,
            state.location.latitude,
            state.location.longitude
          );
          if (z < OCEAN_FLOOR_M) {
            explosionInput = { ...explosionInput, waterDepth: m(-z) };
          } else {
            // Land cell — try the 5 km neighbourhood.
            const coastalDepth = findNearbyOceanDepth(
              state.elevationGrid,
              state.location.latitude,
              state.location.longitude,
              5_000
            );
            if (coastalDepth !== null) {
              const cappedDepth = Math.min(coastalDepth, 200);
              explosionInput = { ...explosionInput, waterDepth: m(cappedDepth) };
            }
          }
        }
        // DEM-driven beach slope for the Synolakis run-up. For coastal
        // bursts (Beirut, Castle Bravo) the click sits on land with a
        // real local slope — exactly the case where the local DEM is
        // more meaningful than the 1:100 textbook reference.
        if (explosionInput.coastalBeachSlopeRad === undefined) {
          const beachSlope = deriveBeachSlope(state.elevationGrid, state.location);
          if (beachSlope !== undefined) {
            explosionInput = { ...explosionInput, coastalBeachSlopeRad: beachSlope };
          }
        }
        result = { type: 'explosion', data: await sim.simulateExplosion(explosionInput) };
      } else if (state.eventType === 'earthquake') {
        // Auto-derive Vs30 from the topographic-slope proxy when the
        // user has not specified one AND an elevation grid is loaded.
        let earthquakeInput = state.earthquake.input;
        if (
          state.earthquake.input.vs30 === undefined &&
          state.location !== null &&
          state.elevationGrid !== null
        ) {
          const slope = sampleSlope(
            state.elevationGrid,
            state.location.latitude,
            state.location.longitude
          );
          const vs30 = waldAllen2007Vs30FromSlope(slope);
          earthquakeInput = { ...earthquakeInput, vs30 };
        }
        // Auto-derive waterDepth from the bathymetry sample when the
        // user has not specified one AND an elevation grid is loaded.
        // Negative elevation = below sea level. The 10 m floor matches
        // the explosion branch — anything shallower is treated as a
        // foreshore /tidal flat where the submarine tsunami pipeline
        // is not appropriate.
        if (
          state.earthquake.input.waterDepth === undefined &&
          state.location !== null &&
          state.elevationGrid !== null &&
          gridCoversLocation(state.elevationGrid, state.location)
        ) {
          const z = sampleElevation(
            state.elevationGrid,
            state.location.latitude,
            state.location.longitude
          );
          if (z < OCEAN_FLOOR_M) {
            earthquakeInput = { ...earthquakeInput, waterDepth: m(-z) };
          }
        }
        // DEM-driven beach slope for the seismic-tsunami run-up.
        // For coastal megathrusts (Tōhoku, Sumatra) the relevant
        // shore is far from the rupture and the source slope is the
        // continental slope (too steep) — the envelope check filters
        // those out. For shallow continental events (L'Aquila,
        // Northridge) tsunami doesn't trigger anyway. The fallback
        // 1:100 reference covers both cases honestly.
        if (earthquakeInput.coastalBeachSlopeRad === undefined) {
          const beachSlope = deriveBeachSlope(state.elevationGrid, state.location);
          if (beachSlope !== undefined) {
            earthquakeInput = { ...earthquakeInput, coastalBeachSlopeRad: beachSlope };
          }
        }
        result = { type: 'earthquake', data: await sim.simulateEarthquake(earthquakeInput) };
      } else if (state.eventType === 'volcano') {
        result = { type: 'volcano', data: await sim.simulateVolcano(state.volcano.input) };
      } else {
        result = { type: 'landslide', data: await sim.simulateLandslide(state.landslide.input) };
      }

      // Bathymetric-tsunami isochrones (FMM). Computed next to the
      // event result whenever:
      //   1. An ElevationGrid has been injected at app startup, and
      //   2. The run actually produced a tsunami source, and
      //   3. A location is known (the FMM source point).
      // Routed through the same physics worker as the simulate*()
      // calls — on continental grids this is the slowest step in
      // the pipeline (200 ms – 2 s) and keeping it on the main
      // thread is what froze the UI before this fix.
      let bathymetricTsunami: BathymetricTsunamiResult | null = null;
      const triggersTsunami =
        (result.type === 'impact' && result.data.tsunami !== undefined) ||
        (result.type === 'earthquake' && result.data.tsunami !== undefined) ||
        (result.type === 'explosion' && result.data.tsunami !== undefined) ||
        (result.type === 'volcano' && result.data.tsunami !== undefined) ||
        (result.type === 'landslide' && result.data.tsunami !== null);
      if (triggersTsunami && state.elevationGrid !== null && state.location !== null) {
        try {
          // Pull the source amplitude + cavity radius from whichever
          // event-type tsunami block fired. The amplitude module
          // gracefully no-ops when the metadata is missing, but
          // forwarding it lets the Globe render the wave-height
          // heatmap on top of the arrival contours.
          const tsunamiMeta = extractTsunamiMeta(result);
          bathymetricTsunami = await sim.computeBathymetricTsunami({
            grid: state.elevationGrid,
            sourceLatitude: state.location.latitude,
            sourceLongitude: state.location.longitude,
            ...(tsunamiMeta !== null && {
              sourceAmplitudeM: tsunamiMeta.sourceAmplitudeM,
              sourceCavityRadiusM: tsunamiMeta.sourceCavityRadiusM,
              sourceDepthM: tsunamiMeta.sourceDepthM,
            }),
          });
        } catch {
          // If the grid doesn't cover the source, FMM won't throw but
          // isochrones may be empty — fall back to null silently.
          bathymetricTsunami = null;
        }
      }

      set({
        result,
        bathymetricTsunami,
        populationExposure: null,
        populationStatus: 'fetching',
        status: 'idle',
        lastEvaluatedAt: Date.now(),
      });

      // Kick off the COG-backed population lookup as fire-and-forget.
      // The deterministic physics result is already in the store —
      // population is a downstream enrichment that the UI shows when
      // (and if) it lands. A failure inside populationInRadius writes
      // null + 'error' status; we never block the simulator on it.
      const headline = headlineRingForResult(result);
      if (state.location !== null && headline !== null) {
        const target = headline;
        const targetLocation = state.location;
        void populationInRadius(targetLocation.latitude, targetLocation.longitude, target.radiusM)
          .then((res) => {
            const current = get();
            if (current.result !== result) return; // stale — superseded by a newer evaluate
            if (res === null) {
              set({ populationExposure: null, populationStatus: 'error' });
              return;
            }
            set({
              populationExposure: { ...res, ringLabel: target.label },
              populationStatus: 'idle',
            });
          })
          .catch((err: unknown) => {
            console.warn('[populationLookup] dispatch failed:', err);
            set({ populationExposure: null, populationStatus: 'error' });
          });
      } else {
        set({ populationStatus: 'idle' });
      }
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        selectedAftershockIndex: null,
        result: null,
        bathymetricTsunami: null,
        populationExposure: null,
        populationStatus: 'idle',
        monteCarlo: null,
      });
    }
  },

  evaluateMonteCarlo: (iterations) => {
    const state = get();
    // Landslide is deterministic-only at this layer (no parameter
    // distributions wired through the MC worker yet). Refuse the
    // sweep gracefully so the UI gets a clear error rather than a
    // worker timeout.
    if (state.eventType === 'landslide') {
      set({
        monteCarloStatus: 'error',
        error: 'Monte Carlo not yet supported for landslide scenarios',
      });
      return;
    }
    // Default bumped to 1 000 iterations now that the sweep runs off
    // the main thread; UI stays at 60 fps during the ~25 ms sweep.
    const n = iterations ?? 1_000;
    const presetTag =
      state.eventType === 'impact'
        ? state.impact.preset
        : state.eventType === 'explosion'
          ? state.explosion.preset
          : state.eventType === 'earthquake'
            ? state.earthquake.preset
            : state.volcano.preset;
    const seed = `${state.eventType}:${presetTag}:${n.toString()}`;

    set({ monteCarloStatus: 'running' });
    const worker = getMonteCarloWorker();
    const run = async (): Promise<void> => {
      try {
        let mc: ActiveMonteCarlo;
        if (state.eventType === 'impact') {
          mc = { type: 'impact', data: await worker.runImpact(state.impact.input, n, seed) };
        } else if (state.eventType === 'explosion') {
          mc = {
            type: 'explosion',
            data: await worker.runExplosion(state.explosion.input, n, seed),
          };
        } else if (state.eventType === 'earthquake') {
          mc = {
            type: 'earthquake',
            data: await worker.runEarthquake(state.earthquake.input, n, seed),
          };
        } else {
          mc = { type: 'volcano', data: await worker.runVolcano(state.volcano.input, n, seed) };
        }
        // Only apply if the active scenario hasn't been swapped out
        // from under us while the sweep was in flight.
        const current = get();
        if (current.eventType === state.eventType) {
          set({ monteCarlo: mc, monteCarloStatus: 'idle' });
        }
      } catch (err) {
        console.error('[Monte Carlo] worker sweep failed:', err);
        set({ monteCarloStatus: 'error' });
      }
    };
    void run();
  },

  setMode: (mode) => {
    set({ mode, transitionPhase: 'idle' });
  },

  transitionTo: (target, options) => {
    const { mode, transitionPhase } = get();
    if (mode === target && transitionPhase === 'idle') return;
    if (transitionPhase !== 'idle') return;

    if (options?.instant ?? false) {
      set({ mode: target, transitionPhase: 'idle' });
      return;
    }

    set({ transitionPhase: 'fading-out' });
    setTimeout(() => {
      set({ mode: target, transitionPhase: 'fading-in' });
      setTimeout(() => {
        set({ transitionPhase: 'idle' });
      }, TRANSITION_HALF_MS);
    }, TRANSITION_HALF_MS);
  },

  reset: () => {
    set(initialState());
  },
}));

/** Reset the singleton store to its initial state (tests / HMR). */
export function resetAppStore(): void {
  useAppStore.setState(initialState());
}
