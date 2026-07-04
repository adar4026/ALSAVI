import type { LLMProvider } from './types.js';

/**
 * Generates an answer from a prompt through the {@link LLMProvider} abstraction.
 *
 * It does not know about any concrete provider implementation and depends only
 * on the `LLMProvider` interface — the model's details stay behind that
 * boundary. Its single responsibility is "produce an answer from a prompt";
 * assembling context and building the prompt belong to other modules.
 */
export class AnswerGenerator {
  constructor(private readonly provider: LLMProvider) {}

  async generate(prompt: string): Promise<string> {
    return this.provider.generate(prompt);
  }
}
