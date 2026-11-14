import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

/**
 * Chip (TASK_036): `filter` (toggle, `aria-pressed`), `tag` (`#tag` with a
 * count), `suggestion` ("+ tag"). Will replace `.chip`, `.chip-tag`,
 * `.chip-add` with the card list and form (TASK_040–041); a row of chips
 * scrolls horizontally inside `ChipRow`.
 */
export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> {
  variant?: 'filter' | 'tag' | 'suggestion';
  /** Filter state; omitted for non-toggle chips. */
  pressed?: boolean;
  count?: number;
}

export function Chip({ variant = 'filter', pressed, count, className, children, type = 'button', ...rest }: ChipProps) {
  return (
    <button
      type={type}
      className={cx('ui-chip', `ui-chip--${variant}`, className)}
      aria-pressed={pressed}
      {...rest}
    >
      {children}
      {count !== undefined && <span className="ui-chip-count">{count}</span>}
    </button>
  );
}

/** A single-line, horizontally scrolling row of chips. */
export function ChipRow({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('ui-chip-row', className)} role="group" aria-label={label}>
      {children}
    </div>
  );
}
