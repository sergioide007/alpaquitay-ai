/**
 * Infrastructure Domain Agent Shell
 * ITIL v4 · ISO/IEC 20000-1 · ISO 22301 (Business Continuity)
 */

import { BaseDomainShell, UseCaseHandler } from '../shared/BaseDomainShell';
import type { DomainId, GuardrailResult } from '../interfaces/DomainAgentShell';

export class InfrastructureShell extends BaseDomainShell {
  readonly domainId: DomainId = 'infrastructure';
  readonly version = '1.0.0';

  protected useCaseHandlers(): Record<string, UseCaseHandler> {
    return {
      'plan-capacity':       this.planCapacity.bind(this),
      'design-network':      this.designNetwork.bind(this),
      'create-sla':          this.createSLA.bind(this),
      'plan-dr':             this.planDisasterRecovery.bind(this),
      'configure-monitoring':this.configureMonitoring.bind(this),
    };
  }

  protected domainGuardrails(output: unknown): GuardrailResult[] {
    const results: GuardrailResult[] = [];
    const o = output as Record<string, unknown>;
    if (o?.availabilityPercent !== undefined && Number(o.availabilityPercent) < 99.5) {
      results.push({ severity: 'warn', rule: 'INF-001', message: 'SLA below 99.5% — may not meet ISO/IEC 20000-1 service availability requirements.' });
    }
    if (o?.iso22301Compliant === false) {
      results.push({ severity: 'warn', rule: 'INF-002', message: 'DR plan not ISO 22301 compliant — business continuity risk.' });
    }
    return results;
  }

  private async planCapacity(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const context = String(params.context ?? '');
    const horizon = String(params.horizon ?? '12m');
    const raw = await this.ask(`Create a capacity plan (ITIL v4) for ${horizon}: "${context}".
Return JSON: {horizon,components:[{component,currentUtilization,projectedUtilization,trend,actionRequired,recommendation,estimatedCost}],totalInvestmentRequired,riskIfUnaddressed}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async designNetwork(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const requirements = String(params.requirements ?? '');
    const raw = await this.ask(`Design a network topology for: "${requirements}".
Return JSON: {type,segments:[{name,cidr,vlan,purpose}],firewallRules:[{from,to,port,protocol,action}],redundancyLevel,bandwidthMbps,securityZones[]}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async createSLA(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const service = String(params.service ?? '');
    const tier    = String(params.tier ?? 'gold');
    const raw = await this.ask(`Create an SLA contract (ISO/IEC 20000-1) for ${tier} tier: "${service}".
Return JSON: {tier,availabilityPercent,rto,rpo,maintenanceWindows[],penaltyTerms,escalationMatrix:[{level,contact,responseTime}]}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async planDisasterRecovery(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const system = String(params.system ?? '');
    const rto    = Number(params.rtoHours ?? 4);
    const raw = await this.ask(`Create a DR plan (ISO 22301) with RTO ${rto}h for: "${system}".
Return JSON: {rto,rpo,tier,recoverySteps[],testSchedule,iso22301Compliant,automationOpportunities[],estimatedCostPerYear}.`);
    return { success: true, data: this.parseJSON(raw, { iso22301Compliant: false }) };
  }

  private async configureMonitoring(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const system = String(params.system ?? '');
    const raw = await this.ask(`Configure observability (ITIL v4 monitoring) for: "${system}".
Return JSON: {metrics:[{name,threshold,unit,alertOn,severity}],dashboards[],retentionDays,anomalyDetection,sloTargets:[{sli,target,window}],alertingChannels[]}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }
}
