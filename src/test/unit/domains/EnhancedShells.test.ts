/**
 * Enhanced Domain Shells v2.0 — Unit Tests
 *
 * Covers new use cases added in v3.1.0:
 *   SecurityShell v2    — assess-quantum-risk, supply-chain-security
 *   DevSecOpsShell v2   — assess-slsa, generate-sigstore-policy, assess-cnapp
 *   CloudShell v2       — chaos-engineering-plan, sustainability-review
 */

import { SecurityShell }   from '../../../domains/security/SecurityShell';
import { DevSecOpsShell }  from '../../../domains/devsecops/DevSecOpsShell';
import { CloudShell }      from '../../../domains/cloud/CloudShell';
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

// ── SecurityShell v2 — version ────────────────────────────────────────────────

describe('SecurityShell v2 — identity', () => {
  it('Has version "2.0.0"', async () => {
    const shell = new SecurityShell();
    await shell.initialize(makeProvider(), '/tmp/test-workspace');
    expect(shell.version).toBe('2.0.0');
  });
});

// ── SecurityShell v2 — assess-quantum-risk ────────────────────────────────────

describe('SecurityShell v2 — assess-quantum-risk', () => {
  it('When called, Then returns vulnerableAlgorithms with pqcReplacement', async () => {
    const response = {
      systemName: 'auth-api',
      overallQuantumRiskLevel: 'high',
      harvestNowDecryptLaterExposure: true,
      vulnerableAlgorithms: [
        { algorithm: 'RSA-2048', usage: 'JWT signing key', quantumAttack: 'shors',
          urgency: 'within-1-year', pqcReplacement: 'ML-DSA-65', migrationEffort: 'weeks' },
        { algorithm: 'AES-128',  usage: 'session encryption', quantumAttack: 'grovers',
          urgency: 'within-3-years', pqcReplacement: 'AES-256',  migrationEffort: 'days' },
      ],
      prioritizedActions: ['Replace RSA-2048 JWT signing with ML-DSA-65', 'Upgrade AES-128 to AES-256'],
      complianceDeadlines: [{ standard: 'NSA CNSA 2.0', deadline: '2030', requirement: 'Migrate all algorithms' }],
    };
    const shell = new SecurityShell();
    await shell.initialize(makeProvider(response), '/tmp/test-workspace');
    const result = await shell.run('assess-quantum-risk', { system: 'auth-api' });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(Array.isArray(data.vulnerableAlgorithms)).toBe(true);
    expect(data.harvestNowDecryptLaterExposure).toBe(true);
  });

  it('Given empty AI response, When called, Then returns fallback with empty vulnerableAlgorithms', async () => {
    const provider = makeProvider();
    (provider.complete as jest.Mock).mockResolvedValue('broken json }{');
    const shell = new SecurityShell();
    await shell.initialize(provider, '/tmp/test-workspace');
    const result = await shell.run('assess-quantum-risk', { system: 'test' });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).vulnerableAlgorithms).toEqual([]);
  });
});

// ── SecurityShell v2 — supply-chain-security ──────────────────────────────────

describe('SecurityShell v2 — supply-chain-security', () => {
  it('When called, Then returns slsaLevel and criticalFindings', async () => {
    const response = {
      projectName: 'alpaquitay-ai',
      slsaLevel: 2,
      openssfScore: 68,
      sourceIntegrity: { twoPersonReview: true, branchProtection: true, signedCommits: false },
      buildIntegrity: { hermeticBuild: false, reproducibleBuild: false, provenanceAttestation: true },
      artifactSigning: { enabled: true, tool: 'cosign', keyManagement: 'keyless OIDC' },
      dependencyRisks: [
        { package: 'some-dep@1.2.3', risk: 'Outdated with known CVE', recommendation: 'Upgrade to 1.2.5' }
      ],
      sbomStatus: 'partial',
      criticalFindings: ['No hermetic builds — build environment not isolated'],
      remediationPlan: [
        { action: 'Enable hermetic builds in GitHub Actions', slsaLevelGain: 1, effort: 'medium' }
      ],
    };
    const shell = new SecurityShell();
    await shell.initialize(makeProvider(response), '/tmp/test-workspace');
    const result = await shell.run('supply-chain-security', { project: 'alpaquitay-ai' });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(typeof data.slsaLevel).toBe('number');
    expect(Array.isArray(data.criticalFindings)).toBe(true);
  });
});

