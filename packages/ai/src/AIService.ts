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
  /**
   * Context Budget: the maximum size of the final prompt, in **characters**.
   *
   * A deliberate consumer-side cap on how much text is sent to the model —
   * distinct from the model's own token window (Model Window). This is measured
   * in characters, not tokens: the AI Layer does not tokenize or count tokens.
   */
  contextBudgetChars: number;
}

/**
 * Thrown by {@link AIService} when the built prompt exceeds the Context Budget,
 * before the provider (and therefore any network call) is invoked.
 */
export class ContextBudgetExceededError extends Error {
  readonly actualChars: number;
  readonly budgetChars: number;

  constructor(actualChars: number, budgetChars: number) {
    super(`Prompt exceeds context budget: ${actualChars} > ${budgetChars} characters`);
    this.name = 'ContextBudgetExceededError';
    this.actualChars = actualChars;
    this.budgetChars = budgetChars;
  }
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
  private readonly contextBudgetChars: number;

  constructor(options: AIServiceOptions) {
    this.context = new ContextAssembler(options.engine);
    this.prompts = new PromptBuilder();
    this.generator = new AnswerGenerator(options.provider);
    this.contextBudgetChars = options.contextBudgetChars;
  }

  async answer(question: string): Promise<AIAnswer> {
    const context = await this.context.assemble();
    const prompt = this.prompts.build(question, context);
    // Context Budget Guard — runs after the prompt is built but BEFORE the
    // provider is called, so an over-budget prompt never reaches the network.
    if (prompt.length > this.contextBudgetChars) {
      throw new ContextBudgetExceededError(prompt.length, this.contextBudgetChars);
    }
    const answer = await this.generator.generate(prompt);
    // `sources` is intentionally omitted in TASK_010 (reserved for citations).
    return { answer };
  }
}
