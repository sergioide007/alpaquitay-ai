import { generateSigningKey, signManifestBytes } from '../../../local/cdnTooling';
import { keyIdOf, resolveTrustedManifest, verifySignedManifest } from '../../../local/manifestTrust';
import { MemStore, bytesServer, makeManifest } from './fixtures';

const BASE = 'https://alpaquitay.specsolid.com';
const id = 'gemma-4-e2b-it';
const down = jest.fn(async () => { throw new Error('ENOTFOUND'); });

describe('verifySignedManifest', () => {
  const s = bytesServer(makeManifest());

  it('accepts a manifest signed by a trusted key', () => {
    expect(verifySignedManifest(s.bytes, s.sig, [s.key.publicB64], id).revision).toBe('rev1');
  });
  it('fails closed when no key is trusted (the shipped default until a key is added)', () => {
    expect(() => verifySignedManifest(s.bytes, s.sig, [], id)).toThrow(/claves de confianza/);
  });
  it('rejects a signature from an unknown key', () => {
    expect(() => verifySignedManifest(s.bytes, s.sig, [generateSigningKey().publicB64], id)).toThrow(/no confiable/);
  });
  it('rejects ANY change to the signed bytes, even a single character', () => {
    const tampered = Buffer.from(s.bytes.toString().replace('rev1', 'rev2'));
    expect(() => verifySignedManifest(tampered, s.sig, [s.key.publicB64], id)).toThrow(/firma del manifiesto invalida/);
  });
  it('rejects a forged signature that claims the trusted keyId', () => {
    const forged = { ...s.sig, sig: Buffer.alloc(64, 1).toString('base64') };
    expect(() => verifySignedManifest(s.bytes, forged, [s.key.publicB64], id)).toThrow(/invalida/);
  });
  it('rejects a manifest for another model id (no cross-model replay)', () => {
    expect(() => verifySignedManifest(s.bytes, s.sig, [s.key.publicB64], 'other-model')).toThrow(/no coincide/);
  });
  it('rejects malformed signature documents', () => {
    expect(() => verifySignedManifest(s.bytes, { alg: 'rsa' }, [s.key.publicB64], id)).toThrow(/manifest.sig.json invalido/);
  });
  it('supports key rotation: either of two trusted keys verifies', () => {
    expect(() => verifySignedManifest(s.bytes, s.sig, [generateSigningKey().publicB64, s.key.publicB64], id)).not.toThrow();
    expect(keyIdOf(s.key.publicB64)).toBe(s.sig.keyId);
  });
  it('refuses a validly signed but schema-invalid manifest', () => {
    const bad = Buffer.from(JSON.stringify({ ...makeManifest(), files: [] }));
    expect(() => verifySignedManifest(bad, signManifestBytes(bad, s.key.privatePem), [s.key.publicB64], id)).toThrow(/files/);
  });
});

