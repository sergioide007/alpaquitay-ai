import { exec } from 'child_process';
import { promisify } from 'util';
import { GitLog, GitCommit } from './interfaces';

const execAsync = promisify(exec);

export class GitIntegration {
  constructor(private readonly workspaceRoot: string) {}

  async getLog(limit = 40): Promise<GitLog> {
    try {
      const { stdout } = await execAsync(
        `git log --format="%H|%an|%ar|%s" -${limit}`,
        { cwd: this.workspaceRoot, timeout: 8000 }
      );
      const commits: GitCommit[] = stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => {
          const parts = line.split('|');
          const hash = parts[0]?.slice(0, 7) ?? '';
          const author = parts[1] ?? '';
          const relativeTime = parts[2] ?? '';
          const message = parts.slice(3).join('|');
          // Detect #SPEC-001 or [SPEC: 001] conventions in commit messages
          const specMatch = message.match(/#(SPEC-\d+)/i) ?? message.match(/\[SPEC[:\s]+(SPEC-\d+|[\d]+)\]/i);
          const specRef = specMatch
            ? (specMatch[1].toUpperCase().startsWith('SPEC-') ? specMatch[1].toUpperCase() : `SPEC-${specMatch[1]}`)
            : undefined;
          return { hash, author, relativeTime, message, specRef };
        });
      return { available: true, commits };
    } catch {
      return { available: false, commits: [] };
    }
  }
}
