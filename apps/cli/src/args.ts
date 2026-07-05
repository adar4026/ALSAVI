/**
 * Manual `process.argv` parsing for the `ask` command — no CLI framework, no
 * external dependencies. Pure and side-effect free: it validates and maps flags
 * to a config, or returns a human-readable error. It applies no defaults
 * (e.g. the endpoint default is the CLI's policy, applied in `run`).
 */

export interface CliConfig {
  readonly model: string;
  readonly contextBudget: number;
  readonly question: string;
  /** Optional; when absent the CLI (not this parser) supplies the default. */
  readonly endpoint?: string;
}

export type ParseResult =
  | { readonly ok: true; readonly config: CliConfig }
  | { readonly ok: false; readonly error: string };

export const USAGE =
  'Usage: ask [--endpoint <url>] --model <name> --context-budget <int> "<question>"';

const VALUE_FLAGS = new Set(['--model', '--context-budget', '--endpoint']);

export function parseArgs(argv: readonly string[]): ParseResult {
  let model: string | undefined;
  let contextBudgetRaw: string | undefined;
  let endpoint: string | undefined;
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (VALUE_FLAGS.has(token)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        return fail(`Missing value for ${token}`);
      }
      i++;
      if (token === '--model') model = value;
      else if (token === '--context-budget') contextBudgetRaw = value;
      else endpoint = value;
    } else if (token.startsWith('--')) {
      return fail(`Unknown flag: ${token}`);
    } else {
      positionals.push(token);
    }
  }

  if (model === undefined || model.length === 0) return fail('Missing required --model');
  if (contextBudgetRaw === undefined) return fail('Missing required --context-budget');
  if (!/^[0-9]+$/.test(contextBudgetRaw) || Number(contextBudgetRaw) <= 0) {
    return fail(`--context-budget must be a positive integer, got: "${contextBudgetRaw}"`);
  }
  if (positionals.length === 0) return fail('Missing required question');
  if (positionals.length > 1) {
    return fail(`Expected exactly one question, got extra: ${positionals.slice(1).join(' ')}`);
  }

  const config: CliConfig = {
    model,
    contextBudget: Number(contextBudgetRaw),
    question: positionals[0]!,
    ...(endpoint !== undefined ? { endpoint } : {}),
  };
  return { ok: true, config };
}

function fail(message: string): ParseResult {
  return { ok: false, error: `${message}\n${USAGE}` };
}
