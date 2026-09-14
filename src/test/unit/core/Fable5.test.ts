import { buildPreview } from '../../../core/harness/DiffPreview';
import { logDecision } from '../../../core/harness/DecisionLog';
import { decide } from '../../../core/reception/Decider';
describe('Fable5 Fase3', () => {
  it('preview acota a fuentes evidenciadas', () => {
    const md = buildPreview('login', ['apps/users/views.py'], ['apps']);
    expect(md).toContain('apps/users/views.py');
    expect(md).toContain('preview');
  });
  it('logDecision escribe jsonl sin romper', async () => {
    const writes: string[] = [];
    const mcp = { executeTool: async (_s: string, t: string, p: Record<string, unknown>) => {
      if (t === 'read_file') { throw new Error('nf'); }
      writes.push(String(p.content)); return { ok: true };
    } } as never;
    await logDecision(mcp, 'hola', decide('hola', null), { stack: 'x' });
    expect(writes.length).toBe(1);
    expect(writes[0]).toContain('"route"');
  });
});
