import { AgentStep, SkillContext } from '../../core/interfaces';
import { DeepAgentSkill } from '../DeepAgentSkill';

/**
 * DeepAgent pipeline:
 *   Step 1 — git-analysis  : last 10 commits → summary string
 *   Step 2 — spec-analysis : pending spec.md tasks → summary string
 *   Step 3 — standup       : AI composes standup from steps 1+2
 *
 * Optional parameter: ctx.parameters.team (string) — team name in report header.
 */
const steps: AgentStep[] = [
  {
    name: 'git-analysis',
    async run(ctx: SkillContext): Promise<unknown> {
      try {
        const log = await ctx.mcp.executeTool('git', 'git_log', { limit: 10 }) as
          Array<{ hash: string; message: string; author: string; date: string }>;
        return log.map(c => `${c.date} ${c.author}: ${c.message}`).join('\n');
      } catch {
        return 'No git history available.';
      }
    }
  },
  {
    name: 'spec-analysis',
    async run(ctx: SkillContext): Promise<unknown> {
      try {
        const file = await ctx.mcp.executeTool('filesystem', 'read_file', { path: 'spec.md' }) as { content: string };
        const pending = file.content
          .split('\n')
          .filter(l => l.includes('- [ ]'))
          .slice(0, 10)
          .join('\n');
        return pending || 'No pending tasks in spec.md.';
      } catch {
        return 'spec.md not found.';
      }
    }
  },
  {
    name: 'standup',
    async run(ctx: SkillContext, outputs: Record<string, unknown>): Promise<unknown> {
      const team = (ctx.parameters.team as string | undefined) ?? 'the team';
      const prompt =
        `Generate a concise daily standup report for ${team}.\n\n` +
        `Recent commits:\n${outputs['git-analysis']}\n\n` +
        `Pending spec tasks:\n${outputs['spec-analysis']}\n\n` +
        `Format exactly:\n## Yesterday\n- ...\n\n## Today\n- ...\n\n## Blockers\n- ...\n\n` +
        `Be concise. Use bullet points. Skip empty sections.`;
      return ctx.ai.complete(prompt);
    }
  }
];

export const DailyStandupSkill = new DeepAgentSkill(
  'daily-standup',
  'Daily Standup',
  'Generates a standup report from git history and pending spec tasks',
  steps
);
