import type { JSX } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clampToGreatCircle, isGlobalReach } from '../../physics/earthScale.js';
import { useAppStore, type ActiveResult } from '../../store/index.js';
import styles from './RingLegend.module.css';

/**
 * Mirror of the swatch hexes used by `Globe.tsx` for each ring kind.
 * Kept here as a flat lookup so the legend reads as a self-contained
 * mapping from "what you see on the globe" to "what it means" without
 * forcing the rendering module to export its private palette.
 *
 * If a colour changes in `Globe.tsx`, change it here too — there is a
 * (deliberately) small E2E that verifies the legend swatches match
 * the rendered ring colours, see tests/e2e/simulator.spec.ts.
 */
const SWATCH: Record<string, string> = {
  craterRim: '#B91C1C',
  thirdDegreeBurn: '#F97316',
  secondDegreeBurn: '#FB923C',
  overpressure5psi: '#FACC15',
  overpressure1psi: '#FDE047',
  lightDamage: '#FEF3C7',
  radiationLD50: '#A855F7',
  empAffected: '#06B6D4',
  mmi7: '#FB923C',
  mmi8: '#DC2626',
  mmi9: '#7F1D1D',
  tsunamiCavity: '#38BDF8',
  tsunamiWaveFront5m: '#DB2777',
  tsunamiWaveFront1m: '#22D3EE',
  tsunamiWaveFront03m: '#A5F3FC',
  pyroclasticRunout: '#E11D48',
  lateralBlast: '#BE185D',
  ashfallPlume: '#9CA3AF',
  ejectaBlanket: '#78350F',
};

interface LegendRow {
  /** Stable React key + i18n key suffix (e.g. 'craterRim'). Matches the
   *  `RingTooltipKind` used by Globe.tsx so the visibility toggle and
   *  the per-ring CallbackProperty share a vocabulary. */
  key: string;
  /** Translated human-readable label. */
  label: string;
  /** Hex swatch colour. */
  color: string;
  /** Pre-formatted radius string (e.g. "1.2 km", "950 m", "global"). */
  radiusLabel: string;
  /** True when the raw radius wraps the planet — caller renders an
   *  i18n badge (`global` / `globale`) so the user reads the value
   *  the same way it appears in the SimulationReport panel. */
  global: boolean;
}

function formatRange(radiusM: number): string {
  if (!Number.isFinite(radiusM) || radiusM <= 0) return '—';
  const clamped = clampToGreatCircle(radiusM) as number;
  return clamped < 1_000 ? `${clamped.toFixed(0)} m` : `${(clamped / 1_000).toFixed(1)} km`;
}

/**
 * Add the three concentric tsunami wave-front rows (5 m / 1 m / 0.3 m
 * open-ocean amplitude thresholds) to the legend, computing each radius
 * from the SAME closed-form law the Globe layer uses to paint the rings.
 *
 *   - Cavity-collapse (Ward & Asphaug 2000) for impact, explosion,
 *     volcano-collapse, and submarine-landslide sources:
 *         A(r) = A₀ · R_C / r          ⇒  r = A₀ · R_C / A_target
 *   - Cylindrical line-source (Hanks-Kanamori → Okada → 1/√r) for
 *     megathrust earthquakes:
 *         A(r) = A₀ · √(R₀ / r)        ⇒  r = R₀ · (A₀ / A_target)²
 *
 * Skip a tier when the source amplitude is already below it (the wave
 * never reaches that intensity anywhere) — matches the Globe-layer
 * skip rule so the legend and the painted rings stay in lock-step.
 */
function pushTsunamiWaveFronts(
  out: LegendRow[],
  source:
    | { mode: 'cavity'; sourceAmplitude: number; cavityRadius: number }
    | { mode: 'cylindrical'; sourceAmplitude: number; halfLength: number },
  t: (key: string) => string
): void {
  const tiers = [
    { key: 'tsunamiWaveFront5m' as const, amplitude: 5 },
    { key: 'tsunamiWaveFront1m' as const, amplitude: 1 },
    { key: 'tsunamiWaveFront03m' as const, amplitude: 0.3 },
  ];
  for (const tier of tiers) {
    if (source.sourceAmplitude <= 0) continue;
    if (source.sourceAmplitude < tier.amplitude) continue;
    let radius: number;
    if (source.mode === 'cavity') {
      if (source.cavityRadius <= 0) continue;
      radius = (source.sourceAmplitude * source.cavityRadius) / tier.amplitude;
    } else {
      if (source.halfLength <= 0) continue;
      const ratio = source.sourceAmplitude / tier.amplitude;
      radius = source.halfLength * ratio * ratio;
    }
    const clamped = clampToGreatCircle(radius) as number;
    if (!Number.isFinite(clamped) || clamped <= 0) continue;
    out.push({
      key: tier.key,
      label: t(`globe.ringLabel.${tier.key}`),
      color: SWATCH[tier.key] ?? '#ffffff',
      radiusLabel: formatRange(clamped),
      global: isGlobalReach(clamped),
    });
  }
}

