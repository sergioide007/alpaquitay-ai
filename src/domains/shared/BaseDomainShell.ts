/**
 * BaseDomainShell — Abstract base for all Domain Agent Shells.
 *
 * Implements common initialization, memory lifecycle, and guardrail scaffolding.
 * Concrete shells override: domainId, version, useCaseHandlers, domainGuardrails.
 *
 * Pattern:   Template Method (GoF) + Hexagonal Architecture
 * TOGAF:     Reusable Application Building Block (ABB)
 * ISO/IEC:   25010 — Maintainability · Reusability
 */

import * as fs from 'fs';
import * as path from 'path';
import type { AIProvider } from '../../core/interfaces';
import type {
  IDomainAgentShell,
  DomainId,
  DomainResult,
  GuardrailResult,
} from '../interfaces/DomainAgentShell';

export type UseCaseHandler = (
  params: Record<string, unknown>,
  ai: AIProvider,
  workspace: string,
) => Promise<DomainResult>;

export abstract class BaseDomainShell implements IDomainAgentShell {
  abstract readonly domainId: DomainId;
  abstract readonly version: string;

  protected provider!: AIProvider;
  protected workspacePath!: string;
  protected memory: Record<string, unknown> = {};

  protected abstract useCaseHandlers(): Record<string, UseCaseHandler>;
  protected abstract domainGuardrails(output: unknown): GuardrailResult[];

  async initialize(provider: AIProvider, workspacePath: string): Promise<void> {
    this.provider  = provider;
    this.workspacePath = workspacePath;
    await this.loadMemory();
  }

  async run(useCaseId: string, params: Record<string, unknown>): Promise<DomainResult> {
    const handlers = this.useCaseHandlers();
    const handler  = handlers[useCaseId];
    if (!handler) {
      return { success: false, errors: [`Unknown use case '${useCaseId}' for domain '${this.domainId}'`] };
    }
    const result = await handler(params, this.provider, this.workspacePath);
    if (result.success && result.data !== undefined) {
      result.guardrailResults = await this.checkGuardrails(result.data);
    }
    return result;
  }

  async checkGuardrails(output: unknown): Promise<GuardrailResult[]> {
    return this.domainGuardrails(output);
  }

  async saveMemory(): Promise<void> {
    const dir  = path.join(this.workspacePath, '.alpaquitay', this.domainId);
    const file = path.join(dir, 'memory.json');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(this.memory, null, 2), 'utf-8');
  }

  async loadMemory(): Promise<void> {
    const file = path.join(this.workspacePath, '.alpaquitay', this.domainId, 'memory.json');
    try {
      if (fs.existsSync(file)) {
        this.memory = JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>;
      }
    } catch {
      this.memory = {};
    }
  }

  protected async ask(prompt: string, maxTokens = 1024): Promise<string> {
    return this.provider.complete(prompt, { maxTokens, temperature: 0.3 });
  }

  protected parseJSON<T>(raw: string, fallback: T): T {
    try {
      return JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()) as T;
    } catch {
      return fallback;
    }
  }
}
