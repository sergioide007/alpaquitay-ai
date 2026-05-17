import { Skill, SkillContext, SkillResult, AgentStep } from '../core/interfaces';

/**
 * Multi-step reasoning pipeline: each step's output feeds the next.
 * Implement a DeepAgent by passing ordered AgentStep[] to the constructor.
 *
 * Pattern:
 *   step-1 → outputs['step-1']
 *   step-2(ctx, outputs) → outputs['step-2']
 *   step-N(ctx, outputs) → final result
 */
export class DeepAgentSkill implements Skill {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly description: string,
    private readonly steps: AgentStep[]
  ) {}

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const outputs: Record<string, unknown> = {};
    for (const step of this.steps) {
      try {
        outputs[step.name] = await step.run(ctx, outputs);
      } catch (err) {
        return {
          success: false,
          errors: [`Step '${step.name}' failed: ${err instanceof Error ? err.message : String(err)}`]
        };
      }
    }
    const lastOutput = outputs[this.steps[this.steps.length - 1].name];
    return { success: true, output: lastOutput };
  }
}
