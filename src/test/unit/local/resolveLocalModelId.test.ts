import * as vscode from 'vscode';
import { DEFAULT_CDN_BASE, DEFAULT_LOCAL_MODEL_ID, LEGACY_LOCAL_MODEL_IDS, resolveLocalModelId } from '../../../local/cdnPolicy';
import { AlpaquitayConfig } from '../../../core/config';

describe('resolveLocalModelId', () => {
  it('maps every legacy id on the official CDN to the default model', () => {
    for (const id of LEGACY_LOCAL_MODEL_IDS) {
      expect([id, resolveLocalModelId(id, DEFAULT_CDN_BASE)]).toEqual([id, DEFAULT_LOCAL_MODEL_ID]);
    }
  });

  it('recognises the official CDN regardless of a trailing slash or case', () => {
    expect(resolveLocalModelId('gemma-3-1b-it', `${DEFAULT_CDN_BASE}/`)).toBe(DEFAULT_LOCAL_MODEL_ID);
    expect(resolveLocalModelId('gemma-3-1b-it', DEFAULT_CDN_BASE.toUpperCase())).toBe(DEFAULT_LOCAL_MODEL_ID);
  });

  it('keeps the user choice on a custom mirror (the model there may legitimately be a Gemma)', () => {
    expect(resolveLocalModelId('gemma-3-1b-it', 'https://mirror.example.com')).toBe('gemma-3-1b-it');
    expect(resolveLocalModelId('gemma-3-1b-it', 'not a url')).toBe('gemma-3-1b-it');
  });

  it('falls back to the default only when nothing is configured', () => {
    expect(resolveLocalModelId('', DEFAULT_CDN_BASE)).toBe(DEFAULT_LOCAL_MODEL_ID);
    expect(resolveLocalModelId('   ', DEFAULT_CDN_BASE)).toBe(DEFAULT_LOCAL_MODEL_ID);
    expect(resolveLocalModelId(undefined, DEFAULT_CDN_BASE)).toBe(DEFAULT_LOCAL_MODEL_ID);
  });

  it('never rewrites a current or unknown id, so a typo still reaches the engine validation', () => {
    expect(resolveLocalModelId(DEFAULT_LOCAL_MODEL_ID, DEFAULT_CDN_BASE)).toBe(DEFAULT_LOCAL_MODEL_ID);
    expect(resolveLocalModelId('qwen3-1.7b', DEFAULT_CDN_BASE)).toBe('qwen3-1.7b');
    expect(resolveLocalModelId('bad--id', DEFAULT_CDN_BASE)).toBe('bad--id');
  });
});

describe('AlpaquitayConfig.localEngine (regression: Hub selector showed gemma-3-1b-it while Qwen was the model)', () => {
  // AlpaquitayConfig re-reads the configuration on every getter, so the stored values must stay in place for the whole test.
  const getConfiguration = vscode.workspace.getConfiguration as jest.Mock;
  const original = getConfiguration.getMockImplementation();
  afterEach(() => { getConfiguration.mockImplementation(original); });
  const withSettings = (stored: Record<string, unknown>) => {
    getConfiguration.mockImplementation(() => ({
      get: (key: string, def?: unknown) => (key in stored ? stored[key] : def),
      update: jest.fn(),
    }));
  };

  it('a leftover gemma-3-1b-it in user settings resolves to the Qwen default', () => {
    withSettings({ 'localEngine.modelId': 'gemma-3-1b-it' });
    expect(new AlpaquitayConfig().localEngine.modelId).toBe(DEFAULT_LOCAL_MODEL_ID);
  });

  it('with no stored value the default is used', () => {
    withSettings({});
    expect(new AlpaquitayConfig().localEngine.modelId).toBe(DEFAULT_LOCAL_MODEL_ID);
  });

  it('a custom mirror keeps its configured model', () => {
    withSettings({ 'localEngine.modelId': 'gemma-3-1b-it', 'localEngine.cdnBaseUrl': 'https://mirror.example.com' });
    expect(new AlpaquitayConfig().localEngine.modelId).toBe('gemma-3-1b-it');
  });
});
