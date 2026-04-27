import type { ChangeEvent, JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { ASTEROID_TAXONOMY, type AsteroidTaxonomyClass } from '../../physics/constants.js';
import { radiansToDegrees } from '../../physics/units.js';
import { useAppStore } from '../../store/index.js';
import styles from './SimulatorPanel.module.css';

const TAXONOMY_CLASSES: AsteroidTaxonomyClass[] = [
  'COMETARY',
  'C_TYPE',
  'S_TYPE',
  'M_TYPE',
  'IRON',
];

/**
 * Numeric inputs for the six impact-scenario parameters. Reading the
 * live input from the store means switching to a preset instantly
 * refills the fields; editing any field flips the preset to CUSTOM.
 *
 * The store helpers (setImpactInput) expect plain numbers in the same
 * units the struct stores (meters, m/s, kg/m³, degrees), so we convert
 * m → km and m/s → km/s only at the display layer for readability.
 */
export function ImpactCustomInputs(): JSX.Element {
  const { t } = useTranslation();
  const input = useAppStore((s) => s.impact.input);
  const setImpactInput = useAppStore((s) => s.setImpactInput);

  const diameterKm = (input.impactorDiameter as number) / 1_000;
  const velocityKms = (input.impactVelocity as number) / 1_000;
  // Round to 2 decimals: degrees↔radians round-trips would otherwise
  // surface noise like "29,9999999999°" for a preset that started as
  // an integer (e.g. Tunguska 30°).
  const angleDeg = Math.round((radiansToDegrees(input.impactAngle) as number) * 100) / 100;
  const azimuthDeg = input.impactAzimuthDeg ?? 90;

  const updateDiameter = (e: ChangeEvent<HTMLInputElement>): void => {
    const km = parseFloat(e.target.value);
    if (Number.isFinite(km) && km > 0) setImpactInput({ impactorDiameter: km * 1_000 });
  };
  const updateVelocity = (e: ChangeEvent<HTMLInputElement>): void => {
    const kms = parseFloat(e.target.value);
    if (Number.isFinite(kms) && kms > 0) setImpactInput({ impactVelocity: kms * 1_000 });
  };
  const updateImpactorDensity = (e: ChangeEvent<HTMLInputElement>): void => {
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v) && v > 0) setImpactInput({ impactorDensity: v });
  };
  const updateTargetDensity = (e: ChangeEvent<HTMLInputElement>): void => {
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v) && v > 0) setImpactInput({ targetDensity: v });
  };
  const updateAngle = (e: ChangeEvent<HTMLInputElement>): void => {
    const deg = parseFloat(e.target.value);
    if (Number.isFinite(deg) && deg > 0 && deg <= 90) setImpactInput({ impactAngle: deg });
  };
  const updateAzimuth = (e: ChangeEvent<HTMLInputElement>): void => {
    const deg = parseFloat(e.target.value);
    if (Number.isFinite(deg)) setImpactInput({ impactAzimuthDeg: deg });
  };
  const applyTaxonomy = (e: ChangeEvent<HTMLSelectElement>): void => {
    const cls = e.target.value as AsteroidTaxonomyClass;
    setImpactInput({ impactorDensity: ASTEROID_TAXONOMY[cls].density });
  };

  return (
    <fieldset className={styles.customParams}>
      <legend className={styles.customParamsLegend}>{t('simulator.customParams')}</legend>

      <div className={styles.paramField} style={{ gridColumn: '1 / -1' }}>
        <label className={styles.paramLabel} htmlFor="impact-taxonomy">
          {t('simulator.impact.taxonomy')}
        </label>
        <select
          id="impact-taxonomy"
          className={styles.paramInput}
          defaultValue=""
          onChange={applyTaxonomy}
        >
          <option value="" disabled>
            {t('simulator.impact.taxonomyPlaceholder')}
          </option>
          {TAXONOMY_CLASSES.map((cls) => (
            <option key={cls} value={cls}>
              {t(`simulator.impact.taxonomyClasses.${cls}`)}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.paramField}>
        <label className={styles.paramLabel} htmlFor="impact-diameter">
          {t('simulator.impact.diameter')}
        </label>
        <input
          id="impact-diameter"
          className={styles.paramInput}
          type="number"
          inputMode="decimal"
          min={0.001}
          max={100_000}
          step={0.1}
          value={diameterKm}
          onChange={updateDiameter}
        />
      </div>

      <div className={styles.paramField}>
        <label className={styles.paramLabel} htmlFor="impact-velocity">
          {t('simulator.impact.velocity')}
        </label>
        <input
          id="impact-velocity"
          className={styles.paramInput}
          type="number"
          inputMode="decimal"
          min={1}
          max={72}
          step={0.5}
          value={velocityKms}
          onChange={updateVelocity}
        />
      </div>

      <div className={styles.paramField}>
        <label className={styles.paramLabel} htmlFor="impact-impactor-density">
          {t('simulator.impact.impactorDensity')}
        </label>
        <input
          id="impact-impactor-density"
          className={styles.paramInput}
          type="number"
          inputMode="decimal"
          min={500}
          max={10_000}
          step={100}
          value={input.impactorDensity}
          onChange={updateImpactorDensity}
        />
      </div>

      <div className={styles.paramField}>
        <label className={styles.paramLabel} htmlFor="impact-target-density">
          {t('simulator.impact.targetDensity')}
        </label>
        <input
          id="impact-target-density"
          className={styles.paramInput}
          type="number"
          inputMode="decimal"
          min={1_000}
          max={5_000}
          step={100}
          value={input.targetDensity}
          onChange={updateTargetDensity}
        />
      </div>

      <div className={styles.paramField}>
        <label className={styles.paramLabel} htmlFor="impact-angle">
          {t('simulator.impact.angle')}
        </label>
        <input
          id="impact-angle"
          className={styles.paramInput}
          type="number"
          inputMode="decimal"
          min={5}
          max={90}
          step={5}
          value={angleDeg}
          onChange={updateAngle}
        />
      </div>

      <div className={styles.paramField} style={{ gridColumn: '1 / -1' }}>
        <label className={styles.paramLabel} htmlFor="impact-azimuth">
          {t('simulator.impact.azimuth', { degrees: azimuthDeg.toFixed(0) })}
        </label>
        <input
          id="impact-azimuth"
          className={styles.paramInput}
          type="range"
          min={0}
          max={359}
          step={1}
          value={azimuthDeg}
          onChange={updateAzimuth}
          aria-valuetext={t('simulator.impact.azimuthAria', {
            degrees: azimuthDeg.toFixed(0),
            cardinal: cardinalFromDeg(azimuthDeg),
          })}
        />
      </div>
    </fieldset>
  );
}

/** Map a compass azimuth to the nearest 8-wind cardinal label
 *  (N, NE, E, SE, S, SW, W, NW). Used for the slider's
 *  aria-valuetext so screen-reader users hear "120° east-south-east"
 *  instead of just the numeric value. */
function cardinalFromDeg(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx] ?? 'N';
}
