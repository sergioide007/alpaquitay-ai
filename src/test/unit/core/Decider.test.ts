import { decide } from '../../../core/reception/Decider';
describe('Decider lanes', () => {
  const fp = { version: 1 as const, roots: ['.'], sourceDirs: ['apps/users'], languages: [], frameworks: ['Django + DRF'], entryPoints: ['manage.py'], pkgManager: 'pip' as const, hasSpec: false, monorepo: false, scannedAt: '' };
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
});
