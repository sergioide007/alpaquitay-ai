import { Skill, SkillContext, SkillResult } from '../core/interfaces';

interface SubtaskPlan {
  skillId: string;
  params: Record<string, unknown>;
  description: string;
}

/**
 * Supervisor-specialist pattern:
 *   1. Supervisor (AI) receives the goal + available skill IDs and plans subtasks as JSON.
 *   2. Each planned subtask is spawned sequentially, with its output available to the next.
 *
 * Usage: extend this class or instantiate it directly with a custom planningPrompt.
 */
export class CompositeSkill implements Skill {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly description: string,
    private readonly availableSkillIds: string[],
    private readonly planningPrompt: string
  ) {}

  async execute(ctx: SkillContext): Promise<SkillResult> {
    if (!ctx.spawn) {
      return { success: false, errors: ['CompositeSkill requires spawn — use SkillRegistry.execute().'] };
    }

    const plan = await this._plan(ctx);
    if (!plan.length) {
      return { success: false, errors: ['Supervisor produced no subtasks — check planningPrompt or available skills.'] };
    }

    const outputs: Record<string, unknown> = {};
    for (const subtask of plan) {
      const result = await ctx.spawn(subtask.skillId, {
        ...ctx.parameters,
        ...subtask.params
      });
      outputs[subtask.description] = result.output;
      if (!result.success && result.errors?.length) {
        outputs[`${subtask.description}__errors`] = result.errors;
      }
    }

    return { success: true, output: outputs };
  }

  private async _plan(ctx: SkillContext): Promise<SubtaskPlan[]> {
    const prompt =
      `${this.planningPrompt}\n\n` +
      `Goal parameters: ${JSON.stringify(ctx.parameters)}\n` +
      `Available skills: ${this.availableSkillIds.join(', ')}\n\n` +
      `Reply with a JSON array of up to 5 subtasks:\n` +
      `[{"skillId":"<one of the available skills>","params":{},"description":"<short label>"}]\n` +
      `Reply ONLY with the JSON array — no markdown fences, no explanations.`;

    try {
      const raw = await ctx.ai.complete(prompt);
      const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
      const parsed = JSON.parse(cleaned) as SubtaskPlan[];
      return Array.isArray(parsed)
        ? parsed.filter(t => this.availableSkillIds.includes(t.skillId)).slice(0, 5)
        : [];
    } catch {
      return [];
    }
  }
}
