import type { JSX } from 'react';
import { Globe } from '../../scene/globe/index.js';
import { AboutDialog } from '../components/AboutDialog.js';
import { GlossaryDialog } from '../components/GlossaryDialog.js';
import { RingLegend } from '../components/RingLegend.js';
import { SimulatorPanel } from '../components/SimulatorPanel.js';
import styles from './GlobeView.module.css';

/**
 * Globe-mode view: the Cesium viewer fills the screen and the
 * simulator-panel floats on top of it. Once the user clicks a point
 * and triggers a simulation, damage rings are rendered by the Globe
 * component directly (both subscribe to the same Zustand store), and
 * the {@link RingLegend} translates each ring colour into a
 * plain-language threshold + radius for the user.
 */
export function GlobeView(): JSX.Element {
  return (
    <div className={styles.root}>
      <Globe />
      <AboutDialog />
      <GlossaryDialog />
      <SimulatorPanel />
      <RingLegend />
    </div>
  );
}
