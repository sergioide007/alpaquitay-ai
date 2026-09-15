import type { AIProvider, MCPExecutor } from '../interfaces';
import type { ProjectContext } from '../../prompts/MasterPrompts';
import type { DomainId, GuardrailResult } from '../../domains/interfaces/DomainAgentShell';
import {
  AgentRegistry,
  type AgentCapability,
  type AgentDescriptor,
} from '../../domains/orchestration/AgentRegistry';
import { PrivacyGuard } from '../../domains/orchestration/privacy/PrivacyGuard';
import { ProjectContextBuilder } from '../ProjectContextBuilder';

/** One specialist invocation is deliberately limited to one shell and one AI completion. */
export const MAX_SPECIALIST_INPUT_CHARS = 16_000;

export interface SpecialistSelection {
  specialistId: DomainId;
  specialistName: string;
  useCaseId: string;
  confidence: number;
  reasons: string[];
}

export interface SpecialistRouteResult {
  /** False means the caller should keep using its normal chat route. */
  handled: boolean;
  success: boolean;
  answer: string;
  specialistId: DomainId | null;
  specialistName?: string;
  useCaseId?: string;
  confidence: number;
  reasons: string[];
  privacyRedacted: boolean;
  guardrailResults: GuardrailResult[];
}

interface RoutingHint {
  domainId: DomainId;
  useCaseId: string;
  label: string;
  pattern: RegExp;
  weight: number;
}

interface RankedCapability {
  descriptor: AgentDescriptor;
  capability: AgentCapability;
  score: number;
  hintScore: number;
  reasons: string[];
}

interface WorkspaceSummary {
  style: string;
  language: string;
  framework: string;
  structure: string;
}

const MIN_ROUTE_SCORE = 8;

