import * as nodePath from 'path';

/**
 * Turns a file path proposed by a model into a path relative to the workspace, or null when it must not be used.
 *
 * Models often answer "/api/spec/x.js" meaning "api/spec/x.js under the project". `path.isAbsolute` is true for
 * that on every platform, so the harness used to resolve it against the filesystem root and the write was later
 * refused as path traversal: the task could never finish. Rules:
 *   - a relative path stays relative (normalised to forward slashes);
 *   - an absolute path inside the workspace becomes relative to it;
 *   - a rooted path without a drive ("/x", "\x") that is not inside the workspace is read as workspace-relative;
 *   - anything that still escapes the workspace ("../x", "C:\other\x", "\\server\x") is rejected.
 */
export function toWorkspaceRelative(filePath: string, workspaceRoot: string): string | null {
  const raw = filePath.trim().replace(/^["'`]+|["'`]+$/g, '');
  if (!raw || !workspaceRoot) { return null; }
  const root = nodePath.resolve(workspaceRoot);
  let candidate = raw;
  if (nodePath.isAbsolute(raw)) {
    const inside = nodePath.relative(root, nodePath.resolve(raw));
    if (inside && !inside.startsWith('..') && !nodePath.isAbsolute(inside)) { candidate = inside; }
    else if (/^[\\/](?![\\/])/.test(raw)) { candidate = raw.replace(/^[\\/]+/, ''); }
    else { return null; }
  }
  const rel = nodePath.relative(root, nodePath.resolve(root, candidate));
  if (!rel || rel.startsWith('..') || nodePath.isAbsolute(rel)) { return null; }
  return rel.split(nodePath.sep).join('/');
}

/**
 * Recovers the documentation placeholder emitted by older specs/prompts.
 * The placeholder is never a filesystem path. It is replaced with the first
 * evidenced source directory, or with the workspace root when no source dir is known.
 */
export function resolveSourceDirPlaceholder(filePath: string, sourceDirs: string[]): string {
  const normalized = filePath.replace(/\\/g, '/');
  const match = normalized.match(/^<(?:carpeta[-_ ]?fuente|source[-_ ]?dir(?:ectory)?|source)>\/?/i);
  if (!match) { return normalized; }
  const suffix = normalized.slice(match[0].length).replace(/^\/+/, '');
  const sourceDir = sourceDirs.find(dir => typeof dir === 'string' && dir.trim() && dir.trim() !== '.' && dir.trim() !== './' && !/[<>]/.test(dir));
  const cleanSource = sourceDir?.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  // Some fingerprints already identify the first path segment (e.g. `services`).
  if (cleanSource && (suffix === cleanSource || suffix.startsWith(`${cleanSource}/`))) { return suffix; }
  const prefix = cleanSource ?? '';
  return [prefix, suffix].filter(Boolean).join('/');
}
