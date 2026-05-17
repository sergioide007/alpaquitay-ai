import { CreateFileSkill } from '../../../skills/built-in/CreateFileSkill';
import { SkillContext } from '../../../core/interfaces';

function makeContext(params: Record<string, unknown> = {}): SkillContext {
  return {
    ai: {
      name: 'MockAI',
      type: 'anthropic',
      modelName: 'mock-model',
      isAvailable: jest.fn().mockResolvedValue(true),
      chat: jest.fn(),
      complete: jest.fn().mockResolvedValue('// generated TypeScript code\nexport class Foo {}')
    },
    mcp: { executeTool: jest.fn().mockResolvedValue({ success: true, path: '/workspace/src/Foo.ts' }) },
    workspace: '/workspace',
    parameters: params
  };
}

describe('CreateFileSkill', () => {
  let skill: CreateFileSkill;

  beforeEach(() => { skill = new CreateFileSkill(); });

  it('Has correct id, name, and description', () => {
    expect(skill.id).toBe('create-file');
    expect(skill.name).toBe('Create File');
    expect(skill.description).toBeTruthy();
  });

  describe('Given valid path and description', () => {
    it('When executed, Then calls ai.complete with TypeScript prompt for .ts files', async () => {
      const ctx = makeContext({ path: 'src/Foo.ts', description: 'A simple Foo class' });
      await skill.execute(ctx);
      expect(ctx.ai.complete).toHaveBeenCalledWith(
        expect.stringContaining('TypeScript'),
        expect.anything()
      );
    });

    it('When executed, Then prompt includes the file path and description', async () => {
      const ctx = makeContext({ path: 'src/Foo.ts', description: 'A simple Foo class' });
      await skill.execute(ctx);
      const prompt = (ctx.ai.complete as jest.Mock).mock.calls[0][0] as string;
      expect(prompt).toContain('src/Foo.ts');
      expect(prompt).toContain('A simple Foo class');
    });

    it('When executed, Then calls mcp.executeTool("filesystem", "write_file") with generated code', async () => {
      const ctx = makeContext({ path: 'src/Foo.ts', description: 'A simple Foo class' });
      await skill.execute(ctx);
      expect(ctx.mcp.executeTool).toHaveBeenCalledWith('filesystem', 'write_file', {
        path: 'src/Foo.ts',
        content: '// generated TypeScript code\nexport class Foo {}'
      });
    });

    it('When executed, Then returns success=true with path and language', async () => {
      const ctx = makeContext({ path: 'src/Foo.ts', description: 'A simple Foo class' });
      const result = await skill.execute(ctx);
      expect(result.success).toBe(true);
      expect((result.output as { path: string; language: string }).path).toBe('src/Foo.ts');
      expect((result.output as { language: string }).language).toBe('TypeScript');
    });
  });

  describe('Given missing parameters', () => {
    it('When path is missing, Then returns success=false without calling AI', async () => {
      const ctx = makeContext({ description: 'No path provided' });
      const result = await skill.execute(ctx);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('"path"');
      expect(ctx.ai.complete).not.toHaveBeenCalled();
    });

    it('When description is missing, Then returns success=false without calling AI', async () => {
      const ctx = makeContext({ path: 'src/Foo.ts' });
      const result = await skill.execute(ctx);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('"description"');
      expect(ctx.ai.complete).not.toHaveBeenCalled();
    });

    it('When both are missing, Then returns success=false', async () => {
      const result = await skill.execute(makeContext());
      expect(result.success).toBe(false);
    });
  });

  describe('Language inference from extension', () => {
    const cases: [string, string][] = [
      ['src/App.ts', 'TypeScript'],
      ['src/app.js', 'JavaScript'],
      ['main.py', 'Python'],
      ['Main.java', 'Java'],
      ['main.go', 'Go'],
      ['main.rs', 'Rust'],
      ['App.cs', 'C#'],
      ['app.rb', 'Ruby'],
      ['index.php', 'PHP'],
      ['main.cpp', 'C++'],
      ['unknown.xyz', 'TypeScript']
    ];

    test.each(cases)('For file %s, uses language %s in prompt', async (filePath, expectedLang) => {
      const ctx = makeContext({ path: filePath, description: 'test' });
      await skill.execute(ctx);
      expect(ctx.ai.complete).toHaveBeenCalledWith(expect.stringContaining(expectedLang), expect.anything());
    });
  });
});