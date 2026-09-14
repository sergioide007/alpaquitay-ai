// Experto: onboarding de legados en un comando (Fowler Strangler + Cap.10 DDD).
// Genera fingerprint + platform + ADR inicial + DORA en un solo reporte.
// No escribe codigo del proyecto: solo .alpaquitay/*. Todo reversible.
import { MCPExecutor } from '../interfaces';
import { WorkspaceFingerprinter } from '../context/WorkspaceFingerprinter';
import { loadOrBuild, PlatformContract } from './PlatformContract';
import { GitIntegration } from '../GitIntegration';
import { doraFrom } from './Dora';
export interface OnboardReport {
  stack: string; sources: string[]; entryPoints: string[];
  testCmd: string; verified: boolean;
  doraLevel: string; adr: string; markdown: string;
}
export async function onboard(mcp: MCPExecutor, git: GitIntegration): Promise<OnboardReport> {
  const fp = await new WorkspaceFingerprinter(mcp).fingerprint();
  const contract: PlatformContract = await loadOrBuild(mcp, fp);
  let doraLevel = 'sin datos';
  try { doraLevel = doraFrom((await git.getLog(40)).commits).level; } catch { /* sin git */ }
  const lines = [
    `# Onboard — ${fp.frameworks[0] ?? 'stack por detectar'}`,
    '',
    `Fuentes evidenciadas: \`${fp.sourceDirs.join(', ') || '.'}\` (nunca se asumio \`src/\`)`,
    `Entradas: \`${fp.entryPoints.join(', ') || 'por confirmar'}\``,
    `Test: \`${contract.commands.test}\` ${contract.verified ? '✅ verificado' : '⚠️ sin verificar — confirma tu comando'}`,
    `Build: \`${contract.commands.build}\` · Lint: \`${contract.commands.lint}\``,
    `DORA: **${doraLevel}**`,
    '',
    '## ADR-001 (inicial, generado por harness)',
    `- Stack: ${fp.frameworks.join(', ') || 'detectar'}`,
    `- Fuentes: ${fp.sourceDirs.join(', ') || '.'}`,
    `- Golden path: install → test → build (ver platform.json)`,
    '- Decision: todo write pasa por diff + PolicyGuard + checkpoint',
    '',
    '_Siguiente: dime tu idea desordenada o escribe `dora` para el estado DevOps._',
  ];
  const markdown = lines.join('\n');
  try {
    await mcp.executeTool('filesystem', 'write_file', { path: '.alpaquitay/ADR-001-onboard.md', content: markdown });
  } catch { /* best-effort */ }
  return {
    stack: fp.frameworks[0] ?? 'desconocido', sources: fp.sourceDirs,
    entryPoints: fp.entryPoints, testCmd: contract.commands.test,
    verified: contract.verified, doraLevel,
    adr: '.alpaquitay/ADR-001-onboard.md', markdown,
  };
}
