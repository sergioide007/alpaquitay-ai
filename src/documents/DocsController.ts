import * as fs from 'fs/promises';
import * as nodePath from 'path';
import type { AIProvider } from '../core/interfaces';
import { isSmallModel } from '../prompts/codeUtils';
import { guardWrite } from '../core/harness/PolicyGuard';
import { isUsableRoot } from '../core/WorkspaceRoot';
import { LoadedDocument, ProposedChange } from './DocumentModel';
import { CONFIRM_ABOVE_CALLS, DocOp, classifyInstruction, estimateCalls, proposeEdits, runAnalysis } from './DocumentAgent';
import { ExportFormat, applyChanges, detectFormat, exportDocument, loadDocument, SUPPORTED_EXTS } from './Documents';
import { wordDiff } from './TextUtils';

export interface DocsHooks {
  post(msg: Record<string, unknown>): void;
  getProvider(): AIProvider | null;
  workspaceRoot: string;
  econLlm?(promptChars: number, completionChars: number): void | Promise<void>;
  trackDebt?(reason: string): void | Promise<void>;
  log?(input: string, chip: string, extra?: Record<string, string>): void | Promise<void>;
  now?(): Date;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Docs tab back end. Same contract as the rest of Alpaquitay: the agent PROPOSES, the human APPROVES,
 * the harness WRITES (new file by default, backup before overwrite), then VERIFIES by re-reading the result.
 */
export class DocsController {
  private doc: LoadedDocument | undefined;
  private proposed = new Map<string, ProposedChange>();
  private lastRun: { op: DocOp } | undefined;
  private report: { title: string; markdown: string } | undefined;
  private busy = false;
  private stop = false;
  private llmCalls = 0;

  constructor(private readonly h: DocsHooks) {}

  private now(): Date { return this.h.now ? this.h.now() : new Date(); }
  private post(m: Record<string, unknown>): void { this.h.post(m); }
  private fail(e: unknown): void { this.busy = false; this.post({ type: 'docs-busy', busy: false }); this.post({ type: 'docs-error', error: e instanceof Error ? e.message : String(e) }); }

  cancel(): void { this.stop = true; }

  info(): Record<string, unknown> | null {
    const d = this.doc; if (!d) { return null; }
    return {
      path: d.path, name: d.name, format: d.format, title: d.title, author: d.author, readOnly: d.readOnly, warnings: d.warnings,
      words: d.sections.reduce((n, s) => n + s.words, 0),
      protectedBlocks: d.blocks.filter(b => !b.editable).length,
      sections: d.sections.map(s => ({ id: s.id, title: s.title, words: s.words })),
    };
  }

  async open(path: string): Promise<void> {
    try {
      if (!detectFormat(path)) { throw new Error(`Unsupported file. Supported: ${SUPPORTED_EXTS.join(', ')}`); }
      const st = await fs.stat(path);
      if (!st.isFile()) { throw new Error('Not a file.'); }
      this.doc = loadDocument(path, await fs.readFile(path));
      this.proposed.clear(); this.report = undefined;
      this.post({ type: 'docs-doc', doc: this.info() });
      await this.h.log?.(`docs-open:${this.doc.name}`, `📄 Docs · ${this.doc.format}`, { stack: this.doc.format });
    } catch (e) { this.fail(e); }
  }

  async run(msg: { instruction: string; scope?: string; op?: DocOp; confirmed?: boolean }): Promise<void> {
    const doc = this.doc;
    if (!doc) { return this.fail(new Error('Open a document first.')); }
    if (this.busy) { return this.fail(new Error('The agent is still working. Cancel it or wait.')); }
    const instruction = (msg.instruction ?? '').trim();
    if (!instruction && !msg.op) { return this.fail(new Error('Tell the agent what to do with the document.')); }
    const provider = this.h.getProvider();
    if (!provider) { return this.fail(new Error('No AI provider available. Configure one in Settings (a local Ollama model keeps everything on your machine).')); }
    const scope = msg.scope && doc.sections.some(s => s.id === msg.scope) ? msg.scope : 'all';
    const req = classifyInstruction(instruction || msg.op!, scope, msg.op);
    const small = isSmallModel(provider.modelName);
    const calls = estimateCalls(doc, req, small);
    if (calls === 0) { return this.fail(new Error('Nothing to work on in that scope (all blocks are protected or empty).')); }
    if (calls > CONFIRM_ABOVE_CALLS && !msg.confirmed) {
      this.post({ type: 'docs-confirm', calls, op: req.op, local: provider.type === 'ollama' || provider.type === 'lmstudio', model: provider.modelName });
      return;
    }
    this.busy = true; this.stop = false; this.llmCalls = 0;
    this.post({ type: 'docs-busy', busy: true, op: req.op, mode: req.mode, calls });
    const deps = {
      provider, small, cancelled: () => this.stop,
      onProgress: (text: string, done: number, total: number) => this.post({ type: 'docs-progress', text, done, total }),
      onLlm: (p: number, c: number) => { this.llmCalls++; void this.h.econLlm?.(p, c); },
    };
    try {
      this.proposed.clear(); this.report = undefined;
      if (req.mode === 'edit') {
        const r = await proposeEdits(doc, req, deps);
        this.lastRun = { op: req.op };
        for (const c of r.changes) { this.proposed.set(c.id, c); }
        this.post({ type: 'docs-changes', op: req.op, model: r.model, calls: r.calls, warnings: r.warnings,
          changes: r.changes.map(c => ({ ...c, diff: wordDiff(c.before, c.after) })) });
      } else {
        const r = await runAnalysis(doc, req, deps);
        this.report = { title: r.title, markdown: r.markdown };
        this.post({ type: 'docs-report', op: req.op, title: r.title, markdown: r.markdown, warnings: r.warnings, calls: r.calls });
      }
      await this.h.log?.(`docs-${req.op}:${doc.name}`, `📄 Docs · ${req.op}`, { stack: doc.format });
    } catch (e) { this.fail(e); return; }
    this.busy = false; this.post({ type: 'docs-busy', busy: false });
  }

