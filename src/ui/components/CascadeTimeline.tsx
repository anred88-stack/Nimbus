import { Fragment, useEffect, useMemo, useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { CascadePhase, CascadeStage } from '../../physics/cascade.js';
import styles from './CascadeTimeline.module.css';

/** Total duration (ms) of the synchronised-cascade reveal. The
 *  underlying physical onsets span seconds → millennia, so we log-
 *  compress them into this single UX budget. */
const CASCADE_ANIMATION_MS = 5_000;

/** Phase order — drives the section sequence in the UI. */
const PHASE_ORDER: readonly CascadePhase[] = [
  'immediate',
  'shortTerm',
  'mediumTerm',
  'longTerm',
] as const;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Vertical timeline of secondary / tertiary effects produced by an
 * event. Each entry shows the translated label, a one-sentence
 * description, and a rough onset time (seconds … millennia) — enough
 * for the viewer to grasp "what happens next" after the primary event
 * without reading the rest of the panel.
 *
 * Stages are grouped into four time-scale phases: Immediate (< 1 min),
 * Short-term (< 1 day), Medium-term (< 1 year), Long-term (≥ 1 year).
 * Each phase gets its own translated header so the reader can tell at
 * a glance that an extinction-tier impact reaches over millennia.
 *
 * The stages fade in sequentially over ≈5 s, synchronised with the
 * shockwave-ring animation on the globe. Onsets are log-compressed
 * (since they span seconds → millennia) so the crater / seismic /
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
  // log-compressing the physical onset (seconds → millennia range).
  const schedule = useMemo(() => {
    if (stages.length === 0) return [] as number[];
    const maxPhysicalSec = stages.reduce((m, st) => Math.max(m, st.onset as number), 0);
    const logMax = Math.log1p(Math.max(maxPhysicalSec, 1));
    return stages.map((st) => {
      const onsetSec = st.onset as number;
      const ratio = logMax > 0 ? Math.log1p(Math.max(onsetSec, 0)) / logMax : 0;
      return ratio * CASCADE_ANIMATION_MS;
    });
  }, [stages]);

  // Stages bucketed by phase, preserving the chronological order
  // already imposed by buildXxxCascade. Each entry keeps its index
  // into `schedule` so the per-stage reveal timing is unchanged.
  const phaseGroups = useMemo(() => {
    const groups = new Map<CascadePhase, { stage: CascadeStage; index: number }[]>();
    stages.forEach((st, index) => {
      const bucket = groups.get(st.phase) ?? [];
      bucket.push({ stage: st, index });
      groups.set(st.phase, bucket);
    });
    return PHASE_ORDER.flatMap((phase) => {
      const items = groups.get(phase);
      return items ? [{ phase, items }] : [];
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
        {phaseGroups.map(({ phase, items }) => (
          <Fragment key={phase}>
            <li className={styles.phaseHeader} data-phase={phase} aria-hidden>
              {t(`cascade.phase.${phase}`)}
            </li>
            {items.map(({ stage, index }) => {
              const uiOnset = schedule[index] ?? 0;
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
          </Fragment>
        ))}
      </ol>
      <p className={styles.scaleNote}>{t('cascade.scaleNote')}</p>
    </section>
  );
}

const ONE_MINUTE = 60;
const ONE_HOUR = 3_600;
const ONE_DAY = 86_400;
const ONE_MONTH = 86_400 * 30;
const ONE_YEAR = 86_400 * 365;
const ONE_DECADE = ONE_YEAR * 10;
const ONE_CENTURY = ONE_YEAR * 100;
const ONE_MILLENNIUM = ONE_YEAR * 1_000;

function formatOnset(seconds: number, t: (key: string) => string): string {
  if (seconds < 1) return t('cascade.time.instant');
  if (seconds < ONE_MINUTE) return `+${seconds.toFixed(0)} s`;
  if (seconds < ONE_HOUR) return `+${(seconds / ONE_MINUTE).toFixed(0)} min`;
  if (seconds < ONE_DAY) return `+${(seconds / ONE_HOUR).toFixed(1)} h`;
  if (seconds < ONE_MONTH * 2) return `+${(seconds / ONE_DAY).toFixed(0)} d`;
  if (seconds < ONE_YEAR) return `+${(seconds / ONE_MONTH).toFixed(0)} mo`;
  if (seconds < ONE_DECADE) return `+${(seconds / ONE_YEAR).toFixed(1)} y`;
  if (seconds < ONE_CENTURY) return `+${(seconds / ONE_DECADE).toFixed(0)} dec`;
  if (seconds < ONE_MILLENNIUM) return `+${(seconds / ONE_CENTURY).toFixed(0)} c`;
  return `+${(seconds / ONE_MILLENNIUM).toFixed(0)} ky`;
}
