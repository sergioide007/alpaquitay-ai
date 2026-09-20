import * as nodePath from 'path';
import { randomUUID } from 'crypto';
import { writeZip, ZipEntry } from './ZipLite';
import { DocBlock, DocFormat, FORMAT_BY_EXT, LoadedDocument, buildSections } from './DocumentModel';
import { applyTextChanges, loadTextDocument } from './MarkdownAdapter';
import { applyDocxChanges, loadDocx } from './DocxAdapter';
import { applyEpubChanges, inlineToXhtml, loadEpub } from './EpubAdapter';
import { extractPdfText } from './PdfReader';
import { escapeXml } from './TextUtils';

export const MAX_DOC_BYTES = 60 * 1024 * 1024;
export const SUPPORTED_EXTS = Object.keys(FORMAT_BY_EXT);
export type ExportFormat = 'md' | 'docx' | 'epub';
export interface WriteOptions { trackChanges: boolean; author: string; date: string }

export function detectFormat(path: string): DocFormat | undefined { return FORMAT_BY_EXT[nodePath.extname(path).toLowerCase()]; }

export function loadDocument(path: string, buf: Buffer): LoadedDocument {
  const format = detectFormat(path);
  if (!format) { throw new Error(`Unsupported file type. Supported: ${SUPPORTED_EXTS.join(', ')}`); }
  if (buf.length > MAX_DOC_BYTES) { throw new Error('File is larger than 60 MB.'); }
  const name = nodePath.basename(path);
  switch (format) {
    case 'md': case 'txt': return loadTextDocument(path, name, format, buf.toString('utf8').replace(/^\uFEFF/, ''));
    case 'docx': return loadDocx(path, name, buf);
    case 'epub': return loadEpub(path, name, buf);
    case 'pdf': {
      const pdf = extractPdfText(buf);
      const doc = loadTextDocument(path, name, 'pdf', pdf.text);
      doc.warnings.push(...pdf.warnings);
      return doc;
    }
  }
}

/** Applies accepted changes in the document's own format. PDF (read-only) is written as Markdown. */
export function applyChanges(doc: LoadedDocument, changes: Map<string, string>, opt: WriteOptions): { buffer: Buffer; ext: string } {
  switch (doc.format) {
    case 'docx': return { buffer: applyDocxChanges(doc, changes, opt), ext: '.docx' };
    case 'epub': return { buffer: applyEpubChanges(doc, changes), ext: '.epub' };
    case 'pdf': return { buffer: Buffer.from(applyTextChanges(doc, changes), 'utf8'), ext: '.md' };
    default: return { buffer: Buffer.from(applyTextChanges(doc, changes), 'utf8'), ext: doc.format === 'txt' ? '.txt' : '.md' };
  }
}

