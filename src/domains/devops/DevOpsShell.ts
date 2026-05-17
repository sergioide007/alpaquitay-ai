/**
 * DevOps Domain Agent Shell
 * DORA Metrics · ISO/IEC 20000-1 · ITIL v4 · GitOps
 */

import { BaseDomainShell, UseCaseHandler } from '../shared/BaseDomainShell';
import type { DomainId, GuardrailResult } from '../interfaces/DomainAgentShell';

export class DevOpsShell extends BaseDomainShell {
  readonly domainId: DomainId = 'devops';
  readonly version = '1.0.0';

  protected useCaseHandlers(): Record<string, UseCaseHandler> {
    return {
      'design-pipeline':      this.designPipeline.bind(this),
      'assess-dora':          this.assessDORA.bind(this),
      'plan-deployment':      this.planDeployment.bind(this),
      'generate-iac':         this.generateIaC.bind(this),
      'create-runbook':       this.createRunbook.bind(this),
    };
  }

  protected domainGuardrails(output: unknown): GuardrailResult[] {
    const results: GuardrailResult[] = [];
    const o = output as Record<string, unknown>;
    if (o?.strategy === 'recreate' && o?.environment === 'production') {
      results.push({ severity: 'block', rule: 'DO-001', message: '"Recreate" strategy causes downtime — not allowed in production (ISO/IEC 20000-1 availability SLA).' });
    }
    return results;
  }

  private async designPipeline(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const stack = String(params.stack ?? '');
    const raw = await this.ask(`Design a CI/CD pipeline (GitOps, DORA elite tier) for: "${stack}".
Return JSON: {id,name,stages[],triggers[],estimatedDurationMinutes,parallelJobs,qualityGates[],isSelfHealing,yamlSnippet}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async assessDORA(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const metrics = params.metrics ?? {};
    const raw = await this.ask(`Assess DORA metrics: ${JSON.stringify(metrics)}.
Return JSON: {deploymentFrequency,leadTimeForChanges,changeFailureRate,meanTimeToRestore,performanceTier,improvements:[],benchmarkComparison}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async planDeployment(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const service = String(params.service ?? '');
    const env     = String(params.environment ?? 'production');
    const raw = await this.ask(`Plan a zero-downtime deployment for "${service}" to ${env}.
Return JSON: {strategy,environment,healthChecks[],rollbackTriggers[],trafficShiftPercentages,observabilityChecks[],estimatedDowntimeSeconds,approvalGates[]}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async generateIaC(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const resource = String(params.resource ?? '');
    const tool     = String(params.tool ?? 'terraform');
    const provider = String(params.provider ?? 'aws');
    const raw = await this.ask(`Generate production-ready ${tool} code for ${provider} ${resource}.
Return JSON: {tool,provider,resourceType,code,variables:{name:{type,description,default}},outputs:{name:{description,value}}}.`, 2048);
    return { success: true, data: this.parseJSON(raw, { code: '' }) };
  }

  private async createRunbook(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const incident = String(params.incident ?? '');
    const raw = await this.ask(`Create an incident runbook for: "${incident}" (ITIL v4, ISO/IEC 20000-1).
Return JSON: {id,severity,title,runbook[],escalationPath[],postMortemTemplate,sloImpact,mttrTargetMinutes,automationOpportunities[]}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }
}
