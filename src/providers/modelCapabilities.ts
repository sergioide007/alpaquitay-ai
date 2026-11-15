/**
 * Request-shape rules per cloud model. Pure, so they are unit-tested without a network.
 *
 * Anthropic (Claude API docs, 2026-11): `temperature` / `top_p` / `top_k` are rejected with a 400 from Claude Opus 4.7
 * onwards, on the 5.x family and on Fable / Mythos; Claude Opus 4.6, Sonnet 4.6, Haiku 4.5 and older still accept them.
 * The 5.x family and Fable / Mythos think by default, and thinking tokens count against `max_tokens`.
 *
 * OpenAI (API reference, 2026-11): `max_tokens` is deprecated and not compatible with reasoning models; use
 * `max_completion_tokens`, which also counts reasoning tokens. The o-series, GPT-5 and GPT-6 families reason.
 *
 * Unknown (newer) model ids are treated like the newest family: no sampling parameters, room for reasoning.
 */

/** Room for reasoning plus a useful answer when the model thinks before writing. */
export const REASONING_MIN_OUTPUT_TOKENS = 16000;

function claudeVersion(model: string): { family: string; major: number; minor: number } | null {
  const id = model.toLowerCase().replace(/^anthropic\./, '');
  if (/^claude-(instant|2|3)/.test(id)) { return { family: 'legacy', major: 3, minor: 0 }; }
  const m = id.match(/^claude-(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d+))?/);
  if (!m) { return null; }
  const minor = m[3] && m[3].length < 8 ? Number(m[3]) : 0;   // "claude-sonnet-4-20250514" is 4.0, not 4.20250514
  return { family: m[1], major: Number(m[2]), minor };
}

/** True when the model accepts `temperature` (and the other sampling parameters). */
export function anthropicAcceptsSampling(model: string): boolean {
  const v = claudeVersion(model);
  if (!v || v.family === 'fable' || v.family === 'mythos') { return false; }
  return v.major < 4 || (v.major === 4 && v.minor <= 6);
}

/** True when the model thinks by default (its first content block may be `thinking`, not `text`). */
export function anthropicThinksByDefault(model: string): boolean {
  const v = claudeVersion(model);
  if (!v) { return true; }
  return v.family === 'fable' || v.family === 'mythos' || v.major >= 5;
}

/** Classic (non-reasoning) chat models that still take `temperature`. Everything else is treated as reasoning. */
const OPENAI_CLASSIC = /^(gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-4(-\d{4})?$|gpt-3\.5|chatgpt-4o)/;

export function openaiIsReasoningModel(model: string): boolean {
  return !OPENAI_CLASSIC.test(model.toLowerCase());
}

/** Output budget to request: the caller's, raised to leave room for reasoning when the model reasons. */
export function outputBudget(requested: number, reasons: boolean): number {
  return reasons ? Math.max(requested, REASONING_MIN_OUTPUT_TOKENS) : requested;
}
