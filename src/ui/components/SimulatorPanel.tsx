import type { ChangeEvent, JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  EARTHQUAKE_PRESETS,
  type EarthquakePresetId,
} from '../../physics/events/earthquake/index.js';
import { EXPLOSION_PRESETS, type ExplosionPresetId } from '../../physics/events/explosion/index.js';
import { LANDSLIDE_PRESETS, type LandslidePresetId } from '../../physics/events/landslide/index.js';
import { VOLCANO_PRESETS, type VolcanoPresetId } from '../../physics/events/volcano/index.js';
import {
  buildEarthquakeCascade,
  buildExplosionCascade,
  buildImpactCascade,
  buildLandslideCascade,
  buildVolcanoCascade,
} from '../../physics/cascade.js';
import { bandFor, type ConfidenceField } from '../../physics/confidence.js';
import { clampToGreatCircle, isGlobalReach } from '../../physics/earthScale.js';
import { IMPACT_PRESETS, type ImpactPresetId } from '../../physics/simulate.js';
import { joulesToMegatons } from '../../physics/units.js';
import {
  useAppStore,
  type ActiveMonteCarlo,
  type AnyPresetId,
  type EventType,
} from '../../store/index.js';
import { cx } from '../utils/cx.js';
import { CascadeTimeline } from './CascadeTimeline.js';
import { CitationTooltip } from './CitationTooltip.js';
import { EarthquakeCustomInputs } from './EarthquakeCustomInputs.js';
import { ExplosionCustomInputs } from './ExplosionCustomInputs.js';
import { ImpactCustomInputs } from './ImpactCustomInputs.js';
import { VolcanoCustomInputs } from './VolcanoCustomInputs.js';
import styles from './SimulatorPanel.module.css';

const IMPACT_PRESET_IDS: ImpactPresetId[] = [
  'CHICXULUB',
  'CHICXULUB_OCEAN',
  'POPIGAI',
  'BOLTYSH',
  'TUNGUSKA',
  'METEOR_CRATER',
  'SIKHOTE_ALIN_1947',
  'CHELYABINSK',
];
const EXPLOSION_PRESET_IDS: ExplosionPresetId[] = [
  'HIROSHIMA_1945',
  'NAGASAKI_1945',
  'HALIFAX_1917',
  'TEXAS_CITY_1947',
  'BEIRUT_2020',
  'IVY_MIKE_1952',
  'CASTLE_BRAVO_1954',
  'TSAR_BOMBA_1961',
  'STARFISH_PRIME_1962',
  'ONE_MEGATON',
];
const EARTHQUAKE_PRESET_IDS: EarthquakePresetId[] = [
  'VALDIVIA_1960',
  'ALASKA_1964',
  'TOHOKU_2011',
  'SUMATRA_2004',
  'LISBON_1755',
  'NEPAL_2015',
  'NORTHRIDGE_1994',
  'KUNLUN_2001',
  'L_AQUILA_2009',
  'AMATRICE_2016',
];
const VOLCANO_PRESET_IDS: VolcanoPresetId[] = [
  'VESUVIUS_79_CE',
  'KRAKATAU_1883',
  'TAMBORA_1815',
  'MT_ST_HELENS_1980',
  'MOUNT_PELEE_1902',
  'ETNA_1669',
  'PINATUBO_1991',
  'EYJAFJALLAJOKULL_2010',
  'HUNGA_TONGA_2022',
  'ANAK_KRAKATAU_2018',
];
const LANDSLIDE_PRESET_IDS: LandslidePresetId[] = [
  'STOREGGA_8200_BP',
  'VAIONT_1963',
  'ANAK_KRAKATAU_2018',
  'LITUYA_BAY_1958',
  'ELM_1881',
];
const EVENT_TYPES: EventType[] = ['impact', 'explosion', 'earthquake', 'volcano', 'landslide'];

function formatMegatons(mt: number): string {
  if (mt < 0.001) return `${(mt * 1_000_000).toFixed(0)} t`;
  if (mt < 1) return `${(mt * 1_000).toFixed(1)} kt`;
  if (mt < 1_000) return `${mt.toFixed(1)} Mt`;
  return `${(mt / 1_000).toFixed(2)} Gt`;
}

function formatKilometres(m: number): string {
  if (m < 1_000) return `${m.toFixed(0)} m`;
  return `${(m / 1_000).toFixed(1)} km`;
}

/**
 * Display-layer formatter for a surface-range damage radius: clamps
 * at the antipodal great-circle distance (π·R) and tags the value as
 * global when it reaches ≥ 90 % of that bound. Raw physics output is
 * not modified; the UI just refuses to show "60 000 km" as a ring
 * radius when the ring has already wrapped the planet.
 */
function formatRange(rangeMeters: number): { label: string; global: boolean } {
  const global = isGlobalReach(rangeMeters);
  const clamped = clampToGreatCircle(rangeMeters);
  return { label: formatKilometres(clamped), global };
}

function RangeValue({ meters }: { meters: number }): JSX.Element {
  const { t } = useTranslation();
  const { label, global } = formatRange(meters);
  return (
    <>
      {label}
      {global && <span className={styles.globalBadge}> ({t('globe.legend.globalBadge')})</span>}
    </>
  );
}

/**
 * Value + confidence-band renderer for fields whose published 1σ
 * scatter is large. Shows the point estimate in the primary line and
 * the low–high band underneath in muted text, together with the σ%.
 */
function RangeValueWithBand({
  meters,
  field,
}: {
  meters: number;
  field: ConfidenceField;
}): JSX.Element {
  const { t } = useTranslation();
  const band = bandFor(meters, field);
  const primary = formatRange(meters);
  const lowLabel = formatRange(band.low).label;
  const highLabel = formatRange(band.high).label;
  const pct = `±${Math.round(band.sigma * 100).toString()} %`;
  return (
    <>
      {primary.label}
      {primary.global && (
        <span className={styles.globalBadge}> ({t('globe.legend.globalBadge')})</span>
      )}
      <span className={styles.confidenceBand}>
        {' '}
        ({lowLabel} – {highLabel}, {pct})
      </span>
    </>
  );
}

function AreaWithBand({ m2, field }: { m2: number; field: ConfidenceField }): JSX.Element {
  const band = bandFor(m2, field);
  const pct = `±${Math.round(band.sigma * 100).toString()} %`;
  return (
    <>
      {formatArea(m2)}
      <span className={styles.confidenceBand}>
        {' '}
        ({formatArea(band.low)} – {formatArea(band.high)}, {pct})
      </span>
    </>
  );
}

function formatDurationMinutes(seconds: number): string {
  const minutes = seconds / 60;
  if (minutes < 60) return `${minutes.toFixed(0)} min`;
  const hours = Math.floor(minutes / 60);
  const rem = Math.round(minutes % 60);
  return rem === 0 ? `${hours.toFixed(0)} h` : `${hours.toFixed(0)} h ${rem.toFixed(0)} min`;
}

/** Tsunami celerity printout — "X m/s · ≈ Y km/h" so the popular-
 *  science viewer reads the speed in both SI and the everyday-vehicle
 *  unit. At 4 km mean depth this surfaces as "≈ 198 m/s · 713 km/h". */
