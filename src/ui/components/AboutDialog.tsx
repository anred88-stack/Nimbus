import * as Dialog from '@radix-ui/react-dialog';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './AboutDialog.module.css';

const SOURCES = [
  'Collins, Melosh & Marcus (2005), Meteoritics & Planetary Science 40(6), "Earth Impact Effects Program"',
  'Pike (1980), Icarus 43(1), "Formation of complex impact craters"',
  'Schultz & Gault (1975), The Moon 12, "Seismic effects from major basin formations"',
  'Glasstone & Dolan (1977), "The Effects of Nuclear Weapons" (3rd ed.)',
  'Kinney & Graham (1985), "Explosive Shocks in Air" (2nd ed.)',
  'Nordyke (1977), J. Geophys. Res. 82(30), "Cratering data from desert alluvium"',
];

/**
 * Project-info modal. Exists to give the curious visitor a quick way
 * to see who wrote the science that drives the numbers on screen.
 * Opened from the corner button rendered inside GlobeView / StageView.
 *
 * Uses @radix-ui/react-dialog for the accessibility plumbing
 * (focus trap, Escape to close, ARIA dialog role, body scroll lock).
 */
export function AboutDialog(): JSX.Element {
  const { t } = useTranslation();
  return (
    <Dialog.Root>
      <Dialog.Trigger className={styles.trigger}>{t('about.trigger')}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <Dialog.Title className={styles.title}>{t('about.title')}</Dialog.Title>
          <p className={styles.subtitle}>{t('about.subtitle')}</p>
          <Dialog.Description className={styles.body}>{t('about.body')}</Dialog.Description>
          <div className={styles.sources} aria-label={t('about.sources')}>
            <ul>
              {SOURCES.map((source) => (
                <li key={source}>{source}</li>
              ))}
            </ul>
          </div>
          <Dialog.Close className={styles.close} aria-label={t('about.close')}>
            ×
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
