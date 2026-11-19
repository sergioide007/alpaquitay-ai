/**
 * Evidence produced by executable quality checks after an approved change set
 * has been applied.  A known command is not evidence: the command must run and
 * exit successfully before the corresponding check is considered passed.
 */
export type QualityCheckStatus = 'passed' | 'failed' | 'not-run';

export interface QualityCheck {
  command?: string;
  status: QualityCheckStatus;
  detail?: string;
}

export interface QualityEvidence {
  version: 1;
  taskId: string;
  files: string[];
  build: QualityCheck;
  tests: QualityCheck;
  recordedAt: string;
}

export interface QualityGateResult {
  pass: boolean;
  blockers: string[];
  checklist: string[];
}

export function evaluateQualityEvidence(evidence: QualityEvidence | null): QualityGateResult {
  if (!evidence) {
    return {
      pass: false,
      blockers: ['sin evidencia de build/test ejecutados para esta tarea'],
      checklist: [],
    };
  }

  const blockers: string[] = [];
  const checklist: string[] = [];
  const checks: Array<['build' | 'tests', QualityCheck]> = [
    ['build', evidence.build],
    ['tests', evidence.tests],
  ];

  for (const [name, check] of checks) {
    if (!check || typeof check !== 'object') {
      blockers.push(`${name} evidencia invalida`);
      continue;
    }
    const commandText = typeof check.command === 'string' ? check.command.trim() : '';
    const command = commandText ? ` \`${commandText}\`` : '';
    if (check.status === 'passed' && commandText) {
      checklist.push(`${name}${command} ejecutado en verde`);
    } else if (check.status === 'failed') {
      blockers.push(`${name}${command} fallo${check.detail ? `: ${check.detail}` : ''}`);
    } else if (check.status === 'passed') {
      blockers.push(`${name} evidencia invalida: falta el comando ejecutado`);
    } else {
      blockers.push(`${name}${command} no ejecutado${check.detail ? `: ${check.detail}` : ''}`);
    }
  }

  return { pass: blockers.length === 0, blockers, checklist };
}

export function parseQualityEvidence(value: string | undefined): QualityEvidence | null {
  if (!value) { return null; }
  try {
    const parsed = JSON.parse(value) as Partial<QualityEvidence>;
    const isCheck = (check: unknown): check is QualityCheck => {
      if (!check || typeof check !== 'object') { return false; }
      const candidate = check as Partial<QualityCheck>;
      return (candidate.status === 'passed' || candidate.status === 'failed' || candidate.status === 'not-run') &&
        (candidate.command === undefined || typeof candidate.command === 'string') &&
        (candidate.detail === undefined || typeof candidate.detail === 'string');
    };
    if (parsed.version !== 1 || typeof parsed.taskId !== 'string' || !parsed.taskId.trim() ||
      !Array.isArray(parsed.files) || !parsed.files.every(file => typeof file === 'string')) {
      return null;
    }
    if (!isCheck(parsed.build) || !isCheck(parsed.tests) || typeof parsed.recordedAt !== 'string' ||
      !Number.isFinite(Date.parse(parsed.recordedAt))) { return null; }
    return parsed as QualityEvidence;
  } catch {
    return null;
  }
}
