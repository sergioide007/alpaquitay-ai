import * as vscode from 'vscode';
import { buildEngineHtml, LocalEngineHost } from '../../../local/LocalEngineHost';
import { generateSigningKey } from '../../../local/cdnTooling';
import type { EngineToHost, HostToEngine } from '../../../local/protocol';
import { MemStore, bytesServer, makeManifest, settings } from './fixtures';

interface FakePanel {
  panel: unknown; sent: HostToEngine[]; emit(m: EngineToHost): void; dispose(): void; disposed: jest.Mock;
}

function installPanel(): FakePanel {
  let handler: (m: EngineToHost) => void = () => undefined;
  let onDispose: () => void = () => undefined;
  const sent: HostToEngine[] = [];
  const disposed = jest.fn();
  const panel = {
    webview: {
      html: '', cspSource: 'vscode-webview-resource:',
      asWebviewUri: (u: { toString(): string }) => ({ toString: () => `webview:${u.toString()}` }),
      onDidReceiveMessage: (h: (m: EngineToHost) => void) => { handler = h; return { dispose: jest.fn() }; },
      postMessage: jest.fn(async (m: HostToEngine) => { sent.push(m); return true; }),
    },
    onDidDispose: (cb: () => void) => { onDispose = cb; },
    dispose: () => { disposed(); onDispose(); },
  };
  (vscode.window.createWebviewPanel as jest.Mock).mockReturnValueOnce(panel);
  return { panel, sent, emit: (m) => handler(m), dispose: () => panel.dispose(), disposed };
}

const flush = () => new Promise(r => setImmediate(r));
const extUri = { fsPath: '/ext', toString: () => 'file:///ext' } as unknown as vscode.Uri;
const S = settings();

function makeHost(over: { manifest?: object; trusted?: boolean } = {}) {
  const srv = bytesServer(over.manifest ?? makeManifest());
  const host = new LocalEngineHost(extUri, new MemStore(), srv.fetchBytes, over.trusted === false ? [generateSigningKey().publicB64] : [srv.key.publicB64]);
  return { host, srv };
}

describe('buildEngineHtml (Content-Security-Policy)', () => {
  const html = buildEngineHtml({ cspSource: 'vscode-webview-resource:', scriptUri: 'webview:engine.js', cdnBase: 'https://alpaquitay.specsolid.com/', nonce: 'abc123' });
  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)![1];

  it('locks everything down by default', () => expect(csp).toContain("default-src 'none'"));
  it('only lets the engine talk to the CDN origin', () => {
    expect(csp).toContain('connect-src https://alpaquitay.specsolid.com blob: data:');
    expect(csp).not.toMatch(/connect-src[^;]*\*/);
    expect(csp).not.toContain('huggingface');
    expect(csp).not.toContain('jsdelivr');
  });
  it('allows Wasm compilation without unsafe-eval or unsafe-inline', () => {
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain("'unsafe-inline'");
  });
  it('NO remote script origin: scripts come only from the extension bundle and hash-verified blob: URLs', () => {
    const scriptSrc = /script-src ([^;]+)/.exec(csp)![1];
    expect(scriptSrc).toBe("vscode-webview-resource: blob: 'wasm-unsafe-eval'");
    expect(scriptSrc).not.toContain('https:');
  });
  it('uses a nonce for the only <style> and loads the bundle by URI', () => {
    expect(csp).toContain("style-src 'nonce-abc123'");
    expect(html).toContain('<style nonce="abc123">');
    expect(html).toContain('<script src="webview:engine.js"></script>');
  });
  it('refuses a plain-http CDN and an IP-literal CDN', () => {
    expect(() => buildEngineHtml({ cspSource: 'x', scriptUri: 'y', cdnBase: 'http://evil.example.com', nonce: 'n' })).toThrow(/https/);
    expect(() => buildEngineHtml({ cspSource: 'x', scriptUri: 'y', cdnBase: 'https://203.0.113.5', nonce: 'n' })).toThrow(/dominio/);
  });
});

