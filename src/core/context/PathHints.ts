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
  // A Java build manifest beats aggregate file counts.  A Maven monorepo may
  // contain many generated/documentation JS files, but its backend tasks must
  // still use Java paths and extensions.
  if (fp?.pkgManager === 'maven' || fp?.pkgManager === 'gradle') { return 'java'; }
  const top = fp?.languages?.[0]?.name;
  if (top && LANG_EXT[top]) { return LANG_EXT[top]; }
  // A build manifest is still authoritative when the repository has no source
  // files yet (or the source scan failed).  Never fall back to TypeScript for a
  // Maven/Gradle project merely because `src/main/java` is empty.
  if (fp?.pkgManager === 'dotnet') { return 'cs'; }
  if (fp?.pkgManager === 'go') { return 'go'; }
  if (fp?.pkgManager === 'cargo') { return 'rs'; }
  return 'ts';
}

/** Carpeta fuente evidenciada para ilustrar ejemplos ('' si no hay evidencia). */
export function sampleSourceDir(fp: WorkspaceFingerprint | null | undefined): string {
  const dirs = (fp?.sourceDirs ?? []).filter(dir => dir && dir !== '.' && dir !== './');
  // Production Java sources are a better path hint than tests, regardless of
  // the order returned by a filesystem provider.
  const dir = dirs.find(candidate => /(^|\/)src\/main\/java$/.test(candidate))
    ?? dirs.find(candidate => !/(^|\/)(test|tests)(\/|$)/i.test(candidate))
    ?? dirs[0];
  if (!dir || dir === '.' || dir === './') { return ''; }
  return dir.replace(/\/+$/, '');
}

function sampleTestDir(fp: WorkspaceFingerprint | null | undefined, sourceDir: string): string {
  const dirs = fp?.sourceDirs ?? [];
  const existing = dirs.find(candidate => /(^|\/)src\/test\/java$/.test(candidate));
  if (existing) { return existing.replace(/\/+$/, ''); }
  if (/\/src\/main\/java$/.test(`/${sourceDir}`)) { return sourceDir.replace(/\/main\/java$/, '/test/java'); }
  return sourceDir;
}

/**
 * Rutas de ejemplo para el template de `spec.md`.
 * `explicit` permite inyectar un caso de uso real (p. ej. `users` en Django).
 */
export function specPathHints(
  fp: WorkspaceFingerprint | null | undefined,
  explicit?: string
): { component: string; endpoint: string; validator: string; test: string; sourceLabel: string } {
  const dir = explicit && explicit.trim() ? explicit.trim().replace(/\/+$/, '') : sampleSourceDir(fp);
  const ext = dominantExt(fp);
  const prefix = dir ? `${dir}/` : '';
  const testDir = sampleTestDir(fp, dir);
  if (ext === 'java') {
    // Maven/Gradle convention is authoritative even before the first Java file
    // exists.  This is the sole intentional creation hint: it preserves the
    // existing Java project instead of suggesting a TypeScript root file.
    const javaSource = dir || 'src/main/java';
    const javaTest = testDir || 'src/test/java';
    return {
      component: `${javaSource}/domain/model/Feature.java`,
      endpoint: `${javaSource}/infrastructure/rest/FeatureController.java`,
      validator: `${javaSource}/application/validation/FeatureValidator.java`,
      test: `${javaTest}/application/FeatureUseCaseTest.java`,
      sourceLabel: javaSource
    };
  }
  if (!dir) {
    // La raiz del workspace es un destino real y seguro cuando no hay una fuente detectada.
    // No usar placeholders como `<carpeta-fuente>`: el modelo puede copiarlos literalmente.
    return {
      component: `Feature.${ext}`,
      endpoint: `routes/resource.${ext}`,
      validator: `services/validator.${ext}`,
      test: `Feature.test.${ext}`,
      sourceLabel: '.'
    };
  }
  return {
    component: `${prefix}feature/Component.${ext}`,
    endpoint: `${prefix}routes/resource.${ext}`,
    validator: `${prefix}services/validator.${ext}`,
    test: `${prefix}feature/Component.test.${ext}`,
    sourceLabel: dir
  };
}

/** Regla contractual que se inyecta en los prompts para no inventar `src/`. */
export function sourceRule(fp: WorkspaceFingerprint | null | undefined): string {
  const dirs = (fp?.sourceDirs ?? []).filter(d => d && d !== '.' && d !== './');
  const javaMain = dirs.find(dir => /(^|\/)src\/main\/java$/.test(dir));
  const javaTest = dirs.find(dir => /(^|\/)src\/test\/java$/.test(dir));
  if (javaMain) {
    return `Proyecto Java detectado: los cambios de producción van en ${javaMain}${javaTest ? ` y las pruebas en ${javaTest}` : ''}. Usa paquetes y extensiones .java; no propongas archivos TypeScript ni reinicialices Maven.`;
  }
  if (fp?.pkgManager === 'maven' || fp?.pkgManager === 'gradle') {
    if (dirs.length > 0) {
      return `Proyecto Java detectado: escribe rutas solo dentro de las carpetas reales ${dirs.join(', ')} y usa extensiones .java. No propongas archivos TypeScript ni reinicialices el proyecto.`;
    }
    return 'Proyecto Java detectado: conserva el build actual; los cambios de producción van en src/main/java y las pruebas en src/test/java. Usa paquetes y extensiones .java; no propongas archivos TypeScript ni reinicialices el proyecto.';
  }
  if (dirs.length === 0) {
    return 'Sin carpeta fuente evidenciada: usa rutas relativas a la raiz real del workspace (por ejemplo `services/validator.ts`). No inventes `src/` ni uses placeholders entre < >.';
  }
  return `Escribe rutas SOLO dentro de las carpetas reales de este proyecto: ${dirs.join(', ')}. No uses placeholders entre < > ni inventes \`src/\`.`;
}
