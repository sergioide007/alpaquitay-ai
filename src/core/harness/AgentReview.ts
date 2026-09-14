// Cap.12 Revision con agentes + Cap.09 techo real.
// Review automatico pre-apply: SOLID rapido, secretos, tests y alcance.
// Si la deuda rompio el techo, Build se bloquea hasta pagar.
import { DebtState } from '../platform/DebtTracker';
export interface ReviewFinding { level: 'ok' | 'warn' | 'block'; rule: string; detail: string; }
export interface ReviewReport { pass: boolean; findings: ReviewFinding[]; }
const SECRET_RE = /(api[_-]?key|secret|password|passwd|token|BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16})/i;
export function reviewDiff(relPath: string, before: string, after: string, sources: string[]): ReviewReport {
  const findings: ReviewFinding[] = [];
  if (/\.env$|\.pem$|\.key$|id_rsa/i.test(relPath)) {
    findings.push({ level: 'block', rule: 'seguridad', detail: `ruta protegida: ${relPath}` });
  }
  if (sources.length && !sources.some(s => s === '.' || relPath.startsWith(s + '/') || relPath === s)) {
    findings.push({ level: 'block', rule: 'alcance', detail: `fuera de fuentes evidenciadas (${sources.join(',')})` });
  }
  const afterLines = after.split('\n');
  if (SECRET_RE.test(after)) {
    findings.push({ level: 'block', rule: 'secretos', detail: 'posible secreto en el contenido (api-key/password/token)' });
  }
  if (afterLines.length > 400) {
    findings.push({ level: 'warn', rule: 'SRP', detail: `archivo grande (${afterLines.length} lineas): considera partir (Uncle Bob: una razon para cambiar)` });
  }
  if (/console\.log\(|print\(|TODO|FIXME|not implemented|pass\s*$/.test(after)) {
    findings.push({ level: 'warn', rule: 'higiene', detail: 'rastros de debug/TODO: limpiar antes de done' });
  }
  if (before !== '' && after === before) {
    findings.push({ level: 'warn', rule: 'ruido', detail: 'sin cambios reales: no aporta, descarta con `no`' });
  }
  if (findings.length === 0) {
    findings.push({ level: 'ok', rule: 'review', detail: 'sin bloqueos: alcance ok, sin secretos, tamano razonable' });
  }
  return { pass: !findings.some(f => f.level === 'block'), findings };
}
export function reviewMarkdown(relPath: string, r: ReviewReport): string {
  const icon = r.pass ? '✅' : '⛔';
  const lines = [`> ${icon} **Review \`${relPath}\`** (agente, pre-apply)`];
  for (const f of r.findings) {
    const i = f.level === 'block' ? '⛔' : f.level === 'warn' ? '⚠️' : '✅';
    lines.push(`> ${i} ${f.rule}: ${f.detail}`);
  }
  return lines.join('\n');
}
export function debtBlocksBuild(s: DebtState | null): boolean {
  return !!s && s.score >= s.ceiling;
}
