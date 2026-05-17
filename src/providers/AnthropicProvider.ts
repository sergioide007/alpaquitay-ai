import { AIProvider, Message, AIResponse, ChatOptions } from '../core/interfaces';

export class AnthropicProvider implements AIProvider {
  readonly name = 'Anthropic Claude';
  readonly type = 'anthropic' as const;
  get modelName(): string { return this.model; }

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl: string = 'https://api.anthropic.com/v1',
    private readonly timeout: number = 120000
  ) {}

  async isAvailable(): Promise<boolean> {
    return this.apiKey.length > 0;
  }

  async chat(messages: Message[], options: ChatOptions = {}): Promise<AIResponse> {
    const system = messages.find(m => m.role === 'system')?.content;
    const userMessages = messages.filter(m => m.role !== 'system');

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: options.maxTokens ?? 4096,
      messages: userMessages.map(m => ({ role: m.role, content: m.content }))
    };
    if (system) { body.system = system; }
    if (options.temperature !== undefined) { body.temperature = options.temperature; }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${text}`);
    }

    const data = await response.json() as {
      content: Array<{ text: string }>;
      model: string;
      usage: { input_tokens: number; output_tokens: number };
    };
    return {
      content: data.content?.[0]?.text ?? '',
      model: data.model,
      usage: {
        promptTokens: data.usage?.input_tokens ?? 0,
        completionTokens: data.usage?.output_tokens ?? 0
      }
    };
  }

  async complete(prompt: string, options: ChatOptions = {}): Promise<string> {
    const result = await this.chat([{ role: 'user', content: prompt }], options);
    return result.content;
  }
}