// ── DevSecOpsShell v2 — version ───────────────────────────────────────────────

describe('DevSecOpsShell v2 — identity', () => {
  it('Has version "2.0.0"', async () => {
    const shell = new DevSecOpsShell();
    await shell.initialize(makeProvider(), '/tmp/test-workspace');
    expect(shell.version).toBe('2.0.0');
  });
});

// ── DevSecOpsShell v2 — assess-slsa ───────────────────────────────────────────

describe('DevSecOpsShell v2 — assess-slsa', () => {
  it('When called, Then returns currentSLSALevel and gaps', async () => {
    const response = {
      projectName: 'payment-service',
      currentSLSALevel: 1,
      targetSLSALevel: 3,
      tracks: {
        source:     { twoPersonReview: true,  versionControlled: true,  retentionPolicy: false },
        build:      { scriptedBuild: true,     buildService: true,       ephemeralEnvironment: false, hermeticBuild: false },
        provenance: { generated: true,         authenticated: false,     nonFalsifiable: false,       available: true },
        common:     { dependencies: 'pinned',  vulnerabilityScanning: true },
      },
      gaps: [
        { requirement: 'Authenticated provenance', currentState: 'Unsigned',
          remediation: 'Add cosign SLSA provenance generator action', effort: 'low' },
        { requirement: 'Hermetic build',           currentState: 'Not isolated',
          remediation: 'Use GitHub Actions ephemeral runner', effort: 'medium' },
      ],
      prioritizedActions: ['Add SLSA provenance generator', 'Pin all dependencies with checksums'],
    };
    const shell = new DevSecOpsShell();
    await shell.initialize(makeProvider(response), '/tmp/test-workspace');
    const result = await shell.run('assess-slsa', { project: 'payment-service', pipeline: 'github-actions' });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.currentSLSALevel).toBe(1);
    expect(data.targetSLSALevel).toBe(3);
    expect(Array.isArray(data.gaps)).toBe(true);
  });

  it('Given invalid AI response, When called, Then returns fallback with empty gaps', async () => {
    const provider = makeProvider();
    (provider.complete as jest.Mock).mockResolvedValue('bad response');
    const shell = new DevSecOpsShell();
    await shell.initialize(provider, '/tmp/test-workspace');
    const result = await shell.run('assess-slsa', { project: 'test', pipeline: 'jenkins' });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).gaps).toEqual([]);
  });
});

// ── DevSecOpsShell v2 — generate-sigstore-policy ──────────────────────────────

describe('DevSecOpsShell v2 — generate-sigstore-policy', () => {
  it('When called, Then returns cosignWorkflowStep and policyControllerConfig', async () => {
    const response = {
      projectName: 'my-service',
      signingApproach: 'keyless-oidc',
      cosignWorkflowStep: '- name: Sign image\n  run: cosign sign --yes $IMAGE',
      policyControllerConfig: 'apiVersion: policy.sigstore.dev/v1beta1\nkind: ClusterImagePolicy',
      sbomAttestationStep: '- name: Attest SBOM\n  run: cosign attest --yes --predicate sbom.json $IMAGE',
      verificationCommands: ['cosign verify --certificate-identity-regexp .* ghcr.io/myorg/myimage'],
      rekorTransparencyLogUrl: 'https://rekor.sigstore.dev',
      complianceMapping: [
        { standard: 'SLSA', requirement: 'Authenticated provenance — Level 2' },
        { standard: 'NIST SSDF', requirement: 'PS.2 — Protect all forms of code from unauthorized access' },
      ],
    };
    const shell = new DevSecOpsShell();
    await shell.initialize(makeProvider(response), '/tmp/test-workspace');
    const result = await shell.run('generate-sigstore-policy', { project: 'my-service', registry: 'ghcr.io' });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(typeof data.cosignWorkflowStep).toBe('string');
    expect(data.signingApproach).toBe('keyless-oidc');
  });
});

// ── DevSecOpsShell v2 — assess-cnapp ─────────────────────────────────────────

