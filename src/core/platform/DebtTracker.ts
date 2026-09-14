// Codigo Sintetico Cap.11: la deuda agentica se mide, no se intuye.
// DebtTracker: cada decision riesgosa suma; cada gate pasado resta.
// Si el techo se rompe, el harness bloquea Build y exige pagar deuda primero.
export interface DebtState { version: 1; score: number; ceiling: number; events: Array<{ ts: string; delta: number; reason: string }>; }
const FILE = '.alpaquitay/debt.json';
const CEILING = 100;
export function emptyDebt(): DebtState { return { version: 1, score: 0, ceiling: CEILING, events: [] }; }
// Heuristica deterministica (sin LLM): diffs pendientes, DoD bloqueados,
// postmortems y deploys sin rollback suman; onboard, applies y dones restan.
export function deltaFor(reason: string): number {
  const r = reason.toLowerCase();
  if (r.startsWith('dod-blocked')) { return 15; }
  if (r.startsWith('postmortem')) { return 10; }
  if (r.startsWith('pending-diff')) { return 2; }
  if (r.startsWith('deploy-sin-rollback')) { return 25; }
  if (r.startsWith('onboard')) { return -10; }
  if (r.startsWith('apply')) { return -5; }
  if (r.startsWith('done-verificado')) { return -8; }
  return 1;
}
export function applyDelta(state: DebtState, reason: string): DebtState {
  const d = deltaFor(reason);
  const score = Math.max(0, Math.min(state.ceiling + 50, state.score + d));
  return { ...state, score, events: [...state.events.slice(-49), { ts: new Date().toISOString(), delta: d, reason: reason.slice(0, 120) }] };
}
export function debtMarkdown(s: DebtState): string {
  const bar = '█'.repeat(Math.round((s.score / s.ceiling) * 10)) + '░'.repeat(Math.max(0, 10 - Math.round((s.score / s.ceiling) * 10)));
  const status = s.score >= s.ceiling ? '⛔ TECHO ROTO — paga deuda antes de Build' : s.score >= s.ceiling * 0.7 ? '⚠️ alta — revisa antes de seguir' : '✅ sana';
  return [`> 🧾 Deuda agentica: **${s.score}/${s.ceiling}** ${status}`, `> \`${bar}\``, `> _Paga con: onboard, si aplicar, dones verificados._`].join('\n');
}
export const DEBT_FILE = FILE;
export const DEBT_CEILING = CEILING;
