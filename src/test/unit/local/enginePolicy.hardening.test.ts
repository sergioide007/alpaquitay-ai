import {
  MAX_PROMPT_CHARS, SerialQueue, assertPromptSize, checkStorageBudget, friendlyStorageError, pickDtype, stripThinking,
} from '../../../local/enginePolicy';

describe('pickDtype', () => {
  it('auto: q4f16 only with WebGPU + shader-f16', () => {
    expect(pickDtype(['q4f16', 'q4'], 'webgpu', true, 'auto')).toBe('q4f16');
    expect(pickDtype(['q4f16', 'q4'], 'webgpu', false, 'auto')).toBe('q4');
    expect(pickDtype(['q4f16', 'q4'], 'wasm', true, 'auto')).toBe('q4');
  });
  it('auto never picks an f16 type without f16 support, even if it is the only one', () => {
    expect(() => pickDtype(['q4f16'], 'wasm', false, 'auto')).toThrow(/shader-f16/);
    expect(() => pickDtype(['fp16'], 'webgpu', false, 'auto')).toThrow(/shader-f16/);
  });
  it('an explicit dtype must be published and runnable', () => {
    expect(pickDtype(['q4', 'q8'], 'wasm', false, 'q8')).toBe('q8');
    expect(() => pickDtype(['q4'], 'webgpu', true, 'q8')).toThrow(/no publica/);
    expect(() => pickDtype(['q4f16', 'q4'], 'wasm', false, 'q4f16')).toThrow(/shader-f16/);
  });
  it('falls back through the non-f16 preference list', () => {
    expect(pickDtype(['fp32', 'q8'], 'wasm', false, 'auto')).toBe('q8');
  });
});

describe('stripThinking', () => {
  it('removes a reasoning block and keeps the answer', () => {
    expect(stripThinking('<|channel>thought\nlet me think<channel|># Title\n- [ ] SPEC-001 x')).toBe('# Title\n- [ ] SPEC-001 x');
  });
  it('removes an empty block and leaves normal text alone', () => {
    expect(stripThinking('<|channel>thought\n<channel|>Hola')).toBe('Hola');
    expect(stripThinking('  texto  ')).toBe('texto');
  });
});

describe('assertPromptSize', () => {
  it('allows the limit and rejects beyond it with an actionable message', () => {
    expect(() => assertPromptSize([{ role: 'user', content: 'a'.repeat(MAX_PROMPT_CHARS) }])).not.toThrow();
    expect(() => assertPromptSize([{ role: 'system', content: 'a'.repeat(10) }, { role: 'user', content: 'a'.repeat(MAX_PROMPT_CHARS) }])).toThrow(/demasiado largo/);
  });
});

describe('storage preflight', () => {
  it('blocks a download that cannot fit, with sizes in the message', () => {
    expect(checkStorageBudget({ quota: 2 * 1024 ** 3, usage: 0.5 * 1024 ** 3 }, 3.1 * 1024 ** 3)).toMatch(/Espacio insuficiente.*3\.41 GB/);
  });
  it('allows it when there is room, and when the browser reports no quota', () => {
    expect(checkStorageBudget({ quota: 20 * 1024 ** 3, usage: 1 }, 3.1 * 1024 ** 3)).toBeUndefined();
    expect(checkStorageBudget({}, 3.1 * 1024 ** 3)).toBeUndefined();
  });
  it('maps QuotaExceededError to a friendly message and keeps other errors', () => {
    expect(friendlyStorageError(Object.assign(new Error('x'), { name: 'QuotaExceededError' })).message).toMatch(/espacio/);
    const other = new Error('boom');
    expect(friendlyStorageError(other)).toBe(other);
  });
});

describe('SerialQueue', () => {
  const tick = () => new Promise(r => setImmediate(r));

  it('never runs two tasks at once and keeps arrival order', async () => {
    const q = new SerialQueue(); const log: string[] = []; let running = 0, maxRunning = 0;
    const job = (name: string, ms: number) => q.run(name, async () => {
      running++; maxRunning = Math.max(maxRunning, running); log.push(`start ${name}`);
      await new Promise(r => setTimeout(r, ms)); log.push(`end ${name}`); running--;
    });
    await Promise.all([job('a', 20), job('b', 1), job('c', 1)]);
    expect(maxRunning).toBe(1);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });

  it('a failing task does not block the next one', async () => {
    const q = new SerialQueue();
    const bad = q.run('bad', async () => { throw new Error('x'); });
    const good = q.run('good', async () => 42);
    await expect(bad).rejects.toThrow('x');
    await expect(good).resolves.toBe(42);
  });

  it('cancelling a queued request drops only that one', async () => {
    const q = new SerialQueue(); let release!: () => void; const ran: string[] = [];
    const first = q.run('first', () => new Promise<void>(r => { release = r; ran.push('first'); }));
    const second = q.run('second', async () => { ran.push('second'); });
    const third = q.run('third', async () => { ran.push('third'); });
    await tick();
    expect(q.cancel('second')).toBe('queued');
    release();
    await first; await third;
    await expect(second).rejects.toThrow(/Cancelado/);
    expect(ran).toEqual(['first', 'third']);
  });

  it('cancel reports the running request so the caller can interrupt the model, and ignores unknown ids', async () => {
    const q = new SerialQueue(); let release!: () => void;
    const p = q.run('active', () => new Promise<void>(r => { release = r; }));
    await tick();
    expect(q.cancel('active')).toBe('active');
    expect(q.cancel('nope')).toBe('none');
    release(); await p;
    expect(q.cancel('active')).toBe('none');
  });
});
