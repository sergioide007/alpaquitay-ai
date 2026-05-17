import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FilesystemMCP } from '../../../mcp/FilesystemMCP';

describe('FilesystemMCP', () => {
  let tmpDir: string;
  let mcp: FilesystemMCP;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpaquitay-test-'));
    mcp = new FilesystemMCP(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('Has correct id, name, and description', () => {
    expect(mcp.id).toBe('filesystem');
    expect(mcp.name).toBeTruthy();
    expect(mcp.description).toBeTruthy();
  });

  it('connect() and disconnect() resolve without error', async () => {
    await expect(mcp.connect()).resolves.toBeUndefined();
    await expect(mcp.disconnect()).resolves.toBeUndefined();
  });

  describe('read_file tool', () => {
    it('Given an existing file, When reading it, Then returns its content', async () => {
      const filePath = path.join(tmpDir, 'hello.txt');
      fs.writeFileSync(filePath, 'hello world');
      const tool = mcp.tools.find(t => t.name === 'read_file')!;
      const result = await tool.execute({ path: 'hello.txt' }) as { content: string };
      expect(result.content).toBe('hello world');
    });

    it('Given a missing file, When reading it, Then rejects with ENOENT error', async () => {
      const tool = mcp.tools.find(t => t.name === 'read_file')!;
      await expect(tool.execute({ path: 'missing.txt' })).rejects.toThrow();
    });

    it('Given a path traversal attempt, When reading, Then throws path traversal error', async () => {
      const tool = mcp.tools.find(t => t.name === 'read_file')!;
      await expect(tool.execute({ path: '../../../etc/passwd' })).rejects.toThrow('traversal');
    });
  });

  describe('write_file tool', () => {
    it('When writing a file, Then creates the file with the given content', async () => {
      const tool = mcp.tools.find(t => t.name === 'write_file')!;
      await tool.execute({ path: 'output.ts', content: 'export {}' });
      const written = fs.readFileSync(path.join(tmpDir, 'output.ts'), 'utf-8');
      expect(written).toBe('export {}');
    });

    it('When writing to a nested path, Then creates parent directories', async () => {
      const tool = mcp.tools.find(t => t.name === 'write_file')!;
      await tool.execute({ path: 'src/deep/nested/file.ts', content: 'ok' });
      const written = fs.readFileSync(path.join(tmpDir, 'src/deep/nested/file.ts'), 'utf-8');
      expect(written).toBe('ok');
    });

    it('Given a path traversal attempt, When writing, Then throws path traversal error', async () => {
      const tool = mcp.tools.find(t => t.name === 'write_file')!;
      await expect(tool.execute({ path: '../../evil.ts', content: 'x' })).rejects.toThrow('traversal');
    });
  });

  describe('list_files tool', () => {
    it('When listing a directory, Then returns entries with name and isDirectory', async () => {
      fs.writeFileSync(path.join(tmpDir, 'a.ts'), '');
      fs.mkdirSync(path.join(tmpDir, 'subdir'));
      const tool = mcp.tools.find(t => t.name === 'list_files')!;
      const result = await tool.execute({ path: '.' }) as { name: string; isDirectory: boolean }[];
      const names = result.map(e => e.name);
      expect(names).toContain('a.ts');
      expect(names).toContain('subdir');
      const subdir = result.find(e => e.name === 'subdir')!;
      expect(subdir.isDirectory).toBe(true);
    });
  });

  describe('file_exists tool', () => {
    it('Given an existing file, Then returns { exists: true }', async () => {
      fs.writeFileSync(path.join(tmpDir, 'exists.ts'), '');
      const tool = mcp.tools.find(t => t.name === 'file_exists')!;
      const result = await tool.execute({ path: 'exists.ts' }) as { exists: boolean };
      expect(result.exists).toBe(true);
    });

    it('Given a missing file, Then returns { exists: false }', async () => {
      const tool = mcp.tools.find(t => t.name === 'file_exists')!;
      const result = await tool.execute({ path: 'nope.ts' }) as { exists: boolean };
      expect(result.exists).toBe(false);
    });
  });
});