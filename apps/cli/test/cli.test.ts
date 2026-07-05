import { exportBackup } from '@alsavi/backup';
import { LearningEngine, MemoryStore } from '@alsavi/engine';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseArgs } from '../src/args.js';
import { DEFAULT_ENDPOINT, run, type CliIO } from '../src/cli.js';

const T0 = new Date('2026-07-01T10:00:00Z').getTime();

/** Build a valid, NON-EMPTY exported backup snapshot (JSON string). */
async function validSnapshotJson(): Promise<string> {
  const store = new MemoryStore();
  let seq = 0;
  const engine = new LearningEngine(store, { now: () => T0, newId: () => `id-${seq++}` });
  const { cards } = await engine.addNote({ front: 'der Hund', back: 'собака' });
  await engine.review(cards[0]!.id, 'good');
  expect((await store.listCards()).length).toBeGreaterThan(0); // snapshot is non-empty
  return exportBackup(store, () => T0);
}

function makeIO(): { io: CliIO; out: () => string; err: () => string } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: { stdout: (c) => out.push(c), stderr: (c) => err.push(c) },
    out: () => out.join(''),
    err: () => err.join(''),
  };
}

/** Stub the global fetch with a canned Ollama /api/generate response. No HTTP. */
function stubOllama(answer = '42') {
  const fetchMock = vi.fn(async (_url: string, _init: { method: string; body: string }) => ({
    ok: true,
    json: async () => ({ response: answer }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseArgs (flag → config mapping)', () => {
  it('parses a full valid command', () => {
    const r = parseArgs([
      '--endpoint',
      'http://x:1',
      '--model',
      'llama3',
      '--context-budget',
      '20000',
      'What is spaced repetition?',
    ]);
    expect(r).toEqual({
      ok: true,
      config: { model: 'llama3', contextBudget: 20000, endpoint: 'http://x:1', question: 'What is spaced repetition?' },
    });
  });

  it('endpoint is optional — absent → no endpoint key', () => {
    const r = parseArgs(['--model', 'llama3', '--context-budget', '100', 'q']);
    expect(r).toEqual({ ok: true, config: { model: 'llama3', contextBudget: 100, question: 'q' } });
  });

  it('maps --db to config.db', () => {
    const r = parseArgs(['--db', '/x/snap.json', '--model', 'm', '--context-budget', '100', 'q']);
    expect(r).toEqual({ ok: true, config: { model: 'm', contextBudget: 100, question: 'q', db: '/x/snap.json' } });
  });

  it('rejects missing --model', () => {
    expect(parseArgs(['--context-budget', '100', 'q']).ok).toBe(false);
  });

  it('rejects missing --context-budget', () => {
    expect(parseArgs(['--model', 'm', 'q']).ok).toBe(false);
  });

  it.each(['0', '-5', 'abc', '3.5', '1e3', ''])('rejects non-positive-integer budget: %j', (bad) => {
    expect(parseArgs(['--model', 'm', '--context-budget', bad, 'q']).ok).toBe(false);
  });

  it('rejects missing question', () => {
    expect(parseArgs(['--model', 'm', '--context-budget', '100']).ok).toBe(false);
  });

  it('rejects an unknown flag', () => {
    expect(parseArgs(['--model', 'm', '--context-budget', '100', '--verbose', 'q']).ok).toBe(false);
  });
});

describe('run — success and endpoint defaulting', () => {
  it('prints exactly the model answer to stdout and exits 0', async () => {
    const fetchMock = stubOllama('Spaced repetition schedules reviews over time.');
    const { io, out, err } = makeIO();

    const code = await run(['--model', 'llama3', '--context-budget', '20000', 'What is spaced repetition?'], io);

    expect(code).toBe(0);
    expect(out()).toBe('Spaced repetition schedules reviews over time.');
    expect(err()).toBe('');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses http://127.0.0.1:11434 when --endpoint is absent (DoD 11)', async () => {
    const fetchMock = stubOllama();
    const { io } = makeIO();

    await run(['--model', 'llama3', '--context-budget', '20000', 'q'], io);

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://127.0.0.1:11434/api/generate');
    expect(DEFAULT_ENDPOINT).toBe('http://127.0.0.1:11434');
  });

  it('uses the endpoint provided via --endpoint', async () => {
    const fetchMock = stubOllama();
    const { io } = makeIO();

    await run(['--endpoint', 'http://ollama.local:9999', '--model', 'llama3', '--context-budget', '20000', 'q'], io);

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://ollama.local:9999/api/generate');
  });
});

describe('run — error paths and exit codes', () => {
  it('argument error → stderr, non-zero code, AIService/HTTP never reached', async () => {
    const fetchMock = stubOllama();
    const { io, out, err } = makeIO();

    const code = await run(['--context-budget', '100', 'q'], io); // missing --model

    expect(code).not.toBe(0);
    expect(err().length).toBeGreaterThan(0);
    expect(out()).toBe('');
    expect(fetchMock).not.toHaveBeenCalled(); // no AIService constructed, no HTTP
  });

  it('ContextBudgetExceededError → shows actualChars & budgetChars, non-zero, no HTTP', async () => {
    const fetchMock = stubOllama();
    const { io, err } = makeIO();

    const code = await run(['--model', 'm', '--context-budget', '1', 'q'], io); // prompt > 1 char

    expect(code).not.toBe(0);
    expect(err()).toMatch(/actualChars=\d+/);
    expect(err()).toMatch(/budgetChars=1/);
    expect(fetchMock).not.toHaveBeenCalled(); // guard runs before any HTTP
  });

  it('runtime error (Ollama unreachable) → stderr, non-zero', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:11434'), { code: 'ECONNREFUSED' });
      })
    );
    const { io, err } = makeIO();

    const code = await run(['--model', 'm', '--context-budget', '20000', 'q'], io);

    expect(code).not.toBe(0);
    expect(err()).toMatch(/ECONNREFUSED/);
  });
});

