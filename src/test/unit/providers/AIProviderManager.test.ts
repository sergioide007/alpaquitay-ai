import { AIProviderManager } from '../../../providers/AIProviderManager';
import { SecretManager } from '../../../core/SecretManager';
import { AIProvider, ProviderType } from '../../../core/interfaces';
import { PrivacyBoundaryProvider } from '../../../providers/PrivacyBoundaryProvider';
import * as vscode from 'vscode';

function makeProvider(type: ProviderType, available = false): jest.Mocked<AIProvider> {
  return {
    name: `Mock ${type}`,
    type,
    modelName: 'mock-model',
    isAvailable: jest.fn().mockResolvedValue(available),
    chat: jest.fn().mockResolvedValue({ content: 'ok', model: type, usage: { promptTokens: 1, completionTokens: 1 } }),
    complete: jest.fn().mockResolvedValue('completed text')
  };
}

function makeSecrets(keys: Record<string, string | undefined> = {}): SecretManager {
  return {
    getApiKey: jest.fn(async (provider: string) => keys[provider]),
    setApiKey: jest.fn().mockResolvedValue(undefined),
    deleteApiKey: jest.fn().mockResolvedValue(undefined),
    hasApiKey: jest.fn(async (provider: string) => Boolean(keys[provider]))
  } as unknown as SecretManager;
}

beforeEach(() => {
  jest.clearAllMocks();
  (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
    get: jest.fn((key: string, defaultValue?: unknown) => {
      const cfg: Record<string, unknown> = {
        'preferredProvider': 'auto',
        'maxTokens': 4096,
        'temperature': 0.3,
        'requestTimeout': 120000,
        'anthropic.baseUrl': 'https://api.anthropic.com/v1',
        'anthropic.model': 'claude-sonnet-4-6',
        'openai.baseUrl': 'https://api.openai.com/v1',
        'openai.model': 'gpt-4o',
        'ollama.endpoint': 'http://localhost:11434',
        'ollama.model': 'codellama',
        'lmstudio.endpoint': 'http://localhost:1234',
        'skill.maxParallel': 3
      };
      return key in cfg ? cfg[key] : defaultValue;
    }),
    update: jest.fn().mockResolvedValue(undefined)
  });
});

