import { Skill, SkillContext, SkillResult } from '../../core/interfaces';

export class RefactorSkill implements Skill {
  readonly id = 'refactor';
  readonly name = 'Refactor Code';
  readonly description = 'Refactor a file applying SOLID principles and clean code practices';

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const { path: filePath, goal } = ctx.parameters as {
      path: string;
      goal?: string;
    };

    if (!filePath) {
      return { success: false, errors: ['Parameter "path" is required.'] };
    }

    const fileData = await ctx.mcp.executeTool('filesystem', 'read_file', {
      path: filePath
    }) as { content: string };

    const objective = goal ?? 'Improve readability, apply SOLID principles, reduce complexity';

    const refactored = await ctx.ai.complete(
      `You are a senior software engineer performing a code refactoring.\n\n` +
      `File: ${filePath}\nGoal: ${objective}\n\n` +
      `Original code:\n\`\`\`\n${fileData.content}\n\`\`\`\n\n` +
      `Refactor the code. Preserve all functionality. Apply:\n` +
      `- Single Responsibility Principle\n- Open/Closed Principle\n` +
      `- Clean naming and structure\n- Remove duplication\n\n` +
      `Respond with ONLY the refactored code.`
    );

    await ctx.mcp.executeTool('filesystem', 'write_file', {
      path: filePath,
      content: refactored
    });

    return { success: true, output: { path: filePath, goal: objective } };
  }
}
