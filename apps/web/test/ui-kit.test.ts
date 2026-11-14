import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { canStep, clampStep, stepValue } from '../src/ui/stepper-math';

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(resolve(webRoot, p), 'utf8');

describe('stepper arithmetic', () => {
  const bounds = { min: 0, max: 999 };

  it('steps by one and stops at the bounds', () => {
    expect(stepValue(20, 1, bounds)).toBe(21);
    expect(stepValue(20, -1, bounds)).toBe(19);
    expect(stepValue(0, -1, bounds)).toBe(0);
    expect(stepValue(999, 1, bounds)).toBe(999);
    expect(stepValue(10, 1, { ...bounds, step: 5 })).toBe(15);
  });

  it('pulls invalid input back into range', () => {
    expect(clampStep(-3, bounds)).toBe(0);
    expect(clampStep(12.6, bounds)).toBe(13);
    expect(clampStep(Number.NaN, bounds)).toBe(0);
    expect(clampStep(5000, bounds)).toBe(999);
  });

  it('reports whether a direction is possible', () => {
    expect(canStep(0, -1, bounds)).toBe(false);
    expect(canStep(0, 1, bounds)).toBe(true);
    expect(canStep(999, 1, bounds)).toBe(false);
  });
});

/**
 * The component stylesheet follows the token system (TASK_035/036): tokens
 * only, every var() defined in styles.css, motion on the --dur-* tokens.
 */
describe('ui.css', () => {
  const ui = read('src/ui/ui.css');
  const tokens = read('src/styles.css');
  const defined = new Set([...tokens.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]!));

  it('uses no literal colours', () => {
    expect(ui).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(ui).not.toMatch(/\b(rgba?|hsla?)\(/);
  });

  it('every var() is a token of styles.css', () => {
    for (const m of ui.matchAll(/var\((--[a-z0-9-]+)/g)) expect(defined.has(m[1]!), m[1]).toBe(true);
  });

  it('defines no tokens of its own (one token system)', () => {
    expect(ui).not.toMatch(/^\s*--[a-z0-9-]+\s*:/m);
  });

  it('transitions use the duration tokens', () => {
    for (const m of ui.matchAll(/transition:([^;]+);/g)) {
      expect(m[1], m[0]).not.toMatch(/\d(\.\d+)?m?s\b/);
    }
  });

  it('is loaded right after styles.css, before the app', () => {
    const main = read('src/main.tsx');
    const s = main.indexOf("import './styles.css'");
    const u = main.indexOf("import './ui/ui.css'");
    const app = main.indexOf("import { App }");
    expect(s).toBeGreaterThanOrEqual(0);
    expect(u).toBeGreaterThan(s);
    expect(app).toBeGreaterThan(u);
  });
});

/**
 * Migrated primitives (TASK_036): the legacy classes replaced by Button,
 * IconButton, SegmentedControl, ProgressBar, Banner and Switch are gone from
 * both the components and the stylesheet — no second set of buttons.
 */
describe('no duplicate primitives', () => {
  const LEGACY = [
    'btn-primary',
    'btn-secondary',
    'btn-link',
    'btn-danger',
    'btn-quiet-danger',
    'btn-cta',
    'btn-icon',
    'icon-button',
    'notice',
    'notice-info',
    'notice-warning',
    'notice-error',
    'notice-actions',
    'update-banner',
    'save-error',
    'segmented',
    'segmented-field',
    'segmented-option',
    'period-toggle',
    'period-option',
    'progress-bar',
    'progress-bar-fill',
    'goal-bar',
    'goal-bar-fill',
    'switch',
    // TASK_037: the shell's headers are HomeHeader and ScreenHeader.
    'app-header',
    'brand-mark',
    'brand-sub',
    'header-actions',
    'screen-head',
    'screen-title',
    'screen-lead',
    'profile-head',
    'profile-title',
    'profile-lead',
    // TASK_038: the session and the practice use SessionHeader, RatingBar, ActionDock.
    'card-panel',
    'state-badge',
    'card-front',
    'card-back',
    'answer-bar',
    'answer-buttons',
    'answer-details',
    'hotkey-hint',
    'session-progress',
    'session-exit',
    'practice-grade',
    'practice-buttons',
    'practice-summary',
    // TASK_039: the home screen uses Surface, Tile, ProgressBar and its own home-today block.
    'goal-card',
    'goal-title',
    'goal-detail',
    'goal-progress',
    'queue-split',
    'queue-count',
    'quick-grid',
    'quick-action',
    'week-card',
    'home-lead',
    'eyebrow',
    // TASK_040: the note form is built from TextField, TextArea, Switch and Chip.
    'field',
    'reverse-toggle',
    'chip-add',
    'form-more',
  ];
  const sources = readdirSync(resolve(webRoot, 'src'))
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => [f, read(`src/${f}`)] as const);
  const css = read('src/styles.css');

  for (const name of LEGACY) {
    it(`.${name} is not used or styled any more`, () => {
      const cls = new RegExp(`(^|[\\s'"\`])${name}(?=[\\s'"\`]|$)`, 'm');
      for (const [file, src] of sources) {
        for (const m of src.matchAll(/className=(?:"([^"]*)"|\{([^}]*)\})/g)) {
          expect(cls.test(m[1] ?? m[2] ?? ''), `${file}: ${m[0]}`).toBe(false);
        }
      }
      expect(css, `styles.css .${name}`).not.toMatch(new RegExp(`\\.${name}(?![\\w-])`));
    });
  }
});

/** The shell (TASK_037): the logo is a file that ships with the PWA. */
describe('shell', () => {
  it('the header logo is an existing PWA icon (precached, no new asset)', () => {
    const header = read('src/HomeHeader.tsx');
    const m = header.match(/BASE_URL\}(icons\/[\w.-]+\.png)/);
    expect(m).not.toBeNull();
    expect(() => read(`public/${m![1]}`)).not.toThrow();
  });

  it('no settings button in the header any more — "Профиль" is a tab', () => {
    expect(read('src/HomeHeader.tsx')).not.toMatch(/sliders|Настройки/);
  });
});
