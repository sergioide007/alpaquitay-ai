/**
 * Process Management Domain Agent Shell
 * ISO 9001:2015 · BPM CBOK · BPMN 2.0 · CMMI · Six Sigma · ITIL v4
 */

import { BaseDomainShell, UseCaseHandler } from '../shared/BaseDomainShell';
import type { DomainId, GuardrailResult } from '../interfaces/DomainAgentShell';

export class ProcessShell extends BaseDomainShell {
  readonly domainId: DomainId = 'process';
  readonly version = '1.0.0';

  protected useCaseHandlers(): Record<string, UseCaseHandler> {
    return {
      'map-process':       this.mapProcess.bind(this),
      'gap-analysis':      this.gapAnalysis.bind(this),
      'value-stream-map':  this.valueStreamMap.bind(this),
      'iso-compliance':    this.isoCompliance.bind(this),
      'optimize-process':  this.optimizeProcess.bind(this),
    };
  }

  protected domainGuardrails(output: unknown): GuardrailResult[] {
    const results: GuardrailResult[] = [];
    const o = output as Record<string, unknown>;
    if (o?.certificationReady === false) {
      results.push({ severity: 'warn', rule: 'PRC-001', message: 'Organization not ready for ISO certification — critical gaps must be addressed first.' });
    }
    if (o?.overallScore !== undefined && Number(o.overallScore) < 50) {
      results.push({ severity: 'warn', rule: 'PRC-002', message: 'Process maturity below 50% — significant improvement needed before compliance audit.' });
    }
    return results;
  }

  private async mapProcess(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const process = String(params.process ?? '');
    const raw = await this.ask(`Map the business process (BPMN 2.0, ISO 9001) for: "${process}".
Return JSON: {id,name,owner,purpose,inputs[],outputs[],activities:[{id,name,type,responsible,durationMinutes,automatable,waste[],valueAdded}],kpis:[{name,formula,currentValue,targetValue,unit,isoReference}],risks[],controls[],cycleTimeHours,automationPercent,isoCompliance[]}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async gapAnalysis(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const framework      = String(params.framework ?? 'iso9001');
    const currentState   = String(params.currentState ?? '');
    const raw = await this.ask(`Perform a ${framework} gap analysis for: "${currentState}".
Return JSON: {framework,currentMaturity(1-5),targetMaturity(1-5),gaps:[{area,currentState,targetState,gap,priority,effortWeeks,benefit}],roadmap:[{phase,actions[],durationWeeks,milestone}]}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async valueStreamMap(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const product = String(params.product ?? '');
    const raw = await this.ask(`Create a Value Stream Map (Lean Six Sigma) for: "${product}".
Return JSON: {productFamily,customerDemand,totalCycleTime,totalLeadTime,valueAddedTime,processEfficiency,steps:[{name,cycleTime,waitTime,processEfficiency,valueAdded}],kaizens[]}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async isoCompliance(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const framework = String(params.framework ?? 'iso9001');
    const context   = String(params.context ?? '');
    const raw = await this.ask(`Check ${framework} compliance for: "${context}".
Return JSON: {framework,clauses:[{clause,title,status,evidence,corrective_action,deadline}],overallScore,certificationReady,criticalGaps[]}.`);
    return { success: true, data: this.parseJSON(raw, { certificationReady: false, overallScore: 0 }) };
  }

  private async optimizeProcess(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const process = String(params.process ?? '');
    const goal    = String(params.goal ?? 'reduce cycle time');
    const raw = await this.ask(`Optimize this process to ${goal} (Lean Six Sigma, BPMN 2.0): "${process}".
Return JSON: {currentCycleTime,targetCycleTime,improvementPercent,eliminatedWaste[],automationOpportunities[],quickWins[],longTermChanges[],estimatedROI}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }
}