describe('DevSecOpsShell v2 — assess-cnapp', () => {
  it('When called, Then returns CSPM/CWPP/CIEM/KSPM scores and criticalFindings', async () => {
    const response = {
      environment: 'production-eks',
      provider: 'aws',
      cspm: {
        tool: 'AWS Security Hub',
        misconfigurations: [
          { resource: 'S3 bucket', severity: 'high', finding: 'Public access not blocked', remediation: 'Enable S3 Block Public Access' }
        ],
      },
      cwpp: { tool: 'Amazon GuardDuty', runtimeProtection: true, containerScanning: true, filelessThreatDetection: false },
      ciem: { tool: 'IAM Access Analyzer', overprivilegedIdentities: 12, unusedPermissionsPercent: 34,
              recommendations: ['Apply least-privilege to 12 IAM roles'] },
      kspm: { tool: 'AWS Inspector + kube-bench', clusterHardeningScore: 71, findings: ['No Pod Security Standards', 'Privileged containers found'] },
      cicdSecurity: { sastEnabled: true, dastEnabled: false, scaEnabled: true, secretScanning: true },
      overallPostureScore: 68,
      criticalFindings: ['S3 bucket with public access', 'Privileged containers in production'],
      roadmap: [{ phase: 'Phase 1', actions: ['Block S3 public access', 'Remove privileged containers'], effort: 'low' }],
    };
    const shell = new DevSecOpsShell();
    await shell.initialize(makeProvider(response), '/tmp/test-workspace');
    const result = await shell.run('assess-cnapp', { environment: 'production-eks', provider: 'aws' });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(typeof data.overallPostureScore).toBe('number');
    expect(Array.isArray(data.criticalFindings)).toBe(true);
  });
});

// ── CloudShell v2 — version ───────────────────────────────────────────────────

describe('CloudShell v2 — identity', () => {
  it('Has version "2.0.0"', async () => {
    const shell = new CloudShell();
    await shell.initialize(makeProvider(), '/tmp/test-workspace');
    expect(shell.version).toBe('2.0.0');
  });
});

// ── CloudShell v2 — chaos-engineering-plan ────────────────────────────────────

describe('CloudShell v2 — chaos-engineering-plan', () => {
  it('When called, Then returns experiments with risk levels and steady state', async () => {
    const response = {
      systemName: 'checkout-platform',
      provider: 'aws',
      tool: 'AWS FIS',
      steadyStateHypothesis: {
        metrics: ['error_rate < 1%', 'p99_latency < 500ms', 'availability > 99.9%'],
        thresholds: { error_rate: '1%', p99_latency: '500ms' },
      },
      experiments: [
        { id: 'exp-001', name: 'AZ failure simulation', category: 'infrastructure',
          hypothesis: 'System maintains availability when AZ fails',
          faultType: 'StopInstances', targetResource: 'EC2 in eu-west-1a',
          duration: '5 minutes', rollbackTrigger: 'error_rate > 5%',
          expectedOutcome: 'Traffic shifts to other AZs via ALB', riskLevel: 'low', environment: 'staging' },
        { id: 'exp-002', name: 'Database connection pool exhaustion', category: 'application',
          hypothesis: 'Circuit breaker activates when DB pool is exhausted',
          faultType: 'InjectNetworkLatency', targetResource: 'RDS cluster',
          duration: '3 minutes', rollbackTrigger: 'p99_latency > 2s',
          expectedOutcome: 'Circuit breaker opens, fallback cache serves requests', riskLevel: 'medium', environment: 'staging' },
      ],
      gameDay: { frequency: 'monthly', participants: ['SRE team', 'Dev leads'], runbook: 'runbooks/chaos-gameday.md' },
      observabilityRequirements: ['Distributed tracing enabled', 'Real-time dashboards', 'Alert silence during experiment'],
      maturityRoadmap: [
        { level: 'L1: Sandbox', description: 'Experiments only in isolated sandbox',   experiments: ['exp-001'] },
        { level: 'L2: Staging', description: 'Extend to staging with approval process', experiments: ['exp-001', 'exp-002'] },
        { level: 'L3: Production', description: 'Production Game Days with SRE oversight', experiments: ['exp-001', 'exp-002'] },
      ],
    };
    const shell = new CloudShell();
    await shell.initialize(makeProvider(response), '/tmp/test-workspace');
    const result = await shell.run('chaos-engineering-plan', { system: 'checkout-platform', provider: 'aws' });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(Array.isArray(data.experiments)).toBe(true);
    const experiments = data.experiments as Record<string, unknown>[];
    expect(experiments.length).toBeGreaterThan(0);
    expect(experiments.every(e => ['low', 'medium', 'high'].includes(String(e.riskLevel)))).toBe(true);
  });

  it('Given invalid AI response, When called, Then returns fallback with empty experiments', async () => {
    const provider = makeProvider();
    (provider.complete as jest.Mock).mockResolvedValue('not json');
    const shell = new CloudShell();
    await shell.initialize(provider, '/tmp/test-workspace');
    const result = await shell.run('chaos-engineering-plan', { system: 'test', provider: 'gcp' });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).experiments).toEqual([]);
  });
});

