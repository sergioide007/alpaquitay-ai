import { dodGateForDone } from '../../../core/sdlc/DefinitionOfDone';
import { onboard } from '../../../core/platform/Onboard';
import { isPlatformContractVerified, PlatformContract } from '../../../core/platform/PlatformContract';
import { QualityEvidence } from '../../../core/sdlc/QualityEvidence';

const verifiedContract: PlatformContract = {
  version: 1, stack: 'Node', pkgManager: 'npm',
  commands: { install: 'npm ci', build: 'npm run build', test: 'npm test', lint: 'npm run lint' },
  verified: true, onboardedAt: '2026-11-19T00:00:00.000Z',
  verifiedCommands: { stack: 'Node', pkgManager: 'npm', build: 'npm run build', test: 'npm test' },
  environments: ['local'], notes: '',
};
const greenEvidence: QualityEvidence = {
  version: 1, taskId: 'SPEC-001', files: ['src/index.ts'], recordedAt: '2026-11-19T00:00:00.000Z',
  build: { command: 'npm run build', status: 'passed' },
  tests: { command: 'npm test', status: 'passed' },
};
describe('Ambos aspectos: DoD gate + onboard', () => {
  it('DoD bloquea done con diffs pendientes', () => {
    const g = dodGateForDone(2, verifiedContract, greenEvidence);
    expect(g.pass).toBe(false);
    expect(g.blockers.join(' ')).toMatch(/sin aplicar/);
  });
  it('DoD bloquea sin contrato verificado', () => {
    const g = dodGateForDone(0, null);
    expect(g.pass).toBe(false);
    expect(g.blockers.join(' ')).toMatch(/onboard/);
  });
  it('bloquea código si falta evidencia aunque el contrato esté verificado', () => {
    expect(dodGateForDone(0, verifiedContract, null, true).pass).toBe(false);
  });
  it('pasa código solo con contrato onboarded y build/tests verdes', () => {
    expect(dodGateForDone(0, verifiedContract, greenEvidence, true).pass).toBe(true);
    expect(dodGateForDone(0, { ...verifiedContract, onboardedAt: undefined }, greenEvidence, true).pass).toBe(false);
    expect(dodGateForDone(0, verifiedContract, {
      ...greenEvidence, tests: { command: 'echo true', status: 'passed' },
    }, true).pass).toBe(false);
  });
  it('permite proyectos sin código pero mantiene el bloqueo de diffs', () => {
    expect(dodGateForDone(0, null, null, false).pass).toBe(true);
    expect(dodGateForDone(1, null, null, false).pass).toBe(false);
  });
  it('onboard genera reporte sin asumir src', async () => {
    const files: Record<string, string> = {};
    const mcp = { executeTool: async (_s: string, t: string, p: Record<string, unknown>) => {
      if (t === 'read_file') { const c = files[p.path as string]; if (c === undefined) { throw new Error('nf'); } return { content: c }; }
      if (t === 'write_file') { files[p.path as string] = String(p.content); return { ok: true }; }
      if (t === 'list_files') {
        if (p.path === '.') { return [{ name: 'pom.xml', isDirectory: false }, { name: 'apps', isDirectory: true }]; }
        if (p.path === 'apps') { return [{ name: 'Main.java', isDirectory: false }]; }
        throw new Error('nf');
      }
      throw new Error('tool');
    } } as never;
    const git = { getLog: async () => ({ available: false, commits: [] }) } as never;
    const r = await onboard(mcp, git);
    expect(r.verified).toBe(true);
    expect(r.sources).toContain('apps');
    expect(r.markdown).toMatch(/nunca se asumio/);
    expect(files['.alpaquitay/ADR-001-onboard.md']).toContain('ADR-001');
    const savedContract = JSON.parse(files['.alpaquitay/platform.json']);
    expect(savedContract.verified).toBe(true);
    expect(savedContract.onboardedAt).toBeTruthy();
    expect(isPlatformContractVerified(savedContract)).toBe(true);
    expect(savedContract.verifiedCommands).toEqual({
      stack: 'Java + Maven', pkgManager: 'maven', build: 'mvn -q package', test: 'mvn test',
    });
  });
  it('permite verificar comandos aportados para un stack desconocido', async () => {
    const files: Record<string, string> = {};
    const mcp = { executeTool: async (_s: string, t: string, p: Record<string, unknown>) => {
      if (t === 'read_file') { const c = files[p.path as string]; if (c === undefined) { throw new Error('nf'); } return { content: c }; }
      if (t === 'write_file') { files[p.path as string] = String(p.content); return { ok: true }; }
      if (t === 'list_files' && p.path === '.') { return [{ name: 'README.md', isDirectory: false }]; }
      throw new Error('tool');
    } } as never;
    const git = { getLog: async () => ({ available: false, commits: [] }) } as never;
    const r = await onboard(mcp, git, { build: 'custom build', test: 'custom test' });
    expect(r.verified).toBe(true);
    const savedContract = JSON.parse(files['.alpaquitay/platform.json']);
    expect(savedContract.commands.test).toBe('custom test');
    expect(isPlatformContractVerified(savedContract)).toBe(true);
  });
});
