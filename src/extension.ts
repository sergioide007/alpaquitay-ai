import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { SecretManager } from './core/SecretManager';
import { PrivacyManager } from './core/PrivacyManager';
import { AlpaquitayConfig } from './core/config';
import { AIProviderManager } from './providers/AIProviderManager';
import { MCPManager } from './mcp/MCPManager';
import { FilesystemMCP } from './mcp/FilesystemMCP';
import { GitMCP } from './mcp/GitMCP';
import { SkillRegistry } from './skills/SkillRegistry';
import { CreateFileSkill } from './skills/built-in/CreateFileSkill';
import { RefactorSkill } from './skills/built-in/RefactorSkill';
import { GenerateTestsSkill } from './skills/built-in/GenerateTestsSkill';
import { DailyStandupSkill } from './skills/built-in/DailyStandupSkill';
import { ProjectBuilderSkill } from './skills/built-in/ProjectBuilderSkill';
import { NewSpecificationSkill } from './skills/built-in/NewSpecificationSkill';
import { GenerateFromSpecSkill } from './skills/built-in/GenerateFromSpecSkill';
import { ValidateAgainstSpecSkill } from './skills/built-in/ValidateAgainstSpecSkill';
import { SPEC_TEMPLATES } from './prompts/SpecTemplates';
import { MainPanel } from './panel/MainPanel';
import { SpecManager } from './core/SpecManager';
import { GitIntegration } from './core/GitIntegration';

