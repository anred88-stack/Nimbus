import { useTranslation } from 'react-i18next';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { ScaleBar } from '../components/ScaleBar';
import { useAppStore } from '../../store/index.js';
import { cx } from '../utils/cx';
import { useReducedMotion } from '../utils/useReducedMotion';
import styles from './LandingPage.module.css';

const FEATURE_KEYS = ['multiEvent', 'realScience', 'globe', 'accessible', 'shareable'] as const;

const REPO_URL = 'https://github.com/anred88-stack/Impact';

export function LandingPage() {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const transitionTo = useAppStore((s) => s.transitionTo);

  const setMode = useAppStore((s) => s.setMode);
  const handleEnter = (): void => {
    transitionTo('globe', { instant: reducedMotion });
  };
  const handleMethodology = (): void => {
    setMode('methodology');
  };

  return (
    <>
      <a href="#main" className="skip-link">
        {t('landing.skipLink')}
      </a>

      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true" />
          <span className={styles.brandName}>{t('landing.projectName')}</span>
        </div>
        <nav className={styles.nav} aria-label="Primary">
          <LanguageSwitch />
        </nav>
      </header>

      <main id="main" className={styles.main}>
        <section className={styles.hero} aria-labelledby="hero-title">
          <p className={styles.eyebrow}>{t('landing.comingSoon')}</p>
          <h1 id="hero-title" className={styles.title}>
            {t('landing.projectName')}
          </h1>
          <p className={styles.tagline}>{t('landing.tagline')}</p>
          <p className={styles.description}>{t('landing.description')}</p>
          <div className={styles.ctas}>
            <button
              type="button"
              className={cx(styles.cta, styles.ctaPrimary)}
              onClick={handleEnter}
            >
              {t('landing.cta.enterSimulator')}
            </button>
            <a className={styles.cta} href={REPO_URL} target="_blank" rel="noopener noreferrer">
              {t('landing.cta.github')}
            </a>
            <a className={styles.cta} href="#features">
              {t('landing.cta.science')}
            </a>
            <button type="button" className={styles.cta} onClick={handleMethodology}>
              {t('landing.cta.methodology')}
            </button>
          </div>
        </section>

        <section id="features" className={styles.features} aria-labelledby="features-heading">
          <h2 id="features-heading" className={styles.sectionTitle}>
            {t('landing.features.title')}
          </h2>
          <ul className={styles.featureList}>
            {FEATURE_KEYS.map((key) => (
              <li key={key} className={styles.featureItem}>
                <span className={styles.featureBullet} aria-hidden="true" />
                <div>
                  <h3 className={styles.featureName}>{t(`landing.features.${key}.name`)}</h3>
                  <p className={styles.featureDetail}>{t(`landing.features.${key}.detail`)}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerRow}>
          <span>© 2026 {t('landing.projectName')}</span>
          <span aria-hidden="true">·</span>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            {t('footer.github')}
          </a>
          <span aria-hidden="true">·</span>
          <span>{t('footer.license')}</span>
          <span aria-hidden="true">·</span>
          <span>{t('footer.madeIn')}</span>
        </div>
        <p className={styles.footerCredits}>{t('footer.credits')}</p>
      </footer>

      <ScaleBar />
    </>
  );
}
