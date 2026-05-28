/**
 * WellArchitectedShell — Unit Tests
 *
 * Covers: shell identity, 7 use cases, 3 guardrails, unknown use case.
 * AWS WAF 2023 · Azure WAF 2024 · GCP CAF · FinOps Foundation · DORA Metrics
 */

import { WellArchitectedShell } from '../../../domains/well-architected/WellArchitectedShell';
import type { AIProvider } from '../../../core/interfaces';

jest.mock('fs', () => ({
  existsSync:    jest.fn().mockReturnValue(false),
  mkdirSync:     jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync:  jest.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeProvider(jsonResponse: object = {}): AIProvider {
  return {
    name: 'MockAI',
    type: 'anthropic',
    modelName: 'mock-model',
    isAvailable: jest.fn().mockResolvedValue(true),
    chat: jest.fn(),
    complete: jest.fn().mockResolvedValue(JSON.stringify(jsonResponse)),
  };
}

async function buildShell(provider: AIProvider): Promise<WellArchitectedShell> {
  const shell = new WellArchitectedShell();
  await shell.initialize(provider, '/tmp/test-workspace');
  return shell;
}

function makePillars(securityScore = 80, reliabilityScore = 75) {
  return [
    { pillar: 'security',     score: securityScore,    maturityLevel: 3, risks: [], quickWins: [], improvementPlan: [] },
    { pillar: 'reliability',  score: reliabilityScore, maturityLevel: 3, risks: [], quickWins: [], improvementPlan: [] },
    { pillar: 'cost',         score: 70,               maturityLevel: 2, risks: [], quickWins: [], improvementPlan: [] },
  ];
}

// ── Shell identity ────────────────────────────────────────────────────────────

describe('WellArchitectedShell — identity', () => {
  it('Has domainId "well-architected"', async () => {
    const shell = await buildShell(makeProvider());
    expect(shell.domainId).toBe('well-architected');
  });

  it('Has version "1.0.0"', async () => {
    const shell = await buildShell(makeProvider());
    expect(shell.version).toBe('1.0.0');
  });
});

// ── aws-waf-full-review ───────────────────────────────────────────────────────

describe('WellArchitectedShell — aws-waf-full-review', () => {
  it('When called, Then returns pillars array and overallScore', async () => {
    const response = {
      provider: 'aws', workloadName: 'e-commerce', reviewDate: '2026-05-26',
      pillars: makePillars(), overallScore: 75, highRiskCount: 2, mediumRiskCount: 5,
      topPriorities: ['Enable MFA on all IAM roles', 'Implement multi-AZ'],
      execSummary: 'Good posture overall.',
    };
    const shell = await buildShell(makeProvider(response));
    const result = await shell.run('aws-waf-full-review', { workload: 'e-commerce platform' });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(Array.isArray(data.pillars)).toBe(true);
    expect(typeof data.overallScore).toBe('number');
  });

  it('Given invalid AI response, When called, Then returns fallback with empty pillars', async () => {
    const provider = makeProvider();
    (provider.complete as jest.Mock).mockResolvedValue('not json at all');
    const shell = await buildShell(provider);
    const result = await shell.run('aws-waf-full-review', { workload: 'test' });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).pillars).toEqual([]);
  });
});

// ── azure-waf-review ──────────────────────────────────────────────────────────

describe('WellArchitectedShell — azure-waf-review', () => {
  it('When called, Then returns provider "azure" and pillars', async () => {
    const response = {
      provider: 'azure', workloadName: 'hr-portal', reviewDate: '2026-05-26',
      pillars: makePillars(85, 80), overallScore: 80, highRiskCount: 1, mediumRiskCount: 3,
      topPriorities: ['Enable Defender for Cloud'], execSummary: 'Strong Azure posture.',
    };
    const shell = await buildShell(makeProvider(response));
    const result = await shell.run('azure-waf-review', { workload: 'hr-portal' });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).provider).toBe('azure');
  });
});

// ── gcp-caf-review ────────────────────────────────────────────────────────────

