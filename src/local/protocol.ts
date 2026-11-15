/** Messages exchanged between the extension host and the engine Webview. */

import type { Dtype, ModelManifest } from './cdnPolicy';

export type EngineDevice = 'auto' | 'webgpu' | 'wasm';
export type DtypeSetting = 'auto' | Dtype;
export type ChatRole = 'system' | 'user' | 'assistant';

export interface EngineMessage { role: ChatRole; content: string }

export interface EngineTarget {
  cdnBase: string;
  modelId: string;
  device: EngineDevice;
  dtype: DtypeSetting;
  /** Already verified (signature + rollback check) by the extension host; the Webview trusts nothing else. */
  manifest: ModelManifest;
}

export type HostToEngine =
  | ({ type: 'probe'; id: string } & EngineTarget)
  | ({ type: 'generate'; id: string; messages: EngineMessage[]; maxNewTokens: number; temperature: number } & EngineTarget)
  | { type: 'cancel'; id: string }
  | { type: 'clear-cache'; id: string };

export type EngineToHost =
  | { type: 'ready' }
  | { type: 'probe-result'; id: string; webgpu: boolean; shaderF16: boolean; cached: boolean; gpuReason?: string }
  | { type: 'progress'; id: string; stage: string; pct: number }
  | { type: 'done'; id: string; text: string; device: 'webgpu' | 'wasm'; newTokens: number }
  | { type: 'error'; id: string; message: string }
  | { type: 'cache-cleared'; id: string; files: number; bytes: number };

/** User-facing settings under `alpaquitay-ai.localEngine.*`. */
export interface LocalEngineSettings {
  enabled: boolean;
  cdnBase: string;
  modelId: string;
  device: EngineDevice;
  dtype: DtypeSetting;
  maxNewTokens: number;
  /** Extra Ed25519 public keys (base64) for self-hosted mirrors, on top of the project's own. */
  extraTrustedKeys: string[];
}
