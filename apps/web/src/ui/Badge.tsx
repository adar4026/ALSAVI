import type { ReactNode } from 'react';
import { cx } from './cx';

/**
 * Badge (TASK_036): a small pill with a status or a count. Will replace
 * `.state-badge`, `.status`, `.count-badge`, `.practice-badge` as the screens
 * are rebuilt. Colour never carries the meaning alone — there is always text.
 */
export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export function Badge({
  tone = 'neutral',
  count = false,
  className,
  children,
}: {
  tone?: BadgeTone;
  /** Round counter (a number) instead of a pill with text. */
  count?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return <span className={cx('ui-badge', `ui-badge--${tone}`, count && 'ui-badge--count', className)}>{children}</span>;
}
