import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';
import { readZip, writeZip, crc32 } from '../../../documents/ZipLite';
import { loadDocument, applyChanges, exportDocument, toMarkdown } from '../../../documents/Documents';
import { extractPdfText } from '../../../documents/PdfReader';
import { wordDiff } from '../../../documents/TextUtils';
import { assessChange, batchBlocks, classifyInstruction, parseEditReply, editableBlocks } from '../../../documents/DocumentAgent';
import { DocsController } from '../../../documents/DocsController';
import type { AIProvider } from '../../../core/interfaces';

const DATE = '2026-09-20T10:00:00.000Z';
const BOOK = '# Mi libro\n\n## Capítulo 1\n\nEl gato salio de la casa. Tenia 3 años.\n\n- uno\n- dos\n\n```js\nconst x = 1;\n```\n\n## Capítulo 2\n\nOtro *párrafo* con **negrita**.\n';

describe('ZipLite', () => {
  it('round-trips entries (stored + deflated) and crc32 matches zlib', () => {
    const z = writeZip([{ name: 'mimetype', data: Buffer.from('x'), store: true }, { name: 'a/b.txt', data: Buffer.from('hola'.repeat(100)) }]);
    const r = readZip(z);
    expect(r.map(e => e.name)).toEqual(['mimetype', 'a/b.txt']);
    expect(r[1].data.toString()).toBe('hola'.repeat(100));
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });
  it('rejects garbage', () => { expect(() => readZip(Buffer.from('not a zip at all'))).toThrow(/ZIP/); });
});

describe('Markdown adapter', () => {
  const doc = loadDocument('/tmp/libro.md', Buffer.from(BOOK));
  it('splits chapters at H2 when there is one H1 title, and protects code', () => {
    expect(doc.sections.map(s => s.title)).toEqual(['Mi libro', 'Capítulo 1', 'Capítulo 2']);
    expect(doc.blocks.find(b => b.kind === 'code')!.editable).toBe(false);
  });
  it('edits only the chosen block and leaves everything else byte-identical', () => {
    const p = doc.blocks.find(b => b.text.startsWith('El gato'))!;
    const out = applyChanges(doc, new Map([[p.id, 'El gato salió de la casa. Tenía 3 años.']]), { trackChanges: false, author: 'x', date: DATE });
    expect(out.buffer.toString()).toBe(BOOK.replace('El gato salio de la casa. Tenia 3 años.', 'El gato salió de la casa. Tenía 3 años.'));
  });
});

describe('DOCX round trip', () => {
  const md = loadDocument('/tmp/libro.md', Buffer.from(BOOK));
  const docxBuf = exportDocument(md, new Map(), 'docx', DATE).buffer;
  const docx = loadDocument('/tmp/libro.docx', docxBuf);
  it('reads headings, paragraphs and lists from a generated .docx', () => {
    expect(docx.sections.length).toBeGreaterThanOrEqual(3);
    expect(docx.blocks.some(b => b.kind === 'heading' && b.text === 'Capítulo 1')).toBe(true);
  });
  it('writes edits as Word tracked changes and keeps every other paragraph intact', () => {
    const p = docx.blocks.find(b => b.text.startsWith('El gato'))!;
    const out = applyChanges(docx, new Map([[p.id, 'El gato salió de la casa. Tenía 3 años.']]), { trackChanges: true, author: 'Alpaquitay AI', date: DATE }).buffer;
    const xml = readZip(out).find(e => e.name === 'word/document.xml')!.data.toString();
    expect(xml).toContain('<w:ins ');
    expect(xml).toContain('<w:del ');
    expect(xml).toContain('w:delText');
    const re = loadDocument('/tmp/libro.edited.docx', out);
    expect(re.blocks).toHaveLength(docx.blocks.length);
    expect(re.blocks.find(b => b.id === p.id)!.text).toBe('El gato salió de la casa. Tenía 3 años.');
  });
  it('protects paragraphs with hyperlinks and understands Spanish heading style ids', () => {
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
    const xml = `<?xml version="1.0"?><w:document ${W}><w:body><w:p><w:pPr><w:pStyle w:val="Ttulo1"/></w:pPr><w:r><w:t>Introducción</w:t></w:r></w:p><w:p><w:hyperlink r:id="r1"><w:r><w:t>ver sitio</w:t></w:r></w:hyperlink></w:p><w:p><w:r><w:t>Texto normal.</w:t></w:r></w:p></w:body></w:document>`;
    const d = loadDocument('/tmp/x.docx', writeZip([{ name: 'word/document.xml', data: Buffer.from(xml) }]));
    expect(d.blocks[0]).toMatchObject({ kind: 'heading', level: 1 });
    expect(d.blocks[1].editable).toBe(false);
    expect(d.blocks[2].editable).toBe(true);
  });
});

