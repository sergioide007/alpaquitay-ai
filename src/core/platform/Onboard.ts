// Experto: onboarding de legados en un comando (Fowler Strangler + Cap.10 DDD).
// Genera fingerprint + platform + ADR inicial + DORA en un solo reporte.
// No escribe codigo del proyecto: solo .alpaquitay/*. Todo reversible.
import { MCPExecutor } from '../interfaces';
import { WorkspaceFingerprinter } from '../context/WorkspaceFingerprinter';
import { isPlatformContractVerified, loadOrBuild, savePlatformContract, PlatformContract } from './PlatformContract';
import { GitIntegration } from '../GitIntegration';
import { doraFrom } from './Dora';
export interface OnboardReport {
  stack: string; sources: string[]; entryPoints: string[];
  testCmd: string; verified: boolean;
  doraLevel: string; adr: string; markdown: string;
}
export interface OnboardCommandOverrides { build: string; test: string; }

function validOverride(command: string): boolean {
  return typeof command === 'string' && command.trim().length > 0 && command.trim().length <= 300 &&
    !/[\r\n\0]/.test(command);
}

export async function onboard(
  mcp: MCPExecutor,
  git: GitIntegration,
  commandOverrides?: OnboardCommandOverrides
): Promise<OnboardReport> {
  if (commandOverrides && (!validOverride(commandOverrides.build) || !validOverride(commandOverrides.test))) {
    throw new Error('Los comandos build y test deben ser texto de una sola línea (máximo 300 caracteres).');
  }
  const fp = await new WorkspaceFingerprinter(mcp).refresh();
  const detectedContract: PlatformContract = await loadOrBuild(mcp, fp);
  const commands = commandOverrides
    ? { ...detectedContract.commands, build: commandOverrides.build.trim(), test: commandOverrides.test.trim() }
    : detectedContract.commands;
  const hasUsableCommands = (value: string) => value.trim().length > 0 && !/pendiente|sin gestor/i.test(value);
  const verified = (detectedContract.pkgManager !== 'unknown' || !!commandOverrides ||
    isPlatformContractVerified(detectedContract)) &&
    hasUsableCommands(commands.build) && hasUsableCommands(commands.test);
  const onboardedContract: PlatformContract = {
    ...detectedContract,
    commands,
    verified,
    onboardedAt: new Date().toISOString(),
    verifiedCommands: verified ? {
      stack: detectedContract.stack,
      pkgManager: detectedContract.pkgManager,
      build: commands.build,
      test: commands.test,
    } : undefined,
  };
  const contractSaved = await savePlatformContract(mcp, onboardedContract);
  const contract: PlatformContract = contractSaved
    ? onboardedContract
    : { ...detectedContract, verified: false, onboardedAt: undefined };
  let doraLevel = 'sin datos';
  try { doraLevel = doraFrom((await git.getLog(40)).commits).level; } catch { /* sin git */ }
  const lines = [
    `# Onboard — ${fp.frameworks[0] ?? 'stack por detectar'}`,
    '',
    `Fuentes evidenciadas: \`${fp.sourceDirs.join(', ') || '.'}\` (nunca se asumio \`src/\`)`,
    `Entradas: \`${fp.entryPoints.join(', ') || 'por confirmar'}\``,
    `Test: \`${contract.commands.test}\` ${contract.verified ? '✅ verificado' : '⚠️ sin verificar — confirma tu comando'}`,
    `Build: \`${contract.commands.build}\` · Lint: \`${contract.commands.lint}\``,
    ...(!contractSaved ? ['⚠️ No se pudo guardar el contrato; vuelve a ejecutar `onboard` antes de cerrar tareas.'] : []),
    ...(contractSaved && !contract.verified && contract.pkgManager === 'unknown'
      ? ['Confirma el stack enviando `onboard {"build":"comando","test":"comando"}`.']
      : []),
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