describe('LocalEngineHost', () => {
  beforeEach(() => (vscode.window.createWebviewPanel as jest.Mock).mockClear());

  it('verifies the manifest first, then round-trips generate with the VERIFIED manifest attached', async () => {
    const fake = installPanel();
    const { host, srv } = makeHost();
    const progress: Array<[string, number]> = [];
    const p = host.generate(S, { messages: [{ role: 'user', content: 'hola' }], maxNewTokens: 9999, temperature: 0.2 }, (s, n) => progress.push([s, n]));
    await flush();
    expect(srv.calls).toHaveLength(2);                                   // manifest.json + manifest.sig.json
    expect((vscode.window.createWebviewPanel as jest.Mock).mock.calls[0][0]).toBe('alpaquitayLocalEngine');
    expect((fake.panel as { webview: { html: string } }).webview.html).toContain('dist/engine-webview.js');

    fake.emit({ type: 'ready' });
    await flush();
    const req = fake.sent[0] as Extract<HostToEngine, { type: 'generate' }>;
    expect(req).toMatchObject({ type: 'generate', modelId: 'gemma-4-e2b-it', cdnBase: 'https://alpaquitay.specsolid.com', device: 'auto', dtype: 'auto', temperature: 0.2 });
    expect(req.manifest.revision).toBe('rev1');
    expect(req.manifest.files.length).toBe(2);
    expect(req.maxNewTokens).toBe(512);                                  // capped by localEngine.maxNewTokens

    fake.emit({ type: 'progress', id: req.id, stage: 'Descargando model_q4.onnx', pct: 40 });
    fake.emit({ type: 'done', id: req.id, text: 'listo', device: 'webgpu', newTokens: 3 });
    expect(await p).toEqual({ text: 'listo', device: 'webgpu', newTokens: 3 });
    expect(progress).toEqual([['Descargando model_q4.onnx', 40]]);
  });

  it('probe returns the manifest summary for the consent dialog and reuses the panel afterwards', async () => {
    const fake = installPanel();
    const { host, srv } = makeHost();
    const a = host.probe(S);
    await flush(); fake.emit({ type: 'ready' }); await flush();
    fake.emit({ type: 'probe-result', id: (fake.sent[0] as { id: string }).id, webgpu: true, shaderF16: false, cached: false });
    const r = await a;
    expect(r).toMatchObject({ webgpu: true, shaderF16: false, cached: false });
    expect(r.manifest).toMatchObject({ label: 'Gemma 4 E2B (test)', license: 'apache-2.0', source: 'network' });

    const b = host.clearCache(S); await flush();
    fake.emit({ type: 'cache-cleared', id: (fake.sent[1] as { id: string }).id, files: 3, bytes: 99 });
    expect(await b).toEqual({ files: 3, bytes: 99 });
    expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(srv.calls).toHaveLength(2);                                   // manifest cached for 5 minutes: no refetch
  });

  it('REFUSES an untrusted manifest and never opens the Webview', async () => {
    const { host } = makeHost({ trusted: false });
    await expect(host.generate(S, { messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow(/no confiable/);
    expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
  });

  it('rejects an oversized prompt before touching the network or the Webview', async () => {
    const { host, srv } = makeHost();
    await expect(host.generate(S, { messages: [{ role: 'user', content: 'a'.repeat(20_000) }] })).rejects.toThrow(/demasiado largo/);
    expect(srv.calls).toHaveLength(0);
    expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
  });

  it('turns an engine error into a rejection', async () => {
    const fake = installPanel();
    const { host } = makeHost();
    const p = host.generate(S, { messages: [{ role: 'user', content: 'x' }] });
    await flush(); fake.emit({ type: 'ready' }); await flush();
    fake.emit({ type: 'error', id: (fake.sent[0] as { id: string }).id, message: 'WebGPU no disponible' });
    await expect(p).rejects.toThrow('WebGPU no disponible');
  });

  it('cancelling rejects, tells the engine to stop and ignores the late answer', async () => {
    const fake = installPanel();
    const { host } = makeHost();
    let cancel: () => void = () => undefined;
    const token = { isCancellationRequested: false, onCancellationRequested: (cb: () => void) => { cancel = cb; return { dispose: jest.fn() }; } } as unknown as vscode.CancellationToken;
    const p = host.generate(S, { messages: [{ role: 'user', content: 'x' }] }, undefined, token);
    await flush(); fake.emit({ type: 'ready' }); await flush();
    const id = (fake.sent[0] as { id: string }).id;
    cancel();
    await expect(p).rejects.toThrow(/Cancelado/);
    expect(fake.sent.at(-1)).toEqual({ type: 'cancel', id });
    expect(() => fake.emit({ type: 'done', id, text: 'tarde', device: 'wasm', newTokens: 1 })).not.toThrow();
  });

  it('rejects in-flight work when the panel is closed', async () => {
    const fake = installPanel();
    const { host } = makeHost();
    const p = host.generate(S, { messages: [{ role: 'user', content: 'x' }] });
    await flush(); fake.emit({ type: 'ready' }); await flush();
    fake.dispose();
    await expect(p).rejects.toThrow(/se cerro/);
  });

  it('validates settings before touching the network or the Webview', async () => {
    const { host, srv } = makeHost();
    await expect(host.generate({ ...S, cdnBase: 'http://evil.example.com' }, { messages: [] })).rejects.toThrow(/https/);
    await expect(host.generate({ ...S, cdnBase: 'https://203.0.113.5' }, { messages: [] })).rejects.toThrow(/dominio/);
    await expect(host.generate({ ...S, modelId: '../x' }, { messages: [] })).rejects.toThrow(/modelId/);
    expect(srv.calls).toHaveLength(0);
    expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled();
  });
});
