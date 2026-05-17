/**
 * Cloud Infrastructure Domain Agent Shell
 * ISO/IEC 27017 · ISO/IEC 27018 · CSA STAR · AWS/Azure/GCP WAF
 */

import { BaseDomainShell, UseCaseHandler } from '../shared/BaseDomainShell';
import type { DomainId, GuardrailResult } from '../interfaces/DomainAgentShell';

export class CloudShell extends BaseDomainShell {
  readonly domainId: DomainId = 'cloud';
  readonly version = '1.0.0';

  protected useCaseHandlers(): Record<string, UseCaseHandler> {
    return {
      'design-architecture':    this.designArchitecture.bind(this),
      'well-architected-review':this.wellArchitectedReview.bind(this),
      'optimize-cost':          this.optimizeCost.bind(this),
      'plan-migration':         this.planMigration.bind(this),
      'generate-iac':           this.generateIaC.bind(this),
    };
  }

  protected domainGuardrails(output: unknown): GuardrailResult[] {
    const results: GuardrailResult[] = [];
    const o = output as Record<string, unknown>;
    if (!o?.securityControls || (o.securityControls as unknown[]).length === 0) {
      results.push({ severity: 'block', rule: 'CLD-001', message: 'No security controls defined — violates ISO/IEC 27017 cloud security baseline.' });
    }
    return results;
  }

  private async designArchitecture(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const requirements = String(params.requirements ?? '');
    const provider     = String(params.provider ?? 'aws');
    const raw = await this.ask(`Design a cloud architecture (ISO/IEC 27017, ${provider} WAF) for: "${requirements}".
Return JSON: {provider,region,multiRegion,services:[{service,name,sku,justification}],networkDesign:{vpcCidr,subnets[],natGateway,vpn},disasterRecovery:{rto,rpo,strategy},securityControls[],estimatedMonthlyCost}.`);
    return { success: true, data: this.parseJSON(raw, { securityControls: [] }) };
  }

  private async wellArchitectedReview(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const workload = String(params.workload ?? '');
    const pillar   = String(params.pillar ?? 'security');
    const raw = await this.ask(`Conduct a Well-Architected Review (${pillar} pillar) for: "${workload}".
Return JSON: {pillar,score,risks:[{question,risk,remediation}],improvementPlan[]}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async optimizeCost(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const context = String(params.context ?? '');
    const raw = await this.ask(`Create a cloud cost optimization plan for: "${context}".
Return JSON: {currentMonthlyCost,projectedMonthlyCost,savingsPercent,recommendations:[{resource,action,currentCost,projectedCost,effort}]}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async planMigration(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const workloads = String(params.workloads ?? '');
    const target    = String(params.target ?? 'aws');
    const raw = await this.ask(`Create a cloud migration plan (6R strategy) for ${target}: "${workloads}".
Return JSON: {strategy,phases:[{name,workloads[],migrationPattern,effort,risk}],totalEffortWeeks,prerequisites[]}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async generateIaC(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const resource = String(params.resource ?? '');
    const tool     = String(params.tool ?? 'terraform');
    const provider = String(params.provider ?? 'aws');
    const raw = await this.ask(`Generate production ${tool} code for ${provider} ${resource}. Include variables, outputs, and security best practices.
Return JSON: {tool,provider,resourceType,code,variables:{},outputs:{}}.`, 2048);
    return { success: true, data: this.parseJSON(raw, { code: '' }) };
  }
}
