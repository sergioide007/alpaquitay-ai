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
});
