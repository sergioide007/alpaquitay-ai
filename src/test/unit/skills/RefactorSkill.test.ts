import { RefactorSkill } from '../../../skills/built-in/RefactorSkill';
import { SkillContext } from '../../../core/interfaces';

function makeContext(params: Record<string, unknown> = {}): SkillContext {
  return {
    ai: {
      name: 'MockAI',
      type: 'anthropic',
      modelName: 'mock-model',
      isAvailable: jest.fn().mockResolvedValue(true),
      chat: jest.fn(),
      complete: jest.fn().mockResolvedValue('// refactored code\nexport class FooRefactored {}')
    },
    mcp: {
      executeTool: jest.fn().mockImplementation((server: string, tool: string) => {
        if (tool === 'read_file') {
          return Promise.resolve({ content: '// original code\nexport class Foo {}' });
        }
        return Promise.resolve({ success: true });
      })
    },
    workspace: '/workspace',
    parameters: params
  };
}

describe('RefactorSkill', () => {
  let skill: RefactorSkill;

  beforeEach(() => { skill = new RefactorSkill(); });

  it('Has correct id, name, and description', () => {
    expect(skill.id).toBe('refactor');
    expect(skill.name).toBeTruthy();
    expect(skill.description).toBeTruthy();
  });

  describe('Given a valid file path', () => {
    it('When executed, Then reads the file via MCP filesystem', async () => {
      const ctx = makeContext({ path: 'src/Foo.ts' });
      await skill.execute(ctx);
      expect(ctx.mcp.executeTool).toHaveBeenCalledWith('filesystem', 'read_file', { path: 'src/Foo.ts' });
    });

    it('When executed, Then calls ai.complete with original code in prompt', async () => {
      const ctx = makeContext({ path: 'src/Foo.ts' });
      await skill.execute(ctx);
      const prompt = (ctx.ai.complete as jest.Mock).mock.calls[0][0] as string;
      expect(prompt).toContain('// original code');
      expect(prompt).toContain('src/Foo.ts');
    });

    it('When executed without goal, Then uses default refactoring objective', async () => {
      const ctx = makeContext({ path: 'src/Foo.ts' });
      await skill.execute(ctx);
      const prompt = (ctx.ai.complete as jest.Mock).mock.calls[0][0] as string;
      expect(prompt).toContain('SOLID');
    });

    it('When executed with a custom goal, Then includes that goal in the prompt', async () => {
      const ctx = makeContext({ path: 'src/Foo.ts', goal: 'Remove all magic numbers' });
      await skill.execute(ctx);
      const prompt = (ctx.ai.complete as jest.Mock).mock.calls[0][0] as string;
      expect(prompt).toContain('Remove all magic numbers');
    });

    it('When executed, Then writes refactored code back to the same path', async () => {
      const ctx = makeContext({ path: 'src/Foo.ts' });
      await skill.execute(ctx);
      expect(ctx.mcp.executeTool).toHaveBeenCalledWith('filesystem', 'write_file', {
        path: 'src/Foo.ts',
        content: '// refactored code\nexport class FooRefactored {}'
      });
    });

    it('When executed, Then returns success=true with path and goal', async () => {
      const ctx = makeContext({ path: 'src/Foo.ts', goal: 'Simplify' });
      const result = await skill.execute(ctx);
      expect(result.success).toBe(true);
      const out = result.output as { path: string; goal: string };
      expect(out.path).toBe('src/Foo.ts');
      expect(out.goal).toBe('Simplify');
    });
  });

  describe('Given missing path parameter', () => {
    it('When path is not provided, Then returns success=false without calling AI', async () => {
      const ctx = makeContext({});
      const result = await skill.execute(ctx);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('"path"');
      expect(ctx.ai.complete).not.toHaveBeenCalled();
    });
  });

  describe('Given MCP read failure', () => {
    it('When read_file throws, Then the error propagates as success=false', async () => {
      const ctx = makeContext({ path: 'src/Foo.ts' });
      (ctx.mcp.executeTool as jest.Mock).mockRejectedValueOnce(new Error('file not found'));
      const result = await skill.execute(ctx).catch(e => ({ success: false, errors: [e.message] }));
      expect(result.success).toBe(false);
    });
  });
});