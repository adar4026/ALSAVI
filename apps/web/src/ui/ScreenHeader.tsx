import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';

/**
 * Section header (TASK_037, COMPONENT_LIBRARY §8): a large title
 * (`--type-title-1`), an optional line under it and actions on the right.
 * On phones, once the large title has scrolled away, a compact bar with the
 * title appears at the top (frosted, 44 px + the status-bar inset) — the
 * reader always knows where they are. The compact bar repeats the title, so
 * it is hidden from assistive tech; on a computer it is not shown (CSS).
 * It is rendered into `document.body`: screens animate in with a transform,
 * and a transformed ancestor would pin a `position: fixed` bar to itself.
 */
export interface ScreenHeaderProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function ScreenHeader({ title, subtitle, actions, className }: ScreenHeaderProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const el = titleRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setCompact(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <header className={cx('ui-screen-header', className)}>
      <div className="ui-screen-header-row">
        <h1 ref={titleRef} className="ui-screen-header-title">
          {title}
        </h1>
        {actions && <div className="ui-screen-header-actions">{actions}</div>}
      </div>
      {subtitle && <p className="ui-screen-header-subtitle">{subtitle}</p>}
      {createPortal(
        <div className={cx('ui-screen-header-compact', compact && 'is-visible')} aria-hidden="true">
          {title}
        </div>,
        document.body
      )}
    </header>
  );
}
