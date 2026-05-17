import * as fs from 'fs';
import * as path from 'path';
import { BaseIntegration } from '../BaseIntegration';
import { IEditorIntegration, IntegrationMetadata, ArchitectureRules, EditorContext } from '../interfaces';

/**
 * Windsurf (Codeium) bidirectional integration.
 *
 * - Reads .windsurfrules to extract the project's existing architectural context,
 *   which is then injected into every Alpaquitay prompt as "senior architect" context.
 * - Writes updated architecture rules back to .windsurfrules so Windsurf's AI
 *   stays aligned with the decisions made by Alpaquitay.
 *
 * The "senior architect" layer means: before generating code, Alpaquitay
 * reads Windsurf's rules and prepends them to the master prompt so the AI
 * respects the project's established patterns.
 */
export class WindsurfIntegration extends BaseIntegration implements IEditorIntegration {
  readonly metadata: IntegrationMetadata = {
    id: 'windsurf',
    name: 'Windsurf Architect Integration',
    category: 'editor',
    description: 'Bidirectional architecture context sync with Windsurf — reads existing rules as senior architect context',
    requiredSecrets: [],
  };

  protected async onInitialize(): Promise<void> { /* no remote connection */ }

  // ── IEditorIntegration ────────────────────────────────────────────────────

  async readContext(workspacePath: string): Promise<EditorContext> {
    const content = this.readRulesFile(workspacePath);
    if (!content) { return {}; }

    return {
      rawContent: content,
      rules: this.parseRules(content),
      projectName: path.basename(workspacePath),
    };
  }

  async writeRules(workspacePath: string, rules: ArchitectureRules): Promise<void> {
    const existing = this.readRulesFile(workspacePath);
    const content = this.mergeRules(existing, rules);
    fs.writeFileSync(path.join(workspacePath, '.windsurfrules'), content, 'utf8');
  }

  /**
   * Builds a prompt context block from the Windsurf project rules.
   * This is injected at the top of every generation prompt so the LLM
   * acts as if a senior architect has already defined the project constraints.
   */
  buildPromptContext(ctx: EditorContext): string {
    if (!ctx.rules && !ctx.rawContent) { return ''; }

    const lines: string[] = [
      '## Senior Architect Context (from Windsurf)',
      '',
    ];

    if (ctx.rules) {
      lines.push(`Architecture style: ${ctx.rules.style}`);
      lines.push(`Primary language: ${ctx.rules.language}`);
      if (ctx.rules.framework) { lines.push(`Framework: ${ctx.rules.framework}`); }
      if (ctx.rules.layers?.length) {
        lines.push(`Layer boundaries: ${ctx.rules.layers.join(' → ')}`);
      }
      if (ctx.rules.conventions?.length) {
        lines.push('', 'Established conventions (MUST follow):');
        ctx.rules.conventions.forEach(c => lines.push(`  * ${c}`));
      }
      if (ctx.rules.forbiddenPatterns?.length) {
        lines.push('', 'Forbidden patterns (NEVER use):');
        ctx.rules.forbiddenPatterns.forEach(p => lines.push(`  * ${p}`));
      }
    } else if (ctx.rawContent) {
      lines.push(ctx.rawContent);
    }

    lines.push('', 'Honour these constraints in all generated code.');
    return lines.join('\n');
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private readRulesFile(workspacePath: string): string | null {
    const candidates = [
      path.join(workspacePath, '.windsurfrules'),
      path.join(workspacePath, '.codeium', 'windsurf', 'rules.md'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return fs.readFileSync(candidate, 'utf8');
      }
    }
    return null;
  }

  private parseRules(content: string): ArchitectureRules {
    const rules: ArchitectureRules = { style: 'custom', language: 'TypeScript' };

    const langMatch = content.match(/language[:\s]+(\w[\w+#-]*)/i);
    if (langMatch) { rules.language = langMatch[1]; }

    const styleMatch = content.match(/(?:architecture[- ]style|style)[:\s]+(layered|hexagonal|clean|microservices|custom)/i);
    if (styleMatch) { rules.style = styleMatch[1] as ArchitectureRules['style']; }

    const fwMatch = content.match(/framework[:\s]+([^\n]+)/i);
    if (fwMatch) { rules.framework = fwMatch[1].trim(); }

    const layerSection = content.match(/layer[s\s]+boundaries?[:\s]+([^\n]+)/i)
      ?? content.match(/layers?[:\s]+([^\n]+)/i);
    if (layerSection) {
      rules.layers = layerSection[1].split(/[,→>|]+/).map(s => s.trim()).filter(Boolean);
    }

    const conventionBlocks = [...content.matchAll(/\*\s+([^\n]+)/g)];
    if (conventionBlocks.length) {
      rules.conventions = conventionBlocks.map(m => m[1].trim());
    }

    const forbiddenSection = content.match(/forbidden[^\n]*\n((?:\s*[-*]\s*[^\n]+\n?)+)/i);
    if (forbiddenSection) {
      rules.forbiddenPatterns = forbiddenSection[1]
        .split('\n')
        .map(l => l.replace(/^[-*]\s*/, '').trim())
        .filter(Boolean);
    }

    return rules;
  }

  /**
   * Merges new rules into existing content.
   * Preserves user-authored sections and only updates the Alpaquitay-managed block.
   */
  private mergeRules(existing: string | null, rules: ArchitectureRules): string {
    const managed = this.buildManagedBlock(rules);

    if (!existing) { return managed; }

    const BLOCK_START = '<!-- alpaquitay:start -->';
    const BLOCK_END   = '<!-- alpaquitay:end -->';

    if (existing.includes(BLOCK_START)) {
      return existing.replace(
        new RegExp(`${BLOCK_START}[\\s\\S]*?${BLOCK_END}`),
        `${BLOCK_START}\n${managed}\n${BLOCK_END}`
      );
    }

    return `${existing}\n\n${BLOCK_START}\n${managed}\n${BLOCK_END}`;
  }

  private buildManagedBlock(rules: ArchitectureRules): string {
    const lines: string[] = [
      '# Alpaquitay AI — Architecture Rules',
      `language: ${rules.language}`,
      `architecture-style: ${rules.style}`,
    ];

    if (rules.framework) { lines.push(`framework: ${rules.framework}`); }
    if (rules.layers?.length) { lines.push(`layer boundaries: ${rules.layers.join(' → ')}`); }

    if (rules.conventions?.length) {
      lines.push('', '## Conventions');
      rules.conventions.forEach(c => lines.push(`* ${c}`));
    }

    if (rules.forbiddenPatterns?.length) {
      lines.push('', '## Forbidden patterns');
      rules.forbiddenPatterns.forEach(p => lines.push(`- ${p}`));
    }

    if (rules.customRules?.length) {
      lines.push('', '## Project-specific rules');
      rules.customRules.forEach(r => lines.push(`* ${r}`));
    }

    return lines.join('\n');
  }
}
