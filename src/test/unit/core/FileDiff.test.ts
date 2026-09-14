import { unifiedDiff } from '../../../core/harness/FileDiff';
describe('Diff real pre-write', () => {
  it('archivo nuevo muestra +++', () => {
    const d = unifiedDiff('apps/a.py', '', 'x = 1\n');
    expect(d.isNew).toBe(true); expect(d.diff).toContain('+++');
  });
  it('modificacion muestra +/-', () => {
    const d = unifiedDiff('apps/a.py', 'x = 1\ny = 2\n', 'x = 1\ny = 3\n');
    expect(d.added).toBe(1); expect(d.removed).toBe(1);
    expect(d.diff).toContain('- y = 2'); expect(d.diff).toContain('+ y = 3');
  });
  it('sin cambios no agrega ni quita', () => {
    const d = unifiedDiff('a.py', 'x=1', 'x=1');
    expect(d.added).toBe(0); expect(d.removed).toBe(0);
  });
});
