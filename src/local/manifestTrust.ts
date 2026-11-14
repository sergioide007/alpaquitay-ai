/**
 * Node-side trust decisions for model manifests (extension host only; uses node:crypto).
 * The Webview never fetches a manifest itself: it receives the one verified here.
 * Bytes arrive through fetchBytesIdentity, so no decompressor ever touches them before the signature check.
 */
import { createHash, createPublicKey, verify as cryptoVerify } from 'crypto';
import { MAX_MANIFEST_BYTES, manifestSigUrl, manifestUrl, parseManifest, summarize, type ManifestSummary, type ModelManifest } from './cdnPolicy';
import type { FetchBytes } from './safeHttp';

// DER prefix of an Ed25519 SubjectPublicKeyInfo; the raw 32-byte key follows.
const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export interface ManifestSignature { alg: 'ed25519'; keyId: string; sig: string }

export function keyIdOf(publicKeyB64: string): string {
  return createHash('sha256').update(Buffer.from(publicKeyB64, 'base64')).digest('hex').slice(0, 16);
}

function toKeyObject(publicKeyB64: string) {
  const raw = Buffer.from(publicKeyB64, 'base64');
  if (raw.length !== 32) { throw new Error('clave publica Ed25519 invalida (se esperan 32 bytes en base64)'); }
  return createPublicKey({ key: Buffer.concat([SPKI_ED25519_PREFIX, raw]), format: 'der', type: 'spki' });
}

export function parseSignature(raw: unknown): ManifestSignature {
  const s = raw as Partial<ManifestSignature> | null;
  if (!s || s.alg !== 'ed25519' || typeof s.keyId !== 'string' || typeof s.sig !== 'string') {
    throw new Error('manifest.sig.json invalido (alg ed25519, keyId, sig)');
  }
  return { alg: 'ed25519', keyId: s.keyId, sig: s.sig };
}

/** Verifies the detached signature over the EXACT manifest bytes, then parses them. */
export function verifySignedManifest(manifestBytes: Uint8Array, signature: unknown, trustedKeys: readonly string[], expectedId?: string): ModelManifest {
  if (trustedKeys.length === 0) {
    throw new Error('El motor local no tiene claves de confianza configuradas (src/local/trustedKeys.ts o localEngine.extraTrustedKeys).');
  }
  if (manifestBytes.length > MAX_MANIFEST_BYTES) { throw new Error('manifest.json demasiado grande'); }
  const sig = parseSignature(signature);
  const candidates = trustedKeys.filter(k => keyIdOf(k) === sig.keyId);
  if (candidates.length === 0) { throw new Error(`manifest firmado con una clave no confiable (keyId ${sig.keyId})`); }
  const signature_ = Buffer.from(sig.sig, 'base64');
  const ok = candidates.some(k => { try { return cryptoVerify(null, Buffer.from(manifestBytes), toKeyObject(k), signature_); } catch { return false; } });
  if (!ok) { throw new Error('firma del manifiesto invalida: el contenido no coincide con lo firmado'); }
  return parseManifest(JSON.parse(Buffer.from(manifestBytes).toString('utf8')), expectedId);
}

/** Minimal Memento-like store (vscode.ExtensionContext.globalState satisfies it). */
export interface TrustStore {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}

interface StoredManifest { manifestB64: string; signature: ManifestSignature; fetchedAt: number }

export interface ResolveInput {
  fetchBytes: FetchBytes;
  cdnBase: string;
  modelId: string;
  trustedKeys: readonly string[];
  store: TrustStore;
  timeoutMs?: number;
}

export interface Resolved { manifest: ModelManifest; summary: ManifestSummary }

/**
 * Network first; if the CDN is unreachable, the last manifest that passed verification is
 * re-verified against the CURRENT trusted keys (so revoking a key also revokes cached copies).
 * A verification failure is never masked by the offline copy: only network errors fall back.
 */
export async function resolveTrustedManifest(input: ResolveInput): Promise<Resolved> {
  const { fetchBytes, cdnBase, modelId, trustedKeys, store } = input;
  const timeoutMs = input.timeoutMs ?? 10_000;
  const storeKey = `alpaquitay.localEngine.manifest:${cdnBase}|${modelId}`;
  const seqKey = `alpaquitay.localEngine.sequence:${cdnBase}|${modelId}`;

  let manifestBytes: Uint8Array, sigBytes: Uint8Array | undefined, saved: StoredManifest | undefined, source: ManifestSummary['source'] = 'network';
  try {
    manifestBytes = await fetchBytes(manifestUrl(cdnBase, modelId), { timeoutMs, maxBytes: MAX_MANIFEST_BYTES });
    sigBytes = await fetchBytes(manifestSigUrl(cdnBase, modelId), { timeoutMs, maxBytes: 16 * 1024 });
  } catch (networkErr) {
    saved = store.get<StoredManifest>(storeKey);
    if (!saved) { throw new Error(`No se pudo obtener el manifiesto de ${cdnBase}: ${(networkErr as Error).message}`); }
    manifestBytes = Buffer.from(saved.manifestB64, 'base64');
    source = 'offline-copy';
  }

  let sigRaw: unknown;
  try { sigRaw = saved ? saved.signature : JSON.parse(Buffer.from(sigBytes!).toString('utf8')); }
  catch { throw new Error('manifest.sig.json no es JSON valido'); }

  const manifest = verifySignedManifest(manifestBytes, sigRaw, trustedKeys, modelId);

  const highest = store.get<number>(seqKey);
  if (highest !== undefined && manifest.sequence < highest) {
    throw new Error(`Rollback rechazado: el manifiesto tiene sequence ${manifest.sequence} y ya se vio ${highest}.`);
  }
  if (source === 'network') {
    await store.update(storeKey, { manifestB64: Buffer.from(manifestBytes).toString('base64'), signature: parseSignature(sigRaw), fetchedAt: Date.now() } satisfies StoredManifest);
    await store.update(seqKey, Math.max(highest ?? 0, manifest.sequence));
  }
  return { manifest, summary: summarize(manifest, source) };
}
