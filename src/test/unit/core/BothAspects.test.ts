import { dodGateForDone } from '../../../core/sdlc/DefinitionOfDone';
import { onboard } from '../../../core/platform/Onboard';
describe('Ambos aspectos: DoD gate + onboard', () => {
  it('DoD bloquea done con diffs pendientes', () => {
    const g = dodGateForDone(2, { version: 1, stack: 'x', pkgManager: 'npm', commands: { install: 'a', build: 'b', test: 'c', lint: 'd' }, verified: true, environments: [], notes: '' });
    expect(g.pass).toBe(false);
    expect(g.blockers.join(' ')).toMatch(/sin aplicar/);
  });
  it('DoD bloquea sin contrato verificado', () => {
    const g = dodGateForDone(0, null);
    expect(g.pass).toBe(false);
    expect(g.blockers.join(' ')).toMatch(/onboard/);
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
    expect(r.sources).toContain('apps');
    expect(r.markdown).toMatch(/nunca se asumio/);
    expect(files['.alpaquitay/ADR-001-onboard.md']).toContain('ADR-001');
  });
});
