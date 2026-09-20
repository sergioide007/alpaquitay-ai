import type { AIProvider } from '../core/interfaces';
import { DocBlock, DocSection, LoadedDocument, ProposedChange } from './DocumentModel';
import { changeRatio, changedWords } from './TextUtils';

export type DocOp = 'proofread' | 'style' | 'translate' | 'shorten' | 'expand' | 'custom'
  | 'summarize' | 'consistency' | 'outline' | 'feedback' | 'ask';
export interface DocRequest { op: DocOp; mode: 'edit' | 'analyze'; instruction: string; targetLang?: string; scope: string }

export const MAX_CALLS = 60;
export const CONFIRM_ABOVE_CALLS = 20;
const EDIT_OPS = new Set<DocOp>(['proofread', 'style', 'translate', 'shorten', 'expand', 'custom']);

const LANGS: Array<[RegExp, string]> = [
  [/ingl[eé]s|english/i, 'English'], [/espa[nñ]ol|spanish|castellano/i, 'Spanish'], [/franc[eé]s|french/i, 'French'],
  [/alem[aá]n|german/i, 'German'], [/italian/i, 'Italian'], [/portugu[eé]s|portuguese/i, 'Portuguese'], [/catal[aá]n|catalan/i, 'Catalan'],
];

/** Intent detection is deterministic (no LLM): it belongs to the Flash lane of the harness — free, instant, auditable. */
export function classifyInstruction(text: string, scope = 'all', forced?: DocOp): DocRequest {
  const t = text.trim();
  const mk = (op: DocOp, extra: Partial<DocRequest> = {}): DocRequest => ({ op, mode: EDIT_OPS.has(op) ? 'edit' : 'analyze', instruction: t, scope, ...extra });
  if (forced) { return mk(forced, forced === 'translate' ? { targetLang: langOf(t) } : {}); }
  if (/traduc|translate/i.test(t)) { return mk('translate', { targetLang: langOf(t) }); }
  if (/[ií]ndice|outline|estructura del|tabla de contenido|table of contents/i.test(t)) { return mk('outline'); }
  if (/resum|summar|sinopsis/i.test(t)) { return mk('summarize'); }
  if (/coherenc|consisten|contradic|continuidad|inconsisten/i.test(t)) { return mk('consistency'); }
  if (/feedback|cr[ií]tica|eval[uú]a|qu[eé] (le )?falta|edici[oó]n de desarrollo|developmental|opini[oó]n editorial/i.test(t)) { return mk('feedback'); }
  if (/corrig|ortograf|gram[aá]tic|proofread|typo|spell|erratas|puntuaci/i.test(t)) { return mk('proofread'); }
  if (/acort|reduc|condens|shorten|trim\b|conciso|concis/i.test(t)) { return mk('shorten'); }
  if (/ampli[ae]|expand|desarrolla m[aá]s|elabor/i.test(t)) { return mk('expand'); }
  if (/estilo|fluid|claridad|clarity|polish|pul[ie]|reescrib|rewrite|mejor[ae]|improve/i.test(t)) { return mk('style'); }
  if (/\?\s*$/.test(t) || /^(qu[eé]|c[oó]mo|por qu[eé]|cu[aá]l(es)?|qui[eé]n|d[oó]nde|cu[aá]ndo|what|how|why|which|who|where|when|is|are|does|do)\b/i.test(t)) { return mk('ask'); }
  return mk('custom');
}
const langOf = (t: string) => LANGS.find(([re]) => re.test(t.replace(/traduc\w*|translate/i, '')))?.[1] ?? 'English';

const INSTRUCTION: Record<string, (r: DocRequest) => string> = {
  proofread: () => 'Fix spelling, grammar, punctuation and typos ONLY. Do not rephrase, restyle or change vocabulary or meaning.',
  style: () => 'Improve clarity, rhythm and flow. Keep the author\'s voice, meaning, facts, names and terminology. Change as little as possible.',
  shorten: () => 'Tighten the wording to be roughly 20-30% shorter without losing any information.',
  expand: () => 'Develop the ideas a little with concrete, plausible detail consistent with the surrounding text. Do not invent facts, names or numbers.',
  translate: r => `Translate into ${r.targetLang ?? 'English'}. Keep names, numbers and markdown markers (*, **).`,
  custom: r => r.instruction,
};
const SYSTEM = 'You are a careful professional editor inside Alpaquitay AI. Edit ONLY what the instruction requires. Preserve the author\'s meaning, facts, names, numbers and inline markdown markers (*italic*, **bold**). Never add commentary, notes or explanations.';

