/**
 * Quantum Readiness Domain Model
 *
 * Standards:
 *   NIST FIPS 203 (ML-KEM / Kyber) — Key Encapsulation Mechanism
 *   NIST FIPS 204 (ML-DSA / Dilithium) — Digital Signature
 *   NIST FIPS 205 (SLH-DSA / SPHINCS+) — Hash-based Signature
 *   NIST SP 800-131A Rev 3 — Transitioning Cryptographic Algorithms
 *   ETSI GS QKD 004 — Quantum Key Distribution
 *   NIST IR 8413 — Status Report on the 3rd Round of NIST PQC Standardization
 */

export type ClassicalCryptoAlgorithm =
  | 'RSA-1024' | 'RSA-2048' | 'RSA-4096'
  | 'ECC-P256' | 'ECC-P384' | 'ECC-P521' | 'ECC-Curve25519'
  | 'DH-2048' | 'DH-4096'
  | 'AES-128' | 'AES-256'
  | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'
  | 'ECDSA' | 'DSA' | 'Ed25519';

export type PQCAlgorithm =
  | 'ML-KEM-512' | 'ML-KEM-768' | 'ML-KEM-1024'    // NIST FIPS 203
  | 'ML-DSA-44'  | 'ML-DSA-65'  | 'ML-DSA-87'      // NIST FIPS 204
  | 'SLH-DSA-128s' | 'SLH-DSA-192s' | 'SLH-DSA-256s' // NIST FIPS 205
  | 'HQC-128' | 'HQC-192' | 'HQC-256';              // Round 4 candidate (KEM backup)

export type QuantumThreatLevel = 'critical' | 'high' | 'medium' | 'low' | 'negligible';
export type CryptoUsageContext = 'key-exchange' | 'digital-signature' | 'encryption' | 'hashing' | 'mac' | 'tls' | 'code-signing' | 'certificate';
export type MigrationUrgency = 'immediate' | 'within-1-year' | 'within-3-years' | 'within-5-years' | 'no-action';

export interface CryptographicAsset {
  id: string;
  algorithm: ClassicalCryptoAlgorithm;
  context: CryptoUsageContext;
  location: string;
  quantumVulnerable: boolean;
  harvestNowDecryptLater: boolean;
  threatLevel: QuantumThreatLevel;
  pqcReplacement: PQCAlgorithm;
  migrationUrgency: MigrationUrgency;
  estimatedMigrationEffort: 'days' | 'weeks' | 'months' | 'quarters';
  notes?: string;
}

/** Cryptography Bill of Materials — analogous to SBOM but for crypto assets */
export interface CBOM {
  systemName: string;
  generatedAt: string;
  totalCryptoAssets: number;
  quantumVulnerableCount: number;
  criticalAssets: CryptographicAsset[];
  assets: CryptographicAsset[];
  overallQuantumRiskScore: number;
  estimatedHarvestWindow: string;
}

export interface QuantumThreatTimeline {
  currentYear: number;
  mosaicScenario: {
    optimistic: { year: number; probability: number };
    moderate:   { year: number; probability: number };
    pessimistic: { year: number; probability: number };
  };
  harvestNowDecryptLaterRisk: 'active' | 'emerging' | 'future';
  nistPqcReadinessDeadline: string;
  industryDeadlines: Array<{ industry: string; mandateYear: number; standard: string }>;
  recommendation: string;
}

export interface CryptoAgilityAssessment {
  systemName: string;
  agilityScore: number;
  hardcodedAlgorithms: string[];
  configurableAlgorithms: string[];
  algorithmNegotiationSupport: boolean;
  keyLengthFlexibility: boolean;
  hybridModeSupport: boolean;
  recommendations: string[];
}

export interface PQCMigrationPlan {
  systemName: string;
  totalEffortWeeks: number;
  phases: Array<{
    name: string;
    description: string;
    assets: string[];
    approach: 'hybrid-classical-pqc' | 'full-pqc' | 'crypto-agility-layer';
    pqcAlgorithmsIntroduced: PQCAlgorithm[];
    estimatedWeeks: number;
    riskLevel: 'low' | 'medium' | 'high';
    dependencies: string[];
  }>;
  testingStrategy: string;
  rollbackPlan: string;
  complianceTargets: string[];
}
