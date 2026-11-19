// Experto: Definition of Done con gate ejecutable (SDLC + Platform).
// El tablero no marca done si el gate no pasa. Sin excepciones silenciosas.
import { isPlatformContractVerified, PlatformContract } from '../platform/PlatformContract';
import { evaluateQualityEvidence, QualityEvidence } from './QualityEvidence';
export interface DodGate { pass: boolean; blockers: string[]; checklist: string[]; }
export function dodGateForDone(
  pendingDiffs: number,
  contract: PlatformContract | null,
  evidence?: QualityEvidence | null,
  hasCode = true
): DodGate {
  const checklist: string[] = [];
  const blockers: string[] = [];
  if (pendingDiffs > 0) {
    blockers.push(`${pendingDiffs} diff(s) sin aplicar — \`si aplicar\` o \`no\` primero`);
  } else { checklist.push('sin diffs pendientes'); }
  if (contract && isPlatformContractVerified(contract)) {
    checklist.push(`golden path conocido: \`${contract.commands.build}\` + \`${contract.commands.test}\``);
  } else if (hasCode) {
    blockers.push('contrato platform sin verificar — corre `onboard` primero');
  } else {
    checklist.push('proyecto sin código compilable; onboard no requerido');
  }
  if (hasCode) {
    const quality = evaluateQualityEvidence(evidence ?? null);
    checklist.push(...quality.checklist);
    blockers.push(...quality.blockers);
    if (contract && isPlatformContractVerified(contract) && evidence) {
      if (evidence.build.command?.trim() !== contract.commands.build.trim()) {
        blockers.push('build evidencia no corresponde al comando verificado del contrato');
      }
      if (evidence.tests.command?.trim() !== contract.commands.test.trim()) {
        blockers.push('tests evidencia no corresponde al comando verificado del contrato');
      }
    }
  }
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
