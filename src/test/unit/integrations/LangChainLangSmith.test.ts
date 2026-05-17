import { LangChainProvider, ChainFactory, PromptTemplate, LLMStep, StringOutputParser } from '../../../integrations/langchain/LangChainProvider';
import { LangSmithTracer } from '../../../integrations/langchain/LangSmithTracer';
import { AIProvider } from '../../../core/interfaces';
import { SecretVault } from '../../../secrets/SecretVault';

function mockVault(secrets: Record<string, string> = {}): SecretVault {
  return {
    get: jest.fn((key: string) => Promise.resolve(secrets[key])),
    set: jest.fn(), delete: jest.fn(),
    has: jest.fn((key: string) => Promise.resolve(key in secrets && secrets[key].length > 0)),
    getAll: jest.fn().mockResolvedValue(secrets),
    child: jest.fn(),
  } as never;
}

function mockProvider(response = 'generated code'): AIProvider {
  return {
    name: 'mock', type: 'anthropic', modelName: 'mock-model',
    isAvailable: jest.fn().mockResolvedValue(true),
    chat: jest.fn(),
    complete: jest.fn().mockResolvedValue(response),
  };
}

// ── Chain primitives ──────────────────────────────────────────────────────────

describe('PromptTemplate', () => {
  it('replaces template variables with input values', async () => {
    const tpl = new PromptTemplate('Generate a {language} class named {name}');
    const result = await tpl.invoke({ language: 'Java', name: 'PersonaService' });
    expect(result.prompt).toBe('Generate a Java class named PersonaService');
  });

  it('leaves unmatched variables as-is', async () => {
    const tpl = new PromptTemplate('Hello {name}, your {missing} value');
    const result = await tpl.invoke({ name: 'Alex' });
    expect(result.prompt).toContain('{missing}');
  });
});

describe('LLMStep', () => {
  it('calls the provider with the given prompt', async () => {
    const provider = mockProvider('public class Foo {}');
    const step = new LLMStep(provider);
    const result = await step.invoke({ prompt: 'Write Foo' });
    expect(result.output).toBe('public class Foo {}');
    expect(provider.complete).toHaveBeenCalledWith('Write Foo', undefined);
  });
});

describe('StringOutputParser', () => {
  it('trims whitespace from output', async () => {
    const parser = new StringOutputParser();
    const result = await parser.invoke({ output: '  hello  ' });
    expect(result.text).toBe('hello');
  });
});

describe('ChainFactory.simpleChain', () => {
  it('pipes prompt → LLM → parser and returns text', async () => {
    const provider = mockProvider('  result  ');
    const factory = new ChainFactory(provider);
    const chain = factory.simpleChain('{input}');
    const result = await chain.invoke({ input: 'test' });
    expect(result.text).toBe('result');
  });
});

// ── LangChainProvider ─────────────────────────────────────────────────────────

describe('LangChainProvider', () => {
  it('complete() routes through the base provider', async () => {
    const provider = mockProvider('answer');
    const lc = new LangChainProvider(provider);
    await lc.initialize(mockVault());
    const result = await lc.complete('question');
    expect(result).toBe('answer');
  });

  it('fails to initialize when the base provider is unavailable', async () => {
    const provider = mockProvider();
    (provider.isAvailable as jest.Mock).mockResolvedValue(false);
    const lc = new LangChainProvider(provider);
    await expect(lc.initialize(mockVault())).rejects.toThrow('active AI provider');
  });

  it('getFactory() returns the ChainFactory', async () => {
    const lc = new LangChainProvider(mockProvider());
    await lc.initialize(mockVault());
    expect(lc.getFactory()).toBeInstanceOf(ChainFactory);
  });
});

// ── LangSmithTracer ───────────────────────────────────────────────────────────

describe('LangSmithTracer', () => {
  it('startRun returns a TraceRun with correct name and id', async () => {
    const tracer = new LangSmithTracer('test-project');
    await tracer.initialize(mockVault({ apiKey: 'test-key' }));
    const run = tracer.startRun('generate', { prompt: 'hello' });
    expect(run.name).toBe('generate');
    expect(run.id).toBeTruthy();
    expect(run.startedAt).toBeInstanceOf(Date);
  });

  it('traced() returns the function result', async () => {
    const tracer = new LangSmithTracer('test-project');
    await tracer.initialize(mockVault({ apiKey: 'test-key' }));
    // Mock the postRun to avoid network calls
    jest.spyOn(tracer as never, 'postRun').mockResolvedValue(void 0 as never);
    const result = await tracer.traced('test', {}, () => Promise.resolve('output'));
    expect(result).toBe('output');
  });

  it('traced() re-throws on error and still posts the failure', async () => {
    const tracer = new LangSmithTracer();
    await tracer.initialize(mockVault({ apiKey: 'key' }));
    jest.spyOn(tracer as never, 'postRun').mockResolvedValue(void 0 as never);
    await expect(
      tracer.traced('fail', {}, () => Promise.reject(new Error('LLM failed')))
    ).rejects.toThrow('LLM failed');
  });
});
