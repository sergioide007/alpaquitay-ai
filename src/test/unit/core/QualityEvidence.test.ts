import {
  evaluateQualityEvidence,
  parseQualityEvidence,
  QualityEvidence,
} from '../../../core/sdlc/QualityEvidence';

const evidence = (build: 'passed' | 'failed' | 'not-run', tests: 'passed' | 'failed' | 'not-run'): QualityEvidence => ({
  version: 1,
  taskId: 'SPEC-001',
  files: ['src/index.ts'],
  build: { command: 'npm run build', status: build },
  tests: { command: 'npm test', status: tests },
  recordedAt: '2026-09-14T00:00:00.000Z',
});

describe('quality evidence', () => {
  it('passes only when build and tests actually passed', () => {
    expect(evaluateQualityEvidence(evidence('passed', 'passed')).pass).toBe(true);
    expect(evaluateQualityEvidence(evidence('passed', 'not-run')).pass).toBe(false);
    expect(evaluateQualityEvidence(evidence('failed', 'passed')).pass).toBe(false);
  });

  it('does not treat a known command as execution evidence', () => {
    const result = evaluateQualityEvidence(null);
    expect(result.pass).toBe(false);
    expect(result.blockers.join(' ')).toMatch(/sin evidencia/);
  });

  it('requires the executed command on every passing check', () => {
    const incomplete = evidence('passed', 'passed');
    incomplete.tests.command = undefined;
    expect(evaluateQualityEvidence(incomplete).pass).toBe(false);
  });

  it('parses only versioned evidence records', () => {
    expect(parseQualityEvidence(JSON.stringify(evidence('passed', 'passed')))?.taskId).toBe('SPEC-001');
    expect(parseQualityEvidence('{"version":2}')).toBeNull();
    expect(parseQualityEvidence(JSON.stringify({ ...evidence('passed', 'passed'), tests: { status: 'maybe' } }))).toBeNull();
    expect(parseQualityEvidence(JSON.stringify({ ...evidence('passed', 'passed'), files: [1] }))).toBeNull();
    expect(parseQualityEvidence('not-json')).toBeNull();
  });
});
