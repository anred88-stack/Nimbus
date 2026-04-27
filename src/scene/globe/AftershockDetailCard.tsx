import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { aftershockShakingFootprint } from '../../physics/events/earthquake/aftershocks.js';
import { peakGroundAcceleration } from '../../physics/events/earthquake/attenuation.js';
import { modifiedMercalliIntensity } from '../../physics/events/earthquake/intensity.js';
import { m } from '../../physics/units.js';
import { useAppStore } from '../../store/index.js';
import styles from './AftershockDetailCard.module.css';

/**
 * Floating panel that surfaces the science behind a clicked aftershock.
 * Pinned to the bottom-left of the globe viewport (stays out of the
 * SimulatorPanel's right-hand rail), it appears only when the store's
 * `selectedAftershockIndex` is non-null AND the active result is an
 * earthquake. Otherwise it renders nothing.
 *
 * The numbers come from the same Joyner–Boore (1981) + Worden et al.
 * (2012) chain that produces the mainshock's MMI VII/VIII/IX rings:
 * we recompute the per-aftershock footprint here so the detail
 * card and the on-globe contour rings agree exactly.
 *
 * The dismiss button calls `clearAftershock`; clicking elsewhere on
 * the globe also clears the selection (see `setLocation` in the
 * store, which forwards through the same path).
 */
export function AftershockDetailCard(): JSX.Element | null {
  const { t } = useTranslation();
  const selectedAftershockIndex = useAppStore((s) => s.selectedAftershockIndex);
  const result = useAppStore((s) => s.result);
  const clearAftershock = useAppStore((s) => s.clearAftershock);

  if (selectedAftershockIndex === null) return null;
  if (result?.type !== 'earthquake') return null;
  const event = result.data.aftershocks.events[selectedAftershockIndex];
  if (event === undefined) return null;

  const footprint = aftershockShakingFootprint(event.magnitude);
  const distanceFromEpicenterM = Math.sqrt(
    (event.northOffsetM as number) ** 2 + (event.eastOffsetM as number) ** 2
  );
  // Epicentral PGA for this aftershock — drives the headline MMI badge.
  const peakMmi = modifiedMercalliIntensity(
    peakGroundAcceleration({ magnitude: event.magnitude, distance: m(0) })
  );

  return (
    <aside
      className={styles.card}
      data-testid="aftershock-detail-card"
      aria-label={t('globe.aftershockDetail.aria')}
    >
      <header className={styles.header}>
        <h3 className={styles.title}>{t('globe.aftershockDetail.title')}</h3>
        <button
          type="button"
          className={styles.closeButton}
          onClick={clearAftershock}
          aria-label={t('globe.aftershockDetail.close')}
        >
          ×
        </button>
      </header>
      <dl className={styles.grid}>
        <div className={styles.row}>
          <dt>{t('globe.aftershockDetail.magnitude')}</dt>
          <dd>
            <strong>Mw {event.magnitude.toFixed(1)}</strong>
          </dd>
        </div>
        <div className={styles.row}>
          <dt>{t('globe.aftershockDetail.timing')}</dt>
          <dd>{formatTime(event.timeAfterMainshock, t)}</dd>
        </div>
        <div className={styles.row}>
          <dt>{t('globe.aftershockDetail.distanceFromEpicenter')}</dt>
          <dd>{formatRadius(distanceFromEpicenterM)}</dd>
        </div>
        <div className={styles.row}>
          <dt>{t('globe.aftershockDetail.epicentralMmi')}</dt>
          <dd>{romanMmi(peakMmi)}</dd>
        </div>
        <div className={styles.row}>
          <dt>{t('globe.aftershockDetail.mmi5Reach')}</dt>
          <dd>{formatRadius(footprint.mmi5Radius)}</dd>
        </div>
        <div className={styles.row}>
          <dt>{t('globe.aftershockDetail.mmi6Reach')}</dt>
          <dd>{formatRadius(footprint.mmi6Radius)}</dd>
        </div>
        <div className={styles.row}>
          <dt>{t('globe.aftershockDetail.mmi7Reach')}</dt>
          <dd>{formatRadius(footprint.mmi7Radius)}</dd>
        </div>
      </dl>
      <p className={styles.footnote}>{t('globe.aftershockDetail.description')}</p>
    </aside>
  );
}

function formatRadius(radiusM: number): string {
  if (!Number.isFinite(radiusM) || radiusM <= 0) return '—';
  if (radiusM < 1_000) return `${radiusM.toFixed(0)} m`;
  return `${(radiusM / 1_000).toFixed(1)} km`;
}

function formatTime(seconds: number, t: (key: string, opts: { value: string }) => string): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return t('globe.tooltip.duration.seconds', { value: seconds.toFixed(0) });
  if (seconds < 3_600)
    return t('globe.tooltip.duration.minutes', { value: (seconds / 60).toFixed(0) });
  if (seconds < 86_400)
    return t('globe.tooltip.duration.hours', { value: (seconds / 3_600).toFixed(1) });
  return t('globe.tooltip.duration.days', { value: (seconds / 86_400).toFixed(1) });
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'] as const;

/** Render an MMI value (1–12, possibly fractional) as a Roman-numeral
 *  range — Worden's piecewise fit returns floats, but the public
 *  scientific convention reports MMI as an integer. We round-half-up
 *  and clamp to the [I, XII] range. */
function romanMmi(value: number): string {
  const idx = Math.max(1, Math.min(12, Math.round(value))) - 1;
  return ROMAN[idx] ?? '—';
}
