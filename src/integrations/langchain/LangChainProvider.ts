import { BaseIntegration } from '../BaseIntegration';
import { ILLMIntegration, IntegrationMetadata, LLMOptions } from '../interfaces';
import { AIProvider } from '../../core/interfaces';

// ── Chain primitives ──────────────────────────────────────────────────────────
// A minimal LangChain-style composable pipeline without the npm dependency.
// Follows the same conceptual API (Runnable interface) for easy migration.

export type ChainInput = Record<string, unknown>;
export type ChainOutput = Record<string, unknown>;

export interface ChainStep<I extends ChainInput = ChainInput, O extends ChainOutput = ChainOutput> {
  invoke(input: I): Promise<O>;
  /** Pipe this step into the next, returning a new composed step */
  pipe<R extends ChainOutput>(next: ChainStep<O, R>): ChainStep<I, R>;
}

/** Builds a PromptTemplate → LLM chain step */
export class PromptTemplate implements ChainStep<ChainInput, { prompt: string }> {
  constructor(private readonly template: string) {}

  async invoke(input: ChainInput): Promise<{ prompt: string }> {
    let prompt = this.template;
    for (const [key, value] of Object.entries(input)) {
      prompt = prompt.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
    }
    return { prompt };
  }

  pipe<R extends ChainOutput>(next: ChainStep<{ prompt: string }, R>): ChainStep<ChainInput, R> {
    return new PipedStep(this, next);
  }
}

/** LLM step — takes a { prompt } and returns { output } */
export class LLMStep implements ChainStep<{ prompt: string }, { output: string }> {
  constructor(
    private readonly provider: AIProvider,
    private readonly defaultOptions?: LLMOptions
  ) {}

  async invoke(input: { prompt: string }): Promise<{ output: string }> {
    const output = await this.provider.complete(input.prompt, this.defaultOptions);
    return { output };
  }

  pipe<R extends ChainOutput>(next: ChainStep<{ output: string }, R>): ChainStep<{ prompt: string }, R> {
    return new PipedStep(this, next);
  }
}

/** String output parser — extracts the final text output */
export class StringOutputParser implements ChainStep<{ output: string }, { text: string }> {
  async invoke(input: { output: string }): Promise<{ text: string }> {
    return { text: input.output.trim() };
  }

  pipe<R extends ChainOutput>(next: ChainStep<{ text: string }, R>): ChainStep<{ output: string }, R> {
    return new PipedStep(this, next);
  }
}

class PipedStep<I extends ChainInput, M extends ChainOutput, O extends ChainOutput>
  implements ChainStep<I, O> {

  constructor(
    private readonly first: ChainStep<I, M>,
    private readonly second: ChainStep<M, O>
  ) {}

  async invoke(input: I): Promise<O> {
    const middle = await this.first.invoke(input);
    return this.second.invoke(middle);
  }

  pipe<R extends ChainOutput>(next: ChainStep<O, R>): ChainStep<I, R> {
    return new PipedStep(this, next);
  }
}

// ── Chain factory ─────────────────────────────────────────────────────────────

export class ChainFactory {
  constructor(private readonly provider: AIProvider) {}

  promptTemplate(template: string): PromptTemplate {
    return new PromptTemplate(template);
  }

  llm(options?: LLMOptions): LLMStep {
    return new LLMStep(this.provider, options);
  }

  stringParser(): StringOutputParser {
    return new StringOutputParser();
  }

  /** Shortcut: PromptTemplate → LLM → StringParser */
  simpleChain(template: string, options?: LLMOptions): ChainStep<ChainInput, { text: string }> {
    return this.promptTemplate(template)
      .pipe(this.llm(options))
      .pipe(this.stringParser());
  }
}

// ── LangChain integration ─────────────────────────────────────────────────────

export class LangChainProvider extends BaseIntegration implements ILLMIntegration {
  readonly metadata: IntegrationMetadata = {
    id: 'langchain',
    name: 'LangChain (minichain)',
    category: 'llm',
    description: 'Composable LLM pipeline abstraction (LangChain-compatible API without npm dependency)',
    requiredSecrets: [],
  };

  private factory!: ChainFactory;

  constructor(private readonly baseProvider: AIProvider) {
    super();
  }

  protected async onInitialize(): Promise<void> {
    const alive = await this.baseProvider.isAvailable();
    if (!alive) { throw new Error(`LangChain requires an active AI provider.`); }
    this.factory = new ChainFactory(this.baseProvider);
  }

  // ── ILLMIntegration ───────────────────────────────────────────────────────

  async complete(prompt: string, options?: LLMOptions): Promise<string> {
    const chain = this.factory.simpleChain('{prompt}', options);
    const result = await chain.invoke({ prompt });
    return result.text;
  }

  async stream(prompt: string, onChunk: (chunk: string) => void, options?: LLMOptions): Promise<void> {
    const result = await this.complete(prompt, options);
    for (const word of result.split(' ')) {
      onChunk(word + ' ');
      await new Promise(r => setTimeout(r, 0));
    }
  }

  /** Direct access to the chain factory for building custom pipelines */
  getFactory(): ChainFactory { return this.factory; }
}
