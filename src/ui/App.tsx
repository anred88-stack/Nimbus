import { Suspense, lazy, type JSX } from 'react';
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
  return (
    <>
      <CurrentView />
      <TransitionOverlay />
    </>
  );
}
