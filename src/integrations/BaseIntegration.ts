import { IIntegration, IntegrationMetadata } from './interfaces';
import { SecretVault } from '../secrets/SecretVault';

/**
 * Abstract base for every integration.
 *
 * Responsibilities (SRP):
 *   - Lifecycle management (initialize / dispose)
 *   - Secret vault injection + availability validation
 *   - Template-method hooks for subclasses (onInitialize / onDispose)
 *
 * Subclasses implement only the domain logic; infrastructure is handled here.
 */
export abstract class BaseIntegration implements IIntegration {
  abstract readonly metadata: IntegrationMetadata;

  protected vault!: SecretVault;
  private _initialized = false;

  async initialize(vault: SecretVault): Promise<void> {
    this.vault = vault;

    // Guard: verify all required secrets are present before attempting to connect
    const missing = await this.findMissingSecrets();
    if (missing.length > 0) {
      throw new Error(
        `Integration "${this.metadata.name}" is missing required secrets: ${missing.join(', ')}. ` +
        `Store them via the Alpaquitay AI: Configure Integration Secrets command.`
      );
    }

    await this.onInitialize();
    this._initialized = true;
  }

  async dispose(): Promise<void> {
    if (!this._initialized) { return; }
    await this.onDispose();
    this._initialized = false;
  }

  async isAvailable(): Promise<boolean> {
    if (!this._initialized) { return false; }
    try {
      return await this.checkAvailability();
    } catch {
      return false;
    }
  }

  // ── Template-method hooks ─────────────────────────────────────────────────

  /** Called after secrets are verified. Connect to the external service here. */
  protected abstract onInitialize(): Promise<void>;

  /** Clean up connections, timers, subscriptions. */
  protected onDispose(): Promise<void> { return Promise.resolve(); }

  /** Override to add a real connectivity check (e.g. ping API). Default: true. */
  protected checkAvailability(): Promise<boolean> { return Promise.resolve(true); }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async findMissingSecrets(): Promise<string[]> {
    const missing: string[] = [];
    for (const name of this.metadata.requiredSecrets) {
      if (!(await this.vault.has(name))) { missing.push(name); }
    }
    return missing;
  }

  protected get initialized(): boolean { return this._initialized; }
}
