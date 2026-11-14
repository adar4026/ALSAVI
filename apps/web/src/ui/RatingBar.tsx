import { cx } from './cx';

/**
 * Self-assessment buttons (TASK_038, COMPONENT_LIBRARY §1): equal-width
 * buttons in one row, 64 px, soft semantic fill, label + optional detail
 * (the next interval in the study session). One component for the session
 * and the practice; which grades exist is the caller's list (ADR-006: three).
 *
 * Native `<button>`s: Enter/Space on a focused button activate it, which the
 * session's hotkeys leave alone (TASK_025). `pressed` keeps the chosen button
 * highlighted while its answer is being saved.
 */
export interface RatingOption<T extends string> {
  value: T;
  label: string;
  tone: 'danger' | 'warning' | 'success';
  /** Second line, e.g. "через 2 дн". */
  detail?: string;
  /** Full accessible name, e.g. "Помню. Следующий показ: 2 дн". */
  ariaLabel?: string;
}

export interface RatingBarProps<T extends string> {
  options: ReadonlyArray<RatingOption<T>>;
  onRate: (value: T) => void;
  disabled?: boolean;
  pressed?: T | null;
  className?: string;
}

export function RatingBar<T extends string>({ options, onRate, disabled, pressed, className }: RatingBarProps<T>) {
  return (
    <div
      className={cx('ui-rating-bar', className)}
      role="group"
      aria-label="Оценка ответа"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={cx('ui-rating', `ui-rating--${o.tone}`, pressed === o.value && 'is-pressed')}
          onClick={() => onRate(o.value)}
          disabled={disabled}
          aria-label={o.ariaLabel}
        >
          <span className="ui-rating-label">{o.label}</span>
          {o.detail && <span className="ui-rating-detail">{o.detail}</span>}
        </button>
      ))}
    </div>
  );
}
