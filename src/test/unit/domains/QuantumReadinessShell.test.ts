/**
 * QuantumReadinessShell — Unit Tests
 *
 * Covers: shell identity, all 5 use cases, 3 guardrails, unknown use case.
 * NIST FIPS 203/204/205 · NSA CNSA 2.0 · NIST SP 800-131A
 */

import { QuantumReadinessShell } from '../../../domains/quantum-readiness/QuantumReadinessShell';
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

async function buildShell(provider: AIProvider): Promise<QuantumReadinessShell> {
  const shell = new QuantumReadinessShell();
  await shell.initialize(provider, '/tmp/test-workspace');
  return shell;
}

// ── Shell identity ────────────────────────────────────────────────────────────

describe('QuantumReadinessShell — identity', () => {
  it('Has domainId "quantum-readiness"', async () => {
    const shell = await buildShell(makeProvider());
    expect(shell.domainId).toBe('quantum-readiness');
  });

  it('Has version "1.0.0"', async () => {
    const shell = await buildShell(makeProvider());
    expect(shell.version).toBe('1.0.0');
  });
});

// ── crypto-inventory ──────────────────────────────────────────────────────────

describe('QuantumReadinessShell — crypto-inventory', () => {
  it('Given a system description, When called, Then returns success=true with assets array', async () => {
    const response = {
      systemName: 'payment-api',
      assets: [
        { id: 'c1', algorithm: 'RSA-2048', context: 'key-exchange', quantumVulnerable: true,
          pqcReplacement: 'ML-KEM-768', threatLevel: 'high', migrationUrgency: 'within-1-year' }
      ],
      quantumVulnerableCount: 1,
      overallQuantumRiskScore: 65,
    };
    const shell = await buildShell(makeProvider(response));
    const result = await shell.run('crypto-inventory', { system: 'payment-api' });
    expect(result.success).toBe(true);
    expect(Array.isArray((result.data as Record<string, unknown>)?.assets)).toBe(true);
  });

  it('Given an AI response that is not valid JSON, When called, Then returns fallback with empty assets', async () => {
    const provider = makeProvider();
    (provider.complete as jest.Mock).mockResolvedValue('not json');
    const shell = await buildShell(provider);
    const result = await shell.run('crypto-inventory', { system: 'test' });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>)?.assets).toEqual([]);
  });
});

// ── quantum-threat-timeline ───────────────────────────────────────────────────

describe('QuantumReadinessShell — quantum-threat-timeline', () => {
  it('Given industry and lifespan, When called, Then returns timeline with harvestNowDecryptLaterRisk', async () => {
    const response = {
      currentYear: 2026,
      mosaicScenario: {
        optimistic:  { year: 2029, probability: 0.1 },
        moderate:    { year: 2032, probability: 0.5 },
        pessimistic: { year: 2036, probability: 0.9 },
      },
      harvestNowDecryptLaterRisk: 'active',
      nistPqcReadinessDeadline: '2030',
      industryDeadlines: [{ industry: 'finance', mandateYear: 2030, standard: 'NIST FIPS 203' }],
      recommendation: 'Begin PQC migration immediately for financial data.',
    };
    const shell = await buildShell(makeProvider(response));
    const result = await shell.run('quantum-threat-timeline', { industry: 'finance', dataLifespanYears: 10 });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.harvestNowDecryptLaterRisk).toBe('active');
  });
});

// ── pqc-migration-plan ────────────────────────────────────────────────────────

describe('QuantumReadinessShell — pqc-migration-plan', () => {
  it('When called with system and cbom, Then returns phases with PQC algorithms', async () => {
    const response = {
      systemName: 'auth-service',
      totalEffortWeeks: 20,
      phases: [
        { name: 'Crypto Agility Layer', approach: 'crypto-agility-layer',
          pqcAlgorithmsIntroduced: [], estimatedWeeks: 4, riskLevel: 'low', dependencies: [] },
        { name: 'Hybrid TLS', approach: 'hybrid-classical-pqc',
          pqcAlgorithmsIntroduced: ['ML-KEM-768'], estimatedWeeks: 8, riskLevel: 'medium', dependencies: ['Phase 1'] },
      ],
      testingStrategy: 'Feature flags to switch between classical and PQC.',
      rollbackPlan: 'Revert to classical algorithms via config flag.',
      complianceTargets: ['NIST FIPS 203', 'NSA CNSA 2.0'],
    };
    const shell = await buildShell(makeProvider(response));
    const result = await shell.run('pqc-migration-plan', { system: 'auth-service', cbom: {} });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(Array.isArray(data.phases)).toBe(true);
    expect((data.phases as unknown[]).length).toBeGreaterThan(0);
  });
});

// ── cbom-generate ─────────────────────────────────────────────────────────────

