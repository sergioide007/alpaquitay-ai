import { SecretVault } from '../../../secrets/SecretVault';

function makeMockStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    get: jest.fn((key: string) => Promise.resolve(store.get(key))),
    store: jest.fn((key: string, value: string) => { store.set(key, value); return Promise.resolve(); }),
    delete: jest.fn((key: string) => { store.delete(key); return Promise.resolve(); }),
    _store: store,
  };
}

describe('SecretVault', () => {
  it('stores and retrieves a secret under the namespaced key', async () => {
    const storage = makeMockStorage();
    const vault = new SecretVault(storage as never, 'myns');
    await vault.set('apiKey', 'secret123');
    expect(storage.store).toHaveBeenCalledWith('alpaquitay-ai.integration.myns.apiKey', 'secret123');
    const result = await vault.get('apiKey');
    expect(result).toBe('secret123');
  });

  it('returns undefined for a missing key', async () => {
    const storage = makeMockStorage();
    const vault = new SecretVault(storage as never, 'ns');
    expect(await vault.get('missing')).toBeUndefined();
  });

  it('has() returns true when secret exists and is non-empty', async () => {
    const storage = makeMockStorage({ 'alpaquitay-ai.integration.ns.key': 'val' });
    const vault = new SecretVault(storage as never, 'ns');
    expect(await vault.has('key')).toBe(true);
  });

  it('has() returns false for empty string', async () => {
    const storage = makeMockStorage({ 'alpaquitay-ai.integration.ns.empty': '' });
    const vault = new SecretVault(storage as never, 'ns');
    expect(await vault.has('empty')).toBe(false);
  });

  it('delete() removes the secret', async () => {
    const storage = makeMockStorage({ 'alpaquitay-ai.integration.ns.k': 'v' });
    const vault = new SecretVault(storage as never, 'ns');
    await vault.delete('k');
    expect(storage.delete).toHaveBeenCalledWith('alpaquitay-ai.integration.ns.k');
  });

  it('getAll() returns only existing secrets', async () => {
    const storage = makeMockStorage({
      'alpaquitay-ai.integration.ns.a': 'A',
      'alpaquitay-ai.integration.ns.b': 'B',
    });
    const vault = new SecretVault(storage as never, 'ns');
    const result = await vault.getAll(['a', 'b', 'c']);
    expect(result).toEqual({ a: 'A', b: 'B' });
  });

  it('child() creates a vault with sub-namespace', async () => {
    const storage = makeMockStorage();
    const parent = new SecretVault(storage as never, 'parent');
    const child = parent.child('child');
    await child.set('key', 'val');
    expect(storage.store).toHaveBeenCalledWith('alpaquitay-ai.integration.parent.child.key', 'val');
  });
});
