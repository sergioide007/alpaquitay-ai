/**
 * Agent Registry — Catalog of all Domain Agent Shells.
 *
 * The SuperAgent uses this registry to:
 *   1. Discover which domains exist and what use cases they expose
 *   2. Instantiate shells lazily (factory pattern)
 *   3. Route incoming objectives to the right specialist(s)
 *   4. Compose multi-agent workflows
 *
 * TOGAF: Application Portfolio Catalogue
 * ArchiMate: Application Component Registry
 * BIAN: Service Domain Directory
 */

import type { AIProvider } from '../../core/interfaces';
import type { IDomainAgentShell, DomainId } from '../interfaces/DomainAgentShell';
import { EnglishDomainShell }       from '../english/EnglishDomainShell';
import { SoftwareEngineerShell }    from '../software-engineer/SoftwareEngineerShell';
import { SoftwareArchitectShell }   from '../software-architect/SoftwareArchitectShell';
import { DeveloperShell }           from '../developer/DeveloperShell';
import { QAShell }                  from '../qa/QAShell';
import { DevOpsShell }              from '../devops/DevOpsShell';
import { DevSecOpsShell }           from '../devsecops/DevSecOpsShell';
import { SecurityShell }            from '../security/SecurityShell';
import { InfrastructureShell }      from '../infrastructure/InfrastructureShell';
import { CloudShell }               from '../cloud/CloudShell';
import { MarketingShell }           from '../marketing/MarketingShell';
import { ProcessShell }             from '../process/ProcessShell';
import { AIExpertShell }            from '../ai-expert/AIExpertShell';
import { BusinessShell }            from '../business/BusinessShell';

export interface AgentCapability {
  useCaseId: string;
  description: string;
  inputSchema: Record<string, string>;
  isoReference?: string;
}

export interface AgentDescriptor {
  domainId: DomainId;
  name: string;
  description: string;
  version: string;
  isoStandards: string[];
  capabilities: AgentCapability[];
  tags: string[];
  factory: () => IDomainAgentShell;
}

