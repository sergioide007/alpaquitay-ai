/**
 * Domain Agent Shell — base contract for every vertical-specific autonomous agent.
 *
 * Architectural pattern: Hexagonal Architecture (Ports & Adapters).
 * Each concrete shell owns:
 *   - A Process Definition  (replaces spec.md for domain workflows)
 *   - Domain Tools          (primary/driving ports the use cases call)
 *   - Domain Memory         (persistent context scoped to the domain)
 *   - Compliance Guardrails (domain-specific validation before commit)
 *
 * Framework alignment:
 *   TOGAF Phase B/C (Business & Application Architecture)
 *   ArchiMate Application Service + Application Component
 *   BIAN Service Domain pattern
 *   ISO/IEC 25010 quality characteristics (maintainability, portability)
 */

import type { AIProvider } from '../../core/interfaces';

export type DomainId =
  | 'english'
  | 'finance'
  | 'legal'
  | 'logistics'
  | 'recruiting'
  | 'healthcare'
  | 'education'
  | 'software-engineer'
  | 'software-architect'
  | 'developer'
  | 'qa'
  | 'devops'
  | 'devsecops'
  | 'security'
  | 'infrastructure'
  | 'cloud'
  | 'marketing'
  | 'process'
  | 'ai-expert'
  | 'business'
  | 'quantum-readiness'
  | 'well-architected'
  | 'zero-trust';

/** Severity levels for compliance guardrail results (TOGAF Risk Classification). */
export type GuardrailSeverity = 'block' | 'warn' | 'pass';

export interface GuardrailResult {
  severity: GuardrailSeverity;
  rule: string;
  message: string;
}

/** Outcome produced by a domain use case execution. */
export interface DomainResult<T = unknown> {
  success: boolean;
  data?: T;
  errors?: string[];
  guardrailResults?: GuardrailResult[];
}

/**
 * Primary Port — every interaction that drives the agent comes through here.
 * (ArchiMate: Application Interface exposed toward the Business layer)
 */
export interface DomainInputPort<TRequest, TResponse> {
  execute(request: TRequest): Promise<DomainResult<TResponse>>;
}

/**
 * Secondary Port — everything the agent depends on that lives outside the domain.
 * Infrastructure adapters implement these interfaces.
 * (ArchiMate: Application Interface required by the Application layer)
 */
export interface DomainOutputPort {
  readonly portId: string;
}

/** Lifecycle contract every Domain Agent Shell must implement. */
export interface IDomainAgentShell {
  readonly domainId: DomainId;
  readonly version: string;

  /** TOGAF: Technology Architecture — wire AI provider into the shell. */
  initialize(provider: AIProvider, workspacePath: string): Promise<void>;

  /** 4+1 Process View: execute a named use case with arbitrary parameters. */
  run(useCaseId: string, params: Record<string, unknown>): Promise<DomainResult>;

  /** TOGAF Phase E: verify compliance guardrails before committing any output. */
  checkGuardrails(output: unknown): Promise<GuardrailResult[]>;

  /** Domain memory: persist shell state across sessions. */
  saveMemory(): Promise<void>;

  /** Domain memory: restore shell state from previous session. */
  loadMemory(): Promise<void>;
}

/** Factory type — each domain registers a factory so the registry can instantiate shells lazily. */
export type DomainShellFactory = (config: DomainShellConfig) => IDomainAgentShell;

export interface DomainShellConfig {
  workspacePath: string;
  provider: AIProvider;
  /** Domain-specific settings (API keys, endpoints, feature flags). */
  settings?: Record<string, unknown>;
}
