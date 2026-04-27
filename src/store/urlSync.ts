import { useEffect } from 'react';
import {
  applyIntentToStore,
  decodeUrl,
  encodeStateToSearchParams,
  projectSyncableState,
} from './urlState.js';
import { URL_KEYS } from './urlState.js';
import { useAppStore, type AppStore } from './useAppStore.js';

/**
 * Hydrate the app store from a URL (full or search-fragment) by
 * decoding it into an intent and routing each field through the
 * typed store actions. Does not trigger evaluate() — callers decide
 * whether to auto-run a simulation after hydration via
 * {@link maybeAutoEvaluate}.
 */
export function hydrateStoreFromUrl(url: string, store: AppStore): void {
  applyIntentToStore(decodeUrl(url), store);
}

/**
 * Auto-run a simulation when the URL arrived with enough information
 * to reproduce one — the "share a link that loads with a result
 * already on screen" behaviour from the M4 ROADMAP exit criterion.
 * Applies only when location is set and the view mode is not landing.
 */
export async function maybeAutoEvaluate(store: AppStore): Promise<void> {
  if (store.location !== null && store.mode !== 'landing') {
    await store.evaluate();
  }
}

/**
 * Merge the current store's URL-state into `location.search` and call
 * history.replaceState. Unknown params (e.g. the existing `lng=…`
 * language-detector key) are preserved; only keys managed by the
 * schema are rewritten. A no-op when the resulting query string is
 * byte-identical to the existing one.
 */
export function writeStoreToHistory(store: AppStore, win: Window = window): void {
  const url = new URL(win.location.href);
  const ourParams = encodeStateToSearchParams(projectSyncableState(store));
  for (const key of Object.values(URL_KEYS)) {
    url.searchParams.delete(key);
  }
  ourParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${win.location.pathname}${win.location.search}${win.location.hash}`;
  if (next !== current) {
    win.history.replaceState(null, '', next);
  }
}

/**
 * React hook that keeps `window.location` in sync with the Zustand
 * store. Runs once on mount to hydrate from the current URL, then
 * subscribes to the store to rewrite the URL after every relevant
 * state change.
 *
 * SSR-friendly: guarded against the absence of `window` for the
 * future server-rendered shell, though the current app ships
 * client-only.
 */
export function useUrlStateSync(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Hydrate synchronously BEFORE subscribing, so the subscribe
    // callback never sees a partially-applied intermediate state and
    // we don't need a re-entrancy flag.
    hydrateStoreFromUrl(window.location.href, useAppStore.getState());
    void maybeAutoEvaluate(useAppStore.getState());
    writeStoreToHistory(useAppStore.getState());

    return useAppStore.subscribe((state) => {
      writeStoreToHistory(state);
    });
  }, []);
}
