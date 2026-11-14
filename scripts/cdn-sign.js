#!/usr/bin/env node
// Signs cdn-staging/models/<id>/manifest.json -> manifest.sig.json (Ed25519, detached, over the exact bytes).
//   npm run cdn:sign -- --key ~/.alpaquitay/manifest-signing.pem --id gemma-4-e2b-it
const fs = require('fs');
const os = require('os');
const path = require('path');
const T = (() => { try { return require('../out/local/cdnTooling'); } catch { console.error('Falta out/: ejecuta primero `npm run compile`.'); process.exit(1); } })();
const M = require('../out/local/manifestTrust');

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : undefined; };
const key = arg('key'), id = arg('id');
if (!key || !id) { console.error('Uso: npm run cdn:sign -- --key <pem> --id <modelId> [--out cdn-staging]'); process.exit(1); }
const dir = path.join(path.resolve(__dirname, '..'), arg('out') || 'cdn-staging', 'models', id);
const manifestPath = path.join(dir, 'manifest.json');
if (!fs.existsSync(manifestPath)) { console.error(`No existe ${manifestPath}: ejecuta cdn:stage antes.`); process.exit(1); }

const pem = fs.readFileSync(path.resolve(key.replace(/^~(?=$|\/)/, os.homedir())), 'utf8');
const bytes = fs.readFileSync(manifestPath);
const sig = T.signManifestBytes(bytes, pem);
M.verifySignedManifest(bytes, sig, [T.publicKeyOfPrivatePem(pem)], id);      // self-check before publishing
fs.writeFileSync(path.join(dir, 'manifest.sig.json'), JSON.stringify(sig, null, 2) + '\n');
console.log(`firmado: ${path.relative(process.cwd(), path.join(dir, 'manifest.sig.json'))} (keyId ${sig.keyId})`);
const trusted = require('../out/local/trustedKeys').PROJECT_PUBLIC_KEYS;
if (!trusted.some(k => M.keyIdOf(k) === sig.keyId)) {
  console.warn(`\n⚠️  La clave ${sig.keyId} NO esta en src/local/trustedKeys.ts: las extensiones publicadas rechazaran este manifiesto.`);
}
