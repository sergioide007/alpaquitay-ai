/**
 * ZeroTrustShell — Unit Tests
 *
 * Covers: shell identity, all 5 use cases, 4 guardrails, unknown use case.
 * NIST SP 800-207 · CISA ZTMM v2.0 · DoD ZT Strategy 2022 · BeyondCorp
 */

import { ZeroTrustShell } from '../../../domains/zero-trust/ZeroTrustShell';
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

async function buildShell(provider: AIProvider): Promise<ZeroTrustShell> {
  const shell = new ZeroTrustShell();
  await shell.initialize(provider, '/tmp/test-workspace');
  return shell;
}

// ── Shell identity ────────────────────────────────────────────────────────────

describe('ZeroTrustShell — identity', () => {
  it('Has domainId "zero-trust"', async () => {
    const shell = await buildShell(makeProvider());
    expect(shell.domainId).toBe('zero-trust');
  });

  it('Has version "1.0.0"', async () => {
    const shell = await buildShell(makeProvider());
    expect(shell.version).toBe('1.0.0');
  });
});

// ── assess-ztmm ──────────────────────────────────────────────────────────────

describe('ZeroTrustShell — assess-ztmm', () => {
  it('When called, Then returns ZTMM pillars and overall maturity level', async () => {
    const response = {
      organizationName: 'Acme Corp',
      assessmentDate: '2026-05-26',
      overallMaturity: 'initial',
      pillars: [
        { pillar: 'identity',  currentMaturity: 'initial',      targetMaturity: 'advanced', score: 40, gaps: ['No JIT access'], capabilities: [] },
        { pillar: 'devices',   currentMaturity: 'traditional',  targetMaturity: 'initial',  score: 25, gaps: ['No MDM'],        capabilities: [] },
        { pillar: 'networks',  currentMaturity: 'initial',      targetMaturity: 'advanced', score: 35, gaps: ['VPN still used'],capabilities: [] },
      ],
      implicitTrustZones: [],
      roadmap: [{ phase: 'Phase 1: Identity Hardening', actions: ['Deploy MFA', 'Enable JIT'], durationWeeks: 8 }],
    };
    const shell = await buildShell(makeProvider(response));
    const result = await shell.run('assess-ztmm', { organization: 'Acme Corp', context: 'SaaS platform' });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.overallMaturity).toBe('initial');
    expect(Array.isArray(data.pillars)).toBe(true);
    expect((data.pillars as unknown[]).length).toBeGreaterThan(0);
  });

  it('Given invalid AI response, When called, Then returns fallback with empty pillars', async () => {
    const provider = makeProvider();
    (provider.complete as jest.Mock).mockResolvedValue('invalid json {{{');
    const shell = await buildShell(provider);
    const result = await shell.run('assess-ztmm', { organization: 'Test', context: '' });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).pillars).toEqual([]);
  });
});

// ── design-identity-fabric ────────────────────────────────────────────────────

describe('ZeroTrustShell — design-identity-fabric', () => {
  it('When called, Then returns mfaEnforced=true and conditional access policies', async () => {
    const response = {
      systemName: 'enterprise-apps',
      idProvider: 'azure-entra',
      mfaEnforced: true,
      conditionalAccessPolicies: [
        { name: 'Require MFA for all cloud apps', conditions: ['Any user', 'Any app'],
          grantControls: ['Require MFA'], sessionControls: ['Sign-in frequency: 1 hour'] }
      ],
      privilegedAccessModel: { tiers: ['tier0', 'tier1', 'tier2'], jitAccess: true,
        pamSolution: 'Azure PIM', breakGlassAccount: true },
      identityGovernance: { accessReviewFrequency: 'quarterly', lifecycleManagement: true, entitlementManagement: true },
      recommendations: ['Enable Entra ID Protection', 'Configure risk-based Conditional Access'],
    };
    const shell = await buildShell(makeProvider(response));
    const result = await shell.run('design-identity-fabric', { system: 'enterprise-apps', idpStack: 'azure-entra' });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.mfaEnforced).toBe(true);
    expect(Array.isArray(data.conditionalAccessPolicies)).toBe(true);
  });
});

// ── microsegmentation-plan ────────────────────────────────────────────────────

