import type { ReactNode } from 'react';
import { cx } from './ui';

/**
 * A settings line inside a `GroupedList` (TASK_043): the title (a `<label>`
 * of the control when `htmlFor` is given), an optional hint under it and the
 * control on the right — a Switch, a Stepper, a time field. Built on the
 * `ListRow` look, so separators and spacing match the other rows.
 */
export function SettingRow({
  title,
  hint,
  htmlFor,
  control,
  className,
}: {
  title: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  control?: ReactNode;
  className?: string;
}) {
  const text = (
    <>
      <span className="ui-list-row-title">{title}</span>
      {hint && <span className="ui-list-row-subtitle">{hint}</span>}
    </>
  );
  return (
    <div className={cx('ui-list-row', 'setting-row', className)}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="ui-list-row-main">
          {text}
        </label>
      ) : (
        <span className="ui-list-row-main">{text}</span>
      )}
      {control && <span className="ui-list-row-trailing setting-row-control">{control}</span>}
    </div>
  );
}
