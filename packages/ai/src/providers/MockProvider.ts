import type { LLMProvider } from '../types.js';

/** Produces a deterministic response from a prompt. */
export type MockResponder = (prompt: string) => string;

const defaultResponder: MockResponder = (prompt) =>
  `Mock answer based on a ${prompt.length}-character prompt.`;

/**
 * A deterministic, offline {@link LLMProvider} for fully reproducible tests.
 *
 * It performs no network calls. By default it returns a fixed, prompt-derived
 * string; a custom {@link MockResponder} can be injected to assert specific
 * end-to-end behaviour. It is the only place aware that this is a "mock" — every
 * other module sees just the `LLMProvider` interface.
 */
export class MockProvider implements LLMProvider {
  constructor(private readonly responder: MockResponder = defaultResponder) {}

  async generate(prompt: string): Promise<string> {
    return this.responder(prompt);
  }
}
