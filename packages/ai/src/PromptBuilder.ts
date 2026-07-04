import type { AssembledContext } from './types.js';

/**
 * Builds the prompt text from already-assembled context and the question.
 *
 * A pure text transformation: it does not search, does not call the model, and
 * holds no domain business logic. Deterministic — the same context and question
 * always produce the same prompt.
 */
export class PromptBuilder {
  build(question: string, context: AssembledContext): string {
    const { stats, cards } = context;
    const lines: string[] = [
      'You are an assistant for ALSAVI, a spaced-repetition learning app.',
      'Answer the question using only the collection data below.',
      '',
      `Collection: ${stats.totalCards} cards (${stats.newCards} new, ${stats.dueNow} due now).`,
      'Cards:',
    ];
    for (const card of cards) {
      lines.push(`- ${card.front} | ${card.back}`);
    }
    lines.push('', `Question: ${question}`);
    return lines.join('\n');
  }
}
