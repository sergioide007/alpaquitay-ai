import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as nodePath from 'path';
import { AIProviderManager } from '../providers/AIProviderManager';
import { SkillRegistry } from '../skills/SkillRegistry';
import { SpecManager } from '../core/SpecManager';
import { GitIntegration } from '../core/GitIntegration';
import { MCPManager } from '../mcp/MCPManager';
import { SecretManager } from '../core/SecretManager';
import { ProjectContextBuilder } from '../core/ProjectContextBuilder';
import { generateCode, isSmallModel, deduplicateSpecTasks, normalizeSpecContent } from '../prompts/codeUtils';
import { HierarchicalMemory } from '../core/HierarchicalMemory';
import { WebviewMessage, ModelOption, TaskStatus, SkillContext, SpecTask, ProviderType, ArchDiagram, ArchDiagramPatch, ArchNode, ArchEdge, ArchNodeType, AIProvider } from '../core/interfaces';
import { AlpaquitayConfig } from '../core/config';
import { MODEL_CATALOG, catalogJson } from '../core/ModelCatalog';

const PATH_SKILLS = new Set(['create-file', 'refactor', 'generate-tests']);
const SPEC_SKILLS = new Set(['generate-from-spec', 'validate-against-spec']);
const GOAL_SKILLS = new Set(['project-builder']);

export class MainPanel {
  public static current: MainPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _workedTasks = new Set<string>();
  private _contextBuilder!: ProjectContextBuilder;
  private _memory!: HierarchicalMemory;
  private readonly config = new AlpaquitayConfig();

  private constructor(
    panel: vscode.WebviewPanel,
    _context: vscode.ExtensionContext,
    private readonly aiManager: AIProviderManager,
    private readonly skillRegistry: SkillRegistry,
    private readonly specManager: SpecManager,
    private readonly git: GitIntegration,
    private readonly mcpManager: MCPManager,
    _secrets: SecretManager,
    private readonly workspaceRoot: string
  ) {
    this._panel = panel;
    this._contextBuilder = new ProjectContextBuilder(workspaceRoot, mcpManager);
    this._memory = new HierarchicalMemory(mcpManager);
    this._memory.load().catch(() => {/* non-fatal */});
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.onDidChangeViewState(e => {
      if (e.webviewPanel.visible) {
        this._sendSpec().catch(() => {/* non-fatal */});
      }
    }, null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (msg: WebviewMessage) => this._handle(msg),
      null,
      this._disposables
    );
    this._panel.webview.html = this._html();
    this._watchSpecFile();
    // Proactive spec push: ensures spec is sent even if the webview's
    // initial load-spec message is delayed or missed on first render.
    setImmediate(() => this._sendSpec().catch(() => {}));
  }

