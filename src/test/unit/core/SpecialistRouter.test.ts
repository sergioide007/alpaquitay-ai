import type { AIProvider, MCPExecutor } from '../../../core/interfaces';
import { SpecialistRouter } from '../../../core/reception/SpecialistRouter';

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
}));

function makeProvider(response: object): AIProvider {
  return {
    name: 'Mock provider',
    type: 'anthropic',
    modelName: 'mock-specialist-model',
    isAvailable: jest.fn().mockResolvedValue(true),
    chat: jest.fn().mockRejectedValue(new Error('Generic chat must not be used')),
    complete: jest.fn().mockResolvedValue(JSON.stringify(response)),
  };
}

function makeMcp(): MCPExecutor {
  return {
    executeTool: jest.fn(async (_serverId, toolName, params) => {
      if (toolName === 'list_files') {
        return [
          { name: 'package.json', isDirectory: false },
          { name: 'src', isDirectory: true },
        ];
      }
      if (toolName === 'read_file' && params.path === 'package.json') {
        return {
          content: JSON.stringify({
            dependencies: { react: '^18.0.0' },
            devDependencies: { typescript: '^5.0.0' },
          }),
        };
      }
      throw new Error('File not found');
    }),
  };
}

describe('SpecialistRouter', () => {
  it('routes DORA prompts through the registered DevOps shell, not generic chat', async () => {
    const mcp = makeMcp();
    const provider = makeProvider({
      performanceTier: 'elite',
      improvements: ['Reduce change lead time'],
    });
    const router = new SpecialistRouter(mcp, '/tmp/alpaquitay-specialist-test');

    const result = await router.route(
      'Assess our DORA metrics and change failure rate for the current service.',
      provider,
    );

    expect(result.handled).toBe(true);
    expect(result.success).toBe(true);
    expect(result.specialistId).toBe('devops');
    expect(result.useCaseId).toBe('assess-dora');
    expect(result.reasons.join(' ')).toMatch(/DORA metrics/i);
    expect(result.answer).toContain('"performanceTier": "elite"');
    expect(provider.complete).toHaveBeenCalledTimes(1);
    expect(provider.chat).not.toHaveBeenCalled();
    expect((provider.complete as jest.Mock).mock.calls[0][0]).toContain('Assess DORA metrics');
    expect((provider.complete as jest.Mock).mock.calls[0][0]).toContain('React + Vite');
    expect(mcp.executeTool).toHaveBeenCalled();
  });

  it('declines ordinary chat without calling MCP or either provider API', async () => {
    const mcp = makeMcp();
    const provider = makeProvider({});
    const router = new SpecialistRouter(mcp, '/tmp/alpaquitay-specialist-test');

    const result = await router.route('Hello, how are you today?', provider);

    expect(result.handled).toBe(false);
    expect(result.specialistId).toBeNull();
    expect(result.answer).toBe('');
    expect(provider.complete).not.toHaveBeenCalled();
    expect(provider.chat).not.toHaveBeenCalled();
    expect(mcp.executeTool).not.toHaveBeenCalled();
  });

  it('redacts PII before the selected Security shell invokes the provider', async () => {
    const mcp = makeMcp();
    const provider = makeProvider({
      classification: 'security incident',
      containmentActions: ['Disable affected account'],
    });
    const router = new SpecialistRouter(mcp, '/tmp/alpaquitay-specialist-test');

    const result = await router.route(
      'Create an incident response for a breach involving alice@example.com.',
      provider,
    );

    const providerPrompt = (provider.complete as jest.Mock).mock.calls[0][0] as string;
    expect(result.specialistId).toBe('security');
    expect(result.useCaseId).toBe('respond-incident');
    expect(result.privacyRedacted).toBe(true);
    expect(providerPrompt).toContain('[EMAIL_0]');
    expect(providerPrompt).not.toContain('alice@example.com');
    expect(result.reasons.join(' ')).not.toContain('alice@example.com');
  });

  it('reinitializes a cached specialist when the active AI provider changes', async () => {
    const router = new SpecialistRouter(makeMcp(), '/tmp/alpaquitay-specialist-test');
    const firstProvider = makeProvider({ performanceTier: 'high' });
    const secondProvider = makeProvider({ performanceTier: 'elite' });

    await router.route('Assess DORA metrics.', firstProvider);
    const result = await router.route('Assess DORA metrics again.', secondProvider);

    expect(firstProvider.complete).toHaveBeenCalledTimes(1);
    expect(secondProvider.complete).toHaveBeenCalledTimes(1);
    expect(result.answer).toContain('"performanceTier": "elite"');
  });

  it('uses catalog capabilities for specialist intents without a hard-coded hint', () => {
    const router = new SpecialistRouter(makeMcp(), '/tmp/alpaquitay-specialist-test');

    const selection = router.select('Define quarterly OKRs for the product team mission.');

    expect(selection?.specialistId).toBe('business');
    expect(selection?.useCaseId).toBe('define-okrs');
  });
});
