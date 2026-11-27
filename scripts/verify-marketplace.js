#!/usr/bin/env node
// Verificación completa para marketplace — ejecutar: node scripts/verify-marketplace.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
let pass = 0, fail = 0;

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
}

const VERSION = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8')).version;
const VSIX = `alpaquitay-ai-v${VERSION}.vsix`;

console.log(`\n🔍 VERIFICACIÓN MARKETPLACE — Alpaquitay AI v${VERSION}\n`);

// 1. package.json
console.log('📦 Package.json:');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
check('name', pkg.name === 'alpaquitay-ai');
check('version is semver', /^\d+\.\d+\.\d+$/.test(pkg.version), `(${pkg.version})`);
check('CHANGELOG documents version', fs.existsSync(path.join(root, 'CHANGELOG.md')) &&
  fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf-8').includes(`## [${pkg.version}]`), `(${pkg.version})`);
check('publisher', pkg.publisher === 'alpaquitay-ai');
check('license', pkg.license === 'MIT');
check('icon exists', pkg.icon && fs.existsSync(path.join(root, pkg.icon)));
check('main exists', fs.existsSync(path.join(root, pkg.main)));
check('engines.vscode', !!pkg.engines?.vscode);

// 2. Archivos requeridos
console.log('\n📄 Archivos requeridos:');
check('LICENSE', fs.existsSync(path.join(root, 'LICENSE')));
check('CHANGELOG.md', fs.existsSync(path.join(root, 'CHANGELOG.md')));
check('README.md', fs.existsSync(path.join(root, 'README.md')));
check('harness.md', fs.existsSync(path.join(root, 'harness.md')));

// 3. Icono
console.log('\n🖼️  Icono:');
const iconPath = path.join(root, 'resources/icon.png');
if (fs.existsSync(iconPath)) {
  const buf = fs.readFileSync(iconPath);
  const isPng = buf.length > 24 && buf.toString('ascii', 1, 4) === 'PNG';
  const w = isPng ? buf.readUInt32BE(16) : 0;
  const h = isPng ? buf.readUInt32BE(20) : 0;
  check('icon.png exists', true);
  check('icon.png is a square PNG of at least 128x128', isPng && w === h && w >= 128, `(${w}x${h}, ${(buf.length / 1024).toFixed(0)}KB)`);
} else {
  check('icon.png exists', false);
}

// 4. Código compilado
console.log('\n🔧 Código compilado:');
const harnessFiles = [
  'out/core/reception/Decider.js',
  'out/core/context/WorkspaceFingerprinter.js',
  'out/core/harness/PolicyGuard.js',
  'out/core/harness/FileDiff.js',
  'out/core/harness/AgentReview.js',
  'out/core/harness/CheckpointManager.js',
  'out/core/harness/DecisionLog.js',
  'out/core/platform/DebtTracker.js',
  'out/core/platform/Economy.js',
  'out/core/platform/Dora.js',
  'out/core/platform/PlatformContract.js',
  'out/core/platform/Postmortem.js',
  'out/core/platform/Onboard.js',
  'out/core/reception/IdeaInbox.js',
  'out/core/sdlc/SdlcRouter.js',
  'out/core/sdlc/DefinitionOfDone.js'
];
for (const f of harnessFiles) {
  check(f, fs.existsSync(path.join(root, f)));
}

// 5. Seguridad
console.log('\n🔒 Seguridad:');
const extContent = fs.readFileSync(path.join(root, 'src/extension.ts'), 'utf-8');
check('no eval()', !extContent.includes('eval('));
check('no new Function()', !extContent.includes('new Function'));

// 5b. Motor local (Gemma WebGPU/Wasm)
console.log('\n🧠 Motor local:');
check('dist/engine-webview.js built', fs.existsSync(path.join(root, 'dist/engine-webview.js')) &&
  fs.statSync(path.join(root, 'dist/engine-webview.js')).size > 100000, '(run: npm run build:engine)');
for (const f of ['cdnPolicy', 'cdnHandler', 'enginePolicy', 'LocalEngineHost', 'LocalGemmaProvider', 'GenerateSpecLocal', 'webview/idbCache']) {
  check(`out/local/${f}.js`, fs.existsSync(path.join(root, `out/local/${f}.js`)));
}
const declared = new Set((pkg.contributes?.commands ?? []).map(c => c.command));
for (const cmd of ['alpaquitay-ai.generateSpecLocal', 'alpaquitay-ai.clearLocalModelCache']) {
  check(`command declared: ${cmd}`, declared.has(cmd));
  check(`command registered: ${cmd}`, fs.readFileSync(path.join(root, 'src/local/GenerateSpecLocal.ts'), 'utf-8').includes(`'${cmd}'`));
}
const props = pkg.contributes?.configuration?.properties ?? {};
for (const k of ['enabled', 'cdnBaseUrl', 'modelId', 'device', 'maxNewTokens']) {
  check(`setting alpaquitay-ai.localEngine.${k}`, !!props[`alpaquitay-ai.localEngine.${k}`]);
}
check('cdnBaseUrl is application-scoped (a workspace cannot redirect downloads)', props['alpaquitay-ai.localEngine.cdnBaseUrl']?.scope === 'application');
check('default CDN is alpaquitay.specsolid.com', props['alpaquitay-ai.localEngine.cdnBaseUrl']?.default === 'https://alpaquitay.specsolid.com');
const localSrc = ['LocalEngineHost', 'GenerateSpecLocal', 'LocalGemmaProvider', 'cdnPolicy', 'cdnHandler', 'enginePolicy', 'webview/idbCache']
  .map(f => fs.readFileSync(path.join(root, `src/local/${f}.ts`), 'utf-8')).join('\n');
check('src/local: no eval()/new Function()', !/\beval\(|new Function/.test(localSrc));
check('src/local: no unsafe-eval / unsafe-inline in the CSP', !/'unsafe-(eval|inline)'/.test(localSrc.replace(/not\.toContain[^\n]*/g, '')));
check('README badge matches package version', fs.readFileSync(path.join(root, 'README.md'), 'utf-8').includes(`badge/version-${pkg.version}-green`));
check('.npmrc ignores install scripts', fs.existsSync(path.join(root, '.npmrc')) && /ignore-scripts\s*=\s*true/.test(fs.readFileSync(path.join(root, '.npmrc'), 'utf-8')));
const trustedSrc = fs.readFileSync(path.join(root, 'src/local/trustedKeys.ts'), 'utf-8');
const hasTrustedKey = /^\s*'[A-Za-z0-9+\/]{43}='/m.test(trustedSrc);
check('a manifest-signing public key is set in src/local/trustedKeys.ts', hasTrustedKey, '(run: npm run cdn:keygen -- --out <path outside the repo>, paste the public key, rebuild)');
const pinsPath = path.join(root, 'dist/runtime-pins.json');
const pinsOk = fs.existsSync(pinsPath);
check('dist/runtime-pins.json (ONNX Runtime hash pins) built', pinsOk, '(run: npm run build:engine)');
if (pinsOk && fs.existsSync(path.join(root, 'dist/engine-webview.js'))) {
  const pins = JSON.parse(fs.readFileSync(pinsPath, 'utf-8'));
  check('pinned onnxruntime-web version is the one in the bundle', fs.readFileSync(path.join(root, 'dist/engine-webview.js'), 'utf-8').includes(pins.version));
  check('all four ONNX Runtime files are pinned', Object.values(pins.files).length === 4 && Object.values(pins.files).every(h => /^[0-9a-f]{64}$/.test(h)));
}
const hostSrc = fs.readFileSync(path.join(root, 'src/local/LocalEngineHost.ts'), 'utf-8');
check('Webview CSP script-src has no remote origin', /script-src \$\{opts\.cspSource\} blob:/.test(hostSrc) && !/script-src[^`]*\$\{cdn\}/.test(hostSrc));
const trustSrc = fs.readFileSync(path.join(root, 'src/local/manifestTrust.ts'), 'utf-8') + fs.readFileSync(path.join(root, 'src/local/safeHttp.ts'), 'utf-8');
check('manifest path never uses fetch() (no decompressor before the signature check)', !/\bawait\s+fetch\(|\bglobalThis\.fetch\(/.test(trustSrc));
{
  const node = require('./check-node-security.js').evaluate(process.versions.node);
  check(`Node security floor: ${node.message}`, node.ok, '(use a patched Node: see scripts/node-security-floor.json)');
}

// 6. Tests
console.log('\n🧪 Tests:');
try {
  const out = execSync('npm test 2>&1', { cwd: root, encoding: 'utf-8', timeout: 300000 });
  const passed = out.match(/Tests:\s+(\d+)\s+passed/);
  const failed = out.match(/(\d+)\s+failed/);
  const suites = out.match(/Suites:\s+(\d+)\s+passed/);
  check('all tests pass', !!passed && Number(passed[1]) > 0 && (!failed || Number(failed[1]) === 0),
    passed ? `(${passed[1]} passed, ${suites ? suites[1] + ' suites' : '?'} )` : '');
} catch (e) {
  check('all tests pass', false, '(test execution failed)');
}

// 7. Paquete .vsix
console.log('\n📦 Paquete .vsix:');
// The package for THIS version, built after the code it ships: an old .vsix left in the folder used to pass these checks.
const vsixName = fs.readdirSync(root).find(f => f === `alpaquitay-ai-${VERSION}.vsix` || f === VSIX);
check('.vsix for this version exists', !!vsixName, `(run: npx vsce package --no-dependencies)`);
if (vsixName) {
  const vsixStats = fs.statSync(path.join(root, vsixName));
  check('.vsix size > 500KB', vsixStats.size > 500000, `(${(vsixStats.size / 1024).toFixed(0)}KB)`);
  const newest = (dir) => { let t = 0; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { walk(p); } else { t = Math.max(t, fs.statSync(p).mtimeMs); } } }; if (fs.existsSync(dir)) { walk(dir); } return t; };
  const built = Math.max(newest(path.join(root, 'out')), newest(path.join(root, 'dist')), fs.statSync(path.join(root, 'package.json')).mtimeMs);
  check('.vsix is newer than out/, dist/ and package.json', vsixStats.mtimeMs >= built, '(stale package: rebuild it)');
}


// 7b. Contenido del VSIX (sin empaquetar): el bundle del motor entra, las fuentes del worker/engine no
console.log('\n📦 Contenido del paquete:');
try {
  const listing = execSync('npx --no-install vsce ls --no-dependencies', { cwd: root, encoding: 'utf-8', timeout: 120000 })
    .split('\n').map(l => l.trim().replace(/\\/g, '/'));
  check('VSIX includes dist/engine-webview.js', listing.includes('dist/engine-webview.js'));
  check('VSIX excludes engine/ and worker/', !listing.some(l => l.startsWith('engine/') || l.startsWith('worker/')));
  check('VSIX excludes cdn-staging/ and .npmrc', !listing.some(l => l.startsWith('cdn-staging/') || l === '.npmrc'));
  check('VSIX excludes the website (manual/, sitemap.xml, robots.txt, docs/)', !listing.some(l => l.startsWith('manual/') || l.startsWith('docs/') || l === 'sitemap.xml' || l === 'robots.txt'));
} catch (e) {
  check('vsce ls', false, '(' + String(e.message).split('\n')[0] + ')');
}

// Resumen
console.log(`\n${'='.repeat(50)}`);
console.log(`RESULTADO: ${pass} passed, ${fail} failed`);
if (fail === 0) {
  console.log('✅ LISTO PARA PUBLICAR EN MARKETPLACE');
  console.log('\nPróximos pasos:');
  console.log('  1. F5 en VS Code → Extension Development Host');
  console.log(`  2. git tag v${VERSION} && git push origin v${VERSION}`);
  console.log(`  3. O publicar manual: npx vsce publish --packagePath ${vsixName || VSIX}`);
} else {
  console.log('❌ HAY ERRORES — corregir antes de publicar');
}
console.log('='.repeat(50) + '\n');

process.exit(fail > 0 ? 1 : 0);
