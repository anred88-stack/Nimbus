import { useTranslation } from 'react-i18next';
import styles from './LanguageSwitch.module.css';

export function LanguageSwitch() {
  const { i18n, t } = useTranslation();
  const current = i18n.resolvedLanguage ?? 'en';
  const next = current === 'it' ? 'en' : 'it';

  const handleClick = () => {
    void i18n.changeLanguage(next);
    // Keep the URL in sync so a "Copy link" right after a language
    // toggle shares the language the user actually picked, not the
    // one inherited from their Accept-Language header.
    const url = new URL(window.location.href);
    url.searchParams.set('lng', next);
    window.history.replaceState(window.history.state, '', url.toString());
  };

  return (
    <button
      type="button"
      className={styles.button}
      onClick={handleClick}
      aria-label={t('common.switchLanguage')}
    >
      <span className={styles.currentLabel}>{current === 'it' ? 'IT' : 'EN'}</span>
      <span aria-hidden="true" className={styles.separator}>
        /
      </span>
      <span className={styles.otherLabel}>{next === 'it' ? 'IT' : 'EN'}</span>
    </button>
  );
}
