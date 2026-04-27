import type { ChangeEvent, JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../store/index.js';
import styles from './SimulatorPanel.module.css';

/**
 * Volume eruption rate (m³/s) and total ejecta volume (m³) span ~7
 * orders of magnitude across real events. The inputs use a
 * base-10 exponent editor to keep the range navigable: user types the
 * mantissa and picks an exponent from a select, UI multiplies back.
 */
const EXPONENTS_VDOT = [3, 4, 5, 6, 7, 8, 9];
const EXPONENTS_VOLUME = [7, 8, 9, 10, 11, 12, 13];

function splitScientific(n: number): { mantissa: number; exp: number } {
  if (!(n > 0) || !Number.isFinite(n)) return { mantissa: 1, exp: 0 };
  const exp = Math.floor(Math.log10(n));
  return { mantissa: n / 10 ** exp, exp };
}

export function VolcanoCustomInputs(): JSX.Element {
  const { t } = useTranslation();
  const input = useAppStore((s) => s.volcano.input);
  const setVolcanoInput = useAppStore((s) => s.setVolcanoInput);

  const vdot = splitScientific(input.volumeEruptionRate);
  const vol = splitScientific(input.totalEjectaVolume);

  const updateVdotMantissa = (e: ChangeEvent<HTMLInputElement>): void => {
    const m = parseFloat(e.target.value);
    if (Number.isFinite(m) && m > 0) {
      setVolcanoInput({ volumeEruptionRate: m * 10 ** vdot.exp });
    }
  };
  const updateVdotExp = (e: ChangeEvent<HTMLSelectElement>): void => {
    setVolcanoInput({ volumeEruptionRate: vdot.mantissa * 10 ** parseInt(e.target.value, 10) });
  };
  const updateVolMantissa = (e: ChangeEvent<HTMLInputElement>): void => {
    const m = parseFloat(e.target.value);
    if (Number.isFinite(m) && m > 0) {
      setVolcanoInput({ totalEjectaVolume: m * 10 ** vol.exp });
    }
  };
  const updateLahar = (e: ChangeEvent<HTMLInputElement>): void => {
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v) && v >= 0) setVolcanoInput({ laharVolume: v });
  };
  const updateVolExp = (e: ChangeEvent<HTMLSelectElement>): void => {
    setVolcanoInput({ totalEjectaVolume: vol.mantissa * 10 ** parseInt(e.target.value, 10) });
  };
  const updateWindSpeed = (e: ChangeEvent<HTMLInputElement>): void => {
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v) && v >= 0) setVolcanoInput({ windSpeed: v });
  };
  const updateWindDirection = (e: ChangeEvent<HTMLInputElement>): void => {
    const v = parseFloat(e.target.value);
    if (Number.isFinite(v)) setVolcanoInput({ windDirectionDegrees: v });
  };

  return (
    <fieldset className={styles.customParams}>
      <legend className={styles.customParamsLegend}>{t('simulator.customParams')}</legend>

      <div className={styles.paramField}>
        <label className={styles.paramLabel} htmlFor="volcano-vdot-m">
          {t('simulator.volcano.vdotInput')}
        </label>
        <input
          id="volcano-vdot-m"
          className={styles.paramInput}
          type="number"
          inputMode="decimal"
          min={1}
          max={9.9}
          step={0.1}
          value={vdot.mantissa.toFixed(1)}
          onChange={updateVdotMantissa}
        />
      </div>

      <div className={styles.paramField}>
        <label className={styles.paramLabel} htmlFor="volcano-vdot-e">
          {t('simulator.volcano.vdotExp')}
        </label>
        <select
          id="volcano-vdot-e"
          className={styles.paramInput}
          value={vdot.exp}
          onChange={updateVdotExp}
        >
          {EXPONENTS_VDOT.map((e) => (
            <option key={e} value={e}>
              10^{e}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.paramField}>
        <label className={styles.paramLabel} htmlFor="volcano-vol-m">
          {t('simulator.volcano.volumeInput')}
        </label>
        <input
          id="volcano-vol-m"
          className={styles.paramInput}
          type="number"
          inputMode="decimal"
          min={1}
          max={9.9}
          step={0.1}
          value={vol.mantissa.toFixed(1)}
          onChange={updateVolMantissa}
        />
      </div>

      <div className={styles.paramField}>
        <label className={styles.paramLabel} htmlFor="volcano-vol-e">
          {t('simulator.volcano.volumeExp')}
        </label>
        <select
          id="volcano-vol-e"
          className={styles.paramInput}
          value={vol.exp}
          onChange={updateVolExp}
        >
          {EXPONENTS_VOLUME.map((e) => (
            <option key={e} value={e}>
              10^{e}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.paramField} style={{ gridColumn: '1 / -1' }}>
        <label className={styles.paramLabel} htmlFor="volcano-lahar">
          {t('simulator.volcano.laharVolumeInput')}
        </label>
        <input
          id="volcano-lahar"
          className={styles.paramInput}
          type="number"
          inputMode="decimal"
          min={0}
          step={1e6}
          value={input.laharVolume ?? 0}
          onChange={updateLahar}
        />
      </div>

      <div className={styles.paramField}>
        <label className={styles.paramLabel} htmlFor="volcano-wind-speed">
          {t('simulator.volcano.windSpeedInput')}
        </label>
        <input
          id="volcano-wind-speed"
          className={styles.paramInput}
          type="number"
          inputMode="decimal"
          min={0}
          max={60}
          step={1}
          value={input.windSpeed ?? 0}
          onChange={updateWindSpeed}
        />
      </div>

      <div className={styles.paramField}>
        <label className={styles.paramLabel} htmlFor="volcano-wind-dir">
          {t('simulator.volcano.windDirectionInput')}
        </label>
        <input
          id="volcano-wind-dir"
          className={styles.paramInput}
          type="number"
          inputMode="decimal"
          min={0}
          max={359}
          step={1}
          value={input.windDirectionDegrees ?? 90}
          onChange={updateWindDirection}
        />
      </div>
    </fieldset>
  );
}
