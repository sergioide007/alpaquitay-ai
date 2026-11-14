#!/usr/bin/env node
// Stages everything the CDN must serve under /models/ into ./cdn-staging:
//   models/runtime/<onnxruntime-web version>/ort-wasm-simd-threaded[.jsep].{mjs,wasm}
//   models/<id>/...  (copied from --model <dir>) + manifest.json (schema 2: per-block SHA-256)
// Then sign it:  npm run cdn:sign -- --key <pem> --id <id>      and upload cdn-staging/models/** to R2.
//
//   node scripts/cdn-stage.js --model ./gemma-4-e2b --id gemma-4-e2b-it --label "Gemma 4 E2B (text, q4f16)" \
//        --license apache-2.0 --dtypes q4f16,q4 --requires-webgpu --system-role native --min-ram-gb 8 --top-p 0.95 --top-k 64
const fs = require('fs');
const path = require('path');
const T = (() => { try { return require('../out/local/cdnTooling'); } catch { console.error('Falta out/: ejecuta primero `npm run compile`.'); process.exit(1); } })();

const root = path.resolve(__dirname, '..');
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : def; };
const flag = (name) => process.argv.includes(`--${name}`);
const out = path.resolve(root, arg('out', 'cdn-staging'));
const modelDir = arg('model');
const id = arg('id');

function copy(src, dst) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); }

(async () => {
  // 1. ONNX Runtime files, in a folder named after the exact version pinned in the extension bundle.
  const pinsFile = path.join(root, 'dist', 'runtime-pins.json');
  if (!fs.existsSync(pinsFile)) { console.error('Falta dist/runtime-pins.json: ejecuta `npm run build:engine`.'); process.exit(1); }
  const pins = JSON.parse(fs.readFileSync(pinsFile, 'utf8'));
  const ortDir = path.join(root, 'node_modules', 'onnxruntime-web', 'dist');
  for (const name of Object.keys(pins.files)) { copy(path.join(ortDir, name), path.join(out, 'models', 'runtime', pins.version, name)); }
  console.log(`runtime ${pins.version} -> models/runtime/${pins.version}/ (${Object.keys(pins.files).length} archivos, hashes = pins del bundle)`);

  if (!modelDir) { console.log('(sin --model: solo se preparo el runtime)'); return; }
  if (!id) { console.error('Falta --id'); process.exit(1); }

  const src = path.resolve(modelDir);
  const runtime = {
    dtypes: (arg('dtypes', 'q4')).split(',').map(s => s.trim()).filter(Boolean),
    requiresWebGpu: flag('requires-webgpu'),
    systemRole: arg('system-role', 'fold'),
    ...(arg('min-ram-gb') ? { minRamBytes: Math.round(Number(arg('min-ram-gb')) * 1024 ** 3) } : {}),
    ...(arg('top-p') || arg('top-k') ? { sampling: { ...(arg('top-p') ? { topP: Number(arg('top-p')) } : {}), ...(arg('top-k') ? { topK: Number(arg('top-k')) } : {}) } } : {}),
  };
  const manifest = await T.buildManifest({ dir: src, id, label: arg('label', id), license: arg('license'), runtime, sequence: arg('sequence') ? Number(arg('sequence')) : undefined });
  for (const f of manifest.files) { copy(path.join(src, f.path), path.join(out, 'models', id, f.path)); }
  fs.writeFileSync(path.join(out, 'models', id, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const gb = (manifest.files.reduce((n, f) => n + f.size, 0) / 1024 ** 3).toFixed(2);
  console.log(`model ${id}: ${manifest.files.length} archivos, ${gb} GB, revision ${manifest.revision}, sequence ${manifest.sequence}`);
  console.log(`\nSiguiente paso: npm run cdn:sign -- --key <clave.pem> --id ${id}`);
})().catch(e => { console.error(e.message || e); process.exit(1); });
