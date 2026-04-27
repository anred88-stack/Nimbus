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

      <footer className={styles.footer}>
        <p>{t('methodology.footer')}</p>
      </footer>
    </div>
  );
}
