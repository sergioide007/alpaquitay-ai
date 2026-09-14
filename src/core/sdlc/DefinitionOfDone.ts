// Experto: Definition of Done con gate ejecutable (SDLC + Platform).
// El tablero no marca done si el gate no pasa. Sin excepciones silenciosas.
import { PlatformContract } from '../platform/PlatformContract';
export interface DodGate { pass: boolean; blockers: string[]; checklist: string[]; }
export function dodGateForDone(pendingDiffs: number, contract: PlatformContract | null): DodGate {
  const checklist: string[] = [];
  const blockers: string[] = [];
  if (pendingDiffs > 0) {
    blockers.push(`${pendingDiffs} diff(s) sin aplicar — \`si aplicar\` o \`no\` primero`);
  } else { checklist.push('sin diffs pendientes'); }
  if (contract && contract.verified) {
    checklist.push(`test conocido: \`${contract.commands.test}\``);
  } else { blockers.push('contrato platform sin verificar — corre `onboard` primero'); }
  checklist.push('checkpoint antes de escribir (harness)');
  checklist.push('PolicyGuard: sin secretos tocados');
  return { pass: blockers.length === 0, blockers, checklist };
}
export function dodGateMarkdown(g: DodGate): string {
  const icon = g.pass ? '✅' : '⛔';
  const lines = [`> ${icon} **DoD gate ${g.pass ? 'pasado' : 'bloqueado'}**`];
  for (const c of g.checklist) { lines.push(`> - ✅ ${c}`); }
  for (const b of g.blockers) { lines.push(`> - ⛔ ${b}`); }
  return lines.join('\n');
}
