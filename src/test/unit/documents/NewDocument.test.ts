import { cleanDocumentText, documentTitle, nextFreeDocPath, slugify } from '../../../documents/NewDocument';
import { reviewDiff } from '../../../core/harness/AgentReview';
import { guardWrite } from '../../../core/harness/PolicyGuard';
import { decide } from '../../../core/reception/Decider';

describe('NewDocument helpers (chat Document lane)', () => {
  it('unwraps a markdown fence and normalises line endings', () => {
    expect(cleanDocumentText('```markdown\r\n# Informe\r\n\r\nTexto\r\n```')).toBe('# Informe\n\nTexto\n');
    expect(cleanDocumentText('# Informe\n\nTexto')).toBe('# Informe\n\nTexto\n');
  });

  it('keeps inner code fences when the document itself contains code', () => {
    const doc = '# Guia\n\n```bash\nnpm test\n```\n';
    expect(cleanDocumentText(doc)).toBe(doc);
  });

  it('takes the title from the first heading, else from the request', () => {
    expect(documentTitle('# Plan de migración\n\ncuerpo', 'crea un documento')).toBe('Plan de migración');
    expect(documentTitle('sin titulo', 'crea un informe de ventas')).toBe('crea un informe de ventas');
  });

  it('builds safe ascii slugs', () => {
    expect(slugify('Plan de migración: ¿Qué sigue?')).toBe('plan-de-migracion-que-sigue');
    expect(slugify('../../etc/passwd')).toBe('etc-passwd');
    expect(slugify('¿¿??')).toBe('documento');
    expect(slugify('a'.repeat(200)).length).toBeLessThanOrEqual(60);
  });

  it('never reuses a taken path (written or already staged)', async () => {
    const taken = new Set(['docs/informe.md', 'docs/informe-2.md']);
    await expect(nextFreeDocPath('informe', async p => taken.has(p))).resolves.toBe('docs/informe-3.md');
    await expect(nextFreeDocPath('nuevo', async p => taken.has(p))).resolves.toBe('docs/nuevo.md');
  });

  it('a document is allowed by the harness but still asks for confirmation', () => {
    expect(guardWrite('docs/informe.md').verdict).toBe('confirm');
  });

  it('regression: a doc outside the source dirs is blocked by the code scope rule, so documents skip it', () => {
    const body = '# Informe\n\nTexto del informe.\n';
    expect(reviewDiff('docs/informe.md', '', body, ['src']).pass).toBe(false);
    expect(reviewDiff('docs/informe.md', '', body, []).pass).toBe(true);
  });

  it('requests for a document are routed to the document lane', () => {
    for (const text of ['crea un documento de requisitos', 'redacta un informe mensual', 'write a report about onboarding']) {
      expect([text, decide(text, null).route]).toEqual([text, 'document']);
    }
  });
});
