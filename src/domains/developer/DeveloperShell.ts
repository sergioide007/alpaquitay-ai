/**
 * Developer Domain Agent Shell
 * ISO/IEC 12207 · Clean Code · TDD · DDD
 */

import { BaseDomainShell, UseCaseHandler } from '../shared/BaseDomainShell';
import type { DomainId, GuardrailResult } from '../interfaces/DomainAgentShell';

export class DeveloperShell extends BaseDomainShell {
  readonly domainId: DomainId = 'developer';
  readonly version = '1.0.0';

  protected useCaseHandlers(): Record<string, UseCaseHandler> {
    return {
      'implement-feature':  this.implementFeature.bind(this),
      'debug-issue':        this.debugIssue.bind(this),
      'refactor-code':      this.refactorCode.bind(this),
      'explain-code':       this.explainCode.bind(this),
      'generate-tests':     this.generateTests.bind(this),
    };
  }

  protected domainGuardrails(output: unknown): GuardrailResult[] {
    const results: GuardrailResult[] = [];
    const o = output as Record<string, unknown>;
    if (typeof o?.code === 'string' && (o.code as string).includes('TODO')) {
      results.push({ severity: 'warn', rule: 'DEV-001', message: 'Generated code contains TODOs — implementation may be incomplete.' });
    }
    return results;
  }

  private async implementFeature(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const feature  = String(params.feature ?? '');
    const stack    = String(params.stack ?? 'typescript');
    const patterns = String(params.patterns ?? 'clean-architecture');
    const raw = await this.ask(`You are an expert ${stack} developer. Implement: "${feature}".
Patterns: ${patterns}. No TODOs, no stubs, no placeholders.
Return JSON: {files:[{path,content,description}], dependencies[], testingNotes, implementationNotes}.`, 2048);
    return { success: true, data: this.parseJSON(raw, { files: [] }) };
  }

  private async debugIssue(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const error    = String(params.error ?? '');
    const code     = String(params.code ?? '');
    const context  = String(params.context ?? '');
    const raw = await this.ask(`Debug: "${error}". Context: ${context}.
Code:\n${code}
Return JSON: {rootCause, hypothesis, fixedCode, explanation, preventionMeasures[], relatedTests[]}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async refactorCode(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const code    = String(params.code ?? '');
    const goal    = String(params.goal ?? 'improve maintainability');
    const raw = await this.ask(`Refactor this code to ${goal}. Apply SOLID, DRY, KISS.
Code:\n${code}
Return JSON: {refactoredCode, changes:[{description,before,after}], improvementScore(0-100), breakingChanges[]}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async explainCode(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const code   = String(params.code ?? '');
    const level  = String(params.audienceLevel ?? 'intermediate');
    const raw = await this.ask(`Explain this code for a ${level} developer.
Code:\n${code}
Return JSON: {summary, keyConceptsExplained:[{concept,explanation}], potentialIssues[], architectureContext, suggestedImprovements[]}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async generateTests(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const code   = String(params.code ?? '');
    const framework = String(params.framework ?? 'jest');
    const raw = await this.ask(`Generate comprehensive ${framework} tests (unit + integration + edge cases) for:
${code}
Return JSON: {testCode, coverage:{happy_path,edge_cases,error_scenarios}, totalTestCount, estimatedCoveragePercent}.`);
    return { success: true, data: this.parseJSON(raw, { testCode: '', totalTestCount: 0 }) };
  }
}
