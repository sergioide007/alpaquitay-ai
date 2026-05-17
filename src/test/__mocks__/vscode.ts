/**
 * Jest mock for the 'vscode' module.
 * Provides stub implementations for all VS Code APIs used by the extension.
 * Resolved via moduleNameMapper in package.json jest config.
 */

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2
}

export enum ProgressLocation {
  SourceControl = 1,
  Window = 10,
  Notification = 15
}

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3
}

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
  Three = 3
}

export class ThemeColor {
  constructor(public readonly id: string) {}
}

export class ThemeIcon {
  constructor(
    public readonly id: string,
    public readonly color?: ThemeColor
  ) {}
}

export class TreeItem {
  label: string;
  collapsibleState: TreeItemCollapsibleState;
  description?: string;
  iconPath?: ThemeIcon | string;
  tooltip?: string;
  contextValue?: string;
  command?: { command: string; title: string; arguments?: unknown[] };

  constructor(label: string, collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export class EventEmitter<T = void> {
  event = jest.fn();
  fire = jest.fn((_value?: T) => {});
  dispose = jest.fn();
}

export class Uri {
  static file = jest.fn((p: string) => ({
    fsPath: p,
    scheme: 'file',
    toString: () => `file://${p}`
  }));

  static parse = jest.fn((str: string) => ({
    fsPath: str,
    scheme: 'https',
    toString: () => str
  }));
}

export const window = {
  createOutputChannel: jest.fn(() => ({
    appendLine: jest.fn(),
    show: jest.fn(),
    dispose: jest.fn()
  })),
  showInformationMessage: jest.fn().mockResolvedValue(undefined),
  showErrorMessage: jest.fn().mockResolvedValue(undefined),
  showWarningMessage: jest.fn().mockResolvedValue(undefined),
  showInputBox: jest.fn().mockResolvedValue(undefined),
  showQuickPick: jest.fn().mockResolvedValue(undefined),
  showTextDocument: jest.fn().mockResolvedValue(undefined),
  withProgress: jest.fn().mockImplementation(
    (_opts: unknown, task: (p: { report: jest.Mock }, t: { isCancellationRequested: boolean }) => Promise<unknown>) =>
      task({ report: jest.fn() }, { isCancellationRequested: false })
  ),
  createWebviewPanel: jest.fn(() => ({
    webview: {
      html: '',
      options: {},
      onDidReceiveMessage: jest.fn(),
      postMessage: jest.fn().mockResolvedValue(true)
    },
    reveal: jest.fn(),
    onDidDispose: jest.fn(),
    dispose: jest.fn()
  })),
  registerWebviewViewProvider: jest.fn(() => ({ dispose: jest.fn() })),
  setStatusBarMessage: jest.fn(() => ({ dispose: jest.fn() })),
  activeTextEditor: undefined as unknown
};

export const workspace = {
  getConfiguration: jest.fn(() => ({
    get: jest.fn((key: string, defaultValue?: unknown) => defaultValue),
    update: jest.fn().mockResolvedValue(undefined)
  })),
  workspaceFolders: undefined as unknown,
  onDidSaveTextDocument: jest.fn(() => ({ dispose: jest.fn() }))
};

export const commands = {
  registerCommand: jest.fn(() => ({ dispose: jest.fn() })),
  executeCommand: jest.fn().mockResolvedValue(undefined)
};

export const env = {
  openExternal: jest.fn().mockResolvedValue(true)
};