describe('resolveTrustedManifest', () => {
  it('fetches, verifies, persists and summarizes', async () => {
    const s = bytesServer(makeManifest()); const store = new MemStore();
    const r = await resolveTrustedManifest({ fetchBytes: s.fetchBytes, cdnBase: BASE, modelId: id, trustedKeys: [s.key.publicB64], store });
    expect(r.summary).toMatchObject({ id, source: 'network', requiresWebGpu: false });
    expect(r.summary.totalBytes).toBeGreaterThan(8 * 1024 * 1024);
    expect(store.data.size).toBe(2);
    expect(s.calls).toEqual([`${BASE}/models/${id}/manifest.json`, `${BASE}/models/${id}/manifest.sig.json`]);
  });

  it('rejects a rollback to an older, validly signed manifest', async () => {
    const key = generateSigningKey(); const store = new MemStore();
    const newer = bytesServer(makeManifest(undefined, { sequence: 200 }), key);
    await resolveTrustedManifest({ fetchBytes: newer.fetchBytes, cdnBase: BASE, modelId: id, trustedKeys: [key.publicB64], store });
    const older = bytesServer(makeManifest(undefined, { sequence: 150 }), key);
    await expect(resolveTrustedManifest({ fetchBytes: older.fetchBytes, cdnBase: BASE, modelId: id, trustedKeys: [key.publicB64], store })).rejects.toThrow(/Rollback rechazado/);
  });

  it('accepts the same sequence again (idempotent) and a newer one', async () => {
    const key = generateSigningKey(); const store = new MemStore();
    for (const seq of [200, 200, 201]) {
      const s = bytesServer(makeManifest(undefined, { sequence: seq }), key);
      await expect(resolveTrustedManifest({ fetchBytes: s.fetchBytes, cdnBase: BASE, modelId: id, trustedKeys: [key.publicB64], store })).resolves.toBeDefined();
    }
  });

  it('falls back to the last verified copy when the CDN is unreachable', async () => {
    const s = bytesServer(makeManifest()); const store = new MemStore();
    await resolveTrustedManifest({ fetchBytes: s.fetchBytes, cdnBase: BASE, modelId: id, trustedKeys: [s.key.publicB64], store });
    const r = await resolveTrustedManifest({ fetchBytes: down, cdnBase: BASE, modelId: id, trustedKeys: [s.key.publicB64], store });
    expect(r.summary.source).toBe('offline-copy');
  });

  it('revoking a key also revokes the stored offline copy', async () => {
    const s = bytesServer(makeManifest()); const store = new MemStore();
    await resolveTrustedManifest({ fetchBytes: s.fetchBytes, cdnBase: BASE, modelId: id, trustedKeys: [s.key.publicB64], store });
    await expect(resolveTrustedManifest({ fetchBytes: down, cdnBase: BASE, modelId: id, trustedKeys: [generateSigningKey().publicB64], store })).rejects.toThrow(/no confiable/);
  });

  it('a signature failure on the network is NOT masked by the offline copy', async () => {
    const good = bytesServer(makeManifest()); const store = new MemStore();
    await resolveTrustedManifest({ fetchBytes: good.fetchBytes, cdnBase: BASE, modelId: id, trustedKeys: [good.key.publicB64], store });
    const attacker = bytesServer(makeManifest(undefined, { revision: 'evil' }));   // signed with another key
    await expect(resolveTrustedManifest({ fetchBytes: attacker.fetchBytes, cdnBase: BASE, modelId: id, trustedKeys: [good.key.publicB64], store })).rejects.toThrow(/no confiable/);
  });

  it('garbage in manifest.sig.json is an error, not a silent fallback', async () => {
    const s = bytesServer(makeManifest()); const store = new MemStore();
    await resolveTrustedManifest({ fetchBytes: s.fetchBytes, cdnBase: BASE, modelId: id, trustedKeys: [s.key.publicB64], store });
    const junk = jest.fn(async (url: string) => url.endsWith('manifest.json') ? new Uint8Array(s.bytes) : new Uint8Array(Buffer.from('<html>oops')));
    await expect(resolveTrustedManifest({ fetchBytes: junk, cdnBase: BASE, modelId: id, trustedKeys: [s.key.publicB64], store })).rejects.toThrow(/no es JSON valido/);
  });

  it('fails clearly with no network and no stored copy', async () => {
    await expect(resolveTrustedManifest({ fetchBytes: down, cdnBase: BASE, modelId: id, trustedKeys: ['x'], store: new MemStore() })).rejects.toThrow(/No se pudo obtener el manifiesto/);
  });

  it('keeps manifests of different CDNs/models apart', async () => {
    const s = bytesServer(makeManifest()); const store = new MemStore();
    await resolveTrustedManifest({ fetchBytes: s.fetchBytes, cdnBase: BASE, modelId: id, trustedKeys: [s.key.publicB64], store });
    await expect(resolveTrustedManifest({ fetchBytes: down, cdnBase: 'https://mirror.example.com', modelId: id, trustedKeys: [s.key.publicB64], store })).rejects.toThrow(/No se pudo obtener/);
  });
});
