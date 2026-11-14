import type { ReactNode } from 'react';
import { cx } from './cx';

/**
 * Progress bar (TASK_036): replaces `.progress-bar` (session) and `.goal-bar`
 * (home goal). `value` of `max`; the bar is a visual cue, the accessible
 * value comes from `aria-valuenow`/`aria-valuetext`. Width animates (240 ms,
 * off under reduced motion).
 */
export interface ProgressBarProps {
  value: number;
  max?: number;
  /** `sm` — 4 px (session), `md` — 8 px (goal). */
  size?: 'sm' | 'md';
  tone?: 'accent' | 'success';
  'aria-label'?: string;
  'aria-labelledby'?: string;
  /** Spoken value, e.g. "Осталось 4 карточки". */
  valueText?: string;
  /**
   * The numbers the progressbar exposes, when they differ from value/max
   * (the home goal exposes a percentage; the session — cards done of total).
   */
  ariaValue?: { now: number; min: number; max: number };
  className?: string;
}

export function ProgressBar({
  value,
  max = 1,
  size = 'md',
  tone = 'accent',
  valueText,
  ariaValue,
  className,
  ...aria
}: ProgressBarProps) {
  const fraction = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const exposed = ariaValue ?? { now: value, min: 0, max };
  return (
    <div
      className={cx('ui-progress', `ui-progress--${size}`, tone === 'success' && 'ui-progress--success', className)}
      role="progressbar"
      aria-valuemin={exposed.min}
      aria-valuemax={exposed.max}
      aria-valuenow={exposed.now}
      aria-valuetext={valueText}
      {...aria}
    >
      <div className="ui-progress-fill" style={{ width: `${fraction * 100}%` }} />
    </div>
  );
}

/**
 * Progress ring (TASK_036): SVG ring with content in the centre (e.g.
 * "78%"). Decorative by default — the surrounding text carries the numbers;
 * pass `label` to expose it as an image with that name.
 */
export function ProgressRing({
  value,
  max = 1,
  size = 96,
  children,
  label,
  className,
}: {
  value: number;
  max?: number;
  size?: 56 | 96;
  children?: ReactNode;
  label?: string;
  className?: string;
}) {
  const stroke = size === 56 ? 6 : 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const fraction = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div
      className={cx('ui-ring', className)}
      style={{ width: size, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="ui-ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle
          className="ui-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * fraction} ${c}`}
        />
      </svg>
      {children !== undefined && <span className="ui-ring-label">{children}</span>}
    </div>
  );
}
