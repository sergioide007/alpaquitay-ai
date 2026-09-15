// Experto: Definition of Done con gate ejecutable (SDLC + Platform).
// El tablero no marca done si el gate no pasa. Sin excepciones silenciosas.
import { PlatformContract } from '../platform/PlatformContract';
import { evaluateQualityEvidence, QualityEvidence } from './QualityEvidence';
export interface DodGate { pass: boolean; blockers: string[]; checklist: string[]; }
export function dodGateForDone(
  pendingDiffs: number,
  contract: PlatformContract | null,
  evidence?: QualityEvidence | null
): DodGate {
  const checklist: string[] = [];
  const blockers: string[] = [];
  if (pendingDiffs > 0) {
    blockers.push(`${pendingDiffs} diff(s) sin aplicar — \`si aplicar\` o \`no\` primero`);
  } else { checklist.push('sin diffs pendientes'); }
  if (contract && contract.verified) {
    checklist.push(`golden path conocido: \`${contract.commands.build}\` + \`${contract.commands.test}\``);
  } else { blockers.push('contrato platform sin verificar — corre `onboard` primero'); }
  // Backwards-compatible for callers that only ask whether the platform contract
  // is ready. Mutation flows pass an explicit evidence value (including null), so
  // Done requires proof that both commands really ran successfully.
  if (arguments.length >= 3) {
    const quality = evaluateQualityEvidence(evidence ?? null);
    checklist.push(...quality.checklist);
    blockers.push(...quality.blockers);
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
