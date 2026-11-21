import { DocBlock, LoadedDocument, DocFormat, buildSections } from './DocumentModel';

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const LIST = /^\s*([-*+]|\d+[.)])\s+/;
const FENCE = /^\s*(```|~~~)/;

/** Parses Markdown / plain text / extracted PDF text into blocks with exact source ranges (edits are lossless outside changed blocks). */
export function parseTextBlocks(text: string, plain: boolean): DocBlock[] {
  const blocks: DocBlock[] = [];
  const lines: { s: number; e: number; t: string }[] = [];
  let pos = 0;
  for (const raw of text.split('\n')) { lines.push({ s: pos, e: pos + raw.length, t: raw.replace(/\r$/, '') }); pos += raw.length + 1; }
  let i = 0;
  const push = (from: number, to: number, kind: DocBlock['kind'], editable: boolean, extra: Partial<DocBlock> = {}) => {
    const start = lines[from].s, end = lines[to].e;
    blocks.push({ id: `b${blocks.length + 1}`, kind, text: text.slice(start, end).replace(/\r$/, ''), editable, start, end, ...extra });
  };
  if (!plain && lines[0]?.t === '---') {                                     // YAML front matter
    let j = 1; while (j < lines.length && lines[j].t !== '---') { j++; }
    if (j < lines.length) { push(0, j, 'other', false, { note: 'front matter' }); i = j + 1; }
  }
  while (i < lines.length) {
    const l = lines[i];
    if (l.t.trim() === '') { i++; continue; }
    if (!plain && FENCE.test(l.t)) {
      let j = i + 1; while (j < lines.length && !FENCE.test(lines[j].t)) { j++; }
      const to = Math.min(j, lines.length - 1); push(i, to, 'code', false, { note: 'code block' }); i = to + 1; continue;
    }
    const h = !plain ? HEADING.exec(l.t) : null;
    if (h) { push(i, i, 'heading', true, { level: h[1].length }); i++; continue; }
    let j = i;
    while (j + 1 < lines.length && lines[j + 1].t.trim() !== '' && !(!plain && (HEADING.test(lines[j + 1].t) || FENCE.test(lines[j + 1].t)))) { j++; }
    const first = l.t;
    if (plain) { push(i, j, 'paragraph', true); }
    else if (/^\s*\|/.test(first)) { push(i, j, 'other', false, { note: 'table' }); }
    else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(first)) { push(i, j, 'other', false, { note: 'rule' }); }
    else if (/^\s*</.test(first)) { push(i, j, 'other', false, { note: 'html' }); }
    else if (/^\s*!\[/.test(first) && j === i) { push(i, j, 'other', false, { note: 'image' }); }
    else if (LIST.test(first)) { push(i, j, 'list', true); }
    else if (/^\s*>/.test(first)) { push(i, j, 'quote', true); }
    else { push(i, j, 'paragraph', true); }
    i = j + 1;
  }
  return blocks;
}

export function loadTextDocument(path: string, name: string, format: DocFormat, text: string): LoadedDocument {
  const plain = format === 'txt' || format === 'pdf';
  const blocks = parseTextBlocks(text, plain);
  const h1 = blocks.find(b => b.kind === 'heading' && b.level === 1);
  const title = (h1 ? h1.text.replace(/^#+\s*/, '') : name.replace(/\.[^.]+$/, '')).trim();
  return { path, name, format, title, blocks, sections: buildSections(blocks, 'heading', title), readOnly: format === 'pdf', warnings: [], text };
}

export function applyTextChanges(doc: LoadedDocument, changes: Map<string, string>): string {
  let out = doc.text ?? '';
  const targets = doc.blocks.filter(b => changes.has(b.id)).sort((a, b) => b.start - a.start);
  for (const b of targets) { out = out.slice(0, b.start) + changes.get(b.id)! + out.slice(b.end); }
  return out;
}
