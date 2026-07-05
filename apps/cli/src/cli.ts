import { AIService, ContextBudgetExceededError, OllamaProvider } from '@alsavi/ai';
import { LearningEngine, MemoryStore } from '@alsavi/engine';
import { parseArgs } from './args.js';

/** Default Ollama endpoint. The default is the CLI's policy (OllamaProvider has none). */
export const DEFAULT_ENDPOINT = 'http://127.0.0.1:11434';

/** Output sink, injected so `run` is pure and testable without touching process streams. */
export interface CliIO {
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
}

/**
 * The whole `ask` command: parse args → build AIService (over an empty
 * in-memory Engine) + OllamaProvider → answer → print → exit code.
 *
 * No business logic of its own: it only wires the existing public `@alsavi/ai`
 * (and `@alsavi/engine`, solely to instantiate the required `LearningEngine`)
 * and reports the result. Returns the process exit code.
 */
export async function run(argv: readonly string[], io: CliIO): Promise<number> {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    io.stderr(`${parsed.error}\n`);
    return 2; // usage error — AIService is never constructed below
  }
  const { model, contextBudget, endpoint, question } = parsed.config;

  const engine = new LearningEngine(new MemoryStore());
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
