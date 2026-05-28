/**
 * Well-Architected Domain Model
 *
 * Standards:
 *   AWS Well-Architected Framework 2023 (6 pillars)
 *   Azure Well-Architected Framework 2024 (5 pillars)
 *   Google Cloud Architecture Framework (5 pillars)
 *   FinOps Foundation Framework (Inform/Optimize/Operate)
 *   DORA Metrics + SRE Golden Signals
 *   ISO/IEC 25010 — Software Quality Characteristics
 */

export type AWSPillar    = 'operational-excellence' | 'security' | 'reliability' | 'performance-efficiency' | 'cost-optimization' | 'sustainability';
export type AzurePillar  = 'reliability' | 'security' | 'cost-optimization' | 'operational-excellence' | 'performance-efficiency';
export type GCPPillar    = 'operational-excellence' | 'security' | 'reliability' | 'scalability' | 'cost-optimization';
export type CloudProvider = 'aws' | 'azure' | 'gcp';
export type RiskLevel    = 'high' | 'medium' | 'low' | 'none';
export type FinOpsPhase  = 'inform' | 'optimize' | 'operate';

export interface WAFPillarScore {
  pillar: string;
  score: number;
  maturityLevel: 1 | 2 | 3 | 4 | 5;
  risks: Array<{
    id: string;
    question: string;
    risk: RiskLevel;
    impact: string;
    remediation: string;
    effort: 'low' | 'medium' | 'high';
    priority: 1 | 2 | 3;
  }>;
  quickWins: string[];
  improvementPlan: Array<{ action: string; effort: string; expectedImpact: string }>;
}

export interface FullWAFReview {
  provider: CloudProvider;
  workloadName: string;
  reviewDate: string;
  pillars: WAFPillarScore[];
  overallScore: number;
  highRiskCount: number;
  mediumRiskCount: number;
  topPriorities: string[];
  execSummary: string;
}

export interface MultiCloudComparison {
  workload: string;
  providers: Array<{
    provider: CloudProvider;
    overallScore: number;
    strengths: string[];
    weaknesses: string[];
    estimatedMonthlyCost: number;
    vendorLockInRisk: 'low' | 'medium' | 'high';
    recommendation: string;
  }>;
  winner: CloudProvider;
  multiCloudFeasibility: string;
}

export interface OEScorecard {
  workload: string;
  doraMetrics: {
    deploymentFrequency: { value: string; tier: 'elite' | 'high' | 'medium' | 'low' };
    leadTimeForChanges:  { value: string; tier: 'elite' | 'high' | 'medium' | 'low' };
    changeFailureRate:   { value: string; tier: 'elite' | 'high' | 'medium' | 'low' };
    meanTimeToRestore:   { value: string; tier: 'elite' | 'high' | 'medium' | 'low' };
  };
  sreGoldenSignals: {
    latencyP99ms: number;
    errorRatePercent: number;
    trafficRPS: number;
    saturationPercent: number;
  };
  observabilityMaturity: 1 | 2 | 3 | 4 | 5;
  automationLevel: number;
  recommendations: string[];
}

export interface SustainabilityAssessment {
  provider: CloudProvider;
  workload: string;
  carbonFootprintKgCO2ePerMonth: number;
  energyEfficiencyScore: number;
  recommendations: Array<{
    action: string;
    estimatedCO2Savings: string;
    estimatedCostSavings: string;
    effort: 'low' | 'medium' | 'high';
  }>;
  greenRegions: string[];
  sdgAlignment: string[];
}

export interface FinOpsReview {
  phase: FinOpsPhase;
  currentMonthlyCost: number;
  wastedSpendPercent: number;
  savingsOpportunities: Array<{
    category: 'rightsizing' | 'reserved-instances' | 'spot' | 'unused-resources' | 'storage-tiering' | 'data-transfer';
    description: string;
    monthlySavings: number;
    effort: 'low' | 'medium' | 'high';
    risk: 'low' | 'medium' | 'high';
  }>;
  unitEconomics: { costPerUser: number; costPerTransaction: number; costPerGBStorage: number };
  maturityLevel: 1 | 2 | 3;
  nextActions: string[];
}
