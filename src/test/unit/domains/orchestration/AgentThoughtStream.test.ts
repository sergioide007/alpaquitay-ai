import { AgentThoughtStream, thoughtStream } from '../../../../domains/orchestration/AgentThoughtStream';

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

  it('publishes thought events and delivers them to subscribers', () => {
    const handler = jest.fn();
    const unsubscribe = stream.subscribe(handler);

    stream.thought('session-1', 'receive', 'Received objective');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      type: 'thought',
      sessionId: 'session-1',
      step: 'receive',
      thought: 'Received objective',
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

  it('emits wildcard * events too when published', () => {
    const thoughtHandler = jest.fn();
    const startHandler = jest.fn();
    const doneHandler = jest.fn();

    stream.subscribe(thoughtHandler);
    stream.subscribe(startHandler);
    stream.subscribe(doneHandler);

    stream.thought('session-1', 'test', 'hello');
    stream.stepStart('session-1', 'test-step');
    stream.stepDone('session-1', 'test-step', false);

    expect(thoughtHandler).toHaveBeenCalled();
    expect(startHandler).toHaveBeenCalled();
    expect(doneHandler).toHaveBeenCalled();
  });

  it('on() subscribes to a single event type', () => {
    const handler = jest.fn();
    const unsubscribe = stream.on('thought', handler);

    stream.thought('session-1', 'test', 'hello');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({
      type: 'thought',
      sessionId: 'session-1',
      step: 'test',
      thought: 'hello',
    });

    unsubscribe();
  });

  it('subscribe returns an unsubscribe function that stops delivery', () => {
    const handler = jest.fn();
    const unsubscribe = stream.subscribe(handler);

    stream.thought('session-1', 'test', 'hello');
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    stream.thought('session-1', 'test2', 'world');

    expect(handler).toHaveBeenCalledTimes(1); // no more calls after unsubscribe
  });
});
