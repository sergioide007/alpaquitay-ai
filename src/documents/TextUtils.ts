/** XML/HTML helpers and a word-level diff shared by the document adapters and the Docs tab. */
export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»' };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

export function countWords(s: string): number { return (s.match(/\S+/g) ?? []).length; }

export type DiffOp = { t: 'eq' | 'del' | 'ins'; s: string };
/** Word-level diff (LCS over whitespace-preserving tokens). Falls back to whole-text replace on huge inputs. */
export function wordDiff(a: string, b: string): DiffOp[] {
  if (a === b) { return a ? [{ t: 'eq', s: a }] : []; }
  const ta = a.split(/(\s+)/).filter(x => x !== '');
  const tb = b.split(/(\s+)/).filter(x => x !== '');
  if (ta.length * tb.length > 4_000_000) { return [{ t: 'del', s: a }, { t: 'ins', s: b }]; }
  const n = ta.length, m = tb.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = ta[i] === tb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffOp[] = [];
  const push = (t: DiffOp['t'], s: string) => { const l = out[out.length - 1]; if (l && l.t === t) { l.s += s; } else { out.push({ t, s }); } };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (ta[i] === tb[j]) { push('eq', ta[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push('del', ta[i++]); }
    else { push('ins', tb[j++]); }
  }
  while (i < n) { push('del', ta[i++]); }
  while (j < m) { push('ins', tb[j++]); }
  return out;
}

/** Number of words that differ between two texts (the larger of removed / added). */
export function changedWords(a: string, b: string): number {
  let del = 0, ins = 0;
  for (const o of wordDiff(a, b)) { if (o.t === 'del') { del += countWords(o.s); } else if (o.t === 'ins') { ins += countWords(o.s); } }
  return Math.max(del, ins);
}

/** Share of `a`'s words that were changed, 0..1 — used to flag unusually large rewrites for human review. */
export function changeRatio(a: string, b: string): number {
  return Math.min(1, changedWords(a, b) / Math.max(1, countWords(a)));
}
