/**
 * Quantum Readiness Domain Agent Shell
 *
 * Standards:
 *   NIST FIPS 203/204/205 — Post-Quantum Cryptography (PQC) standards
 *   NIST SP 800-131A Rev 3 — Transitioning Cryptographic Algorithms
 *   NIST IR 8413 — PQC Standardization Status
 *   ETSI GS QKD 004 — Quantum Key Distribution
 *   NSA CNSA 2.0 Suite — Commercial National Security Algorithm Suite 2.0
 *   ISO/IEC 18033-1 — Encryption Algorithms
 *
 * Security principle: Harvest Now, Decrypt Later (HNDL) attacks are active TODAY.
 * Systems handling long-lived secrets or regulatory data must migrate to PQC urgently.
 */

import { BaseDomainShell, UseCaseHandler } from '../shared/BaseDomainShell';
import type { DomainId, GuardrailResult } from '../interfaces/DomainAgentShell';

export class QuantumReadinessShell extends BaseDomainShell {
  readonly domainId: DomainId = 'quantum-readiness';
  readonly version = '1.0.0';

  protected useCaseHandlers(): Record<string, UseCaseHandler> {
    return {
      'crypto-inventory':          this.cryptoInventory.bind(this),
      'quantum-threat-timeline':   this.quantumThreatTimeline.bind(this),
      'pqc-migration-plan':        this.pqcMigrationPlan.bind(this),
      'cbom-generate':             this.cbomGenerate.bind(this),
      'assess-crypto-agility':     this.assessCryptoAgility.bind(this),
    };
  }

  protected domainGuardrails(output: unknown): GuardrailResult[] {
    const results: GuardrailResult[] = [];
    const o = output as Record<string, unknown>;

    // Block if RSA < 4096 used in long-lived contexts (NIST SP 800-131A)
    const assets = Array.isArray(o?.assets) ? o.assets as Record<string, unknown>[] : [];
    const criticalVuln = assets.filter(a =>
      (String(a.algorithm ?? '')).startsWith('RSA-') &&
      (String(a.algorithm ?? '')) !== 'RSA-4096' &&
      a.context === 'certificate'
    );
    if (criticalVuln.length > 0) {
      results.push({
        severity: 'block',
        rule: 'QR-001',
        message: `${criticalVuln.length} certificate(s) use RSA < 4096 — quantum-harvestable. Migrate to ML-KEM + ML-DSA immediately (NIST FIPS 203/204).`,
      });
    }

    // Warn if no crypto agility support
    if (o?.algorithmNegotiationSupport === false) {
      results.push({
        severity: 'warn',
        rule: 'QR-002',
        message: 'System lacks algorithm negotiation — crypto agility required for seamless PQC migration (NSA CNSA 2.0).',
      });
    }

    // Block if overall quantum risk score is critical (>= 80)
    if (typeof o?.overallQuantumRiskScore === 'number' && o.overallQuantumRiskScore >= 80) {
      results.push({
        severity: 'block',
        rule: 'QR-003',
        message: `Quantum risk score ${o.overallQuantumRiskScore}/100 — critical exposure. Immediate HNDL mitigation required.`,
      });
    }

    return results;
  }

  private async cryptoInventory(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const system = String(params.system ?? '');
    const raw = await this.ask(`Perform a comprehensive cryptographic inventory for: "${system}".

Identify ALL cryptographic assets: key exchanges, signatures, TLS config, code signing, certificates, secrets management, data-at-rest encryption.
For each asset, assess quantum vulnerability and map to NIST FIPS 203/204/205 replacement.

Return JSON matching:
{
  systemName: string,
  assets: [{
    id: string,
    algorithm: ClassicalCryptoAlgorithm,
    context: CryptoUsageContext,
    location: string,
    quantumVulnerable: boolean,
    harvestNowDecryptLater: boolean,
    threatLevel: 'critical'|'high'|'medium'|'low',
    pqcReplacement: PQCAlgorithm,
    migrationUrgency: MigrationUrgency,
    estimatedMigrationEffort: 'days'|'weeks'|'months'|'quarters',
    notes: string
  }],
  quantumVulnerableCount: number,
  overallQuantumRiskScore: number
}

PQC replacement guidance:
  Key exchange (RSA/DH/ECDH) → ML-KEM-768 (NIST FIPS 203)
  Digital signatures (RSA/ECDSA/Ed25519) → ML-DSA-65 (NIST FIPS 204) or SLH-DSA-128s (NIST FIPS 205)
  AES-128 key size → AES-256 (Grover's algorithm halves symmetric key security)`, 2048);

    return { success: true, data: this.parseJSON(raw, { assets: [], quantumVulnerableCount: 0, overallQuantumRiskScore: 0 }) };
  }

