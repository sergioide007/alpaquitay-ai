import { AIProvider, Message, AIResponse, ChatOptions } from '../core/interfaces';

/**
 * Ollama local model provider.
 * All requests stay on-device — no API keys, no data leaves the machine.
 */
export class OllamaProvider implements AIProvider {
  readonly name = 'Ollama (local)';
  readonly type = 'ollama' as const;
  get modelName(): string { return this.model; }

  constructor(
    private readonly endpoint: string,
    private readonly model: string,
    private readonly timeout: number = 120000
  ) {}

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/api/tags`, {
        signal: AbortSignal.timeout(2000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async chat(messages: Message[], options: ChatOptions = {}): Promise<AIResponse> {
    const response = await fetch(`${this.endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: [
          ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
          ...messages.map(m => ({ role: m.role, content: m.content }))
        ],
        options: {
          num_predict: options.maxTokens ?? 512,
          temperature: options.temperature ?? 0.3
        },
        stream: false
      }),
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama error ${response.status}: ${text}`);
    }

    const data = await response.json() as {
      message: { content: string };
      model: string;
      prompt_eval_count: number;
      eval_count: number;
    };
    return {
      content: data.message?.content ?? '',
      model: data.model ?? this.model,
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0
      }
    };
  }

  async complete(prompt: string, options: ChatOptions = {}): Promise<string> {
    const result = await this.chat([{ role: 'user', content: prompt }], options);
    return result.content;
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.endpoint}/api/tags`, {
        signal: AbortSignal.timeout(3000)
      });
      if (!response.ok) { return []; }
      const data = await response.json() as { models?: Array<{ name: string }> };
      return (data.models ?? []).map(m => m.name);
    } catch {
      return [];
    }
  }
}
