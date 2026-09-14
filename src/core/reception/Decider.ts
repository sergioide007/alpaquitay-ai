import { WorkspaceFingerprint } from '../context/WorkspaceFingerprinter';
export type { WorkspaceFingerprint };

export type Lane = 'flash' | 'build' | 'deep';
export type Route = 'chat' | 'ideate' | 'spec' | 'code' | 'specialist';
export interface Decision {
  route: Route; lane: Lane; confidence: number;
  reasons: string[]; needsConfirm: boolean; chip: string;
}
// Carriles al estilo Uncle Bob + Fowler + Codigo Sintetico:
// flash = rapido y barato (Cap.01/18 economia), build = SDD con arnes (Cap.05),
// deep = orquestacion especialista (Cap.08 SOLID para agentes, Cap.10 DDD+Kafka).
const CHAT_RE = /(hola|gracias|que es|qué es|explica|resume|duda|ayuda|como|Cómo|cómo)/i;
const IDEATE_RE = /(idea|se me ocurre|ordena|brainstorm|no se por donde|empezar|alcance)/i;
const SPEC_RE = /(spec|epica|épica|kanban|tablero|tarea SPEC|promover a spec)/i;
const CODE_RE = /(crea|genera|implementa|corrige|arregla|refactor|test|error|falla|traceback|archivo|endpoint|componente|fix|bug)/i;
const OPS_RE = /(deploy|pipeline|docker|terraform|aws|azure|gcp|iac|dora|pentest|threat)/i;
export function decide(text: string, fp: WorkspaceFingerprint | null): Decision {
  const t = text.toLowerCase();
  const reasons: string[] = [];
  if (fp) { reasons.push(`stack:${fp.frameworks[0] ?? 'desconocido'}|src:${fp.sourceDirs.join(',') || '.'}`); }
  if (OPS_RE.test(t)) { return { route: 'specialist', lane: 'deep', confidence: 0.85, reasons: ['ops/infra -> especialista'], needsConfirm: true, chip: '🧠 Deep · specialist' }; }
  if (SPEC_RE.test(t)) { return { route: 'spec', lane: 'build', confidence: 0.88, reasons: ['menciona spec/kanban'], needsConfirm: false, chip: '🔨 Build · spec' }; }
  if (IDEATE_RE.test(t)) { return { route: 'ideate', lane: 'flash', confidence: 0.8, reasons: ['idea desordenada -> inbox'], needsConfirm: false, chip: '⚡ Flash · ideate' }; }
  if (CODE_RE.test(t)) {
    const conf = /hola|gracias/.test(t) ? 0.55 : 0.78;
    return { route: 'code', lane: 'build', confidence: conf, reasons: ['verbo de codigo detectado'], needsConfirm: conf < 0.75, chip: '🔨 Build · code' };
  }
  if (CHAT_RE.test(t) || text.trim().split(/\s+/).length <= 12) {
    return { route: 'chat', lane: 'flash', confidence: 0.82, reasons: ['pregunta corta/general'], needsConfirm: false, chip: '⚡ Flash · chat' };
  }
  return { route: 'chat', lane: 'flash', confidence: 0.6, reasons: ['ambiguo -> aclarar'], needsConfirm: true, chip: '⚡ Flash · aclarar' };
}
