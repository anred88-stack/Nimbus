/**
 * Inline per-field feedback rendered next to a custom-input control.
 *
 * The component is intentionally dumb: it does NOT validate. It reads
 * the already-computed top issue (error or warning) for a single field
 * path from `useFieldIssues(...)` and renders it as small inline text.
 *
 * The `data-validation-code` attribute on the wrapping element carries
 * the canonical {@link ValidationCode}. This is what tests assert on
 * and what assistive tech can announce together with the human
 * message — the localisation layer wraps the message but does NOT
 * replace the code.
 *
 * Why not translate the message itself? Validator messages are
 * domain-specific ("magnitude exceeds Mw 9.5 Valdivia 1960"); they
 * belong with the validator's source, not the i18n bundle. The UI
 * translates only the LABEL ("Error" / "Avviso") and the aria
 * sentence template.
 */

import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { ValidationCode } from '../../physics/validation/inputSchema.js';
import styles from './SimulatorPanel.module.css';

export interface FieldFeedbackProps {
  /** Field path the issue is attached to. Used in aria sentences. */
  field: string;
  /** Top message from `useFieldIssues(eventType, field).topMessage`. */
  message: string | null;
  /** Top code from `useFieldIssues(eventType, field).topCode`.
   *  Preserved on a `data-validation-code` attribute. */
  code: ValidationCode | null;
  /** True if the top issue is an error (vs warning). */
  isError: boolean;
}

export function FieldFeedback(props: FieldFeedbackProps): JSX.Element | null {
  const { t } = useTranslation();
  if (props.message === null || props.code === null) return null;

  const severity = props.isError ? 'error' : 'warning';
  const labelKey = props.isError
    ? 'simulator.validation.errorLabel'
    : 'simulator.validation.warningLabel';
  const ariaKey = props.isError
    ? 'simulator.validation.errorAria'
    : 'simulator.validation.warningAria';
  const role = props.isError ? 'alert' : 'status';

  return (
    <div
      className={styles.fieldFeedback}
      data-severity={severity}
      data-validation-code={props.code}
      data-validation-field={props.field}
      role={role}
      aria-label={t(ariaKey, { field: props.field, message: props.message })}
    >
      <strong>{t(labelKey)}:</strong> {props.message}
    </div>
  );
}
