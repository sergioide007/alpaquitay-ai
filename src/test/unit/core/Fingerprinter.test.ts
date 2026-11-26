import { WorkspaceFingerprinter } from '../../../core/context/WorkspaceFingerprinter';
import { specPathHints, sourceRule } from '../../../core/context/PathHints';
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
        version: 2, roots: ['.'], sourceDirs: ['src'], languages: [{ name: 'JavaScript', pct: 100 }],
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

  it('inspecciona recursivamente un proyecto Maven y conserva sus rutas Java reales', async () => {
    const tree: Record<string, Array<{ name: string; isDirectory: boolean }>> = {
      '.': [
        { name: 'pom.xml', isDirectory: false },
        { name: 'src', isDirectory: true },
      ],
      'src': [
        { name: 'main', isDirectory: true },
        { name: 'test', isDirectory: true },
      ],
      'src/main': [{ name: 'java', isDirectory: true }],
      'src/main/java': [{ name: 'com', isDirectory: true }],
      'src/main/java/com': [{ name: 'acme', isDirectory: true }],
      'src/main/java/com/acme': [{ name: 'Application.java', isDirectory: false }],
      'src/test': [{ name: 'java', isDirectory: true }],
      'src/test/java': [{ name: 'com', isDirectory: true }],
      'src/test/java/com': [{ name: 'acme', isDirectory: true }],
      'src/test/java/com/acme': [{ name: 'ApplicationTest.java', isDirectory: false }],
    };
    const executor = { executeTool: async (_s: string, tool: string, p: Record<string, unknown>) => {
      if (tool === 'read_file' && p.path === 'pom.xml') { return { content: '<project><artifactId>catalog</artifactId></project>' }; }
      if (tool === 'read_file') { throw new Error('nf'); }
      if (tool === 'write_file') { return { ok: true }; }
      if (tool === 'list_files') {
        const entries = tree[p.path as string];
        if (!entries) { throw new Error('nf'); }
        return entries;
      }
      throw new Error('tool');
    } } as never;

    const fp = await new WorkspaceFingerprinter(executor).refresh();
    expect(fp.version).toBe(2);
    expect(fp.pkgManager).toBe('maven');
    expect(fp.frameworks).toContain('Java + Maven');
    expect(fp.languages[0]?.name).toBe('Java');
    expect(fp.sourceDirs).toEqual(['src/main/java', 'src/test/java']);
  });

  it('invalidates the shallow version 1 cache so Maven is scanned again', async () => {
    const files = {
      '.alpaquitay/fingerprint.json': JSON.stringify({
        version: 1, roots: ['.'], sourceDirs: ['src'], languages: [{ name: 'TypeScript', pct: 100 }],
        frameworks: ['Node'], entryPoints: ['package.json'], pkgManager: 'npm', hasSpec: false, monorepo: false, scannedAt: '',
      }),
      'pom.xml': '<project/>',
    };
    const executor = { executeTool: async (_s: string, tool: string, p: Record<string, unknown>) => {
      if (tool === 'read_file') {
        const content = files[p.path as keyof typeof files];
        if (content === undefined) { throw new Error('nf'); }
        return { content };
      }
      if (tool === 'write_file') { return { ok: true }; }
      if (tool === 'list_files' && p.path === '.') { return [{ name: 'pom.xml', isDirectory: false }]; }
      throw new Error('tool');
    } } as never;

    const fp = await new WorkspaceFingerprinter(executor).fingerprint();
    expect(fp.version).toBe(2);
    expect(fp.pkgManager).toBe('maven');
    expect(fp.languages).toEqual([{ name: 'Java', pct: 100 }]);
    expect(specPathHints(fp).component).toBe('src/main/java/domain/model/Feature.java');
    expect(specPathHints(fp).test).toBe('src/test/java/application/FeatureUseCaseTest.java');
    expect(sourceRule(fp)).toContain('src/main/java');
  });

  it('prioritizes Maven evidence over unrelated dominant file counts for path hints', () => {
    const fp = {
      version: 2 as const, roots: ['.'], sourceDirs: ['src/main/java', 'src/test/java'],
      languages: [{ name: 'TypeScript', pct: 80 }, { name: 'Java', pct: 20 }],
      frameworks: ['Java + Maven'], entryPoints: ['pom.xml'], pkgManager: 'maven' as const,
      hasSpec: false, monorepo: true, scannedAt: '',
    };

    expect(specPathHints(fp).component).toBe('src/main/java/domain/model/Feature.java');
    expect(sourceRule(fp)).toContain('Proyecto Java detectado');
  });
});
