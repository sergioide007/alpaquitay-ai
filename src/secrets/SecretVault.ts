import * as vscode from 'vscode';

/**
 * Provides namespace-isolated secret storage per integration.
 * Each integration gets a unique prefix so secrets never bleed across providers.
 * Secrets are stored in VS Code's OS-level encrypted keychain (SecretStorage).
 *
 * Namespace format: alpaquitay-ai.integration.<namespace>.<key>
 */
export class SecretVault {
  private static readonly ROOT = 'alpaquitay-ai.integration';

  constructor(
    private readonly storage: vscode.SecretStorage,
    private readonly namespace: string
  ) {}

  private key(name: string): string {
    return `${SecretVault.ROOT}.${this.namespace}.${name}`;
  }

  async get(name: string): Promise<string | undefined> {
    return this.storage.get(this.key(name));
  }

  async set(name: string, value: string): Promise<void> {
    await this.storage.store(this.key(name), value);
  }

  async delete(name: string): Promise<void> {
    await this.storage.delete(this.key(name));
  }

  async has(name: string): Promise<boolean> {
    const v = await this.get(name);
    return v !== undefined && v.length > 0;
  }

  /** Retrieve multiple secrets at once. Returns only the ones that exist. */
  async getAll(names: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const name of names) {
      const v = await this.get(name);
      if (v !== undefined && v.length > 0) { result[name] = v; }
    }
    return result;
  }

  /** Create a child vault with a sub-namespace (e.g. namespace="langchain", child="smithdb") */
  child(subNamespace: string): SecretVault {
    return new SecretVault(this.storage, `${this.namespace}.${subNamespace}`);
  }
}
