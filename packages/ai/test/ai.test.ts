import { LearningEngine, MemoryStore } from '@alsavi/engine';
import { describe, expect, it } from 'vitest';
import { AIService } from '../src/AIService.js';
import { ContextAssembler } from '../src/ContextAssembler.js';
import { PromptBuilder } from '../src/PromptBuilder.js';
import { MockProvider } from '../src/providers/MockProvider.js';
import type { AssembledContext } from '../src/types.js';

const T0 = new Date('2026-07-01T10:00:00Z').getTime();

/** A fixed, deterministic Engine: two brand-new cards, no reviews. */
async function fixtureEngine(): Promise<LearningEngine> {
  const store = new MemoryStore();
  let seq = 0;
  const engine = new LearningEngine(store, { now: () => T0, newId: () => `id-${seq++}` });
  await engine.addNote({ front: 'der Hund', back: 'собака' });
  await engine.addCard({ front: 'die Katze', back: 'кошка' });
  return engine;
}

const EXPECTED_CONTEXT: AssembledContext = {
  stats: {
    totalCards: 2,
    newCards: 2,
    dueNow: 2,
    reviewsToday: 0,
    accuracy: null,
    streakDays: 0,
  },
  cards: [
    { front: 'der Hund', back: 'собака' },
    { front: 'die Katze', back: 'кошка' },
  ],
};

describe('ContextAssembler', () => {
  it('returns the expected context from a fixed Engine, via the public API', async () => {
    const engine = await fixtureEngine();
    const context = await new ContextAssembler(engine).assemble();
    expect(context).toEqual(EXPECTED_CONTEXT);
  });

  it('is stateless — repeated calls reflect the current Engine, no caching', async () => {
    const engine = await fixtureEngine();
    const assembler = new ContextAssembler(engine);
    const first = await assembler.assemble();
    expect(first.cards).toHaveLength(2);
    await engine.addCard({ front: 'das Haus', back: 'дом' });
    const second = await assembler.assemble();
    expect(second.cards).toHaveLength(3);
  });
});

describe('PromptBuilder', () => {
  it('builds the expected prompt from a fixed context', () => {
    const prompt = new PromptBuilder().build('Which cards do I have?', EXPECTED_CONTEXT);
    expect(prompt).toBe(
      [
        'You are an assistant for ALSAVI, a spaced-repetition learning app.',
        'Answer the question using only the collection data below.',
        '',
        'Collection: 2 cards (2 new, 2 due now).',
        'Cards:',
        '- der Hund | собака',
        '- die Katze | кошка',
        '',
        'Question: Which cards do I have?',
      ].join('\n')
    );
  });
});

describe('AIService (end-to-end with MockProvider)', () => {
  it('returns the expected AIAnswer for a question; sources is undefined', async () => {
    const engine = await fixtureEngine();
    // A responder that proves the assembled context flowed into the prompt.
    const provider = new MockProvider((prompt) =>
      prompt.includes('der Hund') ? 'Your collection includes der Hund.' : 'No such card.'
    );
    const service = new AIService({ engine, provider });

    const result = await service.answer('Do I have a card about der Hund?');

    expect(result.answer).toBe('Your collection includes der Hund.');
    expect(result.sources).toBeUndefined();
  });

  it('is deterministic with the default MockProvider', async () => {
    const engine = await fixtureEngine();
    const service = new AIService({ engine, provider: new MockProvider() });
    const a = await service.answer('anything');
    const b = await service.answer('anything');
    expect(a.answer).toBe(b.answer);
    expect(a.answer).toMatch(/^Mock answer based on a \d+-character prompt\.$/);
  });
});

describe('layer boundary — AI Layer isolation', () => {
  async function readSources(dir: string): Promise<Array<{ file: string; text: string }>> {
    const { readdir, readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const out: Array<{ file: string; text: string }> = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...(await readSources(full)));
      } else if (entry.name.endsWith('.ts')) {
        out.push({ file: entry.name, text: await readFile(full, 'utf8') });
      }
    }
    return out;
  }

  it('no Engine source imports anything from the AI Layer', async () => {
    const { join } = await import('node:path');
    const engineSrc = join(import.meta.dirname, '..', '..', 'engine', 'src');
    for (const { file, text } of await readSources(engineSrc)) {
      expect(text, `engine/${file} must not import from the AI Layer`).not.toMatch(
        /@alsavi\/ai\b|['"][^'"]*\bai\/(AIService|ContextAssembler|PromptBuilder|AnswerGenerator|providers)/
      );
    }
  });

  it('no AI Layer source imports DexieStore or Storage internals — only the public Engine API', async () => {
    const { join } = await import('node:path');
    const aiSrc = join(import.meta.dirname, '..', 'src');
    for (const { file, text } of await readSources(aiSrc)) {
      expect(text, `ai/${file} must not touch DexieStore`).not.toMatch(/DexieStore|dexie-store|\bdexie\b/i);
      // Engine is reached only through its public entry, never a deep subpath
      // (which would expose Storage internals like store.js / memory-store.js).
      expect(text, `ai/${file} must not deep-import Engine internals`).not.toMatch(
        /@alsavi\/engine\/(?!index)[^'"]+/
      );
    }
  });
});
