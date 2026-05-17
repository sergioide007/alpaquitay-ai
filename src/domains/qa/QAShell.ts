/**
 * QA Domain Agent Shell
 * ISO/IEC 29119 · ISO 9001 · ISTQB · Testing Quadrants
 */

import { BaseDomainShell, UseCaseHandler } from '../shared/BaseDomainShell';
import type { DomainId, GuardrailResult } from '../interfaces/DomainAgentShell';

export class QAShell extends BaseDomainShell {
  readonly domainId: DomainId = 'qa';
  readonly version = '1.0.0';

  protected useCaseHandlers(): Record<string, UseCaseHandler> {
    return {
      'create-test-plan':    this.createTestPlan.bind(this),
      'generate-test-cases': this.generateTestCases.bind(this),
      'triage-bug':          this.triageBug.bind(this),
      'evaluate-coverage':   this.evaluateCoverage.bind(this),
      'define-quality-gate': this.defineQualityGate.bind(this),
    };
  }

  protected domainGuardrails(output: unknown): GuardrailResult[] {
    const results: GuardrailResult[] = [];
    const o = output as Record<string, unknown>;
    if (typeof o?.estimatedCoveragePercent === 'number' && o.estimatedCoveragePercent < 80) {
      results.push({ severity: 'warn', rule: 'QA-001', message: 'Coverage below 80% — does not meet ISO 9001 quality threshold for production release.' });
    }
    if (Array.isArray(o?.testCases) && (o.testCases as unknown[]).length === 0) {
      results.push({ severity: 'block', rule: 'QA-002', message: 'Empty test plan — cannot release without test cases (ISO/IEC 29119).' });
    }
    return results;
  }

  private async createTestPlan(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const feature = String(params.feature ?? '');
    const raw = await this.ask(`Create a test plan (ISO/IEC 29119) for: "${feature}".
Return JSON: {id,scope,objectives[],strategy,testCases:[{id,title,type,quadrant,priority,preconditions,steps[],expectedResult,automatable,isoReference}],entryExitCriteria:{entry[],exit[]},risks:[{risk,mitigation}],estimatedEffortHours}.`);
    return { success: true, data: this.parseJSON(raw, { testCases: [] }) };
  }

  private async generateTestCases(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const spec   = String(params.spec ?? '');
    const type   = String(params.type ?? 'unit');
    const raw = await this.ask(`Generate ${type} test cases (ISO/IEC 29119) for: "${spec}".
Cover: happy path, edge cases, negative scenarios, boundary values.
Return JSON array: [{id,title,type,priority,steps[],expectedResult,automatable}].`);
    return { success: true, data: this.parseJSON(raw, []) };
  }

  private async triageBug(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const description = String(params.description ?? '');
    const raw = await this.ask(`Triage this bug: "${description}".
Return JSON: {severity('blocker'|'critical'|'major'|'minor'|'trivial'),priority('high'|'medium'|'low'),stepsToReproduce[],rootCauseHypothesis,affectedComponents[],workaround,fixEstimateHours}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async evaluateCoverage(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const context = String(params.context ?? '');
    const raw = await this.ask(`Evaluate test coverage for: "${context}".
Return JSON: {overallCoverage,lineCoverage,branchCoverage,functionCoverage,uncoveredAreas[],riskAreas[],recommendation}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async defineQualityGate(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const service = String(params.service ?? '');
    const raw = await this.ask(`Define quality gates (ISO 9001) for: "${service}".
Return JSON: {name,minCoverage,maxCriticalBugs,maxBlockerBugs,performanceThresholdMs,sloTargets:[{sli,target,window}]}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }
}
