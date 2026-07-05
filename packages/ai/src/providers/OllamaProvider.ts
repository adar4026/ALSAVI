import type { LLMProvider } from '../types.js';

/** Configuration for {@link OllamaProvider}. Endpoint and model only. */
export interface OllamaConfig {
  /** Base URL of the Ollama server, e.g. `http://localhost:11434`. */
  readonly endpoint: string;
  /** Model name to run, e.g. `llama3`. */
  readonly model: string;
}

/**
 * A real {@link LLMProvider} backed by a local Ollama server.
 *
 * Consumer-side and stateless: it turns a prompt string into a POST to Ollama's
 * `/api/generate` and returns the model's text. Endpoint and model come solely
 * from configuration. Streaming is disabled (`stream: false`) — the AI Layer
 * scope is a single non-streamed answer. It is the only place aware of Ollama's
 * wire format; every other module sees just the `LLMProvider` interface.
 */
export class OllamaProvider implements LLMProvider {
  constructor(private readonly config: OllamaConfig) {}

  async generate(prompt: string): Promise<string> {
    const response = await fetch(`${this.config.endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.config.model, prompt, stream: false }),
    });
    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }
    const data = (await response.json()) as { response?: unknown };
    if (typeof data.response !== 'string') {
      throw new Error('Ollama response missing string "response" field');
    }
    return data.response;
  }
}
