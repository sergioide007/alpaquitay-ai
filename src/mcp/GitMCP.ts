import { exec } from 'child_process';
import { promisify } from 'util';
import { MCPServer, MCPTool } from '../core/interfaces';

const execAsync = promisify(exec);

const SAFE_GIT_COMMANDS = new Set(['status', 'log', 'diff', 'branch', 'show']);

export class GitMCP implements MCPServer {
  readonly id = 'git';
  readonly name = 'Git';
  readonly description = 'Git operations within the workspace';
  readonly tools: MCPTool[];

  constructor(private readonly workspaceRoot: string) {
    this.tools = [
      {
        name: 'git_status',
        description: 'Get current git status',
        parameters: {},
        execute: async () => {
          const { stdout } = await this.runSafeGit('status --porcelain');
          return { status: stdout.trim() || 'clean', raw: stdout };
        }
      },
      {
        name: 'git_diff',
        description: 'Get current git diff',
        parameters: { staged: 'boolean?' },
        execute: async (params) => {
          const flag = params.staged ? '--staged' : '';
          const { stdout } = await this.runSafeGit(`diff ${flag}`);
          return { diff: stdout };
        }
      },
      {
        name: 'git_log',
        description: 'Get recent commit history',
        parameters: { limit: 'number?' },
        execute: async (params) => {
          const n = (params.limit as number) ?? 10;
          const { stdout } = await this.runSafeGit(
            `log --oneline -${n}`
          );
          return { commits: stdout.trim().split('\n').filter(Boolean) };
        }
      },
      {
        name: 'git_commit',
        description: 'Stage all changes and create a commit',
        parameters: { message: 'string' },
        execute: async (params) => {
          const message = (params.message as string).replace(/"/g, '\\"');
          await execAsync('git add -A', { cwd: this.workspaceRoot });
          const { stdout } = await execAsync(`git commit -m "${message}"`, {
            cwd: this.workspaceRoot
          });
          return { success: true, output: stdout };
        }
      }
    ];
  }

  private async runSafeGit(subcommand: string): Promise<{ stdout: string }> {
    const verb = subcommand.split(' ')[0];
    if (!SAFE_GIT_COMMANDS.has(verb)) {
      throw new Error(`Git subcommand '${verb}' is not in the allowlist.`);
    }
    return execAsync(`git ${subcommand}`, { cwd: this.workspaceRoot });
  }

  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
}
