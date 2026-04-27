import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { simulateEarthquake } from '../physics/events/earthquake/index.js';
import { EXPLOSION_PRESETS, simulateExplosion } from '../physics/events/explosion/index.js';
import { LANDSLIDE_PRESETS, simulateLandslide } from '../physics/events/landslide/index.js';
import { makeElevationGrid } from '../physics/elevation/index.js';
import { IMPACT_PRESETS, simulateImpact } from '../physics/simulate.js';
import { m } from '../physics/units.js';
import {
  gateEarthquakeByTerrain,
  gateExplosionByTerrain,
  gateImpactByTerrain,
  resetAppStore,
  useAppStore,
} from './useAppStore.js';

// Bigger Chicxulub-class baseline so the entry pipeline classifies
// the impact as INTACT (gf = 1) and the post-evaluate gates have
// real numbers to zero out. Tunguska is too small for the firestorm
// branch to fire on its own.
const CHICXULUB_LAND = simulateImpact(IMPACT_PRESETS.CHICXULUB.input);
// Same impactor with explicit ocean inputs — drives the tsunami
// branch into the result, plus non-zero firestorm + liquefaction.
const CHICXULUB_OCEAN = simulateImpact(IMPACT_PRESETS.CHICXULUB_OCEAN.input);

describe('gateImpactByTerrain', () => {
  it('hands back the original result when the click is on land', () => {
    const out = gateImpactByTerrain(CHICXULUB_LAND, false);
    expect(out).toBe(CHICXULUB_LAND);
  });

  it('zeroes firestorm + liquefaction when the click is in open water', () => {
    expect(CHICXULUB_OCEAN.firestorm.ignitionRadius as number).toBeGreaterThan(0);
    expect(CHICXULUB_OCEAN.seismic.liquefactionRadius as number).toBeGreaterThan(0);
    const out = gateImpactByTerrain(CHICXULUB_OCEAN, true);
    expect(out.firestorm.ignitionRadius as number).toBe(0);
    expect(out.firestorm.sustainRadius as number).toBe(0);
    expect(out.firestorm.ignitionArea as number).toBe(0);
    expect(out.seismic.liquefactionRadius as number).toBe(0);
  });

  it('preserves crater + tsunami output for an oceanic impact', () => {
    const out = gateImpactByTerrain(CHICXULUB_OCEAN, true);
    expect(out.crater.finalDiameter as number).toBeGreaterThan(0);
    expect(out.tsunami).not.toBeNull();
    expect(out.tsunami).toEqual(CHICXULUB_OCEAN.tsunami);
  });
});

describe('gateExplosionByTerrain', () => {
  // 50 Mt thermonuclear groundburst — Tsar Bomba scaled to a yield
  // that produces non-zero firestorm and crater radii so the gating
  // is observable.
  const tsarLand = simulateExplosion(EXPLOSION_PRESETS.TSAR_BOMBA_1961.input);

  it('passes the result through on land', () => {
    expect(gateExplosionByTerrain(tsarLand, false)).toBe(tsarLand);
  });

  it('zeroes crater + firestorm on a deep-ocean burst', () => {
    expect(tsarLand.firestorm.ignitionRadius as number).toBeGreaterThan(0);
    const out = gateExplosionByTerrain(tsarLand, true);
    expect(out.crater.apparentDiameter as number).toBe(0);
    expect(out.firestorm.ignitionRadius as number).toBe(0);
    expect(out.firestorm.sustainRadius as number).toBe(0);
    expect(out.firestorm.ignitionArea as number).toBe(0);
    expect(out.firestorm.sustainArea as number).toBe(0);
  });

  it('keeps the blast / thermal / radiation outputs (those happen above the surface regardless)', () => {
    const out = gateExplosionByTerrain(tsarLand, true);
    expect(out.blast).toEqual(tsarLand.blast);
    expect(out.thermal).toEqual(tsarLand.thermal);
    expect(out.radiation).toEqual(tsarLand.radiation);
    expect(out.emp).toEqual(tsarLand.emp);
  });
});

