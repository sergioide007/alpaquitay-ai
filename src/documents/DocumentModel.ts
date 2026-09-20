import type { ZipEntry } from './ZipLite';
import { countWords } from './TextUtils';

export type DocFormat = 'md' | 'txt' | 'docx' | 'epub' | 'pdf';
export type BlockKind = 'heading' | 'paragraph' | 'list' | 'quote' | 'code' | 'other';

export interface DocBlock {
  id: string;
  kind: BlockKind;
  level?: number;
  /** Text shown to the agent. Markdown/EPUB blocks may carry *italic* / **bold** markers. */
  text: string;
  /** false = protected: the harness never lets the agent touch it (code, fields, links, footnotes, tables…). */
  editable: boolean;
  note?: string;
  /** Range inside the adapter's source string (`part` names the file inside a ZIP container). */
  start: number;
  end: number;
  part?: string;
}

export interface DocSection { id: string; title: string; blockIds: string[]; words: number }

export interface LoadedDocument {
  path: string;
  name: string;
  format: DocFormat;
  title: string;
  language?: string;
  author?: string;
  blocks: DocBlock[];
  sections: DocSection[];
  /** PDF: text can be read but not rewritten in place; edits are exported as Markdown. */
  readOnly: boolean;
  warnings: string[];
  text?: string;                    // md / txt / pdf source
  zip?: ZipEntry[];                 // docx / epub container
  parts?: Record<string, string>;   // decoded XML/XHTML parts referenced by blocks
}

export interface ProposedChange {
  id: string;            // block id
  sectionId: string;
  sectionTitle: string;
  before: string;
  after: string;
  risk: 'low' | 'review';
  reason?: string;
}

export const FORMAT_BY_EXT: Record<string, DocFormat> = {
  '.md': 'md', '.markdown': 'md', '.txt': 'txt', '.docx': 'docx', '.epub': 'epub', '.pdf': 'pdf',
};

/** Group blocks into chapters. `heading` mode splits at the shallowest meaningful heading level; `part` mode uses container files (EPUB spine). */
export function buildSections(blocks: DocBlock[], mode: 'heading' | 'part', docTitle: string): DocSection[] {
  const sections: DocSection[] = [];
  const words = (ids: string[], by: Map<string, DocBlock>) => ids.reduce((n, id) => n + countWords(by.get(id)?.text ?? ''), 0);
  const by = new Map(blocks.map(b => [b.id, b]));
  if (mode === 'part') {
    const order: string[] = [];
    const groups = new Map<string, DocBlock[]>();
    for (const b of blocks) { const k = b.part ?? ''; if (!groups.has(k)) { groups.set(k, []); order.push(k); } groups.get(k)!.push(b); }
    order.forEach((k, i) => {
      const g = groups.get(k)!;
      const h = g.find(b => b.kind === 'heading');
      const ids = g.map(b => b.id);
      sections.push({ id: `s${i + 1}`, title: cleanTitle(h?.text) || k.split('/').pop() || `Part ${i + 1}`, blockIds: ids, words: words(ids, by) });
    });
    return sections;
  }
  const counts = new Map<number, number>();
  for (const b of blocks) { if (b.kind === 'heading' && b.level) { counts.set(b.level, (counts.get(b.level) ?? 0) + 1); } }
  const levels = [...counts.keys()].sort((a, b) => a - b);
  let sectionLevel = levels[0] ?? 0;
  if (levels[0] === 1 && counts.get(1) === 1 && (counts.get(2) ?? 0) >= 2) { sectionLevel = 2; }   // one book title + chapters as H2
  let cur: { title: string; ids: string[] } = { title: docTitle || 'Front matter', ids: [] };
  const flush = () => { if (cur.ids.length) { sections.push({ id: `s${sections.length + 1}`, title: cur.title, blockIds: cur.ids, words: words(cur.ids, by) }); } };
  for (const b of blocks) {
    if (b.kind === 'heading' && b.level !== undefined && b.level <= sectionLevel && sectionLevel > 0) {
      flush(); cur = { title: cleanTitle(b.text), ids: [b.id] };
    } else { cur.ids.push(b.id); }
  }
  flush();
  return sections;
}

const cleanTitle = (t?: string) => (t ?? '').replace(/^#+\s*/, '').replace(/\s*#+\s*$/, '').replace(/\*/g, '').trim().slice(0, 80);

export function sectionOf(doc: LoadedDocument, blockId: string): DocSection | undefined {
  return doc.sections.find(s => s.blockIds.includes(blockId));
}