// Hints resolve important terms whose natural-language form differs from a catalog id.
// The catalog scorer below remains the fallback, so new registered agents are discoverable
// without adding an entry here.
const ROUTING_HINTS: RoutingHint[] = [
  { domainId: 'quantum-readiness', useCaseId: 'cbom-generate', label: 'cryptography bill of materials (CBOM)', pattern: /\b(cbom|cryptograph\w* bill of materials)\b/i, weight: 30 },
  { domainId: 'quantum-readiness', useCaseId: 'pqc-migration-plan', label: 'post-quantum migration', pattern: /\b(pqc migration|post quantum migration|migrate\w* (rsa|ecc|cryptograph))\b/i, weight: 30 },
  { domainId: 'quantum-readiness', useCaseId: 'assess-crypto-agility', label: 'crypto agility', pattern: /\bcrypto(?:graphic)? agility\b/i, weight: 30 },
  { domainId: 'quantum-readiness', useCaseId: 'quantum-threat-timeline', label: 'quantum/HNDL threat', pattern: /\b(hndl|harvest now|quantum threat|quantum readiness)\b/i, weight: 24 },

  { domainId: 'zero-trust', useCaseId: 'microsegmentation-plan', label: 'zero-trust microsegmentation', pattern: /\bmicro[ -]?segmentation\b/i, weight: 30 },
  { domainId: 'zero-trust', useCaseId: 'assess-ztmm', label: 'CISA zero-trust maturity', pattern: /\b(ztmm|zero trust maturity)\b/i, weight: 30 },
  { domainId: 'zero-trust', useCaseId: 'privileged-access-design', label: 'privileged access management', pattern: /\b(pam|privileged access)\b/i, weight: 28 },
  { domainId: 'zero-trust', useCaseId: 'design-identity-fabric', label: 'zero-trust identity fabric', pattern: /\b(identity fabric|beyondcorp)\b/i, weight: 28 },

  { domainId: 'well-architected', useCaseId: 'finops-review', label: 'FinOps review', pattern: /\bfinops\b/i, weight: 30 },
  { domainId: 'well-architected', useCaseId: 'operational-excellence-scorecard', label: 'operational excellence/SRE scorecard', pattern: /\b(operational excellence|golden signals|sre scorecard)\b/i, weight: 28 },
  { domainId: 'well-architected', useCaseId: 'aws-waf-full-review', label: 'AWS Well-Architected review', pattern: /\b(aws waf|aws well architected)\b/i, weight: 30 },
  { domainId: 'well-architected', useCaseId: 'azure-waf-review', label: 'Azure Well-Architected review', pattern: /\b(azure waf|azure well architected)\b/i, weight: 30 },
  { domainId: 'well-architected', useCaseId: 'gcp-caf-review', label: 'GCP architecture-framework review', pattern: /\b(gcp caf|google cloud architecture framework)\b/i, weight: 30 },

  { domainId: 'devsecops', useCaseId: 'threat-model', label: 'STRIDE threat model', pattern: /\b(stride|threat model\w*)\b/i, weight: 30 },
  { domainId: 'devsecops', useCaseId: 'design-secure-pipeline', label: 'secure CI/CD pipeline', pattern: /\b(secure pipeline|sast|dast|software composition analysis)\b/i, weight: 28 },
  { domainId: 'devsecops', useCaseId: 'generate-sbom', label: 'software bill of materials (SBOM)', pattern: /\b(sbom|software bill of materials)\b/i, weight: 30 },
  { domainId: 'devsecops', useCaseId: 'assess-samm', label: 'OWASP SAMM assessment', pattern: /\b(owasp samm|samm maturity)\b/i, weight: 30 },

  { domainId: 'security', useCaseId: 'plan-pentest', label: 'penetration-test planning', pattern: /\b(pentest|penetration test)\b/i, weight: 30 },
  { domainId: 'security', useCaseId: 'respond-incident', label: 'security incident response', pattern: /\b(security incident|incident response|breach response)\b/i, weight: 28 },
  { domainId: 'security', useCaseId: 'manage-risk-register', label: 'security risk register', pattern: /\b(risk register)\b/i, weight: 28 },
  { domainId: 'security', useCaseId: 'assess-csf', label: 'NIST CSF assessment', pattern: /\b(nist csf|cybersecurity framework)\b/i, weight: 28 },

  { domainId: 'devops', useCaseId: 'assess-dora', label: 'DORA metrics', pattern: /\b(dora|deployment frequency|change failure rate|mean time to restore|mttr)\b/i, weight: 28 },
  { domainId: 'devops', useCaseId: 'generate-iac', label: 'infrastructure as code', pattern: /\b(terraform|pulumi|infrastructure as code|\biac\b|cloudformation)\b/i, weight: 28 },
  { domainId: 'devops', useCaseId: 'create-runbook', label: 'operations runbook', pattern: /\b(runbook|operational playbook)\b/i, weight: 26 },
  { domainId: 'devops', useCaseId: 'plan-deployment', label: 'deployment planning', pattern: /\b(deploy\w*|release strategy|blue green|canary release)\b/i, weight: 22 },
  { domainId: 'devops', useCaseId: 'design-pipeline', label: 'CI/CD pipeline', pattern: /\b(ci ?\/? ?cd|cicd|build pipeline|delivery pipeline)\b/i, weight: 22 },

  { domainId: 'software-architect', useCaseId: 'create-adr', label: 'architecture decision record', pattern: /\b(adr|architecture decision record)\b/i, weight: 30 },
  { domainId: 'software-architect', useCaseId: 'generate-c4', label: 'C4 architecture diagram', pattern: /\b(c4 diagram|c4 model|context diagram|container diagram)\b/i, weight: 28 },
  { domainId: 'software-architect', useCaseId: 'build-tech-radar', label: 'technology radar', pattern: /\b(technology radar|tech radar)\b/i, weight: 28 },

  { domainId: 'software-engineer', useCaseId: 'detect-tech-debt', label: 'technical-debt analysis', pattern: /\b(technical debt|tech debt|deuda tecnica)\b/i, weight: 28 },
  { domainId: 'software-engineer', useCaseId: 'analyze-solid', label: 'SOLID analysis', pattern: /\bsolid principles?\b/i, weight: 28 },
  { domainId: 'software-engineer', useCaseId: 'estimate-complexity', label: 'code-complexity analysis', pattern: /\b(cyclomatic|cognitive complexity|maintainability index)\b/i, weight: 28 },

  { domainId: 'qa', useCaseId: 'create-test-plan', label: 'QA test plan', pattern: /\b(test plan|plan de pruebas)\b/i, weight: 28 },
  { domainId: 'qa', useCaseId: 'evaluate-coverage', label: 'test-coverage evaluation', pattern: /\b(test coverage|coverage gap|cobertura de pruebas)\b/i, weight: 26 },
  { domainId: 'qa', useCaseId: 'define-quality-gate', label: 'quality gate', pattern: /\bquality gate\b/i, weight: 26 },

  { domainId: 'ai-expert', useCaseId: 'design-rag', label: 'RAG architecture', pattern: /\b(rag architecture|retrieval augmented generation|vector retrieval)\b/i, weight: 28 },
  { domainId: 'ai-expert', useCaseId: 'engineer-prompt', label: 'prompt engineering', pattern: /\b(prompt engineering|system prompt|few shot prompt)\b/i, weight: 26 },
  { domainId: 'ai-expert', useCaseId: 'design-mlops', label: 'MLOps design', pattern: /\bmlops\b/i, weight: 28 },
];

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'could', 'do', 'for',
  'from', 'how', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'our',
  'please', 'should', 'that', 'the', 'this', 'to', 'we', 'what', 'with', 'would',
  'al', 'como', 'con', 'de', 'del', 'el', 'en', 'es', 'la', 'las', 'los', 'mi',
  'para', 'por', 'que', 'quiero', 'un', 'una', 'y',
]);

