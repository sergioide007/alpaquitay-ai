/**
 * Pistas de rutas para los prompts de generacion (invariante Cap.09: NUNCA asumir `src/`).
 *
 * El bug de fondo: el template de `spec.md` ilustraba sus ejemplos con `src/feature/Component.ts`.
 * En un legado Django (`apps/users/`), Java Maven (`src/main/java`) o monorepo (`packages/`),
 * el LLM copiaba `src/` y generaba tareas que apuntaban a carpetas inexistentes.
 *
 * Este modulo es puro y deterministico: deriva los ejemplos del fingerprint evidenciado
 * (nunca del cwd ni de un `src/` hardcodeado) y degrada a un placeholder neutro si no hay datos.
 */
import type { WorkspaceFingerprint } from './WorkspaceFingerprinter';

const LANG_EXT: Record<string, string> = {
  TypeScript: 'ts', JavaScript: 'ts', Python: 'py', Java: 'java', Kotlin: 'kt',
  Go: 'go', Rust: 'rs', PHP: 'php', Ruby: 'rb', 'C#': 'cs', Dart: 'dart'
};

/** Extension representativa del lenguaje dominante del proyecto. */
export function dominantExt(fp: WorkspaceFingerprint | null | undefined): string {
  const top = fp?.languages?.[0]?.name;
  return (top && LANG_EXT[top]) || 'ts';
}

/** Carpeta fuente evidenciada para ilustrar ejemplos ('' si no hay evidencia). */
export function sampleSourceDir(fp: WorkspaceFingerprint | null | undefined): string {
  const dir = fp?.sourceDirs?.[0];
  if (!dir || dir === '.' || dir === './') { return ''; }
  return dir.replace(/\/+$/, '');
}

/**
 * Rutas de ejemplo para el template de `spec.md`.
 * `explicit` permite inyectar un caso de uso real (p. ej. `users` en Django).
 */
export function specPathHints(
  fp: WorkspaceFingerprint | null | undefined,
  explicit?: string
): { component: string; endpoint: string; validator: string; sourceLabel: string } {
  const dir = explicit && explicit.trim() ? explicit.trim().replace(/\/+$/, '') : sampleSourceDir(fp);
  const ext = dominantExt(fp);
  const prefix = dir ? `${dir}/` : '';
  if (!dir) {
    // Sin evidencia: no inventamos `src/`. Se marcan placeholders explicitos.
    return {
      component: `<carpeta-fuente>/Feature.${ext}`,
      endpoint: `<carpeta-fuente>/routes/resource.${ext}`,
      validator: `<carpeta-fuente>/services/validator.${ext}`,
      sourceLabel: '<carpeta-fuente>'
    };
  }
  return {
    component: `${prefix}feature/Component.${ext}`,
    endpoint: `${prefix}routes/resource.${ext}`,
    validator: `${prefix}services/validator.${ext}`,
    sourceLabel: dir
  };
}

/** Regla contractual que se inyecta en los prompts para no inventar `src/`. */
export function sourceRule(fp: WorkspaceFingerprint | null | undefined): string {
  const dirs = (fp?.sourceDirs ?? []).filter(d => d && d !== '.' && d !== './');
  if (dirs.length === 0) {
    return 'Si no conoces la carpeta fuente, usa un placeholder `<carpeta-fuente>/...` (prohibido inventar `src/`).';
  }
  return `Escribe rutas SOLO dentro de las carpetas reales de este proyecto: ${dirs.join(', ')} (prohibido inventar \`src/\`).`;
}