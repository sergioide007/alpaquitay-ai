#!/usr/bin/env node
// End-to-end check of a deployed CDN (or a local mirror). Run after EVERY deployment, before releasing.
//   npm run cdn:verify -- --base https://alpaquitay.specsolid.com --id gemma-4-e2b-it [--full] [--key <base64 public key>]
// Without --key it trusts the keys compiled into the extension (src/local/trustedKeys.ts). Exit code != 0 on any failure.
const fs = require('fs');
const path = require('path');
const T = (() => { try { return require('../out/local/cdnTooling'); } catch { console.error('Falta out/: ejecuta primero `npm run compile`.'); process.exit(1); } })();
const trusted = require('../out/local/trustedKeys').PROJECT_PUBLIC_KEYS;

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : undefined; };
const base = (arg('base') || 'https://alpaquitay.specsolid.com').replace(/\/$/, '');
const id = arg('id');
if (!id) { console.error('Falta --id'); process.exit(1); }
const pinsFile = path.join(path.resolve(__dirname, '..'), 'dist', 'runtime-pins.json');
const pins = fs.existsSync(pinsFile) ? JSON.parse(fs.readFileSync(pinsFile, 'utf8')) : undefined;
if (!pins) { console.warn('⚠️  Sin dist/runtime-pins.json (npm run build:engine): se omite la verificacion del runtime ONNX.'); }

T.verifyCdn({ base, id, trustedKeys: [...trusted, ...(arg('key') ? [arg('key')] : [])], full: process.argv.includes('--full'), pins })
  .then(({ ok, checks }) => {
    for (const c of checks) { console.log(`${c.ok ? '  ✅' : '  ❌'} ${c.name}${c.ok ? '' : `   → ${c.detail}`}`); }
    const failed = checks.filter(c => !c.ok).length;
    console.log(`\n${ok ? '✅ CDN lista' : `❌ ${failed} comprobacion(es) fallaron: NO publiques la extension`} (${checks.length} comprobaciones)`);
    process.exit(ok ? 0 : 1);
  })
  .catch(e => { console.error(e); process.exit(1); });
