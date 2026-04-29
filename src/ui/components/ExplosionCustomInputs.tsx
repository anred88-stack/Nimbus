import type { ChangeEvent, JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { ExplosionScenarioInput } from '../../physics/events/explosion/index.js';
import { useAppStore } from '../../store/index.js';
import { useFieldIssues } from '../../store/useScenarioValidation.js';
import { FieldFeedback } from './FieldFeedback.js';
import styles from './SimulatorPanel.module.css';

type GroundType = NonNullable<ExplosionScenarioInput['groundType']>;
const GROUND_TYPES: GroundType[] = ['HARD_ROCK', 'FIRM_GROUND', 'DRY_SOIL', 'WET_SOIL'];

export function ExplosionCustomInputs(): JSX.Element {
  const { t } = useTranslation();
  const input = useAppStore((s) => s.explosion.input);
  const setExplosionInput = useAppStore((s) => s.setExplosionInput);

  // Validator-driven feedback (single source of truth). The wind-direction
  // slider is bound to [0,360) in the UI, so it never produces an
  // azimuth-wrap warning; we still subscribe to keep the contract
  // uniform if the bounds widen later.
  const yieldIssues = useFieldIssues('explosion', 'yieldMegatons');
  const hobIssues = useFieldIssues('explosion', 'heightOfBurst');
  const groundIssues = useFieldIssues('explosion', 'groundType');

  const updateYield = (e: ChangeEvent<HTMLInputElement>): void => {
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v) && v > 0) setExplosionInput({ yieldMegatons: v });
  };
  const updateGround = (e: ChangeEvent<HTMLSelectElement>): void => {
    setExplosionInput({ groundType: e.target.value as GroundType });
  };
  const updateHob = (e: ChangeEvent<HTMLInputElement>): void => {
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v) && v >= 0) setExplosionInput({ heightOfBurst: v });
  };
  const updateWindSpeed = (e: ChangeEvent<HTMLInputElement>): void => {
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v) && v >= 0) setExplosionInput({ windSpeed: v });
  };
  const updateWindDirection = (e: ChangeEvent<HTMLInputElement>): void => {
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v)) setExplosionInput({ windDirectionDeg: v });
  };

  const hobValue = input.heightOfBurst === undefined ? 0 : (input.heightOfBurst as number);
  const windSpeedValue = input.windSpeed === undefined ? 0 : (input.windSpeed as number);
  const windDirectionValue = input.windDirectionDeg ?? 90;

  return (
    <fieldset className={styles.customParams}>
      <legend className={styles.customParamsLegend}>{t('simulator.customParams')}</legend>

      <div className={styles.paramField}>
        <label className={styles.paramLabel} htmlFor="explosion-yield">
          {t('simulator.explosion.yieldInput')}
        </label>
        <input
          id="explosion-yield"
          className={styles.paramInput}
          type="number"
          inputMode="decimal"
          min={0.0001}
          max={10_000}
          step={0.1}
          value={input.yieldMegatons}
          onChange={updateYield}
          aria-invalid={yieldIssues.hasError || undefined}
          aria-describedby={yieldIssues.topMessage ? 'explosion-yield-feedback' : undefined}
        />
        <span id="explosion-yield-feedback">
          <FieldFeedback
            field="yieldMegatons"
            message={yieldIssues.topMessage}
            code={yieldIssues.topCode}
            isError={yieldIssues.hasError}
          />
        </span>
      </div>

      <div className={styles.paramField}>
        <label className={styles.paramLabel} htmlFor="explosion-ground">
          {t('simulator.explosion.groundType')}
        </label>
        <select
          id="explosion-ground"
          className={styles.paramInput}
          value={input.groundType ?? 'FIRM_GROUND'}
          onChange={updateGround}
          aria-invalid={groundIssues.hasError || undefined}
          aria-describedby={groundIssues.topMessage ? 'explosion-ground-feedback' : undefined}
        >
          {GROUND_TYPES.map((g) => (
            <option key={g} value={g}>
              {t(`simulator.explosion.ground.${g}`)}
            </option>
          ))}
        </select>
        <span id="explosion-ground-feedback">
          <FieldFeedback
            field="groundType"
            message={groundIssues.topMessage}
            code={groundIssues.topCode}
            isError={groundIssues.hasError}
          />
        </span>
      </div>

      <div className={styles.paramField} style={{ gridColumn: '1 / -1' }}>
        <label className={styles.paramLabel} htmlFor="explosion-hob">
          {t('simulator.explosion.hobInput')}
        </label>
        <input
          id="explosion-hob"
          className={styles.paramInput}
          type="number"
          inputMode="decimal"
          min={0}
          max={50_000}
          step={100}
          value={hobValue}
          onChange={updateHob}
          aria-invalid={hobIssues.hasError || undefined}
          aria-describedby={hobIssues.topMessage ? 'explosion-hob-feedback' : undefined}
        />
        <span id="explosion-hob-feedback">
          <FieldFeedback
            field="heightOfBurst"
            message={hobIssues.topMessage}
            code={hobIssues.topCode}
            isError={hobIssues.hasError}
          />
        </span>
      </div>

      <div className={styles.paramField}>
        <label className={styles.paramLabel} htmlFor="explosion-wind-speed">
          {t('simulator.explosion.windSpeedInput')}
        </label>
        <input
          id="explosion-wind-speed"
          className={styles.paramInput}
          type="number"
          inputMode="decimal"
          min={0}
          max={120}
          step={1}
          value={windSpeedValue}
          onChange={updateWindSpeed}
        />
      </div>

      <div className={styles.paramField}>
        <label className={styles.paramLabel} htmlFor="explosion-wind-direction">
          {t('simulator.explosion.windDirectionInput', {
            degrees: windDirectionValue.toFixed(0),
          })}
        </label>
        <input
          id="explosion-wind-direction"
          className={styles.paramInput}
          type="range"
          min={0}
          max={359}
          step={1}
          value={windDirectionValue}
          onChange={updateWindDirection}
          aria-valuetext={t('simulator.explosion.windDirectionAria', {
            degrees: windDirectionValue.toFixed(0),
            cardinal: cardinalFromDeg(windDirectionValue),
          })}
        />
      </div>
    </fieldset>
  );
}

/** Map a compass azimuth to the nearest 8-wind cardinal label
 *  (N, NE, E, SE, S, SW, W, NW) for the wind-direction slider's
 *  aria-valuetext. */
function cardinalFromDeg(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx] ?? 'N';
}
