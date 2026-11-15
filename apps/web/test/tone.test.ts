import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Q6 (TASK_044): the interface speaks to the learner with «ты» everywhere.
 * Scans every Russian string in the web app's sources (comments skipped) for
 * «вы» forms — pronouns and imperatives like «нажмите», «введите».
 */
const src = resolve(__dirname, '../src');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

// Pronouns and the plural imperative endings (-ите, -йте, -ьте).
const VY = /(?<!\p{L})(вы|вас|вам|ваш\p{L}*|\p{L}+(?:ите|йте|ьте))(?!\p{L})/giu;
const CYRILLIC = /\p{Script=Cyrillic}/u;

describe('tone «ты» (Q6)', () => {
  it('no «вы» forms in the strings the app shows', () => {
    const found: string[] = [];
    for (const file of [...sources(src), resolve(__dirname, '../index.html'), resolve(__dirname, '../public/sw.js')]) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const code = line.trim();
          if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*') || !CYRILLIC.test(code)) return;
          for (const m of code.matchAll(VY)) {
            if (CYRILLIC.test(m[1]!)) found.push(`${file.slice(src.length - 3)}:${i + 1} ${m[1]}`);
          }
        });
    }
    expect(found).toEqual([]);
  });

  it('the check itself recognises a «вы» form', () => {
    expect('Нажмите «Отмена»'.match(VY)).not.toBeNull();
    expect('Нажми «Отмена»'.match(new RegExp(VY.source, 'iu'))).toBeNull();
  });
});
