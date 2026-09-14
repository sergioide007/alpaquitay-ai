#!/usr/bin/env node
// Release script: compile, test, package, and prepare for deployment.
// Usage: node scripts/release.js [--skip-tests] [--dry-run]
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const skipTests = args.includes('--skip-tests');
const dryRun = args.includes('--dry-run');

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  if (dryRun) { return ''; }
  return execSync(cmd, { stdio: 'inherit', ...opts });
}

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const vsixName = `alpaquitay-ai-v${version}.vsix`;
const vsixPath = path.join(root, vsixName);

console.log(`\n🚀 Alpaquitay AI v${version} — release build\n`);

try {
  // 1. Compile
  console.log('📦 Step 1/4: Compiling TypeScript...');
  run('npm run compile');

  // 2. Test
  if (!skipTests) {
    console.log('\n🧪 Step 2/4: Running tests...');
    run('npm test');
  } else {
    console.log('\n⏭️  Step 2/4: Tests skipped');
  }

  // 3. Clean old vsix
  console.log('\n🧹 Step 3/4: Cleaning old packages...');
  const oldVsix = fs.readdirSync(root).filter(f => f.endsWith('.vsix'));
  for (const f of oldVsix) {
    fs.unlinkSync(path.join(root, f));
    console.log(`  removed ${f}`);
  }

  // 4. Package
  console.log(`\n📦 Step 4/4: Packaging ${vsixName}...`);
  run(`npx vsce package --out ${vsixName}`);

  // Summary
  const stats = fs.statSync(vsixPath);
  const sizeKB = (stats.size / 1024).toFixed(1);
  console.log(`\n✅ Release package ready: ${vsixName} (${sizeKB} KB)`);
  console.log(`\n📋 Next steps:`);
  console.log(`   1. Install locally:  code --install-extension ${vsixName}`);
  console.log(`   2. Test in VS Code:  Press F5 (Extension Development Host)`);
  console.log(`   3. Publish to VS Code Marketplace:`);
  console.log(`      npx vsce publish --packagePath ${vsixName}`);
  console.log(`   4. Publish to Open VSX:`);
  console.log(`      npx ovsx publish ${vsixName}`);
  console.log(`\n🔑 Secrets needed: VSCE_PAT, OVSX_PAT`);

} catch (err) {
  console.error(`\n❌ Release failed: ${err.message}`);
  process.exit(1);
}
