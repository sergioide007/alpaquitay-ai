import * as path from 'path';
import { Skill, SkillContext, SkillResult } from '../../core/interfaces';

// ── Language / framework detection ───────────────────────────────────────────

interface TestConfig {
  framework: string;
  prompt: (filePath: string, source: string, layer: string) => string;
  testPath: (sourcePath: string) => string;
}

function detectLayer(filePath: string): string {
  const p = filePath.replace(/\\/g, '/').toLowerCase();
  if (p.includes('/controller')) { return 'controller'; }
  if (p.includes('/service')) { return 'service'; }
  if (p.includes('/repository')) { return 'repository'; }
  if (p.includes('/entity') || p.includes('/model')) { return 'entity'; }
  return 'unit';
}

function javaTestPath(sourcePath: string): string {
  const normalized = sourcePath.replace(/\\/g, '/');
  // Replace `src/main/java/` with `src/test/java/` regardless of leading slash
  const inTest = normalized.replace('src/main/java/', 'src/test/java/');
  const ext = path.extname(inTest);
  const base = inTest.slice(0, -ext.length);
  return `${base}Test${ext}`;
}

function javaPrompt(filePath: string, source: string, layer: string): string {
  const className = path.basename(filePath, path.extname(filePath));
  const layerInstructions: Record<string, string> = {
    controller: `Use @WebMvcTest(${className}.class) + MockMvc.
- Mock the service layer with @MockBean.
- Test each endpoint: happy path, invalid input (400), not found (404).
- Verify HTTP status codes, response body structure, and that the service is called.`,
    service: `Use @ExtendWith(MockitoExtension.class).
- @Mock all repository and external dependencies.
- @InjectMocks the implementation class.
- Test happy path, edge cases (null/empty inputs), and exception paths.`,
    repository: `Use @DataJpaTest (in-memory H2).
- Test custom query methods with saved entities.
- Test find, save, delete operations.
- Verify that constraints (unique, not-null) are enforced.`,
    entity: `Use plain JUnit 5 (no Spring context).
- Test equals/hashCode/toString if present.
- Test bean validation annotations with a Validator instance.
- Test any business methods on the entity.`,
    unit: `Use @ExtendWith(MockitoExtension.class).
- Mock all external collaborators.
- Test each public method: happy path + edge cases + exceptions.`,
  };

  return `You are a senior Java engineer writing JUnit 5 tests.

Source file: ${filePath}

Source code:
\`\`\`java
${source}
\`\`\`

Generate a complete JUnit 5 test class for the above file.
${layerInstructions[layer] ?? layerInstructions['unit']}

General rules:
- Use AssertJ assertions (assertThat, assertThatThrownBy).
- Use @DisplayName with descriptive names (Given / When / Then).
- Cover ALL public methods including edge cases and null inputs.
- Target >= 90% line and branch coverage.
- Import only what is used; no wildcard imports.
- Include the correct package declaration matching the source file.
- Output ONLY the Java source code. No explanations, no fences, no emojis.`;
}

const CONFIGS: Record<string, TestConfig> = {
  java: {
    framework: 'junit5',
    prompt: javaPrompt,
    testPath: javaTestPath,
  },
  typescript: {
    framework: 'jest',
    prompt: (filePath, source) =>
      `You are an expert TypeScript engineer writing Jest unit tests.\n\n` +
      `Source file: ${filePath}\n\nSource code:\n\`\`\`\n${source}\n\`\`\`\n\n` +
      `Generate comprehensive Jest tests:\n` +
      `- Test all exported functions and classes, including edge cases and error paths.\n` +
      `- Mock external modules and dependencies.\n` +
      `- Use descriptive describe/it blocks with Given/When/Then naming.\n` +
      `- Target >= 90% line and branch coverage.\n` +
      `- Output ONLY the test code. No explanations, no fences.`,
    testPath: (src) => {
      const ext = path.extname(src);
      return `${src.slice(0, -ext.length)}.test${ext}`;
    },
  },
  javascript: {
    framework: 'jest',
    prompt: (filePath, source) =>
      `You are an expert JavaScript engineer writing Jest unit tests.\n\n` +
      `Source file: ${filePath}\n\nSource code:\n\`\`\`\n${source}\n\`\`\`\n\n` +
      `Generate comprehensive Jest tests covering all exported functions, edge cases, and error paths.\n` +
      `Target >= 90% coverage. Output ONLY the test code.`,
    testPath: (src) => {
      const ext = path.extname(src);
      return `${src.slice(0, -ext.length)}.test${ext}`;
    },
  },
  python: {
    framework: 'pytest',
    prompt: (filePath, source) =>
      `You are an expert Python engineer writing pytest unit tests.\n\n` +
      `Source file: ${filePath}\n\nSource code:\n\`\`\`\n${source}\n\`\`\`\n\n` +
      `Generate comprehensive pytest tests covering all public functions and classes.\n` +
      `Use fixtures, parametrize where appropriate, and test edge cases.\n` +
      `Target >= 90% coverage. Output ONLY the test code.`,
    testPath: (src) => {
      const dir = path.dirname(src);
      const base = path.basename(src, path.extname(src));
      return path.join(dir, `test_${base}.py`).replace(/\\/g, '/');
    },
  },
};

function getConfig(filePath: string, frameworkOverride?: string): TestConfig {
  const ext = path.extname(filePath).toLowerCase();
  if (frameworkOverride === 'junit5' || ext === '.java') { return CONFIGS['java']; }
  if (ext === '.ts' || ext === '.tsx') { return CONFIGS['typescript']; }
  if (ext === '.js' || ext === '.jsx') { return CONFIGS['javascript']; }
  if (ext === '.py') { return CONFIGS['python']; }
  // Default: generic Jest-style
  return CONFIGS['typescript'];
}

// ── Skill ─────────────────────────────────────────────────────────────────────

export class GenerateTestsSkill implements Skill {
  readonly id = 'generate-tests';
  readonly name = 'Generate Tests';
  readonly description = 'Generate unit tests for a source file targeting >= 90% coverage';

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const { path: filePath, framework } = ctx.parameters as {
      path: string;
      framework?: string;
    };

    if (!filePath) {
      return { success: false, errors: ['Parameter "path" is required.'] };
    }

    const fileData = await ctx.mcp.executeTool('filesystem', 'read_file', {
      path: filePath,
    }) as { content: string };

    const config = getConfig(filePath, framework);
    const layer = detectLayer(filePath);
    const testPath = config.testPath(filePath);
    const prompt = config.prompt(filePath, fileData.content, layer);

    const tests = await ctx.ai.complete(prompt);

    await ctx.mcp.executeTool('filesystem', 'write_file', {
      path: testPath,
      content: tests,
    });

    return {
      success: true,
      output: { sourcePath: filePath, testPath, framework: config.framework, layer },
    };
  }
}
