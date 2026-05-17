export interface ModelInfo {
  id: string;
  label: string;
  contextWindow: number;
  maxOutput: number;
}

export const MODEL_CATALOG: Record<string, ModelInfo[]> = {
  anthropic: [
    { id: 'claude-opus-4-7',          label: 'Claude Opus 4.7',   contextWindow: 200000, maxOutput: 32000 },
    { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6', contextWindow: 200000, maxOutput: 64000 },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5',  contextWindow: 200000, maxOutput: 8096  },
  ],
  openai: [
    { id: 'gpt-4o',       label: 'GPT-4o',        contextWindow: 128000, maxOutput: 16384 },
    { id: 'gpt-4o-mini',  label: 'GPT-4o Mini',   contextWindow: 128000, maxOutput: 16384 },
    { id: 'gpt-4-turbo',  label: 'GPT-4 Turbo',   contextWindow: 128000, maxOutput: 4096  },
    { id: 'gpt-3.5-turbo',label: 'GPT-3.5 Turbo', contextWindow: 16385,  maxOutput: 4096  },
    { id: 'o1',           label: 'o1',             contextWindow: 200000, maxOutput: 32768 },
    { id: 'o1-mini',      label: 'o1-mini',        contextWindow: 128000, maxOutput: 65536 },
  ],
};

export function getDefaultModel(provider: string): string {
  const first = MODEL_CATALOG[provider]?.[0];
  return first?.id ?? '';
}

export function getModelInfo(provider: string, modelId: string): ModelInfo | undefined {
  return MODEL_CATALOG[provider]?.find(m => m.id === modelId);
}

export function catalogJson(): string {
  return JSON.stringify(MODEL_CATALOG);
}
