/**
 * Business Expert Domain Model
 * ISO 56002 (Innovation Management) · ISO 9001 · Balanced Scorecard
 * Business Model Canvas · OKR Framework · Porter's Five Forces
 */

export type BusinessModelPattern = 'platform' | 'saas' | 'marketplace' | 'freemium' | 'subscription' | 'transactional' | 'razor-blade' | 'franchise';
export type GrowthStage = 'idea' | 'mvp' | 'product-market-fit' | 'growth' | 'scale' | 'mature' | 'turnaround';
export type FinancialMetric = 'mrr' | 'arr' | 'cac' | 'ltv' | 'churn' | 'nps' | 'burn-rate' | 'runway' | 'ebitda' | 'gross-margin';
export type StrategicFramework = 'swot' | 'pestle' | 'porter-5' | 'okr' | 'bsc' | 'ansoff' | 'value-chain' | 'jobs-to-be-done';

export interface BusinessModelCanvas {
  valuePropositions: string[];
  customerSegments: string[];
  channels: string[];
  customerRelationships: string[];
  revenueStreams: Array<{ type: string; model: string; percentage: number }>;
  keyResources: string[];
  keyActivities: string[];
  keyPartnerships: string[];
  costStructure: Array<{ item: string; type: 'fixed' | 'variable'; percentage: number }>;
  unfairAdvantage: string;
  pattern: BusinessModelPattern;
}

export interface StrategicAnalysis {
  framework: StrategicFramework;
  findings: Record<string, string[]>;
  strategicInsights: string[];
  prioritizedOpportunities: Array<{ opportunity: string; impact: 'high' | 'medium' | 'low'; effort: 'high' | 'medium' | 'low'; timeframe: string }>;
  risksToWatch: string[];
  recommendedStrategy: string;
}

export interface OKRSet {
  cycle: string;
  objective: string;
  keyResults: Array<{
    description: string;
    metric: string;
    baseline: number;
    target: number;
    unit: string;
    currentValue?: number;
    confidence: number;
  }>;
  initiatives: string[];
  owner: string;
  alignedToCompanyOKR?: string;
}

export interface FinancialModel {
  scenario: 'conservative' | 'base' | 'optimistic';
  revenueProjections: Array<{ month: number; mrr: number; arr: number; customers: number }>;
  unitEconomics: { cac: number; ltv: number; ltvCacRatio: number; paybackMonths: number; grossMargin: number };
  burnRate: number;
  runway: number;
  breakEvenMonth: number;
  fundingRequired: number;
  keyAssumptions: string[];
  sensitivityAnalysis: Array<{ variable: string; pessimistic: number; base: number; optimistic: number }>;
}

export interface BusinessCase {
  title: string;
  executiveSummary: string;
  problemStatement: string;
  proposedSolution: string;
  stakeholders: Array<{ name: string; role: string; interest: string; influence: 'high' | 'medium' | 'low' }>;
  costBenefitAnalysis: { costs: Array<{ item: string; amount: number }>; benefits: Array<{ item: string; value: number; type: 'tangible' | 'intangible' }> };
  roi: number;
  paybackPeriodMonths: number;
  risks: Array<{ risk: string; probability: number; impact: number; mitigation: string }>;
  recommendation: string;
  implementationRoadmap: string[];
}

export interface MarketAnalysis {
  tam: number;
  sam: number;
  som: number;
  growthRate: number;
  competitors: Array<{ name: string; strengths: string[]; weaknesses: string[]; marketShare: number }>;
  trends: string[];
  entryBarriers: string[];
  differentiators: string[];
  goToMarketStrategy: string;
}