describe('WellArchitectedShell — gcp-caf-review', () => {
  it('When called, Then returns provider "gcp" and pillars', async () => {
    const response = {
      provider: 'gcp', workloadName: 'data-platform', reviewDate: '2026-05-26',
      pillars: makePillars(78, 82), overallScore: 77, highRiskCount: 2, mediumRiskCount: 4,
      topPriorities: ['Enable VPC Service Controls'], execSummary: 'Good GCP posture.',
    };
    const shell = await buildShell(makeProvider(response));
    const result = await shell.run('gcp-caf-review', { workload: 'data-platform' });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).provider).toBe('gcp');
  });
});

// ── multi-cloud-comparison ────────────────────────────────────────────────────

describe('WellArchitectedShell — multi-cloud-comparison', () => {
  it('When called, Then returns providers array and a winner', async () => {
    const response = {
      workload: 'microservices-app',
      providers: [
        { provider: 'aws', overallScore: 82, strengths: ['Mature ecosystem'], weaknesses: ['Lock-in'],
          estimatedMonthlyCost: 5000, vendorLockInRisk: 'high', recommendation: 'Best for enterprise.' },
        { provider: 'azure', overallScore: 79, strengths: ['Azure AD'], weaknesses: ['Cost'],
          estimatedMonthlyCost: 4800, vendorLockInRisk: 'medium', recommendation: 'Best for Microsoft shops.' },
        { provider: 'gcp', overallScore: 77, strengths: ['BigQuery'], weaknesses: ['Smaller ecosystem'],
          estimatedMonthlyCost: 4500, vendorLockInRisk: 'low', recommendation: 'Best for data workloads.' },
      ],
      winner: 'aws',
      multiCloudFeasibility: 'Feasible with Terraform and container abstraction.',
    };
    const shell = await buildShell(makeProvider(response));
    const result = await shell.run('multi-cloud-comparison', { workload: 'microservices', providers: ['aws', 'azure', 'gcp'] });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(Array.isArray(data.providers)).toBe(true);
    expect((data.providers as unknown[]).length).toBe(3);
    expect(data.winner).toBe('aws');
  });
});

// ── operational-excellence-scorecard ─────────────────────────────────────────

describe('WellArchitectedShell — operational-excellence-scorecard', () => {
  it('When called, Then returns DORA metrics with tier classification', async () => {
    const response = {
      workload: 'checkout-service',
      doraMetrics: {
        deploymentFrequency: { value: 'Multiple times per day', tier: 'elite' },
        leadTimeForChanges:  { value: '< 1 hour',              tier: 'elite' },
        changeFailureRate:   { value: '3%',                    tier: 'elite' },
        meanTimeToRestore:   { value: '< 30 minutes',          tier: 'elite' },
      },
      sreGoldenSignals: { latencyP99ms: 120, errorRatePercent: 0.5, trafficRPS: 3200, saturationPercent: 42 },
      observabilityMaturity: 4,
      automationLevel: 87,
      recommendations: ['Add distributed tracing', 'Set error budget alerts'],
    };
    const shell = await buildShell(makeProvider(response));
    const result = await shell.run('operational-excellence-scorecard', { workload: 'checkout-service', metrics: {} });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    const dora = data.doraMetrics as Record<string, unknown>;
    expect((dora.deploymentFrequency as Record<string, string>).tier).toBe('elite');
  });
});

// ── sustainability-assessment ─────────────────────────────────────────────────

describe('WellArchitectedShell — sustainability-assessment', () => {
  it('When called, Then returns carbonFootprint and green region recommendations', async () => {
    const response = {
      provider: 'aws', workload: 'batch-processing',
      carbonFootprintKgCO2ePerMonth: 124,
      energyEfficiencyScore: 62,
      recommendations: [
        { action: 'Move to eu-west-1 (Ireland, 100% renewable)', estimatedCO2Savings: '40%',
          estimatedCostSavings: '5%', effort: 'low' }
      ],
      greenRegions: ['eu-west-1', 'us-west-2'],
      sdgAlignment: ['SDG 7', 'SDG 13'],
    };
    const shell = await buildShell(makeProvider(response));
    const result = await shell.run('sustainability-assessment', { workload: 'batch-processing', provider: 'aws' });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(typeof data.carbonFootprintKgCO2ePerMonth).toBe('number');
    expect(Array.isArray(data.greenRegions)).toBe(true);
  });
});

// ── finops-review ─────────────────────────────────────────────────────────────