describe('EPUB round trip', () => {
  const md = loadDocument('/tmp/libro.md', Buffer.from(BOOK));
  const epubBuf = exportDocument(md, new Map(), 'epub', DATE).buffer;
  const epub = loadDocument('/tmp/libro.epub', epubBuf);
  it('produces a valid container with mimetype first and stored', () => {
    const z = readZip(epubBuf);
    expect(z[0]).toMatchObject({ name: 'mimetype', store: true });
    expect(epub.title).toBe('Mi libro');
    expect(epub.sections.length).toBe(3);
  });
  it('keeps <em>/<strong> as markdown markers and writes them back', () => {
    const p = epub.blocks.find(b => b.text.includes('párrafo'))!;
    expect(p.text).toBe('Otro *párrafo* con **negrita**.');
    const out = applyChanges(epub, new Map([[p.id, 'Otro *párrafo* con **negrita** y más.']]), { trackChanges: false, author: '', date: DATE }).buffer;
    const html = readZip(out).map(e => e.data.toString()).join('');
    expect(html).toContain('Otro <em>párrafo</em> con <strong>negrita</strong> y más.');
    expect(loadDocument('/tmp/o.epub', out).blocks).toHaveLength(epub.blocks.length);
  });
});

describe('PDF reader', () => {
  const stream = 'BT /F1 12 Tf 72 700 Td (Capitulo 1) Tj 0 -30 Td [(El gato) -300 (salio.)] TJ ET';
  const pdf = (body: Buffer, filter: string) => Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj\n<< /Length ' + body.length + filter + ' >>\nstream\n'), body, Buffer.from('\nendstream\nendobj\ntrailer\n%%EOF')]);
  it('extracts text from plain and Flate streams', () => {
    expect(extractPdfText(pdf(Buffer.from(stream), '')).text).toContain('El gato salio.');
    const t = extractPdfText(pdf(zlib.deflateSync(Buffer.from(stream)), ' /Filter /FlateDecode'));
    expect(t.text).toContain('# Capitulo 1');
  });
  it('is read-only and exports to markdown; warns when nothing is readable', () => {
    const doc = loadDocument('/tmp/a.pdf', pdf(Buffer.from(stream), ''));
    expect(doc.readOnly).toBe(true);
    expect(applyChanges(doc, new Map(), { trackChanges: false, author: '', date: DATE }).ext).toBe('.md');
    expect(loadDocument('/tmp/b.pdf', Buffer.from('%PDF-1.4\n%%EOF')).warnings.join(' ')).toMatch(/No extractable text/);
    expect(() => extractPdfText(Buffer.from('nope'))).toThrow(/Not a PDF/);
  });
});

describe('Agent helpers', () => {
  it('classifies intents in Spanish and English without an LLM', () => {
    expect(classifyInstruction('corrige la ortografía').op).toBe('proofread');
    expect(classifyInstruction('traduce el libro al inglés')).toMatchObject({ op: 'translate', targetLang: 'English' });
    expect(classifyInstruction('resume el capítulo').op).toBe('summarize');
    expect(classifyInstruction('revisa la coherencia entre capítulos').op).toBe('consistency');
    expect(classifyInstruction('¿Quién es Ana en la historia?').op).toBe('ask');
    expect(classifyInstruction('hazlo más elegante y cambia el tono a formal').op).toBe('custom');
    expect(classifyInstruction('x', 'all', 'outline').mode).toBe('analyze');
  });
  it('parses marker replies, ignores unknown ids and fences', () => {
    const m = parseEditReply('```\n[[b1]]\nNuevo uno\n\n[[b9]]\nfuera\n[[b2]]: Nuevo dos\n```', new Set(['b1', 'b2']));
    expect([...m.entries()]).toEqual([['b1', 'Nuevo uno'], ['b2', 'Nuevo dos']]);
  });
  it('batches by size and flags risky rewrites for review', () => {
    const d = loadDocument('/tmp/l.md', Buffer.from(BOOK));
    const blocks = editableBlocks(d, d.sections[1], 'style');
    expect(batchBlocks(blocks, 10).length).toBe(blocks.length);
    expect(assessChange('proofread', 'Tenía 3 años.', 'Tenía 4 años.').risk).toBe('review');
    expect(assessChange('proofread', 'El gato salio.', 'El gato salió.').risk).toBe('low');
    expect(wordDiff('a b c', 'a x c').map(o => o.t)).toEqual(['eq', 'del', 'ins', 'eq']);
  });
});

