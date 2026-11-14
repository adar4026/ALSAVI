import { cx } from './cx';

/**
 * Segmented control (TASK_036) on native radio buttons inside a fieldset:
 * arrow keys, screen readers and form semantics are the browser's own.
 * Replaces `.segmented` (theme) and `.period-toggle` (7 / 30 days).
 */
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  /** Group name (fieldset legend). */
  legend: string;
  /** Hide the legend visually; it stays the group's accessible name. */
  legendHidden?: boolean;
  /** Radio `name`, unique on the page. */
  name: string;
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Stretch the segments over the full width (default) or size to content. */
  fill?: boolean;
  className?: string;
}

export function SegmentedControl<T extends string>({
  legend,
  legendHidden = false,
  name,
  options,
  value,
  onChange,
  fill = true,
  className,
}: SegmentedControlProps<T>) {
  return (
    <fieldset className={cx('ui-segmented', fill && 'ui-segmented--fill', className)}>
      <legend className={legendHidden ? 'sr-only' : 'ui-segmented-legend'}>{legend}</legend>
      <div className="ui-segmented-track">
        {options.map((option) => (
          <label key={option.value} className="ui-segmented-option">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
