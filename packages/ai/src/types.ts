import type { EngineStats } from '@alsavi/engine';

/**
 * The answer returned by the AI Layer.
 *
 * An object (not a bare string) so future tasks can add fields without a
 * breaking change to the AI Layer API. `sources` is reserved for future
 * citations / source references and is intentionally left `undefined` in
 * TASK_010.
 */
export interface AIAnswer {
  readonly answer: string;
  readonly sources?: readonly string[];
}

/**
 * The LLM abstraction. The only place that knows about a concrete model is a
 * provider implementation; every other module depends solely on this interface.
 */
export interface LLMProvider {
  generate(prompt: string): Promise<string>;
}

/** A single card's content, as gathered for context. Plain, read-only data. */
export interface ContextCard {
  readonly front: string;
  readonly back: string;
}

/**
 * Context assembled from the Engine for a prompt. It is a faithful, unranked
 * view of the collection: card contents in the Engine's own order plus
 * collection-level stats. No semantic ranking, summarization or selection.
 */
export interface AssembledContext {
  readonly stats: EngineStats;
  readonly cards: readonly ContextCard[];
}
