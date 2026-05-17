import { AgentStep, SkillContext } from '../../core/interfaces';
import { DeepAgentSkill } from '../DeepAgentSkill';

async function listSourceFiles(ctx: SkillContext): Promise<string> {
  const candidates = ['src', 'lib', 'app', '.'];
  for (const dir of candidates) {
    try {
      const files = await ctx.mcp.executeTool('filesystem', 'list_directory', { path: dir }) as string[];
      if (files.length > 0) { return `Directory "${dir}":\n${files.join('\n')}`; }
    } catch { /* try next */ }
  }
  return 'No source directory found.';
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
    name: 'scan-implementation',
    async run(ctx: SkillContext): Promise<unknown> {
      return listSourceFiles(ctx);
    }
  },

  {
    name: 'validate',
    async run(ctx: SkillContext, outputs: Record<string, unknown>): Promise<unknown> {
      const specContent = outputs['read-spec'] as string;
      if (specContent.startsWith('ERROR:')) { return specContent; }

      const implFiles = outputs['scan-implementation'] as string;
      const specPath = ctx.parameters.specPath as string;

      return ctx.ai.complete(
        `You are a spec compliance validator. Analyze whether this implementation matches the specification.\n\n` +
        `Specification file: ${specPath}\n\n` +
        `Specification content:\n${specContent}\n\n` +
        `Implementation files found:\n${implFiles}\n\n` +
        `Produce a structured compliance report using this exact format:\n\n` +
        `## Spec Compliance Report\n\n` +
        `### ✅ Implemented Requirements\n` +
        `- [List each requirement that has a corresponding implementation file]\n\n` +
        `### ⚠️ Partial Implementations\n` +
        `- [List requirements that exist but are incomplete]\n\n` +
        `### ❌ Missing Implementations\n` +
        `- [List requirements in the spec with NO corresponding code]\n\n` +
        `### 🔄 Spec Changes Not Yet Implemented\n` +
        `- [List anything in the spec that appears newer than the code]\n\n` +
        `### 📊 Summary\n` +
        `- Coverage: X of Y requirements implemented\n` +
        `- Next steps: [1-3 concrete actions]\n\n` +
        `Be specific. Reference actual file names from the implementation scan when possible.`
      );
    }
  }
];

export const ValidateAgainstSpecSkill = new DeepAgentSkill(
  'validate-against-spec',
  'Validate Against Specification',
  'Checks whether the codebase implements all requirements in a spec file and reports gaps',
  steps
);
