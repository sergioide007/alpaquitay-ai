import { IntegrationRegistry } from '../../../integrations/IntegrationRegistry';
import { IIntegration, IntegrationMetadata } from '../../../integrations/interfaces';
import { HybridConfig, HYBRID_DEFAULTS } from '../../../integrations/IntegrationConfig';
import { SecretVault } from '../../../secrets/SecretVault';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockStorage() {
  return {
    get: jest.fn().mockResolvedValue(undefined),
    store: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  } as never;
}

function makeConfig(overrides: Partial<HybridConfig['integrations']> = {}): HybridConfig {
  return {
    ...HYBRID_DEFAULTS,
    enabled: true,
    integrations: { ...HYBRID_DEFAULTS.integrations, ...overrides },
  };
}

class FakeIntegration implements IIntegration {
  readonly metadata: IntegrationMetadata;
  initCount = 0;
  disposeCount = 0;
  availableResult = true;

  constructor(id: string, requiredSecrets: string[] = []) {
    this.metadata = { id, name: id, category: 'llm', description: '', requiredSecrets };
  }

  async initialize(_vault: SecretVault): Promise<void> { this.initCount++; }
  async dispose(): Promise<void> { this.disposeCount++; }
  async isAvailable(): Promise<boolean> { return this.availableResult; }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('IntegrationRegistry', () => {
  it('activates only enabled integrations', async () => {
    const cfg = makeConfig({ cline: true, langchain: false });
    const registry = new IntegrationRegistry(mockStorage(), cfg);

    const cline = new FakeIntegration('cline');
    const langchain = new FakeIntegration('langchain');
    registry.register(cline).register(langchain);

    const result = await registry.activate();

    expect(result.loaded).toContain('cline');
    expect(result.skipped).toContain('langchain');
    expect(cline.initCount).toBe(1);
    expect(langchain.initCount).toBe(0);
  });

  it('records errors for integrations that fail to initialize', async () => {
    const cfg = makeConfig({ cline: true });
    const registry = new IntegrationRegistry(mockStorage(), cfg);

    const broken = new FakeIntegration('cline');
    jest.spyOn(broken, 'initialize').mockRejectedValue(new Error('connect failed'));
    registry.register(broken);

    const result = await registry.activate();
    expect(result.errors['cline']).toContain('connect failed');
    expect(registry.isActive('cline')).toBe(false);
  });

  it('deactivate() disposes all active integrations', async () => {
    const cfg = makeConfig({ cline: true });
    const registry = new IntegrationRegistry(mockStorage(), cfg);
    const cline = new FakeIntegration('cline');
    registry.register(cline);
    await registry.activate();
    await registry.deactivate();
    expect(cline.disposeCount).toBe(1);
    expect(registry.isActive('cline')).toBe(false);
  });

  it('throws when registering the same id twice', () => {
    const cfg = makeConfig();
    const registry = new IntegrationRegistry(mockStorage(), cfg);
    registry.register(new FakeIntegration('cline'));
    expect(() => registry.register(new FakeIntegration('cline'))).toThrow();
  });

  it('get<T>() returns undefined for inactive integration', async () => {
    const cfg = makeConfig({ cline: false });
    const registry = new IntegrationRegistry(mockStorage(), cfg);
    registry.register(new FakeIntegration('cline'));
    await registry.activate();
    expect(registry.get('cline')).toBeUndefined();
  });

  it('byCategory() filters by integration category', async () => {
    const cfg = makeConfig({ vortex: true });
    const registry = new IntegrationRegistry(mockStorage(), cfg);
    const streaming = new FakeIntegration('vortex');
    (streaming.metadata as IntegrationMetadata & { category: string }).category = 'streaming';
    registry.register(streaming);
    await registry.activate();
    expect(registry.byCategory('streaming')).toHaveLength(1);
    expect(registry.byCategory('knowledge')).toHaveLength(0);
  });
});
