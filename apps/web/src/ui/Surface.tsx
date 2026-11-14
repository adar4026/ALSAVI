import { useId, type ReactNode } from 'react';
import { cx } from './cx';

/**
 * A surface (TASK_036, COMPONENT_LIBRARY §2): `hero` (radius 22, raised),
 * `card` (radius 16, border), `inset` (nested block on --surface-2). With a
 * `title` it renders a `<section>` labelled by that title; `action` sits at
 * the right of the title row. Will replace `.panel`, `.home-card`,
 * `.card-panel`, `.stats-card` as each screen is rebuilt (TASK_037–043).
 */
export interface SurfaceProps {
  variant?: 'hero' | 'card' | 'inset';
  title?: ReactNode;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function Surface({ variant = 'card', title, action, className, children }: SurfaceProps) {
  const titleId = useId();
  const classes = cx('ui-surface', `ui-surface--${variant}`, className);
  if (title === undefined) return <div className={classes}>{children}</div>;
  return (
    <section className={classes} aria-labelledby={titleId}>
      <div className="ui-surface-head">
        <h2 id={titleId} className="ui-surface-title">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
