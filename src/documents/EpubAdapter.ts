import * as nodePath from 'path';
import { readZip, writeZip, ZipEntry } from './ZipLite';
import { DocBlock, LoadedDocument, buildSections } from './DocumentModel';
import { decodeEntities, escapeXml } from './TextUtils';

const BLOCK = /<(h[1-6]|p|li)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
const PROTECT = /<(a|sup|sub|img|svg|math|ruby|audio|video)\b|epub:type/i;
const NESTED = /<(p|div|ul|ol|table|blockquote|section)\b/i;

export function xhtmlToInline(inner: string): string {
  return decodeEntities(inner
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<(em|i)(\s[^>]*)?>/gi, '*').replace(/<\/(em|i)>/gi, '*')
    .replace(/<(strong|b)(\s[^>]*)?>/gi, '**').replace(/<\/(strong|b)>/gi, '**')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t\r\f\v]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
}
export function inlineToXhtml(s: string): string {
  return escapeXml(s).replace(/&quot;/g, '"')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(?!\s)(.+?)(?<!\s)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>');
}

export function loadEpub(path: string, name: string, buf: Buffer): LoadedDocument {
  const zip = readZip(buf);
  const get = (n: string) => zip.find(e => e.name === n)?.data.toString('utf8');
  const container = get('META-INF/container.xml');
  const opfPath = container && /full-path="([^"]+)"/.exec(container)?.[1];
  if (!opfPath) { throw new Error('Not an EPUB: META-INF/container.xml has no rootfile.'); }
  const opf = get(opfPath);
  if (!opf) { throw new Error(`EPUB package file ${opfPath} not found.`); }
  const dir = nodePath.posix.dirname(opfPath);
  const manifest = new Map<string, { href: string; type: string; props: string }>();
  for (const m of opf.matchAll(/<item\b([^>]*)\/?>/gi)) {
    const a = m[1]; const id = /\bid="([^"]*)"/.exec(a)?.[1]; const href = /\bhref="([^"]*)"/.exec(a)?.[1];
    if (id && href) { manifest.set(id, { href: decodeURIComponent(href), type: /media-type="([^"]*)"/.exec(a)?.[1] ?? '', props: /properties="([^"]*)"/.exec(a)?.[1] ?? '' }); }
  }
  const blocks: DocBlock[] = []; const parts: Record<string, string> = {}; const warnings: string[] = [];
  let protectedCount = 0;
  for (const ref of opf.matchAll(/<itemref\b([^>]*)\/?>/gi)) {
    const item = manifest.get(/idref="([^"]*)"/.exec(ref[1])?.[1] ?? '');
    if (!item || !/xhtml|html/.test(item.type) || /\bnav\b/.test(item.props)) { continue; }
    const partName = nodePath.posix.normalize(nodePath.posix.join(dir === '.' ? '' : dir, item.href));
    const xhtml = get(partName);
    if (xhtml === undefined) { continue; }
    parts[partName] = xhtml;
    let m: RegExpExecArray | null; BLOCK.lastIndex = 0;
    while ((m = BLOCK.exec(xhtml))) {
      const tag = m[1].toLowerCase(); const inner = m[3];
      const text = xhtmlToInline(inner);
      if (!text) { continue; }
      const nested = NESTED.test(inner); const prot = PROTECT.test(inner) || nested;
      if (prot) { protectedCount++; }
      const start = m.index + m[0].indexOf(inner, m[0].indexOf('>') + 1);
      blocks.push({ id: `b${blocks.length + 1}`, kind: tag[0] === 'h' ? 'heading' : tag === 'li' ? 'list' : 'paragraph', level: tag[0] === 'h' ? Number(tag[1]) : undefined,
        text, editable: !prot, note: prot ? 'contains links, notes, images or nested blocks' : undefined, start, end: start + inner.length, part: partName });
    }
  }
  if (!blocks.length) { warnings.push('No readable chapters were found in the EPUB spine.'); }
  if (protectedCount) { warnings.push(`${protectedCount} block(s) with links, footnotes or images are protected and will not be edited.`); }
  const title = decodeEntities(/<dc:title[^>]*>([^<]*)<\/dc:title>/i.exec(opf)?.[1] ?? '').trim() || name.replace(/\.epub$/i, '');
  const author = decodeEntities(/<dc:creator[^>]*>([^<]*)<\/dc:creator>/i.exec(opf)?.[1] ?? '').trim() || undefined;
  const language = /<dc:language[^>]*>([^<]*)<\/dc:language>/i.exec(opf)?.[1]?.trim();
  return { path, name, format: 'epub', title, author, language, blocks, sections: buildSections(blocks, 'part', title), readOnly: false, warnings, zip, parts };
}

export function applyEpubChanges(doc: LoadedDocument, changes: Map<string, string>): Buffer {
  const byPart = new Map<string, DocBlock[]>();
  for (const b of doc.blocks) { if (changes.has(b.id) && b.editable && b.part) { (byPart.get(b.part) ?? byPart.set(b.part, []).get(b.part)!).push(b); } }
  const out: ZipEntry[] = doc.zip!.map(e => {
    const list = byPart.get(e.name);
    if (!list) { return e; }
    let x = doc.parts![e.name];
    for (const b of list.sort((a, c) => c.start - a.start)) { x = x.slice(0, b.start) + inlineToXhtml(changes.get(b.id)!) + x.slice(b.end); }
    return { ...e, data: Buffer.from(x, 'utf8') };
  });
  return writeZip(out);
}
