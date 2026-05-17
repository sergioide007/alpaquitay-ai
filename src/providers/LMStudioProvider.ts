import { AIProvider, Message, AIResponse, ChatOptions } from '../core/interfaces';

/**
 * LM Studio local model provider (OpenAI-compatible API).
 * All requests stay on-device — no API keys, no data leaves the machine.
 */
export class LMStudioProvider implements AIProvider {
  readonly name = 'LM Studio (local)';
  readonly type = 'lmstudio' as const;
  private _modelName = 'lmstudio';
  get modelName(): string { return this._modelName; }

  constructor(
    private readonly endpoint: string,
    private readonly timeout: number = 120000
  ) {}

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/v1/models`, {
        signal: AbortSignal.timeout(2000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async chat(messages: Message[], options: ChatOptions = {}): Promise<AIResponse> {
    const apiMessages = options.systemPrompt
      ? [{ role: 'system', content: options.systemPrompt }, ...messages.map(m => ({ role: m.role, content: m.content }))]
      : messages.map(m => ({ role: m.role, content: m.content }));

    const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: apiMessages,
        max_tokens: options.maxTokens ?? 512,
        temperature: options.temperature ?? 0.3,
        stream: false
      }),
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      const text = await response.text();
      // LM Studio sometimes wraps model output in a 400 error when its JSON
      // serialiser chokes on non-ASCII characters in the response. If the error
      // body looks like it contains actual model output, extract and use it.
      try {
        const errObj = JSON.parse(text) as { error?: string };
        if (errObj.error && errObj.error.length > 80) {
          const content = errObj.error.replace(/^Failed to parse [^:]+: /, '');
          return { content, model: 'lmstudio', usage: { promptTokens: 0, completionTokens: 0 } };
        }
      } catch { /* not JSON — fall through */ }
      throw new Error(`LM Studio error ${response.status}: ${text}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      model: string;
      usage: { prompt_tokens: number; completion_tokens: number };
    };
    const resolvedModel = data.model ?? 'lmstudio';
    this._modelName = resolvedModel;
    return {
      content: data.choices?.[0]?.message?.content ?? '',
      model: resolvedModel,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0
      }
    };
  }

  async complete(prompt: string, options: ChatOptions = {}): Promise<string> {
    const result = await this.chat([{ role: 'user', content: prompt }], options);
    return result.content;
  }
}
