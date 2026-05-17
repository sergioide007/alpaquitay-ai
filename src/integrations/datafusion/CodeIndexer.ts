import * as fs from 'fs';
import * as path from 'path';
import { BaseIntegration } from '../BaseIntegration';
import { ICodeIndexIntegration, IntegrationMetadata, CodeSymbol, IndexQuery } from '../interfaces';

/**
 * DataFusion-inspired code indexer.
 *
 * Provides SQL-like querying over workspace symbols without needing a Rust
 * binary or WASM bundle. Uses an inverted index stored in
 * .alpaquitay/code-index.json for persistence between sessions.
 *
 * Architecture (single-responsibility layers):
 *   SymbolExtractor  — language-specific regex parsers
 *   InvertedIndex    — token → symbol[] map for fast lookups
 *   IndexPersistence — read/write the index to disk
 *   CodeIndexer      — orchestrates the layers + exposes ICodeIndexIntegration
 */

// ── Symbol extraction ─────────────────────────────────────────────────────────

interface LangPattern {
  kind: CodeSymbol['kind'];
  pattern: RegExp;
  nameGroup: number;
  modifiersGroup?: number;
}

const LANG_PATTERNS: Record<string, LangPattern[]> = {
  java: [
    { kind: 'class',     pattern: /^(\s*)(public|protected|private|abstract|final|\s)*class\s+(\w+)/gm,     nameGroup: 3, modifiersGroup: 2 },
    { kind: 'interface', pattern: /^(\s*)(public|protected)?\s*interface\s+(\w+)/gm,                         nameGroup: 3 },
    { kind: 'enum',      pattern: /^(\s*)(public|protected)?\s*enum\s+(\w+)/gm,                              nameGroup: 3 },
    { kind: 'method',    pattern: /^\s+(public|protected|private|static|final|\s)+\w[\w<>,\s]+\s+(\w+)\s*\(/gm, nameGroup: 2, modifiersGroup: 1 },
    { kind: 'field',     pattern: /^\s+(private|protected|public|static|final|\s)+\w[\w<>]+\s+(\w+)\s*[;=]/gm, nameGroup: 2 },
  ],
  typescript: [
    { kind: 'class',     pattern: /^(export\s+)?(abstract\s+)?class\s+(\w+)/gm,       nameGroup: 3 },
    { kind: 'interface', pattern: /^(export\s+)?interface\s+(\w+)/gm,                  nameGroup: 2 },
    { kind: 'function',  pattern: /^(export\s+)?(async\s+)?function\s+(\w+)/gm,        nameGroup: 3 },
    { kind: 'constant',  pattern: /^(export\s+)?const\s+(\w+)/gm,                      nameGroup: 2 },
  ],
  python: [
    { kind: 'class',    pattern: /^class\s+(\w+)/gm,        nameGroup: 1 },
    { kind: 'function', pattern: /^def\s+(\w+)/gm,          nameGroup: 1 },
    { kind: 'function', pattern: /^\s{4}def\s+(\w+)/gm,     nameGroup: 1 },
  ],
  csharp: [
    { kind: 'class',     pattern: /^\s*(public|internal|protected|private|abstract|sealed|\s)*class\s+(\w+)/gm, nameGroup: 2 },
    { kind: 'interface', pattern: /^\s*(public|internal)?\s*interface\s+(I\w+)/gm,                              nameGroup: 2 },
    { kind: 'method',    pattern: /^\s+(public|private|protected|static|virtual|override|\s)+\w[\w<>]+\s+(\w+)\s*\(/gm, nameGroup: 2 },
  ],
};

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.java': 'java', '.ts': 'typescript', '.tsx': 'typescript',
    '.js': 'javascript', '.jsx': 'javascript',
    '.py': 'python', '.cs': 'csharp', '.go': 'go',
  };
  return map[ext] ?? 'other';
}

export function extractSymbols(filePath: string, content: string): CodeSymbol[] {
  const language = detectLanguage(filePath);
  const patterns = LANG_PATTERNS[language] ?? [];
  const symbols: CodeSymbol[] = [];

  for (const lp of patterns) {
    let match: RegExpExecArray | null;
    const re = new RegExp(lp.pattern.source, lp.pattern.flags);
    while ((match = re.exec(content)) !== null) {
      const name = match[lp.nameGroup]?.trim();
      if (!name) { continue; }

      const lineNumber = content.slice(0, match.index).split('\n').length;
      const modifiers = lp.modifiersGroup
        ? (match[lp.modifiersGroup] ?? '').trim().split(/\s+/).filter(Boolean)
        : [];

      symbols.push({ file: filePath, name, kind: lp.kind, line: lineNumber, language, modifiers });
    }
  }

  return symbols;
}

// ── Inverted index ────────────────────────────────────────────────────────────

export class InvertedIndex {
  private readonly tokenMap = new Map<string, Set<number>>();
  private readonly symbols: CodeSymbol[] = [];

  add(symbol: CodeSymbol): void {
    const idx = this.symbols.push(symbol) - 1;
    for (const token of this.tokenize(symbol.name)) {
      if (!this.tokenMap.has(token)) { this.tokenMap.set(token, new Set()); }
      this.tokenMap.get(token)!.add(idx);
    }
  }

  search(query: IndexQuery): CodeSymbol[] {
    let candidates = this.symbols;

    if (query.kind)      { candidates = candidates.filter(s => s.kind === query.kind); }
    if (query.language)  { candidates = candidates.filter(s => s.language === query.language); }
    if (query.file)      { candidates = candidates.filter(s => s.file.includes(query.file!)); }
    if (query.modifiers) {
      const required = query.modifiers;
      candidates = candidates.filter(s => required.every(m => s.modifiers.includes(m)));
    }
    if (query.nameLike) {
      const lower = query.nameLike.toLowerCase();
      candidates = candidates.filter(s => s.name.toLowerCase().includes(lower));
    }

    return candidates;
  }

