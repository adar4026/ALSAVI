import type { ReactNode } from 'react';
import { cx } from './cx';

/**
 * A number with its label (TASK_036): label, value (rounded tabular digits),
 * unit, detail. `StatGroup` is the `<dl>`; each `Stat` a `div` of `dt`/`dd`
 * (valid inside `dl`). Will replace `.kpi`, `.digest-item`, `.queue-count`
 * (TASK_039, TASK_042).
 */
export function Stat({
  label,
  value,
  unit,
  detail,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  detail?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('ui-stat', className)}>
      <dt className="ui-stat-label">{label}</dt>
      <dd className="ui-stat-value">
        {value}
        {unit !== undefined && <span className="ui-stat-unit"> {unit}</span>}
      </dd>
      {detail !== undefined && <dd className="ui-stat-detail">{detail}</dd>}
    </div>
  );
}

export function StatGroup({ children, columns = 2, className }: { children: ReactNode; columns?: 2 | 3 | 4; className?: string }) {
  return <dl className={cx('ui-stat-group', `ui-stat-group--${columns}`, className)}>{children}</dl>;
}
