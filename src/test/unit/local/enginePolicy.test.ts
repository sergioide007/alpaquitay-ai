import { chooseDevice, CPU_MAX_MODEL_BYTES, foldSystemMessages, friendlyInferenceError, gpuRequired, noWebGpuReason, ProgressAggregator, runtimeFiles, WeightFilesTracker } from '../../../local/enginePolicy';

describe('enginePolicy', () => {
  describe('WeightFilesTracker ("loading the model" only after the last weight file)', () => {
    const paths = ['config.json', 'tokenizer.json', 'onnx/model_q4f16.onnx', 'onnx/model_q4f16.onnx_data', 'onnx/model_q4.onnx'];
    it('waits for the external data after the graph file', () => {
      const w = new WeightFilesTracker(paths, 'q4f16');
      expect(w.done('onnx/model_q4f16.onnx')).toBe(false);
      expect(w.done('onnx/model_q4f16.onnx_data')).toBe(true);
    });
    it('ignores files of other dtypes and accepts repo-prefixed names', () => {
      const w = new WeightFilesTracker(paths, 'q4');
      expect(w.done('qwen/onnx/model_q4.onnx')).toBe(true);
    });
    it('is satisfied immediately when the manifest lists no weights of that dtype', () => {
      expect(new WeightFilesTracker(paths, 'fp16').done('onnx/whatever.onnx')).toBe(true);
    });
  });

  describe('gpuRequired (fail fast instead of hours on single-thread Wasm)', () => {
    it('honours the manifest flag', () => {
      expect(gpuRequired({ requiresWebGpu: true, totalBytes: 1 })).toBe(true);
    });
    it('treats any model above the CPU ceiling as GPU-only', () => {
      expect(gpuRequired({ requiresWebGpu: false, totalBytes: CPU_MAX_MODEL_BYTES })).toBe(false);
      expect(gpuRequired({ requiresWebGpu: false, totalBytes: CPU_MAX_MODEL_BYTES + 1 })).toBe(true);
      expect(gpuRequired({ requiresWebGpu: false, totalBytes: 879_436_000 })).toBe(true);   // gemma-3-1b-it q4
    });
  });

  describe('friendlyInferenceError', () => {
    it('turns an ONNX Runtime GPU out-of-memory trace into advice, keeping the first line', () => {
      const raw = 'failed to call OrtRun(). ERROR_CODE: 1, ERROR_MESSAGE: /onnxruntime/core/providers/webgpu/buffer_manager.cc:643 void Download\nID3D12Device::CreateCommittedResource';
      const e = friendlyInferenceError(new Error(raw));
      expect(e.message).toMatch(/sin memoria.*texto mas corto/);
      expect(e.message).toContain('failed to call OrtRun()');
      expect(e.message).not.toContain('CreateCommittedResource');            // only the first line is kept
    });
    it('recognises the cleanup error ONNX Runtime surfaces after a WebGPU device error', () => {
      expect(friendlyInferenceError(new TypeError("Cannot read properties of undefined (reading 'destroy')")).message).toMatch(/sin memoria/);
    });
    it('leaves unrelated errors alone (no false positive on words like "room")', () => {
      const original = new Error('No room for this booking');
      expect(friendlyInferenceError(original)).toBe(original);
      expect(friendlyInferenceError('plain string').message).toBe('plain string');
    });
  });

  describe('noWebGpuReason', () => {
    it('detects the API missing altogether', () => {
      expect(noWebGpuReason({ hasApi: false, webglRenderer: null })).toMatch(/navigator\.gpu/);
    });
    it('detects VS Code running on software rendering and says to restart it', () => {
      for (const r of [null, 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)', 'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11)']) {
        expect(noWebGpuReason({ hasApi: true, webglRenderer: r })).toMatch(/renderizado por software.*Cierra TODAS las ventanas/);
      }
    });
    it('names the hardware GPU when it renders WebGL but grants no WebGPU adapter', () => {
      const r = noWebGpuReason({ hasApi: true, webglRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics (0x00009BC4) Direct3D11 vs_5_0 ps_5_0, D3D11)' });
      expect(r).toContain('Intel(R) UHD Graphics');
      expect(r).toMatch(/controlador/);
    });
  });

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
