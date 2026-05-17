import { GenerateTestsSkill } from '../../../skills/built-in/GenerateTestsSkill';
import { SkillContext } from '../../../core/interfaces';

function makeContext(params: Record<string, unknown> = {}): SkillContext {
  return {
    ai: {
      name: 'MockAI',
      type: 'anthropic',
      modelName: 'mock-model',
      isAvailable: jest.fn().mockResolvedValue(true),
      chat: jest.fn(),
      complete: jest.fn().mockResolvedValue('describe("Foo", () => { it("works", () => {}) })')
    },
    mcp: {
      executeTool: jest.fn().mockImplementation((_server: string, tool: string) => {
        if (tool === 'read_file') {
          return Promise.resolve({ content: 'export class Foo { bar() { return 42; } }' });
        }
        return Promise.resolve({ success: true });
      })
    },
    workspace: '/workspace',
    parameters: params
  };
}

describe('GenerateTestsSkill', () => {
  let skill: GenerateTestsSkill;

  beforeEach(() => { skill = new GenerateTestsSkill(); });

  it('Has correct id, name, and description', () => {
    expect(skill.id).toBe('generate-tests');
    expect(skill.name).toBeTruthy();
    expect(skill.description).toBeTruthy();
  });

  describe('Given a valid TypeScript file path', () => {
    it('When executed, Then reads the source file via MCP filesystem', async () => {
      const ctx = makeContext({ path: 'src/Foo.ts' });
      await skill.execute(ctx);
      expect(ctx.mcp.executeTool).toHaveBeenCalledWith('filesystem', 'read_file', { path: 'src/Foo.ts' });
    });

    it('When executed without framework param, Then prompt mentions Jest for TS files', async () => {
      const ctx = makeContext({ path: 'src/Foo.ts' });
      await skill.execute(ctx);
      const prompt = (ctx.ai.complete as jest.Mock).mock.calls[0][0] as string;
      expect(prompt.toLowerCase()).toContain('jest');
    });

    it('When executed, Then prompt includes the source code', async () => {
      const ctx = makeContext({ path: 'src/Foo.ts' });
      await skill.execute(ctx);
      const prompt = (ctx.ai.complete as jest.Mock).mock.calls[0][0] as string;
      expect(prompt).toContain('export class Foo');
    });

    it('When executed, Then writes generated tests to the derived test path', async () => {
      const ctx = makeContext({ path: 'src/Foo.ts' });
      await skill.execute(ctx);
      expect(ctx.mcp.executeTool).toHaveBeenCalledWith('filesystem', 'write_file', {
        path: 'src/Foo.test.ts',
        content: expect.stringContaining('describe')
      });
    });

    it('When executed, Then returns success=true with sourcePath, testPath, and framework', async () => {
      const ctx = makeContext({ path: 'src/Foo.ts' });
      const result = await skill.execute(ctx);
      expect(result.success).toBe(true);
      const out = result.output as { sourcePath: string; testPath: string; framework: string };
      expect(out.sourcePath).toBe('src/Foo.ts');
      expect(out.testPath).toBe('src/Foo.test.ts');
      expect(out.framework).toBe('jest');
    });

    it('When executed, Then prompt targets >= 90% coverage', async () => {
      const ctx = makeContext({ path: 'src/Foo.ts' });
      await skill.execute(ctx);
      const prompt = (ctx.ai.complete as jest.Mock).mock.calls[0][0] as string;
      expect(prompt).toContain('90%');
    });
  });

  describe('Given a Java file path', () => {
    it('When executed, Then uses JUnit 5 framework', async () => {
      const ctx = makeContext({ path: 'src/main/java/com/example/service/FooService.java' });
      const result = await skill.execute(ctx);
      expect((result.output as { framework: string }).framework).toBe('junit5');
    });

    it('When executed, Then prompt mentions JUnit', async () => {
      const ctx = makeContext({ path: 'src/main/java/com/example/service/FooService.java' });
      await skill.execute(ctx);
      const prompt = (ctx.ai.complete as jest.Mock).mock.calls[0][0] as string;
      expect(prompt.toLowerCase()).toContain('junit');
    });

    it('When executed, Then writes test to src/test/java mirror path', async () => {
      const ctx = makeContext({ path: 'src/main/java/com/example/service/FooService.java' });
      await skill.execute(ctx);
      expect(ctx.mcp.executeTool).toHaveBeenCalledWith('filesystem', 'write_file', {
        path: 'src/test/java/com/example/service/FooServiceTest.java',
        content: expect.any(String)
      });
    });

    it('When executed with junit5 framework override, Then still uses JUnit 5 config', async () => {
      const ctx = makeContext({ path: 'src/main/java/com/example/Foo.java', framework: 'junit5' });
      const result = await skill.execute(ctx);
      expect((result.output as { framework: string }).framework).toBe('junit5');
    });
  });

  describe('Test path derivation', () => {
    const cases: [string, string][] = [
      ['src/Foo.ts', 'src/Foo.test.ts'],
      ['src/Bar.js', 'src/Bar.test.js'],
      ['src/main/java/com/example/App.java', 'src/test/java/com/example/AppTest.java'],
      ['deep/path/to/Service.ts', 'deep/path/to/Service.test.ts'],
    ];

    test.each(cases)('For source %s, derives test path %s', async (sourcePath, expectedTestPath) => {
      const ctx = makeContext({ path: sourcePath });
      await skill.execute(ctx);
      const writeCall = (ctx.mcp.executeTool as jest.Mock).mock.calls.find(
        ([, tool]: [string, string]) => tool === 'write_file'
      );
      expect(writeCall?.[2].path).toBe(expectedTestPath);
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
});