describe('AIProviderManager', () => {
  describe('getActive() before initialization', () => {
    it('Returns null before initialize() is called', () => {
      const mgr = new AIProviderManager(makeSecrets());
      expect(mgr.getActive()).toBeNull();
    });
  });

  describe('initialize() with no available providers', () => {
    it('When no provider is reachable, Then getActive() returns null', async () => {
      const mgr = new AIProviderManager(makeSecrets());
      // All providers unavailable by default (network mocked globally)
      // We need to stub fetch globally to fail
      global.fetch = jest.fn().mockRejectedValue(new Error('network unavailable'));
      await mgr.initialize();
      expect(mgr.getActive()).toBeNull();
    });
  });

  describe('registerProvider()', () => {
    it('When a custom cloud provider is registered, Then getActive returns its protected facade', async () => {
      const mgr = new AIProviderManager(makeSecrets());
      const custom = makeProvider('anthropic', true);
      mgr.registerProvider(custom);
      await mgr.switchProvider('anthropic');
      expect(mgr.getActive()).toBeInstanceOf(PrivacyBoundaryProvider);
      expect(mgr.getActive()).toMatchObject({ type: custom.type, name: custom.name });
    });
  });

  describe('chat()', () => {
    it('When an active provider is set, Then delegates to provider.chat()', async () => {
      const mgr = new AIProviderManager(makeSecrets());
      const provider = makeProvider('anthropic', true);
      mgr.registerProvider(provider);
      await mgr.switchProvider('anthropic');
      const messages = [{ role: 'user' as const, content: 'hello' }];
      await mgr.chat(messages);
      expect(provider.chat).toHaveBeenCalledWith(
        messages,
        expect.objectContaining({ maxTokens: 4096, temperature: 0.3 })
      );
    });

    it('When no active provider, Then throws with descriptive message', async () => {
      const mgr = new AIProviderManager(makeSecrets());
      await expect(mgr.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow('No AI provider');
    });
  });

  describe('complete()', () => {
    it('When an active provider is set, Then delegates to provider.complete()', async () => {
      const mgr = new AIProviderManager(makeSecrets());
      const provider = makeProvider('openai', true);
      mgr.registerProvider(provider);
      await mgr.switchProvider('openai');
      await mgr.complete('Generate a function');
      expect(provider.complete).toHaveBeenCalledWith(
        'Generate a function',
        expect.objectContaining({ maxTokens: 4096, temperature: 0.3 })
      );
    });

    it('When no active provider, Then throws with descriptive message', async () => {
      const mgr = new AIProviderManager(makeSecrets());
      await expect(mgr.complete('test')).rejects.toThrow('No AI provider');
    });
  });

  describe('switchProvider()', () => {
    it('When switching to an unavailable provider, Then throws', async () => {
      const mgr = new AIProviderManager(makeSecrets());
      const provider = makeProvider('anthropic', false);
      mgr.registerProvider(provider);
      await expect(mgr.switchProvider('anthropic')).rejects.toThrow("'anthropic'");
    });

    it('When switching to an available cloud provider, Then getActive() returns its protected facade', async () => {
      const mgr = new AIProviderManager(makeSecrets());
      const provider = makeProvider('anthropic', true);
      mgr.registerProvider(provider);
      await mgr.switchProvider('anthropic');
      expect(mgr.getActive()).toBeInstanceOf(PrivacyBoundaryProvider);
      expect(mgr.getActive()).toMatchObject({ type: provider.type, name: provider.name });
    });
  });

  describe('privacy boundary', () => {
    it('Protects direct calls made through getActive() and exposes value-free disclosure metadata', async () => {
      const mgr = new AIProviderManager(makeSecrets());
      const provider = makeProvider('openai', true);
      mgr.registerProvider(provider);
      await mgr.switchProvider('openai');

      await mgr.getActive()!.complete('Email owner@example.com; token=abcdefghijklmnop');

      const transmittedPrompt = provider.complete.mock.calls[0][0];
      expect(transmittedPrompt).not.toContain('owner@example.com');
      expect(transmittedPrompt).not.toContain('abcdefghijklmnop');
      expect(mgr.getLastPrivacyDisclosure()).toMatchObject({
        providerType: 'openai',
        operation: 'complete',
        destination: 'cloud',
        sanitized: true,
      });
      expect(JSON.stringify(mgr.getLastPrivacyDisclosure())).not.toContain('owner@example.com');
    });

    it('Leaves a registered local provider undecorated', async () => {
      const mgr = new AIProviderManager(makeSecrets());
      const provider = makeProvider('ollama', true);
      mgr.registerProvider(provider);
      await mgr.switchProvider('ollama');

      expect(mgr.getActive()).toBe(provider);
      await mgr.getActive()!.complete('Email owner@example.com');
      expect(provider.complete).toHaveBeenCalledWith('Email owner@example.com');
      expect(mgr.getLastPrivacyDisclosure()).toBeNull();
    });
  });

  describe('getProviderInfo()', () => {
    it('Returns info for all registered providers with availability and locality', async () => {
      const mgr = new AIProviderManager(makeSecrets());
      const local = makeProvider('ollama', true);
      const cloud = makeProvider('anthropic', false);
      mgr.registerProvider(local);
      mgr.registerProvider(cloud);
      const infos = await mgr.getProviderInfo();
      const ollamaInfo = infos.find(i => i.type === 'ollama')!;
      const anthropicInfo = infos.find(i => i.type === 'anthropic')!;
      expect(ollamaInfo.available).toBe(true);
      expect(ollamaInfo.isLocal).toBe(true);
      expect(anthropicInfo.available).toBe(false);
      expect(anthropicInfo.isLocal).toBe(false);
    });
  });
});
