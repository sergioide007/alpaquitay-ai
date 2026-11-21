import * as fs from 'fs';
import * as path from 'path';
import { AnthropicProvider } from '../../../providers/AnthropicProvider';
import { OpenAIProvider } from '../../../providers/OpenAIProvider';
import {
  anthropicAcceptsSampling, anthropicThinksByDefault, openaiIsReasoningModel, outputBudget, REASONING_MIN_OUTPUT_TOKENS,
} from '../../../providers/modelCapabilities';
import { DEFAULT_ANTHROPIC_MODEL, DEFAULT_OPENAI_MODEL, MODEL_CATALOG, getDefaultModel } from '../../../core/ModelCatalog';

describe('model capabilities', () => {
  it('sends sampling parameters only to Claude models that accept them', () => {
    for (const m of ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5', 'claude-haiku-4-5-20251001', 'claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022']) {
      expect([m, anthropicAcceptsSampling(m)]).toEqual([m, true]);
    }
    for (const m of ['claude-opus-4-7', 'claude-opus-4-8', 'claude-opus-5', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-2', 'claude-mythos-5-2', 'claude-something-new']) {
      expect([m, anthropicAcceptsSampling(m)]).toEqual([m, false]);
    }
  });

  it('knows which Claude models think by default', () => {
    expect(anthropicThinksByDefault('claude-opus-5-5')).toBe(true);
    expect(anthropicThinksByDefault('claude-haiku-5-5')).toBe(true);
    expect(anthropicThinksByDefault('claude-fable-5-2')).toBe(true);
    expect(anthropicThinksByDefault('claude-opus-4-8')).toBe(false);
    expect(anthropicThinksByDefault('claude-sonnet-4-6')).toBe(false);
  });

  it('treats GPT-6, GPT-5 and o-series as reasoning models and GPT-4o / 4.1 as classic', () => {
    for (const m of ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-luna', 'gpt-5.5', 'o1', 'o3-mini', 'something-new']) { expect([m, openaiIsReasoningModel(m)]).toEqual([m, true]); }
    for (const m of ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4-turbo', 'gpt-3.5-turbo']) { expect([m, openaiIsReasoningModel(m)]).toEqual([m, false]); }
  });

  it('raises the output budget only for reasoning models', () => {
    expect(outputBudget(4096, true)).toBe(REASONING_MIN_OUTPUT_TOKENS);
    expect(outputBudget(64000, true)).toBe(64000);
    expect(outputBudget(4096, false)).toBe(4096);
  });
});

describe('model catalog', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../../package.json'), 'utf8'));
  const props = pkg.contributes.configuration.properties ?? Object.assign({}, ...pkg.contributes.configuration.map((c: { properties: object }) => c.properties));

  it('package.json defaults equal the code defaults, and each default is first in its catalog', () => {
    expect(props['alpaquitay-ai.anthropic.model'].default).toBe(DEFAULT_ANTHROPIC_MODEL);
    expect(props['alpaquitay-ai.openai.model'].default).toBe(DEFAULT_OPENAI_MODEL);
    expect(getDefaultModel('anthropic')).toBe(DEFAULT_ANTHROPIC_MODEL);
    expect(getDefaultModel('openai')).toBe(DEFAULT_OPENAI_MODEL);
  });

  it('has no retired models and unique ids', () => {
    const ids = Object.values(MODEL_CATALOG).flat().map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter(id => /gpt-4|gpt-3\.5|^o1|claude-(opus|sonnet|haiku)-4/.test(id))).toEqual([]);
  });
});

describe('provider request bodies', () => {
  const realFetch = global.fetch;
  let sent: Record<string, unknown> = {};
  function mockFetch(json: unknown) {
    global.fetch = jest.fn(async (_url: unknown, init?: { body?: string }) => {
      sent = JSON.parse(init?.body ?? '{}');
      return { ok: true, json: async () => json, text: async () => '' } as unknown as Response;
    }) as unknown as typeof fetch;
  }
  afterEach(() => { global.fetch = realFetch; });

  it('Anthropic 5.x: no temperature, room for thinking, text read after a thinking block', async () => {
    mockFetch({ model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'hola' }, { type: 'text', text: ' mundo' }], usage: { input_tokens: 3, output_tokens: 5 } });
    const r = await new AnthropicProvider('k', 'claude-opus-5-5').chat([{ role: 'system', content: 's' }, { role: 'user', content: 'u' }], { temperature: 0.3, maxTokens: 4096 });
    expect(r.content).toBe('hola mundo');
    expect(sent.temperature).toBeUndefined();
    expect(sent.max_tokens).toBe(REASONING_MIN_OUTPUT_TOKENS);
    expect(sent.system).toEqual([{ type: 'text', text: 's', cache_control: { type: 'ephemeral' } }]);
  });

  it('Anthropic 4.6 keeps temperature and the requested budget', async () => {
    mockFetch({ model: 'claude-sonnet-4-6', content: [{ type: 'text', text: 'ok' }] });
    await new AnthropicProvider('k', 'claude-sonnet-4-6').chat([{ role: 'user', content: 'u' }], { temperature: 0.3, maxTokens: 4096 });
    expect(sent.temperature).toBe(0.3);
    expect(sent.max_tokens).toBe(4096);
  });

  it('Anthropic refusal and an empty max_tokens stop become clear errors', async () => {
    mockFetch({ model: 'claude-opus-5-5', stop_reason: 'refusal', stop_details: { category: 'cyber' }, content: [] });
    await expect(new AnthropicProvider('k', 'claude-opus-5-5').complete('x')).rejects.toThrow(/declined.*cyber/);
    mockFetch({ model: 'claude-opus-5-5', stop_reason: 'max_tokens', content: [{ type: 'thinking', thinking: '' }] });
    await expect(new AnthropicProvider('k', 'claude-opus-5-5').complete('x')).rejects.toThrow(/Max output tokens/);
  });

  it('OpenAI GPT-6: max_completion_tokens, no temperature; GPT-4o keeps temperature', async () => {
    mockFetch({ model: 'gpt-6.1-sol', choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] });
    expect(await new OpenAIProvider('k', 'gpt-6.1-sol').complete('x', { temperature: 0.3, maxTokens: 4096 })).toBe('ok');
    expect(sent.max_tokens).toBeUndefined();
    expect(sent.max_completion_tokens).toBe(REASONING_MIN_OUTPUT_TOKENS);
    expect(sent.temperature).toBeUndefined();
    mockFetch({ model: 'gpt-4o', choices: [{ message: { content: 'ok' } }] });
    await new OpenAIProvider('k', 'gpt-4o').complete('x', { temperature: 0.3, maxTokens: 4096 });
    expect(sent.temperature).toBe(0.3);
    expect(sent.max_completion_tokens).toBe(4096);
  });

  it('OpenAI refusal and an empty length stop become clear errors', async () => {
    mockFetch({ model: 'gpt-6.1-sol', choices: [{ message: { content: null, refusal: 'no' } }] });
    await expect(new OpenAIProvider('k', 'gpt-6.1-sol').complete('x')).rejects.toThrow(/declined/);
    mockFetch({ model: 'gpt-6.1-sol', choices: [{ message: { content: '' }, finish_reason: 'length' }] });
    await expect(new OpenAIProvider('k', 'gpt-6.1-sol').complete('x')).rejects.toThrow(/Max output tokens/);
  });
});
