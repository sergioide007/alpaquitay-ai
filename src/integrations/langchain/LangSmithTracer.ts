import { BaseIntegration } from '../BaseIntegration';
import { IObservabilityIntegration, IntegrationMetadata, TraceRun } from '../interfaces';

/**
 * LangSmith observability integration — REST-based, no npm dependency.
 *
 * Traces every LLM call to the LangSmith API so you can inspect token usage,
 * latency, inputs/outputs, and chain steps in the LangSmith UI.
 *
 * API reference: https://api.smith.langchain.com (OpenAPI-documented)
 */
export class LangSmithTracer extends BaseIntegration implements IObservabilityIntegration {
  readonly metadata: IntegrationMetadata = {
    id: 'langsmith',
    name: 'LangSmith Tracer',
    category: 'observability',
    description: 'Sends LLM traces to LangSmith for observability and debugging',
    requiredSecrets: ['apiKey'],
  };

  private apiKey = '';
  private projectName = 'alpaquitay-ai';
  private readonly baseUrl = 'https://api.smith.langchain.com';

  constructor(projectName?: string) {
    super();
    if (projectName) { this.projectName = projectName; }
  }

  protected async onInitialize(): Promise<void> {
    this.apiKey = (await this.vault.get('apiKey')) ?? '';
    const customProject = await this.vault.get('projectName');
    if (customProject) { this.projectName = customProject; }
  }

  protected override async checkAvailability(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/info`, {
        headers: this.authHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // ── IObservabilityIntegration ─────────────────────────────────────────────

  startRun(name: string, inputs: Record<string, unknown>): TraceRun {
    return { id: this.newRunId(), name, inputs, startedAt: new Date() };
  }

  async endRun(run: TraceRun, outputs: Record<string, unknown>): Promise<void> {
    await this.postRun({
      id: run.id,
      name: run.name,
      run_type: 'llm',
      inputs: run.inputs,
      outputs,
      start_time: run.startedAt.getTime(),
      end_time: Date.now(),
      session_name: this.projectName,
      error: null,
    });
  }

  async failRun(run: TraceRun, error: Error): Promise<void> {
    await this.postRun({
      id: run.id,
      name: run.name,
      run_type: 'llm',
      inputs: run.inputs,
      outputs: {},
      start_time: run.startedAt.getTime(),
      end_time: Date.now(),
      session_name: this.projectName,
      error: error.message,
    });
  }

  async traced<T>(
    name: string,
    inputs: Record<string, unknown>,
    fn: () => Promise<T>
  ): Promise<T> {
    const run = this.startRun(name, inputs);
    try {
      const result = await fn();
      await this.endRun(run, { result: typeof result === 'string' ? result : JSON.stringify(result) });
      return result;
    } catch (err) {
      await this.failRun(run, err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async postRun(payload: Record<string, unknown>): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/runs`, {
        method: 'POST',
        headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      // Non-fatal: tracing failures must never break the actual code generation
    }
  }

  private authHeaders(): Record<string, string> {
    return { 'x-api-key': this.apiKey };
  }

  private newRunId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
