import { Icon } from './Icon';
import { NAV_ITEMS, type View } from './nav';

interface Props {
  view: View;
  onNavigate: (view: View) => void;
}

/**
 * Main navigation (TASK_030): four sections. On phones a floating bar at the
 * bottom of the screen (above the iPhone home indicator); on wide screens the
 * same element sits in the header row — one element, placed by CSS. Hidden by
 * `App` during a study session, which has its own "Завершить".
 */
export function MainNav({ view, onNavigate }: Props) {
  return (
    <nav className="main-nav" aria-label="Разделы">
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
    </nav>
  );
}
