#!/usr/bin/env node
// Release/CI gate: refuses to run the build or publish pipeline on a Node.js that is end-of-life or older than the
// patched floor in scripts/node-security-floor.json. Update that file when a new Node security release appears:
// https://nodejs.org/en/blog/vulnerability/
const floor = require('./node-security-floor.json');

function cmp(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] ?? 0) !== (pb[i] ?? 0)) { return (pa[i] ?? 0) - (pb[i] ?? 0); } }
  return 0;
}

function evaluate(version) {
  const major = version.split('.')[0];
  const min = floor.floors[major];
  if (!min) { return { ok: false, message: `Node ${version}: la rama ${major}.x esta fuera de soporte o no figura en el piso de seguridad (${Object.values(floor.floors).join(', ')}). Las ramas EOL no reciben parches.` }; }
  if (cmp(version, min) < 0) { return { ok: false, message: `Node ${version} es anterior al piso parcheado ${min} para la rama ${major}.x (${floor.advisory}).` }; }
  return { ok: true, message: `Node ${version} cumple el piso de seguridad (${min}+ en ${major}.x, revisado ${floor.checkedOn}).` };
}

module.exports = { evaluate, cmp };

if (require.main === module) {
  const r = evaluate(process.versions.node);
  console.log(`${r.ok ? '✅' : '❌'} ${r.message}`);
  process.exit(r.ok ? 0 : 1);
}
