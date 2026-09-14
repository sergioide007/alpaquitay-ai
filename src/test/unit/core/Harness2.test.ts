import { guardWrite } from '../../../core/harness/PolicyGuard';
import { IdeaInbox } from '../../../core/reception/IdeaInbox';
describe('Fase 2 harness', () => {
  it('PolicyGuard niega secretos', () => {
    expect(guardWrite('.env').verdict).toBe('deny');
    expect(guardWrite('id_rsa').verdict).toBe('deny');
    expect(guardWrite('apps/users/views.py').verdict).toBe('confirm');
  });
  it('IdeaInbox estructura sin LLM', () => {
    const inbox = new IdeaInbox({ executeTool: async () => { throw new Error('x'); } } as never);
    const s = inbox.structure('Quiero un marketplace. Con login. Sin pagos por ahora.');
    expect(s?.objetivo).toBeTruthy();
    expect(s?.preguntas?.length).toBe(3);
  });
});
