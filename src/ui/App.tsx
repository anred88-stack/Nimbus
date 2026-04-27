import { Suspense, lazy, useEffect, type JSX } from 'react';
import { useAppStore, useUrlStateSync } from '../store/index.js';
import { TransitionOverlay } from './components/TransitionOverlay.js';
import { LandingPage } from './pages/LandingPage.js';
import { MethodologyPage } from './pages/MethodologyPage.js';
import { SimulationReportPage } from './pages/SimulationReportPage.js';

/**
 * The Cesium globe view is code-split out of the main bundle:
 * Cesium alone is ~3 MB externalised to /cesium/, so landing-page
 * visitors who never enter the simulator shouldn't pay that cost.
 * Suspense fallback is null — the chunk is small on a warm cache
 * and a spinner would flash; the TransitionOverlay covers the swap.
 */
const GlobeView = lazy(() =>
  import('./pages/GlobeView.js').then((mod) => ({ default: mod.GlobeView }))
);

function CurrentView(): JSX.Element {
  const mode = useAppStore((s) => s.mode);

  if (mode === 'globe') {
    return (
      <Suspense fallback={null}>
        <GlobeView />
      </Suspense>
    );
  }

  if (mode === 'methodology') {
    return <MethodologyPage />;
  }

  if (mode === 'report') {
    return <SimulationReportPage />;
  }

  return <LandingPage />;
}

export function App(): JSX.Element {
  useUrlStateSync();
  // Phase 11 — kick off the global bathymetric mosaic fetch as soon
  // as the app shell mounts (NOT only when the Globe lazy-chunk
  // mounts). The 800 KB / ~16-tile fetch then runs in parallel with
  // the user reading the landing page, so by the time they click
  // "Try the simulator" the global tsunami layer is ready and the
  // first Launch already shows trans-oceanic iso-contours.
  const setGlobalBathymetricGrid = useAppStore((s) => s.setGlobalBathymetricGrid);
  useEffect(() => {
    let cancelled = false;
    void import('../scene/terrainSampling.js').then(
      ({ fetchGlobalBathymetricMosaic, getCachedGlobalBathymetricMosaic }) => {
        const cached = getCachedGlobalBathymetricMosaic();
        if (cached !== null) {
          if (!cancelled) setGlobalBathymetricGrid(cached);
          return;
        }
        fetchGlobalBathymetricMosaic()
          .then((grid) => {
            if (!cancelled) setGlobalBathymetricGrid(grid);
          })
          .catch((err: unknown) => {
            console.warn(
              '[App] global bathymetric mosaic fetch failed; trans-oceanic tsunami isos will be limited to local tile:',
              err
            );
          });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [setGlobalBathymetricGrid]);
  return (
    <>
      <CurrentView />
      <TransitionOverlay />
    </>
  );
}
