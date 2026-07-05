import { LearningEngine, MemoryStore } from '@alsavi/engine';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIService, ContextBudgetExceededError } from '../src/AIService.js';
import { ContextAssembler } from '../src/ContextAssembler.js';
import { PromptBuilder } from '../src/PromptBuilder.js';
import { MockProvider } from '../src/providers/MockProvider.js';
import { OllamaProvider } from '../src/providers/OllamaProvider.js';
import type { AssembledContext, LLMProvider } from '../src/types.js';

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
    const service = new AIService({ engine, provider, contextBudgetChars: 100_000 });

    const result = await service.answer('Do I have a card about der Hund?');

    expect(result.answer).toBe('Your collection includes der Hund.');
    expect(result.sources).toBeUndefined();
  });

  it('is deterministic with the default MockProvider', async () => {
    const engine = await fixtureEngine();
    const service = new AIService({ engine, provider: new MockProvider(), contextBudgetChars: 100_000 });
    const a = await service.answer('anything');
    const b = await service.answer('anything');
    expect(a.answer).toBe(b.answer);
    expect(a.answer).toMatch(/^Mock answer based on a \d+-character prompt\.$/);
  });
});

describe('Context Budget Guard (AIService)', () => {
  /** A provider that records whether it was invoked, without any network. */
  function trackedProvider(): { provider: LLMProvider; calls: () => number } {
    let n = 0;
    return {
      provider: {
        async generate() {
          n += 1;
          return 'ok';
        },
      },
      calls: () => n,
    };
  }

  it('within budget: the prompt is passed to the provider', async () => {
    const engine = await fixtureEngine();
    const t = trackedProvider();
    const service = new AIService({ engine, provider: t.provider, contextBudgetChars: 100_000 });
    const res = await service.answer('anything');
    expect(res.answer).toBe('ok');
    expect(t.calls()).toBe(1);
  });

  it('over budget: throws ContextBudgetExceededError before the provider runs (no HTTP)', async () => {
    const engine = await fixtureEngine();
    const t = trackedProvider();
    const service = new AIService({ engine, provider: t.provider, contextBudgetChars: 10 });

    const err = await service.answer('anything').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ContextBudgetExceededError);
    const budgetErr = err as ContextBudgetExceededError;
    expect(budgetErr.budgetChars).toBe(10);
    expect(budgetErr.actualChars).toBeGreaterThan(10);
    expect(t.calls()).toBe(0); // guard runs before the provider is ever called
  });

  // Exact-boundary tests: pin the comparison so a `>` → `>=` swap is caught.
  // L is the deterministic length of the assembled prompt for a fixed question.
  const BOUNDARY_QUESTION = 'Boundary?';
  async function assembledPromptLength(engine: LearningEngine): Promise<number> {
    const context = await new ContextAssembler(engine).assemble();
    return new PromptBuilder().build(BOUNDARY_QUESTION, context).length;
  }

  it('at the exact boundary (contextBudgetChars === L): passes, provider called', async () => {
    const engine = await fixtureEngine();
    const L = await assembledPromptLength(engine);
    const t = trackedProvider();
    const service = new AIService({ engine, provider: t.provider, contextBudgetChars: L });

    const res = await service.answer(BOUNDARY_QUESTION);

    expect(res.answer).toBe('ok');
    expect(t.calls()).toBe(1);
  });

  it('one over the boundary (contextBudgetChars === L - 1): throws with exact counts, provider not called', async () => {
    const engine = await fixtureEngine();
    const L = await assembledPromptLength(engine);
    const t = trackedProvider();
    const service = new AIService({ engine, provider: t.provider, contextBudgetChars: L - 1 });

    const err = await service.answer(BOUNDARY_QUESTION).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ContextBudgetExceededError);
    const budgetErr = err as ContextBudgetExceededError;
    expect(budgetErr.actualChars).toBe(L);
    expect(budgetErr.budgetChars).toBe(L - 1);
    expect(t.calls()).toBe(0);
  });
});

describe('OllamaProvider (no real HTTP)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs the prompt to /api/generate (stream disabled) and returns the response text', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: { method: string; body: string }) => ({
      ok: true,
      json: async () => ({ response: 'Hallo' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = new OllamaProvider({ endpoint: 'http://localhost:11434', model: 'llama3' });
    const out = await provider.generate('say hi');

    expect(out).toBe('Hallo');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:11434/api/generate');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ model: 'llama3', prompt: 'say hi', stream: false });
  });

  it('throws when the server responds with a non-OK status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, statusText: 'Server Error', json: async () => ({}) }))
    );
    const provider = new OllamaProvider({ endpoint: 'http://x', model: 'm' });
    await expect(provider.generate('p')).rejects.toThrow(/Ollama request failed: 500/);
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
