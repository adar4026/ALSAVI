import { useId, type ReactNode } from 'react';
import { Icon } from '../Icon';
import { cx } from './cx';

/**
 * A list row (TASK_036, COMPONENT_LIBRARY §2): 64 px, title + subtitle, an
 * optional leading and trailing slot. With `onClick` the whole row is a
 * native `<button>`; otherwise a plain row (e.g. a settings line whose
 * control is in `trailing`). `lang` marks Spanish titles.
 */
export interface ListRowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Shows a chevron after `trailing` (navigation rows). */
  chevron?: boolean;
  selected?: boolean;
  lang?: string;
  onClick?: () => void;
  className?: string;
}

export function ListRow({ title, subtitle, leading, trailing, chevron, selected, lang, onClick, className }: ListRowProps) {
  const body = (
    <>
      {leading && <span className="ui-list-row-leading">{leading}</span>}
      <span className="ui-list-row-main">
        <span className="ui-list-row-title" lang={lang}>
          {title}
        </span>
        {subtitle && <span className="ui-list-row-subtitle">{subtitle}</span>}
      </span>
      {trailing && <span className="ui-list-row-trailing">{trailing}</span>}
      {chevron && (
        <span className="ui-list-row-chevron" aria-hidden="true">
          <Icon name="chevron-right" size={18} />
        </span>
      )}
    </>
  );
  const classes = cx('ui-list-row', onClick && 'ui-list-row--action', selected && 'is-selected', className);
  return onClick ? (
    <button type="button" className={classes} onClick={onClick} aria-current={selected || undefined}>
      {body}
    </button>
  ) : (
    <div className={classes}>{body}</div>
  );
}

/**
 * Rows grouped on one surface (iOS grouped list): an overline title above,
 * an optional note below. Used by settings and the card view.
 */
export function GroupedList({ title, note, children, className }: { title?: string; note?: ReactNode; children: ReactNode; className?: string }) {
  const titleId = useId();
  return (
    <section className={cx('ui-group', className)} aria-labelledby={title ? titleId : undefined}>
      {title && (
        <h2 id={titleId} className="ui-group-title">
          {title}
        </h2>
      )}
      <div className="ui-group-body">{children}</div>
      {note && <p className="ui-group-note">{note}</p>}
    </section>
  );
}
