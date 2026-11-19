/**
 * AgentThoughtStream — Live "thoughts & progress" bus for agents (Cline-style).
 *
 * A singleton EventEmitter that lets any agent (CentralBrain, Orchestrator,
 * Domain Shells, Skills) publish structured thought / step events in real time.
 * The UI panel (MainPanel) subscribes and forwards them to the webview so the
 * user can see what the agent is doing, step by step, as it happens.
 *
 * Privacy: thoughts never leave the VS Code extension host. They are only
 * forwarded to the local webview panel — never to any external server.
 */
import { EventEmitter } from 'events';

export type AgentThoughtEvent =
  | { type: 'thought'; sessionId: string; step: string; thought: string }
  | { type: 'step-start'; sessionId: string; step: string; domainId?: string; useCaseId?: string }
  | { type: 'step-done'; sessionId: string; step: string; success: boolean };

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
    AgentThoughtStream.instance = undefined as unknown as AgentThoughtStream;
  }

  /** Publish a raw thought (free-form reasoning the agent is doing right now). */
  thought(sessionId: string, step: string, thought: string): void {
    this.emitter.emit('thought', { type: 'thought', sessionId, step, thought });
  }

  /** Publish that a step has started. */
  stepStart(sessionId: string, step: string, domainId?: string, useCaseId?: string): void {
    this.emitter.emit('step-start', { type: 'step-start', sessionId, step, domainId, useCaseId });
  }

  /** Publish that a step has finished. */
  stepDone(sessionId: string, step: string, success: boolean): void {
    this.emitter.emit('step-done', { type: 'step-done', sessionId, step, success });
  }

  /** Subscribe to thought/step events. Returns an unsubscribe function. */
  subscribe(handler: AgentThoughtHandler): () => void {
    const wrapped = (event: AgentThoughtEvent) => { void Promise.resolve(handler(event)); };
    this.emitter.on('thought', wrapped as any);
    this.emitter.on('step-start', wrapped as any);
    this.emitter.on('step-done', wrapped as any);
    return () => {
      this.emitter.off('thought', wrapped as any);
      this.emitter.off('step-start', wrapped as any);
      this.emitter.off('step-done', wrapped as any);
    };
  }

  /** Subscribe to a single event type. */
  on(type: 'thought' | 'step-start' | 'step-done', handler: AgentThoughtHandler): () => void {
    const wrapped = (event: AgentThoughtEvent) => { void Promise.resolve(handler(event)); };
    this.emitter.on(type, wrapped as any);
    return () => this.emitter.off(type, wrapped as any);
  }

  /** Remove all listeners (useful for tests / dispose). */
  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }
}

export const thoughtStream = AgentThoughtStream.getInstance();