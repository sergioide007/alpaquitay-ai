import { AgentStep, SkillContext } from '../../core/interfaces';
import { DeepAgentSkill } from '../DeepAgentSkill';
import { ProjectContextBuilder } from '../../core/ProjectContextBuilder';
import { ArchitecturalStyle, getMasterPrompt, ProjectContext } from '../../prompts/MasterPrompts';
import {
  getTemplate,
  resolveScaffold,
  resolveTree,
  extractProjectName,
  TemplateParams
} from '../../prompts/ProjectTemplates';
import { generateCode, stripFences, isSmallModel } from '../../prompts/codeUtils';
import { GenerateTestsSkill } from './GenerateTestsSkill';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FilePlan {
  path: string;
  language: string;
  description: string;
}

interface GeneratedFile {
  path: string;
  summary: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseFilePlan(raw: string): FilePlan[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) { return parsed as FilePlan[]; }
    if (parsed.files && Array.isArray(parsed.files)) { return parsed.files as FilePlan[]; }
  } catch { /* fall through */ }

  return raw.split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('{'))
    .map(l => { try { return JSON.parse(l) as FilePlan; } catch { return null; } })
    .filter((f): f is FilePlan => f !== null && !!f.path);
}

function registryContext(files: GeneratedFile[]): string {
  if (files.length === 0) { return '(no files generated yet)'; }
  return files.map(f => `- ${f.path}: ${f.summary}`).join('\n');
}

function buildTemplateParams(goal: string, _projectCtx: ProjectContext): TemplateParams {
  const projectName = extractProjectName(goal);
  // Java groupId heuristic: extract from goal or use default
  const groupMatch = goal.match(/(?:group[Ii]d|package)\s+([a-z][a-z0-9.]+)/);
  const groupId = groupMatch ? groupMatch[1] : undefined;
  // Go module path
  const moduleMatch = goal.match(/(?:module|repo)\s+([\w./:-]+)/);
  const module = moduleMatch ? moduleMatch[1] : undefined;
  // C# namespace
  const nsMatch = goal.match(/(?:namespace|assembly)\s+([A-Z][A-Za-z0-9.]+)/);
  const namespace = nsMatch ? nsMatch[1] : undefined;
  return { projectName, groupId, module, namespace };
}

function parseSimplePaths(raw: string): string[] {
  return raw.split('\n')
    .map(l => l.replace(/^[-*\d.)>\s`]+/, '').replace(/`/g, '').trim())
    .filter(l => /\.\w{1,6}$/.test(l) && !/\s/.test(l) && l.length < 120);
}

function languageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'TypeScript', js: 'JavaScript', py: 'Python', java: 'Java',
    go: 'Go', rs: 'Rust', cs: 'C#', html: 'HTML', css: 'CSS',
    json: 'JSON', xml: 'XML', yaml: 'YAML', yml: 'YAML',
  };
  return map[ext] ?? 'TypeScript';
}

function inferFilesFromGoal(goal: string, style: ArchitecturalStyle): string[] {
  const stopWords = new Set([
    'crea', 'crear', 'un', 'una', 'de', 'del', 'por', 'para', 'con', 'los', 'las', 'el', 'la',
    'the', 'a', 'an', 'of', 'for', 'in', 'with', 'and', 'or', 'create', 'build', 'make',
    'modulo', 'module', 'sistema', 'system', 'medio', 'registro',
  ]);
  const words = goal.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const noun = words.find(w => w.length > 3 && !stopWords.has(w)) ?? 'feature';
  const Name = noun.charAt(0).toUpperCase() + noun.slice(1);

  if (['java-gradle', 'java-maven'].includes(style)) {
    return [
      `src/main/java/com/app/${noun}/${Name}Controller.java`,
      `src/main/java/com/app/${noun}/${Name}Service.java`,
      `src/main/java/com/app/${noun}/${Name}Repository.java`,
      `src/main/java/com/app/${noun}/${Name}.java`,
    ];
  }
  if (style === 'express-api') {
    return [
      `src/${noun}/${Name}Controller.ts`,
      `src/${noun}/${Name}Service.ts`,
      `src/${noun}/${Name}Model.ts`,
      `src/${noun}/${noun}.routes.ts`,
    ];
  }
  if (style === 'flask' || style === 'django') {
    return [
      `app/${noun}/router.py`,
      `app/${noun}/service.py`,
      `app/${noun}/models.py`,
      `app/${noun}/schemas.py`,
    ];
  }
  // Generic fallback
  return [
    `src/${noun}/${Name}Service.ts`,
    `src/${noun}/${Name}Model.ts`,
  ];
}

