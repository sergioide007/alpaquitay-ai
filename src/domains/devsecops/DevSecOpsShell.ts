/**
 * DevSecOps Domain Agent Shell
 * ISO/IEC 27001 · OWASP SAMM · NIST SSDF · CIS Controls
 */

import { BaseDomainShell, UseCaseHandler } from '../shared/BaseDomainShell';
import type { DomainId, GuardrailResult } from '../interfaces/DomainAgentShell';

export class DevSecOpsShell extends BaseDomainShell {
  readonly domainId: DomainId = 'devsecops';
  readonly version = '1.0.0';

  protected useCaseHandlers(): Record<string, UseCaseHandler> {
    return {
      'design-secure-pipeline': this.designSecurePipeline.bind(this),
      'threat-model':           this.threatModel.bind(this),
      'assess-samm':            this.assessSAMM.bind(this),
      'scan-findings-triage':   this.scanFindingsTriage.bind(this),
      'generate-sbom':          this.generateSBOM.bind(this),
    };
  }

  protected domainGuardrails(output: unknown): GuardrailResult[] {
    const results: GuardrailResult[] = [];
    const o = output as Record<string, unknown>;
    if (Array.isArray(o?.findings) && (o.findings as Record<string, unknown>[]).some(f => f.severity === 'critical')) {
      results.push({ severity: 'block', rule: 'DSO-001', message: 'Critical security finding detected — pipeline must block (ISO/IEC 27001 A.14.2).' });
    }
    return results;
  }

  private async designSecurePipeline(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const stack = String(params.stack ?? '');
    const raw = await this.ask(`Design a DevSecOps pipeline (OWASP SAMM L2, NIST SSDF) for: "${stack}".
Return JSON: {stages:[{name,gates:[],blockOn[]}],secretManagement,signingStrategy,sbomGeneration,complianceFrameworks[]}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async threatModel(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const system = String(params.system ?? '');
    const raw = await this.ask(`Create a STRIDE threat model for: "${system}".
Return JSON: {id,scope,assets[],threats:[{category,threat,likelihood(1-5),impact(1-5),riskScore,controls[]}],dataFlows[],trustBoundaries[],strideAnalysis:{spoofing[],tampering[],repudiation[],info-disclosure[],dos[],elevation[]}}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async assessSAMM(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const context = String(params.context ?? '');
    const raw = await this.ask(`Assess OWASP SAMM maturity for: "${context}".
Return JSON: {governance:{},design:{},implementation:{},verification:{},operations:{},overallScore,roadmapToNextLevel[]}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async scanFindingsTriage(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const findings = params.findings ?? [];
    const raw = await this.ask(`Triage security scan findings: ${JSON.stringify(findings)}.
Prioritize by CVSS, exploitability, and business impact. Return JSON: {critical:[],high:[],medium:[],low:[],falsePositives:[],remediationPlan:[{finding,action,effort,deadline}]}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async generateSBOM(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const project = String(params.project ?? '');
    const raw = await this.ask(`Generate an SBOM analysis for: "${project}".
Return JSON: {components:[{name,version,license,cves[],riskLevel}],licenseRisks[],outdatedComponents[],remediationActions[]}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }
}
