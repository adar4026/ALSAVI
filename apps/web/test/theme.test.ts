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

/**
 * Design tokens v2 (TASK_035, docs/ui-ux/DESIGN_SYSTEM.md): one token system,
 * complete in both themes, AA contrast for the text pairs it promises, and no
 * literal colours or legacy names left in the component rules.
 */
describe('design tokens (TASK_035)', () => {
  const css = readFileSync(resolve(webRoot, 'src/styles.css'), 'utf8');

  function tokens(body: string): Map<string, string> {
    const map = new Map<string, string>();
    for (const m of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) map.set(m[1]!, m[2]!.trim());
    return map;
  }
  const blockOf = (re: RegExp) => {
    const m = css.match(re);
    expect(m).not.toBeNull();
    return m![1]!;
  };
  const scales = tokens(blockOf(/:root \{([^}]*--font-text:[^}]*)\}/));
  const light = tokens(blockOf(/:root \{([^}]*--bg:[^}]*)\}/));
  const dark = tokens(blockOf(/:root\[data-theme='dark'\] \{([^}]*)\}/));
  // Everything after the token section: the component rules.
  const rules = css.slice(css.indexOf('\n* {\n'));

  const COLOR_TOKENS = [
    '--bg', '--surface', '--surface-2', '--surface-3', '--surface-raised',
    '--text', '--text-secondary', '--text-tertiary', '--word', '--border', '--separator', '--overlay',
    '--accent', '--accent-strong', '--accent-text', '--accent-soft', '--accent-border', '--on-accent',
    '--secondary', '--brand-gradient', '--focus-ring',
    '--danger', '--danger-text', '--danger-soft', '--danger-fill',
    '--warning', '--warning-text', '--warning-soft',
    '--success', '--success-text', '--success-soft',
    '--info', '--info-text', '--info-soft',
    '--streak', '--streak-text', '--stage-new', '--stage-learning', '--stage-learned',
    '--elev-1', '--elev-2', '--elev-nav',
  ];
  const SCALE_TOKENS = [
    '--font-text', '--font-display', '--font-rounded',
    ...['display', 'word-xl', 'word-l', 'word-m', 'word-s', 'title-1', 'title-2', 'headline', 'body', 'callout',
      'footnote', 'caption', 'overline', 'kpi'].flatMap((r) => [`--type-${r}`, `--type-${r}-size`, `--type-${r}-line`, `--type-${r}-weight`]),
    '--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6', '--space-8', '--space-10', '--space-12',
    '--radius-xs', '--radius-sm', '--radius-md', '--radius-lg', '--radius-pill',
    '--tap-min', '--control-h', '--button-h', '--button-h-lg', '--rating-h', '--row-h', '--nav-h', '--icon',
    '--ease', '--ease-in', '--dur-1', '--dur-2', '--dur-3',
  ];

  it('defines every colour token of the design system in both themes', () => {
    for (const t of COLOR_TOKENS) {
      expect(light.has(t), `light ${t}`).toBe(true);
      expect(dark.has(t), `dark ${t}`).toBe(true);
    }
  });

  it('themes define the same token set: nothing falls back to the light value in dark', () => {
    expect([...dark.keys()].sort()).toEqual([...light.keys()].sort());
  });

  it('defines the scales once, outside the themes', () => {
    for (const t of SCALE_TOKENS) expect(scales.has(t), t).toBe(true);
    for (const t of SCALE_TOKENS) expect(dark.has(t), `dark repeats ${t}`).toBe(false);
  });

  it('uses the approved values (DESIGN_SYSTEM.md)', () => {
    expect(light.get('--accent')).toBe('#6d5df6');
    expect(dark.get('--accent')).toBe('#6d5df6');
    expect(light.get('--text-secondary')).toBe('#5f5e73');
    expect(dark.get('--surface')).toBe('#171a22');
    expect(['--space-1', '--space-4', '--space-12'].map((t) => scales.get(t))).toEqual(['4px', '16px', '48px']);
    expect(['--radius-sm', '--radius-md', '--radius-lg'].map((t) => scales.get(t))).toEqual(['12px', '16px', '22px']);
    expect(scales.get('--type-body-size')).toBe('17px');
    expect(scales.get('--nav-h')).toBe('64px');
  });

  it('every var() in the stylesheet is defined, and legacy names are gone', () => {
    const defined = new Set([...scales.keys(), ...light.keys(), ...dark.keys()]);
    for (const m of css.matchAll(/var\((--[a-z0-9-]+)/g)) expect(defined.has(m[1]!), m[1]).toBe(true);
    expect(css).not.toMatch(/--text-muted|--shadow-card|var\(--radius\)/);
  });

  it('component rules contain no literal colours — only tokens', () => {
    expect(rules).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(rules).not.toMatch(/\b(rgba?|hsla?)\(/);
  });

  // WCAG 2.1 relative luminance / contrast; soft fills are blended over --surface.
  type Rgb = [number, number, number];
  function parse(value: string, theme: Map<string, string>): { rgb: Rgb; a: number } {
    const ref = value.match(/^var\((--[a-z0-9-]+)\)$/);
    if (ref) return parse(theme.get(ref[1]!)!, theme);
    const hex = value.match(/^#([0-9a-f]{6})$/i);
    if (hex) return { rgb: [0, 2, 4].map((i) => parseInt(hex[1]!.slice(i, i + 2), 16)) as Rgb, a: 1 };
    const rgba = value.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
    if (rgba) return { rgb: [+rgba[1]!, +rgba[2]!, +rgba[3]!], a: +rgba[4]! };
    throw new Error(`unparsed colour ${value}`);
  }
  function solid(token: string, theme: Map<string, string>, under = '--surface'): Rgb {
    const { rgb, a } = parse(theme.get(token)!, theme);
    if (a === 1) return rgb;
    const base = solid(under, theme);
    return rgb.map((c, i) => c * a + base[i]! * (1 - a)) as Rgb;
  }
  const lum = (rgb: Rgb) => {
    const [r, g, b] = rgb.map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const contrast = (a: Rgb, b: Rgb) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x! + 0.05) / (y! + 0.05);
  };

  const AA_PAIRS: Array<[string, string]> = [
    ['--text', '--surface'],
    ['--text', '--bg'],
    ['--text-secondary', '--surface'],
    ['--text-secondary', '--bg'],
    ['--text-secondary', '--surface-2'],
    ['--accent-text', '--surface'],
    ['--accent-text', '--accent-soft'],
    ['--on-accent', '--accent'],
    ['--on-accent', '--danger-fill'],
    ['--danger-text', '--surface'],
    ['--danger-text', '--danger-soft'],
    ['--warning-text', '--warning-soft'],
    ['--success-text', '--success-soft'],
    ['--info-text', '--info-soft'],
    ['--streak-text', '--surface'],
  ];

  for (const [name, theme] of [['light', light], ['dark', dark]] as const) {
    it(`${name}: text pairs meet WCAG AA (4.5:1)`, () => {
      for (const [fg, bg] of AA_PAIRS) {
        const ratio = contrast(solid(fg, theme), solid(bg, theme));
        expect(ratio, `${fg} on ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`${name}: tertiary text stays legible for large text (3:1)`, () => {
      expect(contrast(solid('--text-tertiary', theme), solid('--surface', theme))).toBeGreaterThanOrEqual(3);
    });
  }
});