function formatTsunamiCelerity(celerityMs: number): string {
  if (!Number.isFinite(celerityMs) || celerityMs <= 0) return '—';
  const kmh = celerityMs * 3.6;
  return `${celerityMs.toFixed(0)} m/s · ≈ ${kmh.toFixed(0)} km/h`;
}

/**
 * Render the beach slope consumed by the Synolakis run-up as
 * "X.X° · 1:N · <DEM | reference>" so the user knows whether the
 * coastal damage estimate is site-aware (sampled from the AWS
 * Terrarium tile around the click) or uses the textbook 1:100
 * plane-beach fallback.
 */
function formatBeachSlope(slopeRad: number, fromDEM: boolean, t: (key: string) => string): string {
  if (!Number.isFinite(slopeRad) || slopeRad <= 0) return '—';
  const deg = (slopeRad * 180) / Math.PI;
  const ratio = Math.round(1 / Math.tan(slopeRad));
  const sourceLabel = fromDEM
    ? t('simulator.tsunamiSlopeSourceDEM')
    : t('simulator.tsunamiSlopeSourceReference');
  return `${deg.toFixed(2)}° · 1:${ratio.toString()} · ${sourceLabel}`;
}

/**
 * Map a coastal run-up height (m) to one of six damage tiers, each
 * tied to a translation key under `simulator.tsunamiDamage.tier*`.
 * Boundaries follow Bryant (2014) §10.5, FEMA P-646 §3, and the
 * Imamura intensity scale used in the JMA / IUGG tsunami warnings:
 *
 *   < 0.3 m  → tier0 (negligible — tide-gauge signature)
 *   0.3–1 m  → tier1 (light flooding; people swept off feet)
 *   1–3 m    → tier2 (cars displaced; wood-frame interiors flooded)
 *   3–6 m    → tier3 (wood buildings destroyed; harbours wrecked)
 *   6–10 m   → tier4 (concrete buildings damaged; coastal towns gutted)
 *   ≥ 10 m   → tier5 (catastrophic — Tōhoku-/Lituya-class destruction)
 *
 * Returns the translation key the caller should pass to `t(...)`.
 */
function coastalDamageTierKey(runupM: number): string {
  if (!Number.isFinite(runupM) || runupM <= 0.3) return 'simulator.tsunamiDamage.tier0';
  if (runupM <= 1) return 'simulator.tsunamiDamage.tier1';
  if (runupM <= 3) return 'simulator.tsunamiDamage.tier2';
  if (runupM <= 6) return 'simulator.tsunamiDamage.tier3';
  if (runupM <= 10) return 'simulator.tsunamiDamage.tier4';
  return 'simulator.tsunamiDamage.tier5';
}

function formatScientific(n: number, digits = 2): string {
  if (n === 0) return '0';
  const exp = Math.floor(Math.log10(Math.abs(n)));
  const mantissa = n / 10 ** exp;
  return `${mantissa.toFixed(digits)} × 10${toSuperscript(exp)}`;
}

function formatKilopascals(pa: number): string {
  const kpa = pa / 1_000;
  if (kpa >= 1_000) return `${(kpa / 1_000).toFixed(1)} MPa`;
  if (kpa >= 1) return `${kpa.toFixed(1)} kPa`;
  return `${pa.toFixed(0)} Pa`;
}

function formatG(accel: number): string {
  const g = accel / 9.80665;
  if (g >= 0.01) return `${g.toFixed(2)} g`;
  return `${(g * 1_000).toFixed(0)} mg`;
}

function formatJoules(j: number): string {
  return `${formatScientific(j)} J`;
}

function formatKilotons(kt: number): string {
  if (kt < 1) return `${(kt * 1_000).toFixed(0)} t`;
  if (kt < 1_000) return `${kt.toFixed(1)} kt`;
  return `${(kt / 1_000).toFixed(2)} Mt`;
}

function formatArea(m2: number): string {
  if (!Number.isFinite(m2) || m2 <= 0) return '0 m²';
  const km2 = m2 / 1_000_000;
  if (km2 >= 1_000_000) return `${(km2 / 1_000_000).toFixed(1)} M km²`;
  if (km2 >= 1) return `${km2.toFixed(1)} km²`;
  return `${m2.toFixed(0)} m²`;
}

/**
 * Visible category heading rendered above every results `<dl>`. Reuses
 * the same translation key the `<dl>` carries on `aria-label` so the
 * visible label and the screen-reader label always stay in sync.
 *
 * The component exists for a single concrete UX reason: a non-expert
 * user opening the panel needs to read "what kind of data is in this
 * box?" before reading the numbers themselves. Without the heading
 * the panel was a flat list of dt/dd pairs with no separation
 * between, e.g., the crater radii block and the atmospheric-entry
 * block — two physically distinct phenomena printed side by side.
 */
function SectionHeading({ labelKey }: { labelKey: string }): JSX.Element {
  const { t } = useTranslation();
  return <h3 className={styles.sectionHeading}>{t(labelKey)}</h3>;
}

function formatMass(kilograms: number): string {
  if (!Number.isFinite(kilograms) || kilograms <= 0) return '0 kg';
  if (kilograms >= 1e12) return `${formatScientific(kilograms)} kg`;
  if (kilograms >= 1e9) return `${(kilograms / 1e9).toFixed(2)} Gt`;
  if (kilograms >= 1e6) return `${(kilograms / 1e6).toFixed(2)} Mt`;
  if (kilograms >= 1_000) return `${(kilograms / 1_000).toFixed(2)} t`;
  return `${kilograms.toFixed(0)} kg`;
}

function toSuperscript(n: number): string {
  const map: Record<string, string> = {
    '0': '⁰',
    '1': '¹',
    '2': '²',
    '3': '³',
    '4': '⁴',
    '5': '⁵',
    '6': '⁶',
    '7': '⁷',
    '8': '⁸',
    '9': '⁹',
    '-': '⁻',
  };
  return n
    .toString()
    .split('')
    .map((c) => map[c] ?? c)
    .join('');
}

