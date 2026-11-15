export interface ModelInfo {
  id: string;
  label: string;
  contextWindow: number;
  maxOutput: number;
}

/**
 * Cloud models offered in the Settings selector. Checked against the providers' own documentation on 2026-11-15:
 * Anthropic's current models table and developers.openai.com/api/docs/models. The settings accept any other model
 * id the account has access to; this list only drives the selector and the context/output hints.
 * The first entry of each provider is its default (see the DEFAULT_* constants, which package.json must match).
 */
export const MODEL_CATALOG: Record<string, ModelInfo[]> = {
  anthropic: [
    { id: 'claude-opus-5-5',   label: 'Claude Opus 5.5',   contextWindow: 1000000, maxOutput: 128000 },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', contextWindow: 1000000, maxOutput: 128000 },
    { id: 'claude-haiku-5-5',  label: 'Claude Haiku 5.5',  contextWindow: 1000000, maxOutput: 128000 },
    { id: 'claude-fable-5-2',  label: 'Claude Fable 5.2',  contextWindow: 1000000, maxOutput: 128000 },
  ],
  openai: [
    { id: 'gpt-6.1-sol',   label: 'GPT-6.1 Sol',   contextWindow: 1050000, maxOutput: 128000 },
    { id: 'gpt-6-astra',   label: 'GPT-6 Astra',   contextWindow: 1050000, maxOutput: 128000 },
    { id: 'gpt-6.1-terra', label: 'GPT-6.1 Terra', contextWindow: 1050000, maxOutput: 128000 },
    { id: 'gpt-6-luna',    label: 'GPT-6 Luna',    contextWindow: 1050000, maxOutput: 128000 },
  ],
};

/** Default Anthropic model (Claude Opus 5.5). Must equal the `alpaquitay-ai.anthropic.model` default in package.json. */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';
/** Default OpenAI model (GPT-6.1 Sol, OpenAI's balanced option). Must equal the `alpaquitay-ai.openai.model` default. */
export const DEFAULT_OPENAI_MODEL = 'gpt-6.1-sol';

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
