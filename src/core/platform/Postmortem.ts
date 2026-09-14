// Experto: postmortem automatico (Cap.13 triaje + blameless culture).
// Cuando un Build falla, no solo se reporta: se clasifica, se guarda causa
// probable + fix sugerido en decisions.jsonl, y se ofrece reintento acotado.
export type FailureKind = 'build' | 'test' | 'lint' | 'diagnostics' | 'write' | 'unknown';
export interface Postmortem { kind: FailureKind; cause: string; fix: string; retry: string; }
export function classifyFailure(output: string): Postmortem {
  const o = output.toLowerCase();
  if (/test.*fail|assertion|expected|failing|✕|failed/i.test(output)) {
    return { kind: 'test', cause: 'test en rojo (assert o setup)', fix: 'corre el caso minimo en local y pega el assert real', retry: 'di `reintentar test` para regenerar solo el archivo que fallo' };
  }
  if (/eslint|ruff|clippy|spotless|lint|format/i.test(o)) {
    return { kind: 'lint', cause: 'estilo/lint bloquea el gate', fix: 'corre el linter del contrato platform y aplica el diff', retry: 'di `reintentar lint`' };
  }
  if (/tsc|type error|cannot find|gradle.*fail|mvn.*error|go build|cargo.*error/i.test(o)) {
    return { kind: 'build', cause: 'compilacion rota (tipos o dependencias)', fix: 'revisa el primer error: suele ser import o tipo, no logica', retry: 'di `reintentar` para regenerar con el error como contexto' };
  }
  if (/eacces|eperm|enoent|denied|traversal|protegido/i.test(o)) {
    return { kind: 'write', cause: 'PolicyGuard o permisos bloquearon la escritura', fix: 'confirma la ruta dentro de sourceDirs evidenciados', retry: 'di la ruta exacta dentro de fuentes permitidas' };
  }
  if (/diagnostic|error TS|L\d+:/i.test(output)) {
    return { kind: 'diagnostics', cause: 'language server reporta errores', fix: 'abre el archivo y corrige el primer diagnostico', retry: 'di `corregir` con el mensaje del diagnostico' };
  }
  return { kind: 'unknown', cause: 'causa no clasificada', fix: 'pega el log completo para clasificar', retry: 'di `reintentar` con mas contexto' };
}
export function postmortemMarkdown(taskTitle: string, pm: Postmortem, testCmd: string): string {
  return [`> 🔬 Postmortem · **${taskTitle}**`, `> causa probable: ${pm.cause}`, `> fix sugerido: ${pm.fix}`, `> verifica con: \`${testCmd}\``, `> ${pm.retry}`].join('\n');
}
