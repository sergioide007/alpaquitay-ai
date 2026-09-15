import * as fs from 'fs';
import * as path from 'path';
import { MCPServer, MCPTool } from '../core/interfaces';
import { assertWritableRoot, friendlyFsError, isUsableRoot } from '../core/WorkspaceRoot';

/**
 * Filesystem MCP server — safe read/write operations scoped to the workspace.
 * Path traversal is prevented by resolving against the workspace root.
 *
 * Fix EROFS: la raiz se valida antes de tocar disco. Si no hay carpeta de trabajo
 * usable, las herramientas lanzan un error accionable en vez de resolver rutas
 * relativas contra el cwd del extension host (que puede ser un FS de solo lectura).
 */
export class FilesystemMCP implements MCPServer {
  readonly id = 'filesystem';
  readonly name = 'Filesystem';
  readonly description = 'Read and write files within the workspace';
  readonly tools: MCPTool[];
  private readonly root: string;

  constructor(private readonly workspaceRoot: string) {
    this.root = normalizeRoot(workspaceRoot);
    this.tools = [
      {
        name: 'read_file',
        description: 'Read a file from the workspace',
        parameters: { path: 'string' },
        execute: async (params) => {
          const filePath = this.safePath(params.path as string);
          const content = await fs.promises.readFile(filePath, 'utf-8');
          return { content, path: filePath };
        }
      },
      {
        name: 'write_file',
        description: 'Write content to a file (creates parent directories)',
        parameters: { path: 'string', content: 'string' },
        execute: async (params) => {
          const filePath = this.safePath(params.path as string);
          await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
          try {
            await fs.promises.writeFile(filePath, params.content as string, 'utf-8');
          } catch (err) {
            // Fix EROFS/EACCES: mensaje accionable en vez de un stack crudo en el chat.
            throw new Error(friendlyFsError(err, filePath));
          }
          return { success: true, path: filePath };
        }
      },
      {
        name: 'list_files',
        description: 'List files in a directory',
        parameters: { path: 'string' },
        execute: async (params) => {
          const dirPath = this.safePath(params.path as string);
          const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
          return entries.map(e => ({ name: e.name, isDirectory: e.isDirectory() }));
        }
      },
      {
        name: 'file_exists',
        description: 'Check if a file exists',
        parameters: { path: 'string' },
        execute: async (params) => {
          const filePath = this.safePath(params.path as string);
          try {
            await fs.promises.access(filePath);
            return { exists: true };
          } catch {
            return { exists: false };
          }
        }
      },
      {
        name: 'delete_file',
        description: 'Delete a file from the workspace',
        parameters: { path: 'string' },
        execute: async (params) => {
          const filePath = this.safePath(params.path as string);
          await fs.promises.unlink(filePath);
          return { success: true, path: filePath };
        }
      },
      {
        name: 'create_directory',
        description: 'Create a directory (and parents) within the workspace',
        parameters: { path: 'string' },
        execute: async (params) => {
          const dirPath = this.safePath(params.path as string);
          await fs.promises.mkdir(dirPath, { recursive: true });
          return { success: true, path: dirPath };
        }
      }
    ];
  }

  private safePath(relativePath: string): string {
    // Invariante Cap.09: sin raiz valida no se resuelve nada. `path.resolve('', 'spec.md')`
    // caeria en el cwd del extension host (p. ej. `/` -> EROFS).
    assertWritableRoot(this.root);
    const target = typeof relativePath === 'string' ? relativePath : '';
    const resolved = path.resolve(this.root, target);
    const rel = path.relative(this.root, resolved);
    // Contencion real: `path.relative` evita el falso positivo de `startsWith`
    // (`/tmp/app2`.startsWith(`/tmp/app`) === true).
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error('Path traversal attempt detected.');
    }
    return resolved;
  }

  async connect(): Promise<void> {
    // No connection needed for filesystem
  }

  async disconnect(): Promise<void> {
    // No cleanup needed
  }
}

/**
 * Normaliza la raiz: solo se acepta una carpeta absoluta y real de trabajo.
 * Cualquier otra cosa (vacia, relativa, `/`, `C:\`) se guarda como `''` para que
 * `assertWritableRoot` produzca un error accionable en vez de escribir en el cwd.
 */
function normalizeRoot(workspaceRoot: string): string {
  return isUsableRoot(workspaceRoot) ? path.resolve(workspaceRoot.trim()) : '';
}
