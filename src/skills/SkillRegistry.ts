import { AlpaquitayConfig } from '../core/config';
import { Skill, SkillContext, SkillResult } from '../core/interfaces';

export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();
  private readonly config: AlpaquitayConfig;

  constructor(config?: AlpaquitayConfig) {
    this.config = config ?? new AlpaquitayConfig();
  }

  register(skill: Skill): void {
    this.skills.set(skill.id, skill);
  }

  get(id: string): Skill | undefined {
    return this.skills.get(id);
  }

  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  async execute(id: string, context: SkillContext): Promise<SkillResult> {
    const skill = this.skills.get(id);
    if (!skill) {
      return { success: false, errors: [`Skill '${id}' not found.`] };
    }
    // Enrich context with agent capabilities — skills receive spawn + config automatically
    const enriched: SkillContext = {
      ...context,
      config: context.config ?? this.config,
      spawn: context.spawn ?? ((skillId, params) =>
        this.execute(skillId, { ...context, parameters: params })
      )
    };
    try {
      return await skill.execute(enriched);
    } catch (err) {
      return {
        success: false,
        errors: [err instanceof Error ? err.message : String(err)]
      };
    }
  }
}
