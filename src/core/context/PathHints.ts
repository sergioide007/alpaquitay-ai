/**
 * Pistas de rutas para los prompts de generacion (invariante Cap.09: NUNCA asumir `src/`).
 *
 * El bug de fondo: el template de `spec.md` ilustraba sus ejemplos con `src/feature/Component.ts`.
 * En un legado Django (`apps/users/`), Java Maven (`src/main/java`) o monorepo (`packages/`),
 * el LLM copiaba `src/` y generaba tareas que apuntaban a carpetas inexistentes.
 *
 * Este modulo es puro y deterministico: deriva los ejemplos del fingerprint evidenciado
 * (nunca del cwd ni de un `src/` hardcodeado). Sin evidencia, usa rutas relativas a la raiz
 * real del workspace: un placeholder de documentacion nunca debe convertirse en ruta de escritura.
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
    // La raiz del workspace es un destino real y seguro cuando no hay una fuente detectada.
    // No usar placeholders como `<carpeta-fuente>`: el modelo puede copiarlos literalmente.
    return {
      component: `Feature.${ext}`,
      endpoint: `routes/resource.${ext}`,
      validator: `services/validator.${ext}`,
      sourceLabel: '.'
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
    return 'Sin carpeta fuente evidenciada: usa rutas relativas a la raiz real del workspace (por ejemplo `services/validator.ts`). No inventes `src/` ni uses placeholders entre < >.';
  }
  return `Escribe rutas SOLO dentro de las carpetas reales de este proyecto: ${dirs.join(', ')}. No uses placeholders entre < > ni inventes \`src/\`.`;
}
