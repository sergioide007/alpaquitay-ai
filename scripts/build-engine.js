#!/usr/bin/env node
// Bundles the Webview engine (transformers.js + our cache) into dist/engine-webview.js and pins the
// SHA-256 of the exact ONNX Runtime files it will load from the CDN (injected as __RUNTIME_PINS__).
// The .wasm/.mjs files themselves are NOT bundled: they are served from the CDN (see worker/README.md).
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const outfile = path.join(root, 'dist', 'engine-webview.js');
const ortDir = path.join(root, 'node_modules', 'onnxruntime-web');
// WebGPU: since onnxruntime-web 1.2x the `onnxruntime-web/webgpu` entry uses the native WebGPU EP, whose glue lives in
// the *asyncify* build (it exports webgpuInit); the older *jsep* build does not, and loading it fails with
// "webgpuInit is not a function". Plain Wasm (CPU) uses the base build. Checked below so an ORT upgrade cannot
// silently pin the wrong variant again.
const WEBGPU_VARIANT = 'asyncify';
const RUNTIME_FILES = [`ort-wasm-simd-threaded.${WEBGPU_VARIANT}.mjs`, `ort-wasm-simd-threaded.${WEBGPU_VARIANT}.wasm`, 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'];

const version = JSON.parse(fs.readFileSync(path.join(ortDir, 'package.json'), 'utf8')).version;
const pins = { version, files: {} };
for (const f of RUNTIME_FILES) {
  pins.files[f] = crypto.createHash('sha256').update(fs.readFileSync(path.join(ortDir, 'dist', f))).digest('hex');
}

fs.mkdirSync(path.dirname(outfile), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'runtime-pins.json'), JSON.stringify(pins, null, 2) + '\n');

esbuild.build({
  entryPoints: [path.join(root, 'engine', 'webview-main.ts')],
  outfile,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': '"production"', '__RUNTIME_PINS__': JSON.stringify(pins) },
}).then(() => {
  const bundle = fs.readFileSync(outfile, 'utf8');
  if (!bundle.includes(version)) {
    console.error(`!! la version de onnxruntime-web (${version}) no aparece en el bundle: los pins no corresponden`);
    process.exit(1);
  }
  const glue = fs.readFileSync(path.join(ortDir, 'dist', `ort-wasm-simd-threaded.${WEBGPU_VARIANT}.mjs`), 'utf8');
  if (bundle.includes('webgpuInit') && !glue.includes('webgpuInit')) {
    console.error(`!! el bundle llama a webgpuInit pero ort-wasm-simd-threaded.${WEBGPU_VARIANT}.mjs no lo exporta: WebGPU fallaria`);
    process.exit(1);
  }
  const kb = (fs.statSync(outfile).size / 1024).toFixed(0);
  console.log(`engine bundle: dist/engine-webview.js (${kb} KB), runtime pins for onnxruntime-web ${version}`);
}).catch(() => process.exit(1));
