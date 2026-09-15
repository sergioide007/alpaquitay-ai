// Fix EROFS: la raiz del workspace es un invariante del harness (Cap.09).
// Nunca se escribe con rutas relativas resueltas contra el cwd del extension host
// (que en Linux/Codespaces suele ser `/`, un FS de solo lectura -> EROFS).
//
// Reglas:
//   1. La raiz se elige por prioridad y se VALIDA (absoluta + escribible + no raiz de FS).
//   2. Si no hay raiz valida, el harness degrada a modo chat: nunca escribe.
//   3. Todo error de FS de escritura se traduce a un mensaje accionable.

export class WorkspaceRootError extends Error {
  constructor(message: string, public readonly root: string) {
    super(message);
    this.name = 'WorkspaceRootError';
  }
}

export interface RootCandidate {
  /** Etiqueta legible del origen (para el DecisionLog y los mensajes). */
  source: string;
  /** Ruta candidata (puede ser undefined si el origen no existe). */
  path?: string | null;
}

export interface RootResolution {
  /** Ruta absoluta valida, o '' cuando ninguna candidata sirve. */
  root: string;
  /** Origen ganador: workspaceFolders | workspaceFile | cwd | none. */
  source: string;
  /** true solo si root !== '' */
  writable: boolean;
}

/** Raices de sistema de archivos: `/`, `C:\`, `\\server\share`. */
function isFilesystemRoot(p: string): boolean {
  if (p === '/' || p === '\\') { return true; }
  return /^[a-zA-Z]:[\\/]?$/.test(p) || /^[\\/]{2}[^\\/]+[\\/]?$/.test(p);
}

/**
 * Una raiz es usable si existe, es absoluta y no es la raiz del sistema de archivos.
 * Evita EROFS/EACCES: el harness solo escribe dentro de una carpeta real de trabajo.
 */
export function isUsableRoot(p: string | undefined | null): boolean {
  if (!p || !p.trim()) { return false; }
  const trimmed = p.trim();
  if (!isAbsolutePath(trimmed)) { return false; }
  if (isFilesystemRoot(trimmed.replace(/[\\/]+$/, '') || trimmed)) { return false; }
  return true;
}

/** Compatible con POSIX y Windows sin depender de `path` (modulo puro, testeable). */
export function isAbsolutePath(p: string): boolean {
  return p.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(p) || /^\\\\/.test(p);
}

/** Elige la primera candidata usable, en orden de prioridad. */
export function pickWorkspaceRoot(candidates: RootCandidate[]): RootResolution {
  for (const c of candidates) {
    if (isUsableRoot(c.path)) {
      return { root: (c.path as string).trim(), source: c.source, writable: true };
    }
  }
  return { root: '', source: 'none', writable: false };
}

/** Lanza WorkspaceRootError si la raiz no sirve para escribir. */
export function assertWritableRoot(root: string): void {
  if (!isUsableRoot(root)) {
    throw new WorkspaceRootError(
      `Raiz de workspace invalida (${root ? `"${root}"` : 'vacia'}). ` +
      'Abre una carpeta de trabajo (File > Open Folder) y reintenta.',
      root
    );
  }
}

export function isReadOnlyFsError(err: unknown): boolean {
  const code = (err as { code?: string } | undefined)?.code;
  return code === 'EROFS' || code === 'EACCES' || code === 'EPERM';
}

/**
 * Traduce errores de FS a mensajes accionables en el chat.
 * El reporte clasico era `Error: EROFS: read-only file system, open 'spec.md'`.
 */
export function friendlyFsError(err: unknown, target: string): string {
  const code = (err as { code?: string } | undefined)?.code;
  const where = target || 'una ruta desconocida';
  if (code === 'EROFS') {
    return `El sistema de archivos es de solo lectura (EROFS) en ${where}. ` +
      'El harness escribe siempre en la raiz del workspace: abre una carpeta local escribible y reintenta.';
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return `Sin permisos de escritura (${code}) en ${where}. Revisa los permisos de la carpeta del workspace.`;
  }
  if (code === 'ENOENT') {
    return `Ruta no encontrada (ENOENT): ${where}.`;
  }
  if (code === 'EISDIR') {
    return `La ruta apunta a un directorio, no a un archivo: ${where}.`;
  }
  return err instanceof Error ? err.message : String(err);
}

/** Mensaje accionable cuando no hay carpeta de trabajo escribible. */
export function workspaceRootHelp(): string {
  return [
    '> ⚠️ **Sin carpeta de trabajo escribible — modo chat**',
    '> El harness no escribe nada fuera de la raiz del workspace (evita el error `EROFS`).',
    '> - Abre una carpeta: `File > Open Folder` (o ejecuta `code .` en la terminal del proyecto).',
    '> - Si trabajas en un workspace virtual (`vscode-vfs`/`untitled`), abre la carpeta real.',
    '> - Reintenta cuando la raiz este montada con permiso de escritura.',
  ].join('\n');
}

/** Version de una linea del mensaje anterior, para errores de herramientas MCP. */
export function noRootMessage(target: string): string {
  return `Sin carpeta de trabajo valida: no se puede ejecutar \`${target}\`. ` +
    'Abre una carpeta escribible (File > Open Folder) y reintenta.';
}

/** Etiqueta corta de la raiz para chips y trazas (nunca rutas absolutas largas). */
export function rootLabel(root: string): string {
  if (!isUsableRoot(root)) { return 'sin-carpeta'; }
  const parts = root.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? root;
}