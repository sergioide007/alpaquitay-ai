import { GemmaWasmEngine } from './GemmaWasmEngine';
import type { EngineToHost, HostToEngine } from '../src/local/protocol';

declare function acquireVsCodeApi(): { postMessage(m: EngineToHost): void };

const vscode = acquireVsCodeApi();
const status = document.getElementById('status');
const bar = document.getElementById('bar') as HTMLElement | null;

function paint(stage: string, pct: number): void {
  if (status) { status.textContent = stage; }
  if (bar) { bar.style.width = `${Math.max(0, Math.min(100, pct))}%`; }
}

async function handle(msg: HostToEngine): Promise<void> {
  const engine = GemmaWasmEngine.get();
  try {
    switch (msg.type) {
      case 'probe': {
        const [gpu, cached] = await Promise.all([GemmaWasmEngine.gpuInfo(), engine.isModelCached(msg)]);
        vscode.postMessage({ type: 'probe-result', id: msg.id, webgpu: gpu.webgpu, shaderF16: gpu.shaderF16, cached });
        return;
      }
      case 'generate': {
        const report = (stage: string, pct: number) => {
          paint(stage, pct);
          vscode.postMessage({ type: 'progress', id: msg.id, stage, pct });
        };
        const { text, newTokens } = await engine.generate(
          msg.id, msg, msg.messages, { maxNewTokens: msg.maxNewTokens, temperature: msg.temperature }, report);
        paint('Listo', 100);
        vscode.postMessage({ type: 'done', id: msg.id, text, device: engine.activeDevice, newTokens });
        return;
      }
      case 'cancel':
        engine.cancel(msg.id);
        return;
      case 'clear-cache': {
        const r = await engine.clearCache();
        paint('Cache vacia', 0);
        vscode.postMessage({ type: 'cache-cleared', id: msg.id, ...r });
        return;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    paint(`Error: ${message}`, 0);
    vscode.postMessage({ type: 'error', id: msg.id, message });
  }
}

window.addEventListener('message', (e: MessageEvent<HostToEngine>) => { void handle(e.data); });
vscode.postMessage({ type: 'ready' });