export function SimulatorPanel(): JSX.Element {
  const { t } = useTranslation();
  const eventType = useAppStore((s) => s.eventType);
  const impactPreset = useAppStore((s) => s.impact.preset);
  const explosionPreset = useAppStore((s) => s.explosion.preset);
  const earthquakePreset = useAppStore((s) => s.earthquake.preset);
  const volcanoPreset = useAppStore((s) => s.volcano.preset);
  const landslidePreset = useAppStore((s) => s.landslide.preset);
  const location = useAppStore((s) => s.location);
  const result = useAppStore((s) => s.result);
  const selectEventType = useAppStore((s) => s.selectEventType);
  const selectPreset = useAppStore((s) => s.selectPreset);
  const evaluate = useAppStore((s) => s.evaluate);
  const setMode = useAppStore((s) => s.setMode);
  const reset = useAppStore((s) => s.reset);
  const evaluateMonteCarlo = useAppStore((s) => s.evaluateMonteCarlo);
  const monteCarlo = useAppStore((s) => s.monteCarlo);
  const monteCarloStatus = useAppStore((s) => s.monteCarloStatus);
  const simulationStatus = useAppStore((s) => s.status);
  const populationExposure = useAppStore((s) => s.populationExposure);
  const populationStatus = useAppStore((s) => s.populationStatus);

  const handleEventTypeChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    selectEventType(event.target.value as EventType);
  };

  const handlePresetChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    selectPreset(event.target.value as AnyPresetId);
  };

  const handleLaunch = (): void => {
    if (!location) return;
    void evaluate();
  };

  const handleBackToLanding = (): void => {
    reset();
    setMode('landing');
  };

  const [copied, setCopied] = useState(false);
  // On narrow viewports the panel covers the entire globe and the
  // user can no longer click the surface to pick a location — even
  // though the status message still tells them to. Default-collapsed
  // on mobile keeps the globe reachable; the toggle in the header is
  // always present so screen-reader users can expand it again.
  const isMobileViewport =
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
  const [panelOpen, setPanelOpen] = useState(!isMobileViewport);
  const copyTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyLink = useCallback((): void => {
    const url = window.location.href;
    const done = (): void => {
      setCopied(true);
      if (copyTimeoutRef.current !== null) window.clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopied(false);
        copyTimeoutRef.current = null;
      }, 2_000);
    };
    // Guarded against non-secure contexts where `navigator.clipboard`
    // is actually `undefined` at runtime even though the DOM types
    // declare it as always present. Any failure falls back to the
    // "we showed the link in the URL bar, take it from there" path.
    try {
      void navigator.clipboard.writeText(url).then(done, done);
    } catch {
      done();
    }
  }, []);

  const isRunning = simulationStatus === 'running';
  const canLaunch = location !== null && !isRunning;
  const statusKey = isRunning ? 'running' : canLaunch ? 'ready' : 'waiting';
  const backLabel = t('simulator.back');
  const backAction = handleBackToLanding;

  const presetIds: readonly AnyPresetId[] =
    eventType === 'impact'
      ? IMPACT_PRESET_IDS
      : eventType === 'explosion'
        ? EXPLOSION_PRESET_IDS
        : eventType === 'earthquake'
          ? EARTHQUAKE_PRESET_IDS
          : eventType === 'volcano'
            ? VOLCANO_PRESET_IDS
            : LANDSLIDE_PRESET_IDS;
  const currentPreset =
    eventType === 'impact'
      ? impactPreset
      : eventType === 'explosion'
        ? explosionPreset
        : eventType === 'earthquake'
          ? earthquakePreset
          : eventType === 'volcano'
            ? volcanoPreset
            : landslidePreset;
  const fallbackPreset = presetIds[0];
  const presetValue =
    currentPreset === 'CUSTOM' ? 'CUSTOM' : fallbackPreset === undefined ? '' : currentPreset;

  const labelFor = (id: AnyPresetId): string => {
    if (id in IMPACT_PRESETS) return IMPACT_PRESETS[id as ImpactPresetId].name;
    if (id in EXPLOSION_PRESETS) return EXPLOSION_PRESETS[id as ExplosionPresetId].name;
    if (id in EARTHQUAKE_PRESETS) return EARTHQUAKE_PRESETS[id as EarthquakePresetId].name;
    // Landslide preset ids overlap volcano (ANAK_KRAKATAU_2018), so
    // probe LANDSLIDE_PRESETS first when the active event type asks
    // for landslide labelling.
    if (eventType === 'landslide' && id in LANDSLIDE_PRESETS) {
      return LANDSLIDE_PRESETS[id as LandslidePresetId].name;
    }
    if (id in VOLCANO_PRESETS) return VOLCANO_PRESETS[id as VolcanoPresetId].name;
    return LANDSLIDE_PRESETS[id as LandslidePresetId].name;
  };

  const noteFor = (id: AnyPresetId): string => {
    // Authoritative English copy lives inline next to the physics
    // preset (kept there so the headless `pnpm simulate` CLI stays
    // self-contained). The i18n layer provides translations under
    // `presets.<eventType>.<id>.note`; missing keys fall back to the
    // English inline so a new preset never crashes the panel — it
    // just renders untranslated until a translator catches up.
    const fallback: string =
      id in IMPACT_PRESETS
        ? IMPACT_PRESETS[id as ImpactPresetId].note
        : id in EXPLOSION_PRESETS
          ? EXPLOSION_PRESETS[id as ExplosionPresetId].note
          : id in EARTHQUAKE_PRESETS
            ? EARTHQUAKE_PRESETS[id as EarthquakePresetId].note
            : eventType === 'landslide' && id in LANDSLIDE_PRESETS
              ? LANDSLIDE_PRESETS[id as LandslidePresetId].note
              : id in VOLCANO_PRESETS
                ? VOLCANO_PRESETS[id as VolcanoPresetId].note
                : LANDSLIDE_PRESETS[id as LandslidePresetId].note;
    return t(`presets.${eventType}.${id}.note`, { defaultValue: fallback });
  };
  const presetNote = presetValue === '' || presetValue === 'CUSTOM' ? null : noteFor(presetValue);

  return (
    <aside
      className={cx(styles.panel, !panelOpen && styles.panelCollapsed)}
      aria-label={t('simulator.panelLabel')}
    >
      <div className={styles.header}>
        <button type="button" onClick={backAction} className={styles.back}>
          ← {backLabel}
        </button>
        <h2 className={styles.title}>{t('simulator.title')}</h2>
        <button
          type="button"
          className={styles.mobileToggle}
          onClick={() => {
            setPanelOpen((v) => !v);
          }}
          aria-expanded={panelOpen}
          aria-label={panelOpen ? t('simulator.collapsePanel') : t('simulator.expandPanel')}
        >
          {panelOpen ? '▾' : '▸'}
        </button>
      </div>

      <div className={styles.body}>
        <div className={styles.field}>
          <label htmlFor="event-type-select" className={styles.label}>
            {t('simulator.eventType')}
          </label>
          <select
            id="event-type-select"
            className={styles.select}
            value={eventType}
            onChange={handleEventTypeChange}
          >
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`simulator.eventTypes.${type}`)}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="preset-select" className={styles.label}>
            {t('simulator.preset')}
          </label>
          <select
            id="preset-select"
            className={styles.select}
            value={presetValue}
            onChange={handlePresetChange}
          >
            {presetIds.map((id) => (
              <option key={id} value={id}>
                {labelFor(id)}
              </option>
            ))}
            {currentPreset === 'CUSTOM' && (
              <option value="CUSTOM">{t('simulator.customPreset')}</option>
            )}
          </select>
          {presetNote !== null && <p className={styles.presetNote}>{presetNote}</p>}
        </div>

        {eventType === 'impact' && <ImpactCustomInputs />}
        {eventType === 'explosion' && <ExplosionCustomInputs />}
        {eventType === 'earthquake' && <EarthquakeCustomInputs />}
        {eventType === 'volcano' && <VolcanoCustomInputs />}

        <div className={styles.status} data-state={statusKey} role="status" aria-live="polite">
          {isRunning
            ? t('simulator.running')
            : location
              ? t('simulator.locationReady', {
                  lat: location.latitude.toFixed(2),
                  lon: location.longitude.toFixed(2),
                })
              : t('simulator.clickGlobe')}
        </div>

        <button
          type="button"
          className={styles.trigger}
          onClick={handleLaunch}
          disabled={!canLaunch}
        >
          {isRunning ? t('simulator.running') : t('simulator.launch')}
        </button>

        <button
          type="button"
          className={styles.secondary}
          onClick={handleCopyLink}
          data-state={copied ? 'copied' : 'idle'}
        >
          <span aria-live="polite">
            {copied ? t('simulator.linkCopied') : t('simulator.copyLink')}
          </span>
        </button>

        {result !== null && (
          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              setMode('report');
            }}
          >
            {t('simulator.downloadReport')}
          </button>
        )}

        {result !== null && (
          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              evaluateMonteCarlo();
            }}
            disabled={monteCarloStatus === 'running'}
            data-state={
              monteCarloStatus === 'running' ? 'running' : monteCarlo === null ? 'idle' : 'ready'
            }
          >
            {monteCarloStatus === 'running'
              ? t('simulator.runningMonteCarlo')
              : monteCarlo === null
                ? t('simulator.runMonteCarlo')
                : t('simulator.rerunMonteCarlo')}
          </button>
        )}

        {result?.type === 'impact' && (
          <>
            <SectionHeading labelKey="simulator.impactSummaryHeading" />
            <dl className={styles.result} aria-label={t('simulator.impactSummaryHeading')}>
              <dt className={styles.resultLabel}>{t('simulator.energy')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.kineticEnergy')}>
                  {formatMegatons(joulesToMegatons(result.data.impactor.kineticEnergy))}
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.crater')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.finalCrater')}>
                  {formatKilometres(result.data.crater.finalDiameter)}
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.transientCrater')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.transientCrater')}>
                  {formatKilometres(result.data.crater.transientDiameter)}
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.craterDepth')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.craterDepth')}>
                  {formatKilometres(result.data.crater.depth)}
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.magnitude')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.seismicMagnitude')}>
                  Mw {result.data.seismic.magnitude.toFixed(1)}
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.magnitudeTW')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.seismicMagnitudeTW')}>
                  Mw {result.data.seismic.magnitudeTeanbyWookey.toFixed(1)}
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.impactLiquefaction')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.liquefaction')}>
                  <RangeValue meters={result.data.seismic.liquefactionRadius} />
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.morphology')}</dt>
              <dd className={styles.resultValue}>
                {t(`simulator.${result.data.crater.morphology}`)}
              </dd>
            </dl>
            <SectionHeading labelKey="simulator.damageLabel" />
            <dl className={styles.result} aria-label={t('simulator.damageLabel')}>
              <dt className={styles.resultLabel}>{t('simulator.thirdDegreeBurn')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.thermal')}>
                  <RangeValue meters={result.data.damage.thirdDegreeBurn} />
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.fivePsiRing')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.blast')}>
                  <RangeValue meters={result.data.damage.overpressure5psi} />
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.onePsiRing')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.blast')}>
                  <RangeValue meters={result.data.damage.overpressure1psi} />
                </CitationTooltip>
              </dd>
            </dl>
            <SectionHeading labelKey="simulator.entryLabel" />
            <dl className={styles.result} aria-label={t('simulator.entryLabel')}>
              <dt className={styles.resultLabel}>{t('simulator.entryRegime')}</dt>
              <dd className={styles.resultValue}>
                {t(`simulator.entryRegimes.${result.data.entry.regime}`)}
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.burstAltitude')}</dt>
              <dd className={styles.resultValue}>
                {formatKilometres(result.data.entry.burstAltitude)}
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.breakupAltitude')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.atmosphericEntry')}>
                  {formatKilometres(result.data.entry.breakupAltitude)}
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.penetrationBonus')}</dt>
              <dd className={styles.resultValue}>
                {formatKilometres(result.data.entry.penetrationBonus)}
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.energyFractionToGround')}</dt>
              <dd className={styles.resultValue}>
                {(result.data.entry.energyFractionToGround * 100).toFixed(1)} %
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.atmosphericYield')}</dt>
              <dd className={styles.resultValue}>
                {formatMegatons(result.data.entry.atmosphericYieldMegatons)}
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.entryRegimeExplainer')}</dt>
              <dd className={styles.resultValue}>
                {t(`simulator.entryRegimeExplain.${result.data.entry.regime}`)}
              </dd>
            </dl>
            {result.data.entry.regime !== 'INTACT' && (
              <>
                <SectionHeading labelKey="simulator.entryFlashLabel" />
                <dl className={styles.result} aria-label={t('simulator.entryFlashLabel')}>
                  <dt className={styles.resultLabel}>{t('simulator.entryAmplificationFactor')}</dt>
                  <dd className={styles.resultValue}>
                    <CitationTooltip citation={t('citations.bolideAirburstAmplification')}>
                      {result.data.entry.airburstAmplificationFactor.toFixed(2)} ×
                    </CitationTooltip>
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.entryFlashFirstDegree')}</dt>
                  <dd className={styles.resultValue}>
                    <CitationTooltip citation={t('citations.thermal')}>
                      <RangeValue meters={result.data.entry.flashBurnRadii.firstDegree} />
                    </CitationTooltip>
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.entryFlashSecondDegree')}</dt>
                  <dd className={styles.resultValue}>
                    <RangeValue meters={result.data.entry.flashBurnRadii.secondDegree} />
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.entryFlashThirdDegree')}</dt>
                  <dd className={styles.resultValue}>
                    <RangeValue meters={result.data.entry.flashBurnRadii.thirdDegree} />
                  </dd>
                </dl>
                <SectionHeading labelKey="simulator.entryShockLabel" />
                <dl className={styles.result} aria-label={t('simulator.entryShockLabel')}>
                  <dt className={styles.resultLabel}>{t('simulator.entryShockLightDamage')}</dt>
                  <dd className={styles.resultValue}>
                    <CitationTooltip citation={t('citations.blast')}>
                      <RangeValue meters={result.data.entry.shockWaveRadii.lightDamage} />
                    </CitationTooltip>
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.entryShockOnePsi')}</dt>
                  <dd className={styles.resultValue}>
                    <RangeValue meters={result.data.entry.shockWaveRadii.onePsi} />
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.entryShockFivePsi')}</dt>
                  <dd className={styles.resultValue}>
                    <RangeValue meters={result.data.entry.shockWaveRadii.fivePsi} />
                  </dd>
                </dl>
              </>
            )}
            <SectionHeading labelKey="simulator.firestormLabel" />
            <dl className={styles.result} aria-label={t('simulator.firestormLabel')}>
              <dt className={styles.resultLabel}>{t('simulator.ignitionRadius')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.firestorm')}>
                  <RangeValueWithBand
                    meters={result.data.firestorm.ignitionRadius}
                    field="firestormIgnition"
                  />
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.sustainRadius')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.firestorm')}>
                  <RangeValueWithBand
                    meters={result.data.firestorm.sustainRadius}
                    field="firestormSustain"
                  />
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.ignitionArea')}</dt>
              <dd className={styles.resultValue}>
                {formatArea(result.data.firestorm.ignitionArea)}
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.sustainArea')}</dt>
              <dd className={styles.resultValue}>
                {formatArea(result.data.firestorm.sustainArea)}
              </dd>
            </dl>
            <SectionHeading labelKey="simulator.ejectaLabel" />
            <dl className={styles.result} aria-label={t('simulator.ejectaLabel')}>
              <dt className={styles.resultLabel}>{t('simulator.ejectaEdge1m')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.ejecta')}>
                  <RangeValue meters={result.data.ejecta.blanketEdge1m} />
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.ejectaEdge1mm')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.ejecta')}>
                  <RangeValue meters={result.data.ejecta.blanketEdge1mm} />
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.ejectaAt2R')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.ejecta')}>
                  {formatKilometres(result.data.ejecta.thicknessAt2R)}
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.ejectaAt10R')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.ejecta')}>
                  {formatKilometres(result.data.ejecta.thicknessAt10R)}
                </CitationTooltip>
              </dd>
            </dl>
            <SectionHeading labelKey="simulator.atmosphereLabel" />
            <dl className={styles.result} aria-label={t('simulator.atmosphereLabel')}>
              <dt className={styles.resultLabel}>{t('simulator.climateTier')}</dt>
              <dd className={styles.resultValue}>
                {t(`simulator.tier.${result.data.atmosphere.climateTier}`)}
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.stratosphericDust')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.atmosphere')}>
                  {formatMass(result.data.atmosphere.stratosphericDust)}
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.acidRainMass')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.atmosphere')}>
                  {formatMass(result.data.atmosphere.acidRainMass)}
                </CitationTooltip>
              </dd>
            </dl>
            {result.data.tsunami && (
              <>
                <SectionHeading labelKey="simulator.tsunamiLabel" />
                <dl className={styles.result} aria-label={t('simulator.tsunamiLabel')}>
                  <dt className={styles.resultLabel}>{t('simulator.tsunamiCavity')}</dt>
                  <dd className={styles.resultValue}>
                    <CitationTooltip citation={t('citations.tsunamiCavity')}>
                      {formatKilometres(result.data.tsunami.cavityRadius)}
                    </CitationTooltip>
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.tsunamiAt1000km')}</dt>
                  <dd className={styles.resultValue}>
                    <CitationTooltip citation={t('citations.tsunamiFarField')}>
                      {formatKilometres(result.data.tsunami.amplitudeAt1000km)}
                    </CitationTooltip>
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.tsunamiAt5000km')}</dt>
                  <dd className={styles.resultValue}>
                    {formatKilometres(result.data.tsunami.amplitudeAt5000km)}
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.tsunamiAt1000kmWunnemann')}</dt>
                  <dd className={styles.resultValue}>
                    <CitationTooltip citation={t('citations.tsunamiWunnemann')}>
                      {formatKilometres(result.data.tsunami.amplitudeAt1000kmWunnemann)}
                    </CitationTooltip>
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.tsunamiAt5000kmWunnemann')}</dt>
                  <dd className={styles.resultValue}>
                    <CitationTooltip citation={t('citations.tsunamiWunnemann')}>
                      <RangeValueWithBand
                        meters={result.data.tsunami.amplitudeAt5000kmWunnemann}
                        field="tsunamiWunnemannFarField"
                      />
                    </CitationTooltip>
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.runupAt1000km')}</dt>
                  <dd className={styles.resultValue}>
                    <CitationTooltip citation={t('citations.synolakisRunup')}>
                      <RangeValueWithBand
                        meters={result.data.tsunami.runupAt1000km}
                        field="tsunamiRunup"
                      />
                    </CitationTooltip>
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.tsunamiDamageLabel')}</dt>
                  <dd className={styles.resultValue}>
                    {t(coastalDamageTierKey(result.data.tsunami.runupAt1000km as number))}
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.tsunamiSlopeLabel')}</dt>
                  <dd className={styles.resultValue}>
                    {formatBeachSlope(
                      result.data.tsunami.beachSlopeRadUsed,
                      result.data.tsunami.beachSlopeFromDEM,
                      t
                    )}
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.tsunamiAt5000kmDispersed')}</dt>
                  <dd className={styles.resultValue}>
                    <CitationTooltip citation={t('citations.tsunamiDispersion')}>
                      {formatKilometres(result.data.tsunami.amplitudeAt5000kmDispersed)}
                    </CitationTooltip>
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.tsunamiArrival')}</dt>
                  <dd className={styles.resultValue}>
                    {formatDurationMinutes(result.data.tsunami.travelTimeTo1000km)}
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.tsunamiCelerity')}</dt>
                  <dd className={styles.resultValue}>
                    {formatTsunamiCelerity(result.data.tsunami.deepWaterCelerity)}
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.tsunamiWavelength')}</dt>
                  <dd className={styles.resultValue}>
                    {formatKilometres(result.data.tsunami.sourceWavelength)}
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.tsunamiPeriod')}</dt>
                  <dd className={styles.resultValue}>
                    {formatDurationMinutes(result.data.tsunami.dominantPeriod)}
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.tsunamiInundation')}</dt>
                  <dd className={styles.resultValue}>
                    {formatKilometres(result.data.tsunami.inundationDistanceAt1000km)}
                  </dd>
                </dl>
              </>
            )}
            <CascadeTimeline stages={buildImpactCascade(result.data)} />
          </>
        )}

        {result?.type === 'explosion' && (
          <>
            <SectionHeading labelKey="simulator.explosion.summaryHeading" />
            <dl className={styles.result} aria-label={t('simulator.explosion.summaryHeading')}>
              <dt className={styles.resultLabel}>{t('simulator.explosion.yield')}</dt>
              <dd className={styles.resultValue}>{formatMegatons(result.data.yield.megatons)}</dd>
              <dt className={styles.resultLabel}>{t('simulator.explosion.yieldKilotons')}</dt>
              <dd className={styles.resultValue}>{formatKilotons(result.data.yield.kilotons)}</dd>
              <dt className={styles.resultLabel}>{t('simulator.explosion.yieldJoules')}</dt>
              <dd className={styles.resultValue}>{formatJoules(result.data.yield.joules)}</dd>
              <dt className={styles.resultLabel}>{t('simulator.explosion.fiveBpsi')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.blast')}>
                  <RangeValue meters={result.data.blast.overpressure5psiRadius} />
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.explosion.oneBpsi')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.blast')}>
                  <RangeValue meters={result.data.blast.overpressure1psiRadius} />
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.explosion.peakAt1km')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.blast')}>
                  {formatKilopascals(result.data.blast.peakAt1km)}
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.explosion.peakAt5km')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.blast')}>
                  {formatKilopascals(result.data.blast.peakAt5km)}
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.explosion.thermal')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.thermal')}>
                  <RangeValue meters={result.data.thermal.thirdDegreeBurnRadius} />
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.explosion.crater')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.nuclearCrater')}>
                  {formatKilometres(result.data.crater.apparentDiameter)}
                </CitationTooltip>
              </dd>
            </dl>
            <SectionHeading labelKey="simulator.explosion.hobLabel" />
            <dl className={styles.result} aria-label={t('simulator.explosion.hobLabel')}>
              <dt className={styles.resultLabel}>{t('simulator.explosion.hobRegime')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.hob')}>
                  {t(`simulator.explosion.regimes.${result.data.blast.hobRegime}`)}
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.explosion.hobScaled')}</dt>
              <dd className={styles.resultValue}>
                {result.data.blast.hobScaled.toFixed(0)} m·kt⁻¹ᐟ³
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.explosion.hobFactor')}</dt>
              <dd className={styles.resultValue}>×{result.data.blast.hobFactor.toFixed(2)}</dd>
              <dt className={styles.resultLabel}>{t('simulator.explosion.fivePsiHob')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.hob')}>
                  <RangeValue meters={result.data.blast.overpressure5psiRadiusHob} />
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.explosion.onePsiHob')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.hob')}>
                  <RangeValue meters={result.data.blast.overpressure1psiRadiusHob} />
                </CitationTooltip>
              </dd>
            </dl>
            <SectionHeading labelKey="simulator.firestormLabel" />
            <dl className={styles.result} aria-label={t('simulator.firestormLabel')}>
              <dt className={styles.resultLabel}>{t('simulator.ignitionRadius')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.firestorm')}>
                  <RangeValueWithBand
                    meters={result.data.firestorm.ignitionRadius}
                    field="firestormIgnition"
                  />
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.sustainRadius')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.firestorm')}>
                  <RangeValueWithBand
                    meters={result.data.firestorm.sustainRadius}
                    field="firestormSustain"
                  />
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.ignitionArea')}</dt>
              <dd className={styles.resultValue}>
                {formatArea(result.data.firestorm.ignitionArea)}
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.sustainArea')}</dt>
              <dd className={styles.resultValue}>
                {formatArea(result.data.firestorm.sustainArea)}
              </dd>
            </dl>
            <SectionHeading labelKey="simulator.explosion.radiationLabel" />
            <dl className={styles.result} aria-label={t('simulator.explosion.radiationLabel')}>
              <dt className={styles.resultLabel}>{t('simulator.explosion.ld50')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.radiation')}>
                  <RangeValue meters={result.data.radiation.ld50Radius} />
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.explosion.ld100')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.radiation')}>
                  <RangeValue meters={result.data.radiation.ld100Radius} />
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.explosion.arsThreshold')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.radiation')}>
                  <RangeValue meters={result.data.radiation.arsThresholdRadius} />
                </CitationTooltip>
              </dd>
            </dl>
            <SectionHeading labelKey="simulator.explosion.empLabel" />
            <dl className={styles.result} aria-label={t('simulator.explosion.empLabel')}>
              <dt className={styles.resultLabel}>{t('simulator.explosion.empRegime')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.emp')}>
                  {t(`simulator.explosion.empRegimes.${result.data.emp.regime}`)}
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.explosion.empPeak')}</dt>
              <dd className={styles.resultValue}>
                {result.data.emp.peakField >= 1_000
                  ? `${(result.data.emp.peakField / 1_000).toFixed(1)} kV/m`
                  : `${result.data.emp.peakField.toFixed(0)} V/m`}
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.explosion.empRadius')}</dt>
              <dd className={styles.resultValue}>
                <RangeValue meters={result.data.emp.affectedRadius} />
              </dd>
            </dl>
            {result.data.tsunami && (
              <>
                <SectionHeading labelKey="simulator.explosion.tsunamiLabel" />
                <dl className={styles.result} aria-label={t('simulator.explosion.tsunamiLabel')}>
                  <dt className={styles.resultLabel}>{t('simulator.tsunamiCavity')}</dt>
                  <dd className={styles.resultValue}>
                    <CitationTooltip citation={t('citations.tsunamiCavity')}>
                      {formatKilometres(result.data.tsunami.cavityRadius)}
                    </CitationTooltip>
                  </dd>
                  <dt className={styles.resultLabel}>
                    {t('simulator.explosion.tsunamiSourceAmplitude')}
                  </dt>
                  <dd className={styles.resultValue}>
                    {formatKilometres(result.data.tsunami.sourceAmplitude)}
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.explosion.tsunamiAt100km')}</dt>
                  <dd className={styles.resultValue}>
                    <CitationTooltip citation={t('citations.tsunamiFarField')}>
                      {formatKilometres(result.data.tsunami.amplitudeAt100km)}
                    </CitationTooltip>
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.explosion.tsunamiAt1000km')}</dt>
                  <dd className={styles.resultValue}>
                    {formatKilometres(result.data.tsunami.amplitudeAt1000km)}
                  </dd>
                  <dt className={styles.resultLabel}>
                    {t('simulator.explosion.tsunamiArrival100km')}
                  </dt>
                  <dd className={styles.resultValue}>
                    {formatDurationMinutes(result.data.tsunami.travelTimeTo100km)}
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.tsunamiCelerity')}</dt>
                  <dd className={styles.resultValue}>
                    {formatTsunamiCelerity(result.data.tsunami.deepWaterCelerity)}
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.tsunamiWavelength')}</dt>
                  <dd className={styles.resultValue}>
                    {formatKilometres(result.data.tsunami.sourceWavelength)}
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.tsunamiPeriod')}</dt>
                  <dd className={styles.resultValue}>
                    {formatDurationMinutes(result.data.tsunami.dominantPeriod)}
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.explosion.tsunamiRunup')}</dt>
                  <dd className={styles.resultValue}>
                    <CitationTooltip citation={t('citations.synolakisRunup')}>
                      {formatKilometres(result.data.tsunami.runupAt100km)}
                    </CitationTooltip>
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.tsunamiDamageLabel')}</dt>
                  <dd className={styles.resultValue}>
                    {t(coastalDamageTierKey(result.data.tsunami.runupAt100km as number))}
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.tsunamiSlopeLabel')}</dt>
                  <dd className={styles.resultValue}>
                    {formatBeachSlope(
                      result.data.tsunami.beachSlopeRadUsed,
                      result.data.tsunami.beachSlopeFromDEM,
                      t
                    )}
                  </dd>
                  <dt className={styles.resultLabel}>
                    {t('simulator.explosion.tsunamiInundation')}
                  </dt>
                  <dd className={styles.resultValue}>
                    {formatKilometres(result.data.tsunami.inundationDistanceAt100km)}
                  </dd>
                </dl>
              </>
            )}
            <CascadeTimeline stages={buildExplosionCascade(result.data)} />
          </>
        )}

        {result?.type === 'earthquake' && (
          <>
            <SectionHeading labelKey="simulator.earthquake.summaryHeading" />
            <dl className={styles.result} aria-label={t('simulator.earthquake.summaryHeading')}>
              <dt className={styles.resultLabel}>{t('simulator.earthquake.mw')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.seismicMoment')}>
                  Mw {result.data.inputs.magnitude.toFixed(1)}
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.earthquake.moment')}</dt>
              <dd className={styles.resultValue}>
                {formatScientific(result.data.seismicMoment)} N·m
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.earthquake.rupture')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.ruptureLength')}>
                  {formatKilometres(result.data.ruptureLength)}
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.earthquake.epicenterMmi')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.mmi')}>
                  MMI {result.data.shaking.mmiAtEpicenter.toFixed(1)}
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.earthquake.mmi7')}</dt>
              <dd className={styles.resultValue}>
                <RangeValue meters={result.data.shaking.mmi7Radius} />
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.earthquake.mmi8')}</dt>
              <dd className={styles.resultValue}>
                <RangeValue meters={result.data.shaking.mmi8Radius} />
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.earthquake.mmi9')}</dt>
              <dd className={styles.resultValue}>
                <RangeValue meters={result.data.shaking.mmi9Radius} />
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.earthquake.pgaAt20km')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.mmi')}>
                  {formatG(result.data.shaking.pgaAt20km)}
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.earthquake.pgaAt100km')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.mmi')}>
                  {formatG(result.data.shaking.pgaAt100km)}
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.earthquake.pgaAt20kmNGA')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.ngaWest2')}>
                  {formatG(result.data.shaking.pgaAt20kmNGA)}
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.earthquake.pgaAt100kmNGA')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.ngaWest2')}>
                  {formatG(result.data.shaking.pgaAt100kmNGA)}
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.earthquake.epicenterMmiEurope')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.mmiEurope')}>
                  MMI {result.data.shaking.mmiAtEpicenterEurope.toFixed(1)}
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.earthquake.liquefactionRadius')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.liquefaction')}>
                  <RangeValue meters={result.data.shaking.liquefactionRadius} />
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.earthquake.siteVs30')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.waldAllen')}>
                  {result.data.shaking.siteVs30.toFixed(0)} m/s (NEHRP{' '}
                  {result.data.shaking.siteClass})
                </CitationTooltip>
              </dd>
            </dl>
            {result.data.tsunami && (
              <>
                <SectionHeading labelKey="simulator.earthquake.seismicTsunamiLabel" />
                <dl
                  className={styles.result}
                  aria-label={t('simulator.earthquake.seismicTsunamiLabel')}
                >
                  <dt className={styles.resultLabel}>{t('simulator.earthquake.meanSlip')}</dt>
                  <dd className={styles.resultValue}>
                    {formatKilometres(result.data.tsunami.meanSlip)}
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.earthquake.seafloorUplift')}</dt>
                  <dd className={styles.resultValue}>
                    {formatKilometres(result.data.tsunami.seafloorUplift)}
                  </dd>
                  <dt className={styles.resultLabel}>
                    {t('simulator.earthquake.tsunamiInitialAmplitude')}
                  </dt>
                  <dd className={styles.resultValue}>
                    {formatKilometres(result.data.tsunami.initialAmplitude)}
                  </dd>
                  <dt className={styles.resultLabel}>
                    {t('simulator.earthquake.tsunamiAt1000km')}
                  </dt>
                  <dd className={styles.resultValue}>
                    {formatKilometres(result.data.tsunami.amplitudeAt1000km)}
                  </dd>
                  <dt className={styles.resultLabel}>
                    {t('simulator.earthquake.tsunamiAt5000km')}
                  </dt>
                  <dd className={styles.resultValue}>
                    {formatKilometres(result.data.tsunami.amplitudeAt5000km)}
                  </dd>
                  <dt className={styles.resultLabel}>
                    {t('simulator.earthquake.tsunamiAt5000kmDispersed')}
                  </dt>
                  <dd className={styles.resultValue}>
                    <CitationTooltip citation={t('citations.tsunamiDispersion')}>
                      {formatKilometres(result.data.tsunami.amplitudeAt5000kmDispersed)}
                    </CitationTooltip>
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.earthquake.tsunamiRunup')}</dt>
                  <dd className={styles.resultValue}>
                    <CitationTooltip citation={t('citations.synolakisRunup')}>
                      <RangeValueWithBand
                        meters={result.data.tsunami.runupAt1000km}
                        field="tsunamiRunup"
                      />
                    </CitationTooltip>
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.tsunamiDamageLabel')}</dt>
                  <dd className={styles.resultValue}>
                    {t(coastalDamageTierKey(result.data.tsunami.runupAt1000km as number))}
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.tsunamiSlopeLabel')}</dt>
                  <dd className={styles.resultValue}>
                    {formatBeachSlope(
                      result.data.tsunami.beachSlopeRadUsed,
                      result.data.tsunami.beachSlopeFromDEM,
                      t
                    )}
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.earthquake.tsunamiTravel')}</dt>
                  <dd className={styles.resultValue}>
                    {formatDurationMinutes(result.data.tsunami.travelTimeTo1000km)}
                  </dd>
                  <dt className={styles.resultLabel}>
                    {t('simulator.earthquake.tsunamiCelerity')}
                  </dt>
                  <dd className={styles.resultValue}>
                    {formatTsunamiCelerity(result.data.tsunami.deepWaterCelerity)}
                  </dd>
                  <dt className={styles.resultLabel}>
                    {t('simulator.earthquake.tsunamiWavelength')}
                  </dt>
                  <dd className={styles.resultValue}>
                    {formatKilometres(result.data.tsunami.sourceWavelength)}
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.earthquake.tsunamiPeriod')}</dt>
                  <dd className={styles.resultValue}>
                    {formatDurationMinutes(result.data.tsunami.dominantPeriod)}
                  </dd>
                  <dt className={styles.resultLabel}>
                    {t('simulator.earthquake.tsunamiInundation')}
                  </dt>
                  <dd className={styles.resultValue}>
                    {formatKilometres(result.data.tsunami.inundationDistanceAt1000km)}
                  </dd>
                </dl>
              </>
            )}
            <CascadeTimeline stages={buildEarthquakeCascade(result.data)} />
          </>
        )}

        {result?.type === 'volcano' && (
          <>
            <SectionHeading labelKey="simulator.volcano.summaryHeading" />
            <dl className={styles.result} aria-label={t('simulator.volcano.summaryHeading')}>
              <dt className={styles.resultLabel}>{t('simulator.volcano.vei')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.vei')}>
                  VEI {result.data.vei.toString()}
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.volcano.plume')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.plumeHeight')}>
                  <RangeValueWithBand meters={result.data.plumeHeight} field="plumeHeight" />
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.volcano.runout')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.pyroclasticRunout')}>
                  <RangeValueWithBand
                    meters={result.data.pyroclasticRunout}
                    field="pyroclasticRunout"
                  />
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.volcano.mer')}</dt>
              <dd className={styles.resultValue}>
                {formatScientific(result.data.massEruptionRate)} kg/s
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.volcano.runoutEnergyLine')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.pdcEnergyLine')}>
                  <RangeValue meters={result.data.pyroclasticRunoutEnergyLine} />
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.volcano.climateCooling')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.climateCooling')}>
                  {result.data.climateCoolingK.toFixed(2)} K
                </CitationTooltip>
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.volcano.ashfallArea')}</dt>
              <dd className={styles.resultValue}>
                <CitationTooltip citation={t('citations.ashfall')}>
                  <AreaWithBand m2={result.data.ashfallArea1mm} field="ashfallArea" />
                </CitationTooltip>
              </dd>
              {result.data.laharRunout !== undefined && (
                <>
                  <dt className={styles.resultLabel}>{t('simulator.volcano.laharRunout')}</dt>
                  <dd className={styles.resultValue}>
                    <CitationTooltip citation={t('citations.lahar')}>
                      <RangeValueWithBand meters={result.data.laharRunout} field="laharRunout" />
                    </CitationTooltip>
                  </dd>
                </>
              )}
              {result.data.windAdvectedAshfall !== undefined && (
                <>
                  <dt className={styles.resultLabel}>
                    {t('simulator.volcano.ashfallDownwindRange')}
                  </dt>
                  <dd className={styles.resultValue}>
                    <RangeValue meters={result.data.windAdvectedAshfall.downwindRange} />
                  </dd>
                  <dt className={styles.resultLabel}>
                    {t('simulator.volcano.ashfallCrosswindHalfWidth')}
                  </dt>
                  <dd className={styles.resultValue}>
                    <RangeValue meters={result.data.windAdvectedAshfall.crosswindHalfWidth} />
                  </dd>
                  <dt className={styles.resultLabel}>
                    {t('simulator.volcano.ashfallWindAdvectedArea')}
                  </dt>
                  <dd className={styles.resultValue}>
                    {formatArea(result.data.windAdvectedAshfall.area)}
                  </dd>
                </>
              )}
            </dl>
            <CascadeTimeline stages={buildVolcanoCascade(result.data)} />
          </>
        )}

        {result?.type === 'landslide' && (
          <>
            <SectionHeading labelKey="simulator.landslide.summaryHeading" />
            <dl className={styles.result} aria-label={t('simulator.landslide.summaryHeading')}>
              <dt className={styles.resultLabel}>{t('simulator.landslide.volume')}</dt>
              <dd className={styles.resultValue}>
                {formatScientific(result.data.inputs.volumeM3)} m³
              </dd>
              <dt className={styles.resultLabel}>{t('simulator.landslide.charLength')}</dt>
              <dd className={styles.resultValue}>
                <RangeValue meters={result.data.characteristicLength} />
              </dd>
              {result.data.tsunami !== null && (
                <>
                  <dt className={styles.resultLabel}>{t('simulator.landslide.tsunamiAmp')}</dt>
                  <dd className={styles.resultValue}>
                    {(result.data.tsunami.sourceAmplitude as number).toFixed(0)} m
                  </dd>
                  <dt className={styles.resultLabel}>{t('simulator.landslide.tsunamiTravel')}</dt>
                  <dd className={styles.resultValue}>
                    {Math.round((result.data.tsunami.travelTimeTo100km as number) / 60)} min
                  </dd>
                </>
              )}
            </dl>
            <CascadeTimeline stages={buildLandslideCascade(result.data)} />
          </>
        )}

        {result !== null && (populationExposure !== null || populationStatus !== 'idle') && (
          <PopulationExposurePanel
            populationExposure={populationExposure}
            populationStatus={populationStatus}
          />
        )}

        {monteCarlo !== null && <MonteCarloPanel mc={monteCarlo} />}
      </div>
    </aside>
  );
}

