// Experto: DORA sin telemetria externa. Solo git log + decisions.jsonl.
// Elite/High/Medium/Low segun Accelerate; si no hay datos, se dice, no se inventa.
import { GitCommit } from '../interfaces';
export interface Dora { frequency: string; leadTime: string; failureRate: string; recovery: string; level: string; commits: number; specLinked: number; }
export function doraFrom(commits: GitCommit[]): Dora {
  const n = commits.length;
  if (n === 0) { return { frequency: 'sin datos', leadTime: 'sin datos', failureRate: 'sin datos', recovery: 'sin datos', level: 'sin datos (haz 3+ commits con #SPEC-xxx)', commits: 0, specLinked: 0 }; }
  const linked = commits.filter(c => c.specRef).length;
  const fixes = commits.filter(c => /fix|hotfix|revert|rollback|bug/i.test(c.message)).length;
  const rate = Math.round((fixes / n) * 100);
  const freq = n >= 15 ? 'diaria o mejor' : n >= 6 ? 'semanal' : 'ocasional';
  const level = linked >= n * 0.6 && rate <= 15 ? 'High ✅' : rate > 30 ? 'Low ⚠️' : 'Medium';
  return { frequency: freq, leadTime: linked ? 'trazable por #SPEC' : 'no trazable (falta #SPEC)', failureRate: `${rate}% (${fixes}/${n} fixes)`, recovery: 'via checkpoint stash (reversible)', level, commits: n, specLinked: linked };
}
export function doraMarkdown(d: Dora): string {
  return [`> 📊 DORA · nivel **${d.level}**`, `> deploy freq: ${d.frequency} · lead time: ${d.leadTime}`, `> change fail: ${d.failureRate} · recovery: ${d.recovery}`, `> commits: ${d.commits} · con #SPEC: ${d.specLinked}`].join('\n');
}
