import * as Dialog from '@radix-ui/react-dialog';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './GlossaryDialog.module.css';

/**
 * Short, non-exhaustive glossary of terms the simulator surfaces in
 * the result panels. Grouped by discipline so the reader lands on the
 * section that matches whatever they're currently staring at.
 */
const GLOSSARY = {
  blast: ['overpressure', 'thermalFluence', 'burn3rd', 'hopkinsonCranz', 'hob', 'machReflection'],
  atmosphericEntry: [
    'pancakeModel',
    'breakupAltitude',
    'burstAltitude',
    'penetrationBonus',
    'energyFractionToGround',
    'atmosphericYield',
    'bolideAirburstAmplification',
  ],
  seismology: [
    'mw',
    'seismicMoment',
    'mmi',
    'pga',
    'aftershockCatalogue',
    'megathrust',
    'vs30',
    'liquefactionRadius',
  ],
  volcanology: [
    'vei',
    'plinianColumn',
    'pyroclastic',
    'dre',
    'lateralBlast',
    'flankCollapse',
    'ashfallIsopach',
    'lahar',
  ],
  tsunami: [
    'wardAsphaugCavity',
    'greensLaw',
    'tsunamiCelerity',
    'sourceWavelength',
    'dominantPeriod',
    'synolakisRunup',
    'inundationDistance',
    'damageTier',
    'beachSlopeFromDEM',
  ],
  exposure: ['populationExposure', 'vulnerabilityFunction'],
} as const satisfies Record<string, readonly string[]>;

type SectionKey = keyof typeof GLOSSARY;
const SECTION_KEYS = Object.keys(GLOSSARY) as SectionKey[];

/**
 * Radix-powered modal that explains the glossary terms. Opened from
 * the globe/stage corner button; reuses the AboutDialog's focus-trap,
 * Escape-to-close, and outside-click-to-dismiss behaviour.
 */
export function GlossaryDialog(): JSX.Element {
  const { t } = useTranslation();
  return (
    <Dialog.Root>
      <Dialog.Trigger className={styles.trigger}>{t('glossary.trigger')}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <Dialog.Title className={styles.title}>{t('glossary.title')}</Dialog.Title>
          <Dialog.Description className={styles.subtitle}>
            {t('glossary.subtitle')}
          </Dialog.Description>
          {SECTION_KEYS.map((section) => (
            <section key={section} className={styles.section}>
              <h3 className={styles.sectionTitle}>{t(`glossary.sections.${section}`)}</h3>
              <ul className={styles.termList}>
                {GLOSSARY[section].map((termKey) => (
                  <li key={termKey} className={styles.term}>
                    <p className={styles.termName}>{t(`glossary.terms.${termKey}.name`)}</p>
                    <p className={styles.termDefinition}>
                      {t(`glossary.terms.${termKey}.definition`)}
                    </p>
                    <p className={styles.termSource}>{t(`glossary.terms.${termKey}.source`)}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <Dialog.Close className={styles.close} aria-label={t('glossary.close')}>
            ×
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
