/**
 * Security Domain Agent Shell
 * ISO/IEC 27001 · NIST CSF 2.0 · MITRE ATT&CK · SOC 2
 */

import { BaseDomainShell, UseCaseHandler } from '../shared/BaseDomainShell';
import type { DomainId, GuardrailResult } from '../interfaces/DomainAgentShell';

export class SecurityShell extends BaseDomainShell {
  readonly domainId: DomainId = 'security';
  readonly version = '1.0.0';

  protected useCaseHandlers(): Record<string, UseCaseHandler> {
    return {
      'audit-compliance':     this.auditCompliance.bind(this),
      'plan-pentest':         this.planPentest.bind(this),
      'manage-risk-register': this.manageRiskRegister.bind(this),
      'respond-incident':     this.respondIncident.bind(this),
      'assess-csf':           this.assessCSF.bind(this),
    };
  }

  protected domainGuardrails(output: unknown): GuardrailResult[] {
    const results: GuardrailResult[] = [];
    const o = output as Record<string, unknown>;
    if (Array.isArray(o?.criticalFindings) && (o.criticalFindings as unknown[]).length > 0) {
      results.push({ severity: 'block', rule: 'SEC-001', message: `${(o.criticalFindings as unknown[]).length} critical ISO 27001 finding(s) — remediate before certification.` });
    }
    return results;
  }

  private async auditCompliance(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const framework = String(params.framework ?? 'iso27001');
    const context   = String(params.context ?? '');
    const raw = await this.ask(`Perform a ${framework} compliance audit for: "${context}".
Return JSON: {scope,framework,controls:[{id,name,status,evidence,gap,remediation}],overallMaturityLevel(1-5),criticalFindings[],remediationRoadmap:[{priority,action,effort}]}.`);
    return { success: true, data: this.parseJSON(raw, { criticalFindings: [] }) };
  }

  private async planPentest(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const scope = String(params.scope ?? '');
    const raw = await this.ask(`Plan a penetration test for: "${scope}".
Return JSON: {targetSystems[],methodology,phases[],exclusions[],rules[],reportingThreshold,estimatedDays,tooling[]}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async manageRiskRegister(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const context = String(params.context ?? '');
    const raw = await this.ask(`Build an ISO 27001 risk register for: "${context}".
Return JSON: {risks:[{id,threat,vulnerability,likelihood(1-5),impact(1-5),riskScore,owner,controls[],residualRisk}],lastReviewDate,nextReviewDate}.`);
    return { success: true, data: this.parseJSON(raw, { risks: [] }) };
  }

  private async respondIncident(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const incident = String(params.incident ?? '');
    const raw = await this.ask(`Create incident response playbook for: "${incident}" (NIST CSF: Respond/Recover).
Return JSON: {id,classification,attackVectors[],affectedAssets[],containmentActions[],eradicationSteps[],recoveryPlan[],lessonsLearned[],notificationRequirements[],regulatoryReportingDeadlineHours}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async assessCSF(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const context = String(params.context ?? '');
    const raw = await this.ask(`Assess NIST CSF 2.0 maturity for: "${context}".
Return JSON: {functions:{govern:{},identify:{},protect:{},detect:{},respond:{},recover:{}},overallTier(1-4),prioritizedActions[],quickWins[]}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }
}