const EDITABLE_KINDS = new Set(['paragraph', 'list', 'quote', 'heading']);
export function editableBlocks(doc: LoadedDocument, sec: DocSection, op: DocOp): DocBlock[] {
  const by = new Map(doc.blocks.map(b => [b.id, b]));
  return sec.blockIds.map(id => by.get(id)!).filter(b => b.editable && EDITABLE_KINDS.has(b.kind)
    && (b.kind !== 'heading' || op === 'translate' || op === 'proofread' || op === 'custom'));
}

export function batchBlocks(blocks: DocBlock[], maxChars: number): DocBlock[][] {
  const out: DocBlock[][] = []; let cur: DocBlock[] = []; let n = 0;
  for (const b of blocks) {
    if (cur.length && n + b.text.length > maxChars) { out.push(cur); cur = []; n = 0; }
    cur.push(b); n += b.text.length + 12;
  }
  if (cur.length) { out.push(cur); }
  return out;
}

export function buildEditPrompt(doc: LoadedDocument, sec: DocSection, batch: DocBlock[], req: DocRequest): string {
  const inst = (INSTRUCTION[req.op] ?? INSTRUCTION.custom)(req);
  return `Document: "${doc.title}"${doc.language ? ` (${doc.language})` : ''}\nChapter: "${sec.title}"\n\nINSTRUCTION: ${inst}\n\n` +
    'Below are numbered paragraphs. For every paragraph you change, output its marker on its own line, then the COMPLETE new paragraph text. ' +
    'Output nothing for paragraphs that need no change. Do not merge, split, reorder or drop paragraphs. Keep each paragraph a single paragraph. Reply with markers and text only.\n\n' +
    batch.map(b => `[[${b.id}]]\n${b.text}`).join('\n\n');
}

