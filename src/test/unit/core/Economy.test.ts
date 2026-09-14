import { emptyEcon, recordLlm, recordLocal, econChip, estimateTokens } from '../../../core/platform/Economy';
describe('Economy Cap.01/18', () => {
  it('estima tokens ~4 chars', () => {
    expect(estimateTokens('1234')).toBe(1);
    expect(estimateTokens('x'.repeat(400))).toBe(100);
  });
  it('registra LLM y local por separado', () => {
    let s = emptyEcon('s1');
    s = recordLlm(s, 400, 400);
    s = recordLocal(s);
    expect(s.llmCalls).toBe(1);
    expect(s.localOps).toBe(1);
    expect(s.estTokens).toBe(200);
  });
  it('chip muestra resumen legible', () => {
    expect(econChip(emptyEcon('s'))).toMatch(/0 LLM/);
  });
});
