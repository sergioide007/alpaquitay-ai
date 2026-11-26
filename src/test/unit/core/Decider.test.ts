import { decide } from '../../../core/reception/Decider';
describe('Decider lanes', () => {
  const fp = { version: 2 as const, roots: ['.'], sourceDirs: ['apps/users'], languages: [], frameworks: ['Django + DRF'], entryPoints: ['manage.py'], pkgManager: 'pip' as const, hasSpec: false, monorepo: false, scannedAt: '' };
  it('chat corto va a flash sin confirmacion', () => {
    const d = decide('que es un JWT?', fp);
    expect(d.lane).toBe('flash'); expect(d.needsConfirm).toBe(false);
  });
  it('codigo pide confirmacion (no va directo)', () => {
    const d = decide('crea el endpoint de login', fp);
    expect(d.route).toBe('code'); expect(d.needsConfirm).toBe(false);
  });
  it('idea va a ideate flash', () => {
    const d = decide('tengo una idea desordenada de marketplace', fp);
    expect(d.route).toBe('ideate'); expect(d.lane).toBe('flash');
  });
  it('expert vocabulary in Spanish or English goes to a specialist (Deep), with confirmation', () => {
    for (const text of ['haz un modelo de amenazas STRIDE del flujo de pagos', 'genera un SBOM de este proyecto', 'evalua el pipeline frente a OWASP SAMM',
      'prepara el despliegue en AWS', 'zero trust para la red interna', 'revision FinOps de la cuenta', 'threat model the payments API']) {
      const d = decide(text, fp);
      expect([text, d.route, d.lane, d.needsConfirm]).toEqual([text, 'specialist', 'deep', true]);
    }
  });
  it('ordinary words that merely contain those letters do not trigger a specialist', () => {
    for (const text of ['corrige el bug del login', 'que es un JWT?', 'add a cardiac monitor component', 'the laws page needs a fix']) {
      expect([text, decide(text, fp).route === 'specialist']).toEqual([text, false]);
    }
  });
});