export function parseEditReply(reply: string, valid: Set<string>): Map<string, string> {
  const out = new Map<string, string>();
  const cleaned = reply.replace(/^```[a-z]*\s*$/gim, '');
  const re = /^[ \t]*\[\[\s*([A-Za-z0-9_.-]+)\s*\]\][ \t]*:?[ \t]*\n?/gm;
  const marks: Array<{ id: string; from: number; to: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned))) { marks.push({ id: m[1], from: m.index, to: m.index + m[0].length }); }
  marks.forEach((k, i) => {
    if (!valid.has(k.id)) { return; }
    const text = cleaned.slice(k.to, marks[i + 1]?.from ?? cleaned.length).trim();
    if (text) { out.set(k.id, text); }
  });
  return out;
}

const digits = (s: string) => (s.match(/\d+/g) ?? []).sort().join(',');
/** Risk gate (FABLE-5 B for documents): unusually large rewrites are never pre-selected. */
export function assessChange(op: DocOp, before: string, after: string): { risk: 'low' | 'review'; reason?: string } {
  const lr = after.length / Math.max(1, before.length);
  const cr = changeRatio(before, after);
  const cw = changedWords(before, after);
  if (op === 'proofread' && ((cw >= 4 && cr > 0.35) || lr < 0.8 || lr > 1.25)) { return { risk: 'review', reason: 'larger than a proofreading fix' }; }
  if (op === 'style' && ((cw >= 6 && cr > 0.7) || lr < 0.5 || lr > 1.6)) { return { risk: 'review', reason: 'heavy rewrite' }; }
  if (op !== 'translate' && op !== 'shorten' && op !== 'expand' && (lr < 0.3 || lr > 3)) { return { risk: 'review', reason: 'length changed a lot' }; }
  if ((op === 'proofread' || op === 'style') && digits(before) !== digits(after)) { return { risk: 'review', reason: 'numbers changed' }; }
  if (lr < 0.1 || lr > 6) { return { risk: 'review', reason: 'length changed a lot' }; }
  return { risk: 'low' };
}

export interface AgentRun { changes: ProposedChange[]; warnings: string[]; calls: number; model: string }
export interface AgentDeps { provider: AIProvider; small: boolean; cancelled: () => boolean; onProgress: (text: string, done: number, total: number) => void; onLlm: (promptChars: number, completionChars: number) => void }

const maxChars = (small: boolean) => small ? 2200 : 5000;
const scoped = (doc: LoadedDocument, scope: string) => scope === 'all' ? doc.sections : doc.sections.filter(s => s.id === scope);
const sectionText = (doc: LoadedDocument, s: DocSection) => { const by = new Map(doc.blocks.map(b => [b.id, b])); return s.blockIds.map(id => by.get(id)!.text).join('\n\n'); };

export function estimateCalls(doc: LoadedDocument, req: DocRequest, small: boolean): number {
  const secs = scoped(doc, req.scope);
  if (req.mode === 'edit') { return secs.reduce((n, s) => n + batchBlocks(editableBlocks(doc, s, req.op), maxChars(small)).length, 0); }
  if (req.op === 'ask') { return 1; }
  if (req.op === 'outline') { return Math.max(1, Math.ceil(secs.length / 12)); }
  return secs.length + (secs.length > 1 ? 1 : 0);
}

async function call(d: AgentDeps, system: string, user: string, maxTokens: number): Promise<string> {
  const r = await d.provider.chat([{ role: 'user', content: user }], { systemPrompt: system, maxTokens, temperature: 0.2 });
  d.onLlm(system.length + user.length, r.content.length);
  return r.content;
}

export async function proposeEdits(doc: LoadedDocument, req: DocRequest, d: AgentDeps): Promise<AgentRun> {
  const warnings: string[] = []; const changes: ProposedChange[] = []; let calls = 0; let fails = 0;
  const plan = scoped(doc, req.scope).map(s => ({ s, batches: batchBlocks(editableBlocks(doc, s, req.op), maxChars(d.small)) }));
  const total = plan.reduce((n, p) => n + p.batches.length, 0);
  if (total > MAX_CALLS) { throw new Error(`This run needs ${total} model calls (limit ${MAX_CALLS}). Pick a chapter or a narrower instruction.`); }
  let model = d.provider.modelName;
  outer: for (const { s, batches } of plan) {
    for (const batch of batches) {
      if (d.cancelled()) { warnings.push('Cancelled: partial results kept.'); break outer; }
      d.onProgress(`${s.title}`, calls, total);
      const chars = batch.reduce((n, b) => n + b.text.length, 0);
      try {
        const reply = await call(d, SYSTEM, buildEditPrompt(doc, s, batch, req), Math.min(4096, Math.ceil(chars / 2.2) + 300));
        calls++; fails = 0;
        const parsed = parseEditReply(reply, new Set(batch.map(b => b.id)));
        for (const b of batch) {
          const after = parsed.get(b.id);
          if (after === undefined || after.trim() === b.text.trim()) { continue; }
          const risk = assessChange(req.op, b.text, after);
          changes.push({ id: b.id, sectionId: s.id, sectionTitle: s.title, before: b.text, after, ...risk });
        }
      } catch (e) {
        calls++; fails++;
        warnings.push(`"${s.title}": ${e instanceof Error ? e.message : String(e)}`);
        if (fails >= 3) { warnings.push('Stopped after 3 consecutive model errors.'); break outer; }
      }
    }
  }
  d.onProgress('done', total, total);
  model = d.provider.modelName || model;
  return { changes, warnings, calls, model };
}

const REPORT_SYS = 'You are a senior book editor. Be specific, concise and honest. Reply in the same language as the user\'s instruction. Use short Markdown.';

export async function runAnalysis(doc: LoadedDocument, req: DocRequest, d: AgentDeps): Promise<{ title: string; markdown: string; calls: number; warnings: string[] }> {
  const secs = scoped(doc, req.scope); const warnings: string[] = []; let calls = 0;
  const est = estimateCalls(doc, req, d.small);
  if (est > MAX_CALLS) { throw new Error(`This analysis needs ${est} model calls (limit ${MAX_CALLS}). Select a chapter.`); }
  const step = async (label: string, user: string, tokens = 700) => {
    if (d.cancelled()) { throw new Error('Cancelled'); }
    d.onProgress(label, calls, est); calls++;
    return call(d, REPORT_SYS, user, tokens);
  };
  const clip = (s: string) => s.length > 6000 ? s.slice(0, 6000) + '\n[…]' : s;
  const ask = req.instruction;
  if (req.op === 'ask') {
    const words = new Set((ask.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []));
    const ranked = secs.map(s => ({ s, t: sectionText(doc, s) })).map(x => ({ ...x, score: [...words].filter(w => x.t.toLowerCase().includes(w)).length })).sort((a, b) => b.score - a.score).slice(0, 3);
    const ctx = ranked.map(x => `## ${x.s.title}\n${clip(x.t).slice(0, 2500)}`).join('\n\n');
    const md = await step('Answering', `Book: "${doc.title}". Answer the question using ONLY these excerpts; say if they are not enough and cite chapter titles.\n\n${ctx}\n\nQUESTION: ${ask}`);
    return { title: 'Answer', markdown: md, calls, warnings };
  }
  if (req.op === 'outline') {
    const lines: string[] = [];
    for (let i = 0; i < secs.length; i += 12) {
      const group = secs.slice(i, i + 12);
      const md = await step('Outlining', `List each chapter as "N. Title — one sentence (max 20 words) on what it covers". Use these excerpts:\n\n${group.map((s, k) => `### ${i + k + 1}. ${s.title}\n${sectionText(doc, s).slice(0, 500)}`).join('\n\n')}`, 900);
      lines.push(md.trim());
    }
    return { title: `Outline — ${doc.title}`, markdown: `# Outline — ${doc.title}\n\n${lines.join('\n')}\n`, calls, warnings };
  }
  const per = async (label: string, prompt: (s: DocSection, t: string) => string) => {
    const out: Array<{ s: DocSection; md: string }> = [];
    for (const s of secs) {
      try { out.push({ s, md: (await step(`${label}: ${s.title}`, prompt(s, clip(sectionText(doc, s))), 500)).trim() }); }
      catch (e) { if (e instanceof Error && e.message === 'Cancelled') { warnings.push('Cancelled: partial results kept.'); break; } warnings.push(`"${s.title}": ${e instanceof Error ? e.message : String(e)}`); }
    }
    return out;
  };
  if (req.op === 'summarize') {
    const parts = await per('Summarizing', (s, t) => `Summarize this chapter in at most 120 words.\n\n## ${s.title}\n${t}`);
    if (parts.length <= 1) { return { title: `Summary — ${doc.title}`, markdown: `# Summary — ${doc.title}\n\n${parts[0]?.md ?? ''}\n`, calls, warnings }; }
    const overall = await step('Combining', `Write a cohesive summary of the whole work in at most 200 words from these chapter summaries.\n\n${parts.map(p => `## ${p.s.title}\n${p.md}`).join('\n\n')}`, 600);
    return { title: `Summary — ${doc.title}`, markdown: `# Summary — ${doc.title}\n\n${overall.trim()}\n\n## By chapter\n\n${parts.map(p => `### ${p.s.title}\n${p.md}`).join('\n\n')}\n`, calls, warnings };
  }
  if (req.op === 'consistency') {
    const sheets = await per('Reading', (s, t) => `Extract a compact fact sheet from this chapter: characters (with traits), places, dates/timeline, key terms and any concrete claims. Bullets only.\n\n## ${s.title}\n${t}`);
    const all = sheets.map(p => `## ${p.s.title}\n${p.md}`).join('\n\n').slice(0, 12000);
    if (sheets.length <= 1) { return { title: `Consistency — ${doc.title}`, markdown: `# Consistency — ${doc.title}\n\nSelect the whole book (more than one chapter) to compare chapters.\n\n${all}\n`, calls, warnings }; }
    const md = await step('Cross-checking', `Compare these fact sheets and list possible inconsistencies (names, ages, dates, places, terminology, contradictions). For each: what, where (chapter titles), suggested fix. If none, say so.\n\n${all}`, 1100);
    return { title: `Consistency — ${doc.title}`, markdown: `# Consistency check — ${doc.title}\n\n${md.trim()}\n`, calls, warnings };
  }
  // feedback
  const notes = await per('Reviewing', (s, t) => `${ask}\n\nGive developmental editing notes for this chapter: 2 strengths, up to 3 problems (pacing, clarity, structure, voice), and 2 concrete suggestions.\n\n## ${s.title}\n${t}`);
  let overall = '';
  if (notes.length > 1) { overall = (await step('Prioritizing', `From these chapter notes, list the 5 highest-priority revisions for the whole work.\n\n${notes.map(p => `## ${p.s.title}\n${p.md}`).join('\n\n').slice(0, 10000)}`, 600)).trim(); }
  return { title: `Editorial feedback — ${doc.title}`, markdown: `# Editorial feedback — ${doc.title}\n\n${overall ? `## Top priorities\n\n${overall}\n\n` : ''}${notes.map(p => `## ${p.s.title}\n${p.md}`).join('\n\n')}\n`, calls, warnings };
}
