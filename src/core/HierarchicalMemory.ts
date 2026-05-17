import { MCPExecutor } from './interfaces';

// ── Memory level types ────────────────────────────────────────────────────────

export type MemoryLevel =
  | 'project'
  | 'component'
  | 'module'
  | 'section'
  | 'feature'
  | 'package'
  | 'class'
  | 'method'
  | 'instruction'
  | 'annotation'
  | 'keyvalue'
  | 'config';

export interface MemoryEntry {
  level: MemoryLevel;
  key: string;
  value: string;
  /** ISO timestamp of last update */
  updatedAt: string;
  /** Optional parent key for tree traversal (e.g. class key for a method entry) */
  parentKey?: string;
  /** Arbitrary tags for search/filtering */
  tags?: string[];
}

export interface MemoryStore {
  version: 1;
  entries: MemoryEntry[];
}

// ── HierarchicalMemory ────────────────────────────────────────────────────────

const MEMORY_FILE = '.alpaquitay/memory.json';
const LEVEL_ORDER: MemoryLevel[] = [
  'project', 'component', 'module', 'section', 'feature',
  'package', 'class', 'method', 'instruction', 'annotation', 'keyvalue', 'config'
];

export class HierarchicalMemory {
  private store: MemoryStore = { version: 1, entries: [] };
  private dirty = false;

  constructor(private readonly mcp: MCPExecutor) {}

  // ── Persistence ─────────────────────────────────────────────────────────────

  async load(): Promise<void> {
    try {
      const file = await this.mcp.executeTool('filesystem', 'read_file', { path: MEMORY_FILE }) as { content: string };
      const parsed = JSON.parse(file.content) as MemoryStore;
      if (parsed.version === 1 && Array.isArray(parsed.entries)) {
        this.store = parsed;
      }
    } catch {
      this.store = { version: 1, entries: [] };
    }
    this.dirty = false;
  }

  async save(): Promise<void> {
    if (!this.dirty) { return; }
    try {
      await this.mcp.executeTool('filesystem', 'write_file', {
        path: MEMORY_FILE,
        content: JSON.stringify(this.store, null, 2)
      });
      this.dirty = false;
    } catch {
      // Non-fatal: memory persists in-session even if write fails
    }
  }

  // ── Write ────────────────────────────────────────────────────────────────────

  set(level: MemoryLevel, key: string, value: string, opts: { parentKey?: string; tags?: string[] } = {}): void {
    const existing = this.store.entries.findIndex(e => e.level === level && e.key === key);
    const entry: MemoryEntry = {
      level, key, value,
      updatedAt: new Date().toISOString(),
      ...(opts.parentKey ? { parentKey: opts.parentKey } : {}),
      ...(opts.tags?.length ? { tags: opts.tags } : {})
    };
    if (existing >= 0) {
      this.store.entries[existing] = entry;
    } else {
      this.store.entries.push(entry);
    }
    this.dirty = true;
  }

  delete(level: MemoryLevel, key: string): void {
    const before = this.store.entries.length;
    this.store.entries = this.store.entries.filter(e => !(e.level === level && e.key === key));
    if (this.store.entries.length !== before) { this.dirty = true; }
  }

  // ── Read ─────────────────────────────────────────────────────────────────────

  get(level: MemoryLevel, key: string): MemoryEntry | undefined {
    return this.store.entries.find(e => e.level === level && e.key === key);
  }

  getLevel(level: MemoryLevel): MemoryEntry[] {
    return this.store.entries.filter(e => e.level === level);
  }

  getChildren(parentKey: string): MemoryEntry[] {
    return this.store.entries.filter(e => e.parentKey === parentKey);
  }

  search(query: string): MemoryEntry[] {
    const q = query.toLowerCase();
    return this.store.entries.filter(e =>
      e.key.toLowerCase().includes(q) ||
      e.value.toLowerCase().includes(q) ||
      e.tags?.some(t => t.toLowerCase().includes(q))
    );
  }

  // ── Context builder ──────────────────────────────────────────────────────────

  /**
   * Build a compact context string from selected levels for prompt injection.
   * Ordered from broadest (project) to most specific (method).
   */
  buildContext(levels?: MemoryLevel[]): string {
    const selected = (levels ?? LEVEL_ORDER).filter(l => LEVEL_ORDER.includes(l));
    const lines: string[] = [];

    for (const level of selected) {
      const entries = this.getLevel(level);
      if (entries.length === 0) { continue; }
      lines.push(`### ${level.toUpperCase()}`);
      for (const e of entries) {
        lines.push(`- ${e.key}: ${e.value}`);
      }
    }

    return lines.join('\n');
  }

  // ── Code extraction helpers ──────────────────────────────────────────────────

  /**
   * Parse generated code and automatically record classes and top-level functions
   * into the memory store so future generations maintain naming consistency.
   */
  extractFromCode(filePath: string, code: string, language: string): void {
    const lang = language.toLowerCase();

    if (lang === 'typescript' || lang === 'javascript' || lang === 'tsx' || lang === 'jsx') {
      this._extractJS(filePath, code);
    } else if (lang === 'python') {
      this._extractPython(filePath, code);
    } else if (lang === 'java' || lang === 'kotlin') {
      this._extractJava(filePath, code);
    }

    this.dirty = true;
  }

  private _extractJS(filePath: string, code: string): void {
    // Classes
    for (const m of code.matchAll(/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/gm)) {
      this.set('class', m[1], filePath, { tags: ['auto'] });
    }
    // Exported functions
    for (const m of code.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)) {
      this.set('method', m[1], filePath, { tags: ['exported', 'auto'] });
    }
    // Interfaces / types
    for (const m of code.matchAll(/^export\s+(?:interface|type)\s+(\w+)/gm)) {
      this.set('annotation', m[1], filePath, { tags: ['type', 'auto'] });
    }
  }

  private _extractPython(filePath: string, code: string): void {
    for (const m of code.matchAll(/^class\s+(\w+)/gm)) {
      this.set('class', m[1], filePath, { tags: ['auto'] });
    }
    for (const m of code.matchAll(/^def\s+(\w+)/gm)) {
      this.set('method', m[1], filePath, { tags: ['auto'] });
    }
  }

  private _extractJava(filePath: string, code: string): void {
    for (const m of code.matchAll(/^(?:public\s+|private\s+|protected\s+)?(?:abstract\s+)?class\s+(\w+)/gm)) {
      this.set('class', m[1], filePath, { tags: ['auto'] });
    }
    for (const m of code.matchAll(/^\s+(?:public|private|protected)\s+(?:static\s+)?(?:\w+\s+)+(\w+)\s*\(/gm)) {
      this.set('method', m[1], filePath, { tags: ['auto'] });
    }
  }

  // ── Snapshot ─────────────────────────────────────────────────────────────────

  snapshot(): MemoryStore {
    return JSON.parse(JSON.stringify(this.store)) as MemoryStore;
  }

  clear(level?: MemoryLevel): void {
    if (level) {
      this.store.entries = this.store.entries.filter(e => e.level !== level);
    } else {
      this.store.entries = [];
    }
    this.dirty = true;
  }
}