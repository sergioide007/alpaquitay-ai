/**
 * AgentThoughtStream — local bus for operational progress and workspace diffs.
 *
 * A singleton EventEmitter that lets any agent (CentralBrain, Orchestrator,
 * Domain Shells, Skills) publish structured thought / step events in real time.
 * The UI panel (MainPanel) subscribes and forwards them to the webview so the
 * user can see what the agent is doing, step by step, as it happens.
 *
 * Privacy: progress and file diffs stay in the extension host and local webview.
 * This stream has no network transport.
 */
import { EventEmitter } from 'events';

export type AgentThoughtEvent =
  | { type: 'progress'; sessionId: string; step: string; message: string }
  | { type: 'step-start'; sessionId: string; step: string; domainId?: string; useCaseId?: string }
  | { type: 'step-done'; sessionId: string; step: string; success: boolean }
  | { type: 'file-change'; sessionId: string; path: string; status: 'proposed' | 'applied' | 'discarded'; diff: string; added: number; removed: number };

export type AgentThoughtHandler = (event: AgentThoughtEvent) => void | Promise<void>;

export class AgentThoughtStream {
  private static instance: AgentThoughtStream;
  private readonly emitter = new EventEmitter();

  private constructor() {
    this.emitter.setMaxListeners(100);
  }

  static getInstance(): AgentThoughtStream {
    if (!AgentThoughtStream.instance) {
      AgentThoughtStream.instance = new AgentThoughtStream();
    }
    return AgentThoughtStream.instance;
  }

  /** Reset the singleton (mainly for tests). */
  static reset(): void {
    AgentThoughtStream.instance?.removeAllListeners();
  }

  /** Publish a short operational progress message, never model reasoning. */
  progress(sessionId: string, step: string, message: string): void {
    this.emitter.emit('progress', { type: 'progress', sessionId, step, message });
  }

  /** Publish that a step has started. */
  stepStart(sessionId: string, step: string, domainId?: string, useCaseId?: string): void {
    this.emitter.emit('step-start', { type: 'step-start', sessionId, step, domainId, useCaseId });
  }

  /** Publish that a step has finished. */
  stepDone(sessionId: string, step: string, success: boolean): void {
    this.emitter.emit('step-done', { type: 'step-done', sessionId, step, success });
  }

  /** Publish the exact code diff and its current review/application state. */
  fileChange(sessionId: string, path: string, status: 'proposed' | 'applied' | 'discarded', diff: string, added: number, removed: number): void {
    this.emitter.emit('file-change', { type: 'file-change', sessionId, path, status, diff, added, removed });
  }

  /** Subscribe to progress and step events. Returns an unsubscribe function. */
  subscribe(handler: AgentThoughtHandler): () => void {
    const wrapped = this.safeHandler(handler);
    this.emitter.on('progress', wrapped as any);
    this.emitter.on('step-start', wrapped as any);
    this.emitter.on('step-done', wrapped as any);
    this.emitter.on('file-change', wrapped as any);
    return () => {
      this.emitter.off('progress', wrapped as any);
      this.emitter.off('step-start', wrapped as any);
      this.emitter.off('step-done', wrapped as any);
      this.emitter.off('file-change', wrapped as any);
    };
  }

  /** Subscribe to a single event type. */
  on(type: 'progress' | 'step-start' | 'step-done' | 'file-change', handler: AgentThoughtHandler): () => void {
    const wrapped = this.safeHandler(handler);
    this.emitter.on(type, wrapped as any);
    return () => this.emitter.off(type, wrapped as any);
  }

  private safeHandler(handler: AgentThoughtHandler): (event: AgentThoughtEvent) => void {
    return event => {
      try {
        const result = handler(event);
        if (result && typeof result.then === 'function') { void result.catch(() => undefined); }
      } catch { /* progress observers must never interrupt agent work */ }
    };
  }

  /** Remove all listeners (useful for tests / dispose). */
  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }
}

export const thoughtStream = AgentThoughtStream.getInstance();
