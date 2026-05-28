/**
 * DevSecOps Domain Agent Shell
 * ISO/IEC 27001 · OWASP SAMM · NIST SSDF · CIS Controls
 * SLSA Framework · Sigstore · CNAPP · EU Cyber Resilience Act
 */

import { BaseDomainShell, UseCaseHandler } from '../shared/BaseDomainShell';
import type { DomainId, GuardrailResult } from '../interfaces/DomainAgentShell';

export class DevSecOpsShell extends BaseDomainShell {
  readonly domainId: DomainId = 'devsecops';
  readonly version = '2.0.0';

  protected useCaseHandlers(): Record<string, UseCaseHandler> {
    return {
      'design-secure-pipeline':     this.designSecurePipeline.bind(this),
      'threat-model':               this.threatModel.bind(this),
      'assess-samm':                this.assessSAMM.bind(this),
      'scan-findings-triage':       this.scanFindingsTriage.bind(this),
      'generate-sbom':              this.generateSBOM.bind(this),
      'assess-slsa':                this.assessSLSA.bind(this),
      'generate-sigstore-policy':   this.generateSigstorePolicy.bind(this),
      'assess-cnapp':               this.assessCNAPP.bind(this),
    };
  }

  protected domainGuardrails(output: unknown): GuardrailResult[] {
    const results: GuardrailResult[] = [];
    const o = output as Record<string, unknown>;
    if (Array.isArray(o?.findings) && (o.findings as Record<string, unknown>[]).some(f => f.severity === 'critical')) {
      results.push({ severity: 'block', rule: 'DSO-001', message: 'Critical security finding detected — pipeline must block (ISO/IEC 27001 A.14.2).' });
    }
    return results;
  }

