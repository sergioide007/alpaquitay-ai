// Platform Engineering senior: la plataforma es el producto, el agente es un usuario mas.
// Codigo Sintetico Cap.03 + Cap.10: golden paths pavimentados, DORA visible, todo reversible.
// El contrato Platform describe el entorno donde el SDLC va a correr: stacks,
// comandos verificados (no inventados), entornos y backends. Si no esta en el
// contrato, el harness no lo inventa: lo pregunta.
import { MCPExecutor } from '../interfaces';
import { PkgManager, WorkspaceFingerprint } from '../context/WorkspaceFingerprinter';
export interface PlatformContract {
  version: 1; stack: string; pkgManager: PkgManager;
  commands: { install: string; build: string; test: string; lint: string };
  verified: boolean; onboardedAt?: string;
  verifiedCommands?: { stack: string; pkgManager: PkgManager; build: string; test: string };
  environments: string[]; notes: string;
}
const FILE = '.alpaquitay/platform.json';
const COMMANDS: Record<string, PlatformContract['commands']> = {
  npm: { install: 'npm ci', build: 'npm run build', test: 'npm test', lint: 'npm run lint' },
  pnpm: { install: 'pnpm install --frozen-lockfile', build: 'pnpm build', test: 'pnpm test', lint: 'pnpm lint' },
  pip: { install: 'pip install -r requirements.txt', build: 'python -m build', test: 'pytest', lint: 'ruff check .' },
  maven: { install: 'mvn -q -DskipTests package', build: 'mvn -q package', test: 'mvn test', lint: 'mvn -q spotless:check' },
  gradle: { install: './gradlew assemble', build: './gradlew build -x test', test: './gradlew test', lint: './gradlew check' },
  go: { install: 'go mod download', build: 'go build ./...', test: 'go test ./...', lint: 'gofmt -l .' },
  cargo: { install: 'cargo fetch', build: 'cargo build', test: 'cargo test', lint: 'cargo clippy -- -D warnings' },
  composer: { install: 'composer install', build: 'composer build', test: 'composer test', lint: 'composer lint' },
  dotnet: { install: 'dotnet restore', build: 'dotnet build', test: 'dotnet test', lint: 'dotnet format --verify-no-changes' },
  unknown: { install: '(sin gestor detectado)', build: '(pendiente de verificar)', test: '(pendiente de verificar)', lint: '(pendiente)' },
};
export function contractFor(fp: WorkspaceFingerprint): PlatformContract {
  const cmds = COMMANDS[fp.pkgManager] ?? COMMANDS.unknown;
  return {
    version: 1, stack: fp.frameworks[0] ?? 'por detectar', pkgManager: fp.pkgManager,
    commands: cmds, verified: false,
    environments: ['local', 'preview', 'prod'],
    notes: fp.pkgManager === 'unknown'
      ? 'Golden path pendiente: confirma install/build/test de tu stack.'
      : `Golden path ${fp.pkgManager}: install → test → build. Despliegue exige pipeline verde + rollback.`,
  };
}

function isPlatformContract(value: unknown): value is PlatformContract {
  if (!value || typeof value !== 'object') { return false; }
  const contract = value as Partial<PlatformContract>;
  const commands = contract.commands;
  const knownManagers: PkgManager[] = ['npm', 'pnpm', 'pip', 'maven', 'gradle', 'go', 'cargo', 'composer', 'dotnet', 'unknown'];
  return contract.version === 1 && typeof contract.stack === 'string' &&
    knownManagers.includes(contract.pkgManager as PkgManager) && typeof contract.verified === 'boolean' &&
    (contract.onboardedAt === undefined || typeof contract.onboardedAt === 'string') &&
    (contract.verifiedCommands === undefined || (
      typeof contract.verifiedCommands === 'object' && !!contract.verifiedCommands &&
      typeof contract.verifiedCommands.stack === 'string' &&
      knownManagers.includes(contract.verifiedCommands.pkgManager) &&
      typeof contract.verifiedCommands.build === 'string' &&
      typeof contract.verifiedCommands.test === 'string'
    )) &&
    !!commands && typeof commands.install === 'string' && typeof commands.build === 'string' &&
    typeof commands.test === 'string' && typeof commands.lint === 'string' &&
    Array.isArray(contract.environments) && typeof contract.notes === 'string';
}

export function isPlatformContractVerified(contract: PlatformContract | null | undefined): boolean {
  if (!contract || !contract.verified ||
    typeof contract.onboardedAt !== 'string' || !Number.isFinite(Date.parse(contract.onboardedAt))) {
    return false;
  }
  const runnable = (command: unknown): command is string => typeof command === 'string' &&
    command.trim().length > 0 && !/pendiente|sin gestor/i.test(command);
  const snapshot = contract.verifiedCommands;
  return runnable(contract.commands?.build) && runnable(contract.commands?.test) &&
    !!snapshot && snapshot.stack === contract.stack && snapshot.pkgManager === contract.pkgManager &&
    snapshot.build === contract.commands.build && snapshot.test === contract.commands.test;
}

export async function readPlatformContract(
  mcp: MCPExecutor,
  fp: WorkspaceFingerprint
): Promise<PlatformContract | null> {
  try {
    const file = await mcp.executeTool('filesystem', 'read_file', { path: FILE }) as { content: string };
    const parsed: unknown = JSON.parse(file.content);
    if (!isPlatformContract(parsed)) { return null; }
    const fresh = contractFor(fp);
    return parsed.stack === fresh.stack && parsed.pkgManager === fresh.pkgManager ? parsed : null;
  } catch {
    return null;
  }
}

export async function savePlatformContract(mcp: MCPExecutor, contract: PlatformContract): Promise<boolean> {
  try {
    await mcp.executeTool('filesystem', 'write_file', { path: FILE, content: JSON.stringify(contract, null, 2) });
    return true;
  } catch {
    return false;
  }
}

export async function loadOrBuild(mcp: MCPExecutor, fp: WorkspaceFingerprint): Promise<PlatformContract> {
  const existing = await readPlatformContract(mcp, fp);
  if (existing) { return existing; }
  const fresh = contractFor(fp);
  await savePlatformContract(mcp, fresh);
  return fresh;
}
export function dodFor(phase: string, c: PlatformContract): string {
  const t = c.commands.test, b = c.commands.build;
  switch (phase) {
    case 'implementacion': return `DoD: preview + checkpoint + \`${b}\` + \`${t}\` en verde`;
    case 'pruebas': return `DoD: \`${t}\` (happy + borde + error) sin bajar coverage`;
    case 'despliegue': return 'DoD: pipeline verde + aprobacion humana + rollback listo (nunca deploy directo del chat)';
    case 'diseno': return 'DoD: ADR en decisions.jsonl + fuentes dentro de sourceDirs evidenciados';
    case 'mantenimiento': return 'DoD: runbook + alerta + dueno + postmortem si hubo incidente';
    default: return `DoD requisitos: objetivo + alcance + no-alcance + dueno (golden: \`${t}\` conocido)`;
  }
}
