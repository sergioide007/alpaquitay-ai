import { SkillRegistry } from '../../../skills/SkillRegistry';
import { Skill, SkillContext } from '../../../core/interfaces';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSkill(id: string, name = `Skill ${id}`): jest.Mocked<Skill> {
  return {
    id,
    name,
    description: `Description for ${id}`,
    execute: jest.fn().mockResolvedValue({ success: true, output: { id } })
  };
}

function makeContext(overrides: Partial<SkillContext> = {}): SkillContext {
  return {
    ai: {
      name: 'MockAI',
      type: 'anthropic',
      modelName: 'mock-model',
      isAvailable: jest.fn().mockResolvedValue(true),
      chat: jest.fn().mockResolvedValue({ content: 'ok', model: 'test', usage: { promptTokens: 0, completionTokens: 0 } }),
      complete: jest.fn().mockResolvedValue('generated code')
    },
    mcp: { executeTool: jest.fn().mockResolvedValue({ content: 'file content' }) },
    workspace: '/workspace',
    parameters: {},
    ...overrides
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SkillRegistry', () => {
  describe('Given an empty registry', () => {
    let registry: SkillRegistry;

    beforeEach(() => { registry = new SkillRegistry(undefined); });

    it('When listing skills, Then returns an empty array', () => {
      expect(registry.list()).toEqual([]);
    });

    it('When getting a non-existent id, Then returns undefined', () => {
      expect(registry.get('missing')).toBeUndefined();
    });

    it('When executing a missing skill, Then returns success=false with descriptive error', async () => {
      const result = await registry.execute('missing', makeContext());
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain("'missing'");
    });
  });

  describe('Given a registry with registered skills', () => {
    let registry: SkillRegistry;
    let skillA: jest.Mocked<Skill>;
    let skillB: jest.Mocked<Skill>;

    beforeEach(() => {
      registry = new SkillRegistry(undefined);
      skillA = makeSkill('create-file', 'Create File');
      skillB = makeSkill('refactor', 'Refactor Code');
      registry.register(skillA);
      registry.register(skillB);
    });

    it('When listing, Then returns all registered skills in insertion order', () => {
      const ids = registry.list().map(s => s.id);
      expect(ids).toEqual(['create-file', 'refactor']);
    });

    it('When getting by id, Then returns the correct skill instance', () => {
      expect(registry.get('create-file')).toBe(skillA);
      expect(registry.get('refactor')).toBe(skillB);
    });

    it('When executing a registered skill, Then calls skill.execute with enriched context containing spawn+config', async () => {
      const ctx = makeContext();
      const result = await registry.execute('create-file', ctx);
      expect(skillA.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          ai: ctx.ai,
          mcp: ctx.mcp,
          workspace: ctx.workspace,
          parameters: ctx.parameters,
          spawn: expect.any(Function),
          config: expect.anything()
        })
      );
      expect(result.success).toBe(true);
    });

    it('When skill.execute throws an Error, Then returns success=false with message', async () => {
      skillA.execute.mockRejectedValueOnce(new Error('skill crashed'));
      const result = await registry.execute('create-file', makeContext());
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toBe('skill crashed');
    });

    it('When skill.execute throws a non-Error, Then coerces it to string', async () => {
      skillA.execute.mockRejectedValueOnce('boom');
      const result = await registry.execute('create-file', makeContext());
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toBe('boom');
    });

    it('When registering an existing id, Then overwrites the previous skill', () => {
      const replacement = makeSkill('create-file', 'Create File v2');
      registry.register(replacement);
      expect(registry.get('create-file')).toBe(replacement);
      expect(registry.list()).toHaveLength(2);
    });
  });
});