const GENERIC_CATALOG_TERMS = new Set([
  'agent', 'analysis', 'assessment', 'code', 'create', 'design', 'evaluate',
  'generate', 'management', 'plan', 'review', 'software', 'system',
]);

const TOKEN_ALIASES: Record<string, string> = {
  deployed: 'deploy',
  deploying: 'deploy',
  deployment: 'deploy',
  deployments: 'deploy',
  pruebas: 'test',
  testing: 'test',
  tests: 'test',
  pipelines: 'pipeline',
  seguridad: 'security',
  arquitectura: 'architecture',
};

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .map(token => TOKEN_ALIASES[token] ?? token)
    .filter(token => token.length >= 3 && !STOP_WORDS.has(token));
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function overlap(left: Set<string>, right: string[]): string[] {
  return unique(right.filter(token => left.has(token) && !GENERIC_CATALOG_TERMS.has(token)));
}

function clampConfidence(score: number): number {
  return Math.min(0.98, Math.round((0.58 + score / 60) * 100) / 100);
}

function renderAnswer(data: unknown): string {
  if (typeof data === 'string') { return data; }
  if (data === undefined || data === null) { return ''; }
  try { return JSON.stringify(data, null, 2); }
  catch { return String(data); }
}

/**
 * Deterministic, confidence-gated routing to one registered Domain Agent Shell.
 * It never falls back to generic chat and never executes more than one specialist.
 */
export class SpecialistRouter {
  private readonly registry: AgentRegistry;
  private readonly privacy = new PrivacyGuard();
  private readonly contextBuilder: ProjectContextBuilder;
  private activeProvider?: AIProvider;

  constructor(
    private readonly mcp: MCPExecutor,
    private readonly workspace: string,
    registry?: AgentRegistry,
  ) {
    this.registry = registry ?? new AgentRegistry();
    this.contextBuilder = new ProjectContextBuilder(workspace, mcp);
  }

  /** Pure catalog/hint selection; useful for previews and unit tests. */
  select(text: string): SpecialistSelection | null {
    const query = normalizeText(text);
    const queryTokens = new Set(tokens(query));
    if (!query || queryTokens.size === 0) { return null; }

    const ranked = this.registry.getAll()
      .flatMap(descriptor => descriptor.capabilities.map(capability =>
        this.rankCapability(query, queryTokens, descriptor, capability)))
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    if (!best || best.score < MIN_ROUTE_SCORE) { return null; }

    // When catalog-only evidence cannot distinguish two domains, declining is safer
    // than silently sending the prompt to the wrong specialist.
    const competingDomain = ranked.find(candidate =>
      candidate.descriptor.domainId !== best.descriptor.domainId);
    if (best.hintScore === 0 && competingDomain && best.score - competingDomain.score < 2) {
      return null;
    }

    return {
      specialistId: best.descriptor.domainId,
      specialistName: best.descriptor.name,
      useCaseId: best.capability.useCaseId,
      confidence: clampConfidence(best.score),
      reasons: unique([
        ...best.reasons,
        `Selected ${best.descriptor.name} capability '${best.capability.useCaseId}'.`,
      ]).slice(0, 4),
    };
  }

