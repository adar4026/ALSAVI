import type { IconName } from './Icon';

/**
 * Top-level sections and their addresses (TASK_030). Each section has a hash
 * address — `#/cards`, `#/stats`, `#/profile`; the home screen has none — so a
 * section can be bookmarked or linked, and the browser's Back button returns
 * to the previous section. Hash addresses never reach the server, so they
 * work unchanged on GitHub Pages under `/ALSAVI/` and offline in the PWA.
 * Sections are addressable, and inside "Карточки" the new-word form
 * (`#/cards/new`) and one word (`#/cards/<noteId>`, TASK_037); the study
 * session and list filters are not part of the address. Pure, tested in
 * `nav.test.ts`.
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

/**
 * An address inside a section (TASK_037). Only "Карточки" has sub-addresses:
 * `#/cards/new` — the new-word form; `#/cards/<noteId>` — one word. Until the
 * sheet and the card view exist (TASK_040–041) the first focuses the form,
 * the second brings the word's row into view.
 */
export type CardTarget = { kind: 'new' } | { kind: 'note'; id: string };

export interface Route {
  view: View;
  card?: CardTarget;
}

/** Note ids are generated UUIDs; anything else in that position is not an id. */
const NOTE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Route for a `location.hash`; anything unknown opens the home screen. */
export function routeFromHash(hash: string): Route {
  const segments = hash.replace(/^#\/?/, '').replace(/\/+$/, '').split('/');
  const section = (segments[0] ?? '').toLowerCase();
  const view = NAV_ITEMS.find((item) => item.view !== 'home' && item.view === section)?.view;
  if (!view) return { view: 'home' };
  if (segments.length === 1) return { view };
  if (view !== 'cards' || segments.length !== 2) return { view: 'home' };
  const sub = segments[1]!;
  if (sub.toLowerCase() === 'new') return { view, card: { kind: 'new' } };
  return NOTE_ID.test(sub) ? { view, card: { kind: 'note', id: sub } } : { view: 'home' };
}

/** Section for a `location.hash` (sub-addresses belong to their section). */
export function viewFromHash(hash: string): View {
  return routeFromHash(hash).view;
}

/** `location.hash` for a section: '' (no hash) for the home screen. */
export function hashForView(view: View): string {
  return HASHES[view];
}

/** `location.hash` for a route. */
export function hashForRoute(route: Route): string {
  if (route.view !== 'cards' || !route.card) return hashForView(route.view);
  return route.card.kind === 'new' ? '#/cards/new' : `#/cards/${route.card.id}`;
}

/** Two routes lead to the same screen state. */
export function sameRoute(a: Route, b: Route): boolean {
  return hashForRoute(a) === hashForRoute(b);
}

/**
 * The URL to push when navigating to `route` from `current` (a `URL`-like
 * location), or `null` when the address is already right — so re-selecting
 * the current section adds no history entry.
 */
export function urlForRoute(route: Route, current: { pathname: string; search: string; hash: string }): string | null {
  const hash = hashForRoute(route);
  if (current.hash === hash) return null;
  return `${current.pathname}${current.search}${hash}`;
}

/** {@link urlForRoute} for a whole section. */
export function urlForView(view: View, current: { pathname: string; search: string; hash: string }): string | null {
  return urlForRoute({ view }, current);
}

/**
 * `#/review` — the study session, opened from a review-reminder
 * notification (TASK_034). Not a section: the app shows the home section,
 * starts the session once the daily limit is applied, and drops the hash,
 * so Back and a later reload behave like any other visit to "Главная".
 */
export const REVIEW_HASH = '#/review';

export function isReviewLink(hash: string): boolean {
  return hash.replace(/^#\/?/, '').replace(/\/+$/, '').toLowerCase() === 'review';
}

/** Message the service worker posts to an open window when a reminder is tapped. */
export const OPEN_REVIEW_MESSAGE = 'alsavi:open-review';

export function isOpenReviewMessage(data: unknown): boolean {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === OPEN_REVIEW_MESSAGE;
}
