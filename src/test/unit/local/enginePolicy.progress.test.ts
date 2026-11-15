import { deviceLabel, TokenMeter } from '../../../local/enginePolicy';

describe('deviceLabel', () => {
  it('names where inference runs, including the single-thread case of a Webview', () => {
    expect(deviceLabel('webgpu', false)).toBe('GPU');
    expect(deviceLabel('wasm', false)).toBe('CPU, 1 hilo');
    expect(deviceLabel('wasm', true)).toBe('CPU');
  });
});

describe('TokenMeter', () => {
  it('reports the first token immediately, then at most once per interval', () => {
    const m = new TokenMeter(100, 1000);
    expect(m.tick(0)).toMatchObject({ tokens: 1 });
    expect(m.tick(400)).toBeUndefined();
    expect(m.tick(900)).toBeUndefined();
    const r = m.tick(1000);
    expect(r).toMatchObject({ tokens: 4, rate: '3.0' });           // 3 tokens after the first, in 1 s
    expect(m.tokens).toBe(4);
  });

  it('keeps progress inside the 97..99 band reserved for generation', () => {
    const m = new TokenMeter(10, 0);
    const pcts = Array.from({ length: 30 }, (_, i) => m.tick(i * 10)!.pct);
    expect(Math.min(...pcts)).toBeGreaterThanOrEqual(97);
    expect(Math.max(...pcts)).toBeLessThanOrEqual(99);
    expect(pcts[9]).toBe(99);                                      // max tokens reached
  });
});
