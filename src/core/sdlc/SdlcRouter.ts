// SDLC como harness (experto SDLC + Codigo Sintetico Cap.04 gates + Cap.11 deuda).
// Cada fase entra por el Decider y sale solo si pasa su gate. Sin gate, no avanza.
// Fases: Requisitos -> Diseno -> Implementacion -> Pruebas -> Despliegue -> Mantenimiento.
import { WorkspaceFingerprint } from '../context/WorkspaceFingerprinter';
import { Lane, Route } from '../reception/Decider';
export type SdlcPhase = 'requisitos' | 'diseno' | 'implementacion' | 'pruebas' | 'despliegue' | 'mantenimiento' | 'ninguna';
export interface SdlcDecision { phase: SdlcPhase; gate: string; lane: Lane; route: Route; }
const REQ = /(requisito|idea|alcance|historia|necesito|quiero|objetivo|storie|epica|épica)/i;
const DES = /(disen|diseñ|arquitectura|adr|diagrama|modelo|esquema|decisi[oó]n t[eé]cnica)/i;
const IMPL = /(crea|genera|implementa|corrige|arregla|refactor|endpoint|componente|archivo|fix|bug|error|traceback)/i;
const TEST = /(test|prueba|coverage|cobertura|qa|validar|e2e|unit|integraci[oó]n)/i;
const DEP = /(deploy|despliegue|pipeline|docker|release|publicar|rollback|terraform|aws|iac|dora)/i;
const MAINT = /(monitoreo|logs|observabilidad|deuda|dependabot|upgrade|migraci[oó]n|incidente|postmortem|oncall)/i;
export function sdlcPhase(text: string, _fp: WorkspaceFingerprint | null): SdlcDecision {
  const t = text.toLowerCase();
  if (DEP.test(t)) { return { phase: 'despliegue', gate: 'pipeline verde + aprobacion humana + rollback listo', lane: 'deep', route: 'specialist' }; }
  if (TEST.test(t)) { return { phase: 'pruebas', gate: 'happy-path + borde + error por metodo publico', lane: 'build', route: 'code' }; }
  if (DES.test(t)) { return { phase: 'diseno', gate: 'ADR registrado + sin dependencias circulares', lane: 'deep', route: 'specialist' }; }
  if (MAINT.test(t)) { return { phase: 'mantenimiento', gate: 'runbook + alerta + dueno del servicio', lane: 'deep', route: 'specialist' }; }
  if (IMPL.test(t)) { return { phase: 'implementacion', gate: 'SOLID + preview + checkpoint + build/test', lane: 'build', route: 'code' }; }
  if (REQ.test(t)) { return { phase: 'requisitos', gate: 'objetivo + alcance + no-alcance + dueno', lane: 'flash', route: 'ideate' }; }
  return { phase: 'ninguna', gate: 'aclarar antes de tocar disco', lane: 'flash', route: 'chat' };
}
// Gate de salida de implementacion (Cap.11: bloquear deuda agentica antes de prod).
export function implGateCheck(files: string[], sources: string[]): { pass: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (files.length === 0) { blockers.push('sin archivos: nada que verificar'); }
  if (files.length > 6) { blockers.push('>6 archivos: partir en lotes (Fowler: pasos pequenos)'); }
  for (const f of files) {
    if (f.includes('..')) { blockers.push(`path traversal: ${f}`); }
    if (/\.env$|\.pem$|\.key$|id_rsa/i.test(f)) { blockers.push(`secreto protegido: ${f}`); }
    if (sources.length && !sources.some(s => s === '.' || f.startsWith(s + '/') || f.startsWith(s))) {
      blockers.push(`fuera de fuentes evidenciadas (${sources.join(',')}): ${f}`);
    }
  }
  return { pass: blockers.length === 0, blockers };
}
