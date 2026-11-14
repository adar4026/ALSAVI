import type { ReactNode } from 'react';
import { Brand } from './HomeHeader';
import { Icon } from './Icon';
import { NAV_ITEMS, type View } from './nav';

interface Props {
  view: View;
  onNavigate: (view: View) => void;
  /** Shown at the bottom of the side column on a computer (the streak). */
  footer?: ReactNode;
}

/**
 * Main navigation: four sections in one element, placed by CSS (TASK_030,
 * TASK_037). On phones a floating bar at the bottom of the screen (above the
 * iPhone home indicator); from 900 px a side column with the brand on top and
 * the streak at the bottom — the brand and the footer are hidden on phones,
 * where the home header shows them. Hidden by `App` during a study session,
 * which has its own "Завершить".
 */
export function MainNav({ view, onNavigate, footer }: Props) {
  return (
    <nav className="main-nav" aria-label="Разделы">
      <div className="main-nav-brand">
        <Brand />
      </div>
      <ul className="main-nav-list">
        {NAV_ITEMS.map((item) => (
          <li key={item.view}>
            <button
              type="button"
              className="main-nav-item"
              aria-current={view === item.view ? 'page' : undefined}
              onClick={() => onNavigate(item.view)}
            >
              <Icon name={item.icon} />
              <span className="main-nav-label">{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
      {footer && <div className="main-nav-footer">{footer}</div>}
    </nav>
  );
}