  async route(text: string, provider: AIProvider): Promise<SpecialistRouteResult> {
    const trimmed = text.trim();
    const wasTruncated = trimmed.length > MAX_SPECIALIST_INPUT_CHARS;
    const boundedText = trimmed.slice(0, MAX_SPECIALIST_INPUT_CHARS);
    const privacyReport = this.privacy.sanitize(boundedText);
    const selection = this.select(privacyReport.sanitizedText);

    if (!selection) {
      return {
        handled: false,
        success: false,
        answer: '',
        specialistId: null,
        confidence: 0,
        reasons: ['No registered specialist met the routing confidence threshold.'],
        privacyRedacted: privacyReport.piiFound,
        guardrailResults: [],
      };
    }

    const reasons = [...selection.reasons];
    if (privacyReport.piiFound) {
      reasons.push('Sensitive personal data was redacted before specialist execution.');
    }
    if (wasTruncated) {
      reasons.push(`Input was limited to ${MAX_SPECIALIST_INPUT_CHARS} characters.`);
    }

    try {
      // AgentRegistry caches initialized shells by domain. Invalidate that cache when
      // the user switches providers so a shell never keeps calling the old provider.
      if (this.activeProvider && this.activeProvider !== provider) {
        this.registry.releaseAll();
      }
      this.activeProvider = provider;

      const workspaceContext = await this.buildWorkspaceSummary();
      const descriptor = this.registry.getDescriptor(selection.specialistId);
      const capability = descriptor?.capabilities.find(item => item.useCaseId === selection.useCaseId);
      if (!capability) {
        throw new Error(`Registered capability '${selection.useCaseId}' is unavailable.`);
      }

      const shell = await this.registry.getInstance(selection.specialistId, provider, this.workspace);
      const params = this.buildParams(
        capability,
        privacyReport.sanitizedText,
        workspaceContext,
      );
      const result = await shell.run(selection.useCaseId, params);
      const answer = result.success
        ? renderAnswer(result.data)
        : (result.errors ?? ['The specialist did not return an answer.']).join('\n');

      return {
        handled: true,
        success: result.success,
        answer,
        specialistId: selection.specialistId,
        specialistName: selection.specialistName,
        useCaseId: selection.useCaseId,
        confidence: selection.confidence,
        reasons,
        privacyRedacted: privacyReport.piiFound,
        guardrailResults: result.guardrailResults ?? [],
      };
    } catch (error) {
      return {
        handled: true,
        success: false,
        answer: error instanceof Error ? error.message : String(error),
        specialistId: selection.specialistId,
        specialistName: selection.specialistName,
        useCaseId: selection.useCaseId,
        confidence: selection.confidence,
        reasons,
        privacyRedacted: privacyReport.piiFound,
        guardrailResults: [],
      };
    }
  }

  dispose(): void {
    this.registry.releaseAll();
    this.activeProvider = undefined;
  }

  private rankCapability(
    query: string,
    queryTokens: Set<string>,
    descriptor: AgentDescriptor,
    capability: AgentCapability,
  ): RankedCapability {
    let score = 0;
    let hintScore = 0;
    const reasons: string[] = [];

    for (const hint of ROUTING_HINTS) {
      if (hint.domainId === descriptor.domainId &&
          hint.useCaseId === capability.useCaseId &&
          hint.pattern.test(query)) {
        score += hint.weight;
        hintScore += hint.weight;
        reasons.push(`Matched ${hint.label}.`);
      }
    }

    const matchedTags = descriptor.tags.filter(tag => {
      const normalizedTag = normalizeText(tag);
      return normalizedTag.length >= 3 &&
        !GENERIC_CATALOG_TERMS.has(normalizedTag) &&
        (` ${query} `).includes(` ${normalizedTag} `);
    });
    if (matchedTags.length > 0) {
      score += Math.min(14, matchedTags.length * 6);
      reasons.push(`Matched specialist tag${matchedTags.length > 1 ? 's' : ''}: ${matchedTags.slice(0, 3).join(', ')}.`);
    }

    const capabilityMatches = overlap(queryTokens, tokens(`${capability.useCaseId} ${capability.description}`));
    if (capabilityMatches.length > 0) {
      score += Math.min(12, capabilityMatches.length * 4);
      reasons.push(`Matched capability terms: ${capabilityMatches.slice(0, 3).join(', ')}.`);
    }

    const domainMatches = overlap(queryTokens, tokens(`${descriptor.domainId} ${descriptor.name}`));
    score += Math.min(4, domainMatches.length * 2);

    return { descriptor, capability, score, hintScore, reasons };
  }

