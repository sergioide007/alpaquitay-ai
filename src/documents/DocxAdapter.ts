import { readZip, writeZip, ZipEntry } from './ZipLite';
import { DocBlock, LoadedDocument, buildSections } from './DocumentModel';
import { decodeEntities, escapeXml, wordDiff } from './TextUtils';

const DOC = 'word/document.xml';
const PARA = /<w:p(?=[\s>/])[^>]*?\/>|<w:p(?=[\s>])[\s\S]*?<\/w:p>/g;
const HEAD_STYLE = /^(?:heading|ttulo|titulo|título|überschrift|titre|rubrik|titolo)\s*(\d)$/i;
const PROTECT = /<w:(?:fldChar|fldSimple|instrText|hyperlink|footnoteReference|endnoteReference|drawing|pict|object|txbxContent|commentReference|sdt)\b/;

function paragraphText(p: string): string {
  let out = '';
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>|<w:cr\s*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(p))) { out += m[1] !== undefined ? decodeEntities(m[1]) : m[0].startsWith('<w:tab') ? '\t' : '\n'; }
  return out;
}

export function loadDocx(path: string, name: string, buf: Buffer): LoadedDocument {
  const zip = readZip(buf);
  const entry = zip.find(e => e.name === DOC);
  if (!entry) { throw new Error('Not a Word document: word/document.xml is missing.'); }
  const xml = entry.data.toString('utf8');
  const blocks: DocBlock[] = [];
  const warnings: string[] = [];
  const body = xml.indexOf('<w:body');
  PARA.lastIndex = Math.max(0, body);
  let m: RegExpExecArray | null;
  let protectedCount = 0;
  while ((m = PARA.exec(xml))) {
    const src = m[0];
    const text = paragraphText(src);
    if (!text.trim()) { continue; }
    const style = /<w:pStyle\s+w:val="([^"]+)"/.exec(src)?.[1] ?? '';
    const hs = HEAD_STYLE.exec(style);
    const outline = /<w:outlineLvl\s+w:val="(\d)"/.exec(src)?.[1];
    const isTitle = /^(title|ttulo|titulo|título)$/i.test(style);
    let kind: DocBlock['kind'] = 'paragraph'; let level: number | undefined;
    if (hs) { kind = 'heading'; level = Number(hs[1]); }
    else if (isTitle) { kind = 'heading'; level = 1; }
    else if (outline !== undefined) { kind = 'heading'; level = Number(outline) + 1; }
    else if (/<w:numPr>/.test(src) || /^List/i.test(style)) { kind = 'list'; }
    else if (/^(quote|intensequote|cita)/i.test(style)) { kind = 'quote'; }
    const prot = PROTECT.test(src);
    if (prot) { protectedCount++; }
    blocks.push({ id: `b${blocks.length + 1}`, kind, level, text, editable: !prot, note: prot ? 'contains fields, links, notes or images' : undefined, start: m.index, end: m.index + src.length, part: DOC });
  }
  if (protectedCount) { warnings.push(`${protectedCount} paragraph(s) with links, fields, notes or images are protected and will not be edited.`); }
  if (/<w:ins\s|<w:del\s/.test(xml)) { warnings.push('The document already contains tracked changes; new edits are added on top of them.'); }
  const core = zip.find(e => e.name === 'docProps/core.xml')?.data.toString('utf8') ?? '';
  const title = decodeEntities(/<dc:title>([^<]*)<\/dc:title>/.exec(core)?.[1] ?? '').trim() || (blocks.find(b => b.kind === 'heading')?.text ?? name.replace(/\.docx$/i, ''));
  const author = decodeEntities(/<dc:creator>([^<]*)<\/dc:creator>/.exec(core)?.[1] ?? '').trim() || undefined;
  return { path, name, format: 'docx', title, author, blocks, sections: buildSections(blocks, 'heading', title), readOnly: false, warnings, zip, parts: { [DOC]: xml } };
}

const t = (s: string, tag: 't' | 'delText') => {
  const seg = s.split(/(\t|\n)/).map(x => x === '\t' ? '<w:tab/>' : x === '\n' ? '<w:br/>' : x ? `<w:${tag} xml:space="preserve">${escapeXml(x)}</w:${tag}>` : '').join('');
  return seg;
};

export interface DocxWriteOptions { trackChanges: boolean; author: string; date: string }

export function applyDocxChanges(doc: LoadedDocument, changes: Map<string, string>, opt: DocxWriteOptions): Buffer {
  let xml = doc.parts![DOC];
  let rev = Math.max(9000, ...[...xml.matchAll(/w:id="(\d+)"/g)].map(x => Number(x[1]) + 1));
  const targets = doc.blocks.filter(b => changes.has(b.id) && b.editable).sort((a, b) => b.start - a.start);
  for (const b of targets) {
    const src = xml.slice(b.start, b.end);
    const open = /^<w:p[^>]*>/.exec(src)?.[0] ?? '<w:p>';
    const pPr = /<w:pPr>[\s\S]*?<\/w:pPr>|<w:pPr\/>/.exec(src)?.[0] ?? '';
    const rPr = /<w:r(?:\s[^>]*)?>\s*(<w:rPr>[\s\S]*?<\/w:rPr>)/.exec(src)?.[1] ?? '';
    const after = changes.get(b.id)!;
    const run = (s: string, tag: 't' | 'delText' = 't') => s ? `<w:r>${rPr}${t(s, tag)}</w:r>` : '';
    let inner = '';
    if (!opt.trackChanges) { inner = run(after); }
    else {
      const attrs = () => `w:id="${rev++}" w:author="${escapeXml(opt.author)}" w:date="${opt.date}"`;
      for (const op of wordDiff(b.text, after)) {
        if (op.t === 'eq') { inner += run(op.s); }
        else if (op.t === 'del') { inner += `<w:del ${attrs()}>${run(op.s, 'delText')}</w:del>`; }
        else { inner += `<w:ins ${attrs()}>${run(op.s)}</w:ins>`; }
      }
    }
    xml = xml.slice(0, b.start) + open + pPr + inner + '</w:p>' + xml.slice(b.end);
  }
  const out: ZipEntry[] = doc.zip!.map(e => e.name === DOC ? { ...e, data: Buffer.from(xml, 'utf8') } : e);
  return writeZip(out);
}
