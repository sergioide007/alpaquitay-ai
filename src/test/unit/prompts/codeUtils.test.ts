import {
  stripFences,
  cleanLineArtifacts,
  stripTrailingFooter,
  sanitizeCode,
  isDegenerate,
  generateCode,
} from '../../../prompts/codeUtils';
import { AIProvider } from '../../../core/interfaces';

// ── stripFences ───────────────────────────────────────────────────────────────

describe('stripFences', () => {
  it('removes leading and trailing triple-backtick fences', () => {
    expect(stripFences('```\ncode\n```')).toBe('code');
  });

  it('removes language-tagged fences', () => {
    expect(stripFences('```java\npublic class Foo {}\n```')).toBe('public class Foo {}');
  });

  it('returns the string unchanged when no fences are present', () => {
    expect(stripFences('public class Foo {}')).toBe('public class Foo {}');
  });

  it('handles empty input', () => {
    expect(stripFences('')).toBe('');
  });
});

// ── cleanLineArtifacts ────────────────────────────────────────────────────────

describe('cleanLineArtifacts', () => {
  it('removes trailing emoji from a code line without a comment', () => {
    const line = 'private String name;  ✅';
    expect(cleanLineArtifacts(line)).toBe('private String name;');
  });

  it('truncates inline comment at CORRECT-start-directly phrase', () => {
    const line = 'private String id;  // field  ✅ CORRECT - start directly with code:';
    const result = cleanLineArtifacts(line);
    expect(result).toContain('private String id;');
    expect(result).not.toContain('CORRECT');
  });

  it('truncates inline comment at REQUIRED FOR ENTITY IDENTIFICATION phrase', () => {
    const line = 'private Integer id; // primary key 🔄 REQUIRED FOR ENTITY IDENTIFICATION';
    const result = cleanLineArtifacts(line);
    expect(result).toContain('private Integer id;');
    expect(result).not.toContain('REQUIRED FOR ENTITY');
  });

  it('removes CONGRATULAT phrase from comment', () => {
    const line = '}  // End of class 🎉 CONGRATULATIONS ON CREATING THE CLASS';
    const result = cleanLineArtifacts(line);
    expect(result).not.toContain('CONGRATULAT');
  });

  it('keeps clean code lines unchanged', () => {
    const line = 'public class PersonaEntity {';
    expect(cleanLineArtifacts(line)).toBe('public class PersonaEntity {');
  });

  it('keeps meaningful inline comments', () => {
    const line = 'private int retries; // max attempts before giving up';
    expect(cleanLineArtifacts(line)).toBe(line);
  });

  it('drops a bare // with nothing after it', () => {
    const line = 'private int x; //';
    expect(cleanLineArtifacts(line)).toBe('private int x;');
  });
});

// ── stripTrailingFooter ───────────────────────────────────────────────────────

describe('stripTrailingFooter', () => {
  const javaClass = `public class Foo {\n  private int x;\n}`;

  it('strips prose appended after the closing brace for Java', () => {
    const code = `${javaClass}\n\nThis class represents a Foo entity.\n✅ CORRECT`;
    expect(stripTrailingFooter(code, 'Java')).toBe(javaClass);
  });

  it('strips status text after closing brace for Kotlin', () => {
    const code = `class Bar {\n}\n\n🎉 CONGRATULATIONS`;
    expect(stripTrailingFooter(code, 'Kotlin')).toBe('class Bar {\n}');
  });

  it('does nothing when there is no trailing content', () => {
    expect(stripTrailingFooter(javaClass, 'Java')).toBe(javaClass);
  });

  it('does not strip for interpreted languages', () => {
    const code = `def foo():\n    pass\n\n# summary`;
    expect(stripTrailingFooter(code, 'Python')).toBe(code);
  });

  it('does not strip for TypeScript', () => {
    const code = `export class Foo {}\n// exported`;
    expect(stripTrailingFooter(code, 'TypeScript')).toBe(code);
  });

  it('handles Go language', () => {
    const code = `package main\n\nfunc main() {\n}\n\nsome footer`;
    expect(stripTrailingFooter(code, 'Go')).toBe(`package main\n\nfunc main() {\n}`);
  });
});

// ── isDegenerate ─────────────────────────────────────────────────────────────