  private async quantumThreatTimeline(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const industry = String(params.industry ?? 'general');
    const dataLifespan = String(params.dataLifespanYears ?? '10');
    const raw = await this.ask(`Assess the quantum computing threat timeline for the ${industry} industry with ${dataLifespan}-year data lifespan.

Consider: IBM Quantum roadmap, Google Quantum AI, IonQ, Quantinuum projections. NSA CNSA 2.0 mandates.
HNDL attack risk: active adversaries are harvesting encrypted traffic TODAY to decrypt once CRQCs exist.

Return JSON:
{
  currentYear: number,
  mosaicScenario: {
    optimistic:  { year: number, probability: number },
    moderate:    { year: number, probability: number },
    pessimistic: { year: number, probability: number }
  },
  harvestNowDecryptLaterRisk: 'active'|'emerging'|'future',
  nistPqcReadinessDeadline: string,
  industryDeadlines: [{ industry: string, mandateYear: number, standard: string }],
  recommendation: string
}`, 1024);

    return { success: true, data: this.parseJSON(raw, {}) };
  }

  private async pqcMigrationPlan(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const system = String(params.system ?? '');
    const cbom   = params.cbom ?? {};
    const raw = await this.ask(`Create a Post-Quantum Cryptography migration plan for: "${system}".
CBOM context: ${JSON.stringify(cbom)}.

Follow NSA CNSA 2.0 Suite and NIST SP 800-131A migration guidance.
Use hybrid classical+PQC approach during transition (prevents downgrade attacks while ensuring compatibility).

Return JSON:
{
  systemName: string,
  totalEffortWeeks: number,
  phases: [{
    name: string,
    description: string,
    assets: string[],
    approach: 'hybrid-classical-pqc'|'full-pqc'|'crypto-agility-layer',
    pqcAlgorithmsIntroduced: PQCAlgorithm[],
    estimatedWeeks: number,
    riskLevel: 'low'|'medium'|'high',
    dependencies: string[]
  }],
  testingStrategy: string,
  rollbackPlan: string,
  complianceTargets: string[]
}

Phase guidance:
  Phase 1: Crypto agility layer (abstract all crypto calls behind interfaces)
  Phase 2: Hybrid TLS (classical + ML-KEM in parallel, IETF RFC 9420)
  Phase 3: Code signing migration (ML-DSA-65)
  Phase 4: Certificate migration (NIST FIPS 203/204)
  Phase 5: Data-at-rest migration (AES-256 + ML-KEM key wrapping)`, 2048);

    return { success: true, data: this.parseJSON(raw, { phases: [], totalEffortWeeks: 0 }) };
  }

  private async cbomGenerate(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const system  = String(params.system ?? '');
    const context = String(params.context ?? '');
    const raw = await this.ask(`Generate a Cryptography Bill of Materials (CBOM) for: "${system}".
Context: ${context}

A CBOM is the cryptographic equivalent of an SBOM — it catalogs all crypto dependencies.
This is required by NSA CNSA 2.0, NIST NCCoE PQC Migration, and emerging EU Cyber Resilience Act.

Return JSON:
{
  systemName: string,
  generatedAt: string,
  totalCryptoAssets: number,
  quantumVulnerableCount: number,
  criticalAssets: [{
    id: string, algorithm: string, context: string, location: string,
    quantumVulnerable: true, harvestNowDecryptLater: boolean,
    threatLevel: 'critical'|'high', pqcReplacement: string,
    migrationUrgency: 'immediate'|'within-1-year'
  }],
  assets: [{ id, algorithm, context, location, quantumVulnerable, threatLevel, pqcReplacement }],
  overallQuantumRiskScore: number,
  estimatedHarvestWindow: string
}`, 2048);

    return { success: true, data: this.parseJSON(raw, { assets: [], criticalAssets: [], overallQuantumRiskScore: 0 }) };
  }

  private async assessCryptoAgility(params: Record<string, unknown>): ReturnType<UseCaseHandler> {
    const system = String(params.system ?? '');
    const stack  = String(params.stack ?? '');
    const raw = await this.ask(`Assess cryptographic agility for: "${system}" (stack: ${stack}).

Crypto agility = the ability to swap cryptographic algorithms without architectural changes.
This is the foundational requirement for PQC migration (NIST NCCoE SP 1800-38).

Evaluate:
  - Are algorithms hardcoded or configured?
  - Is there a crypto abstraction layer?
  - Does TLS support algorithm negotiation?
  - Can key lengths be changed without code changes?
  - Does the system support hybrid mode (classical + PQC simultaneously)?

Return JSON:
{
  systemName: string,
  agilityScore: number,
  hardcodedAlgorithms: string[],
  configurableAlgorithms: string[],
  algorithmNegotiationSupport: boolean,
  keyLengthFlexibility: boolean,
  hybridModeSupport: boolean,
  recommendations: string[]
}`, 1024);

    return { success: true, data: this.parseJSON(raw, { agilityScore: 0, hardcodedAlgorithms: [], recommendations: [] }) };
  }
}
