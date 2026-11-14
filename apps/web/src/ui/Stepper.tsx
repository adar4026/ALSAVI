import { IconButton } from './IconButton';
import { canStep, stepValue, type StepperBounds } from './stepper-math';
import { cx } from './cx';

/**
 * − value + (TASK_036). The value is announced through a polite live region;
 * buttons disable at the bounds. Arithmetic lives in `stepper-math.ts`.
 */
export interface StepperProps extends StepperBounds {
  value: number;
  onChange: (value: number) => void;
  /** Accessible name of the quantity, e.g. "Новых карточек в день". */
  label: string;
  disabled?: boolean;
  className?: string;
}

export function Stepper({ value, onChange, label, disabled, className, ...bounds }: StepperProps) {
  return (
    <div className={cx('ui-stepper', className)} role="group" aria-label={label}>
      <IconButton
        icon="minus"
        label={`${label}: меньше`}
        variant="filled"
        iconSize={20}
        disabled={disabled || !canStep(value, -1, bounds)}
        onClick={() => onChange(stepValue(value, -1, bounds))}
      />
      <output className="ui-stepper-value" aria-live="polite">
        {value}
      </output>
      <IconButton
        icon="plus"
        label={`${label}: больше`}
        variant="filled"
        iconSize={20}
        disabled={disabled || !canStep(value, 1, bounds)}
        onClick={() => onChange(stepValue(value, 1, bounds))}
      />
    </div>
  );
}