describe('ZeroTrustShell — microsegmentation-plan', () => {
  it('When called, Then returns segments with deniedByDefault=true', async () => {
    const response = {
      systemName: 'payment-platform',
      approach: 'application-based',
      segments: [
        { name: 'payment-service',  workloads: ['payment-api'],  deniedByDefault: true, encryptionRequired: true,
          allowedTraffic: [{ source: 'checkout-service', destination: 'payment-api', port: '443', protocol: 'HTTPS/mTLS' }] },
        { name: 'checkout-service', workloads: ['checkout-api'], deniedByDefault: true, encryptionRequired: true,
          allowedTraffic: [{ source: 'frontend', destination: 'checkout-api', port: '443', protocol: 'HTTPS' }] },
      ],
      lateralMovementRisk: 'significantly-reduced',
      implementationTool: 'Istio AuthorizationPolicy + SPIFFE/SPIRE',
    };
    const shell = await buildShell(makeProvider(response));
    const result = await shell.run('microsegmentation-plan', { system: 'payment-platform', workloads: 'payment-api, checkout-api' });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    const segments = data.segments as Record<string, unknown>[];
    expect(segments.every(s => s.deniedByDefault === true)).toBe(true);
    expect(data.lateralMovementRisk).toBe('significantly-reduced');
  });
});

// ── continuous-verification-policy ───────────────────────────────────────────

describe('ZeroTrustShell — continuous-verification-policy', () => {
  it('When called, Then returns trust signals and adaptive access rules', async () => {
    const response = {
      systemName: 'internal-apps',
      verificationFrequency: 'per-request',
      trustSignals: [
        { signal: 'User risk score',     weight: 40, source: 'identity-provider' },
        { signal: 'Device compliance',   weight: 30, source: 'device-compliance' },
        { signal: 'Geo-velocity anomaly',weight: 20, source: 'behavior-analytics' },
        { signal: 'Time of day',         weight: 10, source: 'risk-engine' },
      ],
      adaptiveAccessRules: [
        { condition: 'Risk score > 70', action: 'step-up-mfa' },
        { condition: 'Unknown device',  action: 'block' },
        { condition: 'Normal session',  action: 'allow' },
      ],
      policyEnforcementPoints: ['API Gateway', 'Istio sidecar', 'Azure Entra ID'],
    };
    const shell = await buildShell(makeProvider(response));
    const result = await shell.run('continuous-verification-policy', { system: 'internal-apps' });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(Array.isArray(data.trustSignals)).toBe(true);
    expect(Array.isArray(data.adaptiveAccessRules)).toBe(true);
  });
});

// ── privileged-access-design ──────────────────────────────────────────────────

describe('ZeroTrustShell — privileged-access-design', () => {
  it('When called, Then returns tiers with session recording and approval flags', async () => {
    const response = {
      systemName: 'corp-infrastructure',
      cloud: 'azure',
      tiers: [
        { tier: 'Tier 0 — Control Plane', systems: ['Entra ID', 'PKI', 'Azure AD Connect'],
          accessMethod: 'PAW + Azure PIM', mfaRequired: true, sessionRecording: true,
          maxSessionDurationHours: 1, approvalRequired: true },
        { tier: 'Tier 1 — Server Admin', systems: ['Domain Controllers', 'App Servers'],
          accessMethod: 'JIT via Azure PIM', mfaRequired: true, sessionRecording: true,
          maxSessionDurationHours: 4, approvalRequired: true },
      ],
      pamSolution: 'Azure PIM + Microsoft Defender for Identity',
      zeroStandingPrivilege: true,
      breakGlassProcess: 'Break-glass account in offline vault, requires 2 approvers.',
      auditRequirements: ['All Tier 0 sessions recorded', 'Quarterly access review'],
      complianceMapping: [{ standard: 'ISO/IEC 27001', control: 'A.9.4.4' }],
    };
    const shell = await buildShell(makeProvider(response));
    const result = await shell.run('privileged-access-design', { system: 'corp-infrastructure', cloud: 'azure' });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.zeroStandingPrivilege).toBe(true);
    expect(Array.isArray(data.tiers)).toBe(true);
    const tiers = data.tiers as Record<string, unknown>[];
    expect(tiers.every(t => t.mfaRequired === true)).toBe(true);
  });
});

// ── Guardrails ────────────────────────────────────────────────────────────────