/**
 * Build the active-ring list for whichever scenario is currently in
 * the store. Returns an empty array when no simulation has run yet so
 * the caller can render the empty-state copy.
 */
function buildRingRows(result: ActiveResult | null, t: (key: string) => string): LegendRow[] {
  if (result === null) return [];
  const out: LegendRow[] = [];
  const push = (key: keyof typeof SWATCH, radiusM: number): void => {
    if (!Number.isFinite(radiusM) || radiusM <= 0) return;
    out.push({
      key,
      label: t(`globe.ringLabel.${key}`),
      color: SWATCH[key] ?? '#ffffff',
      radiusLabel: formatRange(radiusM),
      global: isGlobalReach(radiusM),
    });
  };

  switch (result.type) {
    case 'impact': {
      const d = result.data.damage;
      push('craterRim', d.craterRim);
      push('thirdDegreeBurn', d.thirdDegreeBurn);
      push('secondDegreeBurn', d.secondDegreeBurn);
      push('overpressure5psi', d.overpressure5psi);
      push('overpressure1psi', d.overpressure1psi);
      push('lightDamage', d.lightDamage);
      push('ejectaBlanket', result.data.ejecta.blanketEdge1mm);
      if (result.data.tsunami) {
        push('tsunamiCavity', result.data.tsunami.cavityRadius);
        pushTsunamiWaveFronts(
          out,
          {
            mode: 'cavity',
            sourceAmplitude: result.data.tsunami.sourceAmplitude,
            cavityRadius: result.data.tsunami.cavityRadius,
          },
          t
        );
      }
      break;
    }
    case 'explosion': {
      const b = result.data.blast;
      push('craterRim', (result.data.crater.apparentDiameter as number) / 2);
      push('thirdDegreeBurn', result.data.thermal.thirdDegreeBurnRadius);
      push('secondDegreeBurn', result.data.thermal.secondDegreeBurnRadius);
      push('overpressure5psi', b.overpressure5psiRadiusHob);
      push('overpressure1psi', b.overpressure1psiRadiusHob);
      push('lightDamage', b.lightDamageRadius);
      // Initial radiation lethal-dose ring — only when LD50 actually
      // escapes the fireball (small for sub-megaton, suppressed by
      // the renderer for very large yields).
      if (Number.isFinite(result.data.radiation.ld50Radius)) {
        push('radiationLD50', result.data.radiation.ld50Radius);
      }
      // EMP footprint — only for non-NEGLIGIBLE regimes (HEMP shots
      // dominate, Starfish-Prime-style continental reach).
      if (result.data.emp.regime !== 'NEGLIGIBLE') {
        push('empAffected', result.data.emp.affectedRadius);
      }
      if (result.data.tsunami) {
        push('tsunamiCavity', result.data.tsunami.cavityRadius);
        pushTsunamiWaveFronts(
          out,
          {
            mode: 'cavity',
            sourceAmplitude: result.data.tsunami.sourceAmplitude,
            cavityRadius: result.data.tsunami.cavityRadius,
          },
          t
        );
      }
      break;
    }
    case 'earthquake': {
      const s = result.data.shaking;
      push('mmi9', s.mmi9Radius);
      push('mmi8', s.mmi8Radius);
      push('mmi7', s.mmi7Radius);
      // Submarine megathrust: surface the same three wave-front rings
      // the Globe paints (5 m / 1 m / 0.3 m source-amplitude thresholds)
      // computed from the cylindrical-line-source law. Replaces the
      // legacy synthetic `tsunamiCavity = ruptureLength / 4` row, which
      // did not correspond to anything actually rendered on the globe.
      if (result.data.tsunami) {
        pushTsunamiWaveFronts(
          out,
          {
            mode: 'cylindrical',
            sourceAmplitude: result.data.tsunami.initialAmplitude,
            halfLength: (result.data.ruptureLength as number) / 2,
          },
          t
        );
      }
      break;
    }
    case 'volcano': {
      push('pyroclasticRunout', result.data.pyroclasticRunout);
      if (result.data.lateralBlast) push('lateralBlast', result.data.lateralBlast.runout);
      if (result.data.windAdvectedAshfall)
        push('ashfallPlume', result.data.windAdvectedAshfall.downwindRange);
      if (result.data.tsunami) {
        push('tsunamiCavity', result.data.tsunami.cavityRadius);
        pushTsunamiWaveFronts(
          out,
          {
            mode: 'cavity',
            sourceAmplitude: result.data.tsunami.sourceAmplitude,
            cavityRadius: result.data.tsunami.cavityRadius,
          },
          t
        );
      }
      break;
    }
    case 'landslide': {
      if (result.data.tsunami !== null) {
        push('tsunamiCavity', result.data.tsunami.cavityRadius);
        pushTsunamiWaveFronts(
          out,
          {
            mode: 'cavity',
            sourceAmplitude: result.data.tsunami.sourceAmplitude,
            cavityRadius: result.data.tsunami.cavityRadius,
          },
          t
        );
      }
      break;
    }
  }
  return out;
}

