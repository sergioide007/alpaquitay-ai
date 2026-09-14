import { doraFrom } from '../../../core/platform/Dora';
describe('DORA experto', () => {
  it('sin commits no inventa nivel', () => {
    expect(doraFrom([]).level).toMatch(/sin datos/);
  });
  it('calcula failure rate y traza SPEC', () => {
    const d = doraFrom([
      { hash: 'a', author: 'x', relativeTime: 'hoy', message: 'feat #SPEC-001 login', specRef: 'SPEC-001' },
      { hash: 'b', author: 'x', relativeTime: 'hoy', message: 'fix hotfix login' },
      { hash: 'c', author: 'x', relativeTime: 'hoy', message: 'feat #SPEC-002 perfil', specRef: 'SPEC-002' },
    ]);
    expect(d.commits).toBe(3); expect(d.specLinked).toBe(2);
    expect(d.failureRate).toMatch(/33%/);
  });
});
