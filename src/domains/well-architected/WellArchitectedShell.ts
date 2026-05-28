/**
 * Well-Architected Domain Agent Shell
 *
 * Standards:
 *   AWS Well-Architected Framework 2023 — 6 pillars
 *   Azure Well-Architected Framework 2024 — 5 pillars
 *   Google Cloud Architecture Framework — 5 pillars
 *   FinOps Foundation Framework — Inform / Optimize / Operate
 *   DORA Metrics (2023 State of DevOps Report)
 *   SRE Golden Signals — Latency, Traffic, Errors, Saturation
 *   ISO/IEC 25010 — Reliability, Performance Efficiency, Maintainability
 *
 * Operational Excellence mandate: elite DORA tier targets —
 *   Deployment frequency: on-demand (multiple/day)
 *   Lead time for changes: < 1 hour
 *   Change failure rate: < 5%
 *   Mean time to restore: < 1 hour
 */

import { BaseDomainShell, UseCaseHandler } from '../shared/BaseDomainShell';
import type { DomainId, GuardrailResult } from '../interfaces/DomainAgentShell';

export class WellArchitectedShell extends BaseDomainShell {
  readonly domainId: DomainId = 'well-architected';
  readonly version = '1.0.0';

  protected useCaseHandlers(): Record<string, UseCaseHandler> {
    return {
      'aws-waf-full-review':           this.awsWAFFullReview.bind(this),
      'azure-waf-review':              this.azureWAFReview.bind(this),
      'gcp-caf-review':                this.gcpCAFReview.bind(this),
      'multi-cloud-comparison':        this.multiCloudComparison.bind(this),
      'operational-excellence-scorecard': this.operationalExcellenceScorecard.bind(this),
      'sustainability-assessment':     this.sustainabilityAssessment.bind(this),
      'finops-review':                 this.finopsReview.bind(this),
    };
  }

  protected domainGuardrails(output: unknown): GuardrailResult[] {
    const results: GuardrailResult[] = [];
    const o = output as Record<string, unknown>;

    // Block if security pillar score < 60 (unacceptable risk)
    const pillars = Array.isArray(o?.pillars) ? o.pillars as Record<string, unknown>[] : [];
    const secPillar = pillars.find(p => String(p.pillar ?? '').includes('security'));
    if (secPillar && typeof secPillar.score === 'number' && secPillar.score < 60) {
      results.push({
        severity: 'block',
        rule: 'WAF-001',
        message: `Security pillar score ${secPillar.score}/100 is below minimum threshold (60). Remediate HIGH risks before deployment.`,
      });
    }

    // Warn if no multi-region strategy and reliability score < 70
    const relPillar = pillars.find(p => String(p.pillar ?? '').includes('reliab'));
    if (relPillar && typeof relPillar.score === 'number' && relPillar.score < 70) {
      results.push({
        severity: 'warn',
        rule: 'WAF-002',
        message: `Reliability pillar score ${relPillar.score}/100 — review RTO/RPO targets and consider multi-region active-active strategy.`,
      });
    }

    // Warn on high wasted cloud spend
    if (typeof o?.wastedSpendPercent === 'number' && o.wastedSpendPercent > 30) {
      results.push({
        severity: 'warn',
        rule: 'WAF-003',
        message: `${o.wastedSpendPercent}% cloud spend is wasted — FinOps optimization required (FinOps Foundation Phase: Optimize).`,
      });
    }

    return results;
  }

  private async awsWAFFullReview(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const workload = String(params.workload ?? '');
    const raw = await this.ask(`Conduct a comprehensive AWS Well-Architected Framework review for: "${workload}".

Review all 6 pillars against the 2023 AWS WAF lens:
1. Operational Excellence — OPS 1-11 (observability, deployment automation, runbooks)
2. Security — SEC 1-10 (IAM, detective controls, infrastructure protection, data protection)
3. Reliability — REL 1-12 (foundations, workload architecture, change management, failure management)
4. Performance Efficiency — PERF 1-8 (selection, review, monitoring, tradeoffs)
5. Cost Optimization — COST 1-12 (cloud financial management, expenditure awareness, cost-effective resources)
6. Sustainability — SUS 1-6 (region selection, user behavior patterns, software and architecture, data patterns)

Return JSON:
{
  provider: "aws",
  workloadName: string,
  reviewDate: string,
  pillars: [{
    pillar: string,
    score: number,
    maturityLevel: 1-5,
    risks: [{
      id: string, question: string, risk: "high"|"medium"|"low",
      impact: string, remediation: string, effort: string, priority: 1|2|3
    }],
    quickWins: string[],
    improvementPlan: [{ action: string, effort: string, expectedImpact: string }]
  }],
  overallScore: number,
  highRiskCount: number,
  mediumRiskCount: number,
  topPriorities: string[],
  execSummary: string
}`, 3000);

    return { success: true, data: this.parseJSON(raw, { pillars: [], overallScore: 0 }) };
  }

