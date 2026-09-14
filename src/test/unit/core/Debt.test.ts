import { emptyDebt, applyDelta, deltaFor } from '../../../core/platform/DebtTracker';
describe('DebtTracker Cap.11', () => {
  it('delta deterministico sin LLM', () => {
    expect(deltaFor('dod-blocked:SPEC-1')).toBe(15);
    expect(deltaFor('onboard')).toBe(-10);
  });
  it('pagar deuda baja el score sin negativizar', () => {
    const s = applyDelta(applyDelta(emptyDebt(), 'dod-blocked:x'), 'onboard');
    expect(s.score).toBe(5);
    expect(applyDelta(emptyDebt(), 'onboard').score).toBe(0);
  });
  it('techo roto se detecta', () => {
    let s = emptyDebt();
    for (let i = 0; i < 8; i++) { s = applyDelta(s, 'dod-blocked:x'); }
    expect(s.score).toBeGreaterThanOrEqual(s.ceiling);
  });
});
