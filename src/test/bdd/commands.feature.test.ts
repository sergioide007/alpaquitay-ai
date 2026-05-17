/**
 * BDD Feature: Extension Commands — Alpaquitay Hub v2
 *
 * Tests for the two registered commands: alpaquitay-ai.open and
 * alpaquitay-ai.configureProvider. Provider and skill orchestration
 * is tested here at the integration level with mocked VS Code API.
 */

import { SkillRegistry } from '../../skills/SkillRegistry';
import { CreateFileSkill } from '../../skills/built-in/CreateFileSkill';
import { RefactorSkill } from '../../skills/built-in/RefactorSkill';
import { GenerateTestsSkill } from '../../skills/built-in/GenerateTestsSkill';
import { AIProviderManager } from '../../providers/AIProviderManager';
import { SecretManager } from '../../core/SecretManager';
import { MCPManager } from '../../mcp/MCPManager';
import { AIProvider } from '../../core/interfaces';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAI(available = true): jest.Mocked<AIProvider> {
  return {
    name: 'TestAI',
    type: 'anthropic',
    modelName: 'mock-model',
    isAvailable: jest.fn().mockResolvedValue(available),
    chat: jest.fn().mockResolvedValue({ content: 'AI response', model: 'test', usage: { promptTokens: 5, completionTokens: 10 } }),
    complete: jest.fn().mockResolvedValue('export class Foo {}')
  };
}

function makeSecrets(keys: Record<string, string | undefined> = {}): SecretManager {
  return {
    getApiKey: jest.fn(async (p: string) => keys[p]),
    setApiKey: jest.fn().mockResolvedValue(undefined),
    deleteApiKey: jest.fn().mockResolvedValue(undefined),
    hasApiKey: jest.fn(async (p: string) => Boolean(keys[p]))
  } as unknown as SecretManager;
}

function makeAIManager(provider: jest.Mocked<AIProvider> | null = null): AIProviderManager {
  const mgr = new AIProviderManager(makeSecrets());
  if (provider) { mgr.registerProvider(provider); }
  Object.defineProperty(mgr, 'activeProvider', { value: provider, writable: true });
  return mgr;
}

function makeMCP(): MCPManager {
  const mcp = new MCPManager();
  // Mock executeTool so skills don't need real MCP servers
  (mcp as unknown as Record<string, jest.Mock>).executeTool = jest.fn().mockResolvedValue({ content: 'file content' });
  return mcp;
}

// ── Feature: Skills execute via SkillRegistry ─────────────────────────────────

describe('Feature: SkillRegistry executes built-in skills', () => {
  let registry: SkillRegistry;
  let mcp: MCPManager;

  beforeEach(() => {
    registry = new SkillRegistry();
    registry.register(new CreateFileSkill());
    registry.register(new RefactorSkill());
    registry.register(new GenerateTestsSkill());
    mcp = makeMCP();
  });

  it('Given an available AI provider, When create-file skill executes, Then it returns success', async () => {
    const ai = makeAI();
    const result = await registry.execute('create-file', {
      ai, mcp, workspace: '/tmp', parameters: { path: 'src/Foo.ts', description: 'A simple class' }
    });
    expect(result.success).toBe(true);
  });

  it('Given an available AI provider, When refactor skill executes, Then it returns success', async () => {
    const ai = makeAI();
    const result = await registry.execute('refactor', {
      ai, mcp, workspace: '/tmp', parameters: { path: 'src/Foo.ts', goal: 'Apply SOLID' }
    });
    expect(result.success).toBe(true);
  });

  it('Given an available AI provider, When generate-tests skill executes, Then it returns success', async () => {
    const ai = makeAI();
    const result = await registry.execute('generate-tests', {
      ai, mcp, workspace: '/tmp', parameters: { path: 'src/Foo.ts' }
    });
    expect(result.success).toBe(true);
  });

  it('Given an unknown skill id, When executed, Then it returns failure', async () => {
    const ai = makeAI();
    const result = await registry.execute('nonexistent-skill', {
      ai, mcp, workspace: '/tmp', parameters: {}
    });
    expect(result.success).toBe(false);
    expect(result.errors?.length).toBeGreaterThan(0);
  });
});

// ── Feature: AIProviderManager selects active provider ────────────────────────

describe('Feature: AIProviderManager provider selection', () => {
  it('Given a registered available provider, When getActive is called, Then it returns the provider', () => {
    const ai = makeAI(true);
    const mgr = makeAIManager(ai);
    expect(mgr.getActive()).toBe(ai);
  });

  it('Given no registered provider, When getActive is called, Then it returns null', () => {
    const mgr = makeAIManager(null);
    expect(mgr.getActive()).toBeNull();
  });

  it('Given an available provider, When chat is called, Then AI provider receives the message', async () => {
    const ai = makeAI(true);
    const mgr = makeAIManager(ai);
    const response = await mgr.chat([{ role: 'user', content: 'Hello' }]);
    expect(ai.chat).toHaveBeenCalledWith(
      [{ role: 'user', content: 'Hello' }],
      expect.objectContaining({ maxTokens: expect.any(Number), temperature: expect.any(Number) })
    );
    expect(response.content).toBe('AI response');
  });

  it('Given no active provider, When complete is called, Then it throws an error', async () => {
    const mgr = makeAIManager(null);
    await expect(mgr.complete('test prompt')).rejects.toThrow();
  });
});
