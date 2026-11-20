import { MainPanel } from '../../../panel/MainPanel';
import { HUX_JS } from '../../../panel/HubUx';

describe('MainPanel changes webview', () => {
  it('generates a syntactically valid script with live file diff handling', () => {
    const panel = Object.create(MainPanel.prototype) as any;
    const script = panel._htmlScript();
    const body = panel._htmlBody();

    expect(() => new Function(script)).not.toThrow();
    expect(script).toContain("case 'agent-file-change'");
    expect(script).toContain('function appendFileChange');
    expect(body).toContain('data-tab="changes"');
    expect(body).toContain('<div class="panel" id="panel-changes">');
    expect(body).not.toContain('<div class="panel active" id="panel-changes">');
  });

  it('counts only valid task-owned diffs and ignores orphan records', () => {
    const panel = Object.create(MainPanel.prototype) as any;
    panel._memory = { search: () => [
      { value: JSON.stringify({ taskId: 'SPEC-001' }) },
      { value: JSON.stringify({ taskId: 'SPEC-002' }) },
      { value: JSON.stringify({}) },
      { value: '{broken json' },
    ] };
    expect(panel._pendingDiffCountForTask('SPEC-001')).toBe(1);
    expect(panel._pendingDiffCountForTask('SPEC-002')).toBe(1);
  });

  it('persists and clears task DoD blockers in local memory', async () => {
    const panel = Object.create(MainPanel.prototype) as any;
    panel._memory = {
      set: jest.fn(), delete: jest.fn(), save: jest.fn().mockResolvedValue(undefined),
    };
    await panel._storeGateBlockers('SPEC-004', ['tests failed']);
    expect(panel._memory.set).toHaveBeenCalledWith('config', 'dod-blockers:SPEC-004', '["tests failed"]', expect.any(Object));
    await panel._storeGateBlockers('SPEC-004', []);
    expect(panel._memory.delete).toHaveBeenCalledWith('config', 'dod-blockers:SPEC-004');
    expect(panel._memory.save).toHaveBeenCalledTimes(2);
  });

  it('renders actionable DoD blockers and traceability controls', () => {
    const panel = Object.create(MainPanel.prototype) as any;
    const script = panel._htmlScript();
    expect(script).toContain('data-resolve-task');
    expect(script).toContain('data-open-adr');
    expect(script).toContain('qualityEvidence.freshness');
  });

  it('offers accessible explicit lane changes in addition to drag and drop', () => {
    const panel = Object.create(MainPanel.prototype) as any;
    const script = panel._htmlScript();
    expect(script).toContain('data-task-status');
    expect(script).toContain("['backlog','todo','in-progress','done'].includes(status)");
    expect(script).toContain("type:'update-task-status', taskId, status");
    expect(script).toContain('aria-label="Move ');
    expect(script).toContain('<option value="todo">Todo</option>');
    expect(script).toContain('<option value="done">Done</option>');
    expect(() => new Function(script)).not.toThrow();
  });

  it('offers visible apply and discard actions for pending changes', () => {
    const panel = Object.create(MainPanel.prototype) as any;
    const body = panel._htmlBody();
    expect(body).toContain('id="huxApplyChip"');
    expect(body).toContain('id="huxDiscardChip"');
    expect(body).toContain('Revisar y aplicar');
    expect(body).toContain('Descartar cambios');
    expect(HUX_JS).toContain("if (act === 'discard') { runHarnessCommand('no'); return; }");
  });

  it('exposes the on-device Qwen provider in settings', () => {
    const panel = Object.create(MainPanel.prototype) as any;
    const body = panel._htmlBody();
    const script = panel._htmlScript();
    expect(body).toContain('data-p="local-wasm"');
    expect(body).toContain('id="s-preferred-provider"');
    expect(body).toContain('Qwen 2.5 Coder · 1.5B');
    expect(script).toContain("const PROVIDERS=['local-wasm','anthropic','openai','ollama','lmstudio']");
    expect(() => new Function(script)).not.toThrow();
  });
});