describe('isDegenerate', () => {
  it('returns true for empty/short output', () => {
    expect(isDegenerate('')).toBe(true);
    expect(isDegenerate('   ')).toBe(true);
    expect(isDegenerate('hi')).toBe(true);
  });

  it('returns true when >80% of lines are comments', () => {
    // 5 comment lines out of 6 total = 83.3% > 80%
    const code = '// line1\n// line2\n// line3\n// line4\n// line5\ncode();';
    expect(isDegenerate(code)).toBe(true);
  });

  it('returns false for a normal Java class', () => {
    const code = `public class Foo {\n  private int x;\n  public int getX() { return x; }\n}`;
    expect(isDegenerate(code)).toBe(false);
  });

  it('returns true for survey/meta text near the top', () => {
    const code = 'identify key features\nsome more text\ncode();';
    expect(isDegenerate(code)).toBe(true);
  });

  it('returns false for a normal TypeScript module', () => {
    const code = `import { foo } from './foo';\nexport function bar() { return foo() + 1; }`;
    expect(isDegenerate(code)).toBe(false);
  });
});

// ── sanitizeCode ──────────────────────────────────────────────────────────────

describe('sanitizeCode', () => {
  it('strips fences and meta headers, returns non-degenerate code', () => {
    const raw = '```java\npublic class Foo {}\n```';
    const { code, degenerate } = sanitizeCode(raw, 'Java');
    expect(code).toBe('public class Foo {}');
    expect(degenerate).toBe(false);
  });

  it('removes emoji artifacts from lines', () => {
    const raw = `@Entity\npublic class Bar {\n  private int id; // key 🔄 REQUIRED FOR ENTITY IDENTIFICATION\n}`;
    const { code } = sanitizeCode(raw, 'Java');
    expect(code).not.toContain('REQUIRED FOR ENTITY');
    expect(code).toContain('private int id;');
  });

  it('strips trailing footer for Java', () => {
    const raw = `public class Baz {\n  private int x;\n}\n\nThis is the Baz class.`;
    const { code } = sanitizeCode(raw, 'Java');
    expect(code).toBe('public class Baz {\n  private int x;\n}');
  });

  it('marks degenerate when output is pure comment prose', () => {
    const raw = '// This is a comment\n// Another comment\n// And more\n// And more\n// And more';
    const { degenerate } = sanitizeCode(raw, 'Java');
    expect(degenerate).toBe(true);
  });

  it('works without a language argument (default empty string)', () => {
    const raw = '```\nexport const x = 1;\n```';
    const { code } = sanitizeCode(raw);
    expect(code).toBe('export const x = 1;');
  });
});

// ── generateCode ─────────────────────────────────────────────────────────────

describe('generateCode', () => {
  function makeAI(responses: string[]): AIProvider {
    let call = 0;
    return {
      name: 'mock',
      type: 'anthropic',
      modelName: 'mock-model',
      isAvailable: jest.fn().mockResolvedValue(true),
      chat: jest.fn(),
      complete: jest.fn().mockImplementation(() => Promise.resolve(responses[call++] ?? '')),
    };
  }

  it('returns sanitized code on the first attempt when not degenerate', async () => {
    const ai = makeAI(['public class Foo {}']);
    const result = await generateCode(ai, 'prompt', 'Foo.java', 'a foo class', 'Java');
    expect(result).toBe('public class Foo {}');
    expect((ai.complete as jest.Mock).mock.calls).toHaveLength(1);
  });

  it('retries when first response is degenerate and returns second response', async () => {
    const degenResponse = '// just a comment\n// another comment\n// more comments\n// more\n// more';
    const goodResponse = 'public class Foo {}';
    const ai = makeAI([degenResponse, goodResponse]);
    const result = await generateCode(ai, 'prompt', 'Foo.java', 'a foo class', 'Java');
    expect(result).toBe('public class Foo {}');
    expect((ai.complete as jest.Mock).mock.calls).toHaveLength(2);
  });

  it('applies language-aware footer stripping via sanitizeCode', async () => {
    const rawWithFooter = 'public class Foo {\n  private int x;\n}\n\nThis is the Foo entity.';
    const ai = makeAI([rawWithFooter]);
    const result = await generateCode(ai, 'prompt', 'Foo.java', 'foo entity', 'Java');
    expect(result).toBe('public class Foo {\n  private int x;\n}');
  });
});