// ── Pipeline steps ────────────────────────────────────────────────────────────

const steps: AgentStep[] = [

  // Step 1 — detect or override context from goal
  {
    name: 'detect-context',
    async run(ctx: SkillContext): Promise<unknown> {
      const goal = (ctx.parameters.goal as string | undefined) ?? '';
      const overrideStyle = ctx.parameters.style as ArchitecturalStyle | undefined;
      const builder = new ProjectContextBuilder(ctx.workspace, ctx.mcp);
      return builder.buildFromGoal(goal, overrideStyle);
    }
  },

  // Step 2 — scaffold: create the canonical project structure if needed
  {
    name: 'scaffold-structure',
    async run(ctx: SkillContext, outputs: Record<string, unknown>): Promise<unknown> {
      const goal = (ctx.parameters.goal as string | undefined) ?? '';
      const projectCtx = outputs['detect-context'] as ProjectContext;
      const template = getTemplate(projectCtx.style);
      const params = buildTemplateParams(goal, projectCtx);
      const scaffoldFiles = resolveScaffold(template, params).filter(f => f.scaffoldRequired);

      if (scaffoldFiles.length === 0) {
        return { scaffolded: [], tree: '' };
      }

      const masterPrompt = getMasterPrompt(projectCtx);
      const tree = resolveTree(template, params);
      const registry: GeneratedFile[] = [];
      const scaffolded: string[] = [];

      for (const file of scaffoldFiles) {
        const scaffoldPrompt =
          `${masterPrompt}\n\n` +
          `## PROJECT SCAFFOLD:\n` +
          `Project: ${params.projectName} (${projectCtx.framework})\n` +
          `Target structure:\n${tree}\n\n` +
          `## NOW GENERATE:\n` +
          `File: ${file.path}\n` +
          `Language: ${file.language}\n` +
          `Expected functional content: ${file.description}`;

        try {
          const content = await generateCode(ctx.ai, scaffoldPrompt, file.path, file.description, file.language, { maxTokens: 512, temperature: 0.05 });
          await ctx.mcp.executeTool('filesystem', 'write_file', { path: file.path, content });
          scaffolded.push(file.path);
          registry.push({ path: file.path, summary: file.description.split('.')[0].slice(0, 120) });
        } catch { /* non-fatal: feature files can still be generated */ }
      }

      return { scaffolded, tree, registry };
    }
  },

  // Step 3 — plan feature files on top of the scaffold
  {
    name: 'plan-files',
    async run(ctx: SkillContext, outputs: Record<string, unknown>): Promise<unknown> {
      const goal = (ctx.parameters.goal as string | undefined) ?? 'Build the project described in spec.md';
      const projectCtx = outputs['detect-context'] as ProjectContext;
      const scaffold = outputs['scaffold-structure'] as { tree: string; scaffolded: string[] };
      const small = isSmallModel(ctx.ai.modelName);

      const treeSection = scaffold?.tree
        ? `Target project structure:\n${scaffold.tree}\n\n`
        : '';
      const scaffoldSection = scaffold?.scaffolded?.length
        ? `Already scaffolded files (DO NOT include these in the plan):\n${scaffold.scaffolded.map(f => `- ${f}`).join('\n')}\n\n`
        : '';

      // ── Small model path: one-path-per-line (no JSON) ───────────────────────
      if (small) {
        const simplePrompt =
          `Goal: ${goal}\n` +
          treeSection +
          scaffoldSection +
          `List 3 to 5 relative file paths to create for this feature.\n` +
          `One path per line. Paths only, nothing else. Example:\n` +
          `src/documents/DocumentService.ts\n` +
          `src/documents/DocumentModel.ts`;

        const raw = await ctx.ai.complete(simplePrompt, { maxTokens: 200, temperature: 0.05 });
        let paths = parseSimplePaths(raw);

        // Retry once with ultra-minimal prompt
        if (paths.length === 0) {
          const retry = await ctx.ai.complete(
            `Feature: "${goal}"\nGive ONE file path to create. Only the path, nothing else.`,
            { maxTokens: 60, temperature: 0.05 }
          );
          paths = parseSimplePaths(retry);
        }

        // Heuristic fallback — always produces something
        if (paths.length === 0) {
          paths = inferFilesFromGoal(goal, projectCtx.style);
        }

        return paths.map(p => ({
          path: p,
          language: languageFromPath(p),
          description: goal.slice(0, 80),
        })) as FilePlan[];
      }

      // ── Capable model path: JSON format ────────────────────────────────────
      const planPrompt =
        `${getMasterPrompt(projectCtx)}\n\n` +
        treeSection +
        scaffoldSection +
        `## TASK: Plan the feature files for this goal:\n${goal}\n\n` +
        `Output ONLY this JSON — no other text:\n` +
        `{"files": [{"path": "relative/path/file.ext", "language": "TypeScript", "description": "one-line functional description"}]}\n\n` +
        `Rules:\n` +
        `- Use the canonical structure for ${projectCtx.style} (see tree above)\n` +
        `- Do NOT include config/scaffold files already listed above\n` +
        `- Maximum 10 feature files\n` +
        `- All paths must be relative to the project root`;

      const raw = await ctx.ai.complete(planPrompt, { maxTokens: 800, temperature: 0.05 });
      const clean = stripFences(raw);

      let plan: FilePlan[];
      try {
        const parsed = JSON.parse(clean);
        plan = (parsed.files ?? (Array.isArray(parsed) ? parsed : [])) as FilePlan[];
      } catch {
        plan = parseFilePlan(clean);
      }

      // Retry once if JSON plan came back empty
      if (plan.length === 0) {
        const retryRaw = await ctx.ai.complete(
          `List the relative file paths to create for: ${goal}\nOutput ONLY file paths, one per line.`,
          { maxTokens: 200, temperature: 0.05 }
        );
        const paths = parseSimplePaths(stripFences(retryRaw));
        plan = paths.map(p => ({
          path: p,
          language: languageFromPath(p),
          description: goal.slice(0, 80),
        }));
      }

      // Heuristic fallback — always produces something
      if (plan.length === 0) {
        inferFilesFromGoal(goal, projectCtx.style).forEach(p => {
          plan.push({ path: p, language: languageFromPath(p), description: goal.slice(0, 80) });
        });
      }

      return plan;
    }
  },

  // Step 4 — generate each feature file with coherence registry
  {
    name: 'generate-files',
    async run(ctx: SkillContext, outputs: Record<string, unknown>): Promise<unknown> {
      const filePlan = outputs['plan-files'] as FilePlan[];
      const projectCtx = outputs['detect-context'] as ProjectContext;
      const scaffold = outputs['scaffold-structure'] as { registry?: GeneratedFile[] };
      const masterPrompt = getMasterPrompt(projectCtx);

      const registry: GeneratedFile[] = [...(scaffold?.registry ?? [])];
      const written: string[] = [];
      const errors: string[] = [];

      if (!filePlan || filePlan.length === 0) {
        return { written, errors: ['File plan is empty — no feature files to generate.'] };
      }

      for (const file of filePlan.slice(0, 10)) {
        const codePrompt =
          `${masterPrompt}\n\n` +
          `## FILES ALREADY GENERATED (maintain consistency with these):\n` +
          `${registryContext(registry)}\n\n` +
          `## NOW GENERATE:\n` +
          `File: ${file.path}\n` +
          `Language: ${file.language}\n` +
          `Expected functional content: ${file.description}`;

        try {
          const content = await generateCode(ctx.ai, codePrompt, file.path, file.description, file.language);
          await ctx.mcp.executeTool('filesystem', 'write_file', { path: file.path, content });
          written.push(file.path);
          registry.push({ path: file.path, summary: file.description.split('.')[0].slice(0, 120) });
        } catch (err) {
          errors.push(`${file.path}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      return { written, errors };
    }
  },

  // Step 5 — validate that build config contains required dependencies
  {
    name: 'validate-dependencies',
    async run(ctx: SkillContext, outputs: Record<string, unknown>): Promise<unknown> {
      const projectCtx = outputs['detect-context'] as ProjectContext;
      const isJava = projectCtx.style === 'java-gradle' || projectCtx.style === 'java-maven';
      if (!isJava) { return { validated: false, reason: 'not a Java project' }; }

      const buildFile = projectCtx.style === 'java-gradle' ? 'build.gradle' : 'pom.xml';
      let buildContent = '';
      try {
        const result = await ctx.mcp.executeTool('filesystem', 'read_file', { path: buildFile }) as { content: string };
        buildContent = result.content ?? '';
      } catch { return { validated: false, reason: `${buildFile} not found` }; }

      const required = projectCtx.style === 'java-gradle'
        ? ['spring-boot-starter-web', 'spring-boot-starter-data-jpa', 'spring-boot-starter-validation']
        : ['spring-boot-starter-web', 'spring-boot-starter-data-jpa', 'spring-boot-starter-validation'];

      const missing = required.filter(dep => !buildContent.includes(dep));
      if (missing.length === 0) { return { validated: true, missing: [] }; }

      // Ask the AI to add the missing dependencies into the build file
      const fixPrompt =
        `${getMasterPrompt(projectCtx)}\n\n` +
        `The file \`${buildFile}\` is missing these required dependencies:\n` +
        `${missing.map(d => `- ${d}`).join('\n')}\n\n` +
        `Current content of ${buildFile}:\n${buildContent}\n\n` +
        `Output the corrected complete ${buildFile} with the missing dependencies added. No explanations.`;

      try {
        const fixed = await generateCode(ctx.ai, fixPrompt, buildFile, 'build config with all dependencies', projectCtx.style === 'java-gradle' ? 'Groovy' : 'XML');
        await ctx.mcp.executeTool('filesystem', 'write_file', { path: buildFile, content: fixed });
        return { validated: true, fixed: missing };
      } catch (err) {
        return { validated: false, reason: String(err), missing };
      }
    }
  },

  // Step 6 — generate tests for each feature file (Java only for now)
  {
    name: 'generate-tests',
    async run(ctx: SkillContext, outputs: Record<string, unknown>): Promise<unknown> {
      const projectCtx = outputs['detect-context'] as ProjectContext;
      const generated = outputs['generate-files'] as { written: string[] };
      const isJava = projectCtx.style === 'java-gradle' || projectCtx.style === 'java-maven';
      if (!isJava || !generated?.written?.length) {
        return { tested: [], errors: [] };
      }

      // Only generate tests for files in testable layers (skip DTOs, configs, Application.java)
      const testable = generated.written.filter(f => {
        const p = f.replace(/\\/g, '/').toLowerCase();
        return (
          (p.includes('/controller/') || p.includes('/service/') || p.includes('/repository/')) &&
          !p.includes('/impl/') // service impl is tested via the service layer test
        );
      });

      const skill = new GenerateTestsSkill();
      const tested: string[] = [];
      const errors: string[] = [];

      for (const filePath of testable) {
        try {
          const result = await skill.execute({ ...ctx, parameters: { path: filePath, framework: 'junit5' } });
          if (result.success) {
            tested.push((result.output as { testPath: string }).testPath);
          } else {
            errors.push(`${filePath}: ${result.errors?.join(', ')}`);
          }
        } catch (err) {
          errors.push(`${filePath}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      return { tested, errors };
    }
  },

  // Step 7 — summary report
  {
    name: 'report',
    async run(_ctx: SkillContext, outputs: Record<string, unknown>): Promise<unknown> {
      const projectCtx = outputs['detect-context'] as ProjectContext;
      const scaffold = outputs['scaffold-structure'] as { scaffolded: string[]; tree: string };
      const plan = outputs['plan-files'] as FilePlan[];
      const generated = outputs['generate-files'] as { written: string[]; errors: string[] };
      const depCheck = outputs['validate-dependencies'] as { validated: boolean; fixed?: string[]; missing?: string[] };
      const testGen = outputs['generate-tests'] as { tested: string[]; errors: string[] };

      const allWritten = [...(scaffold?.scaffolded ?? []), ...(generated?.written ?? [])];
      const errors = [...(generated?.errors ?? []), ...(testGen?.errors ?? [])];

      const lines: string[] = [
        `## Project Builder — ${projectCtx.framework} (${projectCtx.style})`,
        ''
      ];

      if (scaffold?.tree) {
        lines.push('**Project structure:**');
        lines.push('```');
        lines.push(scaffold.tree);
        lines.push('```');
        lines.push('');
      }

      lines.push(
        `Scaffold: ${scaffold?.scaffolded?.length ?? 0} files | ` +
        `Feature: ${plan?.length ?? 0} planned | ` +
        `Written: ${allWritten.length} | ` +
        `Tests: ${testGen?.tested?.length ?? 0} | ` +
        `Errors: ${errors.length}`
      );

      if (depCheck?.fixed?.length) {
        lines.push(`\n**Dependencies added to build config:** ${depCheck.fixed.join(', ')}`);
      }

      if (allWritten.length) {
        lines.push('\n**Created/modified:**');
        allWritten.forEach(f => lines.push(`- \`${f}\``));
      }
      if (testGen?.tested?.length) {
        lines.push('\n**Tests generated (target >= 90% coverage):**');
        testGen.tested.forEach(f => lines.push(`- \`${f}\``));
      }
      if (errors.length) {
        lines.push('\n**Errors:**');
        errors.forEach(e => lines.push(`- ${e}`));
      }

      return lines.join('\n');
    }
  }
];

export const ProjectBuilderSkill = new DeepAgentSkill(
  'project-builder',
  'Project Builder',
  'Generates a complete project or feature with canonical structure for any language/stack',
  steps
);
