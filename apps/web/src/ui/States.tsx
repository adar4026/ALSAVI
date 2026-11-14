import { useEffect, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../Icon';
import { cx } from './cx';

/**
 * Empty state (TASK_036): icon in a soft circle, title, one sentence, one
 * action. Will replace `.empty-state`, `.list-empty`, `.welcome-card`,
 * `.activity-empty` as the screens are rebuilt. `brand` uses the logo
 * gradient (empty collection).
 */
export function EmptyState({
  icon = 'info',
  title,
  text,
  action,
  brand = false,
  className,
}: {
  icon?: IconName;
  title: string;
  text?: ReactNode;
  action?: ReactNode;
  brand?: boolean;
  className?: string;
}) {
  return (
    <div className={cx('ui-empty', className)}>
      <span className={cx('ui-empty-icon', brand && 'ui-empty-icon--brand')} aria-hidden="true">
        <Icon name={icon} size={28} />
      </span>
      <p className="ui-empty-title">{title}</p>
      {text && <p className="ui-empty-text">{text}</p>}
      {action && <div className="ui-empty-action">{action}</div>}
    </div>
  );
}

/**
 * Loading placeholder (TASK_036): blocks in the shape of the coming content,
 * shown only after `delay` ms so fast loads do not flash. `aria-busy` marks
 * the region; the blocks themselves are hidden from assistive tech.
 */
export type SkeletonVariant = 'list' | 'stats' | 'home' | 'session';

function Block({ w = '100%', h, r }: { w?: string; h: number; r?: string }) {
  return <span className="ui-skeleton-block" style={{ width: w, height: h, borderRadius: r }} />;
}

const LAYOUTS: Record<SkeletonVariant, ReactNode> = {
  home: (
    <>
      <Block w="40%" h={14} />
      <Block w="60%" h={30} />
      <Block h={240} r="var(--radius-lg)" />
      <span className="ui-skeleton-row">
        <Block h={104} r="var(--radius-md)" />
        <Block h={104} r="var(--radius-md)" />
      </span>
    </>
  ),
  list: (
    <>
      <Block h={44} r="var(--radius-sm)" />
      <Block w="85%" h={34} r="var(--radius-pill)" />
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="ui-skeleton-line">
          <Block w="55%" h={16} />
          <Block w="38%" h={13} />
        </span>
      ))}
    </>
  ),
  stats: (
    <>
      <Block h={120} r="var(--radius-lg)" />
      <span className="ui-skeleton-row">
        <Block h={96} r="var(--radius-md)" />
        <Block h={96} r="var(--radius-md)" />
        <Block h={96} r="var(--radius-md)" />
      </span>
      <Block h={220} r="var(--radius-md)" />
    </>
  ),
  session: (
    <>
      <Block h={4} r="var(--radius-pill)" />
      <span className="ui-skeleton-center">
        <Block w="55%" h={34} />
      </span>
      <Block h={52} r="var(--radius-sm)" />
    </>
  ),
};

export function Skeleton({ variant, delay = 150, label = 'Загрузка' }: { variant: SkeletonVariant; delay?: number; label?: string }) {
  const [visible, setVisible] = useState(delay === 0);
  useEffect(() => {
    if (delay === 0) return;
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div className={cx('ui-skeleton', `ui-skeleton--${variant}`)} aria-busy="true" aria-label={label}>
      {visible && <div aria-hidden="true">{LAYOUTS[variant]}</div>}
    </div>
  );
}
