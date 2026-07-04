import type { LearningEngine } from '@alsavi/engine';
import { AnswerGenerator } from './AnswerGenerator.js';
import { ContextAssembler } from './ContextAssembler.js';
import { PromptBuilder } from './PromptBuilder.js';
import type { AIAnswer, LLMProvider } from './types.js';

export interface AIServiceOptions {
  /** The Learning Engine — the AI Layer's only data source (public API only). */
  engine: LearningEngine;
  /** The LLM behind the {@link LLMProvider} abstraction. */
  provider: LLMProvider;
}

/**
 * Entry point of the AI Layer.
 *
 * Pure orchestration: it wires ContextAssembler → PromptBuilder →
 * AnswerGenerator (through the provider) and returns the answer. It holds no
 * search, prompt-building or generation logic of its own, and no state between
 * calls — context is re-assembled from the Engine on every `answer`.
 */
export class AIService {
  private readonly context: ContextAssembler;
  private readonly prompts: PromptBuilder;
  private readonly generator: AnswerGenerator;

  constructor(options: AIServiceOptions) {
    this.context = new ContextAssembler(options.engine);
    this.prompts = new PromptBuilder();
    this.generator = new AnswerGenerator(options.provider);
  }

  async answer(question: string): Promise<AIAnswer> {
    const context = await this.context.assemble();
    const prompt = this.prompts.build(question, context);
    const answer = await this.generator.generate(prompt);
    // `sources` is intentionally omitted in TASK_010 (reserved for citations).
    return { answer };
  }
}
