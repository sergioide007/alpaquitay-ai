import { exec } from 'child_process';
import { promisify } from 'util';
const run = promisify(exec);
// Cap.05 resiliencia + Fowler: reversible antes que perfecto.
// Checkpoint = git stash push o rama auto. Nunca bloquea si no hay git.
export class CheckpointManager {
  constructor(private readonly root: string) {}
  async save(label: string): Promise<string> {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32) || 'harness';
    const name = `alpaquitay/${slug}-${new Date().toISOString().slice(0, 10)}`;
    try {
      await run('git rev-parse --is-inside-work-tree', { cwd: this.root, timeout: 5000 });
      await run(`git stash push -m "${name}" --include-untracked`, { cwd: this.root, timeout: 15000 });
      return `stash:${name}`;
    } catch { return 'no-git:continuo-sin-checkpoint'; }
  }
  async status(): Promise<string> {
    try {
      const { stdout } = await run('git status --porcelain', { cwd: this.root, timeout: 5000 });
      return stdout.trim() ? 'dirty' : 'clean';
    } catch { return 'no-git'; }
  }
}
