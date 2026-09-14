import { classifyFailure, postmortemMarkdown } from '../../../core/platform/Postmortem';
describe('Postmortem experto', () => {
  it('clasifica test en rojo', () => {
    const pm = classifyFailure('FAIL src/x.test.ts: expected 1 to be 2');
    expect(pm.kind).toBe('test');
  });
  it('clasifica build roto', () => {
    expect(classifyFailure('error TS2307: Cannot find module').kind).toBe('build');
  });
  it('clasifica bloqueo de PolicyGuard', () => {
    expect(classifyFailure('Bloqueado por PolicyGuard: protegido .env').kind).toBe('write');
  });
  it('markdown incluye comando de verificacion', () => {
    expect(postmortemMarkdown('login', classifyFailure('x'), 'pytest')).toContain('pytest');
  });
});
