import * as vscode from 'vscode';

// ── Per-integration toggle flags ──────────────────────────────────────────────

export interface IntegrationFlags {
  /** Cline open-source tool-calling protocol (wraps the active AI provider) */
  cline: boolean;
  /** LangChain minichain — compose multi-step LLM pipelines */
  langchain: boolean;
  /** LangSmith observability — trace every LLM call (requires apiKey secret) */
  langsmith: boolean;
  /** Notion knowledge base — pull context from Notion pages */
  notion: boolean;
  /** DataFusion code indexer — SQL-like search over the workspace */
  datafusion: boolean;
  /** Vortex event pipeline — stream code-generation events */
  vortex: boolean;
  /** Cursor integration — read/write .cursor/rules, isolated secrets */
  cursor: boolean;
  /** Windsurf integration — bidirectional architecture context */
  windsurf: boolean;
}

// ── Hybrid configuration ──────────────────────────────────────────────────────

export interface HybridConfig {
  /** Master switch — when false nothing loads regardless of flags */
  enabled: boolean;
  integrations: IntegrationFlags;
  /** Which integration acts as the primary LLM (overrides the core provider) */
  primaryLLM: 'core' | 'cline' | 'langchain';
  /** LangSmith project name for grouping runs */
  langsmithProject: string;
  /** Notion root page ID to use as knowledge base root */
  notionRootPageId: string;
  /** Max results returned by the code indexer per query */
  indexerMaxResults: number;
  /** Whether to auto-generate Cursor/Windsurf rules on project scaffold */
  autoGenerateEditorRules: boolean;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

export const HYBRID_DEFAULTS: HybridConfig = {
  enabled: false,
  integrations: {
    cline: false,
    langchain: false,
    langsmith: false,
    notion: false,
    datafusion: false,
    vortex: true,       // lightweight — on by default
    cursor: false,
    windsurf: false,
  },
  primaryLLM: 'core',
  langsmithProject: 'alpaquitay-ai',
  notionRootPageId: '',
  indexerMaxResults: 50,
  autoGenerateEditorRules: true,
};

// ── VS Code settings reader ───────────────────────────────────────────────────

export class HybridConfigReader {
  private get cfg() {
    return vscode.workspace.getConfiguration('alpaquitay-ai.hybrid');
  }

  get enabled(): boolean {
    return this.cfg.get<boolean>('enabled', HYBRID_DEFAULTS.enabled);
  }

  get integrations(): IntegrationFlags {
    const d = HYBRID_DEFAULTS.integrations;
    return {
      cline:       this.cfg.get<boolean>('integrations.cline',      d.cline),
      langchain:   this.cfg.get<boolean>('integrations.langchain',  d.langchain),
      langsmith:   this.cfg.get<boolean>('integrations.langsmith',  d.langsmith),
      notion:      this.cfg.get<boolean>('integrations.notion',     d.notion),
      datafusion:  this.cfg.get<boolean>('integrations.datafusion', d.datafusion),
      vortex:      this.cfg.get<boolean>('integrations.vortex',     d.vortex),
      cursor:      this.cfg.get<boolean>('integrations.cursor',     d.cursor),
      windsurf:    this.cfg.get<boolean>('integrations.windsurf',   d.windsurf),
    };
  }

  get primaryLLM(): HybridConfig['primaryLLM'] {
    return this.cfg.get<HybridConfig['primaryLLM']>('primaryLLM', HYBRID_DEFAULTS.primaryLLM);
  }

  get langsmithProject(): string {
    return this.cfg.get<string>('langsmithProject', HYBRID_DEFAULTS.langsmithProject);
  }

  get notionRootPageId(): string {
    return this.cfg.get<string>('notionRootPageId', HYBRID_DEFAULTS.notionRootPageId);
  }

  get indexerMaxResults(): number {
    return this.cfg.get<number>('indexerMaxResults', HYBRID_DEFAULTS.indexerMaxResults);
  }

  get autoGenerateEditorRules(): boolean {
    return this.cfg.get<boolean>('autoGenerateEditorRules', HYBRID_DEFAULTS.autoGenerateEditorRules);
  }

  toHybridConfig(): HybridConfig {
    return {
      enabled: this.enabled,
      integrations: this.integrations,
      primaryLLM: this.primaryLLM,
      langsmithProject: this.langsmithProject,
      notionRootPageId: this.notionRootPageId,
      indexerMaxResults: this.indexerMaxResults,
      autoGenerateEditorRules: this.autoGenerateEditorRules,
    };
  }
}