  private async buildWorkspaceSummary(): Promise<WorkspaceSummary> {
    const context: ProjectContext = await this.contextBuilder.build();
    return {
      style: context.style,
      language: context.language,
      framework: context.framework,
      structure: this.privacy.sanitize(context.structure.slice(0, 2_000)).sanitizedText,
    };
  }

  private buildParams(
    capability: AgentCapability,
    request: string,
    workspace: WorkspaceSummary,
  ): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    for (const [name, rawType] of Object.entries(capability.inputSchema)) {
      const type = rawType.replace(/\?$/, '').toLowerCase();
      if (type === 'number') {
        params[name] = this.numberValue(name, request);
      } else if (type === 'object') {
        params[name] = { request, workspace };
      } else if (type === 'array') {
        params[name] = this.arrayValue(name, request);
      } else {
        params[name] = this.stringValue(name, request, workspace);
      }
    }
    return params;
  }

  private stringValue(name: string, request: string, workspace: WorkspaceSummary): string {
    const lowerName = name.toLowerCase();
    const contextualRequest = `${request}\n\nWorkspace context: ${workspace.framework}; ${workspace.language}; ${workspace.style}.`;

    if (lowerName === 'language') { return workspace.language; }
    if (lowerName.includes('stack')) { return `${workspace.framework} (${workspace.language}). Request: ${request}`; }
    if (lowerName === 'provider' || lowerName === 'cloud') {
      return request.match(/\b(aws|azure|gcp|google cloud)\b/i)?.[1].toLowerCase() ?? 'unspecified';
    }
    if (lowerName === 'tool') {
      return request.match(/\b(terraform|pulumi|cdk|cloudformation)\b/i)?.[1].toLowerCase() ?? 'terraform';
    }
    if (lowerName === 'environment') {
      return request.match(/\b(production|prod|staging|development|dev|test)\b/i)?.[1].toLowerCase() ?? 'production';
    }
    if (lowerName === 'level' || lowerName.endsWith('level')) {
      return request.match(/\b(A1|A2|B1|B2|C1|C2|beginner|intermediate|advanced)\b/i)?.[1] ?? 'intermediate';
    }
    if (lowerName === 'framework') {
      return request.match(/\b(iso(?:\/iec)?[ -]?\d+|nist(?: csf)?|soc ?2|gdpr|ccpa|jest|vitest|pytest|junit)\b/i)?.[1] ?? workspace.framework;
    }
    if (lowerName === 'audiencelevel') { return 'intermediate'; }
    if (lowerName === 'code') { return request; }

    return contextualRequest;
  }

  private numberValue(name: string, request: string): number {
    const parsed = Number(request.match(/\b\d+(?:\.\d+)?\b/)?.[0]);
    if (Number.isFinite(parsed)) { return parsed; }
    if (name === 'rtoHours') { return 4; }
    if (name === 'months') { return 12; }
    if (name === 'dataLifespanYears') { return 10; }
    return 0;
  }

  private arrayValue(name: string, request: string): unknown[] {
    if (name.toLowerCase().includes('provider')) {
      const providers = unique(
        [...request.matchAll(/\b(aws|azure|gcp|google cloud)\b/gi)]
          .map(match => match[1].toLowerCase()),
      );
      return providers.length > 0 ? providers : ['unspecified'];
    }
    return [{ request }];
  }
}
