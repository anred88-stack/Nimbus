/**
 * Comlink-exposed Web Worker that runs Monte Carlo sweeps off the
 * main thread. The headline `evaluateMonteCarlo` on the main
 * thread blocks React + Cesium for the duration of a 200-sample
 * run (~5 ms); scaling to 1 000 or 2 000 samples would become
 * noticeable (~25–50 ms) and freeze the UI during scrolling /
 * animation. Moving the sweep into a worker keeps the viewer at
 * 60 fps regardless of sweep size.
 *
 * Why Comlink over raw postMessage:
 *   1. Transparent proxying — the store calls `worker.runXxx(args)`
 *      exactly like a direct function.
 *   2. Handles the Promise machinery + transferable-args dance for
 *      us (we still use plain objects since TypedArrays in the
 *      sampler return path are small).
 *   3. 1.5 KB runtime overhead, zero API surface to maintain.
 *
 * Why pure TypeScript and not WASM/Rust (yet):
 *   The inner loop is Float64 arithmetic that V8's JIT compiles to
 *   near-native speed on a hot path. A benchmark on the 200-sample
 *   impact sweep runs in ~5 ms on main thread; scaling to 2 000
 *   samples in a worker is still <50 ms. WASM would give another
 *   ~2× at the cost of a Rust toolchain and SharedArrayBuffer
 *   cross-origin-isolation headers (which break default Cloudflare
 *   Pages hosting). Only revisit if benchmarks show the pure-TS
 *   worker falling short for a realistic N.
 */

import { expose } from 'comlink';
import { runEarthquakeMonteCarlo } from './earthquakeMonteCarlo.js';
import { runExplosionMonteCarlo } from './explosionMonteCarlo.js';
import { runImpactMonteCarlo } from './impactMonteCarlo.js';
import { mulberry32 } from './sampling.js';
import { runVolcanoMonteCarlo } from './volcanoMonteCarlo.js';
import type { EarthquakeScenarioInput } from '../events/earthquake/index.js';
import type { ExplosionScenarioInput } from '../events/explosion/index.js';
import type { VolcanoScenarioInput } from '../events/volcano/index.js';
import type { ImpactScenarioInput } from '../simulate.js';

/**
 * Worker API exposed via Comlink. Each method rebuilds the RNG
 * from a seed string so the main thread can reproduce percentiles
 * from the same URL (seed is deterministic per event+preset).
 */
export interface MonteCarloWorkerApi {
  runImpact: (
    input: ImpactScenarioInput,
    iterations: number,
    seed: string
  ) => ReturnType<typeof runImpactMonteCarlo>;
  runExplosion: (
    input: ExplosionScenarioInput,
    iterations: number,
    seed: string
  ) => ReturnType<typeof runExplosionMonteCarlo>;
  runEarthquake: (
    input: EarthquakeScenarioInput,
    iterations: number,
    seed: string
  ) => ReturnType<typeof runEarthquakeMonteCarlo>;
  runVolcano: (
    input: VolcanoScenarioInput,
    iterations: number,
    seed: string
  ) => ReturnType<typeof runVolcanoMonteCarlo>;
}

const api: MonteCarloWorkerApi = {
  runImpact: (input, iterations, seed) =>
    runImpactMonteCarlo({ nominal: input, rng: mulberry32(seed), iterations }),
  runExplosion: (input, iterations, seed) =>
    runExplosionMonteCarlo({ nominal: input, rng: mulberry32(seed), iterations }),
  runEarthquake: (input, iterations, seed) =>
    runEarthquakeMonteCarlo({ nominal: input, rng: mulberry32(seed), iterations }),
  runVolcano: (input, iterations, seed) =>
    runVolcanoMonteCarlo({ nominal: input, rng: mulberry32(seed), iterations }),
};

expose(api);