describe('WellArchitectedShell — finops-review', () => {
  it('When called, Then returns savings opportunities and wasted spend percent', async () => {
    const response = {
      phase: 'optimize',
      currentMonthlyCost: 48000,
      wastedSpendPercent: 28,
      savingsOpportunities: [
        { category: 'rightsizing', description: 'Downsize m5.2xlarge to m5.xlarge',
          monthlySavings: 3200, effort: 'low', risk: 'low' }
      ],
      unitEconomics: { costPerUser: 2.40, costPerTransaction: 0.012, costPerGBStorage: 0.023 },
      maturityLevel: 2,
      nextActions: ['Tag all resources for cost allocation', 'Set budget alerts'],
    };
    const shell = await buildShell(makeProvider(response));
    const result = await shell.run('finops-review', { context: 'SaaS platform $48k/month AWS' });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(Array.isArray(data.savingsOpportunities)).toBe(true);
    expect(typeof data.wastedSpendPercent).toBe('number');
  });
});

// ── Guardrails ────────────────────────────────────────────────────────────────

describe('WellArchitectedShell — guardrails', () => {
  describe('WAF-001 — security pillar score < 60', () => {
    it('Given security pillar score = 55, When guardrails run, Then WAF-001 blocks', async () => {
      const response = {
        pillars: [{ pillar: 'security', score: 55, maturityLevel: 1, risks: [], quickWins: [], improvementPlan: [] }],
        overallScore: 55,
      };
      const shell = await buildShell(makeProvider(response));
      const result = await shell.run('aws-waf-full-review', { workload: 'test' });
      const block = (result.guardrailResults ?? []).find(g => g.rule === 'WAF-001');
      expect(block).toBeDefined();
      expect(block?.severity).toBe('block');
    });

    it('Given security pillar score = 60, When guardrails run, Then WAF-001 does NOT fire', async () => {
      const response = {
        pillars: [{ pillar: 'security', score: 60, maturityLevel: 2, risks: [], quickWins: [], improvementPlan: [] }],
        overallScore: 60,
      };
      const shell = await buildShell(makeProvider(response));
      const result = await shell.run('aws-waf-full-review', { workload: 'test' });
      const block = (result.guardrailResults ?? []).find(g => g.rule === 'WAF-001');
      expect(block).toBeUndefined();
    });
  });

  describe('WAF-002 — reliability pillar score < 70', () => {
    it('Given reliability pillar score = 65, When guardrails run, Then WAF-002 warns', async () => {
      const response = {
        pillars: [
          { pillar: 'security',    score: 80, maturityLevel: 3, risks: [], quickWins: [], improvementPlan: [] },
          { pillar: 'reliability', score: 65, maturityLevel: 2, risks: [], quickWins: [], improvementPlan: [] },
        ],
        overallScore: 72,
      };
      const shell = await buildShell(makeProvider(response));
      const result = await shell.run('aws-waf-full-review', { workload: 'test' });
      const warn = (result.guardrailResults ?? []).find(g => g.rule === 'WAF-002');
      expect(warn).toBeDefined();
      expect(warn?.severity).toBe('warn');
    });
  });

  describe('WAF-003 — wasted cloud spend > 30%', () => {
    it('Given wastedSpendPercent = 35, When guardrails run, Then WAF-003 warns', async () => {
      const response = { savingsOpportunities: [], wastedSpendPercent: 35, phase: 'inform' };
      const shell = await buildShell(makeProvider(response));
      const result = await shell.run('finops-review', { context: 'test' });
      const warn = (result.guardrailResults ?? []).find(g => g.rule === 'WAF-003');
      expect(warn).toBeDefined();
      expect(warn?.severity).toBe('warn');
    });

    it('Given wastedSpendPercent = 30, When guardrails run, Then WAF-003 does NOT fire', async () => {
      const response = { savingsOpportunities: [], wastedSpendPercent: 30, phase: 'optimize' };
      const shell = await buildShell(makeProvider(response));
      const result = await shell.run('finops-review', { context: 'test' });
      const warn = (result.guardrailResults ?? []).find(g => g.rule === 'WAF-003');
      expect(warn).toBeUndefined();
    });
  });
});

// ── Unknown use case ──────────────────────────────────────────────────────────

describe('WellArchitectedShell — unknown use case', () => {
  it('When called with an unknown id, Then returns success=false', async () => {
    const shell = await buildShell(makeProvider());
    const result = await shell.run('unknown-pillar', {});
    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain('unknown-pillar');
  });
});
