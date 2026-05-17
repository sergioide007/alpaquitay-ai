/**
 * BDD Feature: AI Skills
 *
 * Sprint acceptance tests that describe the end-to-end behavior of the
 * skills layer from a user's perspective. Each scenario follows
 * Given / When / Then structure encoded in the test name.
 *
 * These tests are meta-verifiable: the test names themselves are the spec.
 */

import { SkillRegistry } from '../../skills/SkillRegistry';
import { CreateFileSkill } from '../../skills/built-in/CreateFileSkill';
import { RefactorSkill } from '../../skills/built-in/RefactorSkill';
import { GenerateTestsSkill } from '../../skills/built-in/GenerateTestsSkill';
import { SkillContext, AIProvider } from '../../core/interfaces';

// ── Shared test infrastructure ────────────────────────────────────────────────

function buildAI(generated = '// AI-generated code'): jest.Mocked<AIProvider> {
  return {
    name: 'MockAI',
    type: 'anthropic',
    modelName: 'mock-model',
    isAvailable: jest.fn().mockResolvedValue(true),
    chat: jest.fn(),
    complete: jest.fn().mockResolvedValue(generated)
  };
}

function buildMCP(fileContent = 'export class Foo {}'): SkillContext['mcp'] {
  return {
    executeTool: jest.fn().mockImplementation((_server: string, tool: string) => {
      if (tool === 'read_file') { return Promise.resolve({ content: fileContent }); }
      return Promise.resolve({ success: true });
    })
  };
}

function buildContext(params: Record<string, unknown>, ai?: jest.Mocked<AIProvider>): SkillContext {
  return {
    ai: ai ?? buildAI(),
    mcp: buildMCP(),
    workspace: '/workspace',
    parameters: params
  };
}

// ── Feature: Create File ──────────────────────────────────────────────────────

describe('Feature: Create File Skill', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
    registry.register(new CreateFileSkill());
  });

  describe('Scenario: User generates a new TypeScript service file', () => {
    it(
      'Given a user describes a REST service, ' +
      'When they run create-file with path and description, ' +
      'Then AI generates the code and it is written to the workspace',
      async () => {
        const ai = buildAI('export class UserService {}');
        const ctx = buildContext({ path: 'src/UserService.ts', description: 'A REST user service' }, ai);
        const result = await registry.execute('create-file', ctx);

        expect(result.success).toBe(true);
        expect(ai.complete).toHaveBeenCalledWith(expect.stringContaining('A REST user service'), expect.anything());
        expect(ctx.mcp.executeTool).toHaveBeenCalledWith('filesystem', 'write_file',
          expect.objectContaining({ path: 'src/UserService.ts', content: 'export class UserService {}' })
        );
      }
    );
  });

  describe('Scenario: User omits required parameters', () => {
    it(
      'Given a user provides description but no file path, ' +
      'When create-file executes, ' +
      'Then it returns an error without calling the AI',
      async () => {
        const ctx = buildContext({ description: 'No path given' });
        const result = await registry.execute('create-file', ctx);
        expect(result.success).toBe(false);
        expect(ctx.ai.complete).not.toHaveBeenCalled();
      }
    );
  });

  describe('Scenario: Skill is not registered', () => {
    it(
      'Given a skill id that does not exist, ' +
      'When execute is called, ' +
      'Then registry returns failure without throwing',
      async () => {
        const result = await registry.execute('unknown-skill', buildContext({}));
        expect(result.success).toBe(false);
        expect(result.errors).toBeDefined();
      }
    );
  });
});

// ── Feature: Refactor Code ────────────────────────────────────────────────────

describe('Feature: Refactor Code Skill', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
    registry.register(new RefactorSkill());
  });

  describe('Scenario: Developer refactors a file to apply SOLID principles', () => {
    it(
      'Given an existing source file with legacy code, ' +
      'When the refactor skill is executed without a goal, ' +
      'Then AI refactors using SOLID by default and the file is overwritten',
      async () => {
        const ai = buildAI('// SOLID-compliant refactored code');
        const mcp = buildMCP('class LegacyGodClass { doEverything() {} }');
        const ctx: SkillContext = { ai, mcp, workspace: '/workspace', parameters: { path: 'src/Legacy.ts' } };
        const result = await registry.execute('refactor', ctx);

        expect(result.success).toBe(true);
        const prompt = (ai.complete as jest.Mock).mock.calls[0][0] as string;
        expect(prompt).toContain('SOLID');
        expect(prompt).toContain('class LegacyGodClass');
        expect(mcp.executeTool).toHaveBeenCalledWith('filesystem', 'write_file',
          expect.objectContaining({ content: '// SOLID-compliant refactored code' })
        );
      }
    );
  });

  describe('Scenario: Developer specifies a custom refactoring goal', () => {
    it(
      'Given a custom goal "Remove all magic numbers", ' +
      'When refactor executes, ' +
      'Then the goal appears in the AI prompt',
      async () => {
        const ai = buildAI('// no magic numbers');
        const ctx: SkillContext = {
          ai, mcp: buildMCP(), workspace: '/workspace',
          parameters: { path: 'src/Calc.ts', goal: 'Remove all magic numbers' }
        };
        await registry.execute('refactor', ctx);
        const prompt = (ai.complete as jest.Mock).mock.calls[0][0] as string;
        expect(prompt).toContain('Remove all magic numbers');
      }
    );
  });
});

// ── Feature: Generate Tests ───────────────────────────────────────────────────

describe('Feature: Generate Tests Skill', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    registry = new SkillRegistry();
    registry.register(new GenerateTestsSkill());
  });

  describe('Scenario: Developer generates tests for a service file', () => {
    it(
      'Given a TypeScript service file, ' +
      'When generate-tests executes, ' +
      'Then AI generates jest tests and they are written to <name>.test.ts',
      async () => {
        const testCode = "describe('UserService', () => { it('works', () => {}) })";
        const ai = buildAI(testCode);
        const mcp = buildMCP('export class UserService { getUser() {} }');
        const ctx: SkillContext = {
          ai, mcp, workspace: '/workspace',
          parameters: { path: 'src/UserService.ts' }
        };
        const result = await registry.execute('generate-tests', ctx);

        expect(result.success).toBe(true);
        expect(mcp.executeTool).toHaveBeenCalledWith('filesystem', 'write_file',
          expect.objectContaining({ path: 'src/UserService.test.ts', content: testCode })
        );
      }
    );
  });

  describe('Scenario: Three skills are registered and all are available', () => {
    it(
      'Given a registry with create-file, refactor, and generate-tests, ' +
      'When listing skills, ' +
      'Then all three appear with id, name, and description',
      () => {
        const fullRegistry = new SkillRegistry();
        fullRegistry.register(new CreateFileSkill());
        fullRegistry.register(new RefactorSkill());
        fullRegistry.register(new GenerateTestsSkill());

        const skills = fullRegistry.list();
        expect(skills).toHaveLength(3);

        const ids = skills.map(s => s.id);
        expect(ids).toContain('create-file');
        expect(ids).toContain('refactor');
        expect(ids).toContain('generate-tests');

        skills.forEach(s => {
          expect(s.name).toBeTruthy();
          expect(s.description).toBeTruthy();
        });
      }
    );
  });
});