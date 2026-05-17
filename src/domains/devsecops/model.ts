/**
 * DevSecOps Domain Model
 * ISO/IEC 27001 · OWASP SAMM · NIST SP 800-218 (SSDF) · CIS Controls
 */

export type SecurityGate = 'sast' | 'dast' | 'sca' | 'secret-scan' | 'iac-scan' | 'container-scan' | 'license-check';
export type OWASPCategory = 'A01_broken_access' | 'A02_crypto_failures' | 'A03_injection' | 'A04_insecure_design' | 'A05_security_misconfig' | 'A06_vulnerable_components' | 'A07_auth_failures' | 'A08_software_integrity' | 'A09_logging_failures' | 'A10_ssrf';
export type SAMMLevel = 1 | 2 | 3;

export interface SecurityScanResult {
  gate: SecurityGate;
  passed: boolean;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  findings: SecurityFinding[];
  scanDurationMs: number;
}

export interface SecurityFinding {
  id: string;
  cve?: string;
  cwe?: string;
  owaspCategory?: OWASPCategory;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  file?: string;
  line?: number;
  remediation: string;
  references: string[];
}

export interface SecurePipelineDesign {
  stages: Array<{ name: string; gates: SecurityGate[]; blockOn: ('critical'|'high')[] }>;
  secretManagement: 'vault' | 'aws-secrets' | 'azure-keyvault' | 'gcp-secret';
  signingStrategy: string;
  sbomGeneration: boolean;
  complianceFrameworks: string[];
}

export interface SAMMAssessment {
  governance:   Record<string, SAMMLevel>;
  design:       Record<string, SAMMLevel>;
  implementation: Record<string, SAMMLevel>;
  verification: Record<string, SAMMLevel>;
  operations:   Record<string, SAMMLevel>;
  overallScore: number;
  roadmapToNextLevel: string[];
}

export interface ThreatModel {
  id: string;
  scope: string;
  assets: string[];
  threats: Array<{ category: string; threat: string; likelihood: number; impact: number; riskScore: number; controls: string[] }>;
  dataFlows: string[];
  trustBoundaries: string[];
  strideAnalysis: Record<'spoofing'|'tampering'|'repudiation'|'info-disclosure'|'dos'|'elevation', string[]>;
}
