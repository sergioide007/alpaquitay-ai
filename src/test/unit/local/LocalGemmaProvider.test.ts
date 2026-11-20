import { LocalGemmaProvider, LocalProgressRunner } from '../../../local/LocalGemmaProvider';
import type { LocalEngineApi } from '../../../local/LocalEngineHost';
import { AIProviderManager } from '../../../providers/AIProviderManager';
import { isLocalAIProvider, PrivacyBoundaryProvider } from '../../../providers/PrivacyBoundaryProvider';

import { settings } from './fixtures';

function fakeEngine(): LocalEngineApi & { generate: jest.Mock } {
  return {
    probe: jest.fn().mockResolvedValue({ webgpu: true, shaderF16: true, cached: true, manifest: {} }),
    generate: jest.fn().mockResolvedValue({ text: 'respuesta local', device: 'webgpu', newTokens: 12 }),
    clearCache: jest.fn().mockResolvedValue({ files: 0, bytes: 0 }),
  } as unknown as LocalEngineApi & { generate: jest.Mock };
}

describe('LocalGemmaProvider', () => {
  it('is opt-in: unavailable until localEngine.enabled', async () => {
    expect(await new LocalGemmaProvider(fakeEngine(), () => settings({ enabled: false })).isAvailable()).toBe(false);
    expect(await new LocalGemmaProvider(fakeEngine(), () => settings({ enabled: true })).isAvailable()).toBe(true);
  });

  it('chat forwards messages (system prompt first) and maps the response', async () => {
    const engine = fakeEngine();
    const p = new LocalGemmaProvider(engine, () => settings());
    const onProgress = jest.fn();
    const res = await p.chat([{ role: 'user', content: 'hola' }], { systemPrompt: 'Sé breve', maxTokens: 256, temperature: 0.1, onProgress });
    expect(engine.generate).toHaveBeenCalledWith(settings(), {
      messages: [{ role: 'system', content: 'Sé breve' }, { role: 'user', content: 'hola' }],
      maxNewTokens: 256, temperature: 0.1,
    }, onProgress);
    expect(res).toMatchObject({ content: 'respuesta local', model: 'gemma-4-e2b-it' });
    expect(res.usage.completionTokens).toBe(12);
  });

  it('complete returns the text', async () => {
    expect(await new LocalGemmaProvider(fakeEngine(), () => settings()).complete('x')).toBe('respuesta local');
  });

  it('uses the shared progress surface for calls without a caller progress callback', async () => {
    const engine = fakeEngine();
    let progressCallback: ((stage: string, pct: number) => void) | undefined;
    const runWithProgress = jest.fn(async (_model: string, run: (onProgress: (stage: string, pct: number) => void) => Promise<unknown>) => {
      const onProgress = jest.fn();
      progressCallback = onProgress;
      return run(onProgress);
    }) as unknown as jest.Mock & LocalProgressRunner;
    const p = new LocalGemmaProvider(engine, () => settings(), runWithProgress);

    await p.complete('genera una función');

    expect(runWithProgress).toHaveBeenCalledWith('gemma-4-e2b-it', expect.any(Function));
    expect(engine.generate).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.any(Function));
    expect(progressCallback).toBeDefined();
  });

  it('is treated as local by the privacy boundary (never wrapped as cloud)', () => {
    const p = new LocalGemmaProvider(fakeEngine(), () => settings());
    expect(p.type).toBe('local-wasm');
    expect(isLocalAIProvider(p)).toBe(true);
    expect(p instanceof PrivacyBoundaryProvider).toBe(false);
  });
});

describe('AIProviderManager + local-wasm', () => {
  const secrets = { getApiKey: jest.fn().mockResolvedValue(undefined) } as never;
  const config = (preferred: string, local: ReturnType<typeof settings>) => ({
    ollamaEndpoint: 'http://localhost:1', ollamaModel: 'm', lmstudioEndpoint: 'http://localhost:2', requestTimeout: 1000,
    anthropicModel: 'x', anthropicBaseUrl: 'https://a', openaiModel: 'y', openaiBaseUrl: 'https://o',
    preferredProvider: preferred, maxTokens: 100, temperature: 0.2, localEngine: local,
  }) as never;

  beforeEach(() => { (global as { fetch: unknown }).fetch = jest.fn().mockRejectedValue(new Error('offline')); });

  it('selects the local engine when explicitly preferred and enabled', async () => {
    const m = new AIProviderManager(secrets, config('local-wasm', settings()));
    m.setLocalEngine(fakeEngine());
    await m.initialize();
    expect(m.getActive()?.type).toBe('local-wasm');
    expect((await m.getProviderInfo()).find(i => i.type === 'local-wasm')).toMatchObject({ available: true, isLocal: true });
  });

  it('auto falls back to the local engine when Ollama/LM Studio are down and it is enabled', async () => {
    const m = new AIProviderManager(secrets, config('auto', settings()));
    m.setLocalEngine(fakeEngine());
    await m.initialize();
    expect(m.getActive()?.type).toBe('local-wasm');
  });

  it('is never auto-selected while disabled', async () => {
    const m = new AIProviderManager(secrets, config('auto', settings({ enabled: false })));
    m.setLocalEngine(fakeEngine());
    await m.initialize();
    expect(m.getActive()).toBeNull();
  });

  it('is not registered when no engine is wired in', async () => {
    const m = new AIProviderManager(secrets, config('auto', settings()));
    await m.initialize();
    expect((await m.getProviderInfo()).some(i => i.type === 'local-wasm')).toBe(false);
  });
});