  grep(pattern: string, options: { caseSensitive?: boolean } = {}): number[] {
    const flags = options.caseSensitive ? '' : 'i';
    const re = new RegExp(pattern, flags);
    return this.symbols
      .map((s, i) => (re.test(s.name) ? i : -1))
      .filter(i => i >= 0);
  }

  clear(): void {
    this.symbols.length = 0;
    this.tokenMap.clear();
  }

  toJSON(): CodeSymbol[] { return [...this.symbols]; }

  static fromJSON(symbols: CodeSymbol[]): InvertedIndex {
    const idx = new InvertedIndex();
    symbols.forEach(s => idx.add(s));
    return idx;
  }

  private tokenize(name: string): string[] {
    // Split on camelCase, PascalCase, underscores, digits
    return name
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .split(/[\s_\-./]+/)
      .map(t => t.toLowerCase())
      .filter(t => t.length > 1);
  }
}

// ── Persistence ───────────────────────────────────────────────────────────────

const INDEX_FILENAME = '.alpaquitay/code-index.json';
const MANIFEST_FILENAME = '.alpaquitay/index-manifest.json';

export class IndexPersistence {
  static load(workspacePath: string): { symbols: CodeSymbol[]; manifest: Record<string, number> } {
    try {
      const idxPath = path.join(workspacePath, INDEX_FILENAME);
      const mfPath  = path.join(workspacePath, MANIFEST_FILENAME);
      const symbols = JSON.parse(fs.readFileSync(idxPath, 'utf8')) as CodeSymbol[];
      const manifest = JSON.parse(fs.readFileSync(mfPath, 'utf8')) as Record<string, number>;
      return { symbols, manifest };
    } catch {
      return { symbols: [], manifest: {} };
    }
  }

  static save(workspacePath: string, symbols: CodeSymbol[], manifest: Record<string, number>): void {
    const dir = path.join(workspacePath, '.alpaquitay');
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    fs.writeFileSync(path.join(workspacePath, INDEX_FILENAME), JSON.stringify(symbols), 'utf8');
    fs.writeFileSync(path.join(workspacePath, MANIFEST_FILENAME), JSON.stringify(manifest), 'utf8');
  }
}

// ── CodeIndexer integration ───────────────────────────────────────────────────

export class CodeIndexer extends BaseIntegration implements ICodeIndexIntegration {
  readonly metadata: IntegrationMetadata = {
    id: 'datafusion',
    name: 'DataFusion Code Indexer',
    category: 'knowledge',
    description: 'SQL-like search over workspace symbols — incremental, persistent, language-aware',
    requiredSecrets: [],
  };

  private invertedIndex = new InvertedIndex();
  private manifest: Record<string, number> = {};  // file → last-modified timestamp
  private maxResults = 50;

  constructor(maxResults?: number) {
    super();
    if (maxResults) { this.maxResults = maxResults; }
  }

  protected async onInitialize(): Promise<void> { /* no network call needed */ }

  // ── ICodeIndexIntegration ─────────────────────────────────────────────────

  async index(workspacePath: string): Promise<{ indexed: number; updated: number }> {
    const loaded = IndexPersistence.load(workspacePath);
    this.invertedIndex = InvertedIndex.fromJSON(loaded.symbols);
    this.manifest = loaded.manifest;

    const files = this.walkSourceFiles(workspacePath);
    let indexed = 0;
    let updated = 0;

    for (const filePath of files) {
      let mtime = 0;
      try { mtime = fs.statSync(filePath).mtimeMs; } catch { continue; }

      const rel = path.relative(workspacePath, filePath).replace(/\\/g, '/');
      if (this.manifest[rel] === mtime) { continue; }

      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const symbols = extractSymbols(rel, content);
        // Remove stale symbols for this file then re-add
        const fresh = InvertedIndex.fromJSON(
          this.invertedIndex.toJSON().filter(s => s.file !== rel)
        );
        symbols.forEach(s => fresh.add(s));
        this.invertedIndex = fresh;
        this.manifest[rel] = mtime;
        indexed += symbols.length;
        updated++;
      } catch { /* skip unreadable files */ }
    }

    IndexPersistence.save(workspacePath, this.invertedIndex.toJSON(), this.manifest);
    return { indexed, updated };
  }

  async search(query: IndexQuery): Promise<CodeSymbol[]> {
    return this.invertedIndex.search(query).slice(0, this.maxResults);
  }

  async grep(
    pattern: string,
    options: { caseSensitive?: boolean; language?: string } = {}
  ): Promise<{ file: string; line: number; text: string }[]> {
    const matches = this.invertedIndex.grep(pattern, options);
    const all = this.invertedIndex.toJSON();
    return matches
      .map(i => all[i])
      .filter(s => !options.language || s.language === options.language)
      .slice(0, this.maxResults)
      .map(s => ({ file: s.file, line: s.line, text: `${s.kind} ${s.name}` }));
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private walkSourceFiles(workspacePath: string): string[] {
    const results: string[] = [];
    const IGNORED = new Set(['node_modules', '.git', 'dist', 'out', 'build', 'coverage', '.alpaquitay']);
    const SOURCE_EXTS = new Set(['.java', '.ts', '.tsx', '.js', '.jsx', '.py', '.cs', '.go', '.rs', '.kt']);

    const walk = (dir: string) => {
      let entries: fs.Dirent[] = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

      for (const entry of entries) {
        if (IGNORED.has(entry.name)) { continue; }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (SOURCE_EXTS.has(path.extname(entry.name).toLowerCase())) {
          results.push(full);
        }
      }
    };

    walk(workspacePath);
    return results;
  }
}
