// Cap.01/18 Economia: cada llamada LLM cuesta. El harness lo mide por sesion
// y lo muestra en el chip. Sin telemetria externa: tokens estimados + llamadas.
export interface EconState { version: 1; sessionId: string; llmCalls: number; estTokens: number; localOps: number; }
const FILE = '.alpaquitay/economy.json';
// Estimacion honesta: ~4 chars por token (heuristica estandar para latinos+code).
export function estimateTokens(s: string): number { return Math.ceil(s.length / 4); }
export function emptyEcon(sessionId: string): EconState { return { version: 1, sessionId, llmCalls: 0, estTokens: 0, localOps: 0 }; }
export function recordLlm(s: EconState, promptChars: number, completionChars: number): EconState {
  return { ...s, llmCalls: s.llmCalls + 1, estTokens: s.estTokens + estimateTokens('x'.repeat(promptChars)) + estimateTokens('x'.repeat(completionChars)) };
}
export function recordLocal(s: EconState): EconState { return { ...s, localOps: s.localOps + 1 }; }
export function econChip(s: EconState): string {
  const k = s.estTokens >= 1000 ? `${(s.estTokens / 1000).toFixed(1)}k` : `${s.estTokens}`;
  return `💰 ${s.llmCalls} LLM · ~${k} tok · ${s.localOps} local gratis`;
}
export function econMarkdown(s: EconState): string {
  return [`> 💰 **Economia de sesion** — ${econChip(s)}`, `> _Local gratis (dora/deuda/postmortem/diff/review): ${s.localOps}. Cada Build confirmado = 2-4 llamadas._`, `> _Ahorra con: preguntas cortas en Flash, \`onboard\` una vez, diffs en lote._`].join('\n');
}
export const ECON_FILE = FILE;
