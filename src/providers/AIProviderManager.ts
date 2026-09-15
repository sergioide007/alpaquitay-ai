import * as vscode from 'vscode';
import { AIProvider, ProviderType, ProviderInfo, Message, AIResponse, ChatOptions } from '../core/interfaces';
import { AlpaquitayConfig } from '../core/config';
import { SecretManager } from '../core/SecretManager';
import { AnthropicProvider } from './AnthropicProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { OllamaProvider } from './OllamaProvider';
import { LMStudioProvider } from './LMStudioProvider';
import { ILLMIntegration, IObservabilityIntegration } from '../integrations/interfaces';
import {
  isLocalAIProvider,
  isLoopbackAIEndpoint,
  PrivacyBoundaryProvider,
  PrivacyDisclosure,
  ProviderDestination,
  withPrivacyBoundary,
} from './PrivacyBoundaryProvider';

export class AIProviderManager {
  private providers: Map<ProviderType, AIProvider> = new Map();
  private providerDestinations: Map<ProviderType, ProviderDestination> = new Map();
  private activeProvider: AIProvider | null = null;
  private readonly config: AlpaquitayConfig;

  // ── Hybrid integration hooks ──────────────────────────────────────────────
  /** When set, LLM calls are routed through this integration instead of the core provider */
  private hybridLLM: ILLMIntegration | null = null;
  /** When set, every LLM call is automatically traced */
  private tracer: IObservabilityIntegration | null = null;

  constructor(
    private readonly secrets: SecretManager,
    config?: AlpaquitayConfig
  ) {
    this.config = config ?? new AlpaquitayConfig();
  }

  /** Wire in a hybrid LLM integration (Cline or LangChain) */
  setHybridLLM(integration: ILLMIntegration | null): void {
    this.hybridLLM = integration;
  }

  /** Wire in an observability tracer (LangSmith) */
  setTracer(integration: IObservabilityIntegration | null): void {
    this.tracer = integration;
  }

  async initialize(): Promise<void> {
    const cfg = this.config;

    const ollama = new OllamaProvider(cfg.ollamaEndpoint, cfg.ollamaModel, cfg.requestTimeout);
    const lmstudio = new LMStudioProvider(cfg.lmstudioEndpoint, cfg.requestTimeout);
    this.registerProvider(ollama, isLoopbackAIEndpoint(cfg.ollamaEndpoint) ? 'local' : 'cloud');
    this.registerProvider(lmstudio, isLoopbackAIEndpoint(cfg.lmstudioEndpoint) ? 'local' : 'cloud');

    const anthropicKey = await this.secrets.getApiKey('anthropic');
    if (anthropicKey) {
      this.registerProvider(new AnthropicProvider(
        anthropicKey, cfg.anthropicModel, cfg.anthropicBaseUrl, cfg.requestTimeout
      ));
    }

    const openaiKey = await this.secrets.getApiKey('openai');
    if (openaiKey) {
      this.registerProvider(new OpenAIProvider(
        openaiKey, cfg.openaiModel, cfg.openaiBaseUrl, cfg.requestTimeout
      ));
    }

    await this.selectProvider(cfg.preferredProvider as ProviderType | 'auto');
  }

  private async selectProvider(preferred: ProviderType | 'auto'): Promise<void> {
    if (preferred !== 'auto') {
      const provider = this.providers.get(preferred);
      if (provider && await provider.isAvailable()) {
        this.activeProvider = provider;
        return;
      }
    }

    const priority: ProviderType[] = ['ollama', 'lmstudio', 'anthropic', 'openai'];
    const checks = await Promise.all(
      priority.map(async (type) => {
        const provider = this.providers.get(type);
        const available = provider ? await provider.isAvailable() : false;
        return { type, provider, available };
      })
    );

    for (const { provider, available } of checks) {
      if (available && provider) {
        this.activeProvider = provider;
        return;
      }
    }

    this.activeProvider = null;
  }

  getActive(): AIProvider | null {
    return this.activeProvider;
  }

  /** Value-free metadata for the most recent request to the active cloud provider. */
  getLastPrivacyDisclosure(): PrivacyDisclosure | null {
    return this.activeProvider instanceof PrivacyBoundaryProvider
      ? this.activeProvider.getLastDisclosure()
      : null;
  }

  async getProviderInfo(): Promise<ProviderInfo[]> {
    const infos: ProviderInfo[] = [];
    for (const [type, provider] of this.providers) {
      infos.push({
        type,
        name: provider.name,
        available: await provider.isAvailable(),
        isLocal: this.providerDestinations.get(type) === 'local'
      });
    }
    return infos;
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<AIResponse> {
    if (!this.activeProvider) {
      throw new Error(
        'No AI provider available. Start Ollama or LM Studio locally, or configure an API key (Anthropic/OpenAI). Then run "Alpaquitay AI: Refresh Providers".'
      );
    }
    const merged: ChatOptions = {
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      ...options
    };
    return this.activeProvider.chat(messages, merged);
  }

  async complete(prompt: string, options?: ChatOptions): Promise<string> {
    const merged: ChatOptions = {
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      ...options,
    };

    const run = async (): Promise<string> => {
      // Hybrid routing: prefer the integration LLM if configured
      const hybridLLM = this.hybridLLM;
      if (hybridLLM && await hybridLLM.isAvailable()) {
        if (this.activeProvider instanceof PrivacyBoundaryProvider) {
          return this.activeProvider.completeThrough(
            prompt,
            merged,
            (sanitizedPrompt, sanitizedOptions) => hybridLLM.complete(sanitizedPrompt, sanitizedOptions)
          );
        }
        return hybridLLM.complete(prompt, merged);
      }
      if (!this.activeProvider) {
        throw new Error(
          'No AI provider available. Start Ollama or LM Studio locally, or configure an API key (Anthropic/OpenAI). Then run "Alpaquitay AI: Refresh Providers".'
        );
      }
      return this.activeProvider.complete(prompt, merged);
    };

    // Observability: trace when a tracer is wired in
    if (this.tracer) {
      return this.tracer.traced('complete', { promptLength: prompt.length }, run);
    }
    return run();
  }

  async switchProvider(type: ProviderType): Promise<void> {
    await this.selectProvider(type);
    if (!this.activeProvider) {
      throw new Error(`Provider '${type}' is not available or not configured.`);
    }
  }

  registerProvider(provider: AIProvider, destination?: ProviderDestination): void {
    const resolvedDestination = destination
      ?? (provider instanceof PrivacyBoundaryProvider || !isLocalAIProvider(provider) ? 'cloud' : 'local');
    this.providerDestinations.set(provider.type, resolvedDestination);
    this.providers.set(provider.type, withPrivacyBoundary(provider, resolvedDestination));
  }

  refreshProviders(): void {
    vscode.commands.executeCommand('alpaquitay-ai.configureProvider');
  }
}
