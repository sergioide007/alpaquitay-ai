import * as fs from 'fs/promises';
import * as path from 'path';
import { SpecData, SpecTask, SpecCandidate, TaskStatus } from './interfaces';
import { AlpaquitayConfig } from './config';

const IGNORED_NAMES = new Set([
  'readme.md', 'changelog.md', 'contributing.md', 'license.md',
  'privacy.md', 'code_of_conduct.md', 'security.md'
]);

export class SpecManager {
  private boardState = new Map<string, TaskStatus>();

  constructor(
    private readonly workspaceRoot: string,
    private readonly config: AlpaquitayConfig
  ) {}

  get specPath(): string {
    return path.join(this.workspaceRoot, this.config.specFile);
  }

  async load(): Promise<SpecData> {
    const specFile = path.basename(this.specPath);
    let markdown = '';
    try {
      markdown = await fs.readFile(this.specPath, 'utf-8');
    } catch {
      return { exists: false, markdown: '', tasks: [], specFile };
    }
    return { exists: true, markdown, tasks: this._parse(markdown), specFile };
  }

  async discover(): Promise<SpecCandidate[]> {
    const candidates: SpecCandidate[] = [];
    const currentName = path.basename(this.specPath).toLowerCase();
    await this._scanForCandidates(this.workspaceRoot, candidates, currentName, '');
    if (candidates.length < 5) {
      await this._scanForCandidates(
        path.join(this.workspaceRoot, 'specs'), candidates, currentName, 'specs/'
      );
    }
    return candidates;
  }

  private async _scanForCandidates(
    dir: string,
    candidates: SpecCandidate[],
    currentName: string,
    prefix: string
  ): Promise<void> {
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true, encoding: 'utf-8' });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isFile()) { continue; }
      const lname = entry.name.toLowerCase();
      const isMd = lname.endsWith('.md');
      const isConvertible = lname.endsWith('.yaml') || lname.endsWith('.yml') || lname.endsWith('.feature');
      if (!isMd && !isConvertible) { continue; }
      if (lname === currentName) { continue; }
      if (isMd && IGNORED_NAMES.has(lname)) { continue; }
      try {
        const content = await fs.readFile(path.join(dir, entry.name), 'utf-8');
        const taskCount = (content.match(/^\s*[-*]\s+\[[ x]\]/gim) ?? []).length;
        if (isMd && taskCount > 0) {
          candidates.push({ name: entry.name, relativePath: prefix + entry.name, taskCount });
        } else if (isConvertible) {
          candidates.push({ name: entry.name, relativePath: prefix + entry.name, taskCount: 0, needsConversion: true });
        }
      } catch { /* skip unreadable */ }
      if (candidates.length >= 5) { break; }
    }
  }

  async convertAndSave(sourcePath: string): Promise<void> {
    const abs = path.isAbsolute(sourcePath)
      ? sourcePath
      : path.join(this.workspaceRoot, sourcePath);
    const content = await fs.readFile(abs, 'utf-8');
    // Normalize * [ ] / * [x] → - [ ] / - [x]
    const normalized = content.replace(/^(\s*)\*\s+(\[[ x]\])/gim, '$1- $2');
    await fs.writeFile(this.specPath, normalized, 'utf-8');
    this.boardState.clear();
  }

  private _parse(markdown: string): SpecTask[] {
    const lines = markdown.split('\n');
    const tasks: SpecTask[] = [];
    let currentEpic = 'General';
    let counter = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^#{1,6}\s+(.+)/);
      if (headingMatch) {
        currentEpic = headingMatch[1];
        continue;
      }
      const taskMatch = line.match(/^\s*[-*]\s+\[([ x])\]\s*(.+)/i);
      if (!taskMatch) { continue; }

      const done = taskMatch[1].toLowerCase() === 'x';
      const title = taskMatch[2].trim();
      const id = `SPEC-${String(counter++).padStart(3, '0')}`;
      const saved = this.boardState.get(id);

      let status: TaskStatus;
      if (done) {
        status = 'done';
      } else if (saved) {
        // Respect any boardState override — including 'done' when the file
        // hasn't been updated yet (transient window between setBoardStatus
        // and updateTaskDone completing the write).
        status = saved;
      } else {
        status = 'backlog';
      }

      tasks.push({ id, epicTitle: currentEpic, title, done, status, lineIndex: i });
    }
    return tasks;
  }

  setBoardStatus(taskId: string, status: TaskStatus): void {
    this.boardState.set(taskId, status);
  }

  async updateTaskDone(task: SpecTask, done: boolean): Promise<void> {
    let markdown = '';
    try {
      markdown = await fs.readFile(this.specPath, 'utf-8');
    } catch {
      return;
    }
    const lines = markdown.split('\n');
    const line = lines[task.lineIndex];
    if (line !== undefined) {
      lines[task.lineIndex] = line.replace(/\[[ x]\]/i, done ? '[x]' : '[ ]');
      await fs.writeFile(this.specPath, lines.join('\n'), 'utf-8');
    }
  }

  async create(content: string): Promise<void> {
    this.boardState.clear();
    await fs.writeFile(this.specPath, content, 'utf-8');
  }
}
