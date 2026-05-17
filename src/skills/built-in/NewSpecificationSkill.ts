import * as path from 'path';
import { Skill, SkillContext, SkillResult } from '../../core/interfaces';
import { SPEC_TEMPLATES, SpecTemplateType } from '../../prompts/SpecTemplates';

export class NewSpecificationSkill implements Skill {
  readonly id = 'new-specification';
  readonly name = 'New Specification';
  readonly description = 'Create a new specification file from a template (openapi, bdd, database, microservice, react-component)';

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const { template, name, directory } = ctx.parameters as {
      template?: SpecTemplateType;
      name?: string;
      directory?: string;
    };

    if (!template) {
      return { success: false, errors: ['Parameter "template" is required: openapi | bdd | database | microservice | react-component'] };
    }
    if (!name) {
      return { success: false, errors: ['Parameter "name" is required (e.g. "User Authentication")'] };
    }

    const tmpl = SPEC_TEMPLATES.find(t => t.id === template);
    if (!tmpl) {
      return { success: false, errors: [`Unknown template "${template}". Available: ${SPEC_TEMPLATES.map(t => t.id).join(', ')}`] };
    }

    const slug = name.toLowerCase().replace(/\s+/g, '-');
    const fileName = slug + tmpl.extension;
    const specDir = directory ?? 'specs';
    const filePath = path.join(specDir, fileName);
    const content = tmpl.content(name);

    try {
      await ctx.mcp.executeTool('filesystem', 'write_file', { path: filePath, content });
    } catch {
      // Directory may not exist — try creating it first
      try {
        await ctx.mcp.executeTool('filesystem', 'create_directory', { path: specDir });
        await ctx.mcp.executeTool('filesystem', 'write_file', { path: filePath, content });
      } catch (err) {
        return { success: false, errors: [`Failed to write spec file: ${String(err)}`] };
      }
    }

    return {
      success: true,
      output: {
        filePath,
        template: tmpl.label,
        name,
        message: `Specification "${name}" created at ${filePath}`
      }
    };
  }
}
