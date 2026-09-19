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
check('HARNESS.md', fs.existsSync(path.join(root, 'HARNESS.md')));

// 3. Icono
console.log('\n🖼️  Icono:');
const iconPath = path.join(root, 'resources/icon.png');
if (fs.existsSync(iconPath)) {
  const stats = fs.statSync(iconPath);
  check('icon.png exists', true);
  check('icon.png size > 100KB', stats.size > 100000, `(${(stats.size/1024).toFixed(0)}KB)`);
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
const vsixFiles = fs.readdirSync(root).filter(f => f.endsWith('.vsix'));
check('.vsix exists', vsixFiles.length > 0, vsixFiles[0] || '');
if (vsixFiles.length > 0) {
  const vsixStats = fs.statSync(path.join(root, vsixFiles[0]));
  check('.vsix size > 500KB', vsixStats.size > 500000, `(${(vsixStats.size/1024).toFixed(0)}KB)`);
}

// Resumen
console.log(`\n${'='.repeat(50)}`);
console.log(`RESULTADO: ${pass} passed, ${fail} failed`);
if (fail === 0) {
  console.log('✅ LISTO PARA PUBLICAR EN MARKETPLACE');
  console.log('\nPróximos pasos:');
  console.log('  1. F5 en VS Code → Extension Development Host');
  console.log(`  2. git tag v${VERSION} && git push origin v${VERSION}`);
  console.log(`  3. O publicar manual: npx vsce publish --packagePath ${VSIX}`);
} else {
  console.log('❌ HAY ERRORES — corregir antes de publicar');
}
console.log('='.repeat(50) + '\n');

process.exit(fail > 0 ? 1 : 0);