/**
 * Population-exposure summary block — surfaces the WorldPop COG
 * lookup result (or its loading / unavailable status) right next to
 * the damage rings, so the user reads "≥ 5 psi: 1.2 M people" inline
 * with the simulation rather than having to navigate to the dedicated
 * report page.
 *
 * "Exposed" is deliberately not "casualties": the figure is the sum
 * of population inside the headline damage circle, not the projected
 * fatality count. Converting exposure to fatalities needs a
 * vulnerability function (Glasstone §12 for blast, Wald & Quitoriano
 * 1999 for shaking) which is out of scope for this layer — the
 * disclaimer is rendered alongside the number to keep the framing
 * honest.
 */
function PopulationExposurePanel({
  populationExposure,
  populationStatus,
}: {
  populationExposure: { exposed: number; ringLabel: string; radiusM: number } | null;
  populationStatus: 'idle' | 'fetching' | 'error';
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <section className={styles.result} aria-label={t('population.label')}>
      <h3 className={styles.resultLabel} style={{ marginTop: 0 }}>
        {t('population.label')}
      </h3>
      {populationStatus === 'fetching' && <p>{t('population.loading')}</p>}
      {populationStatus === 'error' && populationExposure === null && (
        <p>{t('population.unavailable')}</p>
      )}
      {populationExposure !== null && (
        <>
          <dl className={styles.result}>
            <dt className={styles.resultLabel}>{t(populationExposure.ringLabel)}</dt>
            <dd className={styles.resultValue}>
              <strong>{populationExposure.exposed.toLocaleString()}</strong>
            </dd>
            <dt className={styles.resultLabel}>{t('population.radius')}</dt>
            <dd className={styles.resultValue}>{formatKilometres(populationExposure.radiusM)}</dd>
          </dl>
          <p className={styles.mcFooter}>{t('population.disclaimer')}</p>
        </>
      )}
    </section>
  );
}