  private async azureWAFReview(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const workload = String(params.workload ?? '');
    const raw = await this.ask(`Conduct an Azure Well-Architected Framework review for: "${workload}".

Review all 5 Azure WAF pillars (2024 guidance):
1. Reliability — failure mode analysis, redundancy, recovery, testing
2. Security — identity, network controls, data sovereignty, threat detection (Microsoft Defender)
3. Cost Optimization — cost governance, rightsizing, reserved/savings plans, Azure Advisor
4. Operational Excellence — DevOps practices, monitoring (Azure Monitor + Log Analytics), runbooks
5. Performance Efficiency — scaling patterns, caching, CDN, Azure Front Door, load testing

Include Azure-specific services: Entra ID, Azure Policy, Defender for Cloud, Monitor, Cost Management.

Return JSON:
{
  provider: "azure",
  workloadName: string,
  reviewDate: string,
  pillars: [{
    pillar: string,
    score: number,
    maturityLevel: 1-5,
    risks: [{ id, question, risk, impact, remediation, effort, priority }],
    quickWins: string[],
    improvementPlan: [{ action, effort, expectedImpact }]
  }],
  overallScore: number,
  highRiskCount: number,
  mediumRiskCount: number,
  topPriorities: string[],
  execSummary: string
}`, 2500);

    return { success: true, data: this.parseJSON(raw, { pillars: [], overallScore: 0 }) };
  }

  private async gcpCAFReview(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const workload = String(params.workload ?? '');
    const raw = await this.ask(`Conduct a Google Cloud Architecture Framework review for: "${workload}".

Review all 5 GCP CAF pillars:
1. Operational Excellence — SRE principles, error budgets, SLI/SLO/SLA, Cloud Operations suite
2. Security — BeyondCorp, VPC Service Controls, Cloud Armor, Binary Authorization, Secret Manager
3. Reliability — Cloud Load Balancing, Cloud DNS, Spanner (global consistency), Pub/Sub, chaos testing
4. Scalability — GKE Autopilot, Cloud Run, BigQuery autoscaling, horizontal pod autoscaling
5. Cost Optimization — Committed Use Discounts, Spot VMs, Cloud Billing, Recommender API

Include GCP-specific patterns: BeyondProd, Borg-inspired design, Global Anycast, Andromeda SDN.

Return JSON:
{
  provider: "gcp",
  workloadName: string,
  reviewDate: string,
  pillars: [{
    pillar: string,
    score: number,
    maturityLevel: 1-5,
    risks: [{ id, question, risk, impact, remediation, effort, priority }],
    quickWins: string[],
    improvementPlan: [{ action, effort, expectedImpact }]
  }],
  overallScore: number,
  highRiskCount: number,
  mediumRiskCount: number,
  topPriorities: string[],
  execSummary: string
}`, 2500);

    return { success: true, data: this.parseJSON(raw, { pillars: [], overallScore: 0 }) };
  }

  private async multiCloudComparison(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const workload   = String(params.workload ?? '');
    const providers  = (params.providers as string[]) ?? ['aws', 'azure', 'gcp'];
    const raw = await this.ask(`Compare ${providers.join(', ')} for workload: "${workload}".

Apply Well-Architected criteria from each provider's framework.
Evaluate: security posture, reliability SLAs, cost structure, operational tooling, vendor lock-in risk,
AI/ML services maturity, compliance certifications, data residency options, edge capabilities.

Return JSON:
{
  workload: string,
  providers: [{
    provider: string,
    overallScore: number,
    strengths: string[],
    weaknesses: string[],
    estimatedMonthlyCost: number,
    vendorLockInRisk: "low"|"medium"|"high",
    recommendation: string
  }],
  winner: string,
  multiCloudFeasibility: string
}`, 2048);

    return { success: true, data: this.parseJSON(raw, { providers: [] }) };
  }

