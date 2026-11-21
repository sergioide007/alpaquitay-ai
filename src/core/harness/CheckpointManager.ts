import { exec } from 'child_process';
import { promisify } from 'util';
import { isUsableRoot } from '../WorkspaceRoot';
const run = promisify(exec);
// Cap.05 resiliencia + Fowler: reversible antes que perfecto.
// Checkpoint = git stash push + apply (snapshot sin quitar el trabajo del arbol). Nunca bloquea si no hay git.
export class CheckpointManager {
  constructor(private readonly root: string) {}
  async save(label: string): Promise<string> {
    // Fix EROFS: sin carpeta de trabajo valida no se ejecuta git en el cwd del
    // extension host (podria stashear un repo ajeno o fallar con EROFS).
    if (!isUsableRoot(this.root)) { return 'no-checkpoint:sin-carpeta-de-trabajo'; }
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32) || 'harness';
    const name = `alpaquitay/${slug}-${new Date().toISOString().slice(0, 10)}`;
    try {
      await run('git rev-parse --is-inside-work-tree', { cwd: this.root, timeout: 5000 });
      const { stdout: dirty } = await run('git status --porcelain', { cwd: this.root, timeout: 5000 });
      if (!dirty.trim()) { return 'clean:sin-cambios-que-guardar'; }
      // `git stash push` REMOVES the changes from the working tree. A checkpoint must be a
      // safety net, not a side effect: push, then re-apply so the developer's work stays put
      // while the stash entry remains available for rollback.
      await run(`git stash push -m "${name}" --include-untracked`, { cwd: this.root, timeout: 15000 });
      try {
        await run('git stash apply --index stash@{0}', { cwd: this.root, timeout: 15000 });
      } catch {
        try { await run('git stash apply stash@{0}', { cwd: this.root, timeout: 15000 }); }
        catch { return `stash:${name}:RESTAURA-MANUAL(git stash apply)`; }
      }
      return `stash:${name}`;
    } catch { return 'no-git:continuo-sin-checkpoint'; }
  }
  async status(): Promise<string> {
    if (!isUsableRoot(this.root)) { return 'no-carpeta'; }
    try {
      const { stdout } = await run('git status --porcelain', { cwd: this.root, timeout: 5000 });
      return stdout.trim() ? 'dirty' : 'clean';
    } catch { return 'no-git'; }
  }
}
