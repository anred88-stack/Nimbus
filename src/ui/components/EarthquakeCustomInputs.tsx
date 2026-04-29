import type { ChangeEvent, JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { FaultType } from '../../physics/events/earthquake/index.js';
import { useAppStore } from '../../store/index.js';
import { useFieldIssues } from '../../store/useScenarioValidation.js';
import { FieldFeedback } from './FieldFeedback.js';
import styles from './SimulatorPanel.module.css';

const FAULT_TYPES: FaultType[] = ['strike-slip', 'reverse', 'normal', 'all'];

export function EarthquakeCustomInputs(): JSX.Element {
  const { t } = useTranslation();
  const input = useAppStore((s) => s.earthquake.input);
  const setEarthquakeInput = useAppStore((s) => s.setEarthquakeInput);

  // Per-field issues come straight from `validateScenario` — no
  // duplication of the validator's logic in this component. The store
  // setter rejects S1 invalid input at the boundary (B-010), so what
  // surfaces here in steady state is `normalized` / `suspicious`
  // warnings (azimuth wrap, magnitude exceeds Mw 9.5, etc.). Codes are
  // preserved on the rendered element via `data-validation-code`.
  const magnitudeIssues = useFieldIssues('earthquake', 'magnitude');
  const depthIssues = useFieldIssues('earthquake', 'depth');
  const faultIssues = useFieldIssues('earthquake', 'faultType');
  const vs30Issues = useFieldIssues('earthquake', 'vs30');

  const depthKm = input.depth === undefined ? '' : (input.depth as number) / 1_000;

  const updateMagnitude = (e: ChangeEvent<HTMLInputElement>): void => {
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v) && v > 0) setEarthquakeInput({ magnitude: v });
  };
  const updateDepth = (e: ChangeEvent<HTMLInputElement>): void => {
    const km = parseFloat(e.target.value);
    if (Number.isFinite(km) && km >= 0) setEarthquakeInput({ depth: km * 1_000 });
  };
  const updateFault = (e: ChangeEvent<HTMLSelectElement>): void => {
    setEarthquakeInput({ faultType: e.target.value as FaultType });
  };
  const updateVs30 = (e: ChangeEvent<HTMLInputElement>): void => {
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v) && v > 0) setEarthquakeInput({ vs30: v });
  };
  const toggleMegathrust = (e: ChangeEvent<HTMLInputElement>): void => {
    setEarthquakeInput({ subductionInterface: e.target.checked });
  };

  return (
    <fieldset className={styles.customParams}>
      <legend className={styles.customParamsLegend}>{t('simulator.customParams')}</legend>

      <div className={styles.paramField}>
        <label className={styles.paramLabel} htmlFor="quake-magnitude">
          {t('simulator.earthquake.magnitudeInput')}
        </label>
        <input
          id="quake-magnitude"
          className={styles.paramInput}
          type="number"
          inputMode="decimal"
          min={3}
          max={10}
          step={0.1}
          value={input.magnitude}
          onChange={updateMagnitude}
          aria-invalid={magnitudeIssues.hasError || undefined}
          aria-describedby={magnitudeIssues.topMessage ? 'quake-magnitude-feedback' : undefined}
        />
        <span id="quake-magnitude-feedback">
          <FieldFeedback
            field="magnitude"
            message={magnitudeIssues.topMessage}
            code={magnitudeIssues.topCode}
            isError={magnitudeIssues.hasError}
          />
        </span>
      </div>

      <div className={styles.paramField}>
        <label className={styles.paramLabel} htmlFor="quake-depth">
          {t('simulator.earthquake.depthInput')}
        </label>
        <input
          id="quake-depth"
          className={styles.paramInput}
          type="number"
          inputMode="decimal"
          min={0}
          max={700}
          step={1}
          value={depthKm}
          onChange={updateDepth}
          aria-invalid={depthIssues.hasError || undefined}
          aria-describedby={depthIssues.topMessage ? 'quake-depth-feedback' : undefined}
        />
        <span id="quake-depth-feedback">
          <FieldFeedback
            field="depth"
            message={depthIssues.topMessage}
            code={depthIssues.topCode}
            isError={depthIssues.hasError}
          />
        </span>
      </div>

      <div className={styles.paramField}>
        <label className={styles.paramLabel} htmlFor="quake-fault">
          {t('simulator.earthquake.faultType')}
        </label>
        <select
          id="quake-fault"
          className={styles.paramInput}
          value={input.faultType ?? 'all'}
          onChange={updateFault}
          aria-invalid={faultIssues.hasError || undefined}
          aria-describedby={faultIssues.topMessage ? 'quake-fault-feedback' : undefined}
        >
          {FAULT_TYPES.map((f) => (
            <option key={f} value={f}>
              {t(`simulator.earthquake.fault.${f}`)}
            </option>
          ))}
        </select>
        <span id="quake-fault-feedback">
          <FieldFeedback
            field="faultType"
            message={faultIssues.topMessage}
            code={faultIssues.topCode}
            isError={faultIssues.hasError}
          />
        </span>
      </div>

      <div className={styles.paramField}>
        <label className={styles.paramLabel} htmlFor="quake-vs30">
          {t('simulator.earthquake.vs30Input')}
        </label>
        <input
          id="quake-vs30"
          className={styles.paramInput}
          type="number"
          inputMode="decimal"
          min={100}
          max={2_000}
          step={10}
          value={input.vs30 ?? 760}
          onChange={updateVs30}
          aria-invalid={vs30Issues.hasError || undefined}
          aria-describedby={vs30Issues.topMessage ? 'quake-vs30-feedback' : undefined}
        />
        <span id="quake-vs30-feedback">
          <FieldFeedback
            field="vs30"
            message={vs30Issues.topMessage}
            code={vs30Issues.topCode}
            isError={vs30Issues.hasError}
          />
        </span>
      </div>

      <div className={styles.paramField} style={{ gridColumn: '1 / -1' }}>
        <label className={styles.paramLabel} htmlFor="quake-megathrust">
          <input
            id="quake-megathrust"
            type="checkbox"
            checked={input.subductionInterface ?? false}
            onChange={toggleMegathrust}
            style={{ marginRight: 6 }}
          />
          {t('simulator.earthquake.megathrustInput')}
        </label>
      </div>
    </fieldset>
  );
}