  private async operationalExcellenceScorecard(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const workload = String(params.workload ?? '');
    const metrics  = params.metrics ?? {};
    const raw = await this.ask(`Generate an Operational Excellence Scorecard for: "${workload}".
Current metrics: ${JSON.stringify(metrics)}.

Evaluate against DORA 2023 elite tier benchmarks:
  Deployment Frequency: multiple times/day (elite), 1/day-1/week (high), 1/week-1/month (medium), < 1/month (low)
  Lead Time for Changes: < 1 hour (elite), 1 day-1 week (high), 1 week-1 month (medium), > 6 months (low)
  Change Failure Rate: < 5% (elite), 5-10% (high), 10-15% (medium), > 15% (low)
  Mean Time to Restore: < 1 hour (elite), < 1 day (high), 1 day-1 week (medium), > 1 week (low)

Also evaluate SRE Golden Signals and observability maturity (L1: logs, L2: metrics, L3: traces, L4: continuous profiling, L5: AI-assisted).

Return JSON:
{
  workload: string,
  doraMetrics: {
    deploymentFrequency:  { value: string, tier: "elite"|"high"|"medium"|"low" },
    leadTimeForChanges:   { value: string, tier: "elite"|"high"|"medium"|"low" },
    changeFailureRate:    { value: string, tier: "elite"|"high"|"medium"|"low" },
    meanTimeToRestore:    { value: string, tier: "elite"|"high"|"medium"|"low" }
  },
  sreGoldenSignals: { latencyP99ms: number, errorRatePercent: number, trafficRPS: number, saturationPercent: number },
  observabilityMaturity: 1-5,
  automationLevel: number,
  recommendations: string[]
}`, 1500);

    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async sustainabilityAssessment(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const workload = String(params.workload ?? '');
    const provider = String(params.provider ?? 'aws');
    const raw = await this.ask(`Assess cloud sustainability for workload: "${workload}" on ${provider}.

Apply ${provider === 'aws' ? 'AWS Sustainability Pillar (SUS 1-6)' : provider === 'azure' ? 'Microsoft Cloud for Sustainability' : 'Google Cloud Carbon Footprint'} framework.

Areas: region carbon intensity, instance utilization, storage efficiency, data transfer optimization,
serverless/container adoption (higher density = lower footprint), workload scheduling (off-peak = greener regions).

Return JSON:
{
  provider: string,
  workload: string,
  carbonFootprintKgCO2ePerMonth: number,
  energyEfficiencyScore: number,
  recommendations: [{
    action: string,
    estimatedCO2Savings: string,
    estimatedCostSavings: string,
    effort: "low"|"medium"|"high"
  }],
  greenRegions: string[],
  sdgAlignment: string[]
}

SDG alignment: SDG 7 (Affordable Clean Energy), SDG 12 (Responsible Consumption), SDG 13 (Climate Action).`, 1500);

    return { success: true, data: this.parseJSON(raw, { recommendations: [], greenRegions: [] }) };
  }

  private async finopsReview(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const context = String(params.context ?? '');
    const raw = await this.ask(`Conduct a FinOps Foundation Framework review for: "${context}".

Apply the FinOps lifecycle: Inform → Optimize → Operate.
Evaluate cost allocation (showback/chargeback), unit economics, anomaly detection, budget governance.

Identify savings opportunities across: rightsizing, reserved instances/savings plans, spot/preemptible,
unused resources, storage tiering (S3 Intelligent-Tiering / Azure Archive / GCS Nearline), data transfer.

Return JSON:
{
  phase: "inform"|"optimize"|"operate",
  currentMonthlyCost: number,
  wastedSpendPercent: number,
  savingsOpportunities: [{
    category: "rightsizing"|"reserved-instances"|"spot"|"unused-resources"|"storage-tiering"|"data-transfer",
    description: string,
    monthlySavings: number,
    effort: "low"|"medium"|"high",
    risk: "low"|"medium"|"high"
  }],
  unitEconomics: { costPerUser: number, costPerTransaction: number, costPerGBStorage: number },
  maturityLevel: 1|2|3,
  nextActions: string[]
}`, 1500);

    return { success: true, data: this.parseJSON(raw, { savingsOpportunities: [], wastedSpendPercent: 0 }) };
  }
}
