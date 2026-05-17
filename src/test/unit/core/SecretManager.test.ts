import { SecretManager } from '../../../core/SecretManager';
import type * as vscode from 'vscode';

function makeSecretStorage(store: Record<string, string> = {}): vscode.SecretStorage {
  return {
    get: jest.fn(async (key: string) => store[key]),
    store: jest.fn(async (key: string, value: string) => { store[key] = value; }),
    delete: jest.fn(async (key: string) => { delete store[key]; }),
    keys: jest.fn(async () => Object.keys(store)),
    onDidChange: jest.fn() as unknown as vscode.SecretStorage['onDidChange']
  };
}

describe('SecretManager', () => {
  const PREFIX = 'alpaquitay-ai.';

  describe('getApiKey()', () => {
    it('Given a stored key, When getting it, Then returns the value', async () => {
      const storage = makeSecretStorage({ [`${PREFIX}anthropic.apiKey`]: 'sk-ant-test' });
      const sm = new SecretManager(storage);
      expect(await sm.getApiKey('anthropic')).toBe('sk-ant-test');
    });

    it('Given no stored key, When getting it, Then returns undefined', async () => {
      const sm = new SecretManager(makeSecretStorage());
      expect(await sm.getApiKey('anthropic')).toBeUndefined();
    });

    it('Uses the correct namespaced key in SecretStorage', async () => {
      const storage = makeSecretStorage();
      const sm = new SecretManager(storage);
      await sm.getApiKey('openai');
      expect(storage.get).toHaveBeenCalledWith(`${PREFIX}openai.apiKey`);
    });
  });

  describe('setApiKey()', () => {
    it('When setting a key, Then stores it with the namespaced key', async () => {
      const storage = makeSecretStorage();
      const sm = new SecretManager(storage);
      await sm.setApiKey('anthropic', 'sk-ant-abc');
      expect(storage.store).toHaveBeenCalledWith(`${PREFIX}anthropic.apiKey`, 'sk-ant-abc');
    });
  });

  describe('deleteApiKey()', () => {
    it('When deleting a key, Then removes it from storage', async () => {
      const store: Record<string, string> = { [`${PREFIX}anthropic.apiKey`]: 'sk-ant-abc' };
      const storage = makeSecretStorage(store);
      const sm = new SecretManager(storage);
      await sm.deleteApiKey('anthropic');
      expect(storage.delete).toHaveBeenCalledWith(`${PREFIX}anthropic.apiKey`);
    });
  });

  describe('hasApiKey()', () => {
    it('Given a stored non-empty key, Then returns true', async () => {
      const storage = makeSecretStorage({ [`${PREFIX}anthropic.apiKey`]: 'sk-ant-abc' });
      const sm = new SecretManager(storage);
      expect(await sm.hasApiKey('anthropic')).toBe(true);
    });

    it('Given no stored key, Then returns false', async () => {
      const sm = new SecretManager(makeSecretStorage());
      expect(await sm.hasApiKey('anthropic')).toBe(false);
    });

    it('Given an empty string key, Then returns false', async () => {
      const storage = makeSecretStorage({ [`${PREFIX}anthropic.apiKey`]: '' });
      const sm = new SecretManager(storage);
      expect(await sm.hasApiKey('anthropic')).toBe(false);
    });
  });
});