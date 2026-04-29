import * as Comlink from 'comlink';
import { simulateSaintVenant1D } from './saintVenant1D.js';

/**
 * Dedicated Web Worker for the Saint-Venant 1D Tier 2 solver.
 *
 * Why a separate worker (not bolted onto `physics/worker.ts`).
 * The Saint-Venant integration is the heaviest synchronous job in
 * the physics layer — a Tōhoku-class radial run with 400 cells over
 * 9 000 s of physical time takes ~1-3 s of CPU time. Sharing the
 * main `simulationApi` worker with the closed-form pipelines would
 * mean every Deep-Dive click would block any follow-up "Launch" /
 * "Re-evaluate" call until the solver finished. A dedicated worker
 * isolates that latency cost, keeps the main physics worker
 * responsive, and lets the UI cancel a stale Deep Dive when the
 * user clicks again on a different coast.
 *
 * Import is dynamic in the store (see `useAppStore.evaluateDeepDive`)
 * so the ~30 KB of solver code is NOT in the eager landing-page
 * bundle. Cesium remains the dominant initial-load cost; a Tier 2
 * power-user click pays the small extra fetch on demand.
 */
export const saintVenantApi = {
  simulateSaintVenant1D,
};

export type SaintVenantApi = typeof saintVenantApi;

Comlink.expose(saintVenantApi);
