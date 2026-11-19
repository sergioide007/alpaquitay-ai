import { AgentThoughtStream, thoughtStream } from '../../../core/harness/AgentThoughtStream';

// Clear the singleton before each test
beforeAll(() => {
  // The singleton is exported for test reset
  AgentThoughtStream.reset();
});

describe('AgentThoughtStream', () => {
  let stream: AgentThoughtStream;

  beforeEach(() => {
    stream = AgentThoughtStream.getInstance();
    stream.removeAllListeners();
  });

  afterEach(() => {
    // Clear the singleton so each test starts clean
    AgentThoughtStream.reset();
  });

  it('publishes progress events and delivers them to subscribers', () => {
    const handler = jest.fn();
    const unsubscribe = stream.subscribe(handler);

    stream.progress('session-1', 'receive', 'Objective received');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      type: 'progress',
      sessionId: 'session-1',
      step: 'receive',
      message: 'Objective received',
    });

    unsubscribe();
  });

  it('publishes step-start and step-done events', () => {
    const handler = jest.fn();
    const unsubscribe = stream.subscribe(handler);

    stream.stepStart('session-1', 'sanitize-objective');
    stream.stepDone('session-1', 'sanitize-objective', true);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(1, {
      type: 'step-start',
      sessionId: 'session-1',
      step: 'sanitize-objective',
    });
    expect(handler).toHaveBeenNthCalledWith(2, {
      type: 'step-done',
      sessionId: 'session-1',
      step: 'sanitize-objective',
      success: true,
    });

    unsubscribe();
  });

  it('publishes the exact file diff and review state', () => {
    const handler = jest.fn();
    const unsubscribe = stream.subscribe(handler);

    stream.fileChange('task-1', 'src/example.ts', 'proposed', 'diff --git a/src/example.ts b/src/example.ts', 3, 1);

    expect(handler).toHaveBeenCalledWith({
      type: 'file-change',
      sessionId: 'task-1',
      path: 'src/example.ts',
      status: 'proposed',
      diff: 'diff --git a/src/example.ts b/src/example.ts',
      added: 3,
      removed: 1,
    });
    unsubscribe();
  });

  it('reset clears listeners without replacing the exported singleton', () => {
    const handler = jest.fn();
    stream.subscribe(handler);

    AgentThoughtStream.reset();
    thoughtStream.progress('session-1', 'test', 'still the same singleton');

    expect(AgentThoughtStream.getInstance()).toBe(thoughtStream);
    expect(handler).not.toHaveBeenCalled();
  });

  it('emits wildcard * events too when published', () => {
    const progressHandler = jest.fn();
    const startHandler = jest.fn();
    const doneHandler = jest.fn();

    stream.subscribe(progressHandler);
    stream.subscribe(startHandler);
    stream.subscribe(doneHandler);

    stream.progress('session-1', 'test', 'hello');
    stream.stepStart('session-1', 'test-step');
    stream.stepDone('session-1', 'test-step', false);

    expect(progressHandler).toHaveBeenCalled();
    expect(startHandler).toHaveBeenCalled();
    expect(doneHandler).toHaveBeenCalled();
  });

  it('on() subscribes to a single event type', () => {
    const handler = jest.fn();
    const unsubscribe = stream.on('progress', handler);

    stream.progress('session-1', 'test', 'hello');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      type: 'progress',
      sessionId: 'session-1',
      step: 'test',
      message: 'hello',
    });

    unsubscribe();
  });

  it('subscribe returns an unsubscribe function that stops delivery', () => {
    const handler = jest.fn();
    const unsubscribe = stream.subscribe(handler);

    stream.progress('session-1', 'test', 'hello');
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    stream.progress('session-1', 'test2', 'world');

    expect(handler).toHaveBeenCalledTimes(1); // no more calls after unsubscribe
  });
});
