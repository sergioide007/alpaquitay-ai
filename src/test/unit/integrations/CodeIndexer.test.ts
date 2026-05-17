import { extractSymbols, InvertedIndex, CodeIndexer } from '../../../integrations/datafusion/CodeIndexer';
import { SecretVault } from '../../../secrets/SecretVault';

function mockVault(): SecretVault {
  return {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn(), delete: jest.fn(),
    has: jest.fn().mockResolvedValue(true),
    getAll: jest.fn().mockResolvedValue({}),
    child: jest.fn(),
  } as never;
}

// ── extractSymbols ────────────────────────────────────────────────────────────

describe('extractSymbols', () => {
  it('extracts Java class names', () => {
    const content = `package com.example;\npublic class PersonaService {\n}`;
    const symbols = extractSymbols('PersonaService.java', content);
    expect(symbols.some(s => s.name === 'PersonaService' && s.kind === 'class')).toBe(true);
  });

  it('extracts TypeScript interfaces', () => {
    const content = `export interface IUserRepository {\n  findById(id: string): Promise<User>;\n}`;
    const symbols = extractSymbols('IUserRepository.ts', content);
    expect(symbols.some(s => s.name === 'IUserRepository' && s.kind === 'interface')).toBe(true);
  });

  it('extracts Python class and function', () => {
    const content = `class UserService:\n    def find_user(self):\n        pass`;
    const symbols = extractSymbols('user_service.py', content);
    expect(symbols.some(s => s.name === 'UserService' && s.kind === 'class')).toBe(true);
    expect(symbols.some(s => s.name === 'find_user')).toBe(true);
  });

  it('sets the correct language from extension', () => {
    const content = `export class Foo {}`;
    const symbols = extractSymbols('Foo.ts', content);
    expect(symbols[0].language).toBe('typescript');
  });

  it('returns empty array for unknown extension', () => {
    const symbols = extractSymbols('config.yml', 'key: value');
    expect(symbols).toHaveLength(0);
  });
});

// ── InvertedIndex ─────────────────────────────────────────────────────────────

describe('InvertedIndex', () => {
  function buildIndex() {
    const idx = new InvertedIndex();
    idx.add({ file: 'svc/UserService.java', name: 'UserService', kind: 'class',    line: 1, language: 'java', modifiers: ['public'] });
    idx.add({ file: 'svc/UserService.java', name: 'findById',    kind: 'method',   line: 5, language: 'java', modifiers: ['public'] });
    idx.add({ file: 'repo/UserRepo.java',   name: 'UserRepo',    kind: 'interface', line: 1, language: 'java', modifiers: ['public'] });
    idx.add({ file: 'ctrl/UserCtrl.ts',     name: 'UserCtrl',    kind: 'class',    line: 1, language: 'typescript', modifiers: [] });
    return idx;
  }

  it('search by kind returns matching symbols', () => {
    const idx = buildIndex();
    const classes = idx.search({ kind: 'class' });
    expect(classes.every(s => s.kind === 'class')).toBe(true);
    expect(classes.length).toBe(2);
  });

  it('search by nameLike does substring match', () => {
    const idx = buildIndex();
    const results = idx.search({ nameLike: 'User' });
    expect(results.length).toBeGreaterThanOrEqual(3);
  });

  it('search by language filters correctly', () => {
    const idx = buildIndex();
    const ts = idx.search({ language: 'typescript' });
    expect(ts.every(s => s.language === 'typescript')).toBe(true);
    expect(ts.length).toBe(1);
  });

  it('search by file does substring match on path', () => {
    const idx = buildIndex();
    const results = idx.search({ file: 'svc/' });
    expect(results.every(s => s.file.includes('svc/'))).toBe(true);
  });

  it('search by modifiers requires all listed modifiers', () => {
    const idx = buildIndex();
    const public_ = idx.search({ modifiers: ['public'] });
    expect(public_.every(s => s.modifiers.includes('public'))).toBe(true);
  });

  it('grep matches by regex on symbol name', () => {
    const idx = buildIndex();
    const hits = idx.grep('Service$');
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  it('toJSON / fromJSON roundtrips correctly', () => {
    const idx = buildIndex();
    const json = idx.toJSON();
    const restored = InvertedIndex.fromJSON(json);
    expect(restored.search({ kind: 'class' }).length).toBe(idx.search({ kind: 'class' }).length);
  });
});

// ── CodeIndexer integration ───────────────────────────────────────────────────

describe('CodeIndexer', () => {
  it('initializes without error (no required secrets)', async () => {
    const indexer = new CodeIndexer();
    await expect(indexer.initialize(mockVault())).resolves.not.toThrow();
    expect(await indexer.isAvailable()).toBe(true);
  });

  it('search returns empty array before any index call', async () => {
    const indexer = new CodeIndexer();
    await indexer.initialize(mockVault());
    const results = await indexer.search({ kind: 'class' });
    expect(results).toEqual([]);
  });

  it('grep returns empty array before indexing', async () => {
    const indexer = new CodeIndexer();
    await indexer.initialize(mockVault());
    const results = await indexer.grep('Service');
    expect(results).toEqual([]);
  });
});
