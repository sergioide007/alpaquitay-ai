import { BaseIntegration } from '../BaseIntegration';
import { ILLMIntegration, IntegrationMetadata, LLMOptions } from '../interfaces';
import { AIProvider } from '../../core/interfaces';

/**
 * Cline open-source tool-calling protocol adapter.
 *
 * Cline (formerly Claude Dev) wraps Claude's native tool-use format with a
 * structured XML-tagged protocol for file operations, shell commands, and
 * code generation. This provider:
 *   1. Prepends the Cline system prompt to every request.
 *   2. Parses tool invocations from the response.
 *   3. Exposes a clean ILLMIntegration surface to the rest of the system.
 *
 * The underlying LLM is the currently active AIProvider — Cline is a protocol
 * layer, NOT a new model. No API keys required beyond what is already configured.
 */
export class ClineProvider extends BaseIntegration implements ILLMIntegration {
  readonly metadata: IntegrationMetadata = {
    id: 'cline',
    name: 'Cline (Open Source)',
    category: 'llm',
    description: 'Cline open-source tool-calling protocol wrapping the active AI provider',
    requiredSecrets: [],  // uses the parent provider's key
  };

  private baseProvider!: AIProvider;

  constructor(provider: AIProvider) {
    super();
    this.baseProvider = provider;
  }

  protected async onInitialize(): Promise<void> {
    // Nothing to connect — just verify the base provider is alive
    const alive = await this.baseProvider.isAvailable();
    if (!alive) {
      throw new Error(`Cline integration requires an active AI provider, but "${this.baseProvider.name}" is unavailable.`);
    }
  }

  protected override async checkAvailability(): Promise<boolean> {
    return this.baseProvider.isAvailable();
  }

  // ── ILLMIntegration ───────────────────────────────────────────────────────

  async complete(prompt: string, options?: LLMOptions): Promise<string> {
    const augmented = this.buildClinePrompt(prompt, options?.systemPrompt);
    const raw = await this.baseProvider.complete(augmented, {
      maxTokens: options?.maxTokens,
      temperature: options?.temperature,
    });
    return this.extractContent(raw);
  }

  async stream(
    prompt: string,
    onChunk: (chunk: string) => void,
    options?: LLMOptions
  ): Promise<void> {
    // Stream via chunked completion (base providers may not support native streaming)
    const result = await this.complete(prompt, options);
    // Simulate streaming by emitting word-by-word
    for (const word of result.split(' ')) {
      onChunk(word + ' ');
      await new Promise(r => setTimeout(r, 0));
    }
  }

  // ── Cline protocol helpers ────────────────────────────────────────────────

  private buildClinePrompt(userPrompt: string, systemOverride?: string): string {
    const system = systemOverride ?? CLINE_SYSTEM_PROMPT;
    return `${system}\n\n<task>\n${userPrompt}\n</task>`;
  }

  /**
   * Cline responses may contain XML tool tags mixed with prose.
   * We extract only the content outside of tool blocks for direct code output.
   * Tool invocations (read_file, write_to_file, execute_command) are logged but
   * not executed — the Alpaquitay MCP layer handles actual file operations.
   */
  private extractContent(raw: string): string {
    // Remove tool invocation blocks; keep surrounding content
    return raw
      .replace(/<(read_file|write_to_file|execute_command|list_files|search_files)[^>]*>[\s\S]*?<\/\1>/g, '')
      .replace(/<thinking>[\s\S]*?<\/thinking>/g, '')
      .trim();
  }

  /** Expose the underlying provider for use in hybrid routing */
  getBaseProvider(): AIProvider { return this.baseProvider; }
}

// ── Cline system prompt ───────────────────────────────────────────────────────
// Adapted from the Cline open-source project (Apache-2.0 license).
// Full project: https://github.com/cline/cline

const CLINE_SYSTEM_PROMPT = `You are Cline, a highly skilled software engineer with extensive knowledge in many programming languages, frameworks, design patterns, and best practices.

====

CAPABILITIES

You can read and write files, execute terminal commands, and interact with the user to complete complex software engineering tasks.

====

RULES

- Work step-by-step. Think before writing code.
- Generate complete, functional, compilable code only.
- Follow SOLID principles, clean architecture, and language-specific conventions.
- Never output emojis, status markers, or decorative symbols in code.
- Never add explanatory text outside of code comments when generating source files.
- Prefer composition over inheritance.
- Write tests alongside implementation code.

====

OUTPUT FORMAT

When generating files, output ONLY the raw source code. No markdown fences. No preamble.`.trim();
