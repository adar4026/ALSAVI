import { useId, type InputHTMLAttributes, type ReactNode, type Ref, type TextareaHTMLAttributes } from 'react';
import { Icon } from '../Icon';
import { cx } from './cx';

/**
 * Text inputs (TASK_036, COMPONENT_LIBRARY §3): label above, 48 px field on
 * --surface-2, focus ring, error under the field wired to `aria-invalid` and
 * `aria-describedby`. Text is 17 px (≥ 16 px: iOS does not zoom the page).
 * Will replace `.field input/textarea` and `.limit-input` (TASK_040, TASK_043).
 */
interface FieldChrome {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  /** Label hidden visually (still the accessible name). */
  labelHidden?: boolean;
}

function FieldFrame({ id, label, hint, error, labelHidden, children }: FieldChrome & { id: string; children: ReactNode }) {
  return (
    <div className={cx('ui-field', error && 'has-error')}>
      <label htmlFor={id} className={cx('ui-field-label', labelHidden && 'sr-only')}>
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="ui-field-error">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="ui-field-hint">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

function describedBy(id: string, error?: string | null, hint?: ReactNode): string | undefined {
  if (error) return `${id}-error`;
  return hint ? `${id}-hint` : undefined;
}

export type TextFieldProps = FieldChrome & InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> };

export function TextField({ label, hint, error, labelHidden, id, className, ref, ...rest }: TextFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldFrame id={fieldId} label={label} hint={hint} error={error} labelHidden={labelHidden}>
      <input
        ref={ref}
        id={fieldId}
        className={cx('ui-input', className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, error, hint)}
        {...rest}
      />
    </FieldFrame>
  );
}

export type TextAreaProps = FieldChrome & TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> };

export function TextArea({ label, hint, error, labelHidden, id, className, rows = 2, ref, ...rest }: TextAreaProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldFrame id={fieldId} label={label} hint={hint} error={error} labelHidden={labelHidden}>
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        className={cx('ui-input', 'ui-textarea', className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, error, hint)}
        {...rest}
      />
    </FieldFrame>
  );
}

/**
 * Search field: magnifier, `type="search"`, a clear button while there is
 * text. Will replace `.search-input` (TASK_041).
 */
export interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name (the field has no visible label). */
  label: string;
  ref?: Ref<HTMLInputElement>;
}

export function SearchField({ value, onChange, label, className, ref, ...rest }: SearchFieldProps) {
  return (
    <div className={cx('ui-search', className)}>
      <span className="ui-search-icon" aria-hidden="true">
        <Icon name="search" size={20} />
      </span>
      <input
        ref={ref}
        type="search"
        className="ui-search-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        {...rest}
      />
      {value !== '' && (
        <button type="button" className="ui-search-clear" aria-label="Очистить поиск" onClick={() => onChange('')}>
          <Icon name="close" size={18} />
        </button>
      )}
    </div>
  );
}