  static show(
    context: vscode.ExtensionContext,
    aiManager: AIProviderManager,
    skillRegistry: SkillRegistry,
    specManager: SpecManager,
    git: GitIntegration,
    mcpManager: MCPManager,
    secrets: SecretManager,
    workspaceRoot: string
  ): void {
    if (MainPanel.current) {
      MainPanel.current._panel.reveal(vscode.ViewColumn.One);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'alpaquitay-hub',
      'Alpaquitay Hub',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    MainPanel.current = new MainPanel(
      panel, context, aiManager, skillRegistry,
      specManager, git, mcpManager, secrets, workspaceRoot
    );
  }

  // -- Message dispatcher -----------------------------------------------------

  private async _handle(msg: WebviewMessage): Promise<void> {
    switch (msg.type) {
      case 'get-models':             return this._sendModels();
      case 'load-spec':              return this._sendSpec();
      case 'load-git':               return this._sendGit();
      case 'load-skills':            return this._sendSkills();
      case 'switch-provider':        return this._handleSwitchProvider(msg.providerType);
      case 'chat':                   return this._handleChat(msg.text, msg.modelId);
      case 'update-task-status':     return this._handleTaskStatus(msg.taskId, msg.status);
      case 'run-skill':              return this._handleRunSkill(msg.skillId, {});
      case 'run-skill-with-params':  return this._handleRunSkill(msg.skillId, msg.params);
      case 'task-correction':        return this._handleTaskCorrection(msg.taskId, msg.correction);
      case 'regenerate-spec':        return this._handleRegenSpec(msg.context);
      case 'create-skill':           return this._handleCreateSkill(msg.name, msg.description, msg.prompt);
      case 'configure-provider':
        vscode.commands.executeCommand('alpaquitay-ai.configureProvider')
          .then(() => this._sendModels(), () => { /* cancelled */ });
        return;
      case 'load-settings':          return this._handleLoadSettings();
      case 'save-settings':          return this._handleSaveSettings((msg as { type: 'save-settings'; settings: Record<string, unknown> }).settings);
      case 'use-spec-file':          return this._handleUseSpecFile((msg as { type: 'use-spec-file'; filename: string }).filename);
      case 'convert-spec-file':      return this._handleConvertSpecFile((msg as { type: 'convert-spec-file'; sourcePath: string }).sourcePath);
      case 'arch-save':              return this._handleArchSave((msg as { type: 'arch-save'; diagram: object }).diagram);
      case 'arch-load':              return this._handleArchLoad();
      case 'arch-export':            return this._handleArchExport(
                                       (msg as { type: 'arch-export'; diagram: ArchDiagram; format: string }).diagram,
                                       (msg as { type: 'arch-export'; diagram: ArchDiagram; format: string }).format
                                     );
      case 'arch-chat':              return this._handleArchChat(
                                       (msg as { type: 'arch-chat'; text: string; currentDiagram: ArchDiagram }).text,
                                       (msg as { type: 'arch-chat'; text: string; currentDiagram: ArchDiagram }).currentDiagram
                                     );
      case 'run-skill-on-task':      return this._handleRunSkillOnTask(
                                       (msg as { type: 'run-skill-on-task'; skillId: string; taskId: string }).skillId,
                                       (msg as { type: 'run-skill-on-task'; skillId: string; taskId: string }).taskId
                                     );
      case 'add-spec-task':          return this._handleAddSpecTask(
                                       (msg as { type: 'add-spec-task'; epicTitle: string; taskTitle: string }).epicTitle,
                                       (msg as { type: 'add-spec-task'; epicTitle: string; taskTitle: string }).taskTitle
                                     );
      case 'update-spec-task':       return this._handleUpdateSpecTask(
                                       (msg as { type: 'update-spec-task'; taskId: string; newTitle: string }).taskId,
                                       (msg as { type: 'update-spec-task'; taskId: string; newTitle: string }).newTitle
                                     );
      case 'delete-spec-task':       return this._handleDeleteSpecTask(
                                       (msg as { type: 'delete-spec-task'; taskId: string }).taskId
                                     );
      case 'add-spec-epic':          return this._handleAddSpecEpic(
                                       (msg as { type: 'add-spec-epic'; epicTitle: string }).epicTitle
                                     );
      case 'update-spec-epic':       return this._handleUpdateSpecEpic(
                                       (msg as { type: 'update-spec-epic'; oldTitle: string; newTitle: string }).oldTitle,
                                       (msg as { type: 'update-spec-epic'; oldTitle: string; newTitle: string }).newTitle
                                     );
      case 'delete-spec-epic':       return this._handleDeleteSpecEpic(
                                       (msg as { type: 'delete-spec-epic'; epicTitle: string }).epicTitle
                                     );
      case 'arch-create-adr':        return this._handleCreateAdr(
                                       (msg as { type: 'arch-create-adr'; context: string; decision: string }).context,
                                       (msg as { type: 'arch-create-adr'; context: string; decision: string }).decision
                                     );
      case 'arch-assess':            return this._handleArchAssess(
                                       (msg as { type: 'arch-assess'; context: string }).context
                                     );
    }
  }

  // -- Data senders -----------------------------------------------------------

  private async _sendModels(): Promise<void> {
    const infos = await this.aiManager.getProviderInfo();
    const models: ModelOption[] = [];

    for (const info of infos) {
      if (!info.available) { continue; }
      const catalog = MODEL_CATALOG[info.type];
      if (catalog?.length) {
        // Cloud providers: expose every model from the catalog
        const activeModelId = info.type === 'anthropic'
          ? this.config.anthropicModel
          : info.type === 'openai'
            ? this.config.openaiModel
            : catalog[0].id;
        for (const m of catalog) {
          models.push({ id: `${info.type}:${m.id}`, label: `${m.label} (${info.name})`, provider: info.type, isLocal: false });
        }
        // Ensure the currently configured model appears even if not in catalog
        if (!catalog.find(m => m.id === activeModelId)) {
          models.push({ id: `${info.type}:${activeModelId}`, label: `${activeModelId} (${info.name})`, provider: info.type, isLocal: false });
        }
      } else {
        // Local providers: current configured model
        const modelName = info.type === 'ollama' ? this.config.ollamaModel : 'local-model';
        models.push({ id: `${info.type}:${modelName}`, label: `${modelName} (${info.name})`, provider: info.type, isLocal: true });
      }
    }
    this._post({ type: 'models-list', models });
  }

  private async _sendSpec(): Promise<void> {
    const data = await this.specManager.load();
    if (!data.exists) {
      data.candidates = await this.specManager.discover();
    }
    this._post({ type: 'spec-data', data });
  }

  private async _handleUseSpecFile(filename: string): Promise<void> {
    await vscode.workspace.getConfiguration('alpaquitay-ai').update(
      'specFile', filename, vscode.ConfigurationTarget.Workspace
    );
    await this._sendSpec();
  }

  private async _handleConvertSpecFile(sourcePath: string): Promise<void> {
    try {
      const ext = sourcePath.toLowerCase().split('.').pop() ?? '';
      if (['yaml', 'yml', 'feature'].includes(ext)) {
        await this._convertTechnicalSpec(sourcePath);
      } else {
        await this.specManager.convertAndSave(sourcePath);
      }
      await this._sendSpec();
    } catch (err) {
      this._post({ type: 'chat-error', error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async _convertTechnicalSpec(sourcePath: string): Promise<void> {
    const abs = nodePath.isAbsolute(sourcePath)
      ? sourcePath
      : nodePath.join(this.workspaceRoot, sourcePath);
    const { readFile } = await import('fs/promises');
    const content = await readFile(abs, 'utf-8');
    const provider = this.aiManager.getActive();
    if (!provider) {
      // Fallback: wrap as-is so the spec tab at least shows the file exists
      await this.specManager.create(`# ${nodePath.basename(sourcePath)}\n\n${content}`);
      return;
    }
    const prompt =
      `Convert the following technical specification into a spec.md with epics and checkbox tasks.\n\n` +
      `Rules:\n- Use ## headings for Epics\n- Under each epic, list tasks as checkboxes: - [ ] description\n` +
      `- Be specific and actionable. Include at least 3 epics with 3-5 tasks each.\n\n` +
      `Specification (${nodePath.basename(sourcePath)}):\n${content}\n\nGenerate spec.md:`;
    const specContent = deduplicateSpecTasks(normalizeSpecContent(await provider.complete(prompt)));
    await this.specManager.create(specContent);
  }

  private async _sendGit(): Promise<void> {
    const data = await this.git.getLog();
    this._post({ type: 'git-log', data });
  }

  private async _sendSkills(): Promise<void> {
    const skills = this.skillRegistry.list().map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      needsPath: PATH_SKILLS.has(s.id),
      needsSpecPath: SPEC_SKILLS.has(s.id),
      needsGoal: GOAL_SKILLS.has(s.id)
    }));
    this._post({ type: 'skills-list', skills });
  }

  // -- Provider switching -----------------------------------------------------

  private async _handleSwitchProvider(providerType: ProviderType): Promise<void> {
    try {
      await this.aiManager.switchProvider(providerType);
    } catch { /* provider not available - selector stays, no crash */ }
  }

  // -- Chat -------------------------------------------------------------------

  private async _handleChat(text: string, _modelId: string): Promise<void> {
    const provider = this.aiManager.getActive();
    if (!provider) {
      this._post({ type: 'chat-error', error: 'No hay proveedor AI disponible. Configura uno en ⚙ o inicia Ollama/LM Studio.' });
      return;
    }

    // Detect file-deletion intent before routing to the AI.
    // Matches: "delete src/main.js", "borra el src/main.js", "elimina src/App.tsx", "rm foo.ts"
    const deleteMatch = text.match(
      /^(?:(?:por\s+favor[,\s]+)?(?:borra[r]?|elimina[r]?|delete|remove|rm)\s+(?:el\s+|la\s+|los\s+|las\s+|el\s+archivo\s+|the\s+file\s+)?)([^\s'"`]+\.\w{1,8})\s*$/i
    );
    if (deleteMatch) {
      const rawPath = deleteMatch[1].replace(/[`'"]/g, '').trim();
      try {
        const abs = nodePath.isAbsolute(rawPath) ? rawPath : nodePath.join(this.workspaceRoot, rawPath);
        await this.mcpManager.executeTool('filesystem', 'delete_file', { path: abs });
        this._post({ type: 'chat-chunk', content: `Archivo \`${rawPath}\` eliminado correctamente.` });
      } catch (e) {
        this._post({ type: 'chat-chunk', content: `No se pudo eliminar \`${rawPath}\`: ${e instanceof Error ? e.message : String(e)}` });
      }
      this._post({ type: 'chat-done', model: provider.modelName });
      return;
    }

    try {
      const systemPrompt = await this._contextBuilder.getChatSystemPrompt();
      const response = await provider.chat(
        [{ role: 'user', content: text }],
        { systemPrompt }
      );
      this._post({ type: 'chat-chunk', content: response.content });
      this._post({ type: 'chat-done', model: response.model });
    } catch (err) {
      this._post({ type: 'chat-error', error: err instanceof Error ? err.message : String(err) });
    }
  }

  // -- Task status - triggers AI work when moved to In Progress ---------------

  private async _handleTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
    const data = await this.specManager.load();
    const task = data.tasks.find(t => t.id === taskId);
    if (!task) { return; }

    const wasAlreadyWorked = this._workedTasks.has(taskId);
    this.specManager.setBoardStatus(taskId, status);

    if (status === 'done') {
      // Fast path: update cached data and send immediately, write disk in background
      const doneTask = data.tasks.find(t => t.id === taskId);
      if (doneTask) { doneTask.done = true; doneTask.status = 'done'; }
      this._post({ type: 'spec-data', data });
      this.specManager.updateTaskDone(task, true).catch(() => {});
      return;
    }

    // Moving a done or worked task back to in-progress -> uncheck in spec.md
    if (task.done) {
      await this.specManager.updateTaskDone(task, false);
    }
    await this._sendSpec();

    if (status === 'in-progress') {
      if (wasAlreadyWorked || task.done) {
        // Already worked on: ask user what needs correction
        this._post({ type: 'task-correction-needed', taskId: task.id, title: task.title });
      } else {
        // First time in-progress: start AI work automatically
        this._startTaskWork(task).catch(() => {/* errors handled inside */});
      }
    }
  }

  // -- AI task work engine ----------------------------------------------------

  // Returns only the epic section containing the task, truncated to ~1200 chars.
  // Keeps prompts within small local model context windows (4096 tokens).
  private _epicExcerpt(markdown: string, epicTitle: string): string {
    const escaped = epicTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = markdown.match(
      new RegExp(`## (?:Epic: )?${escaped}[\\s\\S]*?(?=\\n## |$)`, 'i')
    );
    const section = match ? match[0].trim() : markdown;
    return section.length > 1200 ? section.slice(0, 1200) + '\n...' : section;
  }

  // Read top-level workspace entries for AI context (max 30 entries).
  private async _workspaceTree(): Promise<string> {
    try {
      const entries = await this.mcpManager.executeTool('filesystem', 'list_files', { path: '.' }) as Array<{ name: string; isDirectory: boolean }>;
      return entries.slice(0, 30).map(e => `${e.isDirectory ? 'd' : 'f'} ${e.name}`).join('\n');
    } catch { return ''; }
  }

  // Returns true when the workspace has no meaningful files beyond spec.md / dotfiles.
  private _isEmptyWorkspace(tree: string): boolean {
    const meaningful = tree.split('\n')
      .filter(Boolean)
      .filter(l => {
        const name = l.replace(/^[df]\s+/, '').trim();
        return name && !name.startsWith('.') && !/^spec\.md$/i.test(name);
      });
    return meaningful.length === 0;
  }

  // Extracts explicit relative file paths from spec text (task title + epic context).
  // Handles patterns like: "archivo src/...", backtick paths, and bare src/... references.
  private _extractPathHints(text: string): string[] {
    const results = new Set<string>();
    const patterns: RegExp[] = [
      /\barchivo\s+([^\s`*\n]+\.\w{1,6})/gi,
      /\bfile[:\s]+([^\s`*\n]+\.\w{1,6})/gi,
      /`([^\s`]+\.\w{1,6})`/g,
      /\b((?:src|app|lib|pkg|cmd|api|internal|controllers?|services?|middlewares?|features?|routes?|models?|repositories?|tests?)\/[\w./\\-]+\.\w{1,6})\b/g,
    ];
    for (const re of patterns) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const p = (m[1] ?? m[0]).replace(/[`*[\]]/g, '').trim();
        if (p && !/spec\.md$/i.test(p) && /\.\w{1,6}$/.test(p) && !/\s/.test(p)) {
          results.add(p);
        }
      }
    }
    return [...results];
  }

  // Scaffolds a project from spec intent when the workspace is empty.
  // Uses ProjectBuilderSkill with the epic context as the goal.
  private async _bootstrapFromSpec(goal: string): Promise<void> {
    this._post({ type: 'chat-chunk', content: '\n\n_Workspace vacío — generando estructura base del proyecto..._\n' });
    const provider = this.aiManager.getActive();
    if (!provider) { return; }
    const ctx: SkillContext = {
      ai: provider,
      mcp: this.mcpManager,
      workspace: this.workspaceRoot,
      parameters: { goal },
    };
    try {
      const result = await this.skillRegistry.execute('project-builder', ctx);
      if (result.output) {
        const text = typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2);
        this._post({ type: 'chat-chunk', content: `\n${text}\n` });
      }
      this._contextBuilder.invalidate();
    } catch { /* non-fatal — continue to task generation */ }
  }

  private _parseFilePaths(text: string): string[] {
    return text.split('\n')
      .map(l => l.replace(/^[-*\d.)>\s`]+/, '').replace(/`/g, '').trim())
      .filter(l => /\.\w{1,6}$/.test(l) && !/\s/.test(l) && l.length < 120);
  }

  // Routes a task to a registered skill based on title/context. Returns null → inline.
  private _routeTaskToSkill(task: SpecTask, epicContext: string): string | null {
    const title = task.title.toLowerCase();
    const ctx = epicContext.toLowerCase();

    if (/\btest(s|ing|unitario|s\s+unitarios)?\b|\bprueba(s)?\b/.test(title)) {
      return 'generate-tests';
    }
    if (/\b(crear|create|build|generar|generate|inicializar|init(ializ)?)\b.{0,40}\b(proyecto|project|aplicaci[oó]n|application|estructura\s+base|estructura\s+del\s+proyecto)\b/.test(title)) {
      return 'project-builder';
    }
    if (/\.(yaml|yml|json)\b/.test(ctx) && /\b(api|swagger|openapi)\b/.test(ctx)) {
      return 'generate-from-spec';
    }
    return null;
  }

  // Returns a concise summary of which spec tasks are done vs. pending (for AI context).
  private _buildSpecStateContext(tasks: SpecTask[], currentTaskId: string): string {
    const done = tasks.filter(t => t.done && t.id !== currentTaskId);
    const pending = tasks.filter(t => !t.done && t.id !== currentTaskId);
    const lines: string[] = [];
    if (done.length) {
      lines.push(`Completed (${done.length}):`);
      done.slice(0, 8).forEach(t => lines.push(`  ✓ ${t.title}`));
    }
    if (pending.length) {
      lines.push(`Pending (${pending.length}):`);
      pending.slice(0, 6).forEach(t => lines.push(`  ○ ${t.title}`));
    }
    return lines.join('\n');
  }

  // Executes a registered skill as part of task processing and handles results.
  private async _runSkillForTask(task: SpecTask, epicContext: string, specTasks: SpecTask[], skillId: string): Promise<void> {
    const provider = this.aiManager.getActive();
    if (!provider) { return; }

    const specState = this._buildSpecStateContext(specTasks, task.id);
    const goalContext = `${epicContext}\n\nCurrent task: ${task.title}${specState ? `\n\nSpec state:\n${specState}` : ''}`;

    let parameters: Record<string, unknown>;
    if (skillId === 'project-builder') {
      parameters = { goal: goalContext };
    } else if (skillId === 'generate-tests') {
      const hints = this._extractPathHints(`${task.title}\n${epicContext}`);
      const framework = epicContext.toLowerCase().includes('java') ? 'junit5' : 'jest';
      parameters = { path: hints[0] ?? task.title, framework, description: task.title };
    } else if (skillId === 'generate-from-spec') {
      parameters = { specPath: this.specManager.specPath };
    } else {
      parameters = { goal: task.title, description: task.title };
    }

    const ctx: SkillContext = {
      ai: provider,
      mcp: this.mcpManager,
      workspace: this.workspaceRoot,
      parameters,
      config: this.config,
      spawn: (id, p) => this.skillRegistry.execute(id, {
        ai: provider, mcp: this.mcpManager, workspace: this.workspaceRoot,
        parameters: p, config: this.config
      })
    };

    this._post({ type: 'chat-chunk', content: `\n\n_Usando skill \`/${skillId}\`..._\n` });

    const result = await this.skillRegistry.execute(skillId, ctx);

    if (result.output) {
      const text = typeof result.output === 'string' ? result.output : JSON.stringify(result.output, null, 2);
      this._post({ type: 'chat-chunk', content: `\n${text}` });
    }
    if (result.errors?.length) {
      this._post({ type: 'chat-chunk', content: `\n**(!) Errores:** ${result.errors.join(', ')}` });
    }

    this._post({ type: 'chat-done', model: provider.modelName });

    if (result.success) {
      this._memory.set('feature', task.id, `${task.title} — skill: ${skillId}`, { parentKey: task.epicTitle, tags: ['task', 'completed'] });
      await this._memory.save();
      await this.specManager.updateTaskDone(task, true);
      this.specManager.setBoardStatus(task.id, 'done');
      await this._sendSpec();
      this._post({ type: 'task-work-done', taskId: task.id, title: task.title });
    }
  }

  private _stripAnsi(s: string): string {
    // eslint-disable-next-line no-control-regex
    return s.replace(/\x1B\[[0-9;]*[mGKF]/g, '');
  }

  private async _runCommand(cmd: string, timeoutMs = 90_000): Promise<{ success: boolean; output: string }> {
    const { exec } = await import('child_process');
    return new Promise(resolve => {
      exec(cmd, { cwd: this.workspaceRoot, timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024 }, (err, stdout, stderr) => {
        const raw = this._stripAnsi((stdout ?? '') + (stderr ?? '')).trim();
        resolve({ success: !err, output: raw.slice(0, 4000) });
      });
    });
  }

  private async _detectBuildCommands(): Promise<{ build?: string; test?: string }> {
    const { existsSync } = await import('fs');
    const { readFile } = await import('fs/promises');
    const p = (f: string) => nodePath.join(this.workspaceRoot, f);

    if (existsSync(p('package.json'))) {
      try {
        const pkg = JSON.parse(await readFile(p('package.json'), 'utf-8'));
        const s: Record<string, string> = pkg.scripts ?? {};
        const buildKey = ['build', 'compile', 'tsc', 'typecheck'].find(k => s[k]);
        const testKey  = ['test', 'test:unit', 'test:run', 'vitest'].find(k => s[k]);
        return {
          build: buildKey ? `npm run ${buildKey}` : undefined,
          test:  testKey  ? `npm run ${testKey}`  : undefined,
        };
      } catch { return {}; }
    }
    if (existsSync(p('pom.xml'))) {
      return { build: 'mvn compile -q', test: 'mvn test -q' };
    }
    if (existsSync(p('build.gradle')) || existsSync(p('build.gradle.kts'))) {
      return { build: 'gradle compileJava -q', test: 'gradle test -q' };
    }
    if (existsSync(p('go.mod'))) {
      return { build: 'go build ./...', test: 'go test ./... -timeout 60s' };
    }
    if (existsSync(p('Cargo.toml'))) {
      return { build: 'cargo check -q', test: 'cargo test -q' };
    }
    if (existsSync(p('pyproject.toml')) || existsSync(p('requirements.txt'))) {
      return { test: 'python -m pytest --tb=short -q' };
    }
    return {};
  }

  private async _hasTestFiles(): Promise<boolean> {
    const patterns = [
      '**/*.test.ts', '**/*.spec.ts', '**/*.test.js', '**/*.spec.js',
      '**/test_*.py', '**/*_test.py', '**/*Test.java', '**/*Spec.java', '**/*_test.go',
    ];
    for (const g of patterns) {
      const found = await vscode.workspace.findFiles(g, '**/node_modules/**', 1);
      if (found.length > 0) { return true; }
    }
    return false;
  }

  private async _fixBuildErrors(
    provider: AIProvider,
    modelName: string,
    taskContext: string,
    candidateFiles: string[],
    errorOutput: string
  ): Promise<string[]> {
    const { readFile, writeFile } = await import('fs/promises');
    const { existsSync } = await import('fs');
    const fixed: string[] = [];
    const langOf = (fp: string) => (({ ts: 'TypeScript', tsx: 'TSX', js: 'JavaScript',
      jsx: 'JSX', java: 'Java', py: 'Python', go: 'Go', rs: 'Rust',
      kt: 'Kotlin', cs: 'C#' } as Record<string, string>)[fp.split('.').pop()?.toLowerCase() ?? ''] ?? 'code');

    const targets = candidateFiles
      .filter(fp => errorOutput.includes(nodePath.basename(fp)) || errorOutput.includes(fp));
    const toFix = (targets.length > 0 ? targets : candidateFiles).slice(0, 4);

    for (const fp of toFix) {
      const abs = nodePath.isAbsolute(fp) ? fp : nodePath.join(this.workspaceRoot, fp);
      if (!existsSync(abs)) { continue; }
      const currentCode = await readFile(abs, 'utf-8').catch(() => null);
      if (!currentCode) { continue; }

      const relevantErrors = errorOutput.split('\n')
        .filter(l => l.includes(nodePath.basename(fp)) || /\berror\b/i.test(l))
        .slice(0, 25).join('\n') || errorOutput.slice(0, 800);

      const fixPrompt =
        `Fix all build/compile errors in this ${langOf(fp)} file.\n` +
        `File: ${fp}\nContext: ${taskContext.slice(0, 200)}\n\n` +
        `BUILD ERRORS:\n${relevantErrors}\n\n` +
        `CURRENT CODE:\n${currentCode}\n\n` +
        `Output ONLY the corrected source code. No fences. No explanations.`;

      try {
        const code = await generateCode(provider, fixPrompt, fp, taskContext, langOf(fp), { maxTokens: 2048 }, modelName);
        if (code.length > 30) {
          await writeFile(abs, code, 'utf-8');
          await this._formatGeneratedFile(abs);
          fixed.push(fp);
        }
      } catch { /* skip — leave file as-is */ }
    }
    return fixed;
  }

  private async _runBuildAndTests(
    provider: AIProvider,
    modelName: string,
    taskContext: string,
    writtenFiles: string[]
  ): Promise<void> {
    const cmds = await this._detectBuildCommands();
    if (!cmds.build && !cmds.test) { return; }

    // ── Build ──────────────────────────────────────────────────────────────────
    if (cmds.build) {
      this._post({ type: 'chat-chunk', content: `\n\n*Build: \`${cmds.build}\`...*` });
      let res = await this._runCommand(cmds.build, 90_000);

      for (let i = 0; i < 2 && !res.success; i++) {
        this._post({ type: 'chat-chunk', content: `\n  build failed — fixing...` });
        const f = await this._fixBuildErrors(provider, modelName, taskContext, writtenFiles, res.output);
        if (f.length === 0) { break; }
        res = await this._runCommand(cmds.build, 90_000);
      }

      this._post({
        type: 'chat-chunk',
        content: res.success
          ? `\n  build OK`
          : `\n  build errors remain:\n\`\`\`\n${res.output.slice(-1500)}\n\`\`\``,
      });
    }

    // ── Tests ──────────────────────────────────────────────────────────────────
    if (cmds.test && await this._hasTestFiles()) {
      this._post({ type: 'chat-chunk', content: `\n\n*Tests: \`${cmds.test}\`...*` });
      let res = await this._runCommand(cmds.test, 120_000);

      for (let i = 0; i < 2 && !res.success; i++) {
        this._post({ type: 'chat-chunk', content: `\n  tests failed — fixing...` });
        const f = await this._fixBuildErrors(provider, modelName, taskContext, writtenFiles, res.output);
        if (f.length === 0) { break; }
        res = await this._runCommand(cmds.test, 120_000);
      }

      this._post({
        type: 'chat-chunk',
        content: res.success
          ? `\n  all tests pass`
          : `\n  test failures remain:\n\`\`\`\n${res.output.slice(-1500)}\n\`\`\``,
      });
    }
  }

  private _waitForDiagnostics(uri: vscode.Uri, timeoutMs = 5000): Promise<vscode.Diagnostic[]> {
    // Fast path: language server may have already computed diagnostics synchronously
    const immediate = vscode.languages.getDiagnostics(uri);
    if (immediate.length > 0) { return Promise.resolve(immediate); }

    return new Promise(resolve => {
      let done = false;
      const finish = (delay = 0) => {
        if (done) { return; }
        done = true;
        clearTimeout(fallback);
        disposable.dispose();
        setTimeout(() => resolve(vscode.languages.getDiagnostics(uri)), delay);
      };

      const fallback = setTimeout(() => finish(), timeoutMs);

      const disposable = vscode.languages.onDidChangeDiagnostics(e => {
        if (e.uris.some(u => u.toString() === uri.toString())) {
          finish(300); // small extra wait for final diagnostic batch
        }
      });

      // Secondary check: catch diagnostics that arrived between initial check and listener setup
      setTimeout(() => {
        if (!done && vscode.languages.getDiagnostics(uri).length > 0) { finish(); }
      }, 600);
    });
  }

  private async _validateAndFixFile(
    abs: string,
    language: string,
    provider: AIProvider,
    modelName: string,
    filePath: string,
    taskContext: string
  ): Promise<void> {
    const uri = vscode.Uri.file(abs);
    const { readFile, writeFile } = await import('fs/promises');

    for (let attempt = 0; attempt < 2; attempt++) {
      const diagnostics = await this._waitForDiagnostics(uri, attempt === 0 ? 8000 : 5000);
      const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
      if (errors.length === 0) { break; }

      const currentCode = await readFile(abs, 'utf-8');
      const errorList = errors
        .slice(0, 15)
        .map(e => `  L${e.range.start.line + 1} [${e.source ?? 'error'}]: ${e.message}`)
        .join('\n');

      this._post({ type: 'chat-chunk', content: `\n  fixing ${errors.length} error(s) in \`${filePath}\`...` });

      const fixPrompt =
        `Fix ALL compilation errors listed below in this ${language} file.\n` +
        `File: ${filePath}\n` +
        `Context: ${taskContext.slice(0, 200)}\n\n` +
        `ERRORS:\n${errorList}\n\n` +
        `CURRENT CODE:\n${currentCode}\n\n` +
        `Output ONLY the corrected source code. No fences, no explanations.`;

      try {
        const fixed = await generateCode(provider, fixPrompt, filePath, taskContext, language, { maxTokens: 2048 }, modelName);
        if (fixed.length > 30) {
          await writeFile(abs, fixed, 'utf-8');
          await this._formatGeneratedFile(abs);
        }
      } catch { break; }
    }

    // Quality report: remaining errors + warnings from SonarLint/ESLint/language servers
    const finalDiags = vscode.languages.getDiagnostics(uri);
    const finalErrors = finalDiags.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
    const warnings = finalDiags.filter(d => d.severity === vscode.DiagnosticSeverity.Warning);

    if (finalErrors.length > 0) {
      const lines = finalErrors.slice(0, 5)
        .map(e => `    · L${e.range.start.line + 1}: ${e.message.slice(0, 90)}`)
        .join('\n');
      this._post({ type: 'chat-chunk', content: `\n  errors remain in \`${filePath}\` — manual review:\n${lines}` });
    }
    if (warnings.length > 0 && warnings.length <= 20) {
      const lines = warnings.slice(0, 4)
        .map(w => `    · L${w.range.start.line + 1} [${w.source ?? 'warn'}]: ${w.message.slice(0, 80)}`)
        .join('\n');
      this._post({ type: 'chat-chunk', content: `\n  ${warnings.length} warning(s) in \`${filePath}\`:\n${lines}` });
    }
  }

  private async _formatGeneratedFile(absPath: string): Promise<void> {
    try {
      const uri = vscode.Uri.file(absPath);
      const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
        'vscode.executeFormatDocumentProvider',
        uri,
        { insertSpaces: true, tabSize: 2 }
      );
      if (!edits || edits.length === 0) { return; }
      const doc = await vscode.workspace.openTextDocument(uri);
      const wsEdit = new vscode.WorkspaceEdit();
      wsEdit.set(uri, edits);
      await vscode.workspace.applyEdit(wsEdit);
      await doc.save();
    } catch {
      // No formatter available for this language — skip silently
    }
  }

  private async _startTaskWork(task: SpecTask, correction?: string): Promise<void> {
    this._workedTasks.add(task.id);
    const provider = this.aiManager.getActive();
    if (!provider) {
      this._post({ type: 'task-work-error', taskId: task.id, error: 'No hay proveedor AI disponible.' });
      return;
    }

    this._post({ type: 'task-work-started', taskId: task.id, title: task.title });

    const specData = await this.specManager.load();
    const epicContext = this._epicExcerpt(specData.markdown, task.epicTitle);
    let tree = await this._workspaceTree();
    let treeSection = tree ? `Project structure:\n${tree}\n\n` : '';
    const header = correction ? `**ðŸ”„ Correction:** ${task.title}` : `**> Implementando:** ${task.title}`;

    try {
      const activeModelName = provider.modelName;
      const smallModel = isSmallModel(activeModelName);
      const masterPrompt = await this._contextBuilder.getMasterPrompt(smallModel);

      // -- Phase 0a: Extract explicit paths from task title + epic context -------
      // Handles spec annotations like "archivo src/feature/Service.ts" or backtick refs.
      let filePaths = this._extractPathHints(`${task.title}\n${epicContext}`);

      // -- Phase 0b: Bootstrap empty workspace before first task ----------------
      // Detects a brand-new project (only spec.md present) and scaffolds the canonical
      // directory structure via ProjectBuilderSkill, then re-derives the tree.
      if (this._isEmptyWorkspace(tree) && !correction) {
        await this._bootstrapFromSpec(`${epicContext}\n\nTask: ${task.title}`);
        tree = await this._workspaceTree();
        treeSection = tree ? `Project structure:\n${tree}\n\n` : '';
        if (filePaths.length === 0) {
          filePaths = this._extractPathHints(`${task.title}\n${epicContext}`);
        }
      }

      // -- Phase 0c: Skill routing — delegate to registered skill when applicable
      // Avoids duplicating skill logic inline; corrections always use inline path.
      if (!correction && !smallModel) {
        const skillId = this._routeTaskToSkill(task, epicContext);
        if (skillId) {
          await this._runSkillForTask(task, epicContext, specData.tasks, skillId);
          return;
        }
      }

      // -- Build spec state context for prompts ---------------------------------
      const specState = !smallModel ? this._buildSpecStateContext(specData.tasks, task.id) : '';
      const specStateSection = specState ? `\nSpec state:\n${specState}\n\n` : '';

      // -- Phase 1: AI planning — skipped when explicit paths already found -----
      // Small models echo back "Task context:" labels verbatim, so we use a
      // minimal prompt that skips the epic context entirely for those models.
      let planModel = activeModelName;
      if (filePaths.length === 0) {
        const planPrompt = smallModel
          ? `Task: "${task.title}"\n` +
            (tree ? `Existing files:\n${tree}\n` : '') +
            `Give ONE relative file path to create or modify. Output only the path, nothing else.`
          : `${correction ? 'Fix' : 'Implement'}: ${task.title}\n\n` +
            treeSection +
            `Task context:\n${epicContext}\n\n` +
            specStateSection +
            (correction ? `Problem to fix: ${correction}\n\n` : '') +
            `List the relative file paths to create or modify (one per line).\n` +
            `If no path is specified, infer a reasonable one from the task (e.g. index.html, src/main.ts).\n` +
            `Output ONLY the paths, no explanations, no markdown.`;

        const plan = await provider.chat(
          [{ role: 'user', content: planPrompt }],
          { systemPrompt: 'Software agent. You MUST output at least one file path. File paths only, one per line, no prose.', maxTokens: 150 }
        );
        planModel = plan.model;
        filePaths = this._parseFilePaths(plan.content);

        // Retry: if Phase 1 returned prose, ask once more with a minimal prompt.
        if (filePaths.length === 0) {
          const retryResp = await provider.chat(
            [{ role: 'user', content: `Task: "${task.title}"\nGive ONE relative file path to create or modify. Only the path, nothing else.` }],
            { systemPrompt: 'Output only a single relative file path like: src/index.html', maxTokens: 50 }
          );
          const retryPath = retryResp.content.trim().split('\n')[0].replace(/`/g, '').trim();
          if (/\.\w{1,6}$/.test(retryPath) && !/\s/.test(retryPath)) {
            filePaths = [retryPath];
            planModel = retryResp.model;
          }
        }
      }

      this._post({ type: 'chat-chunk', content: `${header}\n\n**Plan:**\n${filePaths.length > 0 ? filePaths.join('\n') : '_Sin rutas detectadas_'}` });

      // -- Phase 2: Generate + write each file ----------------------------------
      const written: string[] = [];
      // Quality tasks (format + validate) deferred to background pipeline
      const qualityTasks: Array<() => Promise<void>> = [];

      // Spec file path for protection check
      const specAbsPath = nodePath.resolve(this.specManager.specPath);

      for (const filePath of filePaths.slice(0, 6)) {
        // Never let the AI overwrite spec.md - that would wipe all tasks
        const fileAbsPath = nodePath.isAbsolute(filePath)
          ? nodePath.resolve(filePath)
          : nodePath.resolve(this.workspaceRoot, filePath);
        if (fileAbsPath === specAbsPath) {
          this._post({ type: 'chat-chunk', content: `\n(!)  Skipping \`${filePath}\` - spec file is protected from AI writes.` });
          continue;
        }

        this._post({ type: 'chat-chunk', content: `\n\n*Generando \`${filePath}\`...*` });

        const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
        const langMap: Record<string, string> = {
          ts: 'TypeScript', tsx: 'TSX', js: 'JavaScript', jsx: 'JSX',
          py: 'Python', html: 'HTML', css: 'CSS', json: 'JSON',
          md: 'Markdown', go: 'Go', rs: 'Rust', java: 'Java'
        };
        const language = langMap[ext] ?? ext.toUpperCase();
        const description =
          (correction ? `Fix: ${correction} - ` : '') +
          `${task.title}. Context: ${epicContext.slice(0, 300)}`;

        // Small models echo back prompt labels ("Spec context:", "## NOW GENERATE:") as code.
        // Use an ultra-minimal prompt that starts with a direct code instruction.
        const codePrompt = smallModel
          ? `Write ${language} source code for file: ${filePath}\n` +
            `Purpose: ${task.title.slice(0, 120)}` +
            (correction ? `\nFix: ${correction}` : '') +
            `\nOutput ONLY the raw ${language} code. First line must be code, not prose.`
          : `${masterPrompt}\n\n` +
            `## NOW GENERATE:\n` +
            `File: ${filePath}\n` +
            `Language: ${language}\n` +
            `Expected functional content: ${task.title}` +
            (correction ? `\nFix: ${correction}` : '') +
            `\nSpec context: ${epicContext.slice(0, 400)}` +
            (specStateSection ? `\n\n${specStateSection.trim()}` : '');

        try {
          const content = await generateCode(provider, codePrompt, filePath, description, language, { maxTokens: 1024 }, activeModelName);
          const abs = nodePath.isAbsolute(filePath)
            ? filePath
            : nodePath.join(this.workspaceRoot, filePath);
          await this.mcpManager.executeTool('filesystem', 'write_file', { path: abs, content });
          written.push(filePath);
          this._memory.extractFromCode(filePath, content, language);
          this._post({ type: 'chat-chunk', content: `\n[ok] \`${filePath}\`` });
          // Defer format + validate to background quality pipeline (non-blocking for Kanban)
          const _abs = abs, _lang = language, _fp = filePath, _desc = description;
          qualityTasks.push(() =>
            this._formatGeneratedFile(_abs)
              .then(() => this._validateAndFixFile(_abs, _lang, provider, activeModelName, _fp, _desc))
              .catch(() => {})
          );
        } catch (e) {
          this._post({ type: 'chat-chunk', content: `\n(!)  No se pudo escribir \`${filePath}\`: ${e}` });
        }
      }

      if (written.length > 0) {
        this._post({ type: 'chat-chunk', content: `\n\n**Archivos creados/modificados (${written.length}):**\n${written.map(f => `- \`${f}\``).join('\n')}` });

        // -- Fast Kanban completion: mark Done immediately after files are written --
        // Quality pipeline (format → validate → build → test) runs asynchronously.
        // setBoardStatus covers the transient window before spec.md is written to disk.
        this.specManager.setBoardStatus(task.id, 'done');
        const taskRef = specData.tasks.find(t => t.id === task.id);
        if (taskRef) { taskRef.done = true; taskRef.status = 'done'; }
        this._post({ type: 'spec-data', data: specData });
        this._post({ type: 'task-work-done', taskId: task.id, title: task.title });
        this._post({ type: 'chat-done', model: planModel });

        // Fire-and-forget: quality pipeline does not block the Kanban board
        const _taskTitle = task.title, _taskId = task.id, _epicTitle = task.epicTitle;
        const _taskCtx = `${task.title}: ${epicContext.slice(0, 200)}`;
        void (async () => {
          await Promise.allSettled(qualityTasks.map(fn => fn()));
          await this._runBuildAndTests(provider, activeModelName, _taskCtx, written);
          this._memory.set('feature', _taskId, `${_taskTitle} - files: ${written.join(', ')}`, { parentKey: _epicTitle, tags: ['task', 'completed'] });
          await Promise.allSettled([
            this._memory.save(),
            this.specManager.updateTaskDone(task, true),
          ]);
        })().catch(() => {});

      } else if (filePaths.length === 0) {
        this._post({ type: 'chat-chunk', content: `\n\n[info] El AI no identified archivos para crear. Usa el skill \`create-file\` o especifica la ruta en la tarea.` });
        this._post({ type: 'chat-done', model: planModel });
      } else {
        this._post({ type: 'chat-chunk', content: `\n\n(!)  No se pudieron escribir los archivos. Verifica que el workspace este abierto y sea accesible.` });
        this._post({ type: 'chat-done', model: planModel });
      }

    } catch (err) {
      this._post({
        type: 'task-work-error',
        taskId: task.id,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  private async _handleTaskCorrection(taskId: string, correction: string): Promise<void> {
    const data = await this.specManager.load();
    const task = data.tasks.find(t => t.id === taskId);
    if (!task) { return; }
    this.specManager.setBoardStatus(taskId, 'in-progress');
    await this._sendSpec();
    await this._startTaskWork(task, correction);
  }

  // -- Skills -----------------------------------------------------------------

  private async _handleRunSkill(skillId: string, params: Record<string, unknown>): Promise<void> {
    const provider = this.aiManager.getActive();
    if (!provider) {
      this._post({ type: 'skill-result', success: false, errors: ['No hay proveedor AI disponible.'] });
      return;
    }

    // Auto-fill 'path' from active editor when not provided
    const resolved = { ...params };
    if (!resolved.path && PATH_SKILLS.has(skillId)) {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        resolved.path = nodePath.relative(this.workspaceRoot, editor.document.uri.fsPath);
      } else {
        this._post({ type: 'skill-needs-path', skillId, needsDesc: skillId === 'create-file' });
        return;
      }
    }
    if (!resolved.specPath && SPEC_SKILLS.has(skillId)) {
      this._post({ type: 'skill-needs-path', skillId, needsDesc: false, needsSpecPath: true });
      return;
    }
    if (!resolved.goal && GOAL_SKILLS.has(skillId)) {
      this._post({ type: 'skill-needs-goal', skillId });
      return;
    }

    const ctx: SkillContext = {
      ai: provider,
      mcp: this.mcpManager,
      workspace: this.workspaceRoot,
      parameters: resolved
    };
    const result = await this.skillRegistry.execute(skillId, ctx);
    this._post({
      type: 'skill-result',
      success: result.success,
      output: result.output,
      errors: result.errors
    });
  }

  // -- Spec regeneration ------------------------------------------------------

  // Canonical format template injected into every spec-generation prompt so the model
  // knows exactly what structure is required and doesn't invent RNF_XX / #### styles.
  private static readonly SPEC_FORMAT_TEMPLATE =
    `## Epic: [nombre de la épica]\n` +
    `- [ ] Implementar archivo src/feature/Component.ts\n` +
    `- [ ] Crear endpoint GET /api/resource en src/routes/resource.ts\n` +
    `- [ ] Agregar validación en src/services/validator.ts\n\n` +
    `## Epic: [nombre de otra épica]\n` +
    `- [ ] ...\n`;

  private _buildSpecPrompt(context: string, small: boolean): string {
    const ctxSlice = context.slice(0, 300);
    if (small) {
      return context
        ? `Write a spec.md for: ${ctxSlice}\n\n` +
          `EXACT FORMAT (copy this structure):\n${MainPanel.SPEC_FORMAT_TEMPLATE}\n` +
          `Rules:\n` +
          `- Use ## for epic headings ONLY (no ####, no RNF_XX, no numbered sections)\n` +
          `- Each task line MUST start with "- [ ] " followed by a concrete file or action\n` +
          `- Write 3 epics with 3 tasks each\n` +
          `- Output ONLY the spec.md content`
        : `Write a spec.md for a software project.\n\n` +
          `EXACT FORMAT:\n${MainPanel.SPEC_FORMAT_TEMPLATE}\n` +
          `Write 3 epics (Auth, Core Features, Testing) with 3 tasks each.\n` +
          `Output ONLY the spec.md content.`;
    }
    return context
      ? `Genera un spec.md para implementar: ${ctxSlice}\n\n` +
        `FORMATO EXACTO OBLIGATORIO — copia esta estructura:\n${MainPanel.SPEC_FORMAT_TEMPLATE}\n` +
        `Reglas estrictas:\n` +
        `- Encabezados de épica SOLO con ## (prohibido ####, RNF_XX, numeración)\n` +
        `- Cada tarea DEBE empezar con "- [ ] " seguido de un archivo o acción concreta implementable\n` +
        `- Mínimo 3 épicas con 3-5 tareas cada una\n` +
        `- Escribe ÚNICAMENTE el contenido del spec.md, sin texto adicional`
      : `Genera un spec.md inicial para un proyecto de software.\n\n` +
        `FORMATO EXACTO:\n${MainPanel.SPEC_FORMAT_TEMPLATE}\n` +
        `Usa 4 épicas: Autenticación, Funcionalidades Core, Testing, Despliegue.\n` +
        `3-4 tareas por épica. Solo el contenido del spec.md.`;
  }

  private async _handleRegenSpec(context: string): Promise<void> {
    const provider = this.aiManager.getActive();
    if (!provider) { return; }

    const activeModelName = provider.modelName;
    const small = isSmallModel(activeModelName);
    const prompt = this._buildSpecPrompt(context, small);

    try {
      let content = await provider.complete(prompt, { maxTokens: small ? 800 : 2048, temperature: small ? 0.05 : 0.3 });

      // Normalize format: converts numbered lists, plain bullets, h1 headings, etc.
      // into the canonical `- [ ] task` format before checking or saving.
      content = normalizeSpecContent(content);

      // Retry once when fewer than 3 parseable checkbox tasks remain after normalization.
      const taskCount = (content.match(/^\s*[-*]\s+\[([ x])\]\s*.+/gim) ?? []).length;
      if (taskCount < 3) {
        const retryPrompt =
          `Complete the following spec.md skeleton — fill in the [ ] lines with real implementable tasks for: ${context || 'a web application'}\n\n` +
          `## Epic: Autenticación\n- [ ] \n- [ ] \n- [ ] \n\n` +
          `## Epic: Funcionalidades Core\n- [ ] \n- [ ] \n- [ ] \n\n` +
          `## Epic: Testing\n- [ ] \n- [ ] \n- [ ] \n\n` +
          `Output ONLY the filled spec.md. Keep ## headings exactly as shown.`;
        content = await provider.complete(retryPrompt, { maxTokens: small ? 600 : 1500, temperature: 0.05 });
        content = normalizeSpecContent(content);
      }

      content = deduplicateSpecTasks(content);
      await this.specManager.create(content);
      await this._sendSpec();
      const preview = content.slice(0, 600) + (content.length > 600 ? '\n...' : '');
      this._post({ type: 'chat-chunk', content: `**spec.md generado**\n\`\`\`markdown\n${preview}\n\`\`\`` });
      this._post({ type: 'chat-done', model: activeModelName });
    } catch (err) {
      this._post({ type: 'chat-error', error: err instanceof Error ? err.message : String(err) });
    }
  }

  // -- Architecture diagram persistence & export ------------------------------

  private async _handleArchSave(diagram: object): Promise<void> {
    const { mkdir, writeFile } = await import('fs/promises');
    const dir = nodePath.join(this.workspaceRoot, '.alpaquitay');
    const file = nodePath.join(dir, 'arch.json');
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(file, JSON.stringify(diagram, null, 2), 'utf-8');
    } catch { /* silent - arch save is best-effort */ }
  }

  private async _handleArchLoad(): Promise<void> {
    const { readFile } = await import('fs/promises');
    const file = nodePath.join(this.workspaceRoot, '.alpaquitay', 'arch.json');
    try {
      const content = await readFile(file, 'utf-8');
      this._post({ type: 'arch-data', diagram: JSON.parse(content) });
    } catch {
      // No saved diagram — auto-infer from spec + workspace structure
      const diagram = await this._inferArchitecture();
      this._post({ type: 'arch-data', diagram });
      if (diagram.nodes.length > 0) {
        this._handleArchSave(diagram).catch(() => {});
      }
    }
  }

  private async _inferArchitecture(): Promise<ArchDiagram> {
    const nodes: ArchNode[] = [];
    const edges: ArchEdge[] = [];

    // Derive epic-level components from spec.md
    const specData = await this.specManager.load();
    const epics = [...new Set(specData.tasks.map(t => t.epicTitle))];

    const EPIC_KEYWORDS: Array<[RegExp, ArchNodeType]> = [
      [/auth|login|user|session|oauth|jwt/i,            'auth'],
      [/api|endpoint|route|rest|graphql/i,              'api'],
      [/database|db|postgres|mysql|mongo|sqlite|persist/i, 'db'],
      [/cache|redis|memcach/i,                          'cache'],
      [/queue|event|message|kafka|rabbit|pubsub/i,      'queue'],
      [/storage|file|upload|s3|blob/i,                  'storage'],
      [/frontend|ui|web|view|spa|react|vue|angular/i,   'client'],
      [/cdn|static|asset|media/i,                       'cdn'],
      [/lambda|serverless|function/i,                   'lambda'],
      [/container|docker|kubernetes|k8s/i,              'container'],
    ];

    let x = 100, y = 80;
    const advance = () => { x += 210; if (x > 850) { x = 100; y += 160; } };

    for (const epic of epics) {
      let nodeType: ArchNodeType = 'service';
      for (const [re, t] of EPIC_KEYWORDS) { if (re.test(epic)) { nodeType = t; break; } }
      nodes.push({ id: `node-${nodes.length + 1}`, type: nodeType, name: epic, x, y });
      advance();
    }

    // Augment with folder-based detection when workspace has code
    try {
      const entries = await this.mcpManager.executeTool('filesystem', 'list_files', { path: '.' }) as Array<{ name: string; isDirectory: boolean }>;
      const dirs = new Set(entries.filter(e => e.isDirectory).map(e => e.name.toLowerCase()));
      const FOLDER_MAP: Array<[string[], ArchNodeType, string]> = [
        [['frontend', 'client', 'web', 'ui'],           'client',    'Frontend'],
        [['backend', 'server', 'api'],                  'api',       'Backend API'],
        [['db', 'database', 'migrations'],              'db',        'Database'],
        [['cache', 'redis'],                            'cache',     'Cache'],
        [['queue', 'events', 'messaging'],              'queue',     'Message Queue'],
        [['storage', 'files', 'uploads'],               'storage',   'File Storage'],
        [['auth', 'identity'],                          'auth',      'Auth Service'],
        [['infra', 'terraform', 'k8s', 'kubernetes'],   'container', 'Infrastructure'],
      ];
      for (const [folders, nodeType, name] of FOLDER_MAP) {
        if (folders.some(f => dirs.has(f)) && !nodes.some(n => n.type === nodeType)) {
          nodes.push({ id: `node-${nodes.length + 1}`, type: nodeType, name, x, y });
          advance();
        }
      }
    } catch { /* workspace scan failed — spec-only diagram */ }

    // Auto-wire common dependency patterns
    let edgeId = 1;
    const find = (type: ArchNodeType) => nodes.find(n => n.type === type);
    const addEdge = (from: ArchNode, to: ArchNode, label?: string) =>
      edges.push({ id: `edge-${edgeId++}`, from: from.id, to: to.id, label });

    const client = find('client'), api = find('api') ?? find('service');
    const auth = find('auth'), db = find('db'), cache = find('cache'), queue = find('queue');
    if (client && api)  { addEdge(client, api, 'HTTP'); }
    if (api && auth)    { addEdge(api, auth, 'verify'); }
    if (api && db)      { addEdge(api, db, 'read/write'); }
    if (api && cache)   { addEdge(api, cache, 'cache'); }
    if (api && queue)   { addEdge(api, queue, 'publish'); }

    return { nodes, edges };
  }

  private async _handleArchExport(diagram: ArchDiagram, format: string): Promise<void> {
    let content = '';
    let ext = 'tf';
    try {
      switch (format) {
        case 'terraform': content = this._genTerraform(diagram); ext = 'tf';   break;
        case 'cdk':       content = this._genCDK(diagram);       ext = 'ts';   break;
        case 'bicep':     content = this._genBicep(diagram);     ext = 'bicep'; break;
        case 'gcp':       content = this._genGCPYaml(diagram);   ext = 'yaml'; break;
        default: return;
      }
      const infraDir = nodePath.join(this.workspaceRoot, 'infra');
      const filename = `infra/main.${ext}`;
      const abs = nodePath.join(this.workspaceRoot, filename);
      const { mkdir, writeFile } = await import('fs/promises');
      await mkdir(infraDir, { recursive: true });
      await writeFile(abs, content, 'utf-8');
      this._post({ type: 'arch-exported', filename });
    } catch (err) {
      this._post({ type: 'arch-export-error', error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async _handleArchChat(text: string, currentDiagram: ArchDiagram): Promise<void> {
    const provider = this.aiManager.getActive();
    if (!provider) {
      this._post({ type: 'arch-chat-error', error: 'No AI provider available. Configure one in Settings.' });
      return;
    }
    try {
      const { SoftwareArchitectShell } = await import('../domains/software-architect/SoftwareArchitectShell');
      const shell = new SoftwareArchitectShell();
      await shell.initialize(provider, this.workspaceRoot);
      const result = await shell.run('interactive-diagram', { instruction: text, currentDiagram });
      if (result.success && result.data) {
        const data = result.data as { explanation?: string; diagram?: ArchDiagram };
        let patch: ArchDiagramPatch | null = null;
        const explanation = data.explanation ?? 'Diagram updated.';
        if (data.diagram) { patch = { replace: data.diagram }; }
        this._post({ type: 'arch-chat-chunk', content: explanation });
        if (result.guardrailResults?.length) {
          const warns = result.guardrailResults.map(g => `⚠ ${g.rule}: ${g.message}`).join('\n');
          this._post({ type: 'arch-chat-chunk', content: `\n\n${warns}` });
        }
        this._post({ type: 'arch-chat-done', patch, model: provider.modelName });
      } else {
        this._post({ type: 'arch-chat-error', error: result.errors?.join('; ') ?? 'Unknown error' });
      }
    } catch (err) {
      this._post({ type: 'arch-chat-error', error: err instanceof Error ? err.message : String(err) });
    }
  }

  private _slug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'resource';
  }

  private _genTerraform(d: ArchDiagram): string {
    const lines: string[] = [
      '# Generated by Alpaquitay AI - Architecture Diagram',
      '# https://github.com/sergioide007/alpaquitay-ai',
      '',
      'terraform {',
      '  required_version = ">= 1.5"',
      '  required_providers {',
      '    aws = { source = "hashicorp/aws", version = "~> 5.0" }',
      '  }',
      '}',
      '',
      'provider "aws" { region = var.region }',
      'variable "region" { default = "us-east-1" }',
      'variable "env"    { default = "prod" }',
      '',
    ];
    for (const n of d.nodes) {
      const s = this._slug(n.name);
      switch (n.type) {
        case 'lambda': case 'function':
          lines.push(`# -- Lambda: ${n.name}`, `resource "aws_iam_role" "${s}_exec" {`,
            `  name = "${s}-exec-\${var.env}"`,
            `  assume_role_policy = jsonencode({ Version="2012-10-17" Statement=[{`,
            `    Action="sts:AssumeRole" Effect="Allow" Principal={ Service="lambda.amazonaws.com" }}] })`,
            `}`, `resource "aws_lambda_function" "${s}" {`,
            `  function_name = "${s}-\${var.env}"`,
            `  role          = aws_iam_role.${s}_exec.arn`,
            `  runtime       = "nodejs20.x"`,
            `  handler       = "index.handler"`,
            `  filename      = "${s}.zip"`,
            `}`, '');
          break;
        case 'api':
          lines.push(`# -- API Gateway: ${n.name}`, `resource "aws_api_gateway_rest_api" "${s}" {`,
            `  name = "${s}-\${var.env}"`, `}`, '');
          break;
        case 'db':
          lines.push(`# -- DynamoDB: ${n.name}`, `resource "aws_dynamodb_table" "${s}" {`,
            `  name         = "${s}-\${var.env}"`,
            `  billing_mode = "PAY_PER_REQUEST"`,
            `  hash_key     = "id"`,
            `  attribute { name = "id" type = "S" }`,
            `}`, '');
          break;
        case 'storage':
          lines.push(`# -- S3: ${n.name}`, `resource "aws_s3_bucket" "${s}" {`,
            `  bucket = "${s}-\${var.env}"`, `}`, '');
          break;
        case 'queue':
          lines.push(`# -- SQS: ${n.name}`, `resource "aws_sqs_queue" "${s}" {`,
            `  name = "${s}-\${var.env}"`, `}`, '');
          break;
        case 'cache':
          lines.push(`# -- ElastiCache: ${n.name}`, `resource "aws_elasticache_cluster" "${s}" {`,
            `  cluster_id           = "${s}-\${var.env}"`,
            `  engine               = "redis"`,
            `  node_type            = "cache.t3.micro"`,
            `  num_cache_nodes      = 1`, `}`, '');
          break;
        case 'auth':
          lines.push(`# -- Cognito: ${n.name}`, `resource "aws_cognito_user_pool" "${s}" {`,
            `  name = "${s}-\${var.env}"`, `}`, '');
          break;
        case 'container':
          lines.push(`# -- ECS: ${n.name}`, `resource "aws_ecs_cluster" "${s}" {`,
            `  name = "${s}-\${var.env}"`, `}`, '');
          break;
        default:
          lines.push(`# -- Service: ${n.name}  (type: ${n.type}) - configure manually`, '');
      }
    }
    return lines.join('\n');
  }

  private _genCDK(d: ArchDiagram): string {
    const imports = new Set<string>();
    const constructs: string[] = [];
    for (const n of d.nodes) {
      const v = this._slug(n.name).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      switch (n.type) {
        case 'lambda': case 'function':
          imports.add("import * as lambda from 'aws-cdk-lib/aws-lambda';");
          constructs.push(
            `    const ${v} = new lambda.Function(this, '${v}', {`,
            `      functionName: '${this._slug(n.name)}',`,
            `      runtime: lambda.Runtime.NODEJS_20_X,`,
            `      handler: 'index.handler',`,
            `      code: lambda.Code.fromAsset('${this._slug(n.name)}'),`,
            `    });`, '');
          break;
        case 'api':
          imports.add("import * as apigateway from 'aws-cdk-lib/aws-apigateway';");
          constructs.push(
            `    const ${v} = new apigateway.RestApi(this, '${v}', {`,
            `      restApiName: '${this._slug(n.name)}',`,
            `    });`, '');
          break;
        case 'db':
          imports.add("import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';");
          constructs.push(
            `    const ${v} = new dynamodb.Table(this, '${v}', {`,
            `      tableName: '${this._slug(n.name)}',`,
            `      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },`,
            `      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,`,
            `    });`, '');
          break;
        case 'storage':
          imports.add("import * as s3 from 'aws-cdk-lib/aws-s3';");
          constructs.push(
            `    const ${v} = new s3.Bucket(this, '${v}', {`,
            `      bucketName: '${this._slug(n.name)}',`,
            `    });`, '');
          break;
        case 'queue':
          imports.add("import * as sqs from 'aws-cdk-lib/aws-sqs';");
          constructs.push(
            `    const ${v} = new sqs.Queue(this, '${v}', {`,
            `      queueName: '${this._slug(n.name)}',`,
            `    });`, '');
          break;
        default:
          constructs.push(`    // ${n.name} (${n.type}) - add construct manually`, '');
      }
    }
    return [
      '// Generated by Alpaquitay AI - Architecture Diagram',
      "import { App, Stack, StackProps } from 'aws-cdk-lib';",
      "import { Construct } from 'constructs';",
      ...[...imports],
      '',
      'export class InfraStack extends Stack {',
      '  constructor(scope: Construct, id: string, props?: StackProps) {',
      '    super(scope, id, props);',
      '',
      ...constructs,
      '  }',
      '}',
      '',
      "new App().synth();",
    ].join('\n');
  }

  private _genBicep(d: ArchDiagram): string {
    const lines = [
      '// Generated by Alpaquitay AI - Architecture Diagram',
      "param location string = resourceGroup().location",
      "param env string = 'prod'",
      '',
    ];
    for (const n of d.nodes) {
      const s = this._slug(n.name);
      switch (n.type) {
        case 'lambda': case 'function':
          lines.push(
            `// Function App: ${n.name}`,
            `resource ${s.replace(/-/g, '_')}Plan 'Microsoft.Web/serverfarms@2022-09-01' = {`,
            `  name: '${s}-plan-\${env}'`, `  location: location`,
            `  kind: 'linux'`, `  sku: { name: 'Y1', tier: 'Dynamic' }`, `}`,
            `resource ${s.replace(/-/g, '_')} 'Microsoft.Web/sites@2022-09-01' = {`,
            `  name: '${s}-\${env}'`, `  location: location`, `  kind: 'functionapp,linux'`,
            `  properties: { serverFarmId: ${s.replace(/-/g, '_')}Plan.id }`, `}`, '');
          break;
        case 'api':
          lines.push(
            `// API Management: ${n.name}`,
            `resource ${s.replace(/-/g, '_')} 'Microsoft.ApiManagement/service@2022-08-01' = {`,
            `  name: '${s}-\${env}'`, `  location: location`,
            `  sku: { name: 'Consumption', capacity: 0 }`,
            `  properties: { publisherEmail: 'admin@example.com', publisherName: 'Admin' }`, `}`, '');
          break;
        case 'db':
          lines.push(
            `// Cosmos DB: ${n.name}`,
            `resource ${s.replace(/-/g, '_')} 'Microsoft.DocumentDB/databaseAccounts@2023-04-15' = {`,
            `  name: '${s}-\${env}'`, `  location: location`, `  kind: 'GlobalDocumentDB'`,
            `  properties: { databaseAccountOfferType: 'Standard', locations: [{ locationName: location }] }`, `}`, '');
          break;
        case 'storage':
          lines.push(
            `// Storage: ${n.name}`,
            `resource ${s.replace(/-/g, '_')} 'Microsoft.Storage/storageAccounts@2022-09-01' = {`,
            `  name: '${s.replace(/-/g, '')}${'{env}'}' `, `  location: location`,
            `  kind: 'StorageV2'`, `  sku: { name: 'Standard_LRS' }`, `}`, '');
          break;
        default:
          lines.push(`// ${n.name} (${n.type}) - add Bicep resource manually`, '');
      }
    }
    return lines.join('\n');
  }

  private _genGCPYaml(d: ArchDiagram): string {
    const lines = [
      '# Generated by Alpaquitay AI - Architecture Diagram',
      '# GCP Cloud Deployment Manager / Cloud Run',
      '',
      'resources:',
    ];
    for (const n of d.nodes) {
      const s = this._slug(n.name);
      switch (n.type) {
        case 'lambda': case 'function':
          lines.push(
            `- name: ${s}`,
            `  type: gcp-types/cloudfunctions-v1:projects.locations.functions`,
            `  properties:`,
            `    location: us-central1`,
            `    function:`,
            `      name: ${s}`,
            `      runtime: nodejs20`,
            `      entryPoint: handler`,
            `      sourceArchiveUrl: gs://my-bucket/${s}.zip`,
            `      httpsTrigger: {}`,
            '');
          break;
        case 'api':
          lines.push(
            `- name: ${s}`,
            `  type: gcp-types/apigateway-v1beta:projects.locations.apis`,
            `  properties:`,
            `    apiId: ${s}`,
            '');
          break;
        case 'db':
          lines.push(
            `- name: ${s}`,
            `  type: gcp-types/firestore-v1:projects.databases`,
            `  properties:`,
            `    project: my-gcp-project`,
            `    database: { type: FIRESTORE_NATIVE, locationId: us-east1 }`,
            '');
          break;
        case 'storage':
          lines.push(
            `- name: ${s}`,
            `  type: storage.v1.bucket`,
            `  properties:`,
            `    name: ${s}-bucket`,
            `    location: US`,
            '');
          break;
        case 'container':
          lines.push(
            `- name: ${s}`,
            `  type: run.googleapis.com/v1:namespaces.services`,
            `  properties:`,
            `    apiVersion: serving.knative.dev/v1`,
            `    kind: Service`,
            `    metadata: { name: ${s} }`,
            `    spec:`,
            `      template:`,
            `        spec:`,
            `          containers:`,
            `          - image: gcr.io/my-project/${s}:latest`,
            '');
          break;
        default:
          lines.push(`# ${n.name} (${n.type}) - configure manually`, '');
      }
    }
    return lines.join('\n');
  }

  // -- Run skill on a specific spec task --------------------------------------

  private async _handleRunSkillOnTask(skillId: string, taskId: string): Promise<void> {
    const data = await this.specManager.load();
    const task = data.tasks.find(t => t.id === taskId);
    if (!task) {
      this._post({ type: 'skill-result', success: false, errors: ['Task not found: ' + taskId] });
      return;
    }
    const provider = this.aiManager.getActive();
    if (!provider) {
      this._post({ type: 'skill-result', success: false, errors: ['No AI provider available.'] });
      return;
    }

    // Resolve the file path: first check memory for files generated for this task,
    // then fall back to whatever file is open in the active editor.
    let filePath = '';
    const memEntry = this._memory.get('feature', taskId);
    if (memEntry?.value) {
      const filesMatch = memEntry.value.match(/\bfiles?:\s*(.+)$/i);
      if (filesMatch) {
        filePath = filesMatch[1].split(',')[0].trim();
      }
    }
    if (!filePath) {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        filePath = nodePath.relative(this.workspaceRoot, editor.document.uri.fsPath);
      }
    }
    if (!filePath) {
      this._post({
        type: 'skill-result',
        success: false,
        errors: [`Abre el archivo generado por la tarea en el editor y luego ejecuta "${skillId}".`]
      });
      return;
    }

    const ctx: SkillContext = {
      ai: provider,
      mcp: this.mcpManager,
      workspace: this.workspaceRoot,
      parameters: { path: filePath, description: task.title, task: task.title, goal: task.title }
    };
    const result = await this.skillRegistry.execute(skillId, ctx);
    this._post({ type: 'skill-result', success: result.success, output: result.output, errors: result.errors });
  }

  // -- Skill creation ---------------------------------------------------------

  private async _handleCreateSkill(name: string, description: string, prompt: string): Promise<void> {
    const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    this.skillRegistry.register({
      id,
      name,
      description,
      execute: async (ctx: SkillContext) => {
        const result = await ctx.ai.complete(prompt);
        return { success: true, output: result };
      }
    });
    await this._sendSkills();
  }

  // -- Spec inline editing ----------------------------------------------------

  private async _handleAddSpecTask(epicTitle: string, taskTitle: string): Promise<void> {
    await this.specManager.addTask(epicTitle, taskTitle);
    await this._sendSpec();
  }

  private async _handleUpdateSpecTask(taskId: string, newTitle: string): Promise<void> {
    await this.specManager.updateTaskTitle(taskId, newTitle);
    await this._sendSpec();
  }

  private async _handleDeleteSpecTask(taskId: string): Promise<void> {
    await this.specManager.deleteTask(taskId);
    this.specManager.setBoardStatus(taskId, 'backlog');
    await this._sendSpec();
  }

  private async _handleAddSpecEpic(epicTitle: string): Promise<void> {
    await this.specManager.addEpic(epicTitle);
    await this._sendSpec();
  }

  private async _handleUpdateSpecEpic(oldTitle: string, newTitle: string): Promise<void> {
    await this.specManager.updateEpicTitle(oldTitle, newTitle);
    await this._sendSpec();
  }

  private async _handleDeleteSpecEpic(epicTitle: string): Promise<void> {
    await this.specManager.deleteEpic(epicTitle);
    await this._sendSpec();
  }

  // -- Architecture ADR & assessment ------------------------------------------

  private async _handleCreateAdr(context: string, decision: string): Promise<void> {
    const provider = this.aiManager.getActive();
    if (!provider) {
      this._post({ type: 'arch-chat-error', error: 'No AI provider available.' });
      return;
    }
    try {
      const { SoftwareArchitectShell } = await import('../domains/software-architect/SoftwareArchitectShell');
      const shell = new SoftwareArchitectShell();
      await shell.initialize(provider, this.workspaceRoot);
      const result = await shell.run('create-adr', { context, decision });
      if (result.success && result.data) {
        const adr = result.data as {
          id?: string; title?: string; status?: string; context?: string;
          decision?: string; consequences?: string;
          alternatives?: string[]; qualityAttributes?: string[]; isoReference?: string;
        };
        const adrId = adr.id ?? `ADR-${String(Date.now()).slice(-4)}`;
        const title = adr.title ?? decision.slice(0, 60);
        const content = [
          `# ${adrId}: ${title}`,
          ``,
          `**Status:** ${adr.status ?? 'Proposed'}`,
          `**Date:** ${new Date().toISOString().split('T')[0]}`,
          `**ISO Reference:** ${adr.isoReference ?? 'ISO/IEC 42010'}`,
          ``,
          `## Context`,
          ``,
          adr.context ?? context,
          ``,
          `## Decision`,
          ``,
          adr.decision ?? decision,
          ``,
          `## Consequences`,
          ``,
          adr.consequences ?? '',
          ``,
          `## Alternatives Considered`,
          ``,
          ...(adr.alternatives ?? []).map((a: string) => `- ${a}`),
          ``,
          `## Quality Attributes`,
          ``,
          ...(adr.qualityAttributes ?? []).map((q: string) => `- ${q}`),
        ].join('\n');
        const { mkdir, writeFile } = await import('fs/promises');
        const adrDir = nodePath.join(this.workspaceRoot, '.alpaquitay', 'adrs');
        await mkdir(adrDir, { recursive: true });
        const filename = `${adrId.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;
        await writeFile(nodePath.join(adrDir, filename), content, 'utf-8');
        this._post({ type: 'arch-chat-chunk', content: `**ADR created:** \`.alpaquitay/adrs/${filename}\`\n\n${content.slice(0, 600)}` });
        this._post({ type: 'arch-chat-done', patch: null, model: provider.modelName });
      } else {
        this._post({ type: 'arch-chat-error', error: result.errors?.join('; ') ?? 'Failed to create ADR' });
      }
    } catch (err) {
      this._post({ type: 'arch-chat-error', error: err instanceof Error ? err.message : String(err) });
    }
  }

  private async _handleArchAssess(context: string): Promise<void> {
    const provider = this.aiManager.getActive();
    if (!provider) {
      this._post({ type: 'arch-chat-error', error: 'No AI provider available.' });
      return;
    }
    try {
      const { SoftwareArchitectShell } = await import('../domains/software-architect/SoftwareArchitectShell');
      const shell = new SoftwareArchitectShell();
      await shell.initialize(provider, this.workspaceRoot);
      const result = await shell.run('assess-architecture', { context });
      if (result.success && result.data) {
        const data = result.data as {
          currentStyle?: string; recommendedStyle?: string;
          qualityScores?: Record<string, number>;
          risks?: Array<{ risk: string; likelihood: string; impact: string; mitigation: string }>;
          evolutionPath?: string[];
        };
        let report = `## Architecture Assessment (ISO/IEC 42010)\n\n`;
        if (data.currentStyle)      report += `**Current style:** ${data.currentStyle}\n`;
        if (data.recommendedStyle)  report += `**Recommended:** ${data.recommendedStyle}\n\n`;
        if (data.qualityScores) {
          report += `### Quality Attributes (ISO/IEC 25010)\n`;
          for (const [attr, score] of Object.entries(data.qualityScores)) {
            const n = Math.min(10, Math.max(0, Math.round(Number(score) / 10)));
            report += `\`${attr.padEnd(16)}\` ${'█'.repeat(n)}${'░'.repeat(10 - n)} ${score}/100\n`;
          }
          report += '\n';
        }
        if (data.risks?.length) {
          report += `### Risks\n`;
          for (const r of data.risks.slice(0, 6)) {
            report += `- **${r.risk}** (${r.likelihood}↑ / ${r.impact}⚡): ${r.mitigation}\n`;
          }
          report += '\n';
        }
        if (result.guardrailResults?.length) {
          report += `### Guardrails\n` + result.guardrailResults.map(g => `⚠ ${g.rule}: ${g.message}`).join('\n');
        }
        this._post({ type: 'arch-chat-chunk', content: report });
        this._post({ type: 'arch-chat-done', patch: null, model: provider.modelName });
      } else {
        this._post({ type: 'arch-chat-error', error: result.errors?.join('; ') ?? 'Assessment failed' });
      }
    } catch (err) {
      this._post({ type: 'arch-chat-error', error: err instanceof Error ? err.message : String(err) });
    }
  }

  // -- Settings ---------------------------------------------------------------

  private _handleLoadSettings(): void {
    const cfg = vscode.workspace.getConfiguration('alpaquitay-ai');
    this._post({
      type: 'settings-data',
      settings: {
        // LLM defaults
        maxTokens:          cfg.get('maxTokens',          4096),
        temperature:        cfg.get('temperature',        0.3),
        requestTimeout:     cfg.get('requestTimeout',     120000),
        systemPrompt:       cfg.get('systemPrompt',       ''),
        orgContext:         cfg.get('orgContext',          ''),
        // Provider selection
        preferredProvider:  cfg.get('preferredProvider',  'auto'),
        // Anthropic
        anthropicModel:     cfg.get('anthropic.model',    'claude-sonnet-4-6'),
        anthropicBaseUrl:   cfg.get('anthropic.baseUrl',  'https://api.anthropic.com/v1'),
        // OpenAI
        openaiModel:        cfg.get('openai.model',       'gpt-4o'),
        openaiBaseUrl:      cfg.get('openai.baseUrl',     'https://api.openai.com/v1'),
        // Ollama
        ollamaModel:        cfg.get('ollama.model',       'codellama'),
        ollamaEndpoint:     cfg.get('ollama.endpoint',    'http://localhost:11434'),
        // LM Studio
        lmstudioEndpoint:   cfg.get('lmstudio.endpoint',  'http://localhost:1234'),
        // Tools
        mcp_filesystem:     cfg.get('mcp.filesystem.enabled', true),
        mcp_git:            cfg.get('mcp.git.enabled',         true),
        indexing:           cfg.get('indexing.enabled',        false),
        specFile:           cfg.get('specFile',                'spec.md'),
      }
    });
  }

  private async _handleSaveSettings(settings: Record<string, unknown>): Promise<void> {
    const cfg = vscode.workspace.getConfiguration('alpaquitay-ai');
    const g = vscode.ConfigurationTarget.Global;
    const w = vscode.ConfigurationTarget.Workspace;
    const set = async (key: string, val: unknown, target = g) => {
      if (key in settings) { await cfg.update(key, val, target); }
    };
    await set('maxTokens',              settings.maxTokens);
    await set('temperature',            settings.temperature);
    await set('requestTimeout',         settings.requestTimeout);
    await set('systemPrompt',           settings.systemPrompt);
    await set('orgContext',             settings.orgContext);
    await set('preferredProvider',      settings.preferredProvider);
    await set('anthropic.model',        settings.anthropicModel);
    await set('anthropic.baseUrl',      settings.anthropicBaseUrl);
    await set('openai.model',           settings.openaiModel);
    await set('openai.baseUrl',         settings.openaiBaseUrl);
    await set('ollama.model',           settings.ollamaModel);
    await set('ollama.endpoint',        settings.ollamaEndpoint);
    await set('lmstudio.endpoint',      settings.lmstudioEndpoint);
    await set('mcp.filesystem.enabled', settings.mcp_filesystem);
    await set('mcp.git.enabled',        settings.mcp_git);
    await set('indexing.enabled',       settings.indexing);
    await set('specFile',               settings.specFile, w);
    // Re-initialize providers so the new model/endpoint takes effect immediately
    vscode.window.showInformationMessage('Alpaquitay AI: Settings saved.');
    this._sendModels().catch(() => {/* panel may be disposed */});
  }

  // -- Utilities --------------------------------------------------------------

  private _post(msg: object): void {
    this._panel.webview.postMessage(msg);
  }

  public refreshProviders(): void {
    this._sendModels().catch(() => { /* panel disposed */ });
  }

  private _watchSpecFile(): void {
    const pattern = new vscode.RelativePattern(this.workspaceRoot, '**/*.{md,yaml,yml,feature}');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const refresh = (uri: vscode.Uri) => {
      const specAbs = this.specManager.specPath;
      if (uri.fsPath === specAbs || nodePath.basename(uri.fsPath).toLowerCase() === nodePath.basename(specAbs).toLowerCase()) {
        if (this._panel.visible) {
          this._sendSpec().catch(() => {/* non-fatal */});
        }
      }
    };
    watcher.onDidChange(refresh, null, this._disposables);
    watcher.onDidCreate(refresh, null, this._disposables);
    this._disposables.push(watcher);
  }

  public dispose(): void {
    MainPanel.current = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
    this._disposables = [];
  }

  // -- Webview HTML -----------------------------------------------------------

  private _html(): string {
    const nonce = crypto.randomBytes(16).toString('hex');
    // Inject model catalog so the webview JS can build dynamic selects
    const catalogInject = `const MODEL_CATALOG=${catalogJson()};`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Alpaquitay</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;600&family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>${this._htmlStyles()}</style>
</head>
<body>
${this._htmlBody()}
<script nonce="${nonce}">${catalogInject}${this._htmlScript()}</script>
</body>
</html>`;
  }


  private _htmlStyles(): string { return `
:root{
  --bg0:#0a0f1e;--bg1:#0d1117;--bg2:#161b22;--bg3:#21262d;--bg4:#30363d;
  --signal:#00e5a0;--accent:#ff4b6e;--blue:#3b82f6;--warn:#f59e0b;
  --muted:#6b7280;--muted-lt:#9ca3af;--text:#e6edf3;
  --border:rgba(255,255,255,.07);--radius:6px;
  --mono:'IBM Plex Mono',Consolas,monospace;
  --sans:'IBM Plex Sans','Segoe UI',system-ui,sans-serif;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden}
body{font-family:var(--sans);background:var(--bg0);color:var(--text);font-size:13px;line-height:1.6;display:flex;flex-direction:column}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:var(--bg1)}
::-webkit-scrollbar-thumb{background:var(--bg4);border-radius:3px}
header{flex-shrink:0;background:var(--bg1);border-bottom:1px solid var(--border);height:44px;display:flex;align-items:center;padding:0 16px;gap:0}
.brand{font-family:var(--mono);font-size:11px;color:var(--signal);letter-spacing:.1em;font-weight:600;white-space:nowrap;margin-right:20px}
.tabs{display:flex;flex:1;height:100%;overflow-x:auto}
.tab{background:none;border:none;border-bottom:2px solid transparent;color:var(--muted-lt);font-family:var(--sans);font-size:12px;font-weight:500;padding:0 14px;height:100%;cursor:pointer;white-space:nowrap;transition:color .15s}
.tab:hover{color:#fff}
.tab.active{color:var(--signal);border-bottom-color:var(--signal)}
.header-right{display:flex;align-items:center;gap:8px;margin-left:16px;flex-shrink:0}
select#modelSel{background:var(--bg2);border:1px solid var(--border);color:var(--text);font-family:var(--mono);font-size:10px;padding:4px 8px;border-radius:var(--radius);outline:none;cursor:pointer;max-width:200px}
select#modelSel:focus{border-color:var(--signal)}
select#modelSel option{background:var(--bg2)}
.cfg-btn{background:none;border:1px solid var(--border);color:var(--muted-lt);width:28px;height:28px;border-radius:var(--radius);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:color .15s,border-color .15s}
.cfg-btn:hover{color:var(--signal);border-color:rgba(0,229,160,.4)}
main{flex:1;overflow:hidden;position:relative}
.panel{display:none;height:100%;flex-direction:column;overflow:hidden}
.panel.active{display:flex}
.studio{display:grid;grid-template-columns:260px 1fr 300px;height:100%;overflow:hidden}
.studio-pane{display:flex;flex-direction:column;overflow:hidden;border-right:1px solid var(--border)}
.studio-pane:last-child{border-right:none}
.pane-hd{flex-shrink:0;background:var(--bg1);border-bottom:1px solid var(--border);padding:6px 10px;display:flex;align-items:center;gap:5px;min-height:34px}
.pane-hd span{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);flex:1}
.spec-scroll{flex:1;overflow-y:auto;padding:10px}
.spec-epic{margin-bottom:14px}
.epic-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted-lt);padding:5px 0 3px;border-bottom:1px solid var(--border);margin-bottom:5px}
.spec-task{display:flex;align-items:center;gap:5px;padding:2px 0}
.spec-task input[type=checkbox]{accent-color:var(--signal);cursor:pointer;flex-shrink:0}
.spec-task.done label{text-decoration:line-through;color:var(--muted)}
.spec-task label{font-size:11px;flex:1;cursor:pointer;line-height:1.4}
.spec-task .tid{font-family:var(--mono);font-size:9px;color:var(--muted)}
.task-actions{display:flex;gap:2px;flex-shrink:0;opacity:0;transition:opacity .15s}
.spec-task:hover .task-actions{opacity:1}
.ta-btn{background:var(--bg3);border:1px solid var(--border);color:var(--muted-lt);font-size:9px;padding:2px 4px;border-radius:3px;cursor:pointer;white-space:nowrap;transition:color .1s,border-color .1s}
.ta-btn:hover{color:var(--signal);border-color:rgba(0,229,160,.3)}
.spec-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:10px;color:var(--muted);padding:20px;text-align:center}
.wm{font-size:28px;opacity:.07;font-family:var(--mono);font-weight:700;color:var(--signal)}
.regen-panel{background:var(--bg1);border:1px solid var(--border);border-radius:7px;padding:11px;margin:8px}
.regen-panel h4{font-size:11px;font-weight:600;margin-bottom:8px}
.regen-panel textarea{width:100%;background:var(--bg2);border:1.5px solid var(--border);color:var(--text);font-family:var(--sans);font-size:12px;padding:6px 8px;border-radius:var(--radius);outline:none;resize:vertical;min-height:48px;transition:border-color .15s}
.regen-panel textarea:focus{border-color:rgba(0,229,160,.5)}
.regen-panel .rf{display:flex;gap:5px;justify-content:flex-end;margin-top:7px}
.board-cols{flex:1;display:flex;gap:6px;padding:8px;overflow-x:auto;overflow-y:hidden;align-items:flex-start}
.col{min-width:140px;flex:1;background:var(--bg1);border:1px solid var(--border);border-radius:7px;display:flex;flex-direction:column;max-height:100%;overflow:hidden}
.col-hd{display:flex;align-items:center;justify-content:space-between;padding:6px 9px;border-bottom:1px solid var(--border);flex-shrink:0}
.col-title{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted-lt)}
.col-badge{font-family:var(--mono);font-size:9px;background:var(--bg3);color:var(--muted-lt);padding:1px 5px;border-radius:10px}
.col-body{flex:1;padding:5px;display:flex;flex-direction:column;gap:4px;overflow-y:auto;min-height:36px}
.col-body.drag-over{background:rgba(0,229,160,.04)}
.card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:7px;cursor:grab;transition:border-color .2s;user-select:none}
.card:hover{border-color:rgba(0,229,160,.3)}
.card.dragging{opacity:.35}
.card.working{border-color:rgba(0,229,160,.5);animation:pulse-border 1.5s infinite}
@keyframes pulse-border{0%,100%{border-color:rgba(0,229,160,.25)}50%{border-color:rgba(0,229,160,.7);box-shadow:0 0 8px rgba(0,229,160,.12)}}
.card-id{font-family:var(--mono);font-size:9px;color:var(--muted);margin-bottom:2px}
.card-title{font-size:11px;font-weight:500;line-height:1.35;margin-bottom:2px}
.card-epic{font-size:10px;color:var(--muted);font-style:italic}
.card-working{display:flex;align-items:center;gap:4px;margin-top:3px;font-family:var(--mono);font-size:9px;color:var(--signal)}
.board-empty{color:var(--muted);font-size:10px;text-align:center;padding:14px 5px;opacity:.5}
.messages{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:9px}
.msg{display:flex;gap:7px;max-width:100%;width:100%}
.msg.user{align-self:flex-end;flex-direction:row-reverse}
.msg.correction-msg{align-self:stretch;max-width:100%;justify-content:center;padding:0 3px}
.msg-bubble{padding:7px 11px;border-radius:7px;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-word}
.msg.user .msg-bubble{background:rgba(0,229,160,.1);border:1px solid rgba(0,229,160,.2)}
.msg.assistant .msg-bubble{background:var(--bg2);border:1px solid var(--border)}
.msg.assistant .msg-bubble code{font-family:var(--mono);font-size:11px;background:var(--bg3);padding:1px 4px;border-radius:3px}
.msg.assistant .msg-bubble pre{background:var(--bg3);padding:8px;border-radius:5px;overflow-x:auto;font-size:11px;font-family:var(--mono);margin:5px 0;border:1px solid var(--border)}
.msg-meta{font-size:10px;color:var(--muted);margin-top:3px;font-family:var(--mono)}
.avatar{width:22px;height:22px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;margin-top:2px}
.av-user{background:rgba(0,229,160,.15);color:var(--signal)}
.av-ai{background:rgba(59,130,246,.15);color:#60a5fa}
.sys-msg{align-self:center;margin:2px 0}
.sys-bubble{text-align:center;color:var(--signal);font-family:var(--mono);font-size:10px;padding:3px 11px;background:rgba(0,229,160,.06);border-radius:20px;border:1px solid rgba(0,229,160,.14)}
.thinking{display:inline-flex;gap:4px;align-items:center}
.thinking span{width:4px;height:4px;border-radius:50%;background:var(--signal);animation:blink 1.2s infinite}
.thinking span:nth-child(2){animation-delay:.2s}
.thinking span:nth-child(3){animation-delay:.4s}
@keyframes blink{0%,80%,100%{opacity:.2}40%{opacity:1}}
.empty-chat{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--muted);gap:5px}
.empty-chat p{font-size:11px}
.correction-card{background:var(--bg2);border:1px solid rgba(0,229,160,.2);border-radius:7px;padding:11px;width:100%;max-width:460px}
.cc-header{font-size:12px;font-weight:600;margin-bottom:7px}
.cc-label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px;font-weight:600}
.cc-input{width:100%;background:var(--bg3);border:1.5px solid var(--border);color:var(--text);font-family:var(--sans);font-size:12px;padding:6px 8px;border-radius:var(--radius);outline:none;resize:vertical;min-height:56px;transition:border-color .15s;line-height:1.5}
.cc-input:focus{border-color:rgba(0,229,160,.5)}
.cc-fi{width:100%;background:var(--bg3);border:1.5px solid var(--border);color:var(--text);font-family:var(--mono);font-size:12px;padding:5px 8px;border-radius:var(--radius);outline:none;transition:border-color .15s}
.cc-fi:focus{border-color:rgba(0,229,160,.5)}
.cc-fi::placeholder{color:var(--muted)}
.cc-actions{display:flex;gap:5px;justify-content:flex-end;margin-top:7px}
.cc-fg{margin-bottom:7px}
.chat-bar{flex-shrink:0;border-top:1px solid var(--border);background:var(--bg1);padding:7px 9px}
.skill-picker{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:5px;max-height:130px;overflow-y:auto}
.skill-opt{padding:6px 9px;cursor:pointer;font-size:11px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;transition:background .15s}
.skill-opt:last-child{border:none}
.skill-opt:hover{background:var(--bg3)}
.skill-opt-name{color:var(--signal);font-family:var(--mono);font-size:10px}
.skill-opt-desc{color:var(--muted);font-size:10px}
.input-row{display:flex;gap:5px;align-items:flex-end}
.pill{background:var(--bg3);border:1px solid var(--border);color:var(--muted-lt);font-family:var(--mono);font-size:10px;padding:3px 7px;border-radius:20px;cursor:pointer;transition:color .15s,border-color .15s;white-space:nowrap;flex-shrink:0}
.pill:hover{color:var(--signal);border-color:rgba(0,229,160,.3)}
#chatInput{flex:1;background:var(--bg2);border:1.5px solid var(--border);color:var(--text);font-family:var(--sans);font-size:12px;padding:6px 9px;border-radius:var(--radius);outline:none;resize:none;min-height:32px;max-height:96px;overflow-y:auto;transition:border-color .15s;line-height:1.5}
#chatInput:focus{border-color:rgba(0,229,160,.5)}
#chatInput::placeholder{color:var(--muted)}
.send-btn{background:var(--signal);color:var(--bg0);border:none;width:30px;height:30px;border-radius:var(--radius);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:opacity .15s;font-weight:700}
.send-btn:hover{opacity:.85}
.send-btn:disabled{opacity:.4;cursor:not-allowed}
.arch-layout{display:flex;height:100%;overflow:hidden}
.arch-palette{width:170px;flex-shrink:0;border-right:1px solid var(--border);background:var(--bg1);overflow-y:auto;padding:9px}
.arch-palette h4{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:6px;margin-top:8px}
.arch-palette h4:first-child{margin-top:0}
.arch-node-btn{display:flex;align-items:center;gap:7px;width:100%;padding:5px 7px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;margin-bottom:3px;transition:border-color .15s;color:var(--text);font-family:var(--sans);font-size:11px}
.arch-node-btn:hover{border-color:rgba(0,229,160,.3)}
.arch-node-btn .ni{width:18px;height:18px;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:9px;flex-shrink:0;font-family:var(--mono)}
.arch-canvas-wrap{flex:1;overflow:hidden;background:var(--bg0);display:flex;flex-direction:column;position:relative}
.arch-canvas-wrap>svg{flex:1;width:100%;cursor:default;min-height:0;display:block}
.arch-ai-chat{flex-shrink:0;border-top:1px solid var(--border);background:var(--bg1);display:flex;flex-direction:column;height:210px}
.arch-ai-chat.ai-hidden{display:none}
.arch-ai-chat-hd{display:flex;align-items:center;gap:8px;padding:4px 10px;border-bottom:1px solid var(--border);flex-shrink:0}
.arch-ai-chat-hd span{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--signal)}
.arch-ai-msgs{flex:1;overflow-y:auto;padding:7px 10px;display:flex;flex-direction:column;gap:4px;font-size:11px}
.arch-ai-hint{color:var(--muted);font-style:italic;line-height:1.6}
.arch-ai-msg-u{align-self:flex-end;background:rgba(0,229,160,.08);border:1px solid rgba(0,229,160,.15);border-radius:8px 8px 2px 8px;padding:4px 9px;max-width:80%}
.arch-ai-msg-a{align-self:flex-start;background:var(--bg2);border:1px solid var(--border);border-radius:2px 8px 8px 8px;padding:4px 9px;max-width:85%;color:var(--muted-lt)}
.arch-ai-msg-e{color:#ff4b6e;font-size:11px}
.arch-ai-bar{display:flex;gap:5px;padding:6px 10px;border-top:1px solid var(--border);flex-shrink:0;align-items:flex-end}
.arch-ai-bar textarea{flex:1;background:var(--bg2);border:1px solid var(--border);color:var(--text);font-size:11px;padding:5px 7px;border-radius:var(--radius);outline:none;font-family:var(--sans);resize:none;line-height:1.4;max-height:64px}
.arch-ai-bar textarea:focus{border-color:rgba(0,229,160,.4)}
.arch-ai-send{padding:5px 10px;font-size:14px}
.arch-toolbar-row{flex-shrink:0;background:var(--bg1);border-bottom:1px solid var(--border);padding:5px 10px;display:flex;align-items:center;gap:7px}
.arch-props{width:190px;flex-shrink:0;border-left:1px solid var(--border);background:var(--bg1);padding:11px;overflow-y:auto}
.arch-props h4{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:9px}
.ap-row{margin-bottom:7px}
.ap-lbl{font-size:10px;color:var(--muted);margin-bottom:2px}
.arch-props input{width:100%;background:var(--bg2);border:1px solid var(--border);color:var(--text);font-size:11px;padding:4px 6px;border-radius:var(--radius);outline:none;font-family:var(--sans)}
.arch-props input:focus{border-color:rgba(0,229,160,.5)}
.iac-section{margin-top:14px;padding-top:11px;border-top:1px solid var(--border)}
.iac-section h4{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:7px}
.git-log{flex:1;overflow-y:auto;padding:11px;display:flex;flex-direction:column;gap:2px}
.commit{display:flex;gap:9px;padding:7px 9px;border-radius:var(--radius);border:1px solid transparent;transition:border-color .15s,background .15s;align-items:flex-start}
.commit:hover{background:var(--bg2);border-color:var(--border)}
.commit-hash{font-family:var(--mono);font-size:10px;color:var(--signal);flex-shrink:0;padding-top:2px;min-width:46px}
.commit-body{flex:1;min-width:0}
.commit-msg{font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px}
.commit-meta{font-size:10px;color:var(--muted);display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.spec-pill{background:rgba(0,229,160,.1);border:1px solid rgba(0,229,160,.25);color:var(--signal);font-family:var(--mono);font-size:9px;padding:1px 5px;border-radius:10px}
.git-unavail{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:7px;color:var(--muted)}
.skills-hd{flex-shrink:0;border-bottom:1px solid var(--border);padding:9px 14px;display:flex;align-items:center;gap:7px;background:var(--bg1)}
.skills-hd h3{font-size:12px;font-weight:600;flex:1}
.skills-body{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:6px}
.skill-row{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:9px;display:flex;align-items:center;gap:9px;transition:border-color .15s}
.skill-row:hover{border-color:rgba(0,229,160,.25)}
.skill-info{flex:1;min-width:0}
.skill-name{font-size:12px;font-weight:600;font-family:var(--mono);color:var(--signal);margin-bottom:2px}
.skill-desc{font-size:11px;color:var(--muted-lt)}
.skill-hint{font-size:10px;color:var(--muted);font-family:var(--mono);margin-top:2px}
.create-form{background:var(--bg1);border:1px solid rgba(0,229,160,.14);border-radius:7px;padding:13px}
.create-form h4{font-size:12px;font-weight:600;margin-bottom:9px;color:var(--signal)}
.fg{margin-bottom:7px}
.fl{display:block;font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px}
.fi,.ft{width:100%;font-family:var(--sans);font-size:12px;padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--radius);background:var(--bg2);color:var(--text);outline:none;transition:border-color .15s}
.fi:focus,.ft:focus{border-color:rgba(0,229,160,.5)}
.ft{resize:vertical;min-height:56px;font-family:var(--mono);font-size:11px}
.btn{display:inline-flex;align-items:center;gap:4px;padding:4px 9px;border-radius:var(--radius);font-size:11px;font-weight:600;cursor:pointer;border:none;font-family:var(--sans);transition:opacity .15s;white-space:nowrap}
.btn-p{background:var(--signal);color:var(--bg0)}
.btn-p:hover{opacity:.88}
.btn-o{background:transparent;color:var(--text);border:1px solid var(--border)}
.btn-o:hover{border-color:var(--signal);color:var(--signal)}
.btn-ai{background:rgba(0,229,160,.08);color:var(--signal);border:1px solid rgba(0,229,160,.2)}
.btn-ai:hover{background:rgba(0,229,160,.15)}
.btn-sm{padding:3px 7px;font-size:10px}
.btn-danger{background:rgba(255,75,110,.1);color:#ff4b6e;border:1px solid rgba(255,75,110,.2)}
.btn-danger:hover{background:rgba(255,75,110,.2)}
.toasts{position:fixed;bottom:12px;right:12px;z-index:999;display:flex;flex-direction:column;gap:4px;pointer-events:none}
.toast{background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:7px 11px;font-size:11px;display:flex;align-items:center;gap:5px;box-shadow:0 6px 18px rgba(0,0,0,.3);animation:tin .15s ease;pointer-events:auto;max-width:290px}
.toast.ok{border-color:rgba(0,229,160,.35);color:var(--signal)}
.toast.err{border-color:rgba(255,75,110,.35);color:#ff7070}
.toast.info{border-color:var(--border);color:var(--muted-lt)}
@keyframes tin{from{transform:translateX(8px);opacity:0}to{transform:none;opacity:1}}
.settings-body{flex:1;overflow-y:auto;padding:16px;max-width:580px}
.settings-section{margin-bottom:22px}
.settings-section h4{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:11px;border-bottom:1px solid var(--border);padding-bottom:4px}
.setting-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:9px}
.setting-lbl{flex:1}
.setting-name{font-size:12px;color:var(--text);font-weight:500}
.setting-desc{font-size:10px;color:var(--muted);margin-top:2px;line-height:1.4}
.setting-ctrl{flex-shrink:0;display:flex;align-items:center;gap:6px}
.si{background:var(--bg3);border:1px solid var(--border);color:var(--text);font-family:var(--mono);font-size:12px;padding:4px 6px;border-radius:var(--radius);outline:none;width:96px}
.si:focus{border-color:rgba(0,229,160,.5)}
.si-wide{width:150px}
.sl-range{width:105px;accent-color:var(--signal);cursor:pointer}
.sl-val{font-family:var(--mono);font-size:11px;min-width:28px;color:var(--signal)}
.st-full{background:var(--bg3);border:1.5px solid var(--border);color:var(--text);font-family:var(--sans);font-size:12px;padding:7px 9px;border-radius:var(--radius);outline:none;width:100%;resize:vertical;min-height:68px;line-height:1.5}
.st-full:focus{border-color:rgba(0,229,160,.5)}
.toggle{position:relative;display:inline-block;width:34px;height:19px;flex-shrink:0}
.toggle input{opacity:0;width:0;height:0}
.sl-tog{position:absolute;top:0;left:0;right:0;bottom:0;background:var(--bg4);border-radius:19px;cursor:pointer;transition:.2s}
.sl-tog:before{position:absolute;content:"";height:13px;width:13px;left:3px;bottom:3px;background:white;border-radius:50%;transition:.2s}
input:checked+.sl-tog{background:var(--signal)}
input:checked+.sl-tog:before{transform:translateX(15px)}
input:disabled+.sl-tog{opacity:.4;cursor:not-allowed}
.provider-tabs{display:flex;gap:3px;margin-bottom:13px;flex-wrap:wrap}
.ptab{background:var(--bg2);border:1px solid var(--border);color:var(--muted-lt);font-family:var(--sans);font-size:11px;font-weight:500;padding:5px 12px;border-radius:var(--radius);cursor:pointer;transition:color .15s,border-color .15s,background .15s}
.ptab:hover{color:var(--text);border-color:rgba(0,229,160,.3)}
.ptab.active{background:rgba(0,229,160,.08);color:var(--signal);border-color:rgba(0,229,160,.4)}
.ps-section{animation:fadein .15s ease}
.setting-note{font-size:10px;color:var(--muted);background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:var(--radius);padding:6px 9px;margin-top:7px;line-height:1.5}
.setting-note strong{color:var(--muted-lt)}
.settings-footer{display:flex;gap:6px;justify-content:flex-end;padding-top:13px;border-top:1px solid var(--border);margin-top:5px}
.lang-tag{display:block;font-size:9px;color:var(--muted);font-family:var(--mono);margin-bottom:3px;text-transform:uppercase;letter-spacing:.06em}
.spec-candidates{margin-top:14px;width:100%;text-align:left}
.cand-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:6px}
.cand-row{display:flex;align-items:center;gap:7px;padding:6px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:4px;transition:border-color .15s}
.cand-row:hover{border-color:rgba(0,229,160,.2)}
.cand-info{flex:1;min-width:0}
.cand-name{font-family:var(--mono);font-size:11px;color:var(--text);font-weight:600}
.cand-count{font-size:10px;color:var(--muted);margin-left:4px}
.cand-actions{display:flex;gap:4px;flex-shrink:0}
.spec-epic-hd{display:flex;align-items:center;gap:4px;padding:5px 0 3px;border-bottom:1px solid var(--border);margin-bottom:5px}
.epic-title-txt{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted-lt);flex:1;cursor:text;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.epic-title-txt:hover{color:var(--text)}
.epic-hd-btn{background:none;border:none;color:var(--muted);font-size:11px;cursor:pointer;padding:0 2px;line-height:1;opacity:0;transition:opacity .1s,color .1s;flex-shrink:0}
.spec-epic-hd:hover .epic-hd-btn{opacity:1}
.epic-hd-btn:hover{color:var(--signal)}
.epic-hd-btn.del-btn:hover{color:#ff4b6e}
.ta-del{color:var(--muted)}
.ta-del:hover{color:#ff4b6e !important;border-color:rgba(255,75,110,.3) !important}
.add-task-row{padding:2px 0}
.add-task-btn{background:none;border:1px dashed var(--border);color:var(--muted);font-size:10px;padding:2px 7px;border-radius:var(--radius);cursor:pointer;width:100%;text-align:left;transition:color .15s,border-color .15s}
.add-task-btn:hover{color:var(--signal);border-color:rgba(0,229,160,.3)}
.add-epic-row{padding:8px 0 4px;border-top:1px solid var(--border);margin-top:8px}
.inline-edit-input{background:var(--bg3);border:1.5px solid rgba(0,229,160,.5);color:var(--text);font-family:var(--sans);font-size:11px;padding:2px 5px;border-radius:3px;outline:none;width:100%}
.inline-edit-input:focus{border-color:var(--signal)}
.arch-toolbar-row{flex-shrink:0;background:var(--bg1);border-bottom:1px solid var(--border);padding:5px 10px;display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.c4-tabs{display:flex;gap:2px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:2px}
.c4-tab{background:none;border:none;color:var(--muted-lt);font-size:10px;font-weight:600;padding:2px 8px;border-radius:3px;cursor:pointer;transition:background .15s,color .15s;white-space:nowrap}
.c4-tab.active{background:rgba(0,229,160,.12);color:var(--signal)}
.c4-tab:hover:not(.active){color:var(--text)}
.arch-adr-form{background:var(--bg1);border-top:1px solid var(--border);padding:10px;display:none;flex-direction:column;gap:6px}
.arch-adr-form.visible{display:flex}
.arch-adr-form label{font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.arch-adr-form textarea{background:var(--bg2);border:1px solid var(--border);color:var(--text);font-size:11px;padding:5px 7px;border-radius:var(--radius);outline:none;resize:vertical;min-height:48px;font-family:var(--sans)}
.arch-adr-form textarea:focus{border-color:rgba(0,229,160,.5)}
`; }

  private _htmlBody(): string { return `
<header>
  <div class="brand">&#9650; ALPAQUITAY</div>
  <nav class="tabs">
    <button class="tab active" data-tab="studio">Studio</button>
    <button class="tab" data-tab="arch">Arch</button>
    <button class="tab" data-tab="git">Git</button>
    <button class="tab" data-tab="skills">Skills</button>
    <button class="tab" data-tab="settings">Settings</button>
  </nav>
  <div class="header-right">
    <select id="modelSel"><option value="">Loading...</option></select>
    <button class="cfg-btn" id="cfgBtn" title="Configure provider">&#9881;</button>
  </div>
</header>
<main>
  <div class="panel active" id="panel-studio">
    <div class="studio">
      <div class="studio-pane">
        <div class="pane-hd">
          <span>Spec</span>
          <button class="btn btn-o btn-sm" id="reloadSpecBtn">&#8635;</button>
          <button class="btn btn-ai btn-sm" id="regenSpecBtn">Regen</button>
        </div>
        <div id="regenPanel" style="display:none">
          <div class="regen-panel">
            <h4>Regenerate spec with AI</h4>
            <textarea id="regenCtx" placeholder="Describe the project (optional)..."></textarea>
            <div class="rf">
              <button class="btn btn-o btn-sm" id="regenCancel">Cancel</button>
              <button class="btn btn-p btn-sm" id="regenConfirm">Generate</button>
            </div>
          </div>
        </div>
        <div class="spec-scroll" id="specBody">
          <div class="spec-empty">
            <div class="wm">ALPAQUITAY</div>
            <p>No spec.md found.</p>
            <button class="btn btn-ai" id="createSpecBtn">+ Create with AI</button>
          </div>
        </div>
      </div>
      <div class="studio-pane">
        <div class="pane-hd">
          <span>Board</span>
          <small style="color:var(--muted);font-size:9px">Drag to In Progress to start AI</small>
        </div>
        <div class="board-cols">
          <div class="col">
            <div class="col-hd"><span class="col-title">Backlog</span><span class="col-badge" id="bdg-backlog">0</span></div>
            <div class="col-body" id="cards-backlog" data-status="backlog"></div>
          </div>
          <div class="col">
            <div class="col-hd"><span class="col-title" style="color:#60a5fa">Todo</span><span class="col-badge" id="bdg-todo">0</span></div>
            <div class="col-body" id="cards-todo" data-status="todo"></div>
          </div>
          <div class="col">
            <div class="col-hd"><span class="col-title" style="color:var(--warn)">In Progress</span><span class="col-badge" id="bdg-in-progress">0</span></div>
            <div class="col-body" id="cards-in-progress" data-status="in-progress"></div>
          </div>
          <div class="col">
            <div class="col-hd"><span class="col-title" style="color:var(--signal)">Done</span><span class="col-badge" id="bdg-done">0</span></div>
            <div class="col-body" id="cards-done" data-status="done"></div>
          </div>
        </div>
      </div>
      <div class="studio-pane">
        <div class="pane-hd"><span>Chat</span></div>
        <div class="messages" id="messages">
          <div class="empty-chat" id="emptyChat">
            <div class="wm">ALPAQUITAY</div>
            <p>Ask anything or use /skill</p>
          </div>
        </div>
        <div class="chat-bar">
          <div class="skill-picker" id="skillPicker" style="display:none"></div>
          <div class="input-row">
            <button class="pill" id="skillToggle">/skill</button>
            <textarea id="chatInput" placeholder="Ask something..." rows="1"></textarea>
            <button class="send-btn" id="sendBtn">&#8593;</button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="panel" id="panel-arch">
    <div class="arch-toolbar-row">
      <button class="btn btn-o btn-sm" id="archSaveBtn">Save</button>
      <button class="btn btn-o btn-sm" id="archClearBtn">Clear</button>
      <button class="btn btn-ai btn-sm" id="archAssessBtn">&#9650; Assess</button>
      <button class="btn btn-o btn-sm" id="archAdrBtn">ADR</button>
      <span style="flex:1"></span>
      <div class="c4-tabs" title="C4 diagram level">
        <button class="c4-tab active" data-c4="context">Context</button>
        <button class="c4-tab" data-c4="container">Container</button>
        <button class="c4-tab" data-c4="component">Component</button>
      </div>
      <button class="btn btn-ai btn-sm" id="archAiToggle">&#9650; AI</button>
      <span style="font-size:10px;color:var(--muted)">Click&middot;Drag&middot;Shift+click&middot;Delete</span>
    </div>
    <div class="arch-adr-form" id="archAdrForm">
      <label>Context (current architecture situation)</label>
      <textarea id="archAdrCtx" placeholder="We are using a monolithic Spring Boot application..."></textarea>
      <label>Decision (what are you considering?)</label>
      <textarea id="archAdrDec" placeholder="We will extract the payment module into a microservice..."></textarea>
      <div style="display:flex;gap:6px;justify-content:flex-end">
        <button class="btn btn-o btn-sm" id="archAdrCancel">Cancel</button>
        <button class="btn btn-p btn-sm" id="archAdrSubmit">Create ADR</button>
      </div>
    </div>
    <div class="arch-layout">
      <div class="arch-palette">
        <h4>Compute</h4>
        <button class="arch-node-btn" data-type="lambda"><span class="ni" style="background:rgba(255,153,0,.15);color:#ff9900">fn</span>Lambda</button>
        <button class="arch-node-btn" data-type="container"><span class="ni" style="background:rgba(59,130,246,.15);color:#3b82f6">[]</span>Container</button>
        <button class="arch-node-btn" data-type="service"><span class="ni" style="background:rgba(0,229,160,.1);color:var(--signal)">svc</span>Service</button>
        <h4>Network</h4>
        <button class="arch-node-btn" data-type="api"><span class="ni" style="background:rgba(139,92,246,.15);color:#8b5cf6">api</span>API Gateway</button>
        <button class="arch-node-btn" data-type="cdn"><span class="ni" style="background:rgba(236,72,153,.15);color:#ec4899">cdn</span>CDN</button>
        <button class="arch-node-btn" data-type="client"><span class="ni" style="background:rgba(255,255,255,.06);color:var(--muted-lt)">&lt;/&gt;</span>Client</button>
        <h4>Data</h4>
        <button class="arch-node-btn" data-type="db"><span class="ni" style="background:rgba(59,130,246,.15);color:#3b82f6">db</span>Database</button>
        <button class="arch-node-btn" data-type="storage"><span class="ni" style="background:rgba(245,158,11,.15);color:var(--warn)">s3</span>Storage</button>
        <button class="arch-node-btn" data-type="queue"><span class="ni" style="background:rgba(0,229,160,.1);color:var(--signal)">q</span>Queue</button>
        <button class="arch-node-btn" data-type="cache"><span class="ni" style="background:rgba(255,75,110,.15);color:#ff4b6e">$</span>Cache</button>
        <h4>Security</h4>
        <button class="arch-node-btn" data-type="auth"><span class="ni" style="background:rgba(139,92,246,.15);color:#8b5cf6">auth</span>Auth</button>
      </div>
      <div class="arch-canvas-wrap">
        <svg id="archCanvas" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="rgba(107,114,128,.6)"/>
            </marker>
          </defs>
          <g id="archEdgesGroup"></g>
          <g id="archNodesGroup"></g>
        </svg>
        <div class="arch-ai-chat" id="archAiChat">
          <div class="arch-ai-chat-hd">
            <span>AI Architect</span>
            <small style="color:var(--muted);font-size:10px">Describe what to design or modify</small>
          </div>
          <div class="arch-ai-msgs" id="archAiMsgs">
            <div class="arch-ai-hint" id="archAiHint">Try: <em>"Design microservices for e-commerce"</em> &middot; <em>"Add Redis cache between API and DB"</em> &middot; <em>"Convert to serverless on AWS"</em></div>
          </div>
          <div class="arch-ai-bar">
            <textarea id="archAiInput" placeholder="Describe the architecture to design or modify..." rows="2"></textarea>
            <button class="btn btn-ai arch-ai-send" id="archAiSend">&#8593;</button>
          </div>
        </div>
      </div>
      <div class="arch-props" id="archProps">
        <h4>Properties</h4>
        <div id="archPropsContent" style="color:var(--muted);font-size:11px">Select a node</div>
        <div class="iac-section">
          <h4>Export as IaC</h4>
          <div style="display:flex;flex-direction:column;gap:4px">
            <button class="btn btn-o btn-sm" data-fmt="terraform">Terraform (AWS)</button>
            <button class="btn btn-o btn-sm" data-fmt="cdk">AWS CDK (TS)</button>
            <button class="btn btn-o btn-sm" data-fmt="bicep">Azure Bicep</button>
            <button class="btn btn-o btn-sm" data-fmt="gcp">GCP YAML</button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="panel" id="panel-git">
    <div class="pane-hd" style="border-bottom:1px solid var(--border)">
      <span>Git History</span>
      <button class="btn btn-o btn-sm" id="refreshGitBtn">&#8635; Refresh</button>
    </div>
    <div class="git-log" id="gitLog">
      <div class="git-unavail"><p style="font-size:11px">Loading...</p></div>
    </div>
  </div>
  <div class="panel" id="panel-settings">
    <div class="settings-body">

      <!-- ── AI Provider ─────────────────────────────────────────────────── -->
      <div class="settings-section">
        <h4>AI Provider</h4>
        <div class="provider-tabs" id="providerTabs">
          <button class="ptab active" data-p="anthropic">Anthropic</button>
          <button class="ptab" data-p="openai">OpenAI</button>
          <button class="ptab" data-p="ollama">Ollama</button>
          <button class="ptab" data-p="lmstudio">LM Studio</button>
        </div>

        <!-- Anthropic -->
        <div id="ps-anthropic" class="ps-section">
          <div class="setting-row">
            <div class="setting-lbl"><div class="setting-name">Model</div><div class="setting-desc" id="anthropic-model-desc">200k context</div></div>
            <div class="setting-ctrl"><select class="si si-wide" id="s-anthropic-model"></select></div>
          </div>
          <div class="setting-row">
            <div class="setting-lbl"><div class="setting-name">Max output tokens</div><div class="setting-desc">Overrides global limit for this provider</div></div>
            <div class="setting-ctrl"><input class="si" id="s-anthropic-maxTokens" type="number" min="256" max="128000" step="256" value="4096"></div>
          </div>
          <div class="setting-row">
            <div class="setting-lbl"><div class="setting-name">Base URL</div><div class="setting-desc">Override for proxies or compatible APIs</div></div>
            <div class="setting-ctrl"><input class="si si-wide" id="s-anthropic-baseUrl" type="text" placeholder="https://api.anthropic.com/v1"></div>
          </div>
          <div class="setting-note">API key is stored in OS keychain. Use <strong>Ctrl+Alt+A &gt; Configure AI Provider</strong> to set it.</div>
        </div>

        <!-- OpenAI -->
        <div id="ps-openai" class="ps-section" style="display:none">
          <div class="setting-row">
            <div class="setting-lbl"><div class="setting-name">Model</div><div class="setting-desc" id="openai-model-desc">128k context</div></div>
            <div class="setting-ctrl"><select class="si si-wide" id="s-openai-model"></select></div>
          </div>
          <div class="setting-row">
            <div class="setting-lbl"><div class="setting-name">Max output tokens</div><div class="setting-desc">Overrides global limit for this provider</div></div>
            <div class="setting-ctrl"><input class="si" id="s-openai-maxTokens" type="number" min="256" max="65536" step="256" value="4096"></div>
          </div>
          <div class="setting-row">
            <div class="setting-lbl"><div class="setting-name">Base URL</div><div class="setting-desc">Override for Azure OpenAI or compatible APIs</div></div>
            <div class="setting-ctrl"><input class="si si-wide" id="s-openai-baseUrl" type="text" placeholder="https://api.openai.com/v1"></div>
          </div>
          <div class="setting-note">API key is stored in OS keychain. Use <strong>Ctrl+Alt+A &gt; Configure AI Provider</strong> to set it.</div>
        </div>

        <!-- Ollama -->
        <div id="ps-ollama" class="ps-section" style="display:none">
          <div class="setting-row">
            <div class="setting-lbl"><div class="setting-name">Model</div><div class="setting-desc">Any model pulled via <code>ollama pull</code></div></div>
            <div class="setting-ctrl"><input class="si si-wide" id="s-ollama-model" type="text" placeholder="codellama:7b"></div>
          </div>
          <div class="setting-row">
            <div class="setting-lbl"><div class="setting-name">Max output tokens</div><div class="setting-desc">num_predict value sent to Ollama</div></div>
            <div class="setting-ctrl"><input class="si" id="s-ollama-maxTokens" type="number" min="256" max="32768" step="256" value="2048"></div>
          </div>
          <div class="setting-row">
            <div class="setting-lbl"><div class="setting-name">Endpoint</div><div class="setting-desc">Local Ollama server address</div></div>
            <div class="setting-ctrl"><input class="si si-wide" id="s-ollama-endpoint" type="text" placeholder="http://localhost:11434"></div>
          </div>
        </div>

        <!-- LM Studio -->
        <div id="ps-lmstudio" class="ps-section" style="display:none">
          <div class="setting-row">
            <div class="setting-lbl"><div class="setting-name">Max output tokens</div><div class="setting-desc">max_tokens sent to LM Studio</div></div>
            <div class="setting-ctrl"><input class="si" id="s-lmstudio-maxTokens" type="number" min="256" max="32768" step="256" value="2048"></div>
          </div>
          <div class="setting-row">
            <div class="setting-lbl"><div class="setting-name">Endpoint</div><div class="setting-desc">LM Studio local server address</div></div>
            <div class="setting-ctrl"><input class="si si-wide" id="s-lmstudio-endpoint" type="text" placeholder="http://localhost:1234"></div>
          </div>
          <div class="setting-note">Model is selected inside LM Studio. The extension uses whichever model is loaded there.</div>
        </div>
      </div>

      <!-- ── Global LLM Defaults ─────────────────────────────────────────── -->
      <div class="settings-section">
        <h4>Global Defaults</h4>
        <div class="setting-row">
          <div class="setting-lbl"><div class="setting-name">Max output tokens</div><div class="setting-desc">Fallback when provider override is not set</div></div>
          <div class="setting-ctrl"><input class="si" id="s-maxTokens" type="number" min="256" max="128000" step="256" value="4096"></div>
        </div>
        <div class="setting-row">
          <div class="setting-lbl"><div class="setting-name">Temperature</div><div class="setting-desc">0 = deterministic &nbsp; 1 = balanced &nbsp; 2 = creative</div></div>
          <div class="setting-ctrl">
            <input class="sl-range" id="s-temperature" type="range" min="0" max="2" step="0.05" value="0.3">
            <span class="sl-val" id="s-temperature-val">0.30</span>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-lbl"><div class="setting-name">Request timeout (ms)</div><div class="setting-desc">10 000 - 600 000</div></div>
          <div class="setting-ctrl"><input class="si" id="s-requestTimeout" type="number" min="10000" max="600000" step="5000" value="120000"></div>
        </div>
      </div>

      <!-- ── System Prompt ───────────────────────────────────────────────── -->
      <div class="settings-section">
        <h4>System Prompt</h4>
        <textarea class="st-full" id="s-systemPrompt" placeholder="Global AI instructions appended to every request..."></textarea>
      </div>

      <!-- ── Tools ──────────────────────────────────────────────────────── -->
      <div class="settings-section">
        <h4>Tools</h4>
        <div class="setting-row">
          <div class="setting-lbl"><div class="setting-name">Filesystem MCP</div><div class="setting-desc">Allow AI to read / write workspace files</div></div>
          <div class="setting-ctrl"><label class="toggle"><input type="checkbox" id="s-mcp-filesystem" checked><span class="sl-tog"></span></label></div>
        </div>
        <div class="setting-row">
          <div class="setting-lbl"><div class="setting-name">Git MCP</div><div class="setting-desc">Allow AI to read git history</div></div>
          <div class="setting-ctrl"><label class="toggle"><input type="checkbox" id="s-mcp-git" checked><span class="sl-tog"></span></label></div>
        </div>
      </div>

      <!-- ── Workspace ───────────────────────────────────────────────────── -->
      <div class="settings-section">
        <h4>Workspace</h4>
        <div class="setting-row">
          <div class="setting-lbl"><div class="setting-name">Organization context</div><div class="setting-desc">Team / company name injected into AI context</div></div>
          <div class="setting-ctrl"><input class="si si-wide" id="s-orgContext" type="text" placeholder="My Company"></div>
        </div>
        <div class="setting-row">
          <div class="setting-lbl"><div class="setting-name">Spec file</div><div class="setting-desc">Filename in the workspace root</div></div>
          <div class="setting-ctrl"><input class="si si-wide" id="s-specFile" type="text" placeholder="spec.md"></div>
        </div>
      </div>

      <div class="settings-footer">
        <button class="btn btn-o" id="s-reset">Restore defaults</button>
        <button class="btn btn-p" id="s-save">Save settings</button>
      </div>
    </div>
  </div>
  <div class="panel" id="panel-skills">
    <div class="skills-hd">
      <h3>Skills</h3>
      <button class="btn btn-p" id="newSkillBtn">+ New Skill</button>
    </div>
    <div class="skills-body">
      <div id="skillsList"></div>
      <div class="create-form" id="createForm" style="display:none">
        <h4>New Skill</h4>
        <div class="fg"><label class="fl">Name</label><input class="fi" id="skName" placeholder="e.g. explain-code"></div>
        <div class="fg"><label class="fl">Description</label><input class="fi" id="skDesc" placeholder="What does it do?"></div>
        <div class="fg"><label class="fl">Prompt</label><textarea class="ft" id="skPrompt" placeholder="AI instruction..."></textarea></div>
        <div style="display:flex;gap:5px;justify-content:flex-end">
          <button class="btn btn-o" id="skCancel">Cancel</button>
          <button class="btn btn-p" id="skSave">Create</button>
        </div>
      </div>
    </div>
  </div>
</main>
<div class="toasts" id="toasts"></div>
`; }

  private _htmlScript(): string { return `
(function() {
const vscode = acquireVsCodeApi();
const S = { tab:'studio', messages:[], thinking:false, spec:null, git:null, skills:[], models:[], skillPickerOpen:false, settings:null, arch:{ nodes:[], edges:[] } };
const workingTasks = new Set();
vscode.postMessage({ type:'get-models' });
vscode.postMessage({ type:'load-skills' });
vscode.postMessage({ type:'load-spec' });
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
function switchTab(tab) {
  S.tab = tab;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + tab));
  if (tab === 'studio')   { if (S.spec) { renderSpec(); renderBoard(); } else { vscode.postMessage({ type:'load-spec' }); } }
  if (tab === 'arch')     { vscode.postMessage({ type:'arch-load' }); }
  if (tab === 'git')      { if (!S.git) vscode.postMessage({ type:'load-git' }); }
  if (tab === 'settings') { if (!S.settings) vscode.postMessage({ type:'load-settings' }); }
}
window.addEventListener('message', e => {
  const msg = e.data;
  switch (msg.type) {
    case 'models-list':            renderModels(msg.models); break;
    case 'skills-list':            S.skills = msg.skills; renderSkillsList(); renderSkillPicker(); break;
    case 'spec-data':              S.spec = msg.data; renderSpec(); renderBoard(); break;
    case 'git-log':                S.git = msg.data; renderGit(); break;
    case 'chat-chunk':             appendChunk(msg.content); break;
    case 'chat-done':              finishChat(msg.model); break;
    case 'chat-error':             chatError(msg.error); break;
    case 'skill-result':           showSkillResult(msg); break;
    case 'skill-needs-path':       showSkillParamForm(msg.skillId, msg.needsDesc, msg.needsSpecPath); break;
    case 'skill-needs-goal':       showSkillGoalForm(msg.skillId); break;
    case 'task-work-started':      onTaskWorkStarted(msg.taskId, msg.title); break;
    case 'task-work-done':         onTaskWorkDone(msg.taskId, msg.title); break;
    case 'task-work-error':        onTaskWorkError(msg.taskId, msg.error); break;
    case 'task-correction-needed': showCorrectionForm(msg.taskId, msg.title); break;
    case 'settings-data':          S.settings = msg.settings; renderSettings(msg.settings); break;
    case 'arch-data':              S.arch = msg.diagram || { nodes:[], edges:[] }; renderArch(); break;
    case 'arch-exported':          toast('Exported: ' + msg.filename, 'ok'); break;
    case 'arch-export-error':      toast('Export error: ' + msg.error, 'err'); break;
    case 'arch-chat-chunk':        appendArchAiChunk(msg.content); break;
    case 'arch-chat-done':         finishArchAiChat(msg.patch, msg.model); break;
    case 'arch-chat-error':        archAiChatError(msg.error); break;
  }
});
function renderModels(models) {
  S.models = models;
  const sel = document.getElementById('modelSel');
  sel.innerHTML = models.length
    ? models.map(m => \`<option value="\${esc(m.id)}">\${esc(m.label)}\${m.isLocal ? ' [local]' : ''}</option>\`).join('')
    : '<option value="">No provider available</option>';
}
document.getElementById('cfgBtn').addEventListener('click', () => vscode.postMessage({ type:'configure-provider' }));
document.getElementById('modelSel').addEventListener('change', e => {
  const [pt] = e.target.value.split(':');
  if (pt) vscode.postMessage({ type:'switch-provider', providerType: pt });
});
const chatInput  = document.getElementById('chatInput');
const sendBtn    = document.getElementById('sendBtn');
const messagesEl = document.getElementById('messages');
const emptyChat  = document.getElementById('emptyChat');
chatInput.addEventListener('input', () => { chatInput.style.height='auto'; chatInput.style.height=Math.min(chatInput.scrollHeight,96)+'px'; });
chatInput.addEventListener('keydown', e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
sendBtn.addEventListener('click', sendMessage);
function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || S.thinking) return;
  hideEmpty(); addMessage('user', text);
  chatInput.value = ''; chatInput.style.height = 'auto';
  S.thinking = true; sendBtn.disabled = true;
  window._thinkBubble = addThinking();
  vscode.postMessage({ type:'chat', text, modelId: document.getElementById('modelSel').value });
}
function hideEmpty() { if (emptyChat) emptyChat.style.display = 'none'; }
function addMessage(role, content, model) {
  const isUser = role === 'user';
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.innerHTML = \`<div class="avatar \${isUser ? 'av-user':'av-ai'}">\${isUser ? 'U':'A'}</div>
    <div><div class="msg-bubble">\${isUser ? esc(content) : renderMd(content)}</div>
    \${model ? \`<div class="msg-meta">\${esc(model)}</div>\` : ''}</div>\`;
  messagesEl.appendChild(div); messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}
function addThinking() {
  const div = document.createElement('div');
  div.className = 'msg assistant';
  div.innerHTML = \`<div class="avatar av-ai">A</div><div><div class="msg-bubble"><div class="thinking"><span></span><span></span><span></span></div></div></div>\`;
  messagesEl.appendChild(div); messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}
function addSystemMessage(text) {
  hideEmpty();
  const div = document.createElement('div');
  div.className = 'msg sys-msg';
  div.innerHTML = \`<div class="sys-bubble">\${esc(text)}</div>\`;
  messagesEl.appendChild(div); messagesEl.scrollTop = messagesEl.scrollHeight;
}
let _streamDiv = null, _streamContent = '';
function appendChunk(content) {
  if (window._thinkBubble) { window._thinkBubble.remove(); window._thinkBubble = null; }
  hideEmpty(); _streamContent += content;
  if (_streamDiv) { const b=_streamDiv.querySelector('.msg-bubble'); if(b) b.innerHTML=renderMd(_streamContent); messagesEl.scrollTop=messagesEl.scrollHeight; }
  else { _streamDiv = addMessage('assistant', _streamContent); }
}
function finishChat(model) {
  if (window._thinkBubble) { window._thinkBubble.remove(); window._thinkBubble = null; }
  if (_streamDiv && model) { const m=document.createElement('div'); m.className='msg-meta'; m.textContent=model; _streamDiv.querySelector('div > div').appendChild(m); }
  _streamDiv=null; _streamContent=''; S.thinking=false; sendBtn.disabled=false;
}
function chatError(err) {
  if (window._thinkBubble) { window._thinkBubble.remove(); window._thinkBubble=null; }
  toast('Error: ' + err, 'err'); S.thinking=false; sendBtn.disabled=false;
}
function onTaskWorkStarted(taskId, title) { workingTasks.add(taskId); renderBoard(); hideEmpty(); addSystemMessage('Starting: ' + title); }
function onTaskWorkDone(taskId, title)    { workingTasks.delete(taskId); renderBoard(); toast('Done: ' + title, 'ok'); }
function onTaskWorkError(taskId, error)   { workingTasks.delete(taskId); renderBoard(); toast('Task error: ' + error, 'err'); }
function showCorrectionForm(taskId, title) {
  hideEmpty();
  const div = document.createElement('div'); div.className = 'msg correction-msg';
  div.innerHTML = \`<div class="correction-card">
    <div class="cc-header">Re-validate: <strong>\${esc(title)}</strong></div>
    <div class="cc-fg"><div class="cc-label">What needs correction?</div>
    <textarea class="cc-input" placeholder="Describe the fix..."></textarea></div>
    <div class="cc-actions">
      <button class="btn btn-o cc-cancel">Cancel</button>
      <button class="btn btn-p cc-submit">Correct with AI</button>
    </div></div>\`;
  div.querySelector('.cc-cancel').addEventListener('click', () => div.remove());
  div.querySelector('.cc-submit').addEventListener('click', () => {
    const c = div.querySelector('.cc-input').value.trim(); if (!c) return;
    div.remove(); vscode.postMessage({ type:'task-correction', taskId, correction: c });
  });
  messagesEl.appendChild(div); messagesEl.scrollTop=messagesEl.scrollHeight;
  div.querySelector('.cc-input').focus();
}
function showSkillParamForm(skillId, needsDesc, needsSpecPath) {
  hideEmpty();
  const lbl = needsSpecPath ? 'Spec file (relative)' : 'File (relative to workspace)';
  const ph  = needsSpecPath ? 'specs/my-api.yaml' : 'src/MyFile.ts';
  const div = document.createElement('div'); div.className = 'msg correction-msg';
  div.innerHTML = \`<div class="correction-card">
    <div class="cc-header">Skill: <strong>\${esc(skillId)}</strong></div>
    <div class="cc-fg"><div class="cc-label">\${lbl}</div><input class="cc-fi" id="spPath" placeholder="\${ph}"></div>
    \${needsDesc ? '<div class="cc-fg"><div class="cc-label">Description</div><input class="cc-fi" id="spDesc" placeholder="What should this file do?"></div>' : ''}
    <div class="cc-actions">
      <button class="btn btn-o sp-cancel">Cancel</button>
      <button class="btn btn-p sp-run">Run</button>
    </div></div>\`;
  div.querySelector('.sp-cancel').addEventListener('click', () => div.remove());
  div.querySelector('.sp-run').addEventListener('click', () => {
    const p = div.querySelector('#spPath').value.trim(); if (!p) { toast('Enter a file path','err'); return; }
    const params = {}; params[needsSpecPath ? 'specPath':'path'] = p;
    const d = div.querySelector('#spDesc'); if (d?.value.trim()) params.description = d.value.trim();
    div.remove(); vscode.postMessage({ type:'run-skill-with-params', skillId, params });
  });
  messagesEl.appendChild(div); messagesEl.scrollTop=messagesEl.scrollHeight;
  div.querySelector('#spPath').focus();
}
function showSkillGoalForm(skillId) {
  hideEmpty();
  const div = document.createElement('div'); div.className = 'msg correction-msg';
  div.innerHTML = \`<div class="correction-card">
    <div class="cc-header">Skill: <strong>\${esc(skillId)}</strong></div>
    <div class="cc-fg"><div class="cc-label">Project goal</div>
    <textarea class="cc-input" id="sgGoal" placeholder="Build a REST API for a task manager..."></textarea></div>
    <div class="cc-actions">
      <button class="btn btn-o sg-cancel">Cancel</button>
      <button class="btn btn-p sg-run">Run</button>
    </div></div>\`;
  div.querySelector('.sg-cancel').addEventListener('click', () => div.remove());
  div.querySelector('.sg-run').addEventListener('click', () => {
    const g = div.querySelector('#sgGoal').value.trim(); if (!g) { toast('Describe goal','err'); return; }
    div.remove(); vscode.postMessage({ type:'run-skill-with-params', skillId, params:{ goal:g } });
  });
  messagesEl.appendChild(div); messagesEl.scrollTop=messagesEl.scrollHeight;
  div.querySelector('#sgGoal').focus();
}
document.getElementById('reloadSpecBtn').addEventListener('click', () => { S.spec=null; vscode.postMessage({ type:'load-spec' }); });
document.getElementById('regenSpecBtn').addEventListener('click', () => { document.getElementById('regenPanel').style.display='block'; });
document.getElementById('regenCancel').addEventListener('click', () => { document.getElementById('regenPanel').style.display='none'; });
document.getElementById('regenConfirm').addEventListener('click', () => {
  const ctx = document.getElementById('regenCtx').value.trim();
  document.getElementById('regenPanel').style.display='none';
  document.getElementById('regenCtx').value='';
  addMessage('user', ctx || 'Generate initial spec.md');
  hideEmpty(); window._thinkBubble=addThinking(); S.thinking=true; sendBtn.disabled=true;
  vscode.postMessage({ type:'regenerate-spec', context: ctx });
});
function renderSpec() {
  const body = document.getElementById('specBody');
  if (!S.spec?.exists) {
    const specFile = S.spec?.specFile ?? 'spec.md';
    const candidates = S.spec?.candidates ?? [];
    const candHtml = candidates.length ? \`<div class="spec-candidates">
      <div class="cand-title">Specs found in workspace</div>
      \${candidates.map(c => \`<div class="cand-row">
        <div class="cand-info"><span class="cand-name">\${esc(c.name)}</span>
        <span class="cand-count">\${c.needsConversion ? 'technical spec' : c.taskCount + ' task' + (c.taskCount!==1?'s':'')}</span></div>
        <div class="cand-actions">
          \${!c.needsConversion ? \`<button class="btn btn-o btn-sm" data-use="\${esc(c.relativePath)}">Use</button>\` : ''}
          <button class="btn btn-ai btn-sm" data-convert="\${esc(c.relativePath)}">\${c.needsConversion ? 'Convert':'Normalize'}</button>
        </div></div>\`).join('')}
      </div>\` : '';
    body.innerHTML = \`<div class="spec-empty">
      <div class="wm">ALPAQUITAY</div>
      <p>No <code style="font-family:var(--mono);font-size:11px;background:var(--bg3);padding:1px 4px;border-radius:3px">\${esc(specFile)}</code> found.</p>
      <button class="btn btn-ai" id="createSpecBtn">+ Create with AI</button>
      \${candHtml}</div>\`;
    document.getElementById('createSpecBtn')?.addEventListener('click', () => { document.getElementById('regenPanel').style.display='block'; });
    body.querySelectorAll('[data-use]').forEach(btn => btn.addEventListener('click', () => { toast('Using '+btn.dataset.use,'info'); vscode.postMessage({ type:'use-spec-file', filename:btn.dataset.use }); }));
    body.querySelectorAll('[data-convert]').forEach(btn => btn.addEventListener('click', () => { toast('Converting '+btn.dataset.convert+'...','info'); vscode.postMessage({ type:'convert-spec-file', sourcePath:btn.dataset.convert }); }));
    return;
  }
  const epics = {};
  for (const t of S.spec.tasks) { if (!epics[t.epicTitle]) epics[t.epicTitle]=[]; epics[t.epicTitle].push(t); }
  const epicHtml = Object.entries(epics).map(([epic, tasks]) => \`
    <div class="spec-epic" data-epic="\${esc(epic)}">
      <div class="spec-epic-hd">
        <span class="epic-title-txt" data-epic="\${esc(epic)}" title="Double-click to rename">\${esc(epic)}</span>
        <button class="epic-hd-btn" data-edit-epic="\${esc(epic)}" title="Rename epic">&#9998;</button>
        <button class="epic-hd-btn del-btn" data-del-epic="\${esc(epic)}" title="Delete epic">&times;</button>
      </div>
      \${tasks.map(t => \`<div class="spec-task \${t.done?'done':''}" data-id="\${esc(t.id)}">
        <input type="checkbox" id="cb-\${esc(t.id)}" data-id="\${esc(t.id)}" \${t.done?'checked':''}>
        <label for="cb-\${esc(t.id)}" class="task-lbl" data-id="\${esc(t.id)}" title="Double-click to edit">\${esc(t.title)}</label>
        <span class="tid">\${esc(t.id)}</span>
        <div class="task-actions">
          <button class="ta-btn" data-edit-task="\${esc(t.id)}" title="Edit title">&#9998;</button>
          <button class="ta-btn" data-run-task="\${esc(t.id)}" data-skill="generate-tests" title="Generate tests">Test</button>
          <button class="ta-btn" data-run-task="\${esc(t.id)}" data-skill="refactor" title="Refactor">Refactor</button>
          <button class="ta-btn ta-del" data-del-task="\${esc(t.id)}" title="Delete task">&times;</button>
        </div>
      </div>\`).join('')}
      <div class="add-task-row">
        <button class="add-task-btn" data-add-task="\${esc(epic)}">+ Add task</button>
      </div>
    </div>\`).join('');
  body.innerHTML = (epicHtml || \`<div class="spec-empty"><div class="wm">ALPAQUITAY</div><p>No tasks in spec.</p></div>\`) +
    \`<div class="add-epic-row"><button class="btn btn-o btn-sm" id="addEpicBtn" style="width:100%">+ Add Epic</button></div>\`;

  body.querySelectorAll('input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => {
    vscode.postMessage({ type:'update-task-status', taskId:cb.dataset.id, status:cb.checked?'done':'backlog' });
  }));
  body.querySelectorAll('[data-run-task]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    vscode.postMessage({ type:'run-skill-on-task', skillId:btn.dataset.skill, taskId:btn.dataset.runTask });
    toast('Running '+btn.dataset.skill+' on '+btn.dataset.runTask,'info');
  }));

  // -- Inline task edit (pencil button or double-click label)
  const startEditTask = (taskId, labelEl) => {
    const current = S.spec.tasks.find(t => t.id === taskId)?.title ?? '';
    const inp = document.createElement('input');
    inp.className = 'inline-edit-input'; inp.value = current;
    labelEl.replaceWith(inp); inp.focus(); inp.select();
    const commit = () => {
      const v = inp.value.trim();
      if (v && v !== current) vscode.postMessage({ type:'update-spec-task', taskId, newTitle:v });
      else if (!v) inp.replaceWith(labelEl); // cancelled
      else { vscode.postMessage({ type:'load-spec' }); }
    };
    inp.addEventListener('keydown', e => { if(e.key==='Enter'){e.preventDefault();commit();} if(e.key==='Escape'){inp.replaceWith(labelEl);} });
    inp.addEventListener('blur', commit, { once:true });
  };
  body.querySelectorAll('[data-edit-task]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    const id = btn.dataset.editTask;
    const lbl = btn.closest('.spec-task')?.querySelector('.task-lbl');
    if (lbl) startEditTask(id, lbl);
  }));
  body.querySelectorAll('.task-lbl').forEach(lbl => lbl.addEventListener('dblclick', e => {
    e.preventDefault();
    const id = lbl.dataset.id;
    startEditTask(id, lbl);
  }));

  // -- Delete task
  body.querySelectorAll('[data-del-task]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    vscode.postMessage({ type:'delete-spec-task', taskId:btn.dataset.delTask });
  }));

  // -- Add task inline per epic
  body.querySelectorAll('[data-add-task]').forEach(btn => btn.addEventListener('click', () => {
    const epic = btn.dataset.addTask;
    const inp = document.createElement('input');
    inp.className = 'inline-edit-input'; inp.placeholder = 'New task title...';
    btn.replaceWith(inp); inp.focus();
    const commit = () => {
      const v = inp.value.trim();
      if (v) vscode.postMessage({ type:'add-spec-task', epicTitle:epic, taskTitle:v });
      else vscode.postMessage({ type:'load-spec' });
    };
    inp.addEventListener('keydown', e => { if(e.key==='Enter'){e.preventDefault();commit();} if(e.key==='Escape'){vscode.postMessage({type:'load-spec'});} });
    inp.addEventListener('blur', commit, { once:true });
  }));

  // -- Inline epic rename (pencil or double-click title)
  const startEditEpic = (oldTitle, titleEl) => {
    const inp = document.createElement('input');
    inp.className = 'inline-edit-input'; inp.value = oldTitle;
    titleEl.replaceWith(inp); inp.focus(); inp.select();
    const commit = () => {
      const v = inp.value.trim();
      if (v && v !== oldTitle) vscode.postMessage({ type:'update-spec-epic', oldTitle, newTitle:v });
      else vscode.postMessage({ type:'load-spec' });
    };
    inp.addEventListener('keydown', e => { if(e.key==='Enter'){e.preventDefault();commit();} if(e.key==='Escape'){vscode.postMessage({type:'load-spec'});} });
    inp.addEventListener('blur', commit, { once:true });
  };
  body.querySelectorAll('[data-edit-epic]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    const old = btn.dataset.editEpic;
    const hd = btn.closest('.spec-epic-hd')?.querySelector('.epic-title-txt');
    if (hd) startEditEpic(old, hd);
  }));
  body.querySelectorAll('.epic-title-txt').forEach(el => el.addEventListener('dblclick', e => {
    e.preventDefault();
    startEditEpic(el.dataset.epic, el);
  }));

  // -- Delete epic
  body.querySelectorAll('[data-del-epic]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    vscode.postMessage({ type:'delete-spec-epic', epicTitle:btn.dataset.delEpic });
  }));

  // -- Add epic
  document.getElementById('addEpicBtn')?.addEventListener('click', () => {
    const name = prompt('New epic name:')?.trim();
    if (name) vscode.postMessage({ type:'add-spec-epic', epicTitle:name });
  });
}
(function initBoardDrag() {
  document.querySelectorAll('.board-cols').forEach(board => {
    board.addEventListener('dragstart', e => { const c=e.target.closest('.card'); if(!c)return; window._dragId=c.dataset.id; c.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; });
    board.addEventListener('dragend',   e => { const c=e.target.closest('.card'); if(c) c.classList.remove('dragging'); });
    board.addEventListener('dragover',  e => {
      const anyCol=e.target.closest('.col'); if(!anyCol)return;
      e.preventDefault();
      const body=anyCol.querySelector('.col-body'); if(body) body.classList.add('drag-over');
    });
    board.addEventListener('dragleave', e => {
      const anyCol=e.target.closest('.col'); if(!anyCol)return;
      if(!anyCol.contains(e.relatedTarget)){ const body=anyCol.querySelector('.col-body'); if(body) body.classList.remove('drag-over'); }
    });
    board.addEventListener('drop', e => {
      const anyCol=e.target.closest('.col'); if(!anyCol)return;
      e.preventDefault();
      const body=anyCol.querySelector('.col-body'); if(!body)return;
      body.classList.remove('drag-over');
      const id=window._dragId; if(!id)return; window._dragId=null;
      vscode.postMessage({ type:'update-task-status', taskId:id, status:body.dataset.status });
    });
  });
})();
function renderBoard() {
  if (!S.spec?.tasks) return;
  ['backlog','todo','in-progress','done'].forEach(st => {
    const col=document.getElementById('cards-'+st); if(!col)return;
    const tasks=S.spec.tasks.filter(t=>t.status===st);
    document.getElementById('bdg-'+st).textContent=tasks.length;
    col.innerHTML = tasks.length ? tasks.map(t => {
      const w=workingTasks.has(t.id);
      return \`<div class="card\${w?' working':''}" draggable="true" data-id="\${esc(t.id)}">
        <div class="card-id">\${esc(t.id)}</div>
        <div class="card-title">\${esc(t.title)}</div>
        <div class="card-epic">\${esc(t.epicTitle)}</div>
        \${w ? '<div class="card-working"><div class="thinking"><span></span><span></span><span></span></div> working...</div>' : ''}
      </div>\`;
    }).join('') : '<div class="board-empty">No tasks</div>';
  });
}
document.getElementById('refreshGitBtn').addEventListener('click', () => { S.git=null; vscode.postMessage({ type:'load-git' }); });
function renderGit() {
  const log=document.getElementById('gitLog');
  if (!S.git?.available) { log.innerHTML='<div class="git-unavail"><p style="font-size:11px">No git repo detected.</p></div>'; return; }
  if (!S.git.commits.length) { log.innerHTML='<div class="git-unavail"><p>No commits yet.</p></div>'; return; }
  log.innerHTML=S.git.commits.map(c=>\`<div class="commit">
    <div class="commit-hash">\${esc(c.hash)}</div>
    <div class="commit-body">
      <div class="commit-msg">\${esc(c.message)}</div>
      <div class="commit-meta"><span>\${esc(c.author)}</span><span>\${esc(c.relativeTime)}</span>
        \${c.specRef?\`<span class="spec-pill">\${esc(c.specRef)}</span>\`:''}
      </div>
    </div></div>\`).join('');
}
document.getElementById('newSkillBtn').addEventListener('click', () => { document.getElementById('createForm').style.display='block'; });
document.getElementById('skCancel').addEventListener('click', () => { document.getElementById('createForm').style.display='none'; });
document.getElementById('skSave').addEventListener('click', () => {
  const name=document.getElementById('skName').value.trim();
  const desc=document.getElementById('skDesc').value.trim();
  const prompt=document.getElementById('skPrompt').value.trim();
  if (!name||!prompt) { toast('Name and prompt required','err'); return; }
  vscode.postMessage({ type:'create-skill', name, description:desc, prompt });
  document.getElementById('createForm').style.display='none';
  ['skName','skDesc','skPrompt'].forEach(id => { document.getElementById(id).value=''; });
  toast('Skill created: '+name,'ok');
});
function renderSkillsList() {
  const list=document.getElementById('skillsList');
  list.innerHTML=S.skills.map(sk=>\`<div class="skill-row">
    <div class="skill-info">
      <div class="skill-name">/\${esc(sk.id)}</div>
      <div class="skill-desc">\${esc(sk.description||sk.name)}</div>
      \${sk.needsPath?'<div class="skill-hint">Uses active editor or asks for path</div>':''}
      \${sk.needsSpecPath?'<div class="skill-hint">Asks for spec file path</div>':''}
      \${sk.needsGoal?'<div class="skill-hint">Asks for project goal</div>':''}
    </div>
    <button class="btn btn-ai" data-skill="\${esc(sk.id)}">Run</button>
  </div>\`).join('')||'<div style="color:var(--muted);font-size:11px;padding:7px">No skills registered.</div>';
  list.querySelectorAll('[data-skill]').forEach(btn=>btn.addEventListener('click',()=>{ toast('Running /'+btn.dataset.skill,'info'); vscode.postMessage({ type:'run-skill', skillId:btn.dataset.skill }); }));
}
const skillPicker=document.getElementById('skillPicker');
document.getElementById('skillToggle').addEventListener('click',()=>{ S.skillPickerOpen=!S.skillPickerOpen; skillPicker.style.display=S.skillPickerOpen?'block':'none'; });
function renderSkillPicker() {
  skillPicker.innerHTML=S.skills.map(sk=>\`<div class="skill-opt" data-id="\${esc(sk.id)}">
    <span class="skill-opt-name">/\${esc(sk.id)}</span>
    <span class="skill-opt-desc">\${esc(sk.description)}</span>
  </div>\`).join('')||'<div style="padding:7px;color:var(--muted);font-size:11px">No skills</div>';
  skillPicker.querySelectorAll('.skill-opt').forEach(el=>el.addEventListener('click',()=>{
    const id=el.dataset.id; skillPicker.style.display='none'; S.skillPickerOpen=false;
    toast('Running /'+id,'info'); vscode.postMessage({ type:'run-skill', skillId:id });
  }));
}
function showSkillResult(msg) {
  if (msg.success) {
    hideEmpty();
    const content=typeof msg.output==='string'?msg.output:(msg.output?.message??JSON.stringify(msg.output,null,2));
    addMessage('assistant',content); toast('Skill complete','ok');
  } else { toast('Skill error: '+(msg.errors||[]).join(', '),'err'); }
}
// -- Provider tabs -----------------------------------------------------------
(function(){
  const PROVIDERS=['anthropic','openai','ollama','lmstudio'];
  function switchProvider(p){
    document.querySelectorAll('.ptab').forEach(b=>b.classList.toggle('active',b.dataset.p===p));
    PROVIDERS.forEach(id=>{ const el=document.getElementById('ps-'+id); if(el) el.style.display=id===p?'':'none'; });
  }
  document.querySelectorAll('.ptab').forEach(btn=>btn.addEventListener('click',()=>switchProvider(btn.dataset.p)));

  // Build <select> options for cloud providers from MODEL_CATALOG
  function buildModelSelect(provId){
    const sel=document.getElementById('s-'+provId+'-model');
    if(!sel||!MODEL_CATALOG[provId]) return;
    sel.innerHTML=MODEL_CATALOG[provId].map(m=>\`<option value="\${esc(m.id)}">\${esc(m.label)} — \${m.contextWindow.toLocaleString()} ctx / \${m.maxOutput.toLocaleString()} out</option>\`).join('');
    sel.addEventListener('change',()=>{
      const m=MODEL_CATALOG[provId]?.find(x=>x.id===sel.value);
      if(m){
        const desc=document.getElementById(provId+'-model-desc');
        if(desc) desc.textContent=\`\${m.contextWindow.toLocaleString()} ctx window · max \${m.maxOutput.toLocaleString()} output tokens\`;
        const tokEl=document.getElementById('s-'+provId+'-maxTokens');
        if(tokEl&&parseInt(tokEl.value)>m.maxOutput) tokEl.value=String(m.maxOutput);
      }
    });
  }
  buildModelSelect('anthropic');
  buildModelSelect('openai');
})();

// -- Temperature slider ------------------------------------------------------
document.getElementById('s-temperature').addEventListener('input', function(){ document.getElementById('s-temperature-val').textContent=parseFloat(this.value).toFixed(2); });

// -- renderSettings ----------------------------------------------------------
function renderSettings(cfg){
  const setVal=(id,v)=>{ const el=document.getElementById(id); if(el&&v!==undefined&&v!==null) el.value=String(v); };
  const setChk=(id,v)=>{ const el=document.getElementById(id); if(el) el.checked=!!v; };
  const setSel=(id,v)=>{ const el=document.getElementById(id); if(el&&v) el.value=String(v); };

  // Global defaults
  setVal('s-maxTokens',     cfg.maxTokens??4096);
  setVal('s-temperature',   cfg.temperature??0.3);
  setVal('s-requestTimeout',cfg.requestTimeout??120000);
  setVal('s-systemPrompt',  cfg.systemPrompt??'');
  setVal('s-orgContext',     cfg.orgContext??'');
  setVal('s-specFile',      cfg.specFile??'spec.md');
  setChk('s-mcp-filesystem',cfg.mcp_filesystem??true);
  setChk('s-mcp-git',       cfg.mcp_git??true);
  document.getElementById('s-temperature-val').textContent=parseFloat(cfg.temperature??0.3).toFixed(2);

  // Anthropic
  setSel('s-anthropic-model',  cfg.anthropicModel??'claude-sonnet-4-6');
  setVal('s-anthropic-maxTokens', cfg.maxTokens??4096);
  setVal('s-anthropic-baseUrl', cfg.anthropicBaseUrl??'https://api.anthropic.com/v1');
  const am=MODEL_CATALOG?.anthropic?.find(m=>m.id===(cfg.anthropicModel??'claude-sonnet-4-6'));
  if(am){ const d=document.getElementById('anthropic-model-desc'); if(d) d.textContent=\`\${am.contextWindow.toLocaleString()} ctx window · max \${am.maxOutput.toLocaleString()} output tokens\`; }

  // OpenAI
  setSel('s-openai-model',  cfg.openaiModel??'gpt-4o');
  setVal('s-openai-maxTokens', cfg.maxTokens??4096);
  setVal('s-openai-baseUrl', cfg.openaiBaseUrl??'https://api.openai.com/v1');
  const om=MODEL_CATALOG?.openai?.find(m=>m.id===(cfg.openaiModel??'gpt-4o'));
  if(om){ const d=document.getElementById('openai-model-desc'); if(d) d.textContent=\`\${om.contextWindow.toLocaleString()} ctx window · max \${om.maxOutput.toLocaleString()} output tokens\`; }

  // Ollama
  setVal('s-ollama-model',    cfg.ollamaModel??'codellama');
  setVal('s-ollama-maxTokens',2048);
  setVal('s-ollama-endpoint', cfg.ollamaEndpoint??'http://localhost:11434');

  // LM Studio
  setVal('s-lmstudio-maxTokens',2048);
  setVal('s-lmstudio-endpoint', cfg.lmstudioEndpoint??'http://localhost:1234');
}

// -- Save settings -----------------------------------------------------------
document.getElementById('s-save').addEventListener('click',()=>{
  const g=id=>document.getElementById(id);
  const v=id=>g(id)?.value?.trim()??'';
  const n=(id,def)=>parseInt(g(id)?.value)||def;
  const f=(id,def)=>parseFloat(g(id)?.value)||def;
  const settings={
    maxTokens:         n('s-maxTokens',4096),
    temperature:       f('s-temperature',0.3),
    requestTimeout:    n('s-requestTimeout',120000),
    systemPrompt:      v('s-systemPrompt'),
    orgContext:        v('s-orgContext'),
    specFile:          v('s-specFile')||'spec.md',
    mcp_filesystem:    g('s-mcp-filesystem')?.checked??true,
    mcp_git:           g('s-mcp-git')?.checked??true,
    anthropicModel:    v('s-anthropic-model'),
    anthropicBaseUrl:  v('s-anthropic-baseUrl'),
    openaiModel:       v('s-openai-model'),
    openaiBaseUrl:     v('s-openai-baseUrl'),
    ollamaModel:       v('s-ollama-model'),
    ollamaEndpoint:    v('s-ollama-endpoint'),
    lmstudioEndpoint:  v('s-lmstudio-endpoint'),
  };
  vscode.postMessage({ type:'save-settings', settings });
  toast('Settings saved','ok');
});

// -- Reset defaults ----------------------------------------------------------
document.getElementById('s-reset').addEventListener('click',()=>{
  renderSettings({ maxTokens:4096, temperature:0.3, requestTimeout:120000,
    systemPrompt:'', orgContext:'', specFile:'spec.md',
    mcp_filesystem:true, mcp_git:true,
    anthropicModel:'claude-sonnet-4-6', anthropicBaseUrl:'https://api.anthropic.com/v1',
    openaiModel:'gpt-4o', openaiBaseUrl:'https://api.openai.com/v1',
    ollamaModel:'codellama', ollamaEndpoint:'http://localhost:11434',
    lmstudioEndpoint:'http://localhost:1234',
  });
  toast('Defaults restored — click Save to apply','info');
});
// -- Arch Assess + ADR --------------------------------------------------------
document.getElementById('archAssessBtn').addEventListener('click', () => {
  const nodes = S.arch.nodes.map(n => \`\${n.name}(\${n.type})\`).join(', ') || 'empty canvas';
  const edges = S.arch.edges.map(e => { const f=S.arch.nodes.find(n=>n.id===e.from)?.name??e.from; const t=S.arch.nodes.find(n=>n.id===e.to)?.name??e.to; return \`\${f}→\${t}\`; }).join(', ');
  const ctx = \`Nodes: \${nodes}. Connections: \${edges}.\`;
  const hint=document.getElementById('archAiHint'); if(hint) hint.style.display='none';
  addArchAiMsg('u','Assess this architecture');
  _archAiThinking=true; archAiSend.disabled=true; _archAiThinkDiv=addArchAiThinking();
  const panel=document.getElementById('archAiChat'); if(panel.classList.contains('ai-hidden')){ panel.classList.remove('ai-hidden'); document.getElementById('archAiToggle').textContent='\\u25bc AI'; }
  vscode.postMessage({ type:'arch-assess', context:ctx });
});
document.getElementById('archAdrBtn').addEventListener('click', () => {
  const form=document.getElementById('archAdrForm');
  form.classList.toggle('visible');
});
document.getElementById('archAdrCancel').addEventListener('click', () => { document.getElementById('archAdrForm').classList.remove('visible'); });
document.getElementById('archAdrSubmit').addEventListener('click', () => {
  const ctx=document.getElementById('archAdrCtx').value.trim();
  const dec=document.getElementById('archAdrDec').value.trim();
  if(!ctx||!dec){ toast('Fill in context and decision','err'); return; }
  document.getElementById('archAdrForm').classList.remove('visible');
  document.getElementById('archAdrCtx').value='';
  document.getElementById('archAdrDec').value='';
  const hint=document.getElementById('archAiHint'); if(hint) hint.style.display='none';
  addArchAiMsg('u','Create ADR: '+dec.slice(0,60));
  _archAiThinking=true; archAiSend.disabled=true; _archAiThinkDiv=addArchAiThinking();
  const panel=document.getElementById('archAiChat'); if(panel.classList.contains('ai-hidden')){ panel.classList.remove('ai-hidden'); document.getElementById('archAiToggle').textContent='\\u25bc AI'; }
  vscode.postMessage({ type:'arch-create-adr', context:ctx, decision:dec });
});
// -- C4 level tabs -----------------------------------------------------------
let currentC4Level='context';
document.querySelectorAll('.c4-tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('.c4-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  currentC4Level = tab.dataset.c4;
  toast('C4 level: '+currentC4Level,'info');
}));
let archTool=null, archSelected=null, archDragging=null, archConnecting=null;
let archPan={x:0,y:0}, archZoom=1, archPanning=false, archPanStart=null;
const archSvg=document.getElementById('archCanvas');
const archNodesG=document.getElementById('archNodesGroup');
const archEdgesG=document.getElementById('archEdgesGroup');
const NC={ lambda:'rgba(255,153,0,.18)', function:'rgba(255,153,0,.18)', container:'rgba(59,130,246,.18)', service:'rgba(0,229,160,.1)', api:'rgba(139,92,246,.18)', cdn:'rgba(236,72,153,.18)', client:'rgba(255,255,255,.05)', db:'rgba(59,130,246,.18)', storage:'rgba(245,158,11,.18)', queue:'rgba(0,229,160,.1)', cache:'rgba(255,75,110,.14)', auth:'rgba(139,92,246,.18)' };
const NB={ lambda:'#ff9900', function:'#ff9900', container:'#3b82f6', service:'#00e5a0', api:'#8b5cf6', cdn:'#ec4899', client:'rgba(255,255,255,.18)', db:'#3b82f6', storage:'#f59e0b', queue:'#00e5a0', cache:'#ff4b6e', auth:'#8b5cf6' };
const NL={ lambda:'fn', function:'fn', container:'[]', service:'svc', api:'api', cdn:'cdn', client:'</>', db:'db', storage:'s3', queue:'q', cache:'$', auth:'auth' };
document.querySelectorAll('.arch-node-btn').forEach(btn=>btn.addEventListener('click',()=>{ archTool=btn.dataset.type; document.querySelectorAll('.arch-node-btn').forEach(b=>b.style.borderColor=''); btn.style.borderColor='var(--signal)'; toast('Click canvas to place '+archTool,'info'); }));
document.getElementById('archSaveBtn').addEventListener('click',()=>{ vscode.postMessage({ type:'arch-save', diagram:S.arch }); toast('Architecture saved','ok'); });
document.getElementById('archClearBtn').addEventListener('click',()=>{ S.arch={ nodes:[], edges:[] }; renderArch(); vscode.postMessage({ type:'arch-save', diagram:S.arch }); });
document.querySelectorAll('[data-fmt]').forEach(btn=>btn.addEventListener('click',()=>{ vscode.postMessage({ type:'arch-export', diagram:S.arch, format:btn.dataset.fmt }); toast('Exporting '+btn.dataset.fmt+'...','info'); }));
archSvg.addEventListener('click', e=>{
  if (!archTool) return;
  const r=archSvg.getBoundingClientRect();
  const x=(e.clientX-r.left-archPan.x)/archZoom, y=(e.clientY-r.top-archPan.y)/archZoom;
  S.arch.nodes.push({ id:'n'+Date.now(), type:archTool, name:archTool+'-'+(S.arch.nodes.length+1), x, y });
  archTool=null; document.querySelectorAll('.arch-node-btn').forEach(b=>b.style.borderColor=''); renderArch();
});
archSvg.addEventListener('mousedown', e=>{ if(e.button===1||(e.button===0&&e.altKey)){ archPanning=true; archPanStart={ x:e.clientX-archPan.x, y:e.clientY-archPan.y }; e.preventDefault(); } });
archSvg.addEventListener('mousemove', e=>{
  if(archPanning&&archPanStart){ archPan.x=e.clientX-archPanStart.x; archPan.y=e.clientY-archPanStart.y; applyTransform(); }
  if(archDragging){ const r=archSvg.getBoundingClientRect(); const x=(e.clientX-r.left-archPan.x)/archZoom-archDragging.ox, y=(e.clientY-r.top-archPan.y)/archZoom-archDragging.oy; const n=S.arch.nodes.find(n=>n.id===archDragging.id); if(n){ n.x=x; n.y=y; renderArch(); } }
});
archSvg.addEventListener('mouseup', ()=>{ archPanning=false; archPanStart=null; archDragging=null; });
archSvg.addEventListener('wheel', e=>{ e.preventDefault(); archZoom=Math.max(0.2,Math.min(3,archZoom*(e.deltaY>0?0.9:1.1))); applyTransform(); },{ passive:false });
document.addEventListener('keydown', e=>{
  if((e.key==='Delete'||e.key==='Backspace')&&archSelected&&document.activeElement===document.body){
    S.arch.nodes=S.arch.nodes.filter(n=>n.id!==archSelected); S.arch.edges=S.arch.edges.filter(ed=>ed.from!==archSelected&&ed.to!==archSelected);
    archSelected=null; renderArch(); updateArchProps();
  }
});
function applyTransform(){ const t=\`translate(\${archPan.x},\${archPan.y}) scale(\${archZoom})\`; archNodesG.setAttribute('transform',t); archEdgesG.setAttribute('transform',t); }
function renderArch(){
  archEdgesG.innerHTML=S.arch.edges.map(ed=>{ const f=S.arch.nodes.find(n=>n.id===ed.from),t=S.arch.nodes.find(n=>n.id===ed.to); if(!f||!t)return''; const x1=f.x+60,y1=f.y+28,x2=t.x+60,y2=t.y+28,mx=(x1+x2)/2; return \`<path d="M\${x1} \${y1} C\${mx} \${y1} \${mx} \${y2} \${x2} \${y2}" fill="none" stroke="rgba(107,114,128,.5)" stroke-width="1.5" marker-end="url(#arrow)"/>\`; }).join('');
  archNodesG.innerHTML='';
  S.arch.nodes.forEach(n=>{
    const g=document.createElementNS('http://www.w3.org/2000/svg','g');
    g.setAttribute('transform',\`translate(\${n.x},\${n.y})\`); g.setAttribute('cursor','move');
    const sel=n.id===archSelected;
    g.innerHTML=\`<rect width="120" height="56" rx="7" fill="\${NC[n.type]||'rgba(255,255,255,.05)'}" stroke="\${sel?'var(--signal)':(NB[n.type]||'rgba(255,255,255,.18)')}" stroke-width="\${sel?2:1}"/>
      <text x="60" y="20" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="10" fill="\${NB[n.type]||'rgba(255,255,255,.4)'}">\${NL[n.type]||n.type}</text>
      <text x="60" y="38" text-anchor="middle" font-family="IBM Plex Sans,sans-serif" font-size="11" fill="rgba(230,237,243,.9)">\${esc(n.name.length>14?n.name.slice(0,13)+'...':n.name)}</text>\`;
    g.addEventListener('mousedown', e=>{ if(e.button!==0)return; e.stopPropagation(); const r=archSvg.getBoundingClientRect(); const mx=(e.clientX-r.left-archPan.x)/archZoom, my=(e.clientY-r.top-archPan.y)/archZoom; archSelected=n.id; archDragging={ id:n.id, ox:mx-n.x, oy:my-n.y }; renderArch(); updateArchProps(n); });
    g.addEventListener('dblclick', e=>{ e.stopPropagation(); const v=prompt('Node name:',n.name); if(v!==null){ n.name=v.trim()||n.name; renderArch(); updateArchProps(n); } });
    g.addEventListener('click', e=>{ if(!e.shiftKey)return; e.stopPropagation(); if(archConnecting){ if(archConnecting.fromId!==n.id){ S.arch.edges.push({ id:'e'+Date.now(), from:archConnecting.fromId, to:n.id }); renderArch(); } archConnecting=null; } else { archConnecting={ fromId:n.id }; toast('Shift+click another node to connect','info'); } });
    archNodesG.appendChild(g);
  });
}
function updateArchProps(node){
  const c=document.getElementById('archPropsContent');
  if(!node){ c.innerHTML='<p style="color:var(--muted);font-size:11px">Select a node</p>'; return; }
  c.innerHTML=\`<div class="ap-row"><div class="ap-lbl">Name</div><input value="\${esc(node.name)}" id="ap-name"></div>
    <div class="ap-row"><div class="ap-lbl">Type</div><input value="\${esc(node.type)}" id="ap-type" readonly style="opacity:.55"></div>
    <div style="margin-top:7px;display:flex;gap:5px"><button class="btn btn-o btn-sm" id="ap-apply">Apply</button><button class="btn btn-danger btn-sm" id="ap-del">Delete</button></div>\`;
  document.getElementById('ap-apply').addEventListener('click',()=>{ const v=document.getElementById('ap-name').value.trim(); if(v){ node.name=v; renderArch(); } });
  document.getElementById('ap-del').addEventListener('click',()=>{ S.arch.nodes=S.arch.nodes.filter(n=>n.id!==node.id); S.arch.edges=S.arch.edges.filter(ed=>ed.from!==node.id&&ed.to!==node.id); archSelected=null; renderArch(); updateArchProps(); });
}
function esc(s){ if(s==null)return''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function renderMd(text){
  let out='',pos=0; const re=/\`\`\`(\\w*)\\n?([\\s\\S]*?)\`\`\`/g; let m;
  while((m=re.exec(text))!==null){ out+=renderInline(text.slice(pos,m.index)); const lang=m[1]?'<span class=\\"lang-tag\\">'+esc(m[1])+'</span>':''; out+='<pre>'+lang+esc(m[2])+'</pre>'; pos=re.lastIndex; }
  out+=renderInline(text.slice(pos)); return out;
}
function renderInline(text){ return esc(text).replace(/\`([^\`]+)\`/g,'<code>$1</code>').replace(/\\*\\*([^*]+)\\*\\*/g,'<strong>$1</strong>').replace(/\\n/g,'<br>'); }
function toast(msg,type){ const box=document.getElementById('toasts'); const el=document.createElement('div'); el.className='toast '+(type||'info'); el.textContent=msg; box.appendChild(el); setTimeout(()=>el.remove(),type==='err'?5000:3000); }
// -- AI Architect chat --------------------------------------------------------
const archAiInput=document.getElementById('archAiInput');
const archAiSend=document.getElementById('archAiSend');
const archAiMsgs=document.getElementById('archAiMsgs');
let _archAiThinking=false, _archAiThinkDiv=null, _archAiStreamDiv=null, _archAiStreamContent='';
document.getElementById('archAiToggle').addEventListener('click',()=>{
  const panel=document.getElementById('archAiChat');
  const hidden=panel.classList.toggle('ai-hidden');
  document.getElementById('archAiToggle').textContent=hidden?'\\u25b2 AI':'\\u25bc AI';
});
archAiInput.addEventListener('input',()=>{ archAiInput.style.height='auto'; archAiInput.style.height=Math.min(archAiInput.scrollHeight,64)+'px'; });
archAiInput.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); sendArchAiChat(); } });
archAiSend.addEventListener('click', sendArchAiChat);
function sendArchAiChat(){
  const text=archAiInput.value.trim(); if(!text||_archAiThinking) return;
  const hint=document.getElementById('archAiHint'); if(hint) hint.style.display='none';
  addArchAiMsg('u',text); archAiInput.value=''; archAiInput.style.height='auto';
  _archAiThinking=true; archAiSend.disabled=true;
  _archAiThinkDiv=addArchAiThinking();
  vscode.postMessage({ type:'arch-chat', text, currentDiagram: S.arch });
}
function addArchAiMsg(role,text){
  const d=document.createElement('div'); d.className='arch-ai-msg-'+role; d.textContent=text;
  archAiMsgs.appendChild(d); archAiMsgs.scrollTop=archAiMsgs.scrollHeight; return d;
}
function addArchAiThinking(){
  const d=document.createElement('div'); d.className='arch-ai-msg-a';
  d.innerHTML='<div class="thinking"><span></span><span></span><span></span></div>';
  archAiMsgs.appendChild(d); archAiMsgs.scrollTop=archAiMsgs.scrollHeight; return d;
}
function appendArchAiChunk(content){
  if(_archAiThinkDiv){ _archAiThinkDiv.remove(); _archAiThinkDiv=null; }
  _archAiStreamContent+=content;
  if(_archAiStreamDiv){ _archAiStreamDiv.textContent=_archAiStreamContent; }
  else { _archAiStreamDiv=addArchAiMsg('a',_archAiStreamContent); }
  archAiMsgs.scrollTop=archAiMsgs.scrollHeight;
}
function finishArchAiChat(patch,model){
  if(_archAiThinkDiv){ _archAiThinkDiv.remove(); _archAiThinkDiv=null; }
  _archAiStreamDiv=null; _archAiStreamContent=''; _archAiThinking=false; archAiSend.disabled=false;
  if(patch) applyArchPatch(patch);
}
function archAiChatError(err){
  if(_archAiThinkDiv){ _archAiThinkDiv.remove(); _archAiThinkDiv=null; }
  _archAiStreamDiv=null; _archAiStreamContent=''; _archAiThinking=false; archAiSend.disabled=false;
  const d=document.createElement('div'); d.className='arch-ai-msg-e'; d.textContent='Error: '+err;
  archAiMsgs.appendChild(d); archAiMsgs.scrollTop=archAiMsgs.scrollHeight;
}
function applyArchPatch(patch){
  if(patch.replace){
    S.arch={ nodes: Array.isArray(patch.replace.nodes)?patch.replace.nodes:[], edges: Array.isArray(patch.replace.edges)?patch.replace.edges:[] };
  } else {
    if(patch.add){
      if(Array.isArray(patch.add.nodes)) S.arch.nodes.push(...patch.add.nodes);
      if(Array.isArray(patch.add.edges)) S.arch.edges.push(...patch.add.edges);
    }
    if(patch.remove){
      if(Array.isArray(patch.remove.nodeIds)){ const ids=new Set(patch.remove.nodeIds); S.arch.nodes=S.arch.nodes.filter(n=>!ids.has(n.id)); S.arch.edges=S.arch.edges.filter(e=>!ids.has(e.from)&&!ids.has(e.to)); }
      if(Array.isArray(patch.remove.edgeIds)){ const ids=new Set(patch.remove.edgeIds); S.arch.edges=S.arch.edges.filter(e=>!ids.has(e.id)); }
    }
    if(patch.update&&Array.isArray(patch.update.nodes)){ for(const u of patch.update.nodes){ const n=S.arch.nodes.find(n=>n.id===u.id); if(n) Object.assign(n,u); } }
  }
  renderArch();
  vscode.postMessage({ type:'arch-save', diagram:S.arch });
  toast('Diagram updated by AI','ok');
}
})();
`; }
}
