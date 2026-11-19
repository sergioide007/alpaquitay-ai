import { WorkspaceFingerprinter } from '../../../core/context/WorkspaceFingerprinter';
function mcp(files: Record<string, string>, dirs: Record<string, string[]>) {
  return { executeTool: async (_s: string, t: string, p: Record<string, unknown>) => {
    if (t === 'read_file') { const c = files[p.path as string]; if (c === undefined) { throw new Error('nf'); } return { content: c }; }
    if (t === 'list_files') {
      const k = p.path as string;
      if (k === '.') { return [{ name: 'manage.py', isDirectory: false }, { name: 'apps', isDirectory: true }]; }
      if (dirs[k]) { return dirs[k].map(n => ({ name: n, isDirectory: false })); }
      throw new Error('nf');
    }
    if (t === 'write_file') { return { ok: true }; }
    throw new Error('tool');
  } };
}
describe('WorkspaceFingerprinter legados', () => {
  it('detecta Django en apps/ sin asumir src/', async () => {
    const fp = await new WorkspaceFingerprinter(mcp({} as never, { apps: ['models.py','views.py'] }) as never).fingerprint();
    expect(fp.frameworks[0]).toMatch(/Django/);
    expect(fp.sourceDirs).toContain('apps');
    expect(fp.sourceDirs).not.toContain('src');
  });

  it('refresh ignora un fingerprint persistido desactualizado', async () => {
    const files: Record<string, string> = {
      '.alpaquitay/fingerprint.json': JSON.stringify({
        version: 1, roots: ['.'], sourceDirs: ['src'], languages: [{ name: 'JavaScript', pct: 100 }],
        frameworks: ['Node'], entryPoints: [], pkgManager: 'npm', hasSpec: false, monorepo: false, scannedAt: '',
      }),
    };
    const executor = { executeTool: async (_s: string, tool: string, p: Record<string, unknown>) => {
      if (tool === 'read_file') {
        const content = files[p.path as string];
        if (content === undefined) { throw new Error('nf'); }
        return { content };
      }
      if (tool === 'write_file') { files[p.path as string] = String(p.content); return { ok: true }; }
      if (tool === 'list_files' && p.path === '.') { return [{ name: 'pom.xml', isDirectory: false }]; }
      throw new Error('tool');
    } } as never;
    const fingerprinter = new WorkspaceFingerprinter(executor);

    expect((await fingerprinter.fingerprint()).pkgManager).toBe('npm');
    expect((await fingerprinter.refresh()).pkgManager).toBe('maven');
  });

  it('pnpm workspace no se degrada a npm por tener package.json', async () => {
    const executor = { executeTool: async (_s: string, tool: string, p: Record<string, unknown>) => {
      if (tool === 'read_file' && p.path === 'package.json') { return { content: '{"name":"app"}' }; }
      if (tool === 'read_file') { throw new Error('nf'); }
      if (tool === 'write_file') { return { ok: true }; }
      if (tool === 'list_files' && p.path === '.') {
        return [
          { name: 'package.json', isDirectory: false },
          { name: 'pnpm-workspace.yaml', isDirectory: false },
        ];
      }
      throw new Error('tool');
    } } as never;

    expect((await new WorkspaceFingerprinter(executor).refresh()).pkgManager).toBe('pnpm');
  });

  it('reconoce lenguajes fuente fuera del conjunto web habitual', async () => {
    const executor = { executeTool: async (_s: string, tool: string, p: Record<string, unknown>) => {
      if (tool === 'read_file') { throw new Error('nf'); }
      if (tool === 'write_file') { return { ok: true }; }
      if (tool === 'list_files' && p.path === '.') { return [{ name: 'scripts', isDirectory: true }]; }
      if (tool === 'list_files' && p.path === 'scripts') { return [{ name: 'main.lua', isDirectory: false }]; }
      throw new Error('tool');
    } } as never;

    const fp = await new WorkspaceFingerprinter(executor).refresh();
    expect(fp.sourceDirs).toContain('scripts');
    expect(fp.languages.map(language => language.name)).toContain('Lua');
  });
});
