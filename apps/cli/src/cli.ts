import { readFile } from 'node:fs/promises';
import { AIService, ContextBudgetExceededError, OllamaProvider } from '@alsavi/ai';
import { restoreBackup } from '@alsavi/backup';
import { LearningEngine, MemoryStore } from '@alsavi/engine';
import { parseArgs } from './args.js';

/** Default Ollama endpoint. The default is the CLI's policy (OllamaProvider has none). */
export const DEFAULT_ENDPOINT = 'http://127.0.0.1:11434';

/** Output sink, injected so `run` is pure and testable without touching process streams. */
export interface CliIO {
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
}

/** Injected side-effect deps, so `run` is testable without touching the disk. */
export interface CliDeps {
  /** Read a file's text (UTF-8). Defaults to `node:fs/promises`. */
  readFile: (path: string) => Promise<string>;
}

const defaultDeps: CliDeps = { readFile: (path) => readFile(path, 'utf8') };

/**
 * The whole `ask` command: parse args → build AIService (over an empty
 * in-memory Engine) + OllamaProvider → answer → print → exit code.
 *
 * No business logic of its own: it only wires the existing public `@alsavi/ai`
 * (and `@alsavi/engine`, solely to instantiate the required `LearningEngine`)
 * and reports the result. Returns the process exit code.
 */
export async function run(argv: readonly string[], io: CliIO, deps: CliDeps = defaultDeps): Promise<number> {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    io.stderr(`${parsed.error}\n`);
    return 2; // usage error — AIService is never constructed below
  }
  const { model, contextBudget, endpoint, question, db } = parsed.config;

  // Data source: empty MemoryStore, or — with --db — a real exported snapshot
  // loaded via the shared restore orchestration (@alsavi/backup#restoreBackup).
  // The store is always fresh here (nothing to protect), so CLI's confirmation
  // policy is a fixed auto-approval — no interactive prompt, matching prior
  // behavior. On failure the engine/AIService are never constructed.
  const store = new MemoryStore();
  if (db !== undefined) {
    try {
      const outcome = await restoreBackup(store, await deps.readFile(db), () => true);
      if (outcome.status === 'rejected') {
        io.stderr(`Failed to load database snapshot from ${db}: ${outcome.error}\n`);
        return 1;
      }
      // 'cancelled' cannot occur: the policy above always approves.
    } catch (error) {
      io.stderr(
        `Failed to load database snapshot from ${db}: ${error instanceof Error ? error.message : String(error)}\n`
      );
      return 1;
    }
  }

  const engine = new LearningEngine(store);
  const provider = new OllamaProvider({ endpoint: endpoint ?? DEFAULT_ENDPOINT, model });
  const service = new AIService({ engine, provider, contextBudgetChars: contextBudget });

  try {
    const { answer } = await service.answer(question);
    io.stdout(answer); // exactly the model's answer text — nothing added
    return 0;
  } catch (error) {
    if (error instanceof ContextBudgetExceededError) {
      io.stderr(
        `Context budget exceeded: actualChars=${error.actualChars}, budgetChars=${error.budgetChars}\n`
      );
      return 1;
    }
    // Runtime failures (Ollama unreachable, ECONNREFUSED, timeout, …) are
    // surfaced as-is. The CLI performs no retry, autostart or endpoint change.
    io.stderr(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
