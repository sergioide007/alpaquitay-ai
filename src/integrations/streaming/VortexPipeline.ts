import { EventEmitter } from 'events';
import { BaseIntegration } from '../BaseIntegration';
import { IStreamingIntegration, IntegrationMetadata, PipelineEvent, EventHandler, Unsubscribe } from '../interfaces';

// ── Typed event catalog ───────────────────────────────────────────────────────
// Well-known event types emitted by the Alpaquitay pipeline.
// Consumer code can subscribe to any of these or to the wildcard '*'.

export const VORTEX_EVENTS = {
  SCAFFOLD_STARTED:     'scaffold:started',
  SCAFFOLD_FILE_READY:  'scaffold:file-ready',
  SCAFFOLD_DONE:        'scaffold:done',
  FEATURE_PLAN_READY:   'feature:plan-ready',
  CODE_GEN_STARTED:     'codegen:started',
  CODE_GEN_FILE_READY:  'codegen:file-ready',
  CODE_GEN_DONE:        'codegen:done',
  TEST_GEN_STARTED:     'testgen:started',
  TEST_GEN_FILE_READY:  'testgen:file-ready',
  TEST_GEN_DONE:        'testgen:done',
  DEP_CHECK_STARTED:    'deps:check-started',
  DEP_CHECK_DONE:       'deps:check-done',
  BUILD_VALIDATED:      'build:validated',
  BUILD_FAILED:         'build:failed',
  ERROR:                'pipeline:error',
} as const;

export type VortexEventType = typeof VORTEX_EVENTS[keyof typeof VORTEX_EVENTS];

// ── Async queue for backpressure ──────────────────────────────────────────────

class AsyncQueue<T> {
  private items: T[] = [];
  private waiters: ((item: T) => void)[] = [];

  enqueue(item: T): void {
    if (this.waiters.length > 0) {
      this.waiters.shift()!(item);
    } else {
      this.items.push(item);
    }
  }

  dequeue(): Promise<T> {
    if (this.items.length > 0) {
      return Promise.resolve(this.items.shift()!);
    }
    return new Promise<T>(resolve => this.waiters.push(resolve));
  }

  get size(): number { return this.items.length; }
}

// ── VortexPipeline ────────────────────────────────────────────────────────────

export class VortexPipeline extends BaseIntegration implements IStreamingIntegration {
  readonly metadata: IntegrationMetadata = {
    id: 'vortex',
    name: 'Vortex Event Pipeline',
    category: 'streaming',
    description: 'Event-driven streaming pipeline for all code-generation lifecycle events',
    requiredSecrets: [],
  };

  private readonly emitter = new EventEmitter();
  private readonly eventQueue = new AsyncQueue<PipelineEvent>();
  private readonly correlationCounters = new Map<string, number>();

  constructor() {
    super();
    this.emitter.setMaxListeners(50);
  }

  protected async onInitialize(): Promise<void> { /* no external connection */ }

  // ── IStreamingIntegration ─────────────────────────────────────────────────

  publish(event: Omit<PipelineEvent, 'timestamp'>): void {
    const full: PipelineEvent = { ...event, timestamp: new Date() };
    this.eventQueue.enqueue(full);
    this.emitter.emit(full.type, full);
    this.emitter.emit('*', full);
  }

  subscribe(eventType: string, handler: EventHandler): Unsubscribe {
    const wrapped = (event: PipelineEvent) => { void Promise.resolve(handler(event)); };
    this.emitter.on(eventType, wrapped);
    return () => this.emitter.off(eventType, wrapped);
  }

  subscribeAll(handler: EventHandler): Unsubscribe {
    return this.subscribe('*', handler);
  }

  once(eventType: string): Promise<PipelineEvent> {
    return new Promise(resolve => {
      this.emitter.once(eventType, resolve);
    });
  }

  // ── Convenience emitters (typed shortcuts for callers) ────────────────────

  emitScaffoldStarted(projectName: string, style: string, correlationId?: string): void {
    this.publish({ type: VORTEX_EVENTS.SCAFFOLD_STARTED, payload: { projectName, style }, correlationId });
  }

  emitFileReady(filePath: string, stage: 'scaffold' | 'codegen' | 'testgen', correlationId?: string): void {
    const type = stage === 'scaffold' ? VORTEX_EVENTS.SCAFFOLD_FILE_READY
      : stage === 'codegen' ? VORTEX_EVENTS.CODE_GEN_FILE_READY
      : VORTEX_EVENTS.TEST_GEN_FILE_READY;
    this.publish({ type, payload: { filePath }, correlationId });
  }

  emitError(message: string, context?: Record<string, unknown>): void {
    this.publish({ type: VORTEX_EVENTS.ERROR, payload: { message, ...context } });
  }

  /** Drain the internal event queue — useful for tests or ordered processing */
  async drainQueue(): Promise<PipelineEvent[]> {
    const drained: PipelineEvent[] = [];
    while (this.eventQueue.size > 0) {
      drained.push(await this.eventQueue.dequeue());
    }
    return drained;
  }

  /** Generate a new correlation ID for tracking a multi-step operation */
  newCorrelationId(prefix = 'op'): string {
    const count = (this.correlationCounters.get(prefix) ?? 0) + 1;
    this.correlationCounters.set(prefix, count);
    return `${prefix}-${count}-${Date.now().toString(36)}`;
  }

  protected override async onDispose(): Promise<void> {
    this.emitter.removeAllListeners();
  }
}
