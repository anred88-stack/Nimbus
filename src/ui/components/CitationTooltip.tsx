import * as Tooltip from '@radix-ui/react-tooltip';
import type { JSX, ReactNode } from 'react';
import styles from './CitationTooltip.module.css';

export interface CitationTooltipProps {
  /** The displayed value (numeric or text) that reveals the citation. */
  children: ReactNode;
  /** One-line citation text shown inside the tooltip. */
  citation: string;
}

/**
 * A minimal Radix-powered tooltip used to surface the scientific source
 * behind a displayed value. The bracketing `Tooltip.Provider` allows a
 * global delay group; a per-tooltip provider keeps this drop-in usable
 * anywhere without the caller wiring up the provider.
 */
export function CitationTooltip({ children, citation }: CitationTooltipProps): JSX.Element {
  return (
    <Tooltip.Provider delayDuration={200} skipDelayDuration={80}>
      <Tooltip.Root>
        <Tooltip.Trigger className={styles.trigger} type="button">
          {children}
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className={styles.content} side="left" sideOffset={8}>
            {citation}
            <Tooltip.Arrow className={styles.arrow} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
