#!/usr/bin/env node
// Generates the Ed25519 key pair that signs model manifests.
//   npm run cdn:keygen -- --out ~/.alpaquitay/manifest-signing.pem
// The PRIVATE key never goes in the repo (this script refuses to write inside it). Paste the printed PUBLIC key
// into src/local/trustedKeys.ts, rebuild and release the extension.
const fs = require('fs');
const os = require('os');
const path = require('path');
const T = (() => { try { return require('../out/local/cdnTooling'); } catch { console.error('Falta out/: ejecuta primero `npm run compile`.'); process.exit(1); } })();

const i = process.argv.indexOf('--out');
if (i < 0 || !process.argv[i + 1]) { console.error('Uso: npm run cdn:keygen -- --out <ruta/fuera/del/repo/clave.pem>'); process.exit(1); }
const out = path.resolve(process.argv[i + 1].replace(/^~(?=$|\/)/, os.homedir()));
const root = path.resolve(__dirname, '..');
if (!path.relative(root, out).startsWith('..')) { console.error(`Rechazado: ${out} esta dentro del repositorio. Guarda la clave privada fuera.`); process.exit(1); }
if (fs.existsSync(out)) { console.error(`Rechazado: ${out} ya existe (no se sobrescribe una clave).`); process.exit(1); }

const key = T.generateSigningKey();
fs.mkdirSync(path.dirname(out), { recursive: true, mode: 0o700 });
fs.writeFileSync(out, key.privatePem, { mode: 0o600, flag: 'wx' });
console.log(`Clave privada: ${out}  (modo 600, haz copia de seguridad cifrada)`);
console.log(`keyId:         ${key.keyId}`);
console.log('\nClave publica para src/local/trustedKeys.ts:\n');
console.log(`  '${key.publicB64}',\n`);