// ── CloudShell v2 — sustainability-review ────────────────────────────────────

describe('CloudShell v2 — sustainability-review', () => {
  it('When called, Then returns SCI score, CO2 footprint and green region recommendations', async () => {
    const response = {
      workload: 'analytics-pipeline',
      provider: 'gcp',
      carbonFootprintKgCO2ePerMonth: 89,
      sciScore: 0.42,
      energyEfficiencyScore: 71,
      pillarScores: [
        { pillar: 'SUS 1 Region selection',        score: 90, findings: ['Using us-central1 (carbon free energy > 90%)'] },
        { pillar: 'SUS 3 Software patterns',       score: 55, findings: ['Heavy use of always-on VMs — migrate to Cloud Run'] },
        { pillar: 'SUS 4 Data patterns',           score: 60, findings: ['No lifecycle policies on GCS buckets'] },
      ],
      recommendations: [
        { action: 'Migrate batch jobs to Cloud Run Jobs', category: 'serverless',
          estimatedCO2SavingsPercent: 35, estimatedCostSavings: '$1,200/month', effort: 'medium' },
        { action: 'Enable GCS Object Lifecycle management — move to Nearline after 30 days', category: 'storage',
          estimatedCO2SavingsPercent: 10, estimatedCostSavings: '$340/month', effort: 'low' },
      ],
      greenRegions: ['us-central1', 'europe-west1', 'northamerica-northeast1'],
      sdgAlignment: [
        { sdg: 'SDG 7', description: 'Affordable and Clean Energy' },
        { sdg: 'SDG 13', description: 'Climate Action' },
      ],
      certifications: ['ISO 14001 (GCP)', 'Carbon Free Energy Certificates'],
    };
    const shell = new CloudShell();
    await shell.initialize(makeProvider(response), '/tmp/test-workspace');
    const result = await shell.run('sustainability-review', { workload: 'analytics-pipeline', provider: 'gcp' });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(typeof data.sciScore).toBe('number');
    expect(typeof data.carbonFootprintKgCO2ePerMonth).toBe('number');
    expect(Array.isArray(data.recommendations)).toBe(true);
    expect(Array.isArray(data.greenRegions)).toBe(true);
  });

  it('When called for AWS, Then recommendations array is defined', async () => {
    const response = {
      workload: 'api-gateway', provider: 'aws',
      carbonFootprintKgCO2ePerMonth: 210, sciScore: 0.61, energyEfficiencyScore: 58,
      pillarScores: [], recommendations: [
        { action: 'Switch to Graviton3 instances', category: 'hardware',
          estimatedCO2SavingsPercent: 20, estimatedCostSavings: '$800/month', effort: 'low' }
      ],
      greenRegions: ['us-east-1', 'eu-west-1'],
      sdgAlignment: [{ sdg: 'SDG 13', description: 'Climate Action' }],
      certifications: [],
    };
    const shell = new CloudShell();
    await shell.initialize(makeProvider(response), '/tmp/test-workspace');
    const result = await shell.run('sustainability-review', { workload: 'api-gateway', provider: 'aws' });
    expect(result.success).toBe(true);
    expect(Array.isArray((result.data as Record<string, unknown>).recommendations)).toBe(true);
  });
});
