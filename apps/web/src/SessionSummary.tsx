import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * End screen of the study session and the practice (TASK_038): a mark in the
 * brand gradient, an optional overline, the title, one line, the numbers, any
 * extra content (the practice's words with mistakes) and the actions stacked
 * full width. The same template serves "nothing to study" (no numbers).
 */
export function SessionSummary({
  icon,
  overline,
  title,
  text,
  stats,
  children,
  actions,
  quiet = false,
}: {
  icon: IconName;
  overline?: string;
  title: string;
  text?: ReactNode;
  /** `<StatGroup>` with the numbers. */
  stats?: ReactNode;
  children?: ReactNode;
  actions: ReactNode;
  /** A neutral mark (soft success) instead of the brand gradient — "nothing to do". */
  quiet?: boolean;
}) {
  return (
    <section className="session-summary" aria-labelledby="session-summary-title">
      <span className={quiet ? 'session-summary-mark is-quiet' : 'session-summary-mark'} aria-hidden="true">
        <Icon name={icon} size={30} />
      </span>
      {overline && <p className="session-summary-overline">{overline}</p>}
      <h1 id="session-summary-title" className="session-summary-title">
        {title}
      </h1>
      {text && <p className="session-summary-text">{text}</p>}
      {stats}
      {children}
      <div className="session-summary-actions">{actions}</div>
    </section>
  );
}
