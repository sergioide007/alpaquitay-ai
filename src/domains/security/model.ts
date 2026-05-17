/**
 * Security Domain Model
 * ISO/IEC 27001 · NIST CSF 2.0 · SOC 2 · MITRE ATT&CK
 */

export type CSFFunction = 'govern' | 'identify' | 'protect' | 'detect' | 'respond' | 'recover';
export type MITRETactic = 'reconnaissance' | 'resource-development' | 'initial-access' | 'execution' | 'persistence' | 'privilege-escalation' | 'defense-evasion' | 'credential-access' | 'discovery' | 'lateral-movement' | 'collection' | 'exfiltration' | 'impact';
export type ComplianceFramework = 'iso27001' | 'nist-csf' | 'soc2' | 'pci-dss' | 'hipaa' | 'gdpr' | 'cis-controls';

export interface SecurityAuditReport {
  scope: string;
  framework: ComplianceFramework;
  controls: Array<{
    id: string;
    name: string;
    status: 'implemented' | 'partial' | 'not-implemented' | 'na';
    evidence: string;
    gap?: string;
    remediation?: string;
  }>;
  overallMaturityLevel: 1 | 2 | 3 | 4 | 5;
  criticalFindings: string[];
  remediationRoadmap: Array<{ priority: number; action: string; effort: 'days' | 'weeks' | 'months' }>;
}

export interface PenTestScope {
  targetSystems: string[];
  methodology: 'black-box' | 'white-box' | 'grey-box';
  phases: ('recon' | 'scanning' | 'exploitation' | 'post-exploitation' | 'reporting')[];
  exclusions: string[];
  rules: string[];
  reportingThreshold: 'critical' | 'high';
}

export interface SecurityIncident {
  id: string;
  classification: 'data-breach' | 'unauthorized-access' | 'malware' | 'dos' | 'insider-threat' | 'phishing';
  attackVectors: MITRETactic[];
  affectedAssets: string[];
  containmentActions: string[];
  eradicationSteps: string[];
  recoveryPlan: string[];
  lessonsLearned: string[];
  notificationRequirements: string[];
  regulatoryReportingDeadline?: Date;
}

export interface RiskRegister {
  risks: Array<{
    id: string;
    threat: string;
    vulnerability: string;
    likelihood: 1|2|3|4|5;
    impact: 1|2|3|4|5;
    riskScore: number;
    owner: string;
    controls: string[];
    residualRisk: number;
    reviewDate: Date;
  }>;
  lastReviewDate: Date;
  nextReviewDate: Date;
}