describe('run — --db snapshot loading', () => {
  it('loads a valid snapshot and answers over the non-empty base (provider called once)', async () => {
    const json = await validSnapshotJson();
    const fetchMock = stubOllama('answer');
    const readFile = vi.fn(async (_path: string) => json);
    const { io, out } = makeIO();

    const code = await run(
      ['--db', '/snap.json', '--model', 'llama3', '--context-budget', '20000', 'q'],
      io,
      { readFile }
    );

    expect(code).toBe(0);
    expect(out()).toBe('answer');
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1); // AIService.answer ran over the loaded snapshot
  });

  it('missing/unreadable file → stderr, non-zero, provider not called', async () => {
    const fetchMock = stubOllama();
    const readFile = vi.fn(async (_path: string) => {
      throw Object.assign(new Error("ENOENT: no such file or directory, open '/nope.json'"), { code: 'ENOENT' });
    });
    const { io, err } = makeIO();

    const code = await run(
      ['--db', '/nope.json', '--model', 'm', '--context-budget', '20000', 'q'],
      io,
      { readFile }
    );

    expect(code).not.toBe(0);
    expect(err().length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled(); // engine/AIService never reached
  });

  it('invalid backup → stderr with reason, non-zero, provider not called', async () => {
    const fetchMock = stubOllama();
    const readFile = vi.fn(async (_path: string) => '{"format":"not-alsavi"}'); // valid JSON, fails parseBackup
    const { io, err } = makeIO();

    const code = await run(
      ['--db', '/bad.json', '--model', 'm', '--context-budget', '20000', 'q'],
      io,
      { readFile }
    );

    expect(code).not.toBe(0);
    expect(err().length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('without --db the reader is never touched (TASK_012 behavior preserved)', async () => {
    stubOllama();
    const readFile = vi.fn(async (_path: string) => {
      throw new Error('reader must not be called without --db');
    });
    const { io } = makeIO();

    const code = await run(['--model', 'm', '--context-budget', '20000', 'q'], io, { readFile });

    expect(code).toBe(0);
    expect(readFile).not.toHaveBeenCalled();
  });
});
