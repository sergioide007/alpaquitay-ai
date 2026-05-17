import { AgentStep, SkillContext } from '../../core/interfaces';
import { DeepAgentSkill } from '../DeepAgentSkill';
import { generateCode } from '../../prompts/codeUtils';

interface FilePlan {
  path: string;
  language: string;
  description: string;
}

function parseFilePlan(raw: string): FilePlan[] {
  const cleaned = raw.replace(/```(?:json)?\n?|\n?```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) { return parsed as FilePlan[]; }
    if (parsed && Array.isArray(parsed.files)) { return parsed.files as FilePlan[]; }
  } catch { /* fall through to line-by-line */ }

  return cleaned.split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('{'))
    .map(l => { try { return JSON.parse(l) as FilePlan; } catch { return null; } })
    .filter((f): f is FilePlan => f !== null && typeof f.path === 'string' && f.path.length > 0);
}

const steps: AgentStep[] = [
  {
    name: 'read-spec',
    async run(ctx: SkillContext): Promise<unknown> {
      const specPath = ctx.parameters.specPath as string | undefined;
      if (!specPath) { return 'ERROR: specPath parameter is required'; }
      const file = await ctx.mcp.executeTool('filesystem', 'read_file', { path: specPath }) as { content: string };
      return file.content;
    }
  },

  {
    name: 'plan-files',
    async run(ctx: SkillContext, outputs: Record<string, unknown>): Promise<unknown> {
      const specContent = outputs['read-spec'] as string;
      if (specContent.startsWith('ERROR:')) { return '[]'; }
      const specPath = ctx.parameters.specPath as string;

      return ctx.ai.complete(
        `You are a spec-driven development expert. Analyze the specification below and plan all implementation files.\n\n` +
        `Specification file: ${specPath}\n\n` +
        `Specification content:\n${specContent}\n\n` +
        `Return ONLY a JSON array (no markdown fences) describing every file to generate:\n` +
        `[\n` +
        `  {"path": "src/main/java/.../Controller.java", "language": "java", "description": "REST controller matching API spec"},\n` +
        `  {"path": "src/main/java/.../Service.java", "language": "java", "description": "Business logic service"},\n` +
        `  ...\n` +
        `]\n\n` +
        `Rules:\n` +
        `- Include implementation files AND test files\n` +
        `- Match the spec's technical stack if specified; otherwise infer from context\n` +
        `- Maximum 12 files\n` +
        `- Paths must be relative to the project root\n` +
        `- Output ONLY the JSON array, nothing else`
      );
    }
  },

  {
    name: 'generate-files',
    async run(ctx: SkillContext, outputs: Record<string, unknown>): Promise<unknown> {
      const specContent = outputs['read-spec'] as string;
      const planRaw = outputs['plan-files'] as string;

      if (specContent.startsWith('ERROR:')) {
        return { generated: [], errors: [specContent] };
      }

      const filePlan = parseFilePlan(planRaw);
      if (filePlan.length === 0) {
        return { generated: [], errors: ['Could not parse file plan from AI response'] };
      }

      const generated: string[] = [];
      const errors: string[] = [];

      for (const file of filePlan) {
        try {
          const primaryPrompt =
            `You are implementing a file that must exactly match the specification below.\n\n` +
            `Specification:\n${specContent}\n\n` +
            `File to generate:\n` +
            `  Path: ${file.path}\n` +
            `  Language: ${file.language}\n` +
            `  Purpose: ${file.description}\n\n` +
            `CRITICAL: Start with the very first line of source code. NO text before or after. NO markdown fences.`;
          const code = await generateCode(ctx.ai, primaryPrompt, file.path, file.description, file.language);
          await ctx.mcp.executeTool('filesystem', 'write_file', { path: file.path, content: code });
          generated.push(file.path);
        } catch (err) {
          errors.push(`Failed to generate ${file.path}: ${String(err)}`);
        }
      }

      return { generated, errors };
    }
  },

  {
    name: 'report',
    async run(_ctx: SkillContext, outputs: Record<string, unknown>): Promise<unknown> {
      const result = outputs['generate-files'] as { generated: string[]; errors: string[] };
      const lines: string[] = [];

      if (result?.generated?.length) {
        lines.push(`**Generated files (${result.generated.length}):**`);
        result.generated.forEach(f => lines.push(`- \`${f}\``));
      } else {
        lines.push('_No files were generated._');
      }

      if (result?.errors?.length) {
        lines.push('\n**Errors:**');
        result.errors.forEach(e => lines.push(`- ${e}`));
      }

      return lines.join('\n');
    }
  }
];

export const GenerateFromSpecSkill = new DeepAgentSkill(
  'generate-from-spec',
  'Generate from Specification',
  'Reads a spec file (OpenAPI/Gherkin/YAML) and generates the full implementation: controllers, services, repositories, tests',
  steps
);
