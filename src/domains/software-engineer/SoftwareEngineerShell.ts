/**
 * Software Engineer Domain Agent Shell
 * ISO/IEC 12207 · ISO/IEC 25010 · SOLID · Clean Code
 */

import { BaseDomainShell, UseCaseHandler } from '../shared/BaseDomainShell';
import type { DomainId, GuardrailResult } from '../interfaces/DomainAgentShell';

export class SoftwareEngineerShell extends BaseDomainShell {
  readonly domainId: DomainId = 'software-engineer';
  readonly version = '1.0.0';

  protected useCaseHandlers(): Record<string, UseCaseHandler> {
    return {
      'review-code':          this.reviewCode.bind(this),
      'analyze-solid':        this.analyzeSOLID.bind(this),
      'detect-tech-debt':     this.detectTechDebt.bind(this),
      'suggest-patterns':     this.suggestPatterns.bind(this),
      'estimate-complexity':  this.estimateComplexity.bind(this),
    };
  }

  protected domainGuardrails(output: unknown): GuardrailResult[] {
    const results: GuardrailResult[] = [];
    const o = output as Record<string, unknown>;
    if (o?.qualityScore !== undefined && Number(o.qualityScore) < 40) {
      results.push({ severity: 'warn', rule: 'SE-001', message: 'Quality score below 40 — code may not meet ISO/IEC 25010 maintainability threshold.' });
    }
    return results;
  }

  private async reviewCode(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const code = String(params.code ?? '');
    const lang = String(params.language ?? 'typescript');
    const raw  = await this.ask(`You are a senior software engineer expert in ISO/IEC 25010 quality.
Review this ${lang} code and return JSON with: qualityScore(0-100), issues(array of {line,severity,rule,message,suggestion}), detectedSmells(array), suggestedPatterns(array), estimatedDebtMinutes(number).
Only return JSON. Code:\n\`\`\`\n${code}\n\`\`\``);
    return { success: true, data: this.parseJSON(raw, { qualityScore: 0, issues: [], detectedSmells: [], suggestedPatterns: [], estimatedDebtMinutes: 0 }) };
  }

  private async analyzeSOLID(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const code = String(params.code ?? '');
    const raw  = await this.ask(`Analyze this code against SOLID principles (ISO/IEC 25010 maintainability).
Return JSON: { singleResponsibility:{score,violations[]}, openClosed:{score,violations[]}, liskovSubstitution:{score,violations[]}, interfaceSegregation:{score,violations[]}, dependencyInversion:{score,violations[]}, overallScore, recommendations[] }.
Code:\n${code}`);
    return { success: true, data: this.parseJSON(raw, { overallScore: 0 }) };
  }

  private async detectTechDebt(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const description = String(params.description ?? '');
    const raw = await this.ask(`Analyze technical debt for: ${description}.
Return JSON array of TechDebtItem: {id,category,description,impactScore(1-10),effortEstimateHours,priority,affectedFiles[]}.
ISO/IEC 25010 compliance context. Only JSON.`);
    return { success: true, data: this.parseJSON(raw, []) };
  }

  private async suggestPatterns(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const problem = String(params.problem ?? '');
    const raw = await this.ask(`Recommend GoF/SOLID/DDD design patterns for: "${problem}".
Return JSON array: {pattern,rationale,implementationSteps[],tradeoffs,isoReference}.`);
    return { success: true, data: this.parseJSON(raw, []) };
  }

  private async estimateComplexity(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const code = String(params.code ?? '');
    const raw = await this.ask(`Estimate cyclomatic complexity and cognitive complexity for:
${code}
Return JSON: {cyclomaticComplexity, cognitiveComplexity, halsteadVolume, maintainabilityIndex, riskLevel('low'|'medium'|'high'), recommendations[]}.`);
    return { success: true, data: this.parseJSON(raw, { riskLevel: 'medium' }) };
  }
}
