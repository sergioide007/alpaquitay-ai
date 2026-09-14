import { sdlcPhase, implGateCheck } from '../../../core/sdlc/SdlcRouter';
describe('SDLC router', () => {
  it('requisitos van a ideate flash con gate de dueno', () => {
    const r = sdlcPhase('quiero una historia de login con alcance claro', null);
    expect(r.phase).toBe('requisitos'); expect(r.lane).toBe('flash');
    expect(r.gate).toMatch(/no-alcance/);
  });
  it('deploy va a deep con gate de rollback', () => {
    const r = sdlcPhase('haz el deploy con docker y pipeline', null);
    expect(r.phase).toBe('despliegue'); expect(r.lane).toBe('deep');
    expect(r.gate).toMatch(/rollback/);
  });
  it('implGate bloquea secretos y fuera-de-fuentes', () => {
    const g = implGateCheck(['apps/x.py', '.env'], ['apps']);
    expect(g.pass).toBe(false);
    expect(g.blockers.join(' ')).toMatch(/secreto/);
  });
  it('implGate pasa con archivos evidenciados', () => {
    expect(implGateCheck(['apps/a.py'], ['apps']).pass).toBe(true);
  });
});
