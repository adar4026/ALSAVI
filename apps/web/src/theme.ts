/**
 * Light/dark theme (TASK_029). The palette itself lives in `styles.css` as
 * design tokens: `:root` is light, `[data-theme='dark']` is dark, and with no
 * attribute the system setting decides (`prefers-color-scheme`). This module
 * only stores the learner's choice and sets the attribute.
 *
 * The choice is a per-device display preference, not learning data: it is
 * kept in `localStorage` (synchronous, so the inline script in `index.html`
 * can apply it before the first paint — no light flash on a dark phone), not
 * in IndexedDB, and it is not part of backups.
 */

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

/** Also read by the inline script in `index.html` — keep the two in sync. */
export const THEME_STORAGE_KEY = 'alsavi-theme';

/** Page background per theme — the browser/status-bar colour (`theme-color`). */
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: '#f6f6fb',
  dark: '#0f1115',
};

export const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'Как в системе' },
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
];

/** Anything that is not an explicit 'light'/'dark' means "follow the system". */
export function parseThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'setItem' | 'removeItem'>;

/** Storage can be missing or throw (private mode, blocked site data): fall back to 'system'. */
export function readThemePreference(storage: ReadableStorage | null | undefined): ThemePreference {
  try {
    return parseThemePreference(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

/** Returns false when the choice could not be saved (it still applies until reload). */
export function writeThemePreference(storage: WritableStorage | null | undefined, preference: ThemePreference): boolean {
  if (!storage) return false;
  try {
    if (preference === 'system') storage.removeItem(THEME_STORAGE_KEY);
    else storage.setItem(THEME_STORAGE_KEY, preference);
    return true;
  } catch {
    return false;
  }
}

/**
 * `theme-color` for one `<meta>`: an explicit choice wins; with 'system' each
 * meta keeps the colour of its own `media` query (`index.html` has one for
 * light and one for dark).
 */
export function themeColorFor(preference: ThemePreference, media: string | null): string {
  if (preference !== 'system') return THEME_COLORS[preference];
  return THEME_COLORS[media?.includes('dark') ? 'dark' : 'light'];
}

/** Sets `data-theme` on `<html>` (none for 'system') and updates `theme-color`. */
export function applyTheme(doc: Document, preference: ThemePreference): void {
  const root = doc.documentElement;
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
  doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.content = themeColorFor(preference, meta.getAttribute('media'));
  });
}
