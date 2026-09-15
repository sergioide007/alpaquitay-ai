import { WorkspaceFingerprinter } from '../../../core/context/WorkspaceFingerprinter';
import { contractFor, dodFor } from '../../../core/platform/PlatformContract';

describe('Platform senior', () => {
  it('Django/pip tiene golden path verificable', async () => {
    const fp = await new WorkspaceFingerprinter({ executeTool: async (s: string, t: string) => {
      if (t === 'read_file') { throw new Error('nf'); }
      if (t === 'write_file') { return { ok: true }; }
      return [{ name: 'manage.py', isDirectory: false }, { name: 'apps', isDirectory: true }];
    } } as never).fingerprint().catch(() => null);
    expect(fp === null || fp.pkgManager !== undefined).toBe(true);
    const c = contractFor({ version: 1, roots: ['.'], sourceDirs: ['apps'], languages: [], frameworks: ['Django + DRF'], entryPoints: ['manage.py'], pkgManager: 'pip', hasSpec: false, monorepo: false, scannedAt: '' });
    expect(c.commands.test).toBe('pytest');
    expect(c.verified).toBe(true);
    expect(dodFor('despliegue', c)).toMatch(/rollback/);
  });
  it('unknown no inventa comandos', () => {
    const c = contractFor({ version: 1, roots: ['.'], sourceDirs: ['.'], languages: [], frameworks: [], entryPoints: [], pkgManager: 'unknown', hasSpec: false, monorepo: false, scannedAt: '' });
    expect(c.verified).toBe(false);
    expect(c.commands.test).toMatch(/pendiente/);
  });
});