describe('QuantumReadinessShell — cbom-generate', () => {
  it('When called, Then returns CBOM with assets and risk score', async () => {
    const response = {
      systemName: 'e-commerce',
      generatedAt: '2026-05-26',
      totalCryptoAssets: 5,
      quantumVulnerableCount: 3,
      criticalAssets: [
        { id: 'c1', algorithm: 'RSA-2048', context: 'certificate', quantumVulnerable: true,
          threatLevel: 'critical', pqcReplacement: 'ML-DSA-65', migrationUrgency: 'immediate' }
      ],
      assets: [],
      overallQuantumRiskScore: 75,
      estimatedHarvestWindow: '2029-2032',
    };
    const shell = await buildShell(makeProvider(response));
    const result = await shell.run('cbom-generate', { system: 'e-commerce', context: 'payment flow' });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.overallQuantumRiskScore).toBe(75);
    expect(Array.isArray(data.criticalAssets)).toBe(true);
  });
});

// ── assess-crypto-agility ─────────────────────────────────────────────────────

describe('QuantumReadinessShell — assess-crypto-agility', () => {
  it('When called, Then returns agilityScore and recommendations', async () => {
    const response = {
      systemName: 'api-gateway',
      agilityScore: 45,
      hardcodedAlgorithms: ['RSA-2048', 'AES-128'],
      configurableAlgorithms: [],
      algorithmNegotiationSupport: false,
      keyLengthFlexibility: false,
      hybridModeSupport: false,
      recommendations: ['Abstract all crypto behind CryptoProvider interface', 'Enable TLS algorithm negotiation'],
    };
    const shell = await buildShell(makeProvider(response));
    const result = await shell.run('assess-crypto-agility', { system: 'api-gateway', stack: 'Node.js + Express' });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(typeof data.agilityScore).toBe('number');
    expect(Array.isArray(data.recommendations)).toBe(true);
  });
});

// ── Guardrails ────────────────────────────────────────────────────────────────

describe('QuantumReadinessShell — guardrails', () => {
  describe('QR-001 — RSA certificate < 4096 bits', () => {
    it('Given an RSA-2048 certificate asset, When guardrails run, Then QR-001 blocks', async () => {
      const response = {
        assets: [{ algorithm: 'RSA-2048', context: 'certificate', quantumVulnerable: true }],
        overallQuantumRiskScore: 50,
      };
      const shell = await buildShell(makeProvider(response));
      const result = await shell.run('crypto-inventory', { system: 'test' });
      const guardrails = result.guardrailResults ?? [];
      const block = guardrails.find(g => g.rule === 'QR-001');
      expect(block).toBeDefined();
      expect(block?.severity).toBe('block');
    });

    it('Given only RSA-4096, When guardrails run, Then QR-001 does NOT fire', async () => {
      const response = {
        assets: [{ algorithm: 'RSA-4096', context: 'certificate', quantumVulnerable: false }],
        overallQuantumRiskScore: 10,
      };
      const shell = await buildShell(makeProvider(response));
      const result = await shell.run('crypto-inventory', { system: 'test' });
      const guardrails = result.guardrailResults ?? [];
      const block = guardrails.find(g => g.rule === 'QR-001');
      expect(block).toBeUndefined();
    });
  });

  describe('QR-002 — no algorithm negotiation', () => {
    it('Given algorithmNegotiationSupport=false, When guardrails run, Then QR-002 warns', async () => {
      const response = { algorithmNegotiationSupport: false, agilityScore: 30, hardcodedAlgorithms: [] };
      const shell = await buildShell(makeProvider(response));
      const result = await shell.run('assess-crypto-agility', { system: 'test', stack: 'Java' });
      const warn = (result.guardrailResults ?? []).find(g => g.rule === 'QR-002');
      expect(warn).toBeDefined();
      expect(warn?.severity).toBe('warn');
    });
  });

  describe('QR-003 — critical quantum risk score', () => {
    it('Given overallQuantumRiskScore >= 80, When guardrails run, Then QR-003 blocks', async () => {
      const response = { assets: [], quantumVulnerableCount: 10, overallQuantumRiskScore: 85 };
      const shell = await buildShell(makeProvider(response));
      const result = await shell.run('crypto-inventory', { system: 'critical-system' });
      const block = (result.guardrailResults ?? []).find(g => g.rule === 'QR-003');
      expect(block).toBeDefined();
      expect(block?.severity).toBe('block');
    });

    it('Given overallQuantumRiskScore = 79, When guardrails run, Then QR-003 does NOT fire', async () => {
      const response = { assets: [], quantumVulnerableCount: 3, overallQuantumRiskScore: 79 };
      const shell = await buildShell(makeProvider(response));
      const result = await shell.run('crypto-inventory', { system: 'test' });
      const block = (result.guardrailResults ?? []).find(g => g.rule === 'QR-003');
      expect(block).toBeUndefined();
    });
  });
});

// ── Unknown use case ──────────────────────────────────────────────────────────

describe('QuantumReadinessShell — unknown use case', () => {
  it('When called with an unknown use case id, Then returns success=false with descriptive error', async () => {
    const shell = await buildShell(makeProvider());
    const result = await shell.run('does-not-exist', {});
    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain('does-not-exist');
  });
});
