import { SecretVault } from '../secrets/SecretVault';

// ── Integration identity ──────────────────────────────────────────────────────

export type IntegrationCategory =
  | 'llm'          // AI completion providers
  | 'observability' // tracing, monitoring
  | 'knowledge'    // external knowledge bases
  | 'streaming'    // event pipelines
  | 'editor';      // IDE/editor bidirectional context

export interface IntegrationMetadata {
  readonly id: string;
  readonly name: string;
  readonly category: IntegrationCategory;
  readonly description: string;
  /** Secret keys this integration requires (stored in its SecretVault namespace) */
  readonly requiredSecrets: ReadonlyArray<string>;
}

// ── Base lifecycle (every integration must implement this) ────────────────────
// ISP: this is the minimal contract; specialized interfaces add their own methods

export interface IIntegration {
  readonly metadata: IntegrationMetadata;
  /** Called once after construction with resolved secrets from the vault */
  initialize(vault: SecretVault): Promise<void>;
  isAvailable(): Promise<boolean>;
  dispose(): Promise<void>;
}

// ── Specialized contracts ─────────────────────────────────────────────────────

export interface LLMOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

/** LLM completion — wraps or replaces the core AIProvider */
export interface ILLMIntegration extends IIntegration {
  complete(prompt: string, options?: LLMOptions): Promise<string>;
  stream(prompt: string, onChunk: (chunk: string) => void, options?: LLMOptions): Promise<void>;
}

// ── Observability (LangSmith-style) ──────────────────────────────────────────

export interface TraceRun {
  id: string;
  name: string;
  inputs: Record<string, unknown>;
  startedAt: Date;
}

export interface IObservabilityIntegration extends IIntegration {
  startRun(name: string, inputs: Record<string, unknown>): TraceRun;
  endRun(run: TraceRun, outputs: Record<string, unknown>): Promise<void>;
  failRun(run: TraceRun, error: Error): Promise<void>;
  /** Decorator: wrap an async function and automatically trace it */
  traced<T>(name: string, inputs: Record<string, unknown>, fn: () => Promise<T>): Promise<T>;
}

// ── Knowledge base (Notion, etc.) ─────────────────────────────────────────────

export interface KnowledgeResult {
  id: string;
  title: string;
  content: string;
  url?: string;
  score?: number;
}

export interface IKnowledgeIntegration extends IIntegration {
  query(query: string, maxResults?: number): Promise<KnowledgeResult[]>;
  /** Force refresh of local cache */
  sync(): Promise<void>;
}

// ── Code indexing (DataFusion-style SQL search) ───────────────────────────────

export interface CodeSymbol {
  file: string;
  name: string;
  kind: 'class' | 'interface' | 'function' | 'method' | 'field' | 'enum' | 'constant' | 'other';
  line: number;
  language: string;
  modifiers: string[];   // e.g. ['public', 'static', 'final']
}

export interface IndexQuery {
  kind?: CodeSymbol['kind'];
  nameLike?: string;    // substring match on name
  language?: string;
  file?: string;        // substring match on file path
  modifiers?: string[]; // must include all listed modifiers
}

export interface ICodeIndexIntegration extends IIntegration {
  /** Index a workspace path (incremental — only changed files) */
  index(workspacePath: string): Promise<{ indexed: number; updated: number }>;
  /** SQL-inspired symbol search */
  search(query: IndexQuery): Promise<CodeSymbol[]>;
  /** Full-text search across all indexed content */
  grep(pattern: string, options?: { caseSensitive?: boolean; language?: string }): Promise<{ file: string; line: number; text: string }[]>;
}

// ── Streaming event pipeline (Vortex) ────────────────────────────────────────

export interface PipelineEvent {
  type: string;
  payload: Record<string, unknown>;
  timestamp: Date;
  correlationId?: string;
}

export type EventHandler = (event: PipelineEvent) => void | Promise<void>;
export type Unsubscribe = () => void;

export interface IStreamingIntegration extends IIntegration {
  publish(event: Omit<PipelineEvent, 'timestamp'>): void;
  subscribe(eventType: string, handler: EventHandler): Unsubscribe;
  subscribeAll(handler: EventHandler): Unsubscribe;
  /** Wait for the next event of a given type */
  once(eventType: string): Promise<PipelineEvent>;
}

// ── Editor / IDE bidirectional context ───────────────────────────────────────

export interface ArchitectureRules {
  style: 'layered' | 'hexagonal' | 'clean' | 'microservices' | 'custom';
  language: string;
  framework?: string;
  layers?: string[];
  conventions?: string[];
  forbiddenPatterns?: string[];
  customRules?: string[];
}

export interface EditorContext {
  projectName?: string;
  rules?: ArchitectureRules;
  activeFile?: string;
  openFiles?: string[];
  rawContent?: string;
}

export interface IEditorIntegration extends IIntegration {
  /** Read the current project context from the editor config */
  readContext(workspacePath: string): Promise<EditorContext>;
  /** Write architecture rules back into the editor config file */
  writeRules(workspacePath: string, rules: ArchitectureRules): Promise<void>;
  /** Generate a context description string suitable for injecting into LLM prompts */
  buildPromptContext(ctx: EditorContext): string;
}
