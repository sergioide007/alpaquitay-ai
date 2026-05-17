import { AIProvider, Message, AIResponse, ChatOptions } from '../core/interfaces';

export class OpenAIProvider implements AIProvider {
  readonly name = 'OpenAI GPT';
  readonly type = 'openai' as const;
  get modelName(): string { return this.model; }

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl: string = 'https://api.openai.com/v1',
    private readonly timeout: number = 120000
  ) {}

  async isAvailable(): Promise<boolean> {
    return this.apiKey.length > 0;
  }

  async chat(messages: Message[], options: ChatOptions = {}): Promise<AIResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      max_tokens: options.maxTokens ?? 4096
    };
    if (options.temperature !== undefined) { body.temperature = options.temperature; }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${text}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      model: string;
      usage: { prompt_tokens: number; completion_tokens: number };
    };
    return {
      content: data.choices?.[0]?.message?.content ?? '',
      model: data.model,
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
