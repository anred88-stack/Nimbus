import type { JSX } from 'react';
import { TRANSITION_HALF_MS, useAppStore } from '../../store/index.js';
import styles from './TransitionOverlay.module.css';

/**
 * Full-viewport fade-to-black overlay that covers the globe ↔ stage
 * mode swap. The store drives `transitionPhase` (idle / fading-out /
 * fading-in); CSS keys the opacity off the `data-phase` attribute so
 * we stay declarative.
 *
 * The overlay is above every other layer but `pointer-events: none`,
 * so clicks during the transition still hit the underlying view (the
 * store itself ignores re-entrant transitionTo calls).
 */
export function TransitionOverlay(): JSX.Element {
  const phase = useAppStore((s) => s.transitionPhase);
  return (
    <div
      className={styles.overlay}
      data-phase={phase}
      aria-hidden="true"
      style={{ ['--transition-half' as string]: `${TRANSITION_HALF_MS.toFixed(0)}ms` }}
    />
  );
}