export class AgentRegistry {
  private static readonly CATALOG: AgentDescriptor[] = [
    {
      domainId: 'english',
      name: 'English Mastery Agent',
      description: 'CEFR-aligned English language learning with grammar, pronunciation, phrases and level assessment.',
      version: '1.0.0',
      isoStandards: ['CEFR', 'ISO 17024', 'ISO 21001'],
      tags: ['education', 'language', 'cefr', 'grammar', 'pronunciation'],
      capabilities: [
        { useCaseId: 'practice-grammar',    description: 'Generate CEFR grammar drill session',      inputSchema: { level: 'CEFRLevel', topic: 'string' } },
        { useCaseId: 'get-daily-phrases',   description: '5 daily phrases with IPA',                 inputSchema: { level: 'CEFRLevel', category: 'string' } },
        { useCaseId: 'assess-level',        description: 'Detect CEFR level from free text',          inputSchema: { sampleText: 'string?' } },
        { useCaseId: 'submit-exercise',     description: 'Evaluate answer and track progress',        inputSchema: { exerciseId: 'string', userAnswer: 'string' } },
        { useCaseId: 'get-progress',        description: 'Weekly insight and skill scores',           inputSchema: { learnerId: 'string' } },
      ],
      factory: () => new EnglishDomainShell(),
    },
    {
      domainId: 'software-engineer',
      name: 'Software Engineer Agent',
      description: 'Code review, SOLID analysis, tech debt detection, design pattern recommendations. ISO/IEC 12207 · 25010.',
      version: '1.0.0',
      isoStandards: ['ISO/IEC 12207', 'ISO/IEC 25010'],
      tags: ['software', 'code-quality', 'solid', 'tech-debt', 'design-patterns'],
      capabilities: [
        { useCaseId: 'review-code',         description: 'Review code quality (ISO/IEC 25010)',       inputSchema: { code: 'string', language: 'string' } },
        { useCaseId: 'analyze-solid',       description: 'SOLID principles analysis',                 inputSchema: { code: 'string' } },
        { useCaseId: 'detect-tech-debt',    description: 'Identify and prioritize technical debt',    inputSchema: { description: 'string' } },
        { useCaseId: 'suggest-patterns',    description: 'Recommend design patterns for problem',     inputSchema: { problem: 'string' } },
        { useCaseId: 'estimate-complexity', description: 'Cyclomatic + cognitive complexity',         inputSchema: { code: 'string' } },
      ],
      factory: () => new SoftwareEngineerShell(),
    },
    {
      domainId: 'software-architect',
      name: 'Software Architect Agent',
      description: 'Architecture assessment, ADR creation, C4 diagrams, technology radar. ISO/IEC 42010 · TOGAF · ArchiMate.',
      version: '1.0.0',
      isoStandards: ['ISO/IEC 42010', 'TOGAF ADM', 'ArchiMate 3.2'],
      tags: ['architecture', 'adr', 'c4', 'togaf', 'tech-radar'],
      capabilities: [
        { useCaseId: 'assess-architecture',        description: 'Full architecture assessment',               inputSchema: { context: 'string' } },
        { useCaseId: 'create-adr',                 description: 'Architecture Decision Record (ISO/IEC 42010)', inputSchema: { context: 'string', decision: 'string' } },
        { useCaseId: 'generate-c4',                description: 'C4 model diagram generation',                inputSchema: { level: 'string', system: 'string' } },
        { useCaseId: 'build-tech-radar',           description: 'Technology Radar (Adopt/Trial/Assess/Hold)', inputSchema: { context: 'string' } },
        { useCaseId: 'evaluate-quality-attributes',description: 'ISO/IEC 25010 quality attribute analysis',   inputSchema: { requirements: 'string' } },
      ],
      factory: () => new SoftwareArchitectShell(),
    },
    {
      domainId: 'developer',
      name: 'Developer Agent',
      description: 'Feature implementation, debugging, refactoring, test generation. Clean Architecture · TDD · DDD.',
      version: '1.0.0',
      isoStandards: ['ISO/IEC 12207', 'Clean Code'],
      tags: ['development', 'implementation', 'debugging', 'refactoring', 'tdd'],
      capabilities: [
        { useCaseId: 'implement-feature', description: 'Implement feature with full files',   inputSchema: { feature: 'string', stack: 'string' } },
        { useCaseId: 'debug-issue',       description: 'Diagnose and fix code issues',        inputSchema: { error: 'string', code: 'string' } },
        { useCaseId: 'refactor-code',     description: 'Refactor applying SOLID/DRY/KISS',   inputSchema: { code: 'string', goal: 'string' } },
        { useCaseId: 'explain-code',      description: 'Explain code at audience level',      inputSchema: { code: 'string', audienceLevel: 'string' } },
        { useCaseId: 'generate-tests',    description: 'Generate comprehensive test suite',   inputSchema: { code: 'string', framework: 'string' } },
      ],
      factory: () => new DeveloperShell(),
    },
    {
      domainId: 'qa',
      name: 'QA Agent',
      description: 'Test plan creation, test case generation, bug triage, coverage evaluation. ISO/IEC 29119 · ISTQB.',
      version: '1.0.0',
      isoStandards: ['ISO/IEC 29119', 'ISO 9001', 'ISTQB'],
      tags: ['testing', 'quality', 'test-plan', 'bug-triage', 'coverage'],
      capabilities: [
        { useCaseId: 'create-test-plan',    description: 'Test plan (ISO/IEC 29119)',              inputSchema: { feature: 'string' } },
        { useCaseId: 'generate-test-cases', description: 'Test cases (happy/edge/negative)',       inputSchema: { spec: 'string', type: 'string' } },
        { useCaseId: 'triage-bug',          description: 'Bug severity and priority triage',       inputSchema: { description: 'string' } },
        { useCaseId: 'evaluate-coverage',   description: 'Coverage analysis and recommendations',  inputSchema: { context: 'string' } },
        { useCaseId: 'define-quality-gate', description: 'Quality gate definition (ISO 9001)',      inputSchema: { service: 'string' } },
      ],
      factory: () => new QAShell(),
    },
    {
      domainId: 'devops',
      name: 'DevOps Agent',
      description: 'CI/CD pipeline design, DORA metrics, deployment planning, IaC generation, runbooks. DORA · ISO/IEC 20000.',
      version: '1.0.0',
      isoStandards: ['ISO/IEC 20000-1', 'ITIL v4', 'DORA Metrics'],
      tags: ['devops', 'ci-cd', 'dora', 'deployment', 'iac', 'runbook'],
      capabilities: [
        { useCaseId: 'design-pipeline',  description: 'CI/CD pipeline (DORA elite tier)',         inputSchema: { stack: 'string' } },
        { useCaseId: 'assess-dora',      description: 'DORA metrics assessment',                   inputSchema: { metrics: 'object' } },
        { useCaseId: 'plan-deployment',  description: 'Zero-downtime deployment plan',             inputSchema: { service: 'string', environment: 'string' } },
        { useCaseId: 'generate-iac',     description: 'IaC code (Terraform/Pulumi/CDK)',           inputSchema: { resource: 'string', tool: 'string', provider: 'string' } },
        { useCaseId: 'create-runbook',   description: 'Incident runbook (ITIL v4)',                inputSchema: { incident: 'string' } },
      ],
      factory: () => new DevOpsShell(),
    },
    {
      domainId: 'devsecops',
      name: 'DevSecOps Agent',
      description: 'Secure pipeline design, STRIDE threat modeling, OWASP SAMM assessment. ISO/IEC 27001 · NIST SSDF.',
      version: '1.0.0',
      isoStandards: ['ISO/IEC 27001', 'OWASP SAMM', 'NIST SP 800-218'],
      tags: ['security', 'devsecops', 'threat-model', 'sast', 'sbom'],
      capabilities: [
        { useCaseId: 'design-secure-pipeline', description: 'Secure pipeline with SAST/DAST/SCA',   inputSchema: { stack: 'string' } },
        { useCaseId: 'threat-model',           description: 'STRIDE threat model',                   inputSchema: { system: 'string' } },
        { useCaseId: 'assess-samm',            description: 'OWASP SAMM maturity assessment',        inputSchema: { context: 'string' } },
        { useCaseId: 'scan-findings-triage',   description: 'Security scan findings triage',         inputSchema: { findings: 'array' } },
        { useCaseId: 'generate-sbom',          description: 'SBOM analysis and risk report',         inputSchema: { project: 'string' } },
      ],
      factory: () => new DevSecOpsShell(),
    },
    {
      domainId: 'security',
      name: 'Security Agent',
      description: 'ISO 27001 audit, penetration test planning, risk register, incident response. NIST CSF 2.0 · SOC 2.',
      version: '1.0.0',
      isoStandards: ['ISO/IEC 27001', 'NIST CSF 2.0', 'SOC 2', 'MITRE ATT&CK'],
      tags: ['security', 'audit', 'compliance', 'pentest', 'incident-response'],
      capabilities: [
        { useCaseId: 'audit-compliance',     description: 'ISO 27001 / SOC 2 compliance audit',    inputSchema: { framework: 'string', context: 'string' } },
        { useCaseId: 'plan-pentest',         description: 'Penetration test scope and plan',        inputSchema: { scope: 'string' } },
        { useCaseId: 'manage-risk-register', description: 'ISO 27001 risk register',                inputSchema: { context: 'string' } },
        { useCaseId: 'respond-incident',     description: 'Incident response playbook',             inputSchema: { incident: 'string' } },
        { useCaseId: 'assess-csf',           description: 'NIST CSF 2.0 maturity assessment',       inputSchema: { context: 'string' } },
      ],
      factory: () => new SecurityShell(),
    },
    {
      domainId: 'infrastructure',
      name: 'Infrastructure Agent',
      description: 'Capacity planning, network design, SLA contracts, DR plans, monitoring. ITIL v4 · ISO 22301.',
      version: '1.0.0',
      isoStandards: ['ITIL v4', 'ISO/IEC 20000-1', 'ISO 22301'],
      tags: ['infrastructure', 'capacity', 'network', 'sla', 'monitoring', 'dr'],
      capabilities: [
        { useCaseId: 'plan-capacity',        description: 'Infrastructure capacity plan',           inputSchema: { context: 'string', horizon: 'string' } },
        { useCaseId: 'design-network',       description: 'Network topology design',                inputSchema: { requirements: 'string' } },
        { useCaseId: 'create-sla',           description: 'SLA contract (ISO/IEC 20000-1)',         inputSchema: { service: 'string', tier: 'string' } },
        { useCaseId: 'plan-dr',              description: 'Disaster recovery plan (ISO 22301)',      inputSchema: { system: 'string', rtoHours: 'number' } },
        { useCaseId: 'configure-monitoring', description: 'Observability and alerting config',      inputSchema: { system: 'string' } },
      ],
      factory: () => new InfrastructureShell(),
    },
    {
      domainId: 'cloud',
      name: 'Cloud Infrastructure Agent',
      description: 'Cloud architecture design, Well-Architected review, cost optimization, IaC. AWS/Azure/GCP · ISO/IEC 27017.',
      version: '1.0.0',
      isoStandards: ['ISO/IEC 27017', 'ISO/IEC 27018', 'CSA STAR'],
      tags: ['cloud', 'aws', 'azure', 'gcp', 'well-architected', 'iac', 'cost'],
      capabilities: [
        { useCaseId: 'design-architecture',     description: 'Cloud architecture design',           inputSchema: { requirements: 'string', provider: 'string' } },
        { useCaseId: 'well-architected-review',  description: 'Well-Architected Framework review',  inputSchema: { workload: 'string', pillar: 'string' } },
        { useCaseId: 'optimize-cost',            description: 'Cloud cost optimization plan',        inputSchema: { context: 'string' } },
        { useCaseId: 'plan-migration',           description: 'Cloud migration plan (6R)',           inputSchema: { workloads: 'string', target: 'string' } },
        { useCaseId: 'generate-iac',             description: 'Production IaC code',                inputSchema: { resource: 'string', tool: 'string', provider: 'string' } },
      ],
      factory: () => new CloudShell(),
    },
    {
      domainId: 'marketing',
      name: 'Marketing Agent',
      description: 'Campaign planning, audience segmentation, SEO, content creation, ROI measurement. ISO 10668.',
      version: '1.0.0',
      isoStandards: ['ISO 10668', 'IMC Framework'],
      tags: ['marketing', 'campaign', 'seo', 'content', 'roi', 'audience'],
      capabilities: [
        { useCaseId: 'plan-campaign',    description: 'Full marketing campaign plan',      inputSchema: { objective: 'string', budget: 'number' } },
        { useCaseId: 'segment-audience', description: 'Audience segmentation and ICP',    inputSchema: { product: 'string' } },
        { useCaseId: 'analyze-seo',      description: 'SEO analysis and keyword strategy', inputSchema: { domain: 'string', niche: 'string' } },
        { useCaseId: 'create-content',   description: 'Content creation for persona',     inputSchema: { type: 'string', topic: 'string', persona: 'string' } },
        { useCaseId: 'measure-roi',      description: 'Marketing ROI (ISO 10668)',         inputSchema: { data: 'object' } },
      ],
      factory: () => new MarketingShell(),
    },
    {
      domainId: 'process',
      name: 'Process Management Agent',
      description: 'Business process mapping, gap analysis, value stream, ISO compliance, optimization. ISO 9001 · BPM CBOK · Six Sigma.',
      version: '1.0.0',
      isoStandards: ['ISO 9001:2015', 'BPM CBOK', 'BPMN 2.0', 'CMMI', 'Six Sigma'],
      tags: ['process', 'bpm', 'iso9001', 'six-sigma', 'lean', 'compliance', 'cmmi'],
      capabilities: [
        { useCaseId: 'map-process',      description: 'BPMN process mapping (ISO 9001)',    inputSchema: { process: 'string' } },
        { useCaseId: 'gap-analysis',     description: 'Framework gap analysis',             inputSchema: { framework: 'string', currentState: 'string' } },
        { useCaseId: 'value-stream-map', description: 'Value Stream Map (Lean Six Sigma)',  inputSchema: { product: 'string' } },
        { useCaseId: 'iso-compliance',   description: 'ISO compliance check',               inputSchema: { framework: 'string', context: 'string' } },
        { useCaseId: 'optimize-process', description: 'Process optimization',               inputSchema: { process: 'string', goal: 'string' } },
      ],
      factory: () => new ProcessShell(),
    },
    {
      domainId: 'ai-expert',
      name: 'AI Expert Agent',
      description: 'LLM evaluation, RAG architecture design, prompt engineering, AI system design, MLOps, and AI governance. ISO/IEC 42001 · EU AI Act · NIST AI RMF.',
      version: '1.0.0',
      isoStandards: ['ISO/IEC 42001:2023', 'EU AI Act', 'NIST AI RMF 1.0', 'IEEE 7000'],
      tags: ['ai', 'llm', 'rag', 'prompt', 'mlops', 'governance', 'ethics', 'eu-ai-act'],
      capabilities: [
        { useCaseId: 'evaluate-llm',      description: 'Compare and select LLMs for a use case',         inputSchema: { useCase: 'string', budgetConstraint: 'string' } },
        { useCaseId: 'design-rag',        description: 'Production RAG architecture design',              inputSchema: { domain: 'string', dataSize: 'string', latencyRequirement: 'string' } },
        { useCaseId: 'engineer-prompt',   description: 'Production-ready prompt engineering',             inputSchema: { task: 'string', targetModel: 'string', technique: 'string' } },
        { useCaseId: 'design-ai-system',  description: 'Complete AI system design (ISO/IEC 42001)',       inputSchema: { requirements: 'string', scale: 'string' } },
        { useCaseId: 'assess-governance', description: 'AI governance audit (EU AI Act / NIST AI RMF)',  inputSchema: { system: 'string', context: 'string' } },
        { useCaseId: 'design-mlops',      description: 'MLOps pipeline design (L0→L3 maturity)',         inputSchema: { context: 'string', currentMaturity: 'number' } },
      ],
      factory: () => new AIExpertShell(),
    },
    {
      domainId: 'business',
      name: 'Business Expert Agent',
      description: 'Business model design, strategic analysis, OKRs, financial modeling, market analysis, business cases. ISO 56002 · Balanced Scorecard · Canvas.',
      version: '1.0.0',
      isoStandards: ['ISO 56002:2019', 'ISO 9001:2015', 'Balanced Scorecard', 'OKR Framework'],
      tags: ['business', 'strategy', 'okr', 'financial', 'market', 'bmc', 'innovation', 'swot'],
      capabilities: [
        { useCaseId: 'design-business-model', description: 'Business Model Canvas (ISO 56002)',           inputSchema: { idea: 'string', stage: 'string' } },
        { useCaseId: 'strategic-analysis',    description: 'SWOT/PESTLE/Porter strategic analysis',       inputSchema: { company: 'string', framework: 'string' } },
        { useCaseId: 'define-okrs',           description: 'OKR definition (company/team level)',         inputSchema: { mission: 'string', quarter: 'string', level: 'string' } },
        { useCaseId: 'financial-model',       description: 'Financial model with unit economics',         inputSchema: { business: 'string', scenario: 'string', months: 'number' } },
        { useCaseId: 'market-analysis',       description: 'TAM/SAM/SOM + competitive landscape',        inputSchema: { market: 'string', region: 'string' } },
        { useCaseId: 'build-business-case',   description: 'Business case with ROI and risk analysis',   inputSchema: { initiative: 'string', budget: 'string' } },
      ],
      factory: () => new BusinessShell(),
    },
  ];

