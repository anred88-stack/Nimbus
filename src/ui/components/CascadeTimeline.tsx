import { useEffect, useMemo, useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { CascadeStage } from '../../physics/cascade.js';
import styles from './CascadeTimeline.module.css';

/** Total duration (ms) of the synchronised-cascade reveal. The
 *  underlying physical onsets span seconds → months, so we log-
 *  compress them into this single UX budget. */
const CASCADE_ANIMATION_MS = 5_000;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Vertical timeline of secondary / tertiary effects produced by an
 * event. Each entry shows the translated label, a one-sentence
 * description, and a rough onset time (seconds / minutes / hours /
 * days) — enough for the viewer to grasp "what happens next" after
 * the primary event without reading the rest of the panel.
 *
 * The stages fade in sequentially over ≈5 s, synchronised with the
 * shockwave-ring animation on the globe. Onsets are log-compressed
 * (since they span seconds → months) so the crater / seismic /
 * airblast triplet reads as "one moment" while climate-scale tertiary
 * stages appear at the tail. Honours `prefers-reduced-motion` by
 * revealing everything instantly.
 */
export function CascadeTimeline({ stages }: { stages: CascadeStage[] }): JSX.Element {
  const { t } = useTranslation();
  const [revealedUntilMs, setRevealedUntilMs] = useState(() =>
    prefersReducedMotion() ? Number.POSITIVE_INFINITY : 0
  );

  // Per-stage UI-space onset (0 → CASCADE_ANIMATION_MS) derived by
  // log-compressing the physical onset (seconds → months range).
  const schedule = useMemo(() => {
    if (stages.length === 0) return [] as number[];
    const maxPhysicalSec = stages.reduce((m, s) => Math.max(m, s.onset as number), 0);
    const logMax = Math.log1p(Math.max(maxPhysicalSec, 1));
    return stages.map((s) => {
      const onsetSec = s.onset as number;
      const ratio = logMax > 0 ? Math.log1p(Math.max(onsetSec, 0)) / logMax : 0;
      return ratio * CASCADE_ANIMATION_MS;
    });
  }, [stages]);

  // Single rAF loop per stages change. Bails out on prefers-reduced-
  // motion (initial state is already ∞). Cancelled on unmount.
  useEffect(() => {
    if (prefersReducedMotion()) {
      setRevealedUntilMs(Number.POSITIVE_INFINITY);
      return;
    }
    setRevealedUntilMs(0);
    if (stages.length === 0) return;
    const t0 = performance.now();
    let handle = 0;
    let cancelled = false;
    const tick = (): void => {
      if (cancelled) return;
      const elapsed = performance.now() - t0;
      setRevealedUntilMs(elapsed);
      if (elapsed < CASCADE_ANIMATION_MS) {
        handle = requestAnimationFrame(tick);
      }
    };
    handle = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
    };
  }, [stages]);

  if (stages.length === 0) return <></>;
  return (
    <section className={styles.timeline} aria-label={t('cascade.label')} aria-live="polite">
      <h3 className={styles.heading}>{t('cascade.label')}</h3>
      <ol className={styles.list}>
        {stages.map((stage, i) => {
          const uiOnset = schedule[i] ?? 0;
          const visible = revealedUntilMs >= uiOnset;
          return (
            <li
              key={stage.key}
              className={styles.item}
              data-tier={stage.tier}
              data-visible={visible ? 'true' : 'false'}
            >
              <span className={styles.onset}>{formatOnset(stage.onset, t)}</span>
              <span className={styles.body}>
                <strong className={styles.name}>{t(`${stage.key}.name`)}</strong>
                <span className={styles.description}>{t(`${stage.key}.desc`)}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function formatOnset(seconds: number, t: (key: string) => string): string {
  if (seconds < 1) return t('cascade.time.instant');
  if (seconds < 60) return `+${seconds.toFixed(0)} s`;
  if (seconds < 3_600) return `+${(seconds / 60).toFixed(0)} min`;
  if (seconds < 86_400) return `+${(seconds / 3_600).toFixed(1)} h`;
  if (seconds < 86_400 * 60) return `+${(seconds / 86_400).toFixed(0)} d`;
  return `+${(seconds / (86_400 * 30)).toFixed(0)} mo`;
}