  async apply(msg: { ids: string[]; output: 'new' | 'overwrite'; trackChanges?: boolean }): Promise<void> {
    const doc = this.doc;
    try {
      if (!doc) { throw new Error('Open a document first.'); }
      const chosen = (msg.ids ?? []).map(id => this.proposed.get(id)).filter((c): c is ProposedChange => !!c);
      if (!chosen.length) { throw new Error('Select at least one change to apply.'); }
      const dir = nodePath.dirname(doc.path); const base = nodePath.basename(doc.path, nodePath.extname(doc.path));
      const overwrite = msg.output === 'overwrite' && !doc.readOnly;
      const changes = new Map(chosen.map(c => [c.id, c.after] as [string, string]));
      const date = this.now().toISOString();
      const built = applyChanges(doc, changes, { trackChanges: msg.trackChanges !== false, author: 'Alpaquitay AI', date });
      const outPath = overwrite ? doc.path : await nextFree(dir, `${base}.edited`, built.ext);
      const verdict = guardWrite(nodePath.basename(outPath));
      if (verdict.verdict === 'deny') { throw new Error(`Blocked by PolicyGuard: ${verdict.reason}`); }
      let backup = '';
      if (overwrite) { backup = await this.backup(doc.path); }
      await fs.writeFile(outPath, built.buffer);
      const problems = this.verify(outPath, built.buffer, chosen, doc);
      const ok = problems.length === 0;
      this.post({ type: 'docs-applied', path: outPath, name: nodePath.basename(outPath), applied: chosen.length, verified: ok, problems, backup, overwrite, trackChanges: doc.format === 'docx' && msg.trackChanges !== false });
      await this.h.log?.(`docs-apply:${doc.name}:${chosen.length}`, ok ? '✅ Docs · verified' : '⛔ Docs · verify failed', { checkpoint: backup || 'new-file', policy: verdict.verdict });
      await this.h.trackDebt?.(ok ? 'apply:docs' : 'dod-blocked:docs');
      if (overwrite) { this.doc = loadDocument(outPath, built.buffer); this.post({ type: 'docs-doc', doc: this.info() }); }
      for (const c of chosen) { this.proposed.delete(c.id); }
    } catch (e) { this.fail(e); }
  }

  /** Evidence: re-read what was written and check it parses and contains every accepted edit. */
  private verify(outPath: string, buf: Buffer, chosen: ProposedChange[], src: LoadedDocument): string[] {
    const problems: string[] = [];
    try {
      const re = loadDocument(outPath, buf);
      if (src.format !== 'pdf' && re.blocks.length !== src.blocks.length) { problems.push(`block count changed (${src.blocks.length} → ${re.blocks.length})`); }
      const texts = re.blocks.map(b => norm(b.text));
      const missing = chosen.filter(c => src.format !== 'pdf' ? !texts.includes(norm(c.after)) : !norm(re.text ?? '').includes(norm(c.after))).length;
      if (missing) { problems.push(`${missing} edit(s) not found in the written file`); }
    } catch (e) { problems.push(`written file could not be re-read: ${e instanceof Error ? e.message : String(e)}`); }
    return problems;
  }

  private async backup(path: string): Promise<string> {
    const stamp = this.now().toISOString().replace(/[:.]/g, '-');
    const ext = nodePath.extname(path); const base = nodePath.basename(path, ext);
    const dir = isUsableRoot(this.h.workspaceRoot) ? nodePath.join(this.h.workspaceRoot, '.alpaquitay', 'backups') : nodePath.dirname(path);
    await fs.mkdir(dir, { recursive: true });
    const dest = nodePath.join(dir, `${base}.${stamp}${ext}${dir === nodePath.dirname(path) ? '.bak' : ''}`);
    await fs.copyFile(path, dest);
    return dest;
  }

  async exportAs(format: ExportFormat): Promise<void> {
    try {
      const doc = this.doc; if (!doc) { throw new Error('Open a document first.'); }
      const out = exportDocument(doc, new Map(), format, this.now().toISOString());
      const p = await nextFree(nodePath.dirname(doc.path), `${nodePath.basename(doc.path, nodePath.extname(doc.path))}.exported`, out.ext);
      await fs.writeFile(p, out.buffer);
      this.post({ type: 'docs-exported', path: p, name: nodePath.basename(p) });
      await this.h.log?.(`docs-export:${doc.name}:${format}`, '📄 Docs · export', {});
    } catch (e) { this.fail(e); }
  }

  async saveReport(): Promise<void> {
    try {
      const doc = this.doc; if (!doc || !this.report) { throw new Error('There is no report to save.'); }
      const p = await nextFree(nodePath.dirname(doc.path), `${nodePath.basename(doc.path, nodePath.extname(doc.path))}.report`, '.md');
      await fs.writeFile(p, this.report.markdown, 'utf8');
      this.post({ type: 'docs-exported', path: p, name: nodePath.basename(p) });
    } catch (e) { this.fail(e); }
  }
}

async function nextFree(dir: string, base: string, ext: string): Promise<string> {
  for (let i = 1; i < 1000; i++) {
    const p = nodePath.join(dir, i === 1 ? `${base}${ext}` : `${base}-${i}${ext}`);
    try { await fs.access(p); } catch { return p; }
  }
  throw new Error('Could not find a free output file name.');
}
