import { Skill, SkillContext, SkillResult } from '../../core/interfaces';
import { generateCode } from '../../prompts/codeUtils';

export class CreateFileSkill implements Skill {
  readonly id = 'create-file';
  readonly name = 'Create File';
  readonly description = 'Generate a new source file from a description using AI';

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const { path: filePath, description, language } = ctx.parameters as {
      path: string;
      description: string;
      language?: string;
    };

    if (!filePath || !description) {
      return { success: false, errors: ['Parameters "path" and "description" are required.'] };
    }

    const lang = language ?? this.inferLanguage(filePath);

    const primaryPrompt =
      `You are an expert ${lang} developer.\n` +
      `File: ${filePath}\nDescription: ${description}\n\n` +
      `Requirements: follow ${lang} best practices, SOLID principles.\n\n` +
      `CRITICAL: Start immediately with the first line of source code.\n` +
      `NO text before or after the code. NO markdown fences. NO explanations.`;

    const code = await generateCode(ctx.ai, primaryPrompt, filePath, description, lang);

    await ctx.mcp.executeTool('filesystem', 'write_file', {
      path: filePath,
      content: code
    });

    return { success: true, output: { path: filePath, language: lang } };
  }

  private inferLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
      ts: 'TypeScript', js: 'JavaScript', py: 'Python',
      java: 'Java', go: 'Go', rs: 'Rust', cs: 'C#',
      rb: 'Ruby', php: 'PHP', cpp: 'C++'
    };
    return map[ext ?? ''] ?? 'TypeScript';
  }
}
