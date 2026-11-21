import { createHash } from 'crypto';
import { MCPExecutor } from '../interfaces';

/**
 * Read-only incident analysis: find logs, keep only the lines that matter, redact secrets and
 * build a compact prompt. Everything here is deterministic and local: the model only sees the
 * condensed evidence, which is the largest token saving of the whole investigation flow.
 */
export interface LogEvidence { source: string; excerpt: string; totalLines: number; keptLines: number }

const LOG_DIRS = ['.', 'logs', 'log', 'tmp', 'out', '.alpaquitay/logs'];
const LOG_FILE_RE = /(\.log|\.err|\.out)$|^npm-debug|^yarn-error|^pnpm-debug/i;
const ERROR_RE = /(error|exception|fatal|panic|traceback|failed|failure|denied|refused|timed? ?out|ECONN\w+|ENOENT|EACCES|EADDRINUSE|ETIMEDOUT|segfault|unhandled|cannot |\bat\s+\S+\s*\(|\s+at\s+\S+:\d+)/i;
const MAX_FILES = 4;
const MAX_READ_CHARS = 400_000;

export function redactSecrets(text: string): string {
  return text
    .replace(/\b(authorization|bearer)\b(\s*[:=]?\s*)[A-Za-z0-9._~+/=-]{12,}/gi, '$1$2[REDACTED]')
    .replace(/\b(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g, '[REDACTED]')
    .replace(/((?:api[_-]?key|secret|token|password|passwd|pwd)\s*[:=]\s*)(['"]?)[^\s'"&]+/gi, '$1$2[REDACTED]')
    .replace(/(\w+:\/\/[^:\s/]+:)[^@\s]+@/g, '$1[REDACTED]@');
}

/** Same line with different timestamps/ids/numbers collapses into one entry with a counter. */
function dedupeKey(line: string): string {
  return line.replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, '<ts>').replace(/0x[0-9a-f]+|\d+/gi, '#').trim();
}

/**
 * Keeps error lines with surrounding context plus the tail, collapses repeats and prefers the most
 * recent events when the budget is tight (the failure you are debugging is usually the last one).
 */
export function condenseLog(text: string, maxChars = 5000, context = 2): { excerpt: string; totalLines: number; keptLines: number } {
  const lines = text.split(/\r?\n/);
  const keep = new Set<number>();
  lines.forEach((l, i) => {
    if (ERROR_RE.test(l)) { for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) { keep.add(k); } }
  });
  for (let k = Math.max(0, lines.length - 8); k < lines.length; k++) { keep.add(k); }
  const ordered = [...keep].sort((a, b) => a - b);

  const out: string[] = [];
  let prevIdx = -2; let prevKey = ''; let repeat = 0;
  const flush = () => { if (repeat > 0) { out[out.length - 1] += `  (x${repeat + 1})`; repeat = 0; } };
  for (const i of ordered) {
    const line = lines[i].length > 300 ? lines[i].slice(0, 300) + '...' : lines[i];
    if (line.trim() === '') { continue; }
    const key = dedupeKey(line);
    if (key === prevKey && i === prevIdx + 1) { repeat++; prevIdx = i; continue; }
    flush();
    if (i !== prevIdx + 1 && out.length > 0) { out.push('...'); }
    out.push(line); prevKey = key; prevIdx = i;
  }
  flush();

  let acc = 0; const picked: string[] = [];
  for (let i = out.length - 1; i >= 0; i--) {
    if (acc + out[i].length + 1 > maxChars) { picked.unshift('... (anteriores omitidas)'); break; }
    acc += out[i].length + 1; picked.unshift(out[i]);
  }
  return { excerpt: redactSecrets(picked.join('\n')), totalLines: lines.length, keptLines: ordered.length };
}

function safeRel(p: string): boolean { return !!p && !p.includes('..') && !/^([a-zA-Z]:)?[\\/]/.test(p); }

export async function collectEvidence(mcp: MCPExecutor, question: string, hintedPaths: string[] = []): Promise<LogEvidence[]> {
  const evidence: LogEvidence[] = [];
  const budget = 6000;

  // 1) A trace pasted in the message is the best evidence: the user already picked it.
  const pastedLines = question.split(/\r?\n/);
  if (pastedLines.length >= 4 || ERROR_RE.test(question) && question.length > 200) {
    const c = condenseLog(question, 3000);
    evidence.push({ source: 'mensaje del usuario', ...c });
  }

  // 2) Files the user named explicitly, then log files found in the usual places.
  const candidates: string[] = hintedPaths.filter(safeRel);
  for (const dir of LOG_DIRS) {
    if (candidates.length >= MAX_FILES) { break; }
    try {
      const entries = await mcp.executeTool('filesystem', 'list_files', { path: dir }) as Array<{ name: string; isDirectory: boolean }>;
      for (const e of entries) {
        if (!e.isDirectory && LOG_FILE_RE.test(e.name)) {
          const rel = dir === '.' ? e.name : `${dir}/${e.name}`;
          if (!candidates.includes(rel)) { candidates.push(rel); }
        }
      }
    } catch { /* missing directory: next one */ }
  }
  const files = candidates.slice(0, MAX_FILES);
  const per = Math.max(1500, Math.floor(budget / Math.max(1, files.length)));
  for (const rel of files) {
    try {
      const f = await mcp.executeTool('filesystem', 'read_file', { path: rel }) as { content: string };
      const c = condenseLog(f.content.slice(-MAX_READ_CHARS), per);
      if (c.excerpt.trim()) { evidence.push({ source: rel, ...c }); }
    } catch { /* unreadable: skip, never fail the analysis */ }
  }
  return evidence;
}

/** Stable system prompt first (cacheable prefix); only the evidence and the question change per call. */
export const INVESTIGATION_SYSTEM =
  'You are a senior engineer doing a read-only incident analysis. Use ONLY the evidence provided; never invent file paths, versions or log lines. ' +
  'Answer in the same language as the question, in this structure: ' +
  '1) Diagnostico: one sentence. ' +
  '2) Evidencia: the exact lines that support it, with the source name. ' +
  '3) Causa probable: with confidence (alta, media, baja). ' +
  '4) Como verificarlo: read-only commands or checks. ' +
  '5) Correccion propuesta: the concrete change; state that nothing is applied until the user confirms. ' +
  'If the evidence is not enough, say exactly which log, command output or file you need. No emojis, no decorative markers, no preamble.';

export function buildInvestigationPrompt(question: string, evidence: LogEvidence[]): { system: string; user: string; key: string } {
  const body = evidence.map(e => `### ${e.source} (${e.keptLines}/${e.totalLines} lineas relevantes)\n${e.excerpt}`).join('\n\n');
  const user = `Pregunta: ${question.split(/\r?\n/)[0].slice(0, 400)}\n\nEvidencia:\n${body}`;
  const key = createHash('sha256').update(INVESTIGATION_SYSTEM).update(user).digest('hex');
  return { system: INVESTIGATION_SYSTEM, user, key };
}

/** Small TTL cache: the same question over unchanged logs costs zero tokens the second time. */
export class AnswerCache {
  private readonly store = new Map<string, { answer: string; model: string; at: number }>();
  constructor(private readonly ttlMs = 10 * 60_000, private readonly max = 20) {}
  get(key: string): { answer: string; model: string } | undefined {
    const hit = this.store.get(key);
    if (!hit) { return undefined; }
    if (Date.now() - hit.at > this.ttlMs) { this.store.delete(key); return undefined; }
    return hit;
  }
  set(key: string, answer: string, model: string): void {
    if (this.store.size >= this.max) { const first = this.store.keys().next().value; if (first !== undefined) { this.store.delete(first); } }
    this.store.set(key, { answer, model, at: Date.now() });
  }
}
