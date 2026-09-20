import * as zlib from 'zlib';

/**
 * Minimal, dependency-free ZIP reader/writer (DOCX and EPUB are ZIP containers).
 * The extension is packaged with `--no-dependencies`, so nothing here may import from node_modules.
 * Guards: no zip64, bounded entry count and inflated size (zip-bomb protection), entry names are
 * only ever used as in-memory keys (never joined to a disk path).
 */
export interface ZipEntry { name: string; data: Buffer; store?: boolean }

const MAX_ENTRIES = 20_000;
const MAX_INFLATED = 256 * 1024 * 1024;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) { c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; }
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) { c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); }
  return (c ^ 0xffffffff) >>> 0;
}

export function readZip(buf: Buffer): ZipEntry[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) { throw new Error('Not a valid ZIP container (end of central directory not found).'); }
  const total = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  if (total === 0xffff || off === 0xffffffff) { throw new Error('ZIP64 archives are not supported.'); }
  if (total > MAX_ENTRIES) { throw new Error('ZIP has too many entries.'); }
  const out: ZipEntry[] = [];
  let inflated = 0;
  for (let i = 0; i < total; i++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) { throw new Error('Corrupt ZIP central directory.'); }
    const flags = buf.readUInt16LE(off + 8);
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nlen = buf.readUInt16LE(off + 28);
    const elen = buf.readUInt16LE(off + 30);
    const clen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nlen);
    off += 46 + nlen + elen + clen;
    if (name.endsWith('/')) { continue; }
    if (flags & 1) { throw new Error('Encrypted ZIP entries are not supported.'); }
    if (lho + 30 > buf.length || buf.readUInt32LE(lho) !== 0x04034b50) { throw new Error('Corrupt ZIP local header.'); }
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const raw = buf.subarray(start, start + csize);
    let data: Buffer;
    if (method === 0) { data = Buffer.from(raw); }
    else if (method === 8) { data = zlib.inflateRawSync(raw, { maxOutputLength: MAX_INFLATED }); }
    else { throw new Error(`Unsupported ZIP compression method ${method}.`); }
    inflated += data.length;
    if (inflated > MAX_INFLATED) { throw new Error('ZIP expands beyond the allowed size.'); }
    out.push({ name, data, store: method === 0 });
  }
  return out;
}

export function writeZip(entries: ZipEntry[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const crc = crc32(e.data);
    const method = e.store ? 0 : 8;
    const body = e.store ? e.data : zlib.deflateRawSync(e.data, { level: 9 });
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12);                     // 1980-01-01 00:00 (reproducible output)
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(e.data.length, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    parts.push(lh, name, body);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(method, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(e.data.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += lh.length + name.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}
