import * as vscode from 'vscode';

/**
 * Wraps VS Code SecretStorage — OS-level encrypted keychain.
 * API keys are never written to disk in plaintext or included in settings sync.
 */
export class SecretManager {
  private static readonly PREFIX = 'alpaquitay-ai.';

  constructor(private readonly secrets: vscode.SecretStorage) {}

  async getApiKey(provider: string): Promise<string | undefined> {
    return this.secrets.get(`${SecretManager.PREFIX}${provider}.apiKey`);
  }

  async setApiKey(provider: string, key: string): Promise<void> {
    await this.secrets.store(`${SecretManager.PREFIX}${provider}.apiKey`, key);
  }

  async deleteApiKey(provider: string): Promise<void> {
    await this.secrets.delete(`${SecretManager.PREFIX}${provider}.apiKey`);
  }

  async hasApiKey(provider: string): Promise<boolean> {
    const key = await this.getApiKey(provider);
    return key !== undefined && key.length > 0;
  }
}
