import { chooseDevice, foldSystemMessages, ProgressAggregator, runtimeFiles } from '../../../local/enginePolicy';

describe('enginePolicy', () => {
  describe('chooseDevice', () => {
    it('auto prefers WebGPU only with a real adapter', () => {
      expect(chooseDevice('auto', true)).toBe('webgpu');
      expect(chooseDevice('auto', false)).toBe('wasm');
    });
    it('wasm is always honoured', () => expect(chooseDevice('wasm', true)).toBe('wasm'));
    it('explicit webgpu fails loudly without a GPU', () => {
      expect(chooseDevice('webgpu', true)).toBe('webgpu');
      expect(() => chooseDevice('webgpu', false)).toThrow(/WebGPU/);
    });
  });

  describe('runtimeFiles', () => {
    it('uses the JSEP build for WebGPU and the base build for Wasm, under the ORT version folder', () => {
      expect(runtimeFiles('https://c.example', '1.2.3', 'webgpu')).toEqual({
        mjs: 'https://c.example/models/runtime/1.2.3/ort-wasm-simd-threaded.asyncify.mjs',
        wasm: 'https://c.example/models/runtime/1.2.3/ort-wasm-simd-threaded.asyncify.wasm',
      });
      expect(runtimeFiles('https://c.example', '1.2.3', 'wasm').wasm)
        .toBe('https://c.example/models/runtime/1.2.3/ort-wasm-simd-threaded.wasm');
    });
  });

  describe('foldSystemMessages (Gemma templates reject the system role)', () => {
    it('merges system into the first user turn', () => {
      expect(foldSystemMessages([
        { role: 'system', content: 'Be brief.' },
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello' },
        { role: 'user', content: 'Again' },
      ])).toEqual([
        { role: 'user', content: 'Be brief.\n\nHi' },
        { role: 'assistant', content: 'Hello' },
        { role: 'user', content: 'Again' },
      ]);
    });
    it('passes through when there is no system message', () => {
      const m = [{ role: 'user' as const, content: 'x' }];
      expect(foldSystemMessages(m)).toEqual(m);
    });
    it('creates a user turn when only a system message exists', () => {
      expect(foldSystemMessages([{ role: 'system', content: 'S' }])).toEqual([{ role: 'user', content: 'S' }]);
    });
  });

  it('ProgressAggregator combines files into one percentage', () => {
    const a = new ProgressAggregator();
    expect(a.update('a.onnx', 50, 100)).toBe(50);
    expect(a.update('b.json', 0, 100)).toBe(25);
    expect(a.update('b.json', 100, 100)).toBe(75);
    expect(a.update('a.onnx', 100, 100)).toBe(100);
    expect(new ProgressAggregator().percent()).toBe(0);
  });
});
