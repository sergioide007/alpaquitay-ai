export type ProviderType = 'anthropic' | 'openai' | 'ollama' | 'lmstudio';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIResponse {
  content: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number };
}

export interface AIProvider {
  readonly name: string;
  readonly type: ProviderType;
  /** The specific model identifier being used (e.g. "deepseek-coder:1.3b", "claude-sonnet-4-6") */
  readonly modelName: string;
  isAvailable(): Promise<boolean>;
  chat(messages: Message[], options?: ChatOptions): Promise<AIResponse>;
  complete(prompt: string, options?: ChatOptions): Promise<string>;
}

export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface MCPTool {
  name: string;
  description: string;
  parameters: Record<string, string>;
  execute(params: Record<string, unknown>): Promise<unknown>;
}

export interface MCPServer {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  tools: MCPTool[];
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

export interface Skill {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  execute(context: SkillContext): Promise<SkillResult>;
}

export interface SkillContext {
  ai: AIProvider;
  mcp: MCPExecutor;
  workspace: string;
  parameters: Record<string, unknown>;
  /** Injected by SkillRegistry — spawn a sub-skill as an agent */
  spawn?: (skillId: string, params: Record<string, unknown>) => Promise<SkillResult>;
  /** Injected by SkillRegistry — live VS Code configuration */
  config?: import('./config').AlpaquitayConfig;
}

/** A single reasoning step in a DeepAgentSkill pipeline */
export interface AgentStep {
  name: string;
  run(ctx: SkillContext, outputs: Record<string, unknown>): Promise<unknown>;
}

export interface MCPExecutor {
  executeTool(serverId: string, toolName: string, params: Record<string, unknown>): Promise<unknown>;
}

export interface SkillResult {
  success: boolean;
  output?: unknown;
  errors?: string[];
}

export interface ProviderInfo {
  type: ProviderType;
  name: string;
  available: boolean;
  models?: string[];
  isLocal: boolean;
}

// ── Spec-Driven Development ───────────────────────────────────────────────────

export type TaskStatus = 'backlog' | 'todo' | 'in-progress' | 'done';

export interface SpecTask {
  id: string;        // SPEC-001
  epicTitle: string;
  title: string;
  done: boolean;
  status: TaskStatus;
  lineIndex: number;
}

export interface SpecCandidate {
  name: string;
  relativePath: string;
  taskCount: number;
  needsConversion?: boolean;
}

export interface SpecData {
  exists: boolean;
  markdown: string;
  tasks: SpecTask[];
  specFile?: string;
  candidates?: SpecCandidate[];
}

// ── Hierarchical memory ───────────────────────────────────────────────────────

export type { MemoryLevel, MemoryEntry, MemoryStore } from './HierarchicalMemory';

// ── Git integration ───────────────────────────────────────────────────────────

export interface GitCommit {
  hash: string;
  author: string;
  relativeTime: string;
  message: string;
  specRef?: string;  // e.g. "SPEC-003" when commit message contains #SPEC-003
}

export interface GitLog {
  available: boolean;
  commits: GitCommit[];
}

// ── Model picker ──────────────────────────────────────────────────────────────

export interface ModelOption {
  id: string;
  label: string;
  provider: ProviderType;
  isLocal: boolean;
}

// ── Webview ↔ Extension messages ─────────────────────────────────────────────

// ── Architecture diagram ──────────────────────────────────────────────────────

export type ArchNodeType =
  | 'lambda' | 'function' | 'api' | 'db' | 'storage'
  | 'queue' | 'cache' | 'service' | 'client' | 'auth' | 'cdn' | 'container';

export interface ArchNode {
  id: string;
  type: ArchNodeType;
  name: string;
  cloud?: 'aws' | 'azure' | 'gcp' | 'generic';
  x: number;
  y: number;
}

export interface ArchEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
}

export interface ArchDiagram {
  nodes: ArchNode[];
  edges: ArchEdge[];
}

export interface ArchDiagramPatch {
  replace?: ArchDiagram;
  add?: { nodes?: ArchNode[]; edges?: ArchEdge[] };
  remove?: { nodeIds?: string[]; edgeIds?: string[] };
  update?: { nodes?: Array<Partial<ArchNode> & { id: string }> };
}

export type WebviewMessage =
  | { type: 'chat'; text: string; modelId: string }
  | { type: 'load-spec' }
  | { type: 'update-task-status'; taskId: string; status: TaskStatus }
  | { type: 'load-git' }
  | { type: 'load-skills' }
  | { type: 'run-skill'; skillId: string }
  | { type: 'run-skill-with-params'; skillId: string; params: Record<string, unknown> }
  | { type: 'task-correction'; taskId: string; correction: string }
  | { type: 'get-models' }
  | { type: 'configure-provider' }
  | { type: 'switch-provider'; providerType: ProviderType }
  | { type: 'regenerate-spec'; context: string }
  | { type: 'create-skill'; name: string; description: string; prompt: string }
  | { type: 'load-settings' }
  | { type: 'save-settings'; settings: Record<string, unknown> }
  | { type: 'use-spec-file'; filename: string }
  | { type: 'convert-spec-file'; sourcePath: string }
  | { type: 'arch-save'; diagram: ArchDiagram }
  | { type: 'arch-load' }
  | { type: 'arch-export'; diagram: ArchDiagram; format: string }
  | { type: 'arch-chat'; text: string; currentDiagram: ArchDiagram }
  | { type: 'run-skill-on-task'; skillId: string; taskId: string };

export type ExtensionMessage =
  | { type: 'chat-chunk'; content: string }
  | { type: 'chat-done'; model: string }
  | { type: 'chat-error'; error: string }
  | { type: 'spec-data'; data: SpecData }
  | { type: 'git-log'; data: GitLog }
  | { type: 'skills-list'; skills: Array<{ id: string; name: string; description: string; needsPath: boolean; needsSpecPath: boolean; needsGoal: boolean }> }
  | { type: 'models-list'; models: ModelOption[] }
  | { type: 'skill-result'; success: boolean; output?: unknown; errors?: string[] }
  | { type: 'skill-needs-path'; skillId: string; needsDesc: boolean; needsSpecPath?: boolean }
  | { type: 'skill-needs-goal'; skillId: string }
  | { type: 'task-work-started'; taskId: string; title: string }
  | { type: 'task-work-done'; taskId: string; title: string }
  | { type: 'task-work-error'; taskId: string; error: string }
  | { type: 'task-correction-needed'; taskId: string; title: string }
  | { type: 'settings-data'; settings: Record<string, unknown> }
  | { type: 'arch-data'; diagram: ArchDiagram }
  | { type: 'arch-exported'; filename: string }
  | { type: 'arch-export-error'; error: string }
  | { type: 'arch-chat-chunk'; content: string }
  | { type: 'arch-chat-done'; patch: ArchDiagramPatch | null; model: string }
  | { type: 'arch-chat-error'; error: string };
