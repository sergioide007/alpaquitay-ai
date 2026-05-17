import { VortexPipeline, VORTEX_EVENTS } from '../../../integrations/streaming/VortexPipeline';
import { SecretVault } from '../../../secrets/SecretVault';

function mockVault(): SecretVault {
  return { get: jest.fn().mockResolvedValue(undefined), set: jest.fn(), delete: jest.fn(), has: jest.fn().mockResolvedValue(true), getAll: jest.fn().mockResolvedValue({}), child: jest.fn() } as never;
}

async function activePipeline(): Promise<VortexPipeline> {
  const pipeline = new VortexPipeline();
  await pipeline.initialize(mockVault());
  return pipeline;
}

describe('VortexPipeline', () => {
  it('subscribe/publish: handler receives event', async () => {
    const pipeline = await activePipeline();
    const handler = jest.fn();
    pipeline.subscribe(VORTEX_EVENTS.CODE_GEN_FILE_READY, handler);
    pipeline.publish({ type: VORTEX_EVENTS.CODE_GEN_FILE_READY, payload: { filePath: 'Foo.java' } });
    await Promise.resolve();
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      type: VORTEX_EVENTS.CODE_GEN_FILE_READY,
      payload: { filePath: 'Foo.java' },
    }));
  });

  it('unsubscribe removes handler', async () => {
    const pipeline = await activePipeline();
    const handler = jest.fn();
    const unsub = pipeline.subscribe(VORTEX_EVENTS.ERROR, handler);
    unsub();
    pipeline.publish({ type: VORTEX_EVENTS.ERROR, payload: { message: 'oops' } });
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();
  });

  it('subscribeAll receives every event type', async () => {
    const pipeline = await activePipeline();
    const received: string[] = [];
    pipeline.subscribeAll(e => { received.push(e.type); });
    pipeline.publish({ type: VORTEX_EVENTS.SCAFFOLD_STARTED, payload: {} });
    pipeline.publish({ type: VORTEX_EVENTS.CODE_GEN_DONE, payload: {} });
    await Promise.resolve();
    expect(received).toContain(VORTEX_EVENTS.SCAFFOLD_STARTED);
    expect(received).toContain(VORTEX_EVENTS.CODE_GEN_DONE);
  });

  it('once() resolves on the next matching event', async () => {
    const pipeline = await activePipeline();
    const promise = pipeline.once(VORTEX_EVENTS.BUILD_VALIDATED);
    pipeline.publish({ type: VORTEX_EVENTS.BUILD_VALIDATED, payload: { success: true } });
    const event = await promise;
    expect(event.payload).toEqual({ success: true });
  });

  it('events have a timestamp', async () => {
    const pipeline = await activePipeline();
    const handler = jest.fn();
    pipeline.subscribe(VORTEX_EVENTS.SCAFFOLD_DONE, handler);
    pipeline.publish({ type: VORTEX_EVENTS.SCAFFOLD_DONE, payload: {} });
    await Promise.resolve();
    const event = handler.mock.calls[0][0];
    expect(event.timestamp).toBeInstanceOf(Date);
  });

  it('emitFileReady emits the correct scaffold event type', async () => {
    const pipeline = await activePipeline();
    const handler = jest.fn();
    pipeline.subscribe(VORTEX_EVENTS.SCAFFOLD_FILE_READY, handler);
    pipeline.emitFileReady('App.java', 'scaffold');
    await Promise.resolve();
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      type: VORTEX_EVENTS.SCAFFOLD_FILE_READY,
    }));
  });

  it('newCorrelationId generates unique IDs', async () => {
    const pipeline = await activePipeline();
    const id1 = pipeline.newCorrelationId('test');
    const id2 = pipeline.newCorrelationId('test');
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^test-/);
  });

  it('dispose removes all listeners', async () => {
    const pipeline = await activePipeline();
    const handler = jest.fn();
    pipeline.subscribe(VORTEX_EVENTS.ERROR, handler);
    await pipeline.dispose();
    pipeline.publish({ type: VORTEX_EVENTS.ERROR, payload: {} });
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();
  });
});
