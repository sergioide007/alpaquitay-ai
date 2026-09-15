/**
 * Fail-safe del fix EROFS en la capa de persistencia:
 * sin carpeta de trabajo escribible, SpecManager y FilesystemMCP NO escriben
 * y devuelven errores accionables en vez del `EROFS` crudo de Node.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SpecManager } from '../../../core/SpecManager';
import { FilesystemMCP } from '../../../mcp/FilesystemMCP';
import { GitMCP } from '../../../mcp/GitMCP';
import { CheckpointManager } from '../../../core/harness/CheckpointManager';
import { GitIntegration } from '../../../core/GitIntegration';
import { AlpaquitayConfig } from '../../../core/config';

describe('SpecManager fail-safe (sin carpeta escribible)', () => {
  const config = new AlpaquitayConfig();

  it('Given raiz invalida, Then specPath es "" (nunca la relativa "spec.md")', () => {
    expect(new SpecManager('', config).specPath).toBe('');
    expect(new SpecManager('/', config).specPath).toBe('');
  });

  it('Given raiz invalida, When load(), Then no existe spec y no lanza', async () => {
    const data = await new SpecManager('/', config).load();
    expect(data.exists).toBe(false);
    expect(data.tasks).toEqual([]);
    expect(data.specFile).toBe('spec.md');
  });

  it('Given raiz invalida, When create(), Then rechaza con mensaje accionable', async () => {
    const sm = new SpecManager('/', config);
    await expect(sm.create('- [ ] tarea')).rejects.toThrow(/Abre una carpeta de trabajo/);
  });

  it('Given raiz valida, When create(), Then escribe y es legible', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpaquitay-spec-'));
    try {
      const sm = new SpecManager(dir, config);
      expect(sm.isWritable()).toBe(true);
      await sm.create('## Epic: Core\n- [ ] Crear endpoint\n- [ ] Test endpoint\n');
      expect(fs.readFileSync(path.join(dir, 'spec.md'), 'utf-8')).toMatch(/Crear endpoint/);
      const loaded = await sm.load();
      expect(loaded.exists).toBe(true);
      expect(loaded.tasks.length).toBe(2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('Given raiz invalida, Then discover() no escanea nada', async () => {
    expect(await new SpecManager('/', config).discover()).toEqual([]);
  });
});

describe('FilesystemMCP raiz invalida', () => {
  it('Given raiz "/", When write_file, Then error accionable (no EROFS crudo)', async () => {
    const mcp = new FilesystemMCP('/');
    const tool = mcp.tools.find(t => t.name === 'write_file')!;
    await expect(tool.execute({ path: 'spec.md', content: 'x' })).rejects.toThrow(/Abre una carpeta de trabajo/);
  });

  it('Given raiz "/", When read_file, Then tambien exige carpeta de trabajo', async () => {
    const mcp = new FilesystemMCP('/');
    const tool = mcp.tools.find(t => t.name === 'read_file')!;
    await expect(tool.execute({ path: 'spec.md' })).rejects.toThrow(/Abre una carpeta de trabajo/);
  });

  it('Given raiz valida, When write_file, Then escribe dentro de la raiz', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpaquitay-fs-'));
    try {
      const mcp = new FilesystemMCP(dir);
      const tool = mcp.tools.find(t => t.name === 'write_file')!;
      await tool.execute({ path: '.alpaquitay/fingerprint.json', content: '{}' });
      expect(fs.existsSync(path.join(dir, '.alpaquitay', 'fingerprint.json'))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('Given una carpeta hermana con prefijo comun, When escribe fuera, Then bloquea traversal', async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'alpaquitay-par-'));
    const root = path.join(parent, 'app');
    fs.mkdirSync(root);
    try {
      const mcp = new FilesystemMCP(root);
      const tool = mcp.tools.find(t => t.name === 'write_file')!;
      // `parent/app2/x.ts` NO esta dentro de `parent/app` (falso positivo del startsWith antiguo).
      await expect(tool.execute({ path: '../app2/x.ts', content: 'x' })).rejects.toThrow(/traversal/);
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });
});

describe('Sin raiz valida: nada de git ni de comandos ajenos', () => {
  it('Given raiz invalida, When checkpoint, Then NO ejecuta git (marca explicita)', async () => {
    const cp = new CheckpointManager('');
    await expect(cp.save('delete-file')).resolves.toBe('no-checkpoint:sin-carpeta-de-trabajo');
    await expect(cp.status()).resolves.toBe('no-carpeta');
    // La raiz `/` tampoco es una carpeta de trabajo.
    await expect(new CheckpointManager('/').save('x')).resolves.toBe('no-checkpoint:sin-carpeta-de-trabajo');
  });

  it('Given raiz valida, Then el checkpoint sigue intentando git (no rompe el flujo)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpaquitay-cp-'));
    try {
      const out = await new CheckpointManager(dir).save('test');
      expect(out).toMatch(/^stash:|^no-git:/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('Given raiz invalida, When git_log via GitMCP, Then error accionable', async () => {
    const mcp = new GitMCP('');
    const tool = mcp.tools.find(t => t.name === 'git_log')!;
    await expect(tool.execute({ limit: 5 })).rejects.toThrow(/Sin carpeta de trabajo valida/);
  });

  it('Given raiz invalida, When git_commit via GitMCP, Then NO muta nada', async () => {
    const mcp = new GitMCP('');
    const tool = mcp.tools.find(t => t.name === 'git_commit')!;
    await expect(tool.execute({ message: 'x' })).rejects.toThrow(/Abre una carpeta de trabajo/);
  });

  it('Given raiz invalida, When DORA getLog, Then available=false (sin metricas ajenas)', async () => {
    const log = await new GitIntegration('').getLog(10);
    expect(log.available).toBe(false);
    expect(log.commits).toEqual([]);
    expect((await new GitIntegration('/').getLog(10)).available).toBe(false);
  });
});