describe('ZeroTrustShell — guardrails', () => {
  describe('ZT-001 — implicit trust zones found', () => {
    it('Given implicitTrustZones has entries, When guardrails run, Then ZT-001 blocks', async () => {
      const response = {
        overallMaturity: 'initial',
        implicitTrustZones: ['Corporate LAN', 'VPN subnet 10.0.0.0/8'],
        pillars: [],
        roadmap: [],
      };
      const shell = await buildShell(makeProvider(response));
      const result = await shell.run('assess-ztmm', { organization: 'Test', context: '' });
      const block = (result.guardrailResults ?? []).find(g => g.rule === 'ZT-001');
      expect(block).toBeDefined();
      expect(block?.severity).toBe('block');
      expect(block?.message).toContain('Corporate LAN');
    });

    it('Given implicitTrustZones is empty, When guardrails run, Then ZT-001 does NOT fire', async () => {
      const response = {
        overallMaturity: 'advanced', implicitTrustZones: [], pillars: [], roadmap: [],
      };
      const shell = await buildShell(makeProvider(response));
      const result = await shell.run('assess-ztmm', { organization: 'Test', context: '' });
      const block = (result.guardrailResults ?? []).find(g => g.rule === 'ZT-001');
      expect(block).toBeUndefined();
    });
  });

  describe('ZT-002 — MFA not enforced', () => {
    it('Given mfaEnforced=false, When guardrails run, Then ZT-002 blocks', async () => {
      const response = {
        systemName: 'legacy-app', idProvider: 'ldap', mfaEnforced: false,
        conditionalAccessPolicies: [], privilegedAccessModel: { tiers: [], jitAccess: false, pamSolution: 'none', breakGlassAccount: false },
        identityGovernance: { accessReviewFrequency: 'never', lifecycleManagement: false, entitlementManagement: false },
        recommendations: [],
      };
      const shell = await buildShell(makeProvider(response));
      const result = await shell.run('design-identity-fabric', { system: 'legacy-app', idpStack: 'ldap' });
      const block = (result.guardrailResults ?? []).find(g => g.rule === 'ZT-002');
      expect(block).toBeDefined();
      expect(block?.severity).toBe('block');
    });

    it('Given mfaEnforced=true, When guardrails run, Then ZT-002 does NOT fire', async () => {
      const response = {
        systemName: 'modern-app', mfaEnforced: true, conditionalAccessPolicies: [],
        privilegedAccessModel: { tiers: [], jitAccess: true, pamSolution: 'PIM', breakGlassAccount: true },
        identityGovernance: { accessReviewFrequency: 'quarterly', lifecycleManagement: true, entitlementManagement: true },
        recommendations: [],
      };
      const shell = await buildShell(makeProvider(response));
      const result = await shell.run('design-identity-fabric', { system: 'modern-app', idpStack: 'entra' });
      const block = (result.guardrailResults ?? []).find(g => g.rule === 'ZT-002');
      expect(block).toBeUndefined();
    });
  });

  describe('ZT-003 — lateral movement risk present', () => {
    it('Given lateralMovementRisk="present", When guardrails run, Then ZT-003 warns', async () => {
      const response = {
        systemName: 'legacy-net', approach: 'network-based', segments: [],
        lateralMovementRisk: 'present', implementationTool: 'none',
      };
      const shell = await buildShell(makeProvider(response));
      const result = await shell.run('microsegmentation-plan', { system: 'legacy-net', workloads: '' });
      const warn = (result.guardrailResults ?? []).find(g => g.rule === 'ZT-003');
      expect(warn).toBeDefined();
      expect(warn?.severity).toBe('warn');
    });
  });

  describe('ZT-004 — organization at "traditional" maturity', () => {
    it('Given overallMaturity="traditional", When guardrails run, Then ZT-004 warns', async () => {
      const response = {
        overallMaturity: 'traditional', implicitTrustZones: [], pillars: [], roadmap: [],
        organizationName: 'Legacy Corp', assessmentDate: '2026-05-26',
      };
      const shell = await buildShell(makeProvider(response));
      const result = await shell.run('assess-ztmm', { organization: 'Legacy Corp', context: '' });
      const warn = (result.guardrailResults ?? []).find(g => g.rule === 'ZT-004');
      expect(warn).toBeDefined();
      expect(warn?.severity).toBe('warn');
    });
  });
});

// ── Unknown use case ──────────────────────────────────────────────────────────

describe('ZeroTrustShell — unknown use case', () => {
  it('When called with an unknown id, Then returns success=false with error', async () => {
    const shell = await buildShell(makeProvider());
    const result = await shell.run('implicit-trust-is-fine', {});
    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toContain('implicit-trust-is-fine');
  });
});
