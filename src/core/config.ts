import * as vscode from 'vscode';

export class AlpaquitayConfig {
  private get cfg() {
    return vscode.workspace.getConfiguration('alpaquitay-ai');
  }

  // ── LLM request defaults ──────────────────────────────────────────────────
  get maxTokens(): number     { return this.cfg.get<number>('maxTokens', 4096); }
  get temperature(): number   { return this.cfg.get<number>('temperature', 0.3); }
  get requestTimeout(): number { return this.cfg.get<number>('requestTimeout', 120000); }

  // ── Provider selection ────────────────────────────────────────────────────
  get preferredProvider(): string { return this.cfg.get<string>('preferredProvider', 'auto'); }

  // ── Anthropic ─────────────────────────────────────────────────────────────
  get anthropicBaseUrl(): string { return this.cfg.get<string>('anthropic.baseUrl', 'https://api.anthropic.com/v1'); }
  get anthropicModel(): string   { return this.cfg.get<string>('anthropic.model', 'claude-sonnet-4-6'); }

  // ── OpenAI ────────────────────────────────────────────────────────────────
  get openaiBaseUrl(): string { return this.cfg.get<string>('openai.baseUrl', 'https://api.openai.com/v1'); }
  get openaiModel(): string   { return this.cfg.get<string>('openai.model', 'gpt-4o'); }

  // ── Ollama ────────────────────────────────────────────────────────────────
  get ollamaEndpoint(): string { return this.cfg.get<string>('ollama.endpoint', 'http://localhost:11434'); }
  get ollamaModel(): string    { return this.cfg.get<string>('ollama.model', 'codellama'); }

  // ── LM Studio ─────────────────────────────────────────────────────────────
  get lmstudioEndpoint(): string { return this.cfg.get<string>('lmstudio.endpoint', 'http://localhost:1234'); }

  // ── Skill execution ───────────────────────────────────────────────────────
  get skillMaxParallel(): number { return this.cfg.get<number>('skill.maxParallel', 3); }

  // ── Spec file ─────────────────────────────────────────────────────────────
  get specFile(): string { return this.cfg.get<string>('specFile', 'spec.md'); }

  // ── Hybrid integration mode ───────────────────────────────────────────────
  get hybridEnabled(): boolean { return vscode.workspace.getConfiguration('alpaquitay-ai.hybrid').get<boolean>('enabled', false); }
  get hybridPrimaryLLM(): string { return vscode.workspace.getConfiguration('alpaquitay-ai.hybrid').get<string>('primaryLLM', 'core'); }
  get hybridAutoEditorRules(): boolean { return vscode.workspace.getConfiguration('alpaquitay-ai.hybrid').get<boolean>('autoGenerateEditorRules', true); }
}