/**
 * Floating contextual legend pinned to the lower-right of the globe.
 * Reads the active simulation result from the Zustand store and
 * lists every visible ring with its swatch, plain-language label,
 * and ground-range radius. Each row is a toggle button — clicking it
 * hides / shows the matching ring on the globe through the
 * `hiddenRingKeys` store slice (Globe.tsx wires a CallbackProperty
 * to each entity's `show` field, so toggling does NOT restart the
 * ring-grow animation). Collapsible; respects WCAG keyboard focus
 * rules.
 *
 * Pedagogical role: the globe shows the colours, the legend explains
 * what they mean. Together they remove the "what does the orange ring
 * actually represent?" friction that was previously forcing users to
 * cross-reference the side simulator panel.
 */
export function RingLegend(): JSX.Element {
  const { t } = useTranslation();
  const result = useAppStore((s) => s.result);
  const hiddenRingKeys = useAppStore((s) => s.hiddenRingKeys);
  const toggleRingVisibility = useAppStore((s) => s.toggleRingVisibility);
  const showAllRings = useAppStore((s) => s.showAllRings);
  const bathymetricTsunami = useAppStore((s) => s.bathymetricTsunami);
  const globalBathymetricGrid = useAppStore((s) => s.globalBathymetricGrid);
  const [collapsed, setCollapsed] = useState(false);

  const rows = buildRingRows(result, t);
  const anyHidden = rows.some((r) => hiddenRingKeys.has(r.key));

  // Phase 12c — tsunami map status. Surfaces the user-facing question
  // "did the trans-oceanic propagation actually run for this scenario?"
  // without making them open dev-tools.
  const tsunamiPresent = bathymetricTsunami !== null;
  const globalAvailable = globalBathymetricGrid !== null;
  const globalActive = bathymetricTsunami?.global !== undefined;
  let tsunamiStatusKey: 'globalActive' | 'localOnly' | 'globalLoading' | null = null;
  if (tsunamiPresent) {
    if (globalActive) tsunamiStatusKey = 'globalActive';
    else if (!globalAvailable) tsunamiStatusKey = 'globalLoading';
    else tsunamiStatusKey = 'localOnly';
  }

  return (
    <aside
      className={styles.legend}
      aria-label={t('globe.legend.heading')}
      data-testid="ring-legend"
    >
      <header className={styles.header}>
        <h2 className={styles.heading}>{t('globe.legend.heading')}</h2>
        <div className={styles.headerActions}>
          {anyHidden && (
            <button
              type="button"
              className={styles.showAll}
              onClick={(): void => {
                showAllRings();
              }}
              data-testid="ring-legend-show-all"
            >
              {t('globe.legend.showAll')}
            </button>
          )}
          <button
            type="button"
            className={styles.toggle}
            onClick={(): void => {
              setCollapsed((prev) => !prev);
            }}
            aria-expanded={!collapsed}
            aria-label={collapsed ? t('globe.legend.toggleShow') : t('globe.legend.toggleHide')}
          >
            {collapsed ? '▸' : '▾'}
          </button>
        </div>
      </header>
      {!collapsed && (
        <>
          <p className={styles.subheading}>{t('globe.legend.subheading')}</p>
          {rows.length === 0 ? (
            <p className={styles.empty}>{t('globe.legend.empty')}</p>
          ) : (
            <ul className={styles.list}>
              {rows.map((row) => {
                const hidden = hiddenRingKeys.has(row.key);
                return (
                  <li key={row.key} className={styles.row}>
                    <button
                      type="button"
                      className={[styles.rowButton, hidden ? styles.rowHidden : '']
                        .filter(Boolean)
                        .join(' ')}
                      onClick={(): void => {
                        toggleRingVisibility(row.key);
                      }}
                      aria-pressed={!hidden}
                      aria-label={
                        hidden
                          ? t('globe.legend.rowAriaShow', { name: row.label })
                          : t('globe.legend.rowAriaHide', { name: row.label })
                      }
                      data-testid={`ring-legend-row-${row.key}`}
                    >
                      <span
                        className={styles.swatch}
                        style={{ backgroundColor: row.color }}
                        aria-hidden="true"
                      />
                      <span className={styles.label}>{row.label}</span>
                      <span className={styles.radius}>
                        {row.radiusLabel}
                        {row.global && (
                          <span className={styles.globalBadge}>
                            {' '}
                            ({t('globe.legend.globalBadge')})
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {tsunamiStatusKey !== null && (
            <p className={styles.tsunamiStatus} data-status={tsunamiStatusKey}>
              {t(`globe.legend.tsunamiStatus.${tsunamiStatusKey}`)}
            </p>
          )}
          {rows.length > 0 && (
            <p className={styles.uncertaintyNote}>{t('globe.legend.uncertaintyNote')}</p>
          )}
        </>
      )}
    </aside>
  );
}