// ── Export: normalise any document to blocks, then write MD / DOCX / EPUB ────────────────────
function exportBlocks(doc: LoadedDocument, changes: Map<string, string>): DocBlock[] {
  const md = doc.format === 'md';
  return doc.blocks.map(b => {
    let text = changes.get(b.id) ?? b.text; let kind = b.kind;
    if (md) {
      if (kind === 'heading') { text = text.replace(/^#+\s*/, '').replace(/\s*#+\s*$/, ''); }
      else if (kind === 'quote') { text = text.replace(/^\s*>\s?/gm, ''); }
      else if (kind === 'code') { text = text.split('\n').filter(l => !/^\s*(```|~~~)/.test(l)).join('\n'); }
      else if (kind === 'other') { kind = 'paragraph'; }
    }
    return { ...b, kind, text };
  }).filter(b => b.text.trim());
}

export function toMarkdown(doc: LoadedDocument, changes: Map<string, string>): string {
  const out: string[] = [];
  for (const b of exportBlocks(doc, changes)) {
    if (b.kind === 'heading') { out.push('#'.repeat(Math.min(6, b.level ?? 1)) + ' ' + b.text.replace(/\n/g, ' ')); }
    else if (b.kind === 'list') { out.push(b.text.split('\n').map(l => /^\s*([-*+]|\d+[.)])\s/.test(l) ? l : '- ' + l).join('\n')); }
    else if (b.kind === 'quote') { out.push(b.text.split('\n').map(l => '> ' + l).join('\n')); }
    else if (b.kind === 'code') { out.push('```\n' + b.text + '\n```'); }
    else { out.push(b.text); }
  }
  return out.join('\n\n') + '\n';
}

const runs = (s: string, extra = '') => s.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/).filter(Boolean).map(p => {
  const bold = /^\*\*[^*]+\*\*$/.test(p); const ital = !bold && /^\*[^*\n]+\*$/.test(p);
  const txt = bold ? p.slice(2, -2) : ital ? p.slice(1, -1) : p;
  const rpr = `${extra}${bold ? '<w:b/>' : ''}${ital ? '<w:i/>' : ''}`;
  return `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(txt)}</w:t></w:r>`;
}).join('');

export function toDocx(doc: LoadedDocument, changes: Map<string, string>, date: string): Buffer {
  const p = (style: string | null, inner: string) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${inner}</w:p>`;
  const body = exportBlocks(doc, changes).map(b => {
    if (b.kind === 'heading') { return p(`Heading${Math.min(6, b.level ?? 1)}`, runs(b.text)); }
    if (b.kind === 'list') { return b.text.split('\n').map(l => p('ListParagraph', runs('• ' + l.replace(/^\s*([-*+]|\d+[.)])\s+/, '')))).join(''); }
    if (b.kind === 'code') { return b.text.split('\n').map(l => p(null, runs(l, '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>'))).join(''); }
    if (b.kind === 'quote') { return p('Quote', runs(b.text.replace(/\n/g, ' '))); }
    return p(null, runs(b.text.replace(/\n/g, ' ')));
  }).join('');
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const style = (id: string, name: string, extra: string, base = 'Normal') => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="${base}"/><w:qFormat/>${extra}</w:style>`;
  const sizes = [40, 32, 28, 26, 24, 22];
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="${doc.language ?? 'es-ES'}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
    sizes.map((sz, i) => style(`Heading${i + 1}`, `heading ${i + 1}`, `<w:pPr><w:keepNext/><w:spacing w:before="${i ? 240 : 360}" w:after="120"/><w:outlineLvl w:val="${i}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${sz}"/></w:rPr>`)).join('') +
    style('ListParagraph', 'List Paragraph', '<w:pPr><w:ind w:left="720"/></w:pPr>') + style('Quote', 'Quote', '<w:pPr><w:ind w:left="720" w:right="720"/></w:pPr><w:rPr><w:i/></w:rPr>') + '</w:styles>';
  const sect = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';
  const hdr = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const files: ZipEntry[] = [
    { name: '[Content_Types].xml', data: Buffer.from(`${hdr}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`) },
    { name: '_rels/.rels', data: Buffer.from(`${hdr}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`) },
    { name: 'word/_rels/document.xml.rels', data: Buffer.from(`${hdr}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { name: 'word/document.xml', data: Buffer.from(`${hdr}<w:document ${W}><w:body>${body}${sect}</w:body></w:document>`) },
    { name: 'word/styles.xml', data: Buffer.from(styles) },
    { name: 'docProps/core.xml', data: Buffer.from(`${hdr}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(doc.title)}</dc:title><dc:creator>${escapeXml(doc.author ?? '')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${date}</dcterms:created></cp:coreProperties>`) },
  ];
  return writeZip(files);
}

export function toEpub(doc: LoadedDocument, changes: Map<string, string>, date: string): Buffer {
  const blocks = exportBlocks(doc, changes);
  const sections = buildSections(blocks, 'heading', doc.title);
  const by = new Map(blocks.map(b => [b.id, b]));
  const lang = doc.language ?? 'es';
  const html = (title: string, inner: string) => `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(lang)}"><head><meta charset="utf-8"/><title>${escapeXml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${inner}</body></html>`;
  const chapters = sections.map((s, i) => {
    let inner = ''; 
    for (const id of s.blockIds) {
      const b = by.get(id)!;
      if (b.kind === 'heading') { inner += `<h${Math.min(6, b.level ?? 1)}>${inlineToXhtml(b.text)}</h${Math.min(6, b.level ?? 1)}>\n`; }
      else if (b.kind === 'list') { inner += '<ul>' + b.text.split('\n').map(l => `<li>${inlineToXhtml(l.replace(/^\s*([-*+]|\d+[.)])\s+/, ''))}</li>`).join('') + '</ul>\n'; }
      else if (b.kind === 'quote') { inner += `<blockquote><p>${inlineToXhtml(b.text)}</p></blockquote>\n`; }
      else if (b.kind === 'code') { inner += `<pre>${escapeXml(b.text)}</pre>\n`; }
      else { inner += `<p>${inlineToXhtml(b.text)}</p>\n`; }
    }
    return { file: `ch${String(i + 1).padStart(3, '0')}.xhtml`, title: s.title, xhtml: html(s.title, inner) };
  });
  const nav = html('Contents', `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${chapters.map(c => `<li><a href="${c.file}">${escapeXml(c.title)}</a></li>`).join('')}</ol></nav>`);
  const opf = `<?xml version="1.0" encoding="utf-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${escapeXml(lang)}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">urn:uuid:${randomUUID()}</dc:identifier><dc:title>${escapeXml(doc.title)}</dc:title><dc:language>${escapeXml(lang)}</dc:language>${doc.author ? `<dc:creator>${escapeXml(doc.author)}</dc:creator>` : ''}<meta property="dcterms:modified">${date.replace(/\.\d+Z$/, 'Z')}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/>${chapters.map((c, i) => `<item id="c${i + 1}" href="${c.file}" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${chapters.map((_c, i) => `<itemref idref="c${i + 1}"/>`).join('')}</spine></package>`;
  const css = 'body{font-family:serif;line-height:1.5;margin:5%}h1,h2,h3{font-family:sans-serif;line-height:1.2}p{margin:0 0 .8em;text-align:justify}blockquote{margin:1em 2em;font-style:italic}pre{white-space:pre-wrap}';
  return writeZip([
    { name: 'mimetype', data: Buffer.from('application/epub+zip'), store: true },
    { name: 'META-INF/container.xml', data: Buffer.from('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>') },
    { name: 'OEBPS/content.opf', data: Buffer.from(opf) }, { name: 'OEBPS/nav.xhtml', data: Buffer.from(nav) }, { name: 'OEBPS/style.css', data: Buffer.from(css) },
    ...chapters.map(c => ({ name: `OEBPS/${c.file}`, data: Buffer.from(c.xhtml) })),
  ]);
}

export function exportDocument(doc: LoadedDocument, changes: Map<string, string>, format: ExportFormat, date: string): { buffer: Buffer; ext: string } {
  if (format === 'docx') { return { buffer: toDocx(doc, changes, date), ext: '.docx' }; }
  if (format === 'epub') { return { buffer: toEpub(doc, changes, date), ext: '.epub' }; }
  return { buffer: Buffer.from(toMarkdown(doc, changes), 'utf8'), ext: '.md' };
}
