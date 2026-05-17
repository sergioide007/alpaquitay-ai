import { Skill, SkillContext, SkillResult } from '../core/interfaces';

/**
 * Runs multiple skills concurrently, respecting config.skillMaxParallel as a
 * concurrency cap. Aggregates all outputs; partial failures are reported but
 * do not block successful sub-skills.
 */
export class ParallelSkill implements Skill {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly description: string,
    private readonly skillIds: string[],
    /** Override params per sub-skill; falls back to parent ctx.parameters */
    private readonly paramsResolver?: (skillId: string, ctx: SkillContext) => Record<string, unknown>
  ) {}

  async execute(ctx: SkillContext): Promise<SkillResult> {
    if (!ctx.spawn) {
      return { success: false, errors: ['ParallelSkill requires spawn — use SkillRegistry.execute().'] };
    }

    const maxParallel = ctx.config?.skillMaxParallel ?? 3;
    const chunks = this._chunks(this.skillIds, maxParallel);
    const outputs: Record<string, unknown> = {};
    const errors: string[] = [];

    for (const chunk of chunks) {
      const results = await Promise.all(
        chunk.map(async (skillId) => {
          const params = this.paramsResolver
            ? this.paramsResolver(skillId, ctx)
            : ctx.parameters;
          const result = await ctx.spawn!(skillId, params);
          return { skillId, result };
        })
      );
      for (const { skillId, result } of results) {
        outputs[skillId] = result.output;
        if (!result.success) {
          errors.push(...(result.errors ?? [`${skillId} failed`]));
        }
      }
    }

    return errors.length > 0
      ? { success: false, errors, output: outputs }
      : { success: true, output: outputs };
  }

  private _chunks<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  }
}
