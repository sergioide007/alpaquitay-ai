import * as zlib from 'zlib';

/**
 * Best-effort, dependency-free PDF text extraction (text-based PDFs with standard/WinAnsi fonts).
 * It cannot OCR scanned pages nor decode subset fonts that only expose glyph ids; in those cases it says so
 * instead of returning garbage. PDFs are read-only in Alpaquitay: edits are exported to Markdown/DOCX/EPUB.
 */
export interface PdfText { text: string; streams: number; warnings: string[] }

function unescapePdfString(s: string): string {
  return s.replace(/\\([nrtbf()\\]|[0-7]{1,3}|\r?\n)/g, (_m, e: string) => {
    if (e === 'n') { return '\n'; } if (e === 'r') { return '\r'; } if (e === 't') { return '\t'; }
    if (e === 'b') { return '\b'; } if (e === 'f') { return '\f'; }
    if (/^[0-7]+$/.test(e)) { return String.fromCharCode(parseInt(e, 8)); }
    if (e === '(' || e === ')' || e === '\\') { return e; }
    return '';
  });
}

function readStrings(op: string): string {
  let out = '';
  const re = /\(((?:\\.|[^\\()]|\((?:\\.|[^\\()])*\))*)\)|<([0-9A-Fa-f\s]+)>|(-?\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(op))) {
    if (m[1] !== undefined) { out += unescapePdfString(m[1]); }
    else if (m[2] !== undefined) {
      const hex = m[2].replace(/\s+/g, ''); const bytes = Buffer.from(hex.length % 2 ? hex + '0' : hex, 'hex');
      if (bytes.length % 2 === 0 && bytes.length && bytes.every((b, i) => i % 2 === 0 ? b === 0 : b >= 32 && b < 127)) {
        out += Buffer.from(bytes.filter((_b, i) => i % 2 === 1)).toString('latin1');   // UTF-16BE ASCII
      } else if (!bytes.some(b => b === 0)) { out += bytes.toString('latin1'); }
    } else if (m[3] !== undefined && Number(m[3]) < -200) { out += ' '; }  // kerning gap in TJ arrays = word space
  }
  return out;
}

function contentToText(c: string): string {
  let out = '';
  for (const bt of c.matchAll(/BT([\s\S]*?)ET/g)) {
    const body = bt[1];
    const re = /(\[(?:\\.|[^\]\\])*\]|\((?:\\.|[^\\()]|\((?:\\.|[^\\()])*\))*\)|<[0-9A-Fa-f\s]*>)\s*(TJ|Tj|'|")|(-?[\d.]+)\s+(-?[\d.]+)\s+(Td|TD)|(T\*)|(-?[\d.]+\s+){5}-?[\d.]+\s+Tm/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) {
      if (m[1]) { if (m[2] === "'" || m[2] === '"') { out += '\n'; } out += readStrings(m[1]); }
      else if (m[5]) { const ty = Math.abs(Number(m[4])); if (ty > 0) { out += ty > 20 ? '\n\n' : '\n'; } else if (Math.abs(Number(m[3])) > 2) { out += ' '; } }
      else if (m[6]) { out += '\n'; }
      else { out += '\n'; }
    }
    out += '\n\n';
  }
  return out;
}

export function extractPdfText(buf: Buffer): PdfText {
  const warnings: string[] = [];
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') { throw new Error('Not a PDF file.'); }
  if (/\/Encrypt\b/.test(buf.toString('latin1', Math.max(0, buf.length - 4096)))) { throw new Error('Encrypted PDFs are not supported.'); }
  const bin = buf.toString('latin1');
  let text = ''; let streams = 0;
  const re = /stream\r?\n/g; let m: RegExpExecArray | null;
  while ((m = re.exec(bin))) {
    const start = m.index + m[0].length;
    const end = bin.indexOf('endstream', start);
    if (end < 0) { break; }
    const dict = bin.slice(Math.max(0, bin.lastIndexOf('obj', m.index)), m.index);
    re.lastIndex = end;
    if (/\/(Image|XObject|Font|FontFile|Metadata|ObjStm|XRef)/.test(dict) && !/\/Contents/.test(dict)) { continue; }
    let data = buf.subarray(start, end);
    try { if (/FlateDecode/.test(dict)) { data = zlib.inflateSync(data, { maxOutputLength: 64 * 1024 * 1024 }); } else if (/\/Filter/.test(dict)) { continue; } } catch { continue; }
    const s = data.toString('latin1');
    if (!/BT[\s\S]*ET/.test(s)) { continue; }
    streams++;
    text += contentToText(s) + '\n\n';
  }
  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/([a-záéíóúñ])-\n([a-záéíóúñ])/gi, '$1$2')
    .replace(/([^\n.!?:;”»)\]\d])\n(?=[a-záéíóúñ¿¡(“«])/g, '$1 ').trim();
  text = text.split('\n').map(l => /^(cap[íi]tulo|chapter|parte|part)\s+([0-9ivxlc]+|\w+)\b.{0,60}$/i.test(l.trim()) ? '# ' + l.trim() : l).join('\n');
  if (text.replace(/\s/g, '').length < 20) {
    warnings.push('No extractable text: this PDF looks scanned or uses embedded fonts without a text map. Run OCR first (for example ocrmypdf) or export it to DOCX/EPUB from its source.');
  } else if ([...text].filter(ch => ch === '\uFFFD' || ch.charCodeAt(0) < 9).length > text.length * 0.02) {
    warnings.push('The extracted text contains many unreadable characters; the PDF uses custom font encodings.');
  }
  warnings.push('PDF is read-only: the edited result is saved as Markdown (layout, images and page design are not preserved).');
  return { text, streams, warnings };
}