  private async designSecurePipeline(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const stack = String(params.stack ?? '');
    const raw = await this.ask(`Design a DevSecOps pipeline (OWASP SAMM L2, NIST SSDF) for: "${stack}".
Return JSON: {stages:[{name,gates:[],blockOn[]}],secretManagement,signingStrategy,sbomGeneration,complianceFrameworks[]}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async threatModel(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const system = String(params.system ?? '');
    const raw = await this.ask(`Create a STRIDE threat model for: "${system}".
Return JSON: {id,scope,assets[],threats:[{category,threat,likelihood(1-5),impact(1-5),riskScore,controls[]}],dataFlows[],trustBoundaries[],strideAnalysis:{spoofing[],tampering[],repudiation[],info-disclosure[],dos[],elevation[]}}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async assessSAMM(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const context = String(params.context ?? '');
    const raw = await this.ask(`Assess OWASP SAMM maturity for: "${context}".
Return JSON: {governance:{},design:{},implementation:{},verification:{},operations:{},overallScore,roadmapToNextLevel[]}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async scanFindingsTriage(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const findings = params.findings ?? [];
    const raw = await this.ask(`Triage security scan findings: ${JSON.stringify(findings)}.
Prioritize by CVSS, exploitability, and business impact. Return JSON: {critical:[],high:[],medium:[],low:[],falsePositives:[],remediationPlan:[{finding,action,effort,deadline}]}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async generateSBOM(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const project = String(params.project ?? '');
    const raw = await this.ask(`Generate an SBOM analysis for: "${project}".
Return JSON: {components:[{name,version,license,cves[],riskLevel}],licenseRisks[],outdatedComponents[],remediationActions[]}.`);
    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async assessSLSA(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const project = String(params.project ?? '');
    const pipeline = String(params.pipeline ?? '');
    const raw = await this.ask(`Assess SLSA (Supply chain Levels for Software Artifacts) compliance for: "${project}".
Pipeline: ${pipeline}.

SLSA levels:
  L1: Scripted build (no manual steps), basic provenance
  L2: Build service (e.g. GitHub Actions), signed provenance, authenticated build
  L3: Hardened build (isolated, ephemeral), non-falsifiable provenance, verified inputs
  L4: (Coming) Two-party review on all changes, hermetic + reproducible build

Evaluate each SLSA requirement track: Source, Build, Provenance, Common.
Map gaps to specific remediation steps (GitHub Actions SLSA generator, SLSA Verifier, cosign, Rekor).

Return JSON:
{
  projectName: string,
  currentSLSALevel: 0|1|2|3|4,
  targetSLSALevel: number,
  tracks: {
    source: { twoPersonReview: boolean, versionControlled: boolean, retentionPolicy: boolean },
    build:  { scriptedBuild: boolean, buildService: boolean, ephemeralEnvironment: boolean, hermeticBuild: boolean },
    provenance: { generated: boolean, authenticated: boolean, nonFalsifiable: boolean, available: boolean },
    common: { dependencies: string, vulnerabilityScanning: boolean }
  },
  gaps: [{ requirement: string, currentState: string, remediation: string, effort: string }],
  prioritizedActions: string[]
}`, 1500);

    return { success: true, data: this.parseJSON(raw, { gaps: [] }) };
  }

  private async generateSigstorePolicy(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const project   = String(params.project ?? '');
    const registry  = String(params.registry ?? 'ghcr.io');
    const raw = await this.ask(`Generate a Sigstore/cosign artifact signing policy for: "${project}" using registry ${registry}.

Sigstore stack: cosign (signing) + Rekor (transparency log) + Fulcio (certificate authority) + Policy Controller (enforcement).
Apply keyless signing (OIDC-based, no long-lived keys) — best practice per SLSA L2+.

Include:
  - cosign sign workflow step (GitHub Actions / GitLab CI)
  - Policy Controller ClusterImagePolicy (Kubernetes admission control)
  - Rekor transparency log verification
  - SBOM attestation with cosign attest
  - Verification commands for consumers

Return JSON:
{
  projectName: string,
  signingApproach: "keyless-oidc"|"key-pair",
  cosignWorkflowStep: string,
  policyControllerConfig: string,
  sbomAttestationStep: string,
  verificationCommands: string[],
  rekorTransparencyLogUrl: string,
  complianceMapping: [{ standard: string, requirement: string }]
}`, 1500);

    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async assessCNAPP(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const environment = String(params.environment ?? '');
    const provider    = String(params.provider ?? 'aws');
    const raw = await this.ask(`Design a Cloud Native Application Protection Platform (CNAPP) for: "${environment}" on ${provider}.

CNAPP converges: CSPM + CWPP + CIEM + KSPM + CI/CD security scanning + API security.
  CSPM  — Cloud Security Posture Management (misconfiguration detection)
  CWPP  — Cloud Workload Protection Platform (runtime threat detection)
  CIEM  — Cloud Infrastructure Entitlement Management (IAM risk reduction)
  KSPM  — Kubernetes Security Posture Management
  ASPM  — Application Security Posture Management

Apply:
  AWS: Security Hub + GuardDuty + Inspector + IAM Access Analyzer + Macie
  Azure: Defender for Cloud + Microsoft Sentinel + Entra Permissions Management
  GCP: Security Command Center + Chronicle + IAM Recommender

Return JSON:
{
  environment: string,
  provider: string,
  cspm: { tool: string, misconfigurations: [{ resource, severity, finding, remediation }] },
  cwpp: { tool: string, runtimeProtection: boolean, containerScanning: boolean, filelessThreatDetection: boolean },
  ciem: { tool: string, overprivilegedIdentities: number, unusedPermissionsPercent: number, recommendations: string[] },
  kspm: { tool: string, clusterHardeningScore: number, findings: string[] },
  cicdSecurity: { sastEnabled: boolean, dastEnabled: boolean, scaEnabled: boolean, secretScanning: boolean },
  overallPostureScore: number,
  criticalFindings: string[],
  roadmap: [{ phase: string, actions: string[], effort: string }]
}`, 2000);

    return { success: true, data: this.parseJSON(raw, { criticalFindings: [] }) };
  }
}
