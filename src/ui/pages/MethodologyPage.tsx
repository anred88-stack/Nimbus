import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../store/index.js';
import { METHODOLOGY_SECTIONS, VALIDATION_ROSTER, type Citation } from './methodologyContent.js';
import styles from './MethodologyPage.module.css';

function renderCitation(c: Citation): string {
  const doi = c.doi ? `  ·  DOI: ${c.doi}` : '';
  return `${c.authors} (${c.year.toString()}). "${c.title}." ${c.venue}${doi}.`;
}

export function MethodologyPage(): JSX.Element {
  const { t } = useTranslation();
  const setMode = useAppStore((s) => s.setMode);

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.back}
          onClick={() => {
            setMode('landing');
          }}
        >
          ← {t('methodology.back')}
        </button>
        <h1 className={styles.title}>{t('methodology.title')}</h1>
        <p className={styles.subtitle}>{t('methodology.subtitle')}</p>
      </header>

      <section className={styles.section}>
        <h2>{t('methodology.overviewTitle')}</h2>
        <p className={styles.prose}>{t('methodology.overviewBody')}</p>
      </section>

      {METHODOLOGY_SECTIONS.map((section) => (
        <section key={section.id} className={styles.section}>
          <h2 id={section.id}>{section.title}</h2>
          <p className={styles.prose}>{section.blurb}</p>
          <div className={styles.formulas}>
            {section.entries.map((entry) => (
              <article key={entry.id} className={styles.formula}>
                <header>
                  <h3 className={styles.formulaName}>{entry.name}</h3>
                </header>
                <pre className={styles.formulaBlock}>{entry.formula}</pre>
                <p className={styles.formulaDesc}>{entry.description}</p>
                <p className={styles.citation}>{renderCitation(entry.citation)}</p>
              </article>
            ))}
          </div>
        </section>
      ))}

      <section className={styles.section}>
        <h2>{t('methodology.validationTitle')}</h2>
        <p className={styles.prose}>{t('methodology.validationBody')}</p>
        <ul className={styles.validationList}>
          {VALIDATION_ROSTER.map((v) => {
            const label =
              v.year < 0 ? `${Math.abs(v.year).toLocaleString()} yr ago` : String(v.year);
            return (
              <li key={v.event}>
                <strong>
                  {v.event} ({label})
                </strong>
                <span>{v.note}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={styles.section}>
        <h2 id="uncertainty">{t('methodology.uncertainty.title')}</h2>
        <p className={styles.prose}>{t('methodology.uncertainty.body')}</p>
        <ul className={styles.validationList}>
          <li>
            <strong>{t('methodology.uncertainty.inputItem')}</strong>
            <span>{t('methodology.uncertainty.inputNote')}</span>
          </li>
          <li>
            <strong>{t('methodology.uncertainty.outputItem')}</strong>
            <span>{t('methodology.uncertainty.outputNote')}</span>
          </li>
          <li>
            <strong>{t('methodology.uncertainty.mcItem')}</strong>
            <span>{t('methodology.uncertainty.mcNote')}</span>
          </li>
          <li>
            <strong>{t('methodology.uncertainty.sensitivityItem')}</strong>
            <span>{t('methodology.uncertainty.sensitivityNote')}</span>
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 id="regression">{t('methodology.regression.title')}</h2>
        <p className={styles.prose}>{t('methodology.regression.body')}</p>
        <ul className={styles.validationList}>
          <li>
            <strong>{t('methodology.regression.tsunamiItem')}</strong>
            <span>{t('methodology.regression.tsunamiNote')}</span>
          </li>
          <li>
            <strong>{t('methodology.regression.shakemapItem')}</strong>
            <span>{t('methodology.regression.shakemapNote')}</span>
          </li>
          <li>
            <strong>{t('methodology.regression.plumeItem')}</strong>
            <span>{t('methodology.regression.plumeNote')}</span>
          </li>
          <li>
            <strong>{t('methodology.regression.tunguskaItem')}</strong>
            <span>{t('methodology.regression.tunguskaNote')}</span>
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2 id="limitations">{t('methodology.limitations.title')}</h2>
        <p className={styles.prose}>{t('methodology.limitations.body')}</p>
        <ul className={styles.validationList}>
          <li>
            <strong>{t('methodology.limitations.atm.item')}</strong>
            <span>{t('methodology.limitations.atm.note')}</span>
          </li>
          <li>
            <strong>{t('methodology.limitations.shore.item')}</strong>
            <span>{t('methodology.limitations.shore.note')}</span>
          </li>
          <li>
            <strong>{t('methodology.limitations.fault.item')}</strong>
            <span>{t('methodology.limitations.fault.note')}</span>
          </li>
          <li>
            <strong>{t('methodology.limitations.plume.item')}</strong>
            <span>{t('methodology.limitations.plume.note')}</span>
          </li>
          <li>
            <strong>{t('methodology.limitations.cascade.item')}</strong>
            <span>{t('methodology.limitations.cascade.note')}</span>
          </li>
        </ul>
      </section>

      <footer className={styles.footer}>
        <p>{t('methodology.footer')}</p>
      </footer>
    </div>
  );
}
