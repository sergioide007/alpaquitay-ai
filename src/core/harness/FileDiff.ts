// Experto: diff real pre-write (FABLE-5 B/L + Cap.09 invariantes).
// Toda escritura del harness muestra diff unificado ANTES de aplicar.
// Lineal, sin dependencias: LCS sobre lineas, suficiente para preview.
export interface FileDiff { path: string; isNew: boolean; added: number; removed: number; diff: string; }
export function unifiedDiff(relPath: string, before: string, after: string, ctx = 2): FileDiff {
  const a = before.split('\n'); const b = after.split('\n');
  if (before === '' || before === '\n') {
    const lines = b.slice(0, 60).map(l => `+${l}`);
    return { path: relPath, isNew: true, added: b.length, removed: 0, diff: `--- /dev/null\n+++ ${relPath}\n` + lines.join('\n') };
  }
  // LCS simple con limite para no explotar en archivos grandes
  const N = Math.min(a.length, 400); const M = Math.min(b.length, 400);
  const aa = a.slice(0, N); const bb = b.slice(0, M);
  const dp: number[][] = Array.from({ length: N + 1 }, () => new Array(M + 1).fill(0));
  for (let i = N - 1; i >= 0; i--) { for (let j = M - 1; j >= 0; j--) { dp[i][j] = aa[i] === bb[j] ? (dp[i + 1]?.[j + 1] ?? 0) + 1 : Math.max(dp[i + 1]?.[j] ?? 0, dp[i]?.[j + 1] ?? 0); } }
  type Op = { t: ' ' | '+' | '-'; l: string };
  const ops: Op[] = [];
  let i = 0; let j = 0;
  while (i < N && j < M) {
    if (aa[i] === bb[j]) { ops.push({ t: ' ', l: aa[i] as string }); i++; j++; }
    else if ((dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0)) { ops.push({ t: '-', l: aa[i] as string }); i++; }
    else { ops.push({ t: '+', l: bb[j] as string }); j++; }
  }
  while (i < N) { ops.push({ t: '-', l: aa[i++] as string }); }
  while (j < M) { ops.push({ t: '+', l: bb[j++] as string }); }
  const changed = ops.map((o, k) => o.t === ' ' ? -1 : k).filter(k => k >= 0);
  const keep = new Set<number>();
  for (const k of changed) { for (let d = -ctx; d <= ctx; d++) { if (ops[k + d]?.t === ' ') { keep.add(k + d); } } keep.add(k); }
  const out = [`--- a/${relPath}`, `+++ b/${relPath}`];
  ops.forEach((o, k) => { if (o.t !== ' ' || keep.has(k)) { out.push(`${o.t} ${o.l}`.slice(0, 300)); } });
  const added = ops.filter(o => o.t === '+').length; const removed = ops.filter(o => o.t === '-').length;
  return { path: relPath, isNew: false, added, removed, diff: out.slice(0, 120).join('\n') };
}
export function diffMarkdown(d: FileDiff): string {
  const tag = d.isNew ? 'nuevo' : `+${d.added}/-${d.removed}`;
  return [`**Diff \`${d.path}\` (${tag}) — sin aplicar aun**`, '', '```diff', d.diff.slice(0, 3000), '```', '', '_Responde `si aplicar` para escribir con checkpoint, o `no` para descartar._'].join('\n');
}
