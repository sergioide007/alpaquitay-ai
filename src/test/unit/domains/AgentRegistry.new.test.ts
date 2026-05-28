/**
 * AgentRegistry — New Shells Registration Tests (v3.1.0)
 *
 * Verifies that QuantumReadinessShell, WellArchitectedShell, and ZeroTrustShell
 * are correctly registered in the catalog and discoverable by tags and semantic search.
 */

import { AgentRegistry } from '../../../domains/orchestration/AgentRegistry';

jest.mock('fs', () => ({
  existsSync:    jest.fn().mockReturnValue(false),
  mkdirSync:     jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync:  jest.fn(),
}));

describe('AgentRegistry — new shells in catalog (v3.1.0)', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  // ── Catalog presence ────────────────────────────────────────────────────────

  describe('quantum-readiness', () => {
    it('Is registered in the catalog', () => {
      const descriptor = registry.getDescriptor('quantum-readiness');
      expect(descriptor).toBeDefined();
    });

    it('Has correct name', () => {
      const descriptor = registry.getDescriptor('quantum-readiness');
      expect(descriptor?.name).toBe('Quantum Readiness Agent');
    });

    it('Has 5 capabilities', () => {
      const descriptor = registry.getDescriptor('quantum-readiness');
      expect(descriptor?.capabilities).toHaveLength(5);
    });

    it('Capability ids include crypto-inventory, cbom-generate, pqc-migration-plan', () => {
      const descriptor = registry.getDescriptor('quantum-readiness');
      const ids = descriptor?.capabilities.map(c => c.useCaseId) ?? [];
      expect(ids).toContain('crypto-inventory');
      expect(ids).toContain('cbom-generate');
      expect(ids).toContain('pqc-migration-plan');
      expect(ids).toContain('quantum-threat-timeline');
      expect(ids).toContain('assess-crypto-agility');
    });

    it('ISO standards include NIST FIPS 203, 204, 205', () => {
      const descriptor = registry.getDescriptor('quantum-readiness');
      const standards = descriptor?.isoStandards.join(' ') ?? '';
      expect(standards).toContain('NIST FIPS 203');
      expect(standards).toContain('NIST FIPS 204');
      expect(standards).toContain('NIST FIPS 205');
    });

    it('Tags include "quantum" and "pqc"', () => {
      const descriptor = registry.getDescriptor('quantum-readiness');
      expect(descriptor?.tags).toContain('quantum');
      expect(descriptor?.tags).toContain('pqc');
    });

    it('Factory creates a shell instance', () => {
      const descriptor = registry.getDescriptor('quantum-readiness');
      const shell = descriptor?.factory();
      expect(shell).toBeDefined();
      expect(shell?.domainId).toBe('quantum-readiness');
    });
  });

  describe('well-architected', () => {
    it('Is registered in the catalog', () => {
      expect(registry.getDescriptor('well-architected')).toBeDefined();
    });

    it('Has 7 capabilities', () => {
      const descriptor = registry.getDescriptor('well-architected');
      expect(descriptor?.capabilities).toHaveLength(7);
    });

    it('Capability ids cover all three cloud providers and FinOps', () => {
      const descriptor = registry.getDescriptor('well-architected');
      const ids = descriptor?.capabilities.map(c => c.useCaseId) ?? [];
      expect(ids).toContain('aws-waf-full-review');
      expect(ids).toContain('azure-waf-review');
      expect(ids).toContain('gcp-caf-review');
      expect(ids).toContain('finops-review');
      expect(ids).toContain('operational-excellence-scorecard');
      expect(ids).toContain('sustainability-assessment');
      expect(ids).toContain('multi-cloud-comparison');
    });

    it('Tags include "dora", "finops", "sustainability"', () => {
      const descriptor = registry.getDescriptor('well-architected');
      expect(descriptor?.tags).toContain('dora');
      expect(descriptor?.tags).toContain('finops');
      expect(descriptor?.tags).toContain('sustainability');
    });

    it('Factory creates a shell with domainId "well-architected"', () => {
      const shell = registry.getDescriptor('well-architected')?.factory();
      expect(shell?.domainId).toBe('well-architected');
    });
  });

  describe('zero-trust', () => {
    it('Is registered in the catalog', () => {
      expect(registry.getDescriptor('zero-trust')).toBeDefined();
    });

    it('Has 5 capabilities', () => {
      const descriptor = registry.getDescriptor('zero-trust');
      expect(descriptor?.capabilities).toHaveLength(5);
    });

    it('Capability ids include assess-ztmm, microsegmentation-plan, privileged-access-design', () => {
      const descriptor = registry.getDescriptor('zero-trust');
      const ids = descriptor?.capabilities.map(c => c.useCaseId) ?? [];
      expect(ids).toContain('assess-ztmm');
      expect(ids).toContain('design-identity-fabric');
      expect(ids).toContain('microsegmentation-plan');
      expect(ids).toContain('continuous-verification-policy');
      expect(ids).toContain('privileged-access-design');
    });

    it('ISO standards include NIST SP 800-207 and CISA ZTMM', () => {
      const standards = registry.getDescriptor('zero-trust')?.isoStandards.join(' ') ?? '';
      expect(standards).toContain('NIST SP 800-207');
      expect(standards).toContain('CISA ZTMM');
    });

    it('Tags include "zero-trust", "ztmm", "microsegmentation"', () => {
      const tags = registry.getDescriptor('zero-trust')?.tags ?? [];
      expect(tags).toContain('zero-trust');
      expect(tags).toContain('ztmm');
      expect(tags).toContain('microsegmentation');
    });

    it('Factory creates a shell with domainId "zero-trust"', () => {
      const shell = registry.getDescriptor('zero-trust')?.factory();
      expect(shell?.domainId).toBe('zero-trust');
    });
  });

  // ── findByTags ──────────────────────────────────────────────────────────────

  describe('findByTags()', () => {
    it('findByTags(["quantum"]) returns quantum-readiness', () => {
      const results = registry.findByTags(['quantum']);
      expect(results.some(d => d.domainId === 'quantum-readiness')).toBe(true);
    });

    it('findByTags(["zero-trust"]) returns zero-trust', () => {
      const results = registry.findByTags(['zero-trust']);
      expect(results.some(d => d.domainId === 'zero-trust')).toBe(true);
    });

    it('findByTags(["finops"]) returns well-architected', () => {
      const results = registry.findByTags(['finops']);
      expect(results.some(d => d.domainId === 'well-architected')).toBe(true);
    });

    it('findByTags(["dora"]) returns well-architected', () => {
      const results = registry.findByTags(['dora']);
      expect(results.some(d => d.domainId === 'well-architected')).toBe(true);
    });
  });

  // ── scoreRelevance ──────────────────────────────────────────────────────────

  describe('scoreRelevance()', () => {
    it('Query "quantum cryptography migration" scores quantum-readiness at the top', () => {
      const scored = registry.scoreRelevance('quantum cryptography migration pqc');
      expect(scored.length).toBeGreaterThan(0);
      expect(scored[0].descriptor.domainId).toBe('quantum-readiness');
    });

    it('Query "zero trust identity microsegmentation" scores zero-trust at the top', () => {
      const scored = registry.scoreRelevance('zero trust identity microsegmentation ztmm');
      expect(scored.length).toBeGreaterThan(0);
      expect(scored[0].descriptor.domainId).toBe('zero-trust');
    });

    it('Query "well architected aws review dora finops" scores well-architected at the top', () => {
      const scored = registry.scoreRelevance('well architected aws review dora finops');
      expect(scored.length).toBeGreaterThan(0);
      expect(scored[0].descriptor.domainId).toBe('well-architected');
    });
  });

  // ── Total catalog count ──────────────────────────────────────────────────────

  it('Catalog contains at least 17 agents (14 original + 3 new)', () => {
    expect(registry.getAll().length).toBeGreaterThanOrEqual(17);
  });
});
