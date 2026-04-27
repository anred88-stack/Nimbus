import { useTranslation } from 'react-i18next';
import { cx } from '../utils/cx';
import styles from './ScaleBar.module.css';

// Decorative scale bar for the M0 landing. The real scale bar in Stage mode
// (M2+) will be driven by simulation units — see docs/ART_DIRECTION.md
// ("Scale is the protagonist").
const TICK_COUNT = 48;
const TICKS = Array.from({ length: TICK_COUNT }, (_, i) => i);

export function ScaleBar() {
  const { t } = useTranslation();

  return (
    <div className={styles.wrapper}>
      <div className={styles.label}>
        <span className={styles.labelText}>{t('landing.scaleBar.label')}</span>
        <span className={styles.units}>0&nbsp;m &nbsp;—&nbsp; 10&nbsp;km</span>
      </div>
      <div className={styles.bar} aria-hidden="true">
        {TICKS.map((i) => {
          const cls = cx(
            styles.tick,
            i % 10 === 0 && styles.tickMajor,
            i % 10 !== 0 && i % 5 === 0 && styles.tickMedium
          );
          return <span key={i} className={cls} />;
        })}
      </div>
    </div>
  );
}
