import { condenseLog, redactSecrets, buildInvestigationPrompt, collectEvidence, AnswerCache } from '../../../core/investigate/LogInvestigator';
import { decide } from '../../../core/reception/Decider';

describe('LogInvestigator', () => {
  it('redacts tokens, passwords and connection strings', () => {
    const r = redactSecrets('Authorization: Bearer abcdefghijklmnop1234 password=hunter2 db=postgres://u:pw123@host/db key sk-abcdefghijklmnopqrst');
    expect(r).not.toMatch(/abcdefghijklmnop1234|hunter2|pw123|sk-abcdef/);
    expect(r).toContain('[REDACTED]');
  });
  it('keeps error context, collapses repeats and drops noise', () => {
    const noise = Array.from({ length: 300 }, (_, i) => `2026-11-21 10:00:${String(i % 60).padStart(2, '0')} INFO heartbeat ok`);
    const log = [...noise, 'ERROR connect ECONNREFUSED 127.0.0.1:5432', '  at Pool.connect (db.js:10:5)', ...Array(5).fill('2026-11-21 10:01:00 WARN retry 3')].join('\n');
    const c = condenseLog(log, 1000);
    expect(c.excerpt).toContain('ECONNREFUSED');
    expect(c.excerpt).toMatch(/\(x5\)/);
    expect(c.excerpt.length).toBeLessThan(1100);
    expect(c.keptLines).toBeLessThan(c.totalLines / 5);
  });
  it('prompt prefix is stable so provider caches can hit', () => {
    const a = buildInvestigationPrompt('por que falla?', [{ source: 'a.log', excerpt: 'x', totalLines: 1, keptLines: 1 }]);
    const b = buildInvestigationPrompt('otra pregunta', [{ source: 'a.log', excerpt: 'y', totalLines: 1, keptLines: 1 }]);
    expect(a.system).toBe(b.system);
    expect(a.key).not.toBe(b.key);
  });
  it('collects workspace logs and refuses path traversal hints', async () => {
    const calls: string[] = [];
    const mcp = { executeTool: async (_s: string, tool: string, p: { path: string }) => {
      calls.push(`${tool}:${p.path}`);
      if (tool === 'list_files') { return p.path === 'logs' ? [{ name: 'app.log', isDirectory: false }] : []; }
      return { content: 'INFO ok\nERROR boom at x.js:1\n' };
    } };
    const ev = await collectEvidence(mcp as never, 'revisa los logs', ['../../etc/passwd']);
    expect(ev.map(e => e.source)).toEqual(['logs/app.log']);
    expect(calls.some(c => c.includes('etc/passwd'))).toBe(false);
  });
  it('answer cache expires', () => {
    const c = new AnswerCache(1, 2);
    c.set('k', 'a', 'm');
    return new Promise<void>(res => setTimeout(() => { expect(c.get('k')).toBeUndefined(); res(); }, 5));
  });
});

describe('Decider read-only lanes', () => {
  it('a single document request does not become a spec with epics', () => {
    for (const t of ['generame un documento de arquitectura', 'redacta un informe de la migracion', 'crea un readme para este repo']) {
      expect(decide(t, null).route).toBe('document');
    }
  });
  it('diagnosis questions are investigated, not turned into code changes', () => {
    for (const t of ['revisa los logs y dime por que ocurre este error', 'por que falla el login? aqui el traceback', 'analiza el error de conexion']) {
      expect(decide(t, null).route).toBe('investigate');
    }
  });
  it('explicit code and spec requests keep their routes', () => {
    expect(decide('crea el endpoint de login', null).route).toBe('code');
    expect(decide('genera la spec con epicas para el kanban', null).route).toBe('spec');
  });
});
