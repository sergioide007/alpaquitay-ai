import { AIProvider, AIResponse, ChatOptions, Message } from '../core/interfaces';
import type { LocalEngineApi } from './LocalEngineHost';
import type { ProgressCallback } from './LocalEngineHost';
import type { LocalEngineSettings } from './protocol';

export type LocalProgressRunner = <T>(modelName: string, run: (onProgress: ProgressCallback) => Promise<T>) => Promise<T>;

/**
 * On-device provider: a small ONNX language model running in WebGPU/Wasm inside a Webview.
 * Weights are downloaded once from the static CDN; prompts and answers never leave the machine.
 */
export class LocalGemmaProvider implements AIProvider {
  readonly name = 'Alpaquitay AI · Qwen 2.5 local';
  readonly type = 'local-wasm' as const;
  get modelName(): string { return this.settings().modelId; }

  constructor(
    private readonly engine: LocalEngineApi,
    private readonly settings: () => LocalEngineSettings,
    private readonly runWithProgress?: LocalProgressRunner,
  ) {}

  /** Opt-in only: a first run downloads hundreds of MB, so it must never start by surprise. */
  async isAvailable(): Promise<boolean> {
    return this.settings().enabled;
  }

  async chat(messages: Message[], options: ChatOptions = {}): Promise<AIResponse> {
    const s = this.settings();
    const all: Message[] = options.systemPrompt
      ? [{ role: 'system', content: options.systemPrompt }, ...messages]
      : messages;
    const generate = (onProgress?: ProgressCallback) => this.engine.generate(s, {
      messages: all.map(m => ({ role: m.role, content: m.content })),
      maxNewTokens: options.maxTokens,
      temperature: options.temperature,
    }, onProgress);
    const r = options.onProgress || !this.runWithProgress
      ? await generate(options.onProgress)
      : await this.runWithProgress(s.modelId, generate);
    return {
      content: r.text,
      model: s.modelId,
      usage: {
        promptTokens: Math.ceil(all.reduce((n, m) => n + m.content.length, 0) / 4),
        completionTokens: r.newTokens,
      },
    };
  }

  async complete(prompt: string, options: ChatOptions = {}): Promise<string> {
    return (await this.chat([{ role: 'user', content: prompt }], options)).content;
  }
}
