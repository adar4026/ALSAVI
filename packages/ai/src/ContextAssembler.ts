import type { LearningEngine } from '@alsavi/engine';
import type { AssembledContext } from './types.js';

/**
 * Gathers context for the AI Layer from the Engine — its single responsibility.
 *
 * It reads the collection through the Engine's public API only
 * (`listCardViews`, `getStats`) and returns a faithful, unranked view: card
 * contents in the Engine's own order plus collection stats. It performs no
 * semantic ranking, no summarization, no document rewriting, and makes no
 * decision about the answer. It knows nothing about the LLM, the UI or the
 * PromptBuilder.
 *
 * Owns no data of its own: no storage, no index, no cache. Every call re-reads
 * from the Engine, so the AI Layer stays stateless.
 */
export class ContextAssembler {
  constructor(private readonly engine: LearningEngine) {}

  async assemble(): Promise<AssembledContext> {
    const [views, stats] = await Promise.all([
      this.engine.listCardViews(),
      this.engine.getStats(),
    ]);
    // Preserve the Engine's own ordering — no reordering, no relevance ranking.
    const cards = views.map((v) => ({ front: v.front, back: v.back }));
    return { stats, cards };
  }
}
