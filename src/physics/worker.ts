import * as Comlink from 'comlink';
import { simulateEarthquake } from './events/earthquake/simulate.js';
import { simulateExplosion } from './events/explosion/simulate.js';
import { simulateLandslide } from './events/landslide/simulate.js';
import { simulateVolcano } from './events/volcano/simulate.js';
import { simulateImpact } from './simulate.js';
import { computeBathymetricTsunami } from './tsunami/index.js';

// Public API of the physics worker. Each entry is a thin re-export of a
// pure Layer-2 helper, so the worker boundary is the only place where
// physics crosses a thread boundary. The Monte-Carlo sweep has its own
// dedicated worker (`./montecarlo/worker.ts`) so a long MC run doesn't
// block a follow-up "Simula" click and vice versa.
export const simulationApi = {
  simulateImpact,
  simulateExplosion,
  simulateEarthquake,
  simulateVolcano,
  simulateLandslide,
  computeBathymetricTsunami,
};

export type SimulationApi = typeof simulationApi;

Comlink.expose(simulationApi);
