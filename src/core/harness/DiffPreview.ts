// FABLE-5 (L): Legible-first. Cap.14 + Uncle Bob "screaming intent".
// Preview legible de un plan Build ANTES de escribir: archivos + accion + motivo.
// No ejecuta: solo construye el markdown que el Chat muestra con [si] para confirmar.
export interface PlanFile { path: string; action: 'create' | 'modify' | 'skip'; reason: string; }
export function buildPreview(taskTitle: string, files: string[], sources: string[]): string {
  const rows: PlanFile[] = files.slice(0, 6).map(p => ({
    path: p, action: 'create',
    reason: sources.length ? `vive en fuente evidenciada (${sources[0]})` : 'ruta propuesta por el modelo',
  }));
  const lines = [`**Plan Build — preview (sin escribir aun)**`, '', `Tarea: ${taskTitle}`, ''];
  for (const r of rows) { lines.push(`- \`${r.path}\` — ${r.action} · ${r.reason}`); }
  lines.push('', '_Responde `si` para ejecutar con checkpoint, o dime que ajustar._');
  return lines.join('\n');
}