  private instances = new Map<DomainId, IDomainAgentShell>();

  getAll(): AgentDescriptor[] {
    return AgentRegistry.CATALOG;
  }

  getDescriptor(domainId: DomainId): AgentDescriptor | undefined {
    return AgentRegistry.CATALOG.find(d => d.domainId === domainId);
  }

  findByTags(tags: string[]): AgentDescriptor[] {
    return AgentRegistry.CATALOG.filter(d => tags.some(t => d.tags.includes(t)));
  }

  findByUseCase(useCaseId: string): AgentDescriptor[] {
    return AgentRegistry.CATALOG.filter(d => d.capabilities.some(c => c.useCaseId === useCaseId));
  }

  /**
   * Semantic routing: given a natural language objective, score each agent by keyword overlap.
   * Returns agents sorted by relevance score descending.
   */
  scoreRelevance(objective: string): Array<{ descriptor: AgentDescriptor; score: number }> {
    const words = objective.toLowerCase().split(/\s+/);
    return AgentRegistry.CATALOG
      .map(d => {
        const searchable = [d.name, d.description, ...d.tags, ...d.isoStandards, ...d.capabilities.map(c => c.description)].join(' ').toLowerCase();
        const score = words.reduce((acc, w) => acc + (searchable.includes(w) ? 1 : 0), 0);
        return { descriptor: d, score };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  async getInstance(domainId: DomainId, provider: AIProvider, workspace: string): Promise<IDomainAgentShell> {
    if (!this.instances.has(domainId)) {
      const descriptor = this.getDescriptor(domainId);
      if (!descriptor) throw new Error(`No agent registered for domain: ${domainId}`);
      const shell = descriptor.factory();
      await shell.initialize(provider, workspace);
      this.instances.set(domainId, shell);
    }
    return this.instances.get(domainId)!;
  }

  releaseAll(): void {
    this.instances.clear();
  }
}
