import { reviewDiff, debtBlocksBuild } from '../../../core/harness/AgentReview';
describe('Review con agentes + techo real', () => {
  it('bloquea secreto en contenido', () => {
    const r = reviewDiff('apps/a.py', '', 'api_key = "AKIA1234567890ABCDEF"', ['apps']);
    expect(r.pass).toBe(false);
    expect(r.findings.some(f => f.rule === 'secretos')).toBe(true);
  });
  it('bloquea fuera de fuentes', () => {
    expect(reviewDiff('otro/a.py', '', 'x=1', ['apps']).pass).toBe(false);
  });
  it('pasa diff limpio evidenciado', () => {
    expect(reviewDiff('apps/a.py', 'x=1', 'x=2', ['apps']).pass).toBe(true);
  });
  it('techo roto bloquea Build', () => {
    expect(debtBlocksBuild({ version: 1, score: 120, ceiling: 100, events: [] })).toBe(true);
    expect(debtBlocksBuild({ version: 1, score: 20, ceiling: 100, events: [] })).toBe(false);
  });
});
