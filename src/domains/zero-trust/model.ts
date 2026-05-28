/**
 * Zero Trust Architecture Domain Model
 *
 * Standards:
 *   NIST SP 800-207 — Zero Trust Architecture
 *   CISA Zero Trust Maturity Model (ZTMM) v2.0 — 5 pillars × 4 maturity stages
 *   DoD Zero Trust Strategy 2022 — Target Level ZT
 *   BeyondCorp (Google) — device + user trust model
 *   NIST SP 800-215 — Guide to a Secure Enterprise Network Landscape
 *   ISO/IEC 27001 A.9 — Access Control
 */

export type ZTMMPillar = 'identity' | 'devices' | 'networks' | 'applications-workloads' | 'data';
export type ZTMMMaturity = 'traditional' | 'initial' | 'advanced' | 'optimal';
export type TrustAlgorithm = 'score-based' | 'attribute-based' | 'enhanced-identity-governance' | 'device-application-based';
export type PrivilegedAccessTier = 'tier0-control-plane' | 'tier1-server-admin' | 'tier2-user-admin' | 'tier3-standard-user';

export interface ZTMMAssessment {
  organizationName: string;
  assessmentDate: string;
  overallMaturity: ZTMMMaturity;
  pillars: Array<{
    pillar: ZTMMPillar;
    currentMaturity: ZTMMMaturity;
    targetMaturity: ZTMMMaturity;
    score: number;
    gaps: string[];
    capabilities: Array<{
      name: string;
      status: 'not-started' | 'in-progress' | 'implemented' | 'optimized';
      effort: 'low' | 'medium' | 'high';
      priority: 1 | 2 | 3;
    }>;
  }>;
  implicitTrustZones: string[];
  roadmap: Array<{ phase: string; actions: string[]; durationWeeks: number }>;
}

export interface IdentityFabric {
  systemName: string;
  idProvider: string;
  mfaEnforced: boolean;
  conditionalAccessPolicies: Array<{
    name: string;
    conditions: string[];
    grantControls: string[];
    sessionControls: string[];
  }>;
  privilegedAccessModel: {
    tiers: PrivilegedAccessTier[];
    jitAccess: boolean;
    pamSolution: string;
    breakGlassAccount: boolean;
  };
  identityGovernance: {
    accessReviewFrequency: string;
    lifecycleManagement: boolean;
    entitlementManagement: boolean;
  };
  recommendations: string[];
}

export interface MicrosegmentationPolicy {
  systemName: string;
  approach: 'network-based' | 'host-based' | 'application-based' | 'hybrid';
  segments: Array<{
    name: string;
    workloads: string[];
    allowedTraffic: Array<{ source: string; destination: string; port: string; protocol: string }>;
    deniedByDefault: boolean;
    encryptionRequired: boolean;
  }>;
  lateralMovementRisk: 'eliminated' | 'significantly-reduced' | 'reduced' | 'present';
  implementationTool: string;
}

export interface ContinuousVerificationPolicy {
  systemName: string;
  verificationFrequency: 'per-request' | 'per-session' | 'time-based';
  trustSignals: Array<{
    signal: string;
    weight: number;
    source: 'identity-provider' | 'device-compliance' | 'location' | 'behavior-analytics' | 'risk-engine';
  }>;
  adaptiveAccessRules: Array<{
    condition: string;
    action: 'allow' | 'step-up-mfa' | 'limit-session' | 'block';
  }>;
  policyEnforcementPoints: string[];
}
