import type { ForwardedRef, JSX } from 'react';
import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { clampToGreatCircle } from '../../physics/earthScale.js';
import styles from './RingTooltip.module.css';

/**
 * Per-ring static metadata that the tooltip consumes. The `kind` field
 * keys into the `globe.tooltip.ring.<kind>` i18n bundle so every label
 * and description is fully translatable.
 */
export type RingTooltipKind =
  | 'craterRim'
  | 'thirdDegreeBurn'
  | 'secondDegreeBurn'
  | 'overpressure5psi'
  | 'overpressure1psi'
  | 'lightDamage'
  | 'radiationLD50'
  | 'empAffected'
  | 'ejectaBlanket'
  | 'tsunamiCavity'
  | 'tsunamiWaveFront5m'
  | 'tsunamiWaveFront1m'
  | 'tsunamiWaveFront03m'
  | 'tsunamiIsochrone1h'
  | 'tsunamiIsochrone2h'
  | 'tsunamiIsochrone4h'
  | 'tsunamiIsochrone8h'
  | 'mmi7'
  | 'mmi8'
  | 'mmi9'
  | 'pyroclasticRunout'
  | 'lateralBlast'
  | 'ashfallPlume';

export interface RingHoverInfo {
  type: 'ring';
  kind: RingTooltipKind;
  /** Final geographic radius (m) of the ring at the time it was added. */
  radiusM: number;
  /** Hex tint used for the title accent bar. */
  color: string;
}

export interface AftershockHoverInfo {
  type: 'aftershock';
  /** Mw magnitude of the aftershock. */
  magnitude: number;
  /** Seconds after the mainshock. */
  timeAfterMainshock: number;
  /** Hex tint matching the dot's gradient position. */
  color: string;
}

export type HoverInfo = RingHoverInfo | AftershockHoverInfo;

function formatRadius(radiusM: number): string {
  if (!Number.isFinite(radiusM) || radiusM <= 0) return '—';
  const clamped = clampToGreatCircle(radiusM) as number;
  return clamped < 1_000 ? `${clamped.toFixed(0)} m` : `${(clamped / 1_000).toFixed(1)} km`;
}

/**
 * Format an aftershock onset (in seconds) as a human-friendly duration.
 * Buckets at 60 s / 1 h / 24 h to avoid "5400 s" or "0.06 d" weirdness.
 */
function formatDuration(
  seconds: number,
  t: (key: string, opts: { value: string }) => string
): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return t('globe.tooltip.duration.seconds', { value: seconds.toFixed(0) });
  if (seconds < 3_600)
    return t('globe.tooltip.duration.minutes', { value: (seconds / 60).toFixed(0) });
  if (seconds < 86_400)
    return t('globe.tooltip.duration.hours', { value: (seconds / 3_600).toFixed(1) });
  return t('globe.tooltip.duration.days', { value: (seconds / 86_400).toFixed(1) });
}

interface RingTooltipProps {
  /** Currently-hovered metadata, or null when no ring/aftershock is
   *  under the cursor. The component stays mounted in the DOM either
   *  way so the parent can mutate its position via ref without
   *  forcing remounts at 60 fps. */
  info: HoverInfo | null;
}

/**
 * Floating, cursor-tracking tooltip rendered above the Cesium canvas.
 * The parent (`Globe.tsx`) updates `style.left` / `style.top`
 * imperatively on every `MOUSE_MOVE`, while React only re-renders
 * when the hovered entity actually changes. This keeps the cursor
 * tracking butter-smooth even on large damage scenes.
 *
 * The tooltip is `pointer-events: none` so picks fall through to the
 * Cesium globe — clicks always reach the location-pick handler.
 */
export const RingTooltip = forwardRef(function RingTooltip(
  { info }: RingTooltipProps,
  ref: ForwardedRef<HTMLDivElement>
): JSX.Element {
  const { t } = useTranslation();
  const visible = info !== null;

  const renderRing = (ringInfo: RingHoverInfo): JSX.Element => (
    <>
      <div className={styles.titleBar} style={{ backgroundColor: ringInfo.color }} aria-hidden />
      <h3 className={styles.title}>{t(`globe.tooltip.ring.${ringInfo.kind}.title`)}</h3>
      <p className={styles.meta}>
        {t('globe.tooltip.radiusLine', { value: formatRadius(ringInfo.radiusM) })}
      </p>
      <p className={styles.description}>{t(`globe.tooltip.ring.${ringInfo.kind}.description`)}</p>
    </>
  );

  const renderAftershock = (aftershock: AftershockHoverInfo): JSX.Element => (
    <>
      <div className={styles.titleBar} style={{ backgroundColor: aftershock.color }} aria-hidden />
      <h3 className={styles.title}>{t('globe.tooltip.aftershock.title')}</h3>
      <p className={styles.meta}>
        {t('globe.tooltip.aftershock.magnitudeLine', { mw: aftershock.magnitude.toFixed(1) })}
      </p>
      <p className={styles.meta}>
        {t('globe.tooltip.aftershock.timeLine', {
          time: formatDuration(aftershock.timeAfterMainshock, t),
        })}
      </p>
      <p className={styles.description}>{t('globe.tooltip.aftershock.description')}</p>
    </>
  );

  return (
    <div
      ref={ref}
      className={styles.tooltip}
      data-visible={visible ? 'true' : 'false'}
      data-testid="ring-tooltip"
      role="tooltip"
      aria-hidden={!visible}
    >
      {info?.type === 'ring' && renderRing(info)}
      {info?.type === 'aftershock' && renderAftershock(info)}
    </div>
  );
});
