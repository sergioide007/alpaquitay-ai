import * as vscode from 'vscode';
import { DEFAULT_CDN_BASE, DEFAULT_LOCAL_MODEL_ID, resolveLocalModelId } from '../local/cdnPolicy';
import { DEFAULT_ANTHROPIC_MODEL, DEFAULT_OPENAI_MODEL } from './ModelCatalog';
import type { DtypeSetting, EngineDevice, LocalEngineSettings } from '../local/protocol';

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
  get anthropicModel(): string   { return this.cfg.get<string>('anthropic.model', DEFAULT_ANTHROPIC_MODEL); }

  // ── OpenAI ────────────────────────────────────────────────────────────────
  get openaiBaseUrl(): string { return this.cfg.get<string>('openai.baseUrl', 'https://api.openai.com/v1'); }
  get openaiModel(): string   { return this.cfg.get<string>('openai.model', DEFAULT_OPENAI_MODEL); }

  // ── Ollama ────────────────────────────────────────────────────────────────
  get ollamaEndpoint(): string { return this.cfg.get<string>('ollama.endpoint', 'http://localhost:11434'); }
  get ollamaModel(): string    { return this.cfg.get<string>('ollama.model', 'codellama'); }

  // ── LM Studio ─────────────────────────────────────────────────────────────
  get lmstudioEndpoint(): string { return this.cfg.get<string>('lmstudio.endpoint', 'http://localhost:1234'); }

  // ── Local engine (Qwen 2.5 Coder ONNX in WebGPU/Wasm, weights from the static CDN) ──
  get localEngine(): LocalEngineSettings {
    const cdnBase = this.cfg.get<string>('localEngine.cdnBaseUrl', DEFAULT_CDN_BASE);
    return {
      enabled: this.cfg.get<boolean>('localEngine.enabled', false),
      cdnBase,
      // One source of truth for the engine, the Hub selector and the Settings tab (see resolveLocalModelId).
      modelId: resolveLocalModelId(this.cfg.get<string>('localEngine.modelId', DEFAULT_LOCAL_MODEL_ID), cdnBase),
      device: this.cfg.get<EngineDevice>('localEngine.device', 'auto'),
      dtype: this.cfg.get<DtypeSetting>('localEngine.dtype', 'auto'),
      maxNewTokens: this.cfg.get<number>('localEngine.maxNewTokens', 1024),
      extraTrustedKeys: this.cfg.get<string[]>('localEngine.extraTrustedKeys', []),
    };
  }

  // ── Skill execution ───────────────────────────────────────────────────────
  get skillMaxParallel(): number { return this.cfg.get<number>('skill.maxParallel', 3); }

  // ── Spec file ─────────────────────────────────────────────────────────────
  get specFile(): string { return this.cfg.get<string>('specFile', 'spec.md'); }

  // ── Hybrid integration mode ───────────────────────────────────────────────
  get hybridEnabled(): boolean { return vscode.workspace.getConfiguration('alpaquitay-ai.hybrid').get<boolean>('enabled', false); }
  get hybridPrimaryLLM(): string { return vscode.workspace.getConfiguration('alpaquitay-ai.hybrid').get<string>('primaryLLM', 'core'); }
  get hybridAutoEditorRules(): boolean { return vscode.workspace.getConfiguration('alpaquitay-ai.hybrid').get<boolean>('autoGenerateEditorRules', true); }
}
