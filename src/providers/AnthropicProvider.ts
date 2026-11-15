import { AIProvider, Message, AIResponse, ChatOptions } from '../core/interfaces';
import { anthropicAcceptsSampling, anthropicThinksByDefault, outputBudget } from './modelCapabilities';

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  model: string;
  stop_reason?: string;
  stop_details?: { category?: string | null; explanation?: string } | null;
  usage?: { input_tokens: number; output_tokens: number };
}

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

    // Claude 5.x / Fable think by default and the thinking counts against max_tokens: leave room for the answer.
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: outputBudget(options.maxTokens ?? 4096, anthropicThinksByDefault(this.model)),
      messages: userMessages.map(m => ({ role: m.role, content: m.content }))
    };
    if (system) { body.system = system; }
    // Opus 4.7+ and the 5.x family reject sampling parameters with a 400; only older models get temperature.
    if (options.temperature !== undefined && anthropicAcceptsSampling(this.model)) { body.temperature = options.temperature; }

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

    const data = await response.json() as AnthropicResponse;
    if (data.stop_reason === 'refusal') {
      const why = data.stop_details?.category ? ` (${data.stop_details.category})` : '';
      throw new Error(`Anthropic: the model declined this request${why}. Rephrase it or choose another model.`);
    }
    // The first block may be a `thinking` block on models that think by default: read every text block.
    const content = (data.content ?? []).filter(b => b.type === 'text' && typeof b.text === 'string').map(b => b.text).join('');
    if (!content && data.stop_reason === 'max_tokens') {
      throw new Error('Anthropic: the output limit was reached before any answer was written. Raise "Max output tokens" in Settings.');
    }
    return {
      content,
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
