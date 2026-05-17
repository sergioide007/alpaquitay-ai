import * as vscode from 'vscode';
import { IIntegration, IntegrationCategory, ILLMIntegration, IObservabilityIntegration, IKnowledgeIntegration, ICodeIndexIntegration, IStreamingIntegration, IEditorIntegration } from './interfaces';
import { HybridConfig, IntegrationFlags } from './IntegrationConfig';
import { SecretVault } from '../secrets/SecretVault';

/**
 * Registry + Plugin pattern.
 *
 * - Integrations register themselves by ID.
 * - On activate(), the registry initializes only the integrations that are
 *   enabled in the HybridConfig — the rest never load.
 * - Typed accessors (getLLM, getObservability, etc.) enforce ISP.
 * - Open/Closed: add integrations via register() without touching this class.
 */
export class IntegrationRegistry {
  private readonly registered = new Map<string, IIntegration>();
  private readonly active = new Map<string, IIntegration>();

  constructor(
    private readonly storage: vscode.SecretStorage,
    private readonly config: HybridConfig
  ) {}

  // ── Registration (call before activate) ──────────────────────────────────

  register(integration: IIntegration): this {
    if (this.registered.has(integration.metadata.id)) {
      throw new Error(`Integration "${integration.metadata.id}" is already registered.`);
    }
    this.registered.set(integration.metadata.id, integration);
    return this;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async activate(): Promise<{ loaded: string[]; skipped: string[]; errors: Record<string, string> }> {
    const flags = this.config.integrations;
    const loaded: string[] = [];
    const skipped: string[] = [];
    const errors: Record<string, string> = {};

    for (const [id, integration] of this.registered) {
      if (!this.isEnabled(id, flags)) { skipped.push(id); continue; }

      const vault = new SecretVault(this.storage, id);
      try {
        await integration.initialize(vault);
        this.active.set(id, integration);
        loaded.push(id);
      } catch (err) {
        errors[id] = err instanceof Error ? err.message : String(err);
      }
    }

    return { loaded, skipped, errors };
  }

  async deactivate(): Promise<void> {
    const disposeAll = Array.from(this.active.values()).map(i => i.dispose().catch(() => { /* non-fatal */ }));
    await Promise.all(disposeAll);
    this.active.clear();
  }

  // ── Typed accessors ───────────────────────────────────────────────────────

  get<T extends IIntegration>(id: string): T | undefined {
    return this.active.get(id) as T | undefined;
  }

  getLLM(id: string): ILLMIntegration | undefined {
    const i = this.active.get(id);
    return this.isLLM(i) ? i : undefined;
  }

  getObservability(): IObservabilityIntegration | undefined {
    for (const i of this.active.values()) {
      if (this.isObservability(i)) { return i; }
    }
  }

  getKnowledge(): IKnowledgeIntegration[] {
    return Array.from(this.active.values()).filter(this.isKnowledge);
  }

  getCodeIndex(): ICodeIndexIntegration | undefined {
    for (const i of this.active.values()) {
      if (this.isCodeIndex(i)) { return i; }
    }
  }

  getStreaming(): IStreamingIntegration | undefined {
    for (const i of this.active.values()) {
      if (this.isStreaming(i)) { return i; }
    }
  }

  getEditors(): IEditorIntegration[] {
    return Array.from(this.active.values()).filter(this.isEditor);
  }

  byCategory(category: IntegrationCategory): IIntegration[] {
    return Array.from(this.active.values()).filter(i => i.metadata.category === category);
  }

  isActive(id: string): boolean { return this.active.has(id); }

  // ── Private helpers ───────────────────────────────────────────────────────

  private isEnabled(id: string, flags: IntegrationFlags): boolean {
    return (flags as unknown as Record<string, boolean>)[id] === true;
  }

  private isLLM(i: IIntegration | undefined): i is ILLMIntegration {
    return !!i && typeof (i as ILLMIntegration).complete === 'function';
  }

  private isObservability(i: IIntegration): i is IObservabilityIntegration {
    return typeof (i as IObservabilityIntegration).startRun === 'function';
  }

  private isKnowledge(i: IIntegration): i is IKnowledgeIntegration {
    return typeof (i as IKnowledgeIntegration).query === 'function' &&
           typeof (i as ICodeIndexIntegration).index !== 'function';
  }

  private isCodeIndex(i: IIntegration): i is ICodeIndexIntegration {
    return typeof (i as ICodeIndexIntegration).index === 'function';
  }

  private isStreaming(i: IIntegration): i is IStreamingIntegration {
    return typeof (i as IStreamingIntegration).publish === 'function';
  }

  private isEditor(i: IIntegration): i is IEditorIntegration {
    return typeof (i as IEditorIntegration).readContext === 'function';
  }
}
