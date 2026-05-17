import * as fs from 'fs';
import * as path from 'path';
import { MCPServer, MCPTool } from '../core/interfaces';

/**
 * Filesystem MCP server — safe read/write operations scoped to the workspace.
 * Path traversal is prevented by resolving against the workspace root.
 */
export class FilesystemMCP implements MCPServer {
  readonly id = 'filesystem';
  readonly name = 'Filesystem';
  readonly description = 'Read and write files within the workspace';
  readonly tools: MCPTool[];

  constructor(private readonly workspaceRoot: string) {
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
          await fs.promises.writeFile(filePath, params.content as string, 'utf-8');
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
    const resolved = path.resolve(this.workspaceRoot, relativePath);
    if (!resolved.startsWith(this.workspaceRoot)) {
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