let mcpManager: MCPManager;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel('Alpaquitay AI');
  const secrets = new SecretManager(context.secrets);
  const privacy = new PrivacyManager(context.globalState, outputChannel);
  const config = new AlpaquitayConfig();
  const aiManager = new AIProviderManager(secrets, config);
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  mcpManager = new MCPManager();

  const skillRegistry = new SkillRegistry(config);
  skillRegistry.register(new CreateFileSkill());
  skillRegistry.register(new RefactorSkill());
  skillRegistry.register(new GenerateTestsSkill());
  skillRegistry.register(DailyStandupSkill);
  skillRegistry.register(ProjectBuilderSkill);
  skillRegistry.register(new NewSpecificationSkill());
  skillRegistry.register(GenerateFromSpecSkill);
  skillRegistry.register(ValidateAgainstSpecSkill);

  const specManager = new SpecManager(workspaceRoot, config);
  const git = new GitIntegration(workspaceRoot);

  const openHub = () => {
    MainPanel.show(context, aiManager, skillRegistry, specManager, git, mcpManager, secrets, workspaceRoot);
    privacy.recordEvent('command.open');
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('alpaquitay-ai.open', openHub),

    vscode.commands.registerCommand('alpaquitay-ai.showMenu', async () => {
      type MenuItem = { label: string; description?: string; cmd: string; args?: unknown[] };
      const items: MenuItem[] = [
        { label: '$(comment-discussion)  Open Alpaquitay Hub',      description: 'Ctrl+Alt+A',  cmd: 'alpaquitay-ai.open' },
        { label: '$(file-add)           New Specification',          description: 'Create a new spec file', cmd: 'alpaquitay-ai.newSpecification' },
        { label: '$(sparkle)            Generate from Spec',         description: 'AI generates code from a spec file', cmd: 'alpaquitay-ai.generateFromSpec' },
        { label: '$(pass-filled)        Validate Against Spec',      description: 'Check code compliance with spec', cmd: 'alpaquitay-ai.validateAgainstSpec' },
        { label: '$(settings-gear)      Configure AI Provider',      description: 'Set API keys or local models', cmd: 'alpaquitay-ai.configureProvider' },
        { label: '$(extensions)         GitHub Copilot Chat',        description: 'Open Copilot agent panel', cmd: 'workbench.action.chat.open' },
      ];
      const pick = await vscode.window.showQuickPick(items, {
        placeHolder: 'Alpaquitay AI  ·  Ctrl+Shift+A',
        matchOnDescription: true,
      });
      if (pick) {
        vscode.commands.executeCommand(pick.cmd);
      }
    }),

    vscode.commands.registerCommand('alpaquitay-ai.configureProvider', async () => {
      const provider = await vscode.window.showQuickPick([
        { label: '$(desktop-download) LM Studio (local)', id: 'lmstudio', isLocal: true },
        { label: '$(desktop-download) Ollama (local)', id: 'ollama', isLocal: true },
        { label: '$(cloud) Anthropic Claude', id: 'anthropic', isLocal: false },
        { label: '$(cloud) OpenAI GPT', id: 'openai', isLocal: false }
      ], { placeHolder: 'Seleccionar proveedor AI' });
      if (!provider) { return; }
      if (provider.isLocal) {
        await vscode.workspace.getConfiguration('alpaquitay-ai').update(
          'preferredProvider', provider.id, vscode.ConfigurationTarget.Global
        );
        await aiManager.initialize();
        const active = aiManager.getActive();
        if (active) {
          vscode.window.showInformationMessage(`Alpaquitay AI: ${active.name} activado.`);
        } else {
          vscode.window.showWarningMessage(`Alpaquitay AI: ${provider.id} no disponible. ¿Está corriendo el servidor local?`);
        }
      } else {
        const key = await vscode.window.showInputBox({
          prompt: `API key para ${provider.label.replace(/\$\(\S+\)\s*/, '')}`,
          password: true
        });
        if (!key) { return; }
        await secrets.setApiKey(provider.id, key);
        await aiManager.initialize();
        vscode.window.showInformationMessage('Alpaquitay AI: API key guardada en OS keychain.');
      }
      MainPanel.current?.refreshProviders();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('alpaquitay-ai.newSpecification', async () => {
      const templatePick = await vscode.window.showQuickPick(
        SPEC_TEMPLATES.map(t => ({ label: t.label, description: t.description, id: t.id })),
        { placeHolder: 'Select a specification template' }
      );
      if (!templatePick) { return; }

      const name = await vscode.window.showInputBox({
        prompt: 'Feature or component name (e.g. "User Authentication")',
        placeHolder: 'My Feature'
      });
      if (!name?.trim()) { return; }

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
      const tmpl = SPEC_TEMPLATES.find(t => t.id === templatePick.id)!;
      const slug = name.trim().toLowerCase().replace(/\s+/g, '-');
      const fileName = slug + tmpl.extension;
      const specsDir = path.join(workspaceRoot, 'specs');
      const filePath = path.join(specsDir, fileName);

      try {
        await fs.mkdir(specsDir, { recursive: true });
        await fs.writeFile(filePath, tmpl.content(name.trim()), 'utf-8');
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc);
        vscode.window.showInformationMessage(`Alpaquitay: Specification created at specs/${fileName}`);
      } catch (err) {
        vscode.window.showErrorMessage(`Alpaquitay: Failed to create spec — ${String(err)}`);
      }
    }),

    vscode.commands.registerCommand('alpaquitay-ai.generateFromSpec', async () => {
      const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
      const specUri = await vscode.window.showOpenDialog({
        defaultUri: activeFile ? vscode.Uri.file(activeFile) : undefined,
        canSelectMany: false,
        openLabel: 'Select Specification File',
        filters: {
          'Specifications': ['yaml', 'yml', 'feature', 'json', 'md']
        }
      });
      if (!specUri?.length) { return; }

      const specPath = specUri[0].fsPath;
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
      const relPath = path.relative(workspaceRoot, specPath);

      const ai = aiManager.getActive();
      if (!ai) {
        vscode.window.showWarningMessage('Alpaquitay: No AI provider configured. Use "Configure AI Provider" first.');
        return;
      }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Alpaquitay: Generating from spec…', cancellable: false },
        async () => {
          const result = await skillRegistry.execute('generate-from-spec', {
            ai,
            mcp: mcpManager,
            workspace: workspaceRoot,
            parameters: { specPath: relPath }
          });
          if (result.success) {
            const out = result.output as { generated: string[]; errors: string[] };
            const msg = `Generated ${out.generated.length} file(s)` +
              (out.errors.length ? ` (${out.errors.length} error(s))` : '');
            vscode.window.showInformationMessage(`Alpaquitay: ${msg}`);
          } else {
            vscode.window.showErrorMessage(`Alpaquitay: ${result.errors?.join('; ')}`);
          }
        }
      );
    }),

    vscode.commands.registerCommand('alpaquitay-ai.validateAgainstSpec', async () => {
      const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
      const specUri = await vscode.window.showOpenDialog({
        defaultUri: activeFile ? vscode.Uri.file(activeFile) : undefined,
        canSelectMany: false,
        openLabel: 'Select Specification to Validate Against',
        filters: {
          'Specifications': ['yaml', 'yml', 'feature', 'json', 'md']
        }
      });
      if (!specUri?.length) { return; }

      const specPath = specUri[0].fsPath;
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
      const relPath = path.relative(workspaceRoot, specPath);

      const ai = aiManager.getActive();
      if (!ai) {
        vscode.window.showWarningMessage('Alpaquitay: No AI provider configured. Use "Configure AI Provider" first.');
        return;
      }

      const outputChannel = vscode.window.createOutputChannel('Alpaquitay Spec Validation');
      outputChannel.show(true);
      outputChannel.appendLine(`Validating implementation against: ${relPath}\n`);

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Alpaquitay: Validating spec compliance…', cancellable: false },
        async () => {
          const result = await skillRegistry.execute('validate-against-spec', {
            ai,
            mcp: mcpManager,
            workspace: workspaceRoot,
            parameters: { specPath: relPath }
          });
          if (result.success) {
            outputChannel.appendLine(String(result.output));
            vscode.window.showInformationMessage('Alpaquitay: Spec validation complete — see "Alpaquitay Spec Validation" output.');
          } else {
            outputChannel.appendLine(`Error: ${result.errors?.join('\n')}`);
            vscode.window.showErrorMessage(`Alpaquitay: Validation failed — ${result.errors?.join('; ')}`);
          }
        }
      );
    })
  );

  // Register MCP servers eagerly — connect() is a no-op for both, so this is fast and
  // avoids a race where the user opens the panel before initAsync finishes.
  try {
    await mcpManager.registerServer(new FilesystemMCP(workspaceRoot));
    await mcpManager.registerServer(new GitMCP(workspaceRoot));
  } catch { /* silent */ }

  // Initialize AI providers and show consent dialog in the background.
  initAsync(aiManager, privacy);
  vscode.window.setStatusBarMessage('$(comment-discussion) Alpaquitay Hub listo — Ctrl+Shift+A (menú) · Ctrl+Alt+A (hub)', 5000);
}

async function initAsync(
  aiManager: AIProviderManager,
  privacy: PrivacyManager
): Promise<void> {
  try {
    await aiManager.initialize();
    await privacy.promptConsentIfNeeded();
  } catch {
    // Silent — init errors don't block the extension
  }
}

export async function deactivate(): Promise<void> {
  await mcpManager?.dispose();
}