describe('DocsController end to end', () => {
  let dir: string; // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const posted: Array<Record<string, any>> = [];
  const provider = (reply: (prompt: string) => string): AIProvider => ({
    name: 'fake', type: 'ollama', modelName: 'llama3', isAvailable: async () => true, complete: async () => '',
    chat: async (m) => ({ content: reply(m[0].content), model: 'llama3', usage: { promptTokens: 0, completionTokens: 0 } }),
  });
  const make = (p: AIProvider | null) => new DocsController({ post: m => posted.push(m), getProvider: () => p, workspaceRoot: dir, now: () => new Date(DATE) });
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alp-docs-')); posted.length = 0; });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const fix = (prompt: string) => { const id = /\[\[(b\d+)\]\]\nEl gato salio/.exec(prompt)?.[1]; return id ? `[[${id}]]\nEl gato salió de la casa. Tenía 3 años.` : ''; };

  it('proposes, applies to a NEW file by default, verifies, and never touches the original', async () => {
    const src = path.join(dir, 'libro.md'); fs.writeFileSync(src, BOOK);
    const c = make(provider(fix)); await c.open(src);
    await c.run({ instruction: 'corrige la ortografía' });
    const ch = posted.find(m => m.type === 'docs-changes')!;
    expect(ch.changes).toHaveLength(1);
    await c.apply({ ids: [ch.changes[0].id], output: 'new' });
    const ap = posted.find(m => m.type === 'docs-applied')!;
    expect(ap.verified).toBe(true);
    expect(fs.readFileSync(src, 'utf8')).toBe(BOOK);
    expect(fs.readFileSync(ap.path, 'utf8')).toContain('El gato salió de la casa. Tenía 3 años.');
    expect(path.basename(ap.path)).toBe('libro.edited.md');
  });
  it('overwrite makes a backup first (inside .alpaquitay/backups)', async () => {
    const src = path.join(dir, 'libro.md'); fs.writeFileSync(src, BOOK);
    const c = make(provider(fix)); await c.open(src); await c.run({ instruction: 'corrige' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const id = posted.find(m => m.type === 'docs-changes')!.changes[0].id;
    await c.apply({ ids: [id], output: 'overwrite' });
    const ap = posted.find(m => m.type === 'docs-applied')!;
    expect(ap.backup).toContain(path.join('.alpaquitay', 'backups'));
    expect(fs.readFileSync(ap.backup, 'utf8')).toBe(BOOK);
    expect(fs.readFileSync(src, 'utf8')).toContain('salió');
  });
  it('asks for confirmation above the call threshold and reports analysis as a report', async () => {
    const big = Array.from({ length: 25 }, (_v, i) => `## C${i}\n\n${'palabra '.repeat(400)}`).join('\n\n');
    const src = path.join(dir, 'big.md'); fs.writeFileSync(src, big);
    const c = make(provider(() => "")); await c.open(src);
    await c.run({ instruction: 'mejora el estilo' });
    expect(posted.some(m => m.type === 'docs-confirm')).toBe(true);
    posted.length = 0;
    const c2 = make(provider(() => 'Resumen breve.')); await c2.open(src); await c2.run({ instruction: 'resume', scope: 's2' });
    expect(posted.find(m => m.type === 'docs-report')!.markdown).toContain('Resumen breve.');
  });
  it('fails clearly with no provider or no document', async () => {
    const c = make(null); await c.run({ instruction: 'x' });
    expect(posted.pop()!.error).toMatch(/Open a document/);
    const src = path.join(dir, 'a.md'); fs.writeFileSync(src, '# a\n\ntexto\n'); await c.open(src); posted.length = 0; await c.run({ instruction: 'corrige' });
    expect(posted.find(m => m.type === 'docs-error')!.error).toMatch(/No AI provider/);
  });
});

describe('toMarkdown', () => { it('converts an EPUB back to clean markdown', () => {
  const md = loadDocument('/tmp/libro.md', Buffer.from(BOOK));
  const epub = loadDocument('/tmp/x.epub', exportDocument(md, new Map(), 'epub', DATE).buffer);
  expect(toMarkdown(epub, new Map())).toContain('## Capítulo 1');
}); });
