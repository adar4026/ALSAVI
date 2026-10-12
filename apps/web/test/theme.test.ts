import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  parseThemePreference,
  readThemePreference,
  resolveTheme,
  THEME_COLORS,
  THEME_STORAGE_KEY,
  themeColorFor,
  writeThemePreference,
} from '../src/theme';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const throwing = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

describe('parseThemePreference / resolveTheme', () => {
  it('accepts only explicit light/dark; anything else follows the system', () => {
    expect(parseThemePreference('light')).toBe('light');
    expect(parseThemePreference('dark')).toBe('dark');
    for (const v of [null, undefined, '', 'system', 'Dark', 'sepia', 1]) {
      expect(parseThemePreference(v)).toBe('system');
    }
  });

  it('system follows the device; an explicit choice wins', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('stored preference', () => {
  it('round-trips light/dark and stores nothing for system', () => {
    const storage = memoryStorage();
    expect(writeThemePreference(storage, 'dark')).toBe(true);
    expect(storage.data.get(THEME_STORAGE_KEY)).toBe('dark');
    expect(readThemePreference(storage)).toBe('dark');

    expect(writeThemePreference(storage, 'system')).toBe(true);
    expect(storage.data.has(THEME_STORAGE_KEY)).toBe(false);
    expect(readThemePreference(storage)).toBe('system');
  });

  it('a garbage value reads as system', () => {
    expect(readThemePreference(memoryStorage({ [THEME_STORAGE_KEY]: 'neon' }))).toBe('system');
  });

  it('missing or throwing storage never breaks the app', () => {
    expect(readThemePreference(null)).toBe('system');
    expect(readThemePreference(throwing)).toBe('system');
    expect(writeThemePreference(null, 'dark')).toBe(false);
    expect(writeThemePreference(throwing, 'dark')).toBe(false);
  });
});

describe('theme-color', () => {
  it('explicit choice sets every meta; system keeps each meta to its media query', () => {
    expect(themeColorFor('dark', '(prefers-color-scheme: light)')).toBe(THEME_COLORS.dark);
    expect(themeColorFor('light', '(prefers-color-scheme: dark)')).toBe(THEME_COLORS.light);
    expect(themeColorFor('system', '(prefers-color-scheme: dark)')).toBe(THEME_COLORS.dark);
    expect(themeColorFor('system', '(prefers-color-scheme: light)')).toBe(THEME_COLORS.light);
    expect(themeColorFor('system', null)).toBe(THEME_COLORS.light);
  });
});

describe('static files agree with theme.ts', () => {
  const html = readFileSync(resolve(webRoot, 'index.html'), 'utf8');
  const css = readFileSync(resolve(webRoot, 'src/styles.css'), 'utf8');

  it('the pre-paint script in index.html reads the same storage key', () => {
    expect(html).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`);
  });

  it('index.html theme-color metas match the theme backgrounds', () => {
    expect(html).toContain(`content="${THEME_COLORS.light}" media="(prefers-color-scheme: light)"`);
    expect(html).toContain(`content="${THEME_COLORS.dark}" media="(prefers-color-scheme: dark)"`);
  });

  it('the --bg tokens match the theme backgrounds', () => {
    expect(css).toMatch(new RegExp(`:root \\{[^}]*--bg: ${THEME_COLORS.light};`));
    expect(css).toMatch(new RegExp(`:root\\[data-theme='dark'\\] \\{[^}]*--bg: ${THEME_COLORS.dark};`));
  });

  it('the dark palette is identical under the attribute and the media query', () => {
    const block = (re: RegExp) => {
      const m = css.match(re);
      expect(m).not.toBeNull();
      return m![1]!
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .join('\n');
    };
    const byAttribute = block(/:root\[data-theme='dark'\] \{([^}]*)\}/);
    const byMedia = block(/:root:not\(\[data-theme='light'\]\) \{([^}]*)\}/);
    expect(byMedia).toBe(byAttribute);
  });
});
