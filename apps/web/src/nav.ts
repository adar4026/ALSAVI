import type { IconName } from './Icon';

/**
 * Top-level sections and their addresses (TASK_030). Each section has a hash
 * address — `#/cards`, `#/stats`, `#/profile`; the home screen has none — so a
 * section can be bookmarked or linked, and the browser's Back button returns
 * to the previous section. Hash addresses never reach the server, so they
 * work unchanged on GitHub Pages under `/ALSAVI/` and offline in the PWA.
 * Only the section is addressable: the study session, list filters and focus
 * targets are not part of the address. Pure, tested in `nav.test.ts`.
 */

export type View = 'home' | 'cards' | 'stats' | 'profile';

export const NAV_ITEMS: ReadonlyArray<{ view: View; label: string; icon: IconName }> = [
  { view: 'home', label: 'Главная', icon: 'home' },
  { view: 'cards', label: 'Карточки', icon: 'cards' },
  { view: 'stats', label: 'Статистика', icon: 'chart' },
  { view: 'profile', label: 'Профиль', icon: 'user' },
];

const HASHES: Record<View, string> = {
  home: '',
  cards: '#/cards',
  stats: '#/stats',
  profile: '#/profile',
};

/** Section for a `location.hash`; anything unknown opens the home screen. */
export function viewFromHash(hash: string): View {
  const path = hash.replace(/^#\/?/, '').replace(/\/+$/, '').toLowerCase();
  for (const item of NAV_ITEMS) {
    if (item.view !== 'home' && path === item.view) return item.view;
  }
  return 'home';
}

/** `location.hash` for a section: '' (no hash) for the home screen. */
export function hashForView(view: View): string {
  return HASHES[view];
}

/**
 * The URL to push when navigating to `view` from `current` (a
 * `URL`-like location), or `null` when the address is already right — so
 * re-selecting the current section adds no history entry.
 */
export function urlForView(view: View, current: { pathname: string; search: string; hash: string }): string | null {
  const hash = hashForView(view);
  if (viewFromHash(current.hash) === view && current.hash === hash) return null;
  return `${current.pathname}${current.search}${hash}`;
}