describe('gateEarthquakeByTerrain', () => {
  it('hands a continental-fault result back unchanged', () => {
    const continental = simulateEarthquake({
      magnitude: 7.0,
      faultType: 'reverse',
    });
    expect(continental.isSubmarine).toBe(false);
    expect(gateEarthquakeByTerrain(continental)).toBe(continental);
  });

  it('zeroes shaking.liquefactionRadius for a submarine megathrust', () => {
    const submarine = simulateEarthquake({
      magnitude: 9.1,
      faultType: 'reverse',
      subductionInterface: true,
      waterDepth: m(7_000),
    });
    expect(submarine.isSubmarine).toBe(true);
    expect(submarine.shaking.liquefactionRadius as number).toBeGreaterThan(0);
    const gated = gateEarthquakeByTerrain(submarine);
    expect(gated.shaking.liquefactionRadius as number).toBe(0);
    // MMI rings + tsunami stay — those are the right channel for the
    // coastal effects of a submarine event.
    expect(gated.shaking.mmi7Radius).toEqual(submarine.shaking.mmi7Radius);
    expect(gated.tsunami).toEqual(submarine.tsunami);
  });
});

/**
 * 9 × 9 sample grid where the centre cell sits at sea level (a quay,
 * a reef, an atoll) and the surrounding cells are 50 m below — the
 * minimal shape that lets `findNearbyOceanDepth` succeed without
 * dragging in a real Terrarium tile.
 */
function makeCoastalGrid() {
  const N = 9;
  const samples = new Float32Array(N * N);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      samples[i * N + j] = i === 4 && j === 4 ? 0 : -50;
    }
  }
  return makeElevationGrid({
    minLat: 11.0,
    maxLat: 12.0,
    minLon: 164.5,
    maxLon: 166.0,
    nLat: N,
    nLon: N,
    samples,
  });
}

describe('coastal-explosion tsunami flow', () => {
  beforeEach(() => {
    resetAppStore();
  });
  afterEach(() => {
    useAppStore.getState().setElevationGrid(null);
  });

  it('Castle Bravo on a coastal click eventually emits tsunami once the DEM tile arrives', async () => {
    const s = useAppStore.getState();
    s.selectPreset('CASTLE_BRAVO_1954');
    s.setMode('globe');
    s.setLocation({ latitude: 11.583, longitude: 165.383 });

    // First evaluate runs before the elevation tile lands — the
    // coastal-fall-through can't fire, so no tsunami.
    await s.evaluate();
    const r1 = useAppStore.getState().result;
    expect(r1?.type).toBe('explosion');
    if (r1?.type === 'explosion') {
      expect(r1.data.isContactWaterBurst).toBe(false);
      expect(r1.data.tsunami).toBeUndefined();
    }

    // Tile arrives; the catch-up sees an explosion result with no
    // waterDepth in the input AND nearby ocean cells, and re-runs.
    useAppStore.getState().setElevationGrid(makeCoastalGrid());
    // Allow the catch-up's microtask + worker fallback to settle.
    await new Promise((resolve) => setTimeout(resolve, 30));

    const r2 = useAppStore.getState().result;
    expect(r2?.type).toBe('explosion');
    if (r2?.type === 'explosion') {
      expect(r2.data.isContactWaterBurst).toBe(true);
      expect(r2.data.tsunami).toBeDefined();
      expect(r2.data.tsunami?.cavityRadius as number | undefined).toBeGreaterThan(0);
    }
    expect(useAppStore.getState().bathymetricTsunami).not.toBeNull();
  });

  it('does not re-evaluate when the user pans to a new pin without pressing Launch', async () => {
    const s = useAppStore.getState();
    s.selectPreset('CASTLE_BRAVO_1954');
    s.setMode('globe');
    // First Launch on point A, with the grid already in the store so
    // the result carries a real lastEvaluatedAtLocation.
    s.setLocation({ latitude: 11.583, longitude: 165.383 });
    useAppStore.getState().setElevationGrid(makeCoastalGrid());
    await s.evaluate();
    const stampA = useAppStore.getState().lastEvaluatedAt;
    expect(stampA).not.toBeNull();

    // User pans to point B but does NOT click Launch. A fresh DEM
    // tile for B then lands. The catch-up must keep its hands off
    // the result — Launch is the only trigger.
    useAppStore.getState().setLocation({ latitude: 0, longitude: 0 });
    useAppStore.getState().setElevationGrid(makeCoastalGrid());
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(useAppStore.getState().lastEvaluatedAt).toBe(stampA);
  });
});

describe('landslide tsunami gate (volcanoTsunami null on dry runout)', () => {
  it('Elm 1881 (meanOceanDepth = 0) produces no tsunami', () => {
    const elm = simulateLandslide(LANDSLIDE_PRESETS.ELM_1881.input);
    expect(elm.tsunami).toBeNull();
  });

  it('Storegga (submarine, meanOceanDepth > 0) still produces a tsunami', () => {
    const storegga = simulateLandslide(LANDSLIDE_PRESETS.STOREGGA_8200_BP.input);
    expect(storegga.tsunami).not.toBeNull();
  });
});
