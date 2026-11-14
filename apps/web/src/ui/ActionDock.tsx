import type { ReactNode } from 'react';
import { cx } from './cx';

/**
 * Action dock (TASK_038, COMPONENT_LIBRARY §8): pinned to the bottom of the
 * screen, above the home indicator, in the thumb zone; content scrolls under
 * a short fade. The study session keeps "Показать ответ" and the grades in
 * the same place, so the hand does not have to look for them. Pair with
 * `ui-action-dock-space` on the scrolling content so its end is not hidden.
 */
export function ActionDock({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('ui-action-dock', className)}>
      <div className="ui-action-dock-inner">{children}</div>
    </div>
  );
}