function MonteCarloPanel({ mc }: { mc: ActiveMonteCarlo }): JSX.Element {
  const { t } = useTranslation();
  return (
    <section className={styles.result} aria-label={t('simulator.monteCarloLabel')}>
      <h3 className={styles.resultLabel} style={{ marginTop: 0 }}>
        {t('simulator.monteCarloTitle', { iterations: mc.data.iterations })}
      </h3>
      <table className={styles.mcTable}>
        <thead>
          <tr>
            <th>{t('simulator.mcMetric')}</th>
            <th>P10</th>
            <th>P50</th>
            <th>P90</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(mc.data.metrics).map(([key, band]) => (
            <tr key={key}>
              <td>{t(`simulator.mcMetrics.${mc.type}.${key}`, { defaultValue: key })}</td>
              <td>{formatMcValue(key, band.p10, t)}</td>
              <td>{formatMcValue(key, band.p50, t)}</td>
              <td>{formatMcValue(key, band.p90, t)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.mcFooter}>{t('simulator.monteCarloFooter')}</p>
    </section>
  );
}

/** Compact MC-cell formatter — keys with known units use a compact
 *  physical rendering, the rest fall back to scientific notation.
 *  Range-like keys go through the great-circle clamp so headline
 *  outputs never show "17 000 km" for a radius that wraps the Earth. */
function formatMcValue(key: string, value: number, t: (key: string) => string): string {
  if (!Number.isFinite(value)) return '—';
  if (
    key.endsWith('Radius') ||
    key === 'ruptureLength' ||
    key === 'ejectaEdge1m' ||
    key === 'pyroclasticRunout' ||
    key === 'fivePsiRadius' ||
    key === 'onePsiRadius' ||
    key === 'burn3rdDegree' ||
    key === 'firestormIgnition' ||
    key === 'finalCraterDiameter' ||
    key === 'craterDiameter' ||
    key === 'ld50Radius' ||
    key === 'mmi8Radius' ||
    key === 'liquefactionRadius'
  ) {
    const clamped = clampToGreatCircle(value) as number;
    const global = isGlobalReach(value) ? ` (${t('globe.legend.globalBadge')})` : '';
    return clamped < 1_000
      ? `${clamped.toFixed(0)} m${global}`
      : `${(clamped / 1_000).toFixed(1)} km${global}`;
  }
  if (key === 'plumeHeight') {
    return `${(value / 1_000).toFixed(1)} km`;
  }
  if (key === 'ashfallArea') {
    const km2 = value / 1_000_000;
    return km2 >= 1 ? `${km2.toFixed(0)} km²` : `${value.toFixed(0)} m²`;
  }
  if (key === 'kineticEnergyMt' || key === 'yieldMt') {
    if (value < 0.001) return `${(value * 1_000_000).toFixed(0)} t`;
    if (value < 1) return `${(value * 1_000).toFixed(1)} kt`;
    if (value < 1_000) return `${value.toFixed(1)} Mt`;
    if (value < 1_000_000) return `${(value / 1_000).toFixed(1)} Gt`;
    return `${(value / 1_000).toExponential(1)} Gt`;
  }
  if (key === 'kineticEnergy') return formatScientific(value) + ' J';
  if (key === 'climateCoolingK') return `${value.toFixed(2)} K`;
  if (key === 'magnitude' || key === 'seismicMw' || key === 'mmiAtEpicenter' || key === 'vei') {
    return value.toFixed(1);
  }
  if (key === 'pgaAt20kmNGA') return `${(value / 9.80665).toFixed(2)} g`;
  return value.toFixed(2);